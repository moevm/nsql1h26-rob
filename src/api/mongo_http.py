import json
import re
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from bson.json_util import dumps, loads
from fastapi import HTTPException


def utcnow():
    return datetime.now(timezone.utc)


def oid_or_400(s):
    try:
        return ObjectId(s)
    except InvalidId as exc:
        raise HTTPException(status_code=400, detail=f"Invalid ObjectId: {s}") from exc


def doc_to_jsonable(doc):
    if doc is None:
        return None
    return json.loads(dumps(doc))


def body_to_bson(data):
    if isinstance(data, (dict, list)):
        return loads(dumps(data))
    return data


def icontains(field, q):
    if not q or not q.strip():
        return None
    return {field: {"$regex": re.escape(q.strip()), "$options": "i"}}


def parse_dt(s):
    if not s or not str(s).strip():
        return None
    t = str(s).strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(t)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {s}") from exc


def mongo_validation_error(exc):
    msg = str(exc)
    if hasattr(exc, "details"):
        msg = str(getattr(exc, "details", msg))
    return HTTPException(status_code=422, detail=msg)
