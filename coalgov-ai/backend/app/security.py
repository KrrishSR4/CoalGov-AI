from datetime import timedelta
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pwdlib import PasswordHash
from sqlalchemy import select
from .config import settings
from .db import get_db
from .models import User, Mine, AuthSession, now, uid

password_hasher = PasswordHash.recommended()
DUMMY_HASH = password_hasher.hash("dummy-unknown-account-password")
bearer = HTTPBearer(auto_error=False)
GLOBAL_ROLES = {"admin", "management", "regulator"}
MANAGERS = {"admin", "official"}
REPORTERS = {"admin", "official", "officer", "agency", "contractor"}


def authorize(user, roles):
    if user.role not in roles:
        raise HTTPException(403, "Your role cannot perform this action")


def access_mine(db, user, mine_id):
    if not db.get(Mine, mine_id):
        raise HTTPException(404, "Mine not found")
    if user.role not in GLOBAL_ROLES and mine_id not in user.mine_ids:
        raise HTTPException(403, "Mine outside your access scope")


def scoped(query, model, user):
    return query if user.role in GLOBAL_ROLES else query.where(model.mine_id.in_(user.mine_ids))


def member(db, user_id, mine_id, roles=None):
    target = db.get(User, user_id)
    if not target or not target.active:
        raise HTTPException(422, "Select an active user")
    access_mine(db, target, mine_id)
    if roles and target.role not in roles:
        raise HTTPException(422, "Selected user has an unsuitable role")
    return target


def issue_token(db, user):
    jti = uid()
    expires = now() + timedelta(minutes=settings.token_minutes)
    db.add(AuthSession(id=jti, user_id=user.id, expires_at=expires))
    return jwt.encode({"sub": user.id, "jti": jti, "exp": expires, "iat": now(),
                       "iss": "coalgov", "aud": "coalgov-clients"}, settings.jwt_secret, algorithm="HS256")


def authenticate(db, token):
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"],
                          issuer="coalgov", audience="coalgov-clients", options={"require": ["exp", "sub", "jti"]})
        session = db.get(AuthSession, data["jti"])
        user = db.get(User, data["sub"])
        if not session or session.revoked or session.user_id != data["sub"] or session.expires_at < now() or not user or not user.active:
            raise ValueError("Inactive session")
        return user, session
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(401, "Session expired. Please sign in again.")


def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db=Depends(get_db)):
    token = credentials.credentials if credentials else request.cookies.get("coalgov_session")
    if not token:
        raise HTTPException(401, "Sign in required")
    if not credentials and request.method not in {"GET", "HEAD", "OPTIONS"}:
        if request.headers.get("X-CoalGov-Client") != "web":
            raise HTTPException(403, "Missing CSRF request header")
    user, session = authenticate(db, token)
    request.state.session_id = session.id
    return user


def public_user(user):
    return {"id": user.id, "name": user.name, "email": user.email,
            "role": user.role, "mine_ids": user.mine_ids, "active": user.active}

