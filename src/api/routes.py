from fastapi import APIRouter, Body, HTTPException, Query
from pymongo import ASCENDING

from src.api.mongo_http import doc_to_jsonable, icontains, oid_or_400, parse_dt
from src.api.auth import authenticate, issue_token
from src.db.database import get_db

router = APIRouter()

_MAX_LIMIT = 500
_DEFAULT_LIMIT = 200


def _coll(name):
    return get_db()[name]


@router.post("/api/auth/login", tags=["auth"])
def auth_login(body=Body(...)):
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")
    if not username or not password:
        raise HTTPException(status_code=400, detail="username and password are required")
    user = authenticate(username, password)
    token = issue_token(username=user["username"], role=user["role"])
    return {"access_token": token, "token_type": "bearer", "role": user["role"], "username": user["username"]}


@router.get("/api/groups", tags=["entities"])
def list_groups(
    skip=Query(0, ge=0),
    limit=Query(_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    name=Query(None, description="Подстрока в name (без учёта регистра)"),
    description=Query(None, description="Подстрока в description (без учёта регистра)"),
    status=Query(None, description="Точное значение status"),
    doc_id=Query(None, alias="docId", description="Точное совпадение _id"),
    created_after=Query(None),
    created_before=Query(None),
    updated_after=Query(None),
    updated_before=Query(None),
):
    q = {"$and": []}
    for cond in (
        icontains("name", name),
        icontains("description", description),
    ):
        if cond:
            q["$and"].append(cond)
    if doc_id and doc_id.strip():
        q["$and"].append({"_id": oid_or_400(doc_id.strip())})
    if status:
        q["$and"].append({"status": status})
    ca, cb = parse_dt(created_after), parse_dt(created_before)
    if ca:
        q["$and"].append({"createdAt": {"$gte": ca}})
    if cb:
        q["$and"].append({"createdAt": {"$lte": cb}})
    ua, ub = parse_dt(updated_after), parse_dt(updated_before)
    if ua:
        q["$and"].append({"updatedAt": {"$gte": ua}})
    if ub:
        q["$and"].append({"updatedAt": {"$lte": ub}})
    if not q["$and"]:
        del q["$and"]
        filt = {}
    else:
        filt = q
    cur = _coll("groups").find(filt).sort("createdAt", ASCENDING).skip(skip).limit(limit)
    return [doc_to_jsonable(d) for d in cur]


@router.get("/api/groups/{doc_id}", tags=["entities"])
def get_group(doc_id):
    doc = _coll("groups").find_one({"_id": oid_or_400(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc_to_jsonable(doc)
