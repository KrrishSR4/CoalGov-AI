from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from ..db import get_db
from ..models import Mine, Inspection, Compliance, Permit, Attendance, Asset, Evidence, now
from ..schemas import MineCreate, InspectionCreate, InspectionUpdate, ComplianceCreate, ComplianceUpdate, PermitCreate, PermitUpdate, AttendanceInput, AssetCreate
from ..security import current_user, authorize, access_mine, scoped, member, MANAGERS, GLOBAL_ROLES
from ..services.common import pack, checked, versioned
from ..services.audit import audit

router = APIRouter(prefix="/api", tags=["Mine operations"])


@router.get("/mines")
def mines(user=Depends(current_user), db=Depends(get_db)):
    query = select(Mine)
    if user.role not in GLOBAL_ROLES:
        query = query.where(Mine.id.in_(user.mine_ids))
    return [pack(m) for m in db.scalars(query)]


@router.post("/mines", status_code=201)
def add_mine(data: MineCreate, user=Depends(current_user), db=Depends(get_db)):
    authorize(user, {"admin"})
    mine = Mine(**data.model_dump())
    db.add(mine)
    db.flush()
    audit(db, user, "mine.created", mine.id, mine.id, pack(mine))
    db.commit()
    return pack(mine)


@router.get("/inspections")
def inspections(user=Depends(current_user), db=Depends(get_db)):
    authorize(user, MANAGERS | {"officer", "agency", "management", "regulator"})
    return [pack(x) for x in db.scalars(scoped(select(Inspection), Inspection, user).order_by(Inspection.scheduled_at.desc()))]


@router.post("/inspections", status_code=201)
def schedule(data: InspectionCreate, user=Depends(current_user), db=Depends(get_db)):
    authorize(user, MANAGERS)
    access_mine(db, user, data.mine_id)
    member(db, data.officer_id, data.mine_id, MANAGERS | {"officer", "agency"})
    obj = Inspection(**data.model_dump())
    db.add(obj)
    db.flush()
    audit(db, user, "inspection.scheduled", obj.id, obj.mine_id, pack(obj))
    db.commit()
    return pack(obj)


@router.put("/inspections/{record_id}")
def update_inspection(record_id: str, data: InspectionUpdate, user=Depends(current_user), db=Depends(get_db)):
    from ..services.inspections import update_inspection as apply_update
    obj = apply_update(db, user, record_id, data)
    db.commit()
    return pack(obj)


@router.get("/compliance")
def compliance(user=Depends(current_user), db=Depends(get_db)):
    authorize(user, MANAGERS | {"officer", "agency", "management", "regulator"})
    return [pack(x) for x in db.scalars(scoped(select(Compliance), Compliance, user).order_by(Compliance.due_at))]


@router.post("/compliance", status_code=201)
def add_compliance(data: ComplianceCreate, user=Depends(current_user), db=Depends(get_db)):
    authorize(user, MANAGERS)
    access_mine(db, user, data.mine_id)
    member(db, data.owner_id, data.mine_id, MANAGERS | {"officer", "agency"})
    obj = Compliance(**data.model_dump())
    db.add(obj)
    db.flush()
    audit(db, user, "compliance.created", obj.id, obj.mine_id, pack(obj))
    db.commit()
    return pack(obj)


@router.put("/compliance/{record_id}")
def update_compliance(record_id: str, data: ComplianceUpdate, user=Depends(current_user), db=Depends(get_db)):
    obj = checked(db, Compliance, record_id)
    access_mine(db, user, obj.mine_id)
    versioned(obj, data.version)
    if data.status == "submitted":
        if user.id != obj.owner_id or obj.status != "pending":
            raise HTTPException(403, "The owner must submit a pending obligation")
        evidence = checked(db, Evidence, data.evidence_id)
        if evidence.mine_id != obj.mine_id or evidence.case_id is not None:
            raise HTTPException(422, "Select a compliance document from this mine")
        obj.evidence_id = evidence.id
    else:
        authorize(user, MANAGERS)
        if user.id == obj.owner_id:
            raise HTTPException(403, "Compliance review requires a different person")
        if obj.status != "submitted":
            raise HTTPException(409, "Review a submitted obligation")
        if len(data.notes) < 10:
            raise HTTPException(422, "Enter a review note")
        obj.reviewed_by = user.id if data.status == "compliant" else None
    obj.status, obj.notes = data.status, data.notes
    db.flush()
    audit(db, user, "compliance." + data.status, obj.id, obj.mine_id, pack(obj))
    db.commit()
    return pack(obj)


