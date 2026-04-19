from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes import items, offer

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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
