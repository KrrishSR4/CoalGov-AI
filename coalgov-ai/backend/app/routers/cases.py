from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy import select, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from ..db import get_db
from ..models import Case, Evidence, AuditLog, SyncReceipt
from ..schemas import CaseCreate, CaseTransition, SyncBatch, InspectionUpdate, ProductionCreate, ProductionUpdate, GrievanceCreate, GrievanceTransition
from ..services.operations import create_production, update_production, create_grievance, transition_grievance
from ..services.inspections import update_inspection
from ..security import current_user, scoped
from ..services.common import checked, pack
from ..services.cases import create_case, transition, access_case
from ..services.audit import digest

router = APIRouter(prefix="/api", tags=["Cases and offline sync"])


def case_query(user):
    query = scoped(select(Case), Case, user)
    if user.role == "contractor":
        query = query.where(or_(Case.assigned_to == user.id, Case.created_by == user.id))
    return query


@router.get("/cases")
def list_cases(mine_id: str | None = None, status: str | None = None, q: str = "",
               limit: int = Query(250, ge=1, le=1000), offset: int = Query(0, ge=0),
               user=Depends(current_user), db=Depends(get_db)):
    query = case_query(user)
    if mine_id:
        query = query.where(Case.mine_id == mine_id)
    if status:
        query = query.where(Case.status == status)
    if q:
        query = query.where(Case.title.ilike("%" + q[:200] + "%"))
    return [pack(c) for c in db.scalars(query.order_by(Case.created_at.desc()).offset(offset).limit(limit))]


@router.post("/cases", status_code=201)
def add_case(data: CaseCreate, user=Depends(current_user), db=Depends(get_db)):
    case = create_case(db, user, data)
    db.commit()
    return pack(case)


@router.get("/cases/{case_id}")
def detail(case_id: str, user=Depends(current_user), db=Depends(get_db)):
    case = checked(db, Case, case_id)
    access_case(db, user, case)
    return {**pack(case), "evidence": [pack(e, {"storage_key", "extracted_text"}) for e in db.scalars(select(Evidence).where(Evidence.case_id == case.id))],
            "timeline": [pack(e) for e in db.scalars(select(AuditLog).where(AuditLog.entity_id == case.id).order_by(AuditLog.sequence))]}


@router.post("/cases/{case_id}/transition")
def change_case(case_id: str, data: CaseTransition, user=Depends(current_user), db=Depends(get_db)):
    case = transition(db, user, checked(db, Case, case_id), data)
    db.commit()
    return pack(case)


@router.post("/sync")
def synchronize(data: SyncBatch, user=Depends(current_user), db=Depends(get_db)):
    results = []
    for op in data.operations:
        signature = digest(op.model_dump())
        result = None
        try:
            with db.begin_nested():
                previous = db.scalar(select(SyncReceipt).where(SyncReceipt.user_id == user.id,
                    SyncReceipt.operation_id == op.operation_id))
                if previous:
                    if previous.payload_hash != signature:
                        raise HTTPException(409, "Operation ID was already used with different content")
                    result = {**previous.response, "replayed": True}
                else:
                    if op.kind == "create_case":
                        obj = create_case(db, user, CaseCreate(**op.payload))
                    elif op.kind == "update_inspection":
                        obj = update_inspection(db, user, op.entity_id, InspectionUpdate(**op.payload))
                    elif op.kind == "create_production":
                        obj = create_production(db, user, ProductionCreate(**op.payload))
                    elif op.kind == "update_production":
                        obj = update_production(db, user, op.entity_id, ProductionUpdate(**op.payload))
                    elif op.kind == "create_grievance":
                        obj = create_grievance(db, user, GrievanceCreate(**op.payload))
                    elif op.kind == "transition_grievance":
                        obj = transition_grievance(db, user, op.entity_id, GrievanceTransition(**op.payload))
                    else:
                        obj = transition(db, user, checked(db, Case, op.entity_id), CaseTransition(**op.payload))
                    result = {"operation_id": op.operation_id, "status": "synced", "entity": pack(obj)}
                    db.add(SyncReceipt(user_id=user.id, operation_id=op.operation_id, payload_hash=signature, response=result))
                    db.flush()
            db.commit()
        except (HTTPException, ValidationError, IntegrityError, StaleDataError) as error:
            db.rollback()
            # Another device retry can race the first transaction. Return its receipt
            # only if the exact operation body is identical.
            previous = db.scalar(select(SyncReceipt).where(SyncReceipt.user_id == user.id,
                SyncReceipt.operation_id == op.operation_id))
            if previous and previous.payload_hash == signature:
                result = {**previous.response, "replayed": True}
            else:
                code = error.status_code if isinstance(error, HTTPException) else 422 if isinstance(error, ValidationError) else 409
                detail = error.detail if isinstance(error, HTTPException) else str(error)[:500] if isinstance(error, ValidationError) else "Concurrent update. Fetch the latest record and review."
                result = {"operation_id": op.operation_id, "status": "conflict" if code == 409 else "error", "code": code, "detail": detail}
        results.append(result)
    return {"results": results}
