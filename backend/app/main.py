from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.employee_auth_config import validate_employee_auth_settings
from app.routes import (
    drafts,
    frontend,
    items,
    offer,
    ui_handoff,
    ui_offer,
    ui_recommendation,
    ui_session,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    validate_employee_auth_settings(
        configurator_employee_auth_mode=settings.configurator_employee_auth_mode,
        core_employee_introspection_url=settings.core_employee_introspection_url,
        core_office_api_url=settings.core_office_api_url,
        employee_introspection_service_token=settings.employee_introspection_service_token,
        configurator_handoff_service_token=settings.configurator_handoff_service_token,
        core_office_api_token=settings.core_office_api_token,
    )
    yield


app = FastAPI(
    title="Fingerfood Angebote API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(items.router)
app.include_router(offer.router)
app.include_router(ui_session.router)
app.include_router(ui_handoff.router)
app.include_router(ui_offer.router)
app.include_router(ui_recommendation.router)
app.include_router(drafts.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Keep this catch-all last so it can never shadow API routes.
app.include_router(frontend.router)
