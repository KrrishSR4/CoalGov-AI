from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy import select
from ..db import get_db
from ..models import User, Mine, AuthSession
from ..schemas import Login, UserCreate
from ..security import current_user, public_user, password_hasher, DUMMY_HASH, issue_token, authorize, GLOBAL_ROLES
from ..config import settings
from ..services.audit import audit

router = APIRouter(prefix="/api", tags=["Identity"])


@router.post("/auth/login")
def login(data: Login, response: Response, db=Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    valid = password_hasher.verify(data.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid or not user.active:
        raise HTTPException(401, "Email or password is incorrect")
    token = issue_token(db, user)
    audit(db, user, "auth.login", user.id)
    db.commit()
    response.set_cookie("coalgov_session", token, httponly=True, secure=settings.cookie_secure,
                        samesite="strict", max_age=settings.token_minutes * 60, path="/")
    return {"access_token": token, "token_type": "bearer", "user": public_user(user)}


@router.get("/auth/me")
def me(user=Depends(current_user)):
    return public_user(user)


@router.post("/auth/logout")
def logout(request: Request, response: Response, user=Depends(current_user), db=Depends(get_db)):
    db.get(AuthSession, request.state.session_id).revoked = True
    audit(db, user, "auth.logout", user.id)
    db.commit()
    response.delete_cookie("coalgov_session", path="/")
    return {"ok": True}


@router.get("/users")
def users(user=Depends(current_user), db=Depends(get_db)):
    people = db.scalars(select(User).where(User.active == True)).all()
    if user.role == "contractor":
        people = [u for u in people if u.id == user.id]
    elif user.role not in GLOBAL_ROLES:
        people = [u for u in people if set(u.mine_ids) & set(user.mine_ids) or u.id == user.id]
    return [public_user(u) for u in people]


@router.post("/users", status_code=201)
def add_user(data: UserCreate, user=Depends(current_user), db=Depends(get_db)):
    authorize(user, {"admin"})
    for mine_id in data.mine_ids:
        if not db.get(Mine, mine_id):
            raise HTTPException(422, "Unknown mine in access scope")
    if data.role not in GLOBAL_ROLES and not data.mine_ids:
        raise HTTPException(422, "This role needs at least one assigned mine")
    created = User(**data.model_dump(exclude={"password"}), password_hash=password_hasher.hash(data.password))
    created.email = created.email.lower()
    db.add(created)
    db.flush()
    audit(db, user, "user.created", created.id, payload=public_user(created))
    db.commit()
    return public_user(created)


@router.post("/users/{user_id}/deactivate")
def deactivate(user_id: str, user=Depends(current_user), db=Depends(get_db)):
    authorize(user, {"admin"})
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == user.id:
        raise HTTPException(422, "You cannot deactivate your own account")
    target.active = False
    audit(db, user, "user.deactivated", target.id)
    db.commit()
    return {"ok": True}

