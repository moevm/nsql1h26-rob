"""Загрузка тестовых документов из data/json_seed/*.json (Mongo Extended JSON)."""

import mimetypes
from io import BytesIO
from pathlib import Path

from bson import json_util
from gridfs import GridFSBucket

_SEED_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "json_seed"
_GRIDFS_SEED_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "gridfs_seed"
_GRIDFS_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
_INSERT_ORDER = ("groups", "robots", "tasks", "events", "obstacles")


def load_seed_json_if_empty(db) -> None:
    if not _SEED_DIR.is_dir():
        return
    for coll in _INSERT_ORDER:
        if db[coll].count_documents({}) > 0:
            continue
        path = _SEED_DIR / f"{coll}.json"
        if not path.is_file():
            continue
        raw = path.read_text(encoding="utf-8").strip()
        if not raw:
            continue
        docs = json_util.loads(raw)
        if isinstance(docs, dict):
            docs = [docs]
        if docs:
            db[coll].insert_many(docs)


def seed_gridfs_if_empty(db) -> None:
    """Загружает в GridFS все изображения из data/gridfs_seed/ (байты без перекодирования)."""
    if db.fs.files.count_documents({}) > 0:
        return
    if not _GRIDFS_SEED_DIR.is_dir():
        return
    paths = sorted(
        p
        for p in _GRIDFS_SEED_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in _GRIDFS_SUFFIXES
    )
    if not paths:
        return
    bucket = GridFSBucket(db)
    for path in paths:
        data = path.read_bytes()
        ct = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        bucket.upload_from_stream(
            path.name,
            BytesIO(data),
            metadata={"contentType": ct, "seed": True},
        )


def link_seed_events_to_gridfs(db) -> None:
    db.events.update_many({"type": {"$ne": "visual_capture"}}, {"$unset": {"gridFsFileId": ""}})
    seed_files = list(db.fs.files.find({"metadata.seed": True}).sort("filename", 1))
    cap = list(db.events.find({"type": "visual_capture"}).sort("_id", 1))
    for ev in cap:
        db.events.update_one({"_id": ev["_id"]}, {"$unset": {"gridFsFileId": ""}})
    if not seed_files or not cap:
        return
    for fdoc, ev in zip(seed_files, cap):
        db.events.update_one({"_id": ev["_id"]}, {"$set": {"gridFsFileId": fdoc["_id"]}})
