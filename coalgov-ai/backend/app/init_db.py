from datetime import timedelta
from pathlib import Path
import hashlib
from sqlalchemy import select, text
from .db import engine, Base, SessionLocal
from . import models as m
from .config import settings
from .security import password_hasher
from .services.audit import audit
from .services.risk import score


def install_audit_guards(connection):
    if connection.dialect.name == "sqlite":
        connection.execute(text("CREATE TRIGGER IF NOT EXISTS no_audit_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Audit records are append-only'); END"))
        connection.execute(text("CREATE TRIGGER IF NOT EXISTS no_audit_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Audit records are append-only'); END"))
    else:
        connection.execute(text("""CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Audit records are append-only'; END; $$"""))
        connection.execute(text("DROP TRIGGER IF EXISTS audit_immutable ON audit_logs"))
        connection.execute(text("CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation()"))
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        connection.execute(text("CREATE OR REPLACE VIEW asset_locations AS SELECT id, mine_id, name, ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography AS location FROM assets"))
        connection.execute(text("CREATE OR REPLACE VIEW case_locations AS SELECT id, mine_id, title, ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography AS location FROM cases WHERE latitude IS NOT NULL AND longitude IS NOT NULL"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS assets_location_gist ON assets USING gist ((ST_SetSRID(ST_MakePoint(longitude, latitude),4326)::geography))"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS cases_location_gist ON cases USING gist ((ST_SetSRID(ST_MakePoint(longitude, latitude),4326)::geography)) WHERE latitude IS NOT NULL AND longitude IS NOT NULL"))


def initialize(seed=False):
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        install_audit_guards(connection)
    with SessionLocal() as db:
        if not db.get(m.AuditHead, 1):
            db.add(m.AuditHead(id=1, digest="0" * 64))
            db.commit()
        if seed and not db.scalar(select(m.User.id).limit(1)):
            seed_demo(db)
        if seed and db.get(m.User, "user-admin") and db.get(m.User, "user-contractor"):
            seed_operations_demo(db)


def seed_operations_demo(db):
    """Add examples once, including when an existing demo workspace is upgraded."""
    from decimal import Decimal
    from datetime import datetime
    from zoneinfo import ZoneInfo
    from .services.operations import grievance_event
    day = (datetime.now(ZoneInfo("Asia/Kolkata")).date() - timedelta(days=1)).isoformat()
    for index, shift in enumerate(["A", "B"]):
        record_id = "demo-production-" + shift
        if db.get(m.ProductionReport, record_id) or db.scalar(select(m.ProductionReport).where(
            m.ProductionReport.mine_id == "mine-1", m.ProductionReport.work_date == day, m.ProductionReport.shift == shift)):
            continue
        record = m.ProductionReport(id=record_id, mine_id="mine-1", work_date=day, shift=shift,
            coal_tonnes=Decimal("1250.25") + index * 75, dispatch_tonnes=Decimal("1190.50"), target_tonnes=Decimal("1500.00"),
            downtime_minutes=25 + index * 10, notes="Fictional shift record for demonstration.", created_by="user-officer",
            status="approved" if index == 0 else "submitted", reviewed_by="user-official" if index == 0 else None,
            review_note="Fictional independent review." if index == 0 else "", captured_at=m.now())
        db.add(record)
        db.flush()
        audit(db, "demo-seed", "demo.production_initialized", record.id, record.mine_id, {"synthetic": True})
    if not db.get(m.Grievance, "demo-grievance-1"):
        record = m.Grievance(id="demo-grievance-1", mine_id="mine-1", title="Rest shelter lighting request (demo)",
            description="Fictional request: improve the lighting near the rest shelter for the evening shift.",
            category="Facilities", priority="normal", created_by="user-contractor", assigned_to="user-official",
            status="assigned", captured_at=m.now(), due_at=m.now() + timedelta(days=7))
        db.add(record)
        db.flush()
        grievance_event(db, db.get(m.User, "user-contractor"), record, "submitted", "Fictional grievance created for demonstration.")
        grievance_event(db, db.get(m.User, "user-admin"), record, "assign", "Fictional assignment to the mine official.")
    db.commit()


