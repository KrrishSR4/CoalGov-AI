from fastapi import HTTPException
from sqlalchemy import update
from ..models import Inspection
from ..security import access_mine, authorize, MANAGERS
from .common import checked, versioned, pack
from .audit import audit


def update_inspection(db, user, record_id, data):
    obj = checked(db, Inspection, record_id)
    access_mine(db, user, obj.mine_id)
    if user.id != obj.officer_id:
        raise HTTPException(403, "Only the assigned inspector can record inspection results")
    authorize(user, MANAGERS | {"officer", "agency"})
    versioned(obj, data.version)
    if obj.status == "completed":
        raise HTTPException(409, "Completed inspections are immutable. Schedule a follow-up.")
    if [x.label for x in data.checklist] != [x["label"] for x in obj.checklist]:
        raise HTTPException(422, "Checklist items must match the scheduled inspection")
    if data.status == "completed" and any(x.result == "pending" for x in data.checklist):
        raise HTTPException(422, "Complete every checklist item before submitting")
    values = data.model_dump(exclude={"version"})
    changed = db.execute(update(Inspection).where(Inspection.id == obj.id, Inspection.version == data.version)
        .values(**values, version=data.version + 1))
    if changed.rowcount != 1:
        raise HTTPException(409, "Inspection changed. Reload and review it.")
    db.refresh(obj)
    audit(db, user, "inspection.updated", obj.id, obj.mine_id, pack(obj))
    return obj
