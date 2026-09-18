"""Production approval and access-controlled grievance workflows."""
from datetime import timedelta
from fastapi import HTTPException
from sqlalchemy import select, or_
from ..models import ProductionReport, Grievance, GrievanceEvent, Notification, User, now
from ..security import MANAGERS, REPORTERS, GLOBAL_ROLES, access_mine, authorize, member, scoped
from .common import checked, pack, versioned
from .audit import audit, digest

PRODUCTION_WRITERS = MANAGERS | {"officer"}
PRODUCTION_READERS = PRODUCTION_WRITERS | GLOBAL_ROLES | {"agency"}


def notify(db, recipients, mine_id, title, body, entity_id):
    for user_id in set(x for x in recipients if x):
        db.add(Notification(user_id=user_id, mine_id=mine_id, title=title, body=body, entity_id=entity_id))


def managers(db, mine_id):
    return [u.id for u in db.scalars(select(User).where(User.active == True, User.role.in_(MANAGERS)))
            if u.role == "admin" or mine_id in u.mine_ids]


def create_production(db, user, data):
    authorize(user, PRODUCTION_WRITERS)
    access_mine(db, user, data.mine_id)
    previous = db.scalar(select(ProductionReport).where(ProductionReport.mine_id == data.mine_id,
        ProductionReport.work_date == data.work_date.isoformat(), ProductionReport.shift == data.shift))
    if previous:
        raise HTTPException(409, detail={"message": "A report already exists for this mine, date and shift. Review it before continuing.", "current": pack(previous)})
    values = data.model_dump()
    values["work_date"] = data.work_date.isoformat()
    obj = ProductionReport(**values, created_by=user.id)
    db.add(obj)
    db.flush()
    audit(db, user, "production.submitted", obj.id, obj.mine_id, pack(obj))
    notify(db, [x for x in managers(db, obj.mine_id) if x != user.id], obj.mine_id,
           "Production report awaiting review", f"Review shift {obj.shift} for {obj.work_date}.", obj.id)
    return obj


def update_production(db, user, entity_id, data):
    authorize(user, PRODUCTION_WRITERS)
    obj = checked(db, ProductionReport, entity_id)
    access_mine(db, user, obj.mine_id)
    if user.id != obj.created_by:
        raise HTTPException(403, "Only the report author can correct a returned report")
    versioned(obj, data.version)
    if obj.status != "returned":
        raise HTTPException(409, "Only returned reports can be corrected and resubmitted")
    if (data.mine_id, data.work_date.isoformat(), data.shift) != (obj.mine_id, obj.work_date, obj.shift):
        raise HTTPException(422, "Mine, work date and shift cannot change during correction")
    for key, value in data.model_dump(exclude={"version", "work_date", "mine_id", "shift"}).items():
        setattr(obj, key, value)
    obj.status, obj.updated_at = "submitted", now()
    obj.reviewed_by = None
    db.flush()
    audit(db, user, "production.resubmitted", obj.id, obj.mine_id, pack(obj))
    notify(db, [x for x in managers(db, obj.mine_id) if x != user.id], obj.mine_id,
           "Production report resubmitted", f"Review corrected shift {obj.shift} for {obj.work_date}.", obj.id)
    return obj


def review_production(db, user, entity_id, data):
    authorize(user, MANAGERS)
    obj = checked(db, ProductionReport, entity_id)
    access_mine(db, user, obj.mine_id)
    if obj.created_by == user.id:
        raise HTTPException(403, "A different mine official or administrator must review your report")
    versioned(obj, data.version)
    if obj.status != "submitted":
        raise HTTPException(409, "Only submitted reports can be reviewed")
    obj.status = "approved" if data.action == "approve" else "returned"
    obj.review_note, obj.reviewed_by, obj.updated_at = data.note, user.id, now()
    db.flush()
    audit(db, user, "production." + obj.status, obj.id, obj.mine_id, pack(obj))
    notify(db, [obj.created_by], obj.mine_id, "Production report " + obj.status, data.note, obj.id)
    return obj


def grievance_query(user):
    query = scoped(select(Grievance), Grievance, user)
    if user.role not in MANAGERS:
        query = query.where(or_(Grievance.created_by == user.id, Grievance.assigned_to == user.id))
    return query