def seed_demo(db):
    mines = []
    for i, (name, lat, lon) in enumerate([("North Pit", 22.31, 82.59), ("East Extension", 22.35, 82.66), ("South Block", 22.26, 82.64)]):
        mine = m.Mine(id=f"mine-{i+1}", name=name, subsidiary="MineX Demonstration", state="Chhattisgarh",
            latitude=lat, longitude=lon, boundary={"type": "Polygon", "coordinates": [[[lon-.012, lat-.009], [lon+.014, lat-.009], [lon+.01, lat+.01], [lon-.012, lat-.009]]]})
        db.add(mine)
        mines.append(mine)
    db.flush()
    names = {"admin": "Kishan Kumar", "official": "Meera Sharma", "officer": "Arjun Verma", "management": "Priya Nair", "regulator": "Dev Singh", "contractor": "Ravi Kumar", "agency": "Ananya Rao"}
    users = {}
    for role, name in names.items():
        user = m.User(id="user-" + role, name=name, email=role + "@coalgov.demo", role=role,
            password_hash=password_hasher.hash(settings.demo_password), mine_ids=[x.id for x in mines] if role == "official" else ["mine-1"] if role in {"officer", "contractor", "agency"} else [])
        db.add(user)
        users[role] = user
    db.flush()
    for i, mine in enumerate(mines):
        db.add(m.Inspection(id=f"inspection-{i+1}", mine_id=mine.id, title=["Morning safety walkthrough", "Electrical isolation review", "Environmental sampling"][i],
            officer_id="user-officer" if i == 0 else "user-official", scheduled_at=m.now()+timedelta(hours=(i+1)*4),
            checklist=[{"label": s, "result": "pending"} for s in ["Check access routes", "Review equipment condition", "Confirm field evidence"]]))
        for j in range(2):
            db.add(m.Asset(id=f"asset-{i+1}-{j+1}", mine_id=mine.id, name=["Ventilation station", "Conveyor transfer"][j],
                kind=["Sensor station", "Conveyor"][j], latitude=mine.latitude+j*.005, longitude=mine.longitude+j*.005))
    db.flush()
    samples = [
        (0,"Ventilation duct damage at gallery 4","Ventilation",5,5,"assigned"),
        (0,"Conveyor guard requires replacement","Equipment",4,4,"in_progress"),
        (1,"Dust suppression nozzle blocked","Environment",4,4,"open"),
        (0,"Electrical isolation label replaced","Electrical",3,4,"pending_verification"),
        (2,"Drainage inspection follow-up","Environment",3,3,"open"),
        (1,"Haul road signage obscured","Transport",3,3,"assigned"),
        (0,"PPE refresher attendance documented","Workforce",2,3,"closed"),
        (2,"Fire extinguisher access obstructed","Fire",4,3,"open"),
        (0,"Belt emergency stop inspected","Equipment",3,3,"verified"),
        (1,"Temporary cable routing secured","Electrical",2,2,"closed"),
        (2,"Water sampling log requires evidence","Environment",2,3,"open"),
        (0,"Vehicle movement near pedestrian route","Transport",4,4,"open"),
    ]
    for i,(mi,title,category,severity,likelihood,status) in enumerate(samples):
        mine = mines[mi]
        risk,reasons=score(db,mine.id,category,severity,likelihood)
        created=m.now()-timedelta(days=i%7, hours=2)
        assigned="user-contractor" if mi == 0 else "user-official"
        c=m.Case(id=f"case-{i+1:03}",mine_id=mine.id,title=title,
            description="Demonstration observation. Inspect the location, document the condition, and attach evidence of corrective work. This record is fictional.",
            category=category,kind="incident" if i==11 else "observation",severity=severity,likelihood=likelihood,
            risk_score=risk,risk_reasons=reasons,status=status,created_by="user-official",
            assigned_to=assigned if status!="open" else None,latitude=mine.latitude+(i%3)*.003,longitude=mine.longitude+(i%4)*.002,
            created_at=created,captured_at=created,updated_at=created,due_at=m.now()+timedelta(hours=-8 if i in [0,2,7] else (i+1)*7))
        if status in {"pending_verification","verified","closed"}:
            c.action_by=assigned
            c.action_text="Demonstration corrective work completed and supporting record attached."
            c.verified_by="user-agency" if mi==0 else "user-admin" if status in {"verified","closed"} else None
            if status == "pending_verification": c.verified_by = None
            c.verification_note="Sample verification record, for demonstration only." if c.verified_by else ""
            if status=="closed": c.closed_at=m.now()-timedelta(days=i%3)
        db.add(c)
        db.flush()
        if c.action_by:
            content=(title+"\n"+c.action_text+"\nFictional sample evidence.").encode()
            key=f"sample-case-{i+1}.txt"
            Path(settings.upload_dir,key).write_bytes(content)
            db.add(m.Evidence(mine_id=mine.id,case_id=c.id,uploaded_by=c.action_by,filename=key,storage_key=key,
                sha256=hashlib.sha256(content).hexdigest(),content_type="text/plain",size=len(content),purpose="corrective_action",
                extracted_text=content.decode(),analysis={"method":"sample_text","review_required":True}))
        audit(db,"demo-seed","demo.case_initialized",c.id,mine.id,{"synthetic":True,"status":status,"title":title})
    for i, title in enumerate(["Ventilation examination register", "Environmental monitoring submission", "Electrical maintenance record", "Worker training evidence", "Emergency preparedness review", "Inspection follow-up register"]):
        mine=mines[i%3]
        db.add(m.Compliance(mine_id=mine.id,title=title,reference="Illustrative obligation; configure approved statutory rule",source_url="https://www.dgms.gov.in/",
            owner_id="user-officer" if i%3==0 else "user-official",due_at=m.now()+timedelta(days=i-1),status="pending"))
    db.add(m.Permit(mine_id="mine-1",title="Conveyor maintenance work",contractor_id="user-contractor",work_type="Maintenance",
        starts_at=m.now()+timedelta(hours=2),expires_at=m.now()+timedelta(hours=10),precautions="Isolate equipment, verify lockout, and brief the team. Sample request."))
    for i in range(24):
        db.add(m.SensorReading(mine_id="mine-1",asset_id="asset-1-1",source="demo-simulator",event_id=f"demo-{i}",metric="temperature",
            value=28+(i%5)*.3 if i!=23 else 35,unit="C",observed_at=m.now()-timedelta(minutes=(24-i)*10),anomaly=i==23,
            explanation="Synthetic anomaly for demonstration" if i==23 else "Synthetic baseline"))
    db.add(m.Notification(user_id="user-admin",mine_id="mine-1",title="Three actions need your attention",body="Review overdue observations and assign corrective owners.",entity_id="case-001"))
    audit(db,"demo-seed","demo.initialized","workspace",payload={"synthetic":True,"mines":3})
    db.commit()


if __name__ == "__main__":
    initialize(seed=settings.seed_demo)
    print("Database initialized" + (" with fictional demo data" if settings.seed_demo else ""))
