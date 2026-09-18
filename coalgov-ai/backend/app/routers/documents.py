import hashlib
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Depends, Form, UploadFile, File, HTTPException, Response
from sqlalchemy import select
from ..db import get_db
from ..models import Evidence, Case, uid
from ..security import current_user, access_mine, scoped, authorize, REPORTERS
from ..services.common import pack, checked
from ..services.audit import audit
from ..services.cases import access_case
from ..services import documents as docs

router = APIRouter(prefix="/api/documents", tags=["Documents and evidence"])


def access_document(db, user, obj):
    access_mine(db, user, obj.mine_id)
    if obj.case_id:
        access_case(db, user, checked(db, Case, obj.case_id))
    elif user.role == "contractor" and obj.uploaded_by != user.id:
        raise HTTPException(403, "You cannot access this document")


@router.get("")
def documents(user=Depends(current_user), db=Depends(get_db)):
    query = scoped(select(Evidence), Evidence, user)
    if user.role == "contractor":
        query = query.where(Evidence.uploaded_by == user.id)
    return [pack(x, {"storage_key", "extracted_text"}) for x in db.scalars(query.order_by(Evidence.created_at.desc()).limit(500))]


@router.post("", status_code=201)
def upload(file: UploadFile = File(...), mine_id: str = Form(...), case_id: str | None = Form(None),
           upload_id: str | None = Form(None, max_length=64),
           purpose: Literal["observation", "corrective_action", "verification", "compliance"] = Form("compliance"),
           user=Depends(current_user), db=Depends(get_db)):
    authorize(user, REPORTERS)
    access_mine(db, user, mine_id)
    if case_id:
        case = checked(db, Case, case_id)
        access_case(db, user, case)
        if case.mine_id != mine_id:
            raise HTTPException(422, "Case and document mine must match")
    elif purpose != "compliance":
        raise HTTPException(422, "Select a case for field evidence")
    data = file.file.read(docs.MAX_BYTES + 1)
    if upload_id:
        previous = db.scalar(select(Evidence).where(Evidence.uploaded_by == user.id, Evidence.upload_id == upload_id))
        if previous:
            if previous.sha256 != hashlib.sha256(data).hexdigest() or previous.case_id != case_id or previous.mine_id != mine_id or previous.purpose != purpose:
                raise HTTPException(409, "Upload ID already used with different content")
            return pack(previous, {"storage_key"})
    if case_id:
        if case.status == "closed":
            raise HTTPException(409, "Reopen the case before adding evidence")
        if purpose == "corrective_action" and case.assigned_to != user.id:
            raise HTTPException(403, "Only the assignee can upload corrective work evidence")
    name = Path((file.filename or "upload").replace("\\", "/")).name[:220]
    try:
        suffix, mime = docs.validate_bytes(name, data)
    except Exception as error:
        raise HTTPException(422, str(error))
    # Preserve valid evidence even if OCR is unavailable or extraction fails.
    try:
        text, method = docs.extract(data, suffix)
        analysis = docs.analyze(text, method)
    except Exception as error:
        text, analysis = "", {"method": "unavailable", "review_required": True,
            "note": str(error)[:300], "characters": 0, "topics": [], "candidate_dates": []}
    key = uid() + suffix
    docs.store_bytes(key, data, mime)
    try:
        obj = Evidence(mine_id=mine_id, case_id=case_id, uploaded_by=user.id, filename=name,
            upload_id=upload_id,
            content_type=mime, storage_key=key, sha256=hashlib.sha256(data).hexdigest(), size=len(data),
            purpose=purpose, extracted_text=text, analysis=analysis)
        db.add(obj)
        db.flush()
        audit(db, user, "evidence.uploaded", obj.id, mine_id, {"case_id": case_id, "sha256": obj.sha256, "purpose": purpose})
        db.commit()
    except Exception:
        db.rollback()
        docs.delete_bytes(key)
        raise
    return pack(obj, {"storage_key"})


@router.get("/{document_id}")
def detail(document_id: str, user=Depends(current_user), db=Depends(get_db)):
    obj = checked(db, Evidence, document_id)
    access_document(db, user, obj)
    return pack(obj, {"storage_key"})


@router.get("/{document_id}/download")
def download(document_id: str, user=Depends(current_user), db=Depends(get_db)):
    obj = checked(db, Evidence, document_id)
    access_document(db, user, obj)
    data = docs.read_bytes(obj.storage_key)
    if hashlib.sha256(data).hexdigest() != obj.sha256:
        raise HTTPException(409, "Evidence integrity check failed")
    from urllib.parse import quote
    return Response(data, media_type=obj.content_type,
        headers={"Content-Disposition": "attachment; filename*=UTF-8''" + quote(obj.filename), "X-Content-Type-Options": "nosniff"})
