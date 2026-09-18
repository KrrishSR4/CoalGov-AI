import os
import tempfile
import itertools
import pytest

temporary=tempfile.TemporaryDirectory(prefix="coalgov-tests-")
os.environ["DATABASE_URL"]=os.environ.get("COALGOV_TEST_DATABASE_URL", "sqlite:///"+temporary.name+"/test.db")
os.environ["UPLOAD_DIR"]=temporary.name+"/uploads"
os.environ["SEED_DEMO"]="true"
os.environ["APP_ENV"]="development"
os.environ["JWT_SECRET"]="test-session-signing-key-at-least-32-characters"
os.environ["SMTP_HOST"]=""
os.environ["SMS_WEBHOOK_URL"]=""
os.environ["LLM_API_KEY"]=""
os.environ["STORAGE_BACKEND"]="local"

from fastapi.testclient import TestClient
from app.main import app
from app.init_db import initialize


@pytest.fixture(scope="session",autouse=True)
def database():
    initialize(seed=True)
    yield
    temporary.cleanup()


@pytest.fixture
def clients(database):
    opened=[]
    counter=itertools.count(1)
    def actor(role):
        # Distinct simulated clients keep the actual login throttling policy active.
        c=TestClient(app,client=("test-"+os.urandom(8).hex(),50000+next(counter)))
        c.__enter__()
        result=c.post('/api/auth/login',json={"email":role+"@coalgov.demo","password":"MineX-Demo-2026!"})
        assert result.status_code==200,result.text
        c.headers.update({"Authorization":"Bearer "+result.json()["access_token"]})
        opened.append(c)
        return c
    yield actor
    for c in opened:c.__exit__(None,None,None)

