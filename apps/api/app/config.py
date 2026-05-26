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
    # Token TTL in hours (kept for backward compat; overridden by jwt_access_ttl_min).
    auth_dev_token_ttl_hours: int = 24

    # ------------------------------------------------------------------
    # JWT TTL — Sprint 25
    # ------------------------------------------------------------------
    # Access token lifetime in minutes (default 15 min — Sprint 25).
    jwt_access_ttl_min: int = 15
    # Refresh token lifetime in days (default 30 days).
    jwt_refresh_ttl_days: int = 30

    # ------------------------------------------------------------------
    # Firebase / PROD auth (Sprint 3)
    # ------------------------------------------------------------------
    firebase_project_id: str = ""

    # ------------------------------------------------------------------
    # Pricing — Sprint 5 (currency: XOF, West African CFA Franc)
    # ------------------------------------------------------------------
    fare_base_xof: int = 500          # minimum / base fare (~$0.85)
    fare_per_km_xof: int = 150        # rate per km (~$0.25)
    fare_surge_multiplier: float = 1.0  # 1.0 = no surge; set > 1 during peak
    fare_estimate_ttl_minutes: int = 15  # how long an estimate is valid

    # Optional: Google Maps Distance Matrix API key for real road distances.
    # Leave empty to use the Haversine straight-line fallback.
    google_maps_api_key: str = ""

    # ------------------------------------------------------------------
    # Database (Sprint 4)
    # ------------------------------------------------------------------
    # Full async-compatible connection URL.
    # Set to empty string when running without a DB (dev / CI without Postgres).
    # Example (local):  postgresql+asyncpg://ziza:ziza@localhost:5432/ziza
    # Example (Cloud SQL unix socket):
    #   postgresql+asyncpg://ziza:pass@/ziza?host=/cloudsql/proj:region:inst
    database_url: str = ""

    # ------------------------------------------------------------------
    # Rate limiting — Sprint 25
    # ------------------------------------------------------------------
    # Set to True in production to enforce per-route request limits.
    # Left False in dev/CI so existing tests are not rate-limited.
    rate_limit_enabled: bool = False

    # ------------------------------------------------------------------
    # Cloud Storage — Sprint 25 (document upload)
    # ------------------------------------------------------------------
    # GCS bucket name for driver KYC documents.
    # Leave empty to use mock URLs (dev / CI).
    gcs_bucket_name: str = ""

    # ------------------------------------------------------------------
    # Payment — Sprint 24
    # ------------------------------------------------------------------
    # Which payment backend to use: "mock" | "cinetpay" | "stripe"
    payment_provider: str = "mock"

    # CinetPay (West Africa / Ivory Coast)
    cinetpay_api_key: str = ""
    cinetpay_site_id: str = ""

    # Stripe (international credit/debit cards)
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # Default return URL after payment (override in production)
    payment_return_url: str = "https://app.ziza.ci/payment/return"

    # ------------------------------------------------------------------
    # Notifications — Sprint 26
    # ------------------------------------------------------------------
    # SendGrid transactional email
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = "noreply@ziza.ci"

    # AfricasTalking SMS (West Africa coverage)
    africas_talking_api_key: str = ""
    africas_talking_username: str = "sandbox"

    # FCM credentials path or JSON string (reuses firebase-admin from Sprint 3)
    # Leave empty to skip FCM channel registration at startup.
    fcm_credentials_json: str = ""

    # ------------------------------------------------------------------
    # Payout batch — Sprint 29
    # ------------------------------------------------------------------
    # Which payout backend to use: "mock" | "orange_money"
    payout_provider: str = "mock"
    # Default platform commission percentage (integer, e.g. 15 = 15%).
    # Overridden per category via POST /v1/admin/commission.
    default_commission_pct: int = 15

    # ------------------------------------------------------------------
    # Redis cache — Sprint 31
    # ------------------------------------------------------------------
    # Redis URL (e.g. redis://localhost:6379/0 or rediss:// for TLS).
    # Leave empty to disable caching (dev / CI without Redis).
    redis_url: str = ""
    # Set to True to enable Redis caching in production.
    cache_enabled: bool = False
    # TTL for estimate cache entries (minutes).
    estimate_cache_ttl_minutes: int = 15

    # ------------------------------------------------------------------
    # SRE — Sprint 31
    # ------------------------------------------------------------------
    # Slack webhook URL for error alerts. Leave empty to disable.
    slack_webhook_url: str = ""

    # ------------------------------------------------------------------
    # Dispatch — Sprint 31
    # ------------------------------------------------------------------
    # Maximum radius (km) for dispatch filtering when driver has a position.
    dispatch_radius_km: float = 15.0


settings = Settings()
