import hashlib
import json
from sqlalchemy import select, update
from ..models import AuditHead, AuditLog, now


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def log_body(row):
    return {k: getattr(row, k) for k in ("actor_id", "mine_id", "action", "entity_id", "payload", "occurred_at", "previous_hash")}


def audit(db, actor, action, entity_id, mine_id=None, payload=None):
    # A singleton row serializes appenders on PostgreSQL and SQLite. The business
    # mutation and this append share one transaction, so they commit together.
    db.execute(update(AuditHead).where(AuditHead.id == 1).values(digest=AuditHead.digest))
    head = db.scalar(select(AuditHead).where(AuditHead.id == 1).execution_options(populate_existing=True))
    if not head:
        raise RuntimeError("Run python -m app.init_db before serving requests")
    row = AuditLog(actor_id=actor.id if hasattr(actor, "id") else str(actor), mine_id=mine_id,
                   action=action, entity_id=str(entity_id), payload=payload or {},
                   occurred_at=now().isoformat() + "Z", previous_hash=head.digest)
    row.hash = digest(log_body(row))
    db.add(row)
    head.digest = row.hash
    db.flush()
    return row


def verify(db):
    previous = "0" * 64
    count = 0
    for row in db.scalars(select(AuditLog).order_by(AuditLog.sequence)):
        if row.previous_hash != previous or digest(log_body(row)) != row.hash:
            return {"valid": False, "checked": count, "broken_sequence": row.sequence}
        previous = row.hash
        count += 1
    head = db.get(AuditHead, 1)
    return {"valid": bool(head and head.digest == previous), "checked": count,
            "head_hash": previous, "scope": "whole database", "verified_at": now().isoformat() + "Z"}

