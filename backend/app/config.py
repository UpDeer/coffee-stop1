from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Coffee Stop API"
    debug: bool = False

    database_url: str = "postgresql+psycopg://coffeestop:coffeestop@127.0.0.1:5432/coffeestop"

    # CORS: в проде задать список origin через env (через запятую)
    cors_origins: str = "*"

    # Email (SMTP)
    mail_host: str = "127.0.0.1"
    mail_port: int = 1025
    mail_from: str = "Coffee Stop <no-reply@coffee-stop.local>"
    mail_user: str | None = None
    mail_password: str | None = None
    mail_use_tls: bool = False

    # Tochka API (payment links + acquiringInternetPayment webhook)
    tochka_api_base_url: str = "https://enter.tochka.com"
    tochka_api_bearer_token: str | None = None  # Bearer token for acquiring endpoints
    tochka_customer_code: str | None = None
    tochka_merchant_id: str | None = None
    tochka_payment_purpose: str = "Оплата заказа Coffee Stop"
    tochka_payment_redirect_url: str | None = None
    tochka_payment_fail_redirect_url: str | None = None
    tochka_payment_ttl_minutes: int = 60 * 24
    tochka_payment_modes: str = "card,sbp"  # comma-separated: card,sbp,tinkoff,dolyame...
    tochka_webhook_public_jwk_json: str | None = None  # JWK JSON for RS256 signature verification

    # Evotor Digital Cashbox (fiscalization after payment)
    # В этом репозитории сейчас реализуется архитектура/контроль статусов; реальная интеграция
    # подключается через env и отдельную реализацию отправки sell receipt.
    evotor_integration_mode: str = "disabled"  # disabled | mock_done | mock_failed | real
    evotor_fiscalization_url: str | None = None
    evotor_login: str | None = None
    evotor_password: str | None = None
    evotor_group_code: str | None = None
    evotor_cashier_uuid: str | None = None  # MobCashier cashier_uuid (configured globally in .env)


@lru_cache
def get_settings() -> Settings:
    return Settings()
