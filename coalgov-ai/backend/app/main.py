import asyncio
import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from .config import settings
from .db import SessionLocal
from .models import Notification
from .security import authenticate
from .services.common import pack
from .routers import auth, cases, governance, documents, intelligence, integrations, operations

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("coalgov")
requests_count = Counter("coalgov_http_requests_total", "HTTP requests", ["method", "route", "status"])
latency = Histogram("coalgov_http_duration_seconds", "HTTP response time", ["route"])
login_attempts = defaultdict(deque)


@asynccontextmanager
async def lifespan(app):
    with SessionLocal() as db:
        db.execute(text("SELECT 1 FROM audit_heads WHERE id=1"))
    yield


app = FastAPI(title="CoalGov AI API", version="1.1.0", lifespan=lifespan,
    description="Mine governance pilot: inspections, compliance, production approvals, grievances and offline field reporting.")
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=True,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type", "X-CoalGov-Client", "X-Telemetry-Key"])


@app.middleware("http")
async def safeguards(request: Request, call_next):
    started = time.monotonic()
    origin = request.headers.get("origin")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and origin and origin not in settings.origins:
        return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
    if request.url.path == "/api/auth/login" and request.method == "POST":
        key = request.client.host if request.client else "unknown"
        attempts = login_attempts[key]
        while attempts and attempts[0] < started - 60:
            attempts.popleft()
        if len(attempts) >= 12:
            return JSONResponse({"detail": "Too many sign-in attempts. Try again in one minute."}, status_code=429, headers={"Retry-After": "60"})
        attempts.append(started)
        if len(login_attempts) > 10000:
            for ip in list(login_attempts):
                if not login_attempts[ip] or login_attempts[ip][-1] < started - 60:
                    del login_attempts[ip]
    size = request.headers.get("content-length", "0")
    if size.isdigit() and int(size) > 11 * 1024 * 1024:
        return JSONResponse({"detail": "Request exceeds 11 MB"}, status_code=413)
    response = await call_next(request)
    route = request.scope.get("route")
    route_label = getattr(route, "path", "unmatched")
    requests_count.labels(request.method, route_label, str(response.status_code)).inc()
    latency.labels(route_label).observe(time.monotonic() - started)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(IntegrityError)
async def integrity_error(request, error):
    return JSONResponse({"detail": "A conflicting or related record already exists. Reload and review your data."}, status_code=409)


@app.exception_handler(StaleDataError)
async def stale_error(request, error):
    return JSONResponse({"detail": "This record changed on another device. Reload it before retrying."}, status_code=409)


for router in [auth.router, cases.router, governance.router, documents.router, intelligence.router, integrations.router, operations.router]:
    app.include_router(router)


@app.get("/api/health", tags=["Operations"])
def health():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok", "version": "1.1.0", "demo_data": settings.seed_demo}


@app.get("/metrics", include_in_schema=False)
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.websocket("/api/ws")
async def live(websocket: WebSocket):
    origin = websocket.headers.get("origin")
    if origin and origin not in settings.origins:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    token = websocket.cookies.get("coalgov_session")
    try:
        if not token:
            message = await asyncio.wait_for(websocket.receive_json(), timeout=5)
            token = message.get("token", "")
        while True:
            with SessionLocal() as db:
                user, _ = authenticate(db, token)
                rows = db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.read == False)
                    .order_by(Notification.created_at.desc()).limit(20)).all()
                payload = {"type": "notifications", "items": [pack(x) for x in rows]}
            await websocket.send_json(payload)
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=10)
            except asyncio.TimeoutError:
                pass
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except HTTPException:
        await websocket.close(code=1008, reason="Session expired")
