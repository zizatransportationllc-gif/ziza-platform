"""Application configuration loaded from environment variables.

All settings are env-driven so dev/prod parity is preserved.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "ziza-api"
    app_version: str = "0.1.0"
    environment: str = "dev"

    # CORS: comma-separated list of allowed origins, e.g.
    # CORS_ORIGINS="http://localhost:3001,http://localhost:3002,http://localhost:3003"
    cors_origins_raw: str = (
        "http://localhost:3001,"
        "http://localhost:3002,"
        "http://localhost:3003"
    )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]


settings = Settings()
