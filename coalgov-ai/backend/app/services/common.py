from datetime import datetime
from decimal import Decimal
from sqlalchemy.inspection import inspect
from fastapi import HTTPException


def pack(obj, exclude=()):
    result = {}
    for col in inspect(obj).mapper.column_attrs:
        if col.key in exclude or col.key == "password_hash":
            continue
        value = getattr(obj, col.key)
        result[col.key] = value.isoformat() + "Z" if isinstance(value, datetime) else float(value) if isinstance(value, Decimal) else value
    return result


def checked(db, model, entity_id):
    if entity_id is None:
        raise HTTPException(404, "Record not found")
    value = db.get(model, entity_id)
    if value is None:
        raise HTTPException(404, "Record not found")
    return value


def versioned(obj, version):
    if obj.version != version:
        raise HTTPException(409, detail={"message": "Record changed on another device. Review current data before retrying.", "current": pack(obj)})
