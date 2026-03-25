import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import barista, barista_menu, health, public_menu, public_orders, public_stores, webhooks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Starting %s", settings.app_name)
        yield
        logger.info("Shutdown %s", settings.app_name)

    app = FastAPI(
        title=settings.app_name,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    if origins == ["*"]:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health.router, prefix="/api/v1")
    app.include_router(public_menu.router, prefix="/api/v1/public")
    app.include_router(public_stores.router, prefix="/api/v1/public")
    app.include_router(public_orders.router, prefix="/api/v1/public")
    app.include_router(webhooks.router, prefix="/api/v1/webhooks")
    app.include_router(barista.router, prefix="/api/v1/barista")
    app.include_router(barista_menu.router, prefix="/api/v1/barista")

    return app


app = create_app()
