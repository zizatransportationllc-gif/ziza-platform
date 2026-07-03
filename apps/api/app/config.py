"""Application configuration loaded from environment variables.

All settings are env-driven so dev/prod parity is preserved.
"""
from pydantic import AliasChoices, Field
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
    jwt_secret: str = Field(
        default="dev-secret-change-in-env",
        validation_alias=AliasChoices("JWT_SECRET", "AUTH_DEV_SECRET"),
    )
    # Shared password for all seeded dev users.
    auth_dev_password: str = "ziza2024"
    # Token TTL in hours (kept for backward compat; overridden by jwt_access_ttl_min).
    auth_dev_token_ttl_hours: int = 24

    # ------------------------------------------------------------------
    # Local account creation — Sprint 49
    # ------------------------------------------------------------------
    # Extra code required to create an admin account via POST /v1/auth/signup.
    # Override this in your .env or GCP secret to protect admin sign-up.
    admin_signup_code: str = "ZIZA-ADMIN-2024"

    # ------------------------------------------------------------------
    # JWT TTL — Sprint 25
    # ------------------------------------------------------------------
    # Access token lifetime in minutes (default 720 min = 12 h — extended for admin UX).
    jwt_access_ttl_min: int = 720
    # Refresh token lifetime in days (default 30 days).
    jwt_refresh_ttl_days: int = 30

    # ------------------------------------------------------------------
    # Firebase / PROD auth (Sprint 3)
    # ------------------------------------------------------------------
    firebase_project_id: str = ""

    # ------------------------------------------------------------------
    # Pricing — base currency: USD, amounts in integer cents (Sprint 66)
    # ------------------------------------------------------------------
    # These are DEFAULTS only — admins override them at runtime via
    # PATCH /v1/admin/settings/pricing (persisted in platform_settings).
    fare_base_cents: int = 250        # base fare / pickup fee ($2.50)
    fare_per_mile_cents: int = 175    # rate per mile ($1.75)
    fare_per_minute_cents: int = 0    # rate per minute ($0.00 = time component off)
    fare_min_cents: int = 250         # minimum fare floor (defaults to base)
    fare_surge_multiplier: float = 1.0  # 1.0 = no surge; set > 1 during peak
    fare_estimate_ttl_minutes: int = 15  # how long an estimate is valid

    # Real road routing for fare estimates (distance + duration).
    # Priority: Mapbox Directions → Google Maps Distance Matrix → Haversine.
    # Mapbox is the project's primary map/routing provider; a public token
    # (pk.*) works for the Directions API. Leave all empty to use the
    # Haversine straight-line fallback.
    mapbox_access_token: str = ""
    google_maps_api_key: str = ""

    # ------------------------------------------------------------------
    # Payment split — taxes, platform fee, Stripe fee estimate (Sprint 70)
    # ------------------------------------------------------------------
    # These are DEFAULTS only — admins override them at runtime via
    # PATCH /v1/admin/settings/payments (persisted in platform_settings).
    #
    # Ride-share: the customer pays fare + a flat per-ride tax/levy; the net
    # (fare − estimated Stripe fee) is split driver/Ziza per ride_driver_split_pct.
    ride_tax_flat_cents: int = 50          # $0.50 flat per-ride levy (NJ TNC assessment)
    ride_driver_split_pct: int = 50        # driver share of the net (50 = 50/50)
    # Road-side (craft): the customer pays bid + platform fee % + sales tax %.
    craft_platform_fee_pct: float = 10.0   # Ziza processing fee added on top of the bid
    craft_tax_pct: float = 6.625           # NJ sales tax on assistance/repair services
    # Stripe processing fee estimate, applied at charge time (reconciled later
    # against the real balance_transaction fee).
    stripe_fee_pct: float = 2.9            # percent of the total charged amount
    stripe_fee_fixed_cents: int = 30       # fixed component ($0.30)

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
    # F1 (Sprint 68): this bucket MUST be PRIVATE in prod — documents are served
    # only via short-lived signed read URLs (see app/storage.py).
    gcs_bucket_name: str = ""
    # TTL (minutes) for signed read URLs of KYC documents.
    gcs_signed_url_ttl_min: int = 15

    # ------------------------------------------------------------------
    # Payment — Sprint 24
    # ------------------------------------------------------------------
    # Which payment backend to use: "mock" | "cinetpay" | "stripe" | "wellsfargo"
    payment_provider: str = "mock"

    # CinetPay (West Africa / Ivory Coast)
    cinetpay_api_key: str = ""
    cinetpay_site_id: str = ""

    # Stripe (international credit/debit cards)
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # Wells Fargo Merchant Services payment gateway (US card acquiring)
    wellsfargo_api_base: str = "https://api.wellsfargo.com/merchant-services/v1"
    wellsfargo_api_key: str = ""
    wellsfargo_merchant_id: str = ""
    wellsfargo_webhook_secret: str = ""

    # Default return URL after payment (override in production)
    payment_return_url: str = "https://app.ziza.ci/payment/return"
    # Webhook URL for payment provider callbacks (Sprint 41)
    # Defaults to empty — CinetPay adapter derives it from payment_return_url
    payment_notify_url: str = ""

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
    # Which payout backend to use:
    #   "mock" | "stripe" (Stripe Connect) | "wellsfargo" (WF Gateway ACH/RTP)
    payout_provider: str = "mock"

    # Wells Fargo Gateway (developer.wellsfargo.com) — outbound bank payments.
    wellsfargo_gateway_base: str = "https://api.wellsfargo.com/payments/v1"
    wellsfargo_gateway_api_key: str = ""
    wellsfargo_funding_account: str = ""   # your WF account to debit
    wellsfargo_payment_rail: str = "ach"   # "ach" | "rtp" | "wire"
    # Default platform commission percentage (integer, e.g. 15 = 15%).
    # Overridden per category via POST /v1/admin/commission.
    default_commission_pct: int = 15

    # Sprint 70 — with the split done at charge time (Connect destination
    # charges), a payee's share is already transferred to their Stripe balance,
    # so the legacy self-service internal withdrawal (payout_requests → batch)
    # would double-pay. It is disabled by default; payees access funds via their
    # Stripe Issuing debit card / automatic Connect payouts. The admin batch
    # endpoints remain for manual corrections of already-approved requests.
    internal_withdrawals_enabled: bool = False

    # ------------------------------------------------------------------
    # WS5 — AML limits (USD cents). Enforced server-side on creation.
    # ------------------------------------------------------------------
    withdrawal_max_single_cents: int = 500_000      # $5,000 per request
    withdrawal_daily_limit_cents: int = 1_000_000   # $10,000 per user per day
    topup_max_single_cents: int = 500_000           # $5,000 per top-up

    # Sprint 69 — Fernet key (urlsafe base64, 32 bytes) for bank-account field
    # encryption at rest. Empty in dev/CI → values stored as-is. REQUIRED in prod.
    bank_encryption_key: str = ""

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

    # ------------------------------------------------------------------
    # Observability — Sentry (Phase 4)
    # ------------------------------------------------------------------
    # Sentry DSN for error tracking. Leave empty to disable (no-op everywhere).
    sentry_dsn: str = ""
    # Fraction of transactions traced for performance (0.0 = errors only).
    sentry_traces_sample_rate: float = 0.0

    def model_post_init(self, __context) -> None:
        if self.environment == "prod":
            if not self.jwt_secret or self.jwt_secret == "dev-secret-change-in-env":
                raise ValueError("JWT_SECRET must be set to a non-default value in prod")
            if len(self.jwt_secret) < 32:
                raise ValueError("JWT_SECRET must be at least 32 characters in prod")
            if not self.firebase_project_id:
                raise ValueError("FIREBASE_PROJECT_ID is required in prod")


settings = Settings()