@router.get("/permits")
def permits(user=Depends(current_user), db=Depends(get_db)):
    query = scoped(select(Permit), Permit, user)
    if user.role == "contractor":
        query = query.where(Permit.contractor_id == user.id)
    return [{**pack(x), "effective_status": "expired" if x.status == "approved" and x.expires_at < now() else x.status} for x in db.scalars(query.order_by(Permit.starts_at.desc()))]


@router.post("/permits", status_code=201)
def add_permit(data: PermitCreate, user=Depends(current_user), db=Depends(get_db)):
    authorize(user, MANAGERS | {"contractor"})
    access_mine(db, user, data.mine_id)
    member(db, data.contractor_id, data.mine_id, {"contractor"})
    if user.role == "contractor" and data.contractor_id != user.id:
        raise HTTPException(403, "Request your own work permit")
    obj = Permit(**data.model_dump())
    db.add(obj)
    db.flush()
    audit(db, user, "permit.requested", obj.id, obj.mine_id, pack(obj))
    db.commit()
    return pack(obj)


@router.put("/permits/{record_id}")
def change_permit(record_id: str, data: PermitUpdate, user=Depends(current_user), db=Depends(get_db)):
    authorize(user, MANAGERS)
    obj = checked(db, Permit, record_id)
    access_mine(db, user, obj.mine_id)
    versioned(obj, data.version)
    if data.status in {"approved", "rejected"} and obj.status != "requested":
        raise HTTPException(409, "Only requested permits can be approved or rejected")
    if data.status == "approved" and obj.expires_at <= now():
        raise HTTPException(422, "This permit has already expired")
    if data.status == "closed" and obj.status != "approved":
        raise HTTPException(409, "Only approved permits can be closed")
    obj.status, obj.approved_by = data.status, user.id
    db.flush()
    audit(db, user, "permit." + data.status, obj.id, obj.mine_id, pack(obj))
    db.commit()
    return pack(obj)


@router.get("/attendance")
def attendance(user=Depends(current_user), db=Depends(get_db)):
    query = scoped(select(Attendance), Attendance, user)
    if user.role not in MANAGERS | GLOBAL_ROLES:
        query = query.where(Attendance.user_id == user.id)
    return [pack(x) for x in db.scalars(query.order_by(Attendance.check_in.desc()).limit(1000))]


@router.post("/attendance/check-in")
def check_in(data: AttendanceInput, user=Depends(current_user), db=Depends(get_db)):
    authorize(user, MANAGERS | {"officer", "agency", "contractor"})
    access_mine(db, user, data.mine_id)
    work_date = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    if db.scalar(select(Attendance).where(Attendance.user_id == user.id, Attendance.work_date == work_date)):
        raise HTTPException(409, "You have already checked in today")
    obj = Attendance(**data.model_dump(), user_id=user.id, work_date=work_date)
    db.add(obj)
    db.flush()
    audit(db, user, "attendance.check_in", obj.id, obj.mine_id)
    db.commit()
    return pack(obj)


@router.post("/attendance/{record_id}/check-out")
def check_out(record_id: str, user=Depends(current_user), db=Depends(get_db)):
    obj = checked(db, Attendance, record_id)
    if obj.user_id != user.id:
        raise HTTPException(403, "Check out your own attendance record")
    if obj.check_out:
        raise HTTPException(409, "Already checked out")
    obj.check_out = now()
    audit(db, user, "attendance.check_out", obj.id, obj.mine_id)
    db.commit()
    return pack(obj)


@router.get("/assets")
def assets(user=Depends(current_user), db=Depends(get_db)):
    return [pack(x) for x in db.scalars(scoped(select(Asset), Asset, user))]


@router.post("/assets", status_code=201)
def add_asset(data: AssetCreate, user=Depends(current_user), db=Depends(get_db)):
    authorize(user, MANAGERS)
    access_mine(db, user, data.mine_id)
    obj = Asset(**data.model_dump())
    db.add(obj)
    db.flush()
    audit(db, user, "asset.created", obj.id, obj.mine_id, pack(obj))
    db.commit()
    return pack(obj)

