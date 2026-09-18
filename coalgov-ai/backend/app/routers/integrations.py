from datetime import datetime
from typing import Literal
from pydantic import Field
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from ..schemas import Input, CaseCreate
from ..models import User, Asset, SyncReceipt
from ..db import get_db
from ..config import settings
from ..security import current_user, authorize, MANAGERS, access_mine
from ..services.cases import create_case
from ..services.common import pack, checked
from ..services.audit import digest, audit

router=APIRouter(prefix="/api/integrations",tags=["Integration adapters"])


class VisionEvent(Input):
    event_id: str = Field(min_length=8,max_length=64)
    mine_id: str
    asset_id: str
    detection: Literal["missing_ppe","restricted_zone_entry","smoke","vehicle_proximity"]
    confidence: float = Field(ge=0,le=1)
    observed_at: datetime
    description: str = Field(min_length=10,max_length=2000)


@router.get("")
def status(user=Depends(current_user)):
    return [{"name":"IoT telemetry","status":"configured" if settings.telemetry_key else "manager_authenticated", "endpoint":"/api/telemetry"},
        {"name":"CCTV analytics","status":"event_adapter_available; detection model supplied externally", "endpoint":"/api/integrations/vision-events"},
        {"name":"Cloudflare R2","status":settings.storage_backend},
        {"name":"Email","status":"configured" if settings.smtp_host else "not_configured"},
        {"name":"SMS","status":"configured" if settings.sms_webhook_url else "not_configured"},
        {"name":"Evidence language model","status":"configured" if settings.llm_api_key and settings.llm_model else "local_retrieval"},
        {"name":"DGMS / DigiCoal / ICCC","status":"requires approved API access and field mapping"},
        {"name":"SSO / LDAP","status":"deployment integration required; local JWT authentication available"}]


@router.post("/vision-events",status_code=201)
def vision_event(data: VisionEvent,user=Depends(current_user),db=Depends(get_db)):
    authorize(user,MANAGERS)
    access_mine(db,user,data.mine_id)
    asset=checked(db,Asset,data.asset_id)
    if asset.mine_id!=data.mine_id:
        raise HTTPException(422,"Asset and mine must match")
    if data.confidence<.7:
        raise HTTPException(422,"Low-confidence detection: review it before submitting a governance observation")
    operation_id=digest({"type":"vision", "event_id":data.event_id})
    key=digest(data.model_dump())
    old=db.scalar(select(SyncReceipt).where(SyncReceipt.user_id==user.id,SyncReceipt.operation_id==operation_id))
    if old:
        if old.payload_hash!=key:
            raise HTTPException(409,"Event ID already used with different data")
        return old.response
    category={"missing_ppe":"Workforce","restricted_zone_entry":"Other","smoke":"Fire","vehicle_proximity":"Transport"}[data.detection]
    # Confidence is detector confidence, not measured safety risk. Operator review
    # is required; these observations do not auto-close or determine compliance.
    case=create_case(db,user,CaseCreate(mine_id=data.mine_id,title="Review CCTV signal: "+data.detection.replace('_',' '),
        description=data.description+f"\nExternal detector confidence: {data.confidence:.2f}. Human review required.",
        category=category,kind="observation",severity=3,likelihood=3,latitude=asset.latitude,longitude=asset.longitude,
        captured_at=data.observed_at.isoformat()+"Z"))
    result=pack(case)
    db.add(SyncReceipt(user_id=user.id,operation_id=operation_id,payload_hash=key,response=result))
    audit(db,user,"vision.event_linked",case.id,data.mine_id,{"event_id":data.event_id,"confidence":data.confidence})
    db.commit()
    return result