def access_grievance(db, user, obj):
    access_mine(db, user, obj.mine_id)
    if user.role not in MANAGERS and user.id not in {obj.created_by, obj.assigned_to}:
        raise HTTPException(403, "Grievance details are restricted to the reporter and responsible staff")


def grievance_event(db, user, obj, action, note):
    event = GrievanceEvent(grievance_id=obj.id, actor_id=user.id, action=action, note=note, status=obj.status)
    db.add(event)
    db.flush()
    # General oversight audit readers receive hashes, never grievance narratives.
    audit(db, user, "grievance." + action, obj.id, obj.mine_id,
          {"status": obj.status, "event_id": event.id, "event_hash": digest(pack(event))})


def grievance_days(priority):
    # Pilot response targets, not statutory deadlines.
    return {"normal": 7, "high": 3, "urgent": 1}[priority]


def create_grievance(db, user, data):
    authorize(user, REPORTERS)
    access_mine(db, user, data.mine_id)
    obj = Grievance(**data.model_dump(), created_by=user.id, due_at=now() + timedelta(days=grievance_days(data.priority)))
    db.add(obj)
    db.flush()
    grievance_event(db, user, obj, "submitted", "Grievance submitted. " + data.description)
    notify(db, managers(db, obj.mine_id), obj.mine_id, "New grievance requires assignment",
           "Review grievance " + obj.id[:8] + " in the grievance register.", obj.id)
    return obj


def transition_grievance(db, user, entity_id, data):
    authorize(user, REPORTERS)
    obj = checked(db, Grievance, entity_id)
    access_grievance(db, user, obj)
    versioned(obj, data.version)
    if data.action == "assign":
        authorize(user, MANAGERS)
        if obj.status in {"resolved", "closed"}:
            raise HTTPException(409, "Reopen the grievance before assigning it")
        member(db, data.assigned_to, obj.mine_id, MANAGERS | {"officer", "agency"})
        if data.assigned_to == obj.created_by:
            raise HTTPException(422, "Assign someone other than the grievance reporter")
        if data.due_at is not None:
            if not now() < data.due_at <= now() + timedelta(days=90):
                raise HTTPException(422, "Choose a future response target within 90 days")
            obj.due_at = data.due_at
        obj.assigned_to, obj.status = data.assigned_to, "assigned"
    elif data.action in {"start", "resolve"}:
        if obj.assigned_to != user.id:
            raise HTTPException(403, "Only the assigned handler can perform this action")
        if obj.status not in {"assigned", "in_progress"}:
            raise HTTPException(409, "The grievance must be assigned and active")
        obj.status = "in_progress" if data.action == "start" else "resolved"
        if data.action == "resolve":
            obj.resolution, obj.resolved_at = data.note, now()
    elif data.action == "close":
        if obj.created_by != user.id:
            raise HTTPException(403, "Only the reporter can accept the resolution and close the grievance")
        if obj.status != "resolved":
            raise HTTPException(409, "The grievance must be resolved before closure")
        obj.status, obj.closed_at = "closed", now()
    elif data.action == "reopen":
        if obj.created_by != user.id:
            raise HTTPException(403, "Only the reporter can reopen the grievance")
        if obj.status not in {"resolved", "closed"}:
            raise HTTPException(409, "Only resolved or closed grievances can be reopened")
        obj.status = "assigned" if obj.assigned_to else "open"
        obj.resolution, obj.resolved_at, obj.closed_at = "", None, None
        obj.due_at = now() + timedelta(days=grievance_days(obj.priority))
    elif data.action == "comment" and obj.status == "closed":
        raise HTTPException(409, "Reopen the grievance before adding a comment")
    obj.updated_at = now()
    db.flush()
    grievance_event(db, user, obj, data.action, data.note)
    recipients = [obj.created_by, obj.assigned_to] + managers(db, obj.mine_id)
    notify(db, [x for x in recipients if x != user.id], obj.mine_id,
           "Grievance " + obj.status.replace("_", " "), "Review the update to grievance " + obj.id[:8] + ".", obj.id)
    return obj
