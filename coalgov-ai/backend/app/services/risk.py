from datetime import timedelta
from sqlalchemy import select, func
from ..models import Case, now


def score(db, mine_id, category, severity, likelihood, due_at=None, exclude_id=None):
    query = select(func.count()).select_from(Case).where(Case.mine_id == mine_id,
        Case.category == category, Case.created_at >= now() - timedelta(days=30))
    if exclude_id:
        query = query.where(Case.id != exclude_id)
    repeat = db.scalar(query) or 0
    base = severity * likelihood * 3
    recurrence = min(repeat * 3, 15)
    overdue = 10 if due_at and due_at < now() else 0
    return min(100, base + recurrence + overdue), [
        {"factor": "Severity × likelihood", "points": base, "detail": f"{severity}/5 × {likelihood}/5 × 3"},
        {"factor": "Repeat observations", "points": recurrence, "detail": f"{repeat} in this category and mine over 30 days"},
        {"factor": "Overdue action", "points": overdue, "detail": "10 points when overdue"}]


def statistical_anomaly(values, value):
    if len(values) < 10:
        return False, "Collect at least 10 comparable readings before statistical detection"
    import numpy as np
    center = float(np.median(values))
    mad = float(np.median(np.abs(np.asarray(values) - center)))
    deviation = abs(value - center) / max(1.4826 * mad, abs(center) * 0.05, 0.01)
    return deviation > 3.5, f"Robust deviation {deviation:.2f}; baseline median {center:.2f}; operational review required"
