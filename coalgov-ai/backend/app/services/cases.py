from datetime import timedelta
from sqlalchemy import select, func
from fastapi import HTTPException
from ..models import Case, Evidence, Inspection, Notification, now
from ..security import access_mine, authorize, member, MANAGERS, REPORTERS
from .common import checked, pack, versioned
from .audit import audit
from .risk import score


def access_case(db, user, case):
    access_mine(db, user, case.mine_id)
    if user.role == "contractor" and user.id not in {case.created_by, case.assigned_to}:
        raise HTTPException(403, "This case is not assigned to you")


def create_case(db, user, data):
    authorize(user, REPORTERS)
    access_mine(db, user, data.mine_id)
    if data.inspection_id:
        inspection = checked(db, Inspection, data.inspection_id)
        if inspection.mine_id != data.mine_id:
            raise HTTPException(422, "Inspection belongs to a different mine")
    risk, reasons = score(db, data.mine_id, data.category, data.severity, data.likelihood)
    case = Case(**data.model_dump(), created_by=user.id, risk_score=risk, risk_reasons=reasons,
                due_at=now() + timedelta(hours=24 if risk >= 70 else 72 if risk >= 40 else 168))
    db.add(case)
    db.flush()
    audit(db, user, "case.created", case.id, case.mine_id, pack(case))
    return case


def transition(db, user, case, data):
    access_case(db, user, case)
    authorize(user, REPORTERS)
    versioned(case, data.version)
    before = pack(case)
    action = data.action
    if action == "assign":
        authorize(user, MANAGERS)
        if case.status not in {"open", "assigned", "in_progress"}:
            raise HTTPException(409, "Assignment is allowed only for an open action")
        if not data.assigned_to:
            raise HTTPException(422, "Select an assignee")
        member(db, data.assigned_to, case.mine_id, REPORTERS)
        case.assigned_to = data.assigned_to
        case.status = "assigned"
        if data.due_at:
            if data.due_at <= now():
                raise HTTPException(422, "Due time must be in the future")
            case.due_at = data.due_at
        db.add(Notification(user_id=data.assigned_to, mine_id=case.mine_id,
            title="Corrective action assigned", body=case.title, entity_id=case.id))
    elif action in {"start", "submit_action"}:
        if user.id != case.assigned_to:
            raise HTTPException(403, "Only the assigned person can submit corrective work")
        if case.status not in {"assigned", "in_progress"}:
            raise HTTPException(409, "Case is not ready for corrective work")
        if action == "start":
            case.status = "in_progress"
        else:
            if len(data.note) < 10:
                raise HTTPException(422, "Describe the corrective work in at least 10 characters")
            evidence = db.scalar(select(Evidence).where(Evidence.case_id == case.id,
                Evidence.purpose == "corrective_action", Evidence.uploaded_by == user.id))
            if not evidence:
                raise HTTPException(422, "Upload corrective-action evidence before submitting")
            case.action_text = data.note
            case.action_by = user.id
            case.status = "pending_verification"
    elif action in {"verify", "reject"}:
        authorize(user, MANAGERS | {"officer", "agency"})
        if case.status != "pending_verification":
            raise HTTPException(409, "Case is not awaiting verification")
        if user.id in {case.action_by, case.assigned_to}:
            raise HTTPException(403, "Verification requires someone independent of the corrective work")
        if len(data.note) < 10:
            raise HTTPException(422, "Enter a verification note of at least 10 characters")
        case.verification_note = data.note
        case.verified_by = user.id if action == "verify" else None
        case.status = "verified" if action == "verify" else "in_progress"
        if action == "reject":
            db.add(Notification(user_id=case.assigned_to, mine_id=case.mine_id,
                title="Corrective action needs revision", body=data.note, entity_id=case.id))
    elif action == "close":
        authorize(user, MANAGERS)
        if case.status != "verified" or not case.verified_by:
            raise HTTPException(409, "Independent verification is required before closure")
        case.status = "closed"
        case.closed_at = now()
    elif action == "reopen":
        authorize(user, MANAGERS)
        if case.status not in {"verified", "closed"} or len(data.note) < 10:
            raise HTTPException(422, "Only a verified or closed case can be reopened, with a reason")
        case.status = "open"
        case.closed_at = None
        case.verified_by = None
        case.assigned_to = None
        case.action_by = None
        case.action_text = ""
        case.verification_note = data.note
    case.updated_at = now()
    case.risk_score, case.risk_reasons = score(db, case.mine_id, case.category, case.severity, case.likelihood, case.due_at, case.id)
    db.flush()
    audit(db, user, "case." + action, case.id, case.mine_id, {"before": before, "after": pack(case)})
    return case
