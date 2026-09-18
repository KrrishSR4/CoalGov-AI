from datetime import timedelta
import logging
import smtplib
from email.message import EmailMessage
import httpx
from celery import Celery
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from .config import settings
from .db import SessionLocal
from .models import Case, Compliance, Permit, Grievance, Notification, User, now
from .services.audit import audit
from .services.risk import score

logger = logging.getLogger(__name__)
celery_app = Celery("coalgov", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(timezone="UTC", task_serializer="json", accept_content=["json"],
    beat_schedule={"scan-deadlines": {"task": "app.tasks.scan_deadlines", "schedule": 60.0},
                   "deliver-notifications": {"task": "app.tasks.deliver_notifications", "schedule": 30.0}})


@celery_app.task(name="app.tasks.scan_deadlines")
def scan_deadlines():
    count = 0
    with SessionLocal() as db:
        recipients = db.scalars(select(User).where(User.active == True)).all()
        for case in db.scalars(select(Case).where(Case.status != "closed")).all():
            value, reasons = score(db, case.mine_id, case.category, case.severity, case.likelihood, case.due_at, case.id)
            if value != case.risk_score or reasons != case.risk_reasons:
                case.risk_score, case.risk_reasons = value, reasons
                db.flush()
                audit(db, "scheduler", "case.risk_refreshed", case.id, case.mine_id, {"risk_score": value, "risk_reasons": reasons})
        records = []
        for case in db.scalars(select(Case).where(Case.status != "closed", Case.due_at < now() + timedelta(hours=24))):
            records.append(("case", case.id, case.mine_id, case.title, case.due_at, case.assigned_to))
        for obligation in db.scalars(select(Compliance).where(Compliance.status != "compliant", Compliance.due_at < now() + timedelta(hours=24))):
            records.append(("compliance", obligation.id, obligation.mine_id, obligation.title, obligation.due_at, obligation.owner_id))
        for permit in db.scalars(select(Permit).where(Permit.status == "approved", Permit.expires_at < now() + timedelta(hours=24))):
            records.append(("permit", permit.id, permit.mine_id, permit.title, permit.expires_at, permit.contractor_id))
        for grievance in db.scalars(select(Grievance).where(Grievance.status.notin_(["resolved", "closed"]), Grievance.due_at < now() + timedelta(hours=24))):
            records.append(("grievance", grievance.id, grievance.mine_id, "Grievance " + grievance.id[:8], grievance.due_at, grievance.assigned_to or grievance.created_by))
        for kind, entity_id, mine_id, title, deadline, owner in records:
            overdue = deadline < now()
            level = "overdue" if overdue else "due_soon"
            targets = [u for u in recipients if u.id == owner or (overdue and (u.role == "admin" or (u.role == "official" and mine_id in u.mine_ids)))]
            for target in targets:
                key = f"{kind}:{entity_id}:{target.id}:{level}:{now().date()}"
                if db.scalar(select(Notification.id).where(Notification.dedupe_key == key)):
                    continue
                try:
                    with db.begin_nested():
                        db.add(Notification(user_id=target.id, mine_id=mine_id, title="Overdue: " + title if overdue else "Due soon: " + title,
                            body=f"{kind.title()} deadline: {deadline.isoformat()} UTC. Review the record and take action.", entity_id=entity_id, dedupe_key=key))
                        db.flush()
                        audit(db, "scheduler", "notification.escalated" if overdue else "notification.reminder", entity_id, mine_id, {"user_id": target.id, "kind": kind})
                    count += 1
                except IntegrityError:
                    pass
        db.commit()
    return {"notifications_created": count}


@celery_app.task(name="app.tasks.deliver_notifications")
def deliver_notifications():
    # One worker runs this task in the default compose stack. Delivery is at least
    # once: provider acceptance followed by a database failure may cause a retry.
    delivered = 0
    with SessionLocal() as db:
        for n in db.scalars(select(Notification).where(Notification.created_at > now() - timedelta(days=7),
            (Notification.email_sent == False) | (Notification.sms_sent == False)).order_by(Notification.created_at).limit(100)):
            user = db.get(User, n.user_id)
            if not user or not user.active:
                continue
            try:
                if settings.smtp_host and settings.smtp_from and not n.email_sent:
                    msg = EmailMessage()
                    msg["Subject"], msg["From"], msg["To"] = "CoalGov AI: " + n.title, settings.smtp_from, user.email
                    msg.set_content(n.body)
                    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                        server.starttls()
                        if settings.smtp_user:
                            server.login(settings.smtp_user, settings.smtp_password)
                        server.send_message(msg)
                    n.email_sent = True
                    delivered += 1
                if settings.sms_webhook_url and user.phone and not n.sms_sent:
                    if not settings.sms_webhook_url.startswith("https://"):
                        raise ValueError("SMS endpoint must use HTTPS")
                    response = httpx.post(settings.sms_webhook_url, json={"to": user.phone, "text": n.title + ". " + n.body, "idempotency_key": n.id},
                        headers={"Authorization": "Bearer " + settings.sms_webhook_token}, timeout=15)
                    response.raise_for_status()
                    n.sms_sent = True
                    delivered += 1
                db.commit()
            except Exception:
                db.rollback()
                logger.warning("Notification delivery failed for %s; it remains queued", n.id)
    return {"deliveries": delivered}
