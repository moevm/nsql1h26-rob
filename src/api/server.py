from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from src.api.routes import router as api_router
from src.api.auth import decode_token

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_DIST = _REPO_ROOT / "frontend" / "dist"
_ASSETS = _DIST / "assets"

app = FastAPI(title="Robot Mission Control API")
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auth_middleware(request, call_next):
    path = request.url.path
    public_api = (
        path == "/api/health"
        or path == "/api/auth/login"
        or (path.startswith("/api/gridfs/files/") and path.endswith("/download"))
    )
    if path.startswith("/api/") and not public_api:
        auth = request.headers.get("authorization") or ""
        if not auth.lower().startswith("bearer "):
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)
        token = auth.split(" ", 1)[1].strip()
        try:
            request.state.user = decode_token(token)
        except Exception as exc:
            detail = exc.detail if hasattr(exc, "detail") else "Invalid token"
            return JSONResponse({"detail": detail}, status_code=401)
    return await call_next(request)


@app.get("/api/health")
def api_health():
    return {"ok": True}


def _mount_static():
    if not _DIST.is_dir():
        return
    if _ASSETS.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_ASSETS)), name="assets")


_mount_static()


@app.get("/")
def spa_index():
    index = _DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    return PlainTextResponse(
        "Сборка фронта не найдена (frontend/dist). Нужно выполнить: cd frontend && npm install && npm run build",
        status_code=503,
    )
