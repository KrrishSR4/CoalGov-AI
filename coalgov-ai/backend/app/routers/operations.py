from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal
import csv
import io
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from ..db import get_db
from ..models import ProductionReport, Grievance, GrievanceEvent, AuditLog, now
from ..schemas import ProductionCreate, ProductionUpdate, ProductionReview, GrievanceCreate, GrievanceTransition
from ..security import current_user, authorize, access_mine, scoped, GLOBAL_ROLES, MANAGERS
from ..services.common import checked, pack
from ..services.audit import audit, digest
from ..services import operations as workflow

router = APIRouter(prefix="/api", tags=["Production and grievances"])


def production_query(user, mine_id=None, date_from=None, date_to=None, status=None):
    authorize(user, workflow.PRODUCTION_READERS)
    query = scoped(select(ProductionReport), ProductionReport, user)
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "Start date must not be after end date")
    if mine_id:
        query = query.where(ProductionReport.mine_id == mine_id)
    if date_from:
        query = query.where(ProductionReport.work_date >= date_from.isoformat())
    if date_to:
        query = query.where(ProductionReport.work_date <= date_to.isoformat())
    if status:
        if status not in {"submitted", "returned", "approved"}:
            raise HTTPException(422, "Unknown production status")
        query = query.where(ProductionReport.status == status)
    return query


