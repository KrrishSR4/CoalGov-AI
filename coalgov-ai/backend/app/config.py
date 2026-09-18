from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: str = "development"
    database_url: str = "sqlite:///./data/coalgov.db"
    jwt_secret: str = "local-development-only-change-this-32-char-secret"
    token_minutes: int = 480
    cookie_secure: bool = False
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080"
    seed_demo: bool = False
    demo_password: str = "MineX-Demo-2026!"
    upload_dir: str = "./data/uploads"
    storage_backend: str = "local"
    r2_endpoint: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_bucket: str = "coalgov-evidence"
    redis_url: str = "redis://localhost:6379/0"
    telemetry_key: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    sms_webhook_url: str = ""
    sms_webhook_token: str = ""
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_api_key: str = ""
    llm_model: str = ""
    ml_model_path: str = ""

    @property
    def origins(self):
        return [x.strip() for x in self.allowed_origins.split(",") if x.strip()]


settings = Settings()
if settings.app_env == "production":
    if len(settings.jwt_secret) < 32 or "development" in settings.jwt_secret:
        raise RuntimeError("Production requires a random JWT_SECRET of at least 32 characters")
    if settings.seed_demo or not settings.cookie_secure:
        raise RuntimeError("Production requires SEED_DEMO=false and COOKIE_SECURE=true")
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

