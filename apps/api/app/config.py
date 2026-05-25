"""Application configuration loaded from environment variables.

All settings are env-driven so dev/prod parity is preserved.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "ziza-api"
    app_version: str = "0.2.0"
    environment: str = "dev"  # "dev" | "prod"

    # CORS: comma-separated list of allowed origins
    cors_origins_raw: str = (
        "http://localhost:3001,"
        "http://localhost:3002,"
        "http://localhost:3003"
    )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    # ------------------------------------------------------------------
    # DEV auth (Sprint 2)
    # ------------------------------------------------------------------
    # Secret used to sign/verify dev JWTs.  Override in .env for local dev.
    auth_dev_secret: str = "dev-secret-change-in-env"
    # Shared password for all seeded dev users.
    auth_dev_password: str = "ziza2024"
    # Token TTL in hours.
    auth_dev_token_ttl_hours: int = 24

    # ------------------------------------------------------------------
    # Firebase / PROD auth (Sprint 3)
    # ------------------------------------------------------------------
    firebase_project_id: str = ""

    # ------------------------------------------------------------------
    # Database (Sprint 4)
    # ------------------------------------------------------------------
    # Full async-compatible connection URL.
    # Set to empty string when running without a DB (dev / CI without Postgres).
    # Example (local):  postgresql+asyncpg://ziza:ziza@localhost:5432/ziza
    # Example (Cloud SQL unix socket):
    #   postgresql+asyncpg://ziza:pass@/ziza?host=/cloudsql/proj:region:inst
    database_url: str = ""


settings = Settings()