def csv_response(columns, rows, filename):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(columns)
    for row in rows:
        values = []
        for col in columns:
            value = str(row.get(col, "") if row.get(col) is not None else "")
            if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
                value = "'" + value
            values.append(value)
        writer.writerow(values)
    return Response("\ufeff" + output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/production")
def production(mine_id: str | None = None, date_from: date | None = None, date_to: date | None = None,
               status: str | None = None, limit: int = Query(250, ge=1, le=1000), offset: int = Query(0, ge=0),
               user=Depends(current_user), db=Depends(get_db)):
    query = production_query(user, mine_id, date_from, date_to, status)
    return [pack(x) for x in db.scalars(query.order_by(ProductionReport.work_date.desc(), ProductionReport.shift).offset(offset).limit(limit))]


@router.get("/production/summary")
def production_summary(mine_id: str | None = None, date_from: date | None = None, date_to: date | None = None,
                       user=Depends(current_user), db=Depends(get_db)):
    rows = db.scalars(production_query(user, mine_id, date_from, date_to)).all()
    approved = [x for x in rows if x.status == "approved"]
    def totals(items):
        result = {k: float(sum((getattr(x, k) for x in items), Decimal(0))) for k in ("coal_tonnes", "dispatch_tonnes", "target_tonnes")}
        result["downtime_minutes"] = sum(x.downtime_minutes for x in items)
        result["achievement_percent"] = round(result["coal_tonnes"] / result["target_tonnes"] * 100, 2) if result["target_tonnes"] else None
        return result
    days = defaultdict(list)
    for row in approved:
        days[row.work_date].append(row)
    return {**totals(approved), "status_counts": dict(Counter(x.status for x in rows)), "record_count": len(rows),
            "basis": "Approved reports only. Dispatch may draw from existing stock.",
            "daily": [{"date": day, **totals(items)} for day, items in sorted(days.items())]}


@router.get("/reports/production.csv")
def production_csv(mine_id: str | None = None, date_from: date | None = None, date_to: date | None = None,
                   status: str | None = None, user=Depends(current_user), db=Depends(get_db)):
    rows = [pack(x) for x in db.scalars(production_query(user, mine_id, date_from, date_to, status).order_by(ProductionReport.work_date, ProductionReport.shift))]
    audit(db, user, "report.exported", "production.csv", mine_id, {"rows": len(rows)})
    db.commit()
    return csv_response(["id", "mine_id", "work_date", "shift", "coal_tonnes", "dispatch_tonnes", "target_tonnes", "downtime_minutes", "status", "notes", "created_by", "reviewed_by"], rows, "production.csv")


@router.post("/production", status_code=201)
def add_production(data: ProductionCreate, user=Depends(current_user), db=Depends(get_db)):
    obj = workflow.create_production(db, user, data)
    db.commit()
    return pack(obj)


@router.get("/production/{record_id}")
def production_detail(record_id: str, user=Depends(current_user), db=Depends(get_db)):
    authorize(user, workflow.PRODUCTION_READERS)
    obj = checked(db, ProductionReport, record_id)
    access_mine(db, user, obj.mine_id)
    return {**pack(obj), "timeline": [pack(x) for x in db.scalars(select(AuditLog).where(AuditLog.entity_id == obj.id).order_by(AuditLog.sequence))]}


@router.put("/production/{record_id}")
def correct_production(record_id: str, data: ProductionUpdate, user=Depends(current_user), db=Depends(get_db)):
    obj = workflow.update_production(db, user, record_id, data)
    db.commit()
    return pack(obj)


@router.post("/production/{record_id}/review")
def review_production(record_id: str, data: ProductionReview, user=Depends(current_user), db=Depends(get_db)):
    obj = workflow.review_production(db, user, record_id, data)
    db.commit()
    return pack(obj)


def filtered_grievances(user, mine_id=None, status=None):
    query = workflow.grievance_query(user)
    if mine_id:
        query = query.where(Grievance.mine_id == mine_id)
    if status:
        if status not in {"open", "assigned", "in_progress", "resolved", "closed"}:
            raise HTTPException(422, "Unknown grievance status")
        query = query.where(Grievance.status == status)
    return query


@router.get("/grievances")
def grievances(mine_id: str | None = None, status: str | None = None, limit: int = Query(250, ge=1, le=1000), offset: int = Query(0, ge=0),
               user=Depends(current_user), db=Depends(get_db)):
    return [pack(x) for x in db.scalars(filtered_grievances(user, mine_id, status).order_by(Grievance.created_at.desc()).offset(offset).limit(limit))]


@router.get("/grievances/summary")
def grievance_summary(mine_id: str | None = None, user=Depends(current_user), db=Depends(get_db)):
    # Management/regulators see aggregate oversight, not restricted narratives.
    query = scoped(select(Grievance), Grievance, user) if user.role in GLOBAL_ROLES | MANAGERS else workflow.grievance_query(user)
    if mine_id:
        query = query.where(Grievance.mine_id == mine_id)
    rows = db.scalars(query).all()
    return {"total": len(rows), "status_counts": dict(Counter(x.status for x in rows)),
            "category_counts": dict(Counter(x.category for x in rows)),
            "overdue": sum(x.due_at < now() and x.status not in {"resolved", "closed"} for x in rows),
            "open": sum(x.status not in {"resolved", "closed"} for x in rows)}


@router.get("/reports/grievances.csv")
def grievance_csv(mine_id: str | None = None, status: str | None = None, user=Depends(current_user), db=Depends(get_db)):
    rows = [pack(x) for x in db.scalars(filtered_grievances(user, mine_id, status).order_by(Grievance.created_at))]
    audit(db, user, "report.exported", "grievances.csv", mine_id, {"rows": len(rows)})
    db.commit()
    return csv_response(["id", "mine_id", "category", "priority", "status", "created_at", "due_at", "resolved_at", "closed_at"], rows, "grievances.csv")


@router.post("/grievances", status_code=201)
def add_grievance(data: GrievanceCreate, user=Depends(current_user), db=Depends(get_db)):
    obj = workflow.create_grievance(db, user, data)
    db.commit()
    return pack(obj)


@router.get("/grievances/{record_id}")
def grievance_detail(record_id: str, user=Depends(current_user), db=Depends(get_db)):
    obj = checked(db, Grievance, record_id)
    workflow.access_grievance(db, user, obj)
    hashes = {x.payload.get("event_id"): x.payload.get("event_hash") for x in db.scalars(select(AuditLog).where(AuditLog.entity_id == obj.id))}
    events = [pack(x) for x in db.scalars(select(GrievanceEvent).where(GrievanceEvent.grievance_id == obj.id).order_by(GrievanceEvent.occurred_at, GrievanceEvent.id))]
    return {**pack(obj), "timeline": [{**x, "integrity_verified": hashes.get(x["id"]) == digest(x)} for x in events]}


@router.post("/grievances/{record_id}/transition")
def change_grievance(record_id: str, data: GrievanceTransition, user=Depends(current_user), db=Depends(get_db)):
    obj = workflow.transition_grievance(db, user, record_id, data)
    db.commit()
    return pack(obj)
