import getpass
from sqlalchemy import select
from .db import SessionLocal
from .models import User
from .security import password_hasher
from .services.audit import audit

if __name__ == "__main__":
    name=input("Administrator name: ").strip()
    email=input("Administrator email: ").strip().lower()
    password=getpass.getpass("Password (12+ characters): ")
    confirm=getpass.getpass("Confirm password: ")
    if len(name)<2 or "@" not in email or len(password)<12 or password!=confirm:
        raise SystemExit("Invalid account details or mismatched password")
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.role=="admin",User.active==True)):
            raise SystemExit("An active admin already exists. Use authenticated user management.")
        user=User(name=name,email=email,password_hash=password_hasher.hash(password),role="admin",mine_ids=[])
        db.add(user)
        db.flush()
        audit(db,"bootstrap","admin.created",user.id,payload={"email":email})
        db.commit()
    print("Administrator created")

