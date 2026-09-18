from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Role = Literal["admin", "official", "officer", "management", "regulator", "contractor", "agency"]
Category = Literal["Ventilation", "Electrical", "Environment", "Equipment", "Workforce", "Fire", "Transport", "Other"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @field_validator("*", mode="after")
    @classmethod
    def normalize_dates(cls, value):
        if isinstance(value, datetime):
            if value.tzinfo is None:
                raise ValueError("Use an ISO timestamp with timezone, e.g. 2026-09-14T10:00:00Z")
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value


class Login(Input):
    email: str = Field(max_length=200)
    password: str = Field(min_length=1, max_length=200)


class UserCreate(Input):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(min_length=12, max_length=200)
    role: Role
    mine_ids: list[str] = Field(default_factory=list, max_length=200)
    phone: str = Field(default="", max_length=32)


class MineCreate(Input):
    name: str = Field(min_length=3, max_length=160)
    subsidiary: str = Field(min_length=2, max_length=120)
    state: str = Field(min_length=2, max_length=80)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class CaseCreate(Input):
    mine_id: str
    inspection_id: str | None = None
    title: str = Field(min_length=5, max_length=220)
    description: str = Field(min_length=10, max_length=10000)
    category: Category
    kind: Literal["observation", "violation", "incident"] = "observation"
    severity: int = Field(ge=1, le=5)
    likelihood: int = Field(ge=1, le=5)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    captured_at: datetime

    @model_validator(mode="after")
    def coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Both latitude and longitude are required together")
        if self.captured_at > datetime.now(timezone.utc).replace(tzinfo=None) + __import__('datetime').timedelta(minutes=10):
            raise ValueError("Capture time cannot be in the future")
        return self


class CaseTransition(Input):
    version: int = Field(ge=1)
    action: Literal["assign", "start", "submit_action", "verify", "reject", "close", "reopen"]
    assigned_to: str | None = None
    note: str = Field(default="", max_length=10000)
    due_at: datetime | None = None


class ChecklistItem(Input):
    label: str = Field(min_length=2, max_length=250)
    result: Literal["pending", "pass", "fail", "na"] = "pending"


class InspectionCreate(Input):
    mine_id: str
    title: str = Field(min_length=3, max_length=200)
    officer_id: str
    scheduled_at: datetime
    checklist: list[ChecklistItem] = Field(min_length=1, max_length=50)


class InspectionUpdate(Input):
    version: int = Field(ge=1)
    status: Literal["scheduled", "in_progress", "completed"]
    checklist: list[ChecklistItem] = Field(min_length=1, max_length=50)
    notes: str = Field(default="", max_length=10000)


class ComplianceCreate(Input):
    mine_id: str
    title: str = Field(min_length=3, max_length=220)
    reference: str = Field(default="", max_length=220)
    source_url: str = Field(default="", max_length=2000)
    owner_id: str
    due_at: datetime

    @field_validator("source_url")
    @classmethod
    def url(cls, v):
        if v and not v.startswith("https://"):
            raise ValueError("Source URL must use HTTPS")
        return v


class ComplianceUpdate(Input):
    version: int = Field(ge=1)
    status: Literal["submitted", "compliant", "pending"]
    evidence_id: str | None = None
    notes: str = Field(default="", max_length=10000)


class PermitCreate(Input):
    mine_id: str
    title: str = Field(min_length=3, max_length=220)
    contractor_id: str
    work_type: str = Field(min_length=2, max_length=80)
    starts_at: datetime
    expires_at: datetime
    precautions: str = Field(min_length=10, max_length=10000)

    @model_validator(mode="after")
    def dates(self):
        if self.expires_at <= self.starts_at:
            raise ValueError("Expiry must be after start time")
        return self


class PermitUpdate(Input):
    version: int = Field(ge=1)
    status: Literal["approved", "rejected", "closed"]


class AssetCreate(Input):
    mine_id: str
    name: str = Field(min_length=3, max_length=140)
    kind: str = Field(min_length=2, max_length=60)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class SensorInput(Input):
    mine_id: str
    asset_id: str
    source: str = Field(min_length=2, max_length=80)
    event_id: str = Field(min_length=5, max_length=120)
    metric: Literal["methane", "temperature", "dust", "vibration"]
    value: float = Field(ge=0, le=100000)
    unit: str = Field(min_length=1, max_length=30)
    observed_at: datetime


class AttendanceInput(Input):
    mine_id: str
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class FieldCapture(Input):
    captured_at: datetime
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def capture(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Both coordinates are required together")
        if self.captured_at > datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=10):
            raise ValueError("Capture time cannot be in the future")
        return self


class ProductionCreate(FieldCapture):
    mine_id: str
    work_date: date
    shift: Literal["A", "B", "C"]
    coal_tonnes: Decimal = Field(ge=0, le=1000000, max_digits=12, decimal_places=2)
    dispatch_tonnes: Decimal = Field(ge=0, le=1000000, max_digits=12, decimal_places=2)
    target_tonnes: Decimal = Field(ge=0, le=1000000, max_digits=12, decimal_places=2)
    downtime_minutes: int = Field(default=0, ge=0, le=480)
    notes: str = Field(default="", max_length=10000)

    @model_validator(mode="after")
    def production_date(self):
        if self.work_date > datetime.now(ZoneInfo("Asia/Kolkata")).date():
            raise ValueError("Production date cannot be in the future (India time)")
        return self


class ProductionUpdate(ProductionCreate):
    version: int = Field(ge=1)


class ProductionReview(Input):
    version: int = Field(ge=1)
    action: Literal["approve", "return"]
    note: str = Field(min_length=10, max_length=10000)


class GrievanceCreate(FieldCapture):
    mine_id: str
    title: str = Field(min_length=5, max_length=220)
    description: str = Field(min_length=10, max_length=10000)
    category: Literal["Wages", "Working conditions", "Facilities", "Conduct", "Contract", "Other"]
    priority: Literal["normal", "high", "urgent"] = "normal"


class GrievanceTransition(Input):
    version: int = Field(ge=1)
    action: Literal["assign", "start", "resolve", "close", "reopen", "comment"]
    assigned_to: str | None = None
    due_at: datetime | None = None
    note: str = Field(min_length=10, max_length=10000)


class SyncOperation(Input):
    operation_id: str = Field(min_length=10, max_length=64)
    kind: Literal["create_case", "transition_case", "update_inspection", "create_production", "update_production", "create_grievance", "transition_grievance"]
    entity_id: str | None = None
    payload: dict


class SyncBatch(Input):
    operations: list[SyncOperation] = Field(min_length=1, max_length=50)


class Question(Input):
    mine_id: str
    question: str = Field(min_length=5, max_length=2000)
