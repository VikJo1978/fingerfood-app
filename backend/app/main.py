from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes import drafts, frontend, items, offer, ui_offer

app = FastAPI(title="Fingerfood Angebote API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(items.router)
app.include_router(offer.router)
app.include_router(ui_offer.router)
app.include_router(drafts.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Keep this catch-all last so it can never shadow API routes.
app.include_router(frontend.router)
