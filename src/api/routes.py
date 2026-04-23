import re
from datetime import datetime

from fastapi import APIRouter, Body, HTTPException, Query
from pymongo import ASCENDING
from pymongo.errors import OperationFailure

from src.api.mongo_http import (
    body_to_bson,
    doc_to_jsonable,
    icontains,
    mongo_validation_error,
    oid_or_400,
    parse_dt,
    utcnow,
)
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


@router.post("/api/groups", status_code=201, tags=["entities"])
def create_group(body=Body(...)):
    if "name" not in body or "status" not in body:
        raise HTTPException(status_code=400, detail="name and status are required")
    name = str(body.get("name") or "").strip()
    status = str(body.get("status") or "").strip()
    if not name or not status:
        raise HTTPException(status_code=400, detail="name and status are required")
    now = utcnow()
    doc = {
        "name": name,
        "description": body.get("description"),
        "status": status,
        "createdAt": parse_dt(body["createdAt"]) if body.get("createdAt") else now,
        "updatedAt": parse_dt(body["updatedAt"]) if body.get("updatedAt") else now,
    }
    try:
        res = _coll("groups").insert_one(doc)
    except OperationFailure as e:
        raise mongo_validation_error(e) from e
    doc["_id"] = res.inserted_id
    return doc_to_jsonable(doc)


@router.patch("/api/groups/{doc_id}", tags=["entities"])
def patch_group(doc_id, body=Body(...)):
    _id = oid_or_400(doc_id)
    existing = _coll("groups").find_one({"_id": _id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    patch = {k: v for k, v in body.items() if k != "_id"}
    if "name" in patch and not str(patch.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="name is required")
    if "status" in patch and not str(patch.get("status") or "").strip():
        raise HTTPException(status_code=400, detail="status is required")
    if "createdAt" in patch and isinstance(patch["createdAt"], str):
        patch["createdAt"] = parse_dt(patch["createdAt"])
    if "updatedAt" in patch and isinstance(patch["updatedAt"], str):
        patch["updatedAt"] = parse_dt(patch["updatedAt"])
    patch.setdefault("updatedAt", utcnow())
    merged = {**existing, **patch}
    merged["_id"] = _id
    try:
        _coll("groups").replace_one({"_id": _id}, merged)
    except OperationFailure as e:
        raise mongo_validation_error(e) from e
    return doc_to_jsonable(_coll("groups").find_one({"_id": _id}))


@router.delete("/api/groups/{doc_id}", status_code=204, tags=["entities"])
def delete_group(doc_id):
    res = _coll("groups").delete_one({"_id": oid_or_400(doc_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/robots", tags=["entities"])
def list_robots(
    skip=Query(0, ge=0),
    limit=Query(_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    name=Query(None),
    model=Query(None),
    group_name=Query(None, alias="groupName"),
    comments=Query(None),
    group_id=Query(None, alias="groupId"),
    doc_id=Query(None, alias="docId", description="Точное совпадение _id"),
    scan_radius_min=Query(None, alias="scanRadiusMin"),
    scan_radius_max=Query(None, alias="scanRadiusMax"),
    weight_min=Query(None, alias="weightMin"),
    weight_max=Query(None, alias="weightMax"),
    created_after=Query(None),
    created_before=Query(None),
    updated_after=Query(None),
    updated_before=Query(None),
):
    parts = []
    for c in (
        icontains("name", name),
        icontains("model", model),
        icontains("groupName", group_name),
        icontains("comments", comments),
    ):
        if c:
            parts.append(c)
    if doc_id and doc_id.strip():
        parts.append({"_id": oid_or_400(doc_id.strip())})
    if group_id:
        parts.append({"groupId": oid_or_400(group_id)})
    if scan_radius_min is not None or scan_radius_max is not None:
        r = {}
        if scan_radius_min is not None:
            r["$gte"] = scan_radius_min
        if scan_radius_max is not None:
            r["$lte"] = scan_radius_max
        parts.append({"scanRadius": r})
    if weight_min is not None or weight_max is not None:
        w = {}
        if weight_min is not None:
            w["$gte"] = weight_min
        if weight_max is not None:
            w["$lte"] = weight_max
        parts.append({"weight": w})
    ca, cb = parse_dt(created_after), parse_dt(created_before)
    if ca:
        parts.append({"createdAt": {"$gte": ca}})
    if cb:
        parts.append({"createdAt": {"$lte": cb}})
    ua, ub = parse_dt(updated_after), parse_dt(updated_before)
    if ua:
        parts.append({"updatedAt": {"$gte": ua}})
    if ub:
        parts.append({"updatedAt": {"$lte": ub}})
    filt = {"$and": parts} if parts else {}
    cur = _coll("robots").find(filt).sort("createdAt", ASCENDING).skip(skip).limit(limit)
    return [doc_to_jsonable(d) for d in cur]


@router.get("/api/robots/{doc_id}", tags=["entities"])
def get_robot(doc_id):
    doc = _coll("robots").find_one({"_id": oid_or_400(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc_to_jsonable(doc)


@router.post("/api/robots", status_code=201, tags=["entities"])
def create_robot(body=Body(...)):
    raw = body_to_bson(body)
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Body must be an object")
    if "name" not in raw or "model" not in raw or "groupId" not in raw:
        raise HTTPException(status_code=400, detail="name, model and groupId are required")
    if not str(raw.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="name is required")
    if not str(raw.get("model") or "").strip():
        raise HTTPException(status_code=400, detail="model is required")
    if raw.get("scanRadius") is None:
        raise HTTPException(status_code=400, detail="scanRadius is required")
    if raw.get("weight") is None:
        raise HTTPException(status_code=400, detail="weight is required")

    def _int(v):
        if isinstance(v, bool):
            raise HTTPException(status_code=400, detail="Invalid int")
        if isinstance(v, int):
            return v
        if isinstance(v, float) and v.is_integer():
            return int(v)
        raise HTTPException(status_code=400, detail="Invalid int")

    def _num(v):
        if isinstance(v, bool):
            raise HTTPException(status_code=400, detail="Invalid number")
        if isinstance(v, (int, float)):
            return float(v)
        raise HTTPException(status_code=400, detail="Invalid number")
    gid = raw["groupId"]
    if isinstance(gid, str):
        gid = oid_or_400(gid)
    group = _coll("groups").find_one({"_id": gid})
    if not group:
        raise HTTPException(status_code=400, detail="groupId not found")
    now = utcnow()

    def _dt(val, default):
        if val is None:
            return default
        if isinstance(val, datetime):
            return val
        if isinstance(val, str):
            return parse_dt(val) or default
        return default

    doc = {
        "name": str(raw["name"]).strip(),
        "model": str(raw["model"]).strip(),
        "groupId": gid,
        "groupName": raw.get("groupName") or group.get("name"),
        "scanRadius": _num(raw.get("scanRadius")),
        "weight": _int(raw.get("weight")),
        "comments": raw.get("comments"),
        "createdAt": _dt(raw.get("createdAt"), now),
        "updatedAt": _dt(raw.get("updatedAt"), now),
    }
    try:
        res = _coll("robots").insert_one(doc)
    except OperationFailure as e:
        raise mongo_validation_error(e) from e
    doc["_id"] = res.inserted_id
    return doc_to_jsonable(doc)


@router.patch("/api/robots/{doc_id}", tags=["entities"])
def patch_robot(doc_id, body=Body(...)):
    _id = oid_or_400(doc_id)
    existing = _coll("robots").find_one({"_id": _id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    raw = body_to_bson(body)
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Body must be an object")
    patch = {k: v for k, v in raw.items() if k != "_id"}
    if "name" in patch and not str(patch.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="name is required")
    if "model" in patch and not str(patch.get("model") or "").strip():
        raise HTTPException(status_code=400, detail="model is required")
    if "scanRadius" in patch:
        if patch.get("scanRadius") is None:
            raise HTTPException(status_code=400, detail="scanRadius is required")
        v = patch.get("scanRadius")
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise HTTPException(status_code=400, detail="Invalid number")
        patch["scanRadius"] = float(v)
    if "weight" in patch:
        v = patch.get("weight")
        if v is None:
            raise HTTPException(status_code=400, detail="weight is required")
        if isinstance(v, bool):
            raise HTTPException(status_code=400, detail="Invalid int")
        if isinstance(v, int):
            patch["weight"] = v
        elif isinstance(v, float) and v.is_integer():
            patch["weight"] = int(v)
        else:
            raise HTTPException(status_code=400, detail="Invalid int")
    if "groupId" in patch:
        gid = patch["groupId"]
        if isinstance(gid, str):
            gid = oid_or_400(gid)
        patch["groupId"] = gid
        g = _coll("groups").find_one({"_id": gid})
        if not g:
            raise HTTPException(status_code=400, detail="groupId not found")
        patch.setdefault("groupName", g.get("name"))
    for key in ("createdAt", "updatedAt"):
        if key in patch and isinstance(patch[key], str):
            patch[key] = parse_dt(patch[key])
    patch.setdefault("updatedAt", utcnow())
    merged = {**existing, **patch}
    merged["_id"] = _id
    try:
        _coll("robots").replace_one({"_id": _id}, merged)
    except OperationFailure as e:
        raise mongo_validation_error(e) from e
    return doc_to_jsonable(_coll("robots").find_one({"_id": _id}))


@router.delete("/api/robots/{doc_id}", status_code=204, tags=["entities"])
def delete_robot(doc_id):
    res = _coll("robots").delete_one({"_id": oid_or_400(doc_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/tasks", tags=["entities"])
def list_tasks(
    skip=Query(0, ge=0),
    limit=Query(_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    name=Query(None),
    group_name=Query(None, alias="groupName"),
    task_type=Query(None, alias="type"),
    task_status=Query(None, alias="taskStatus"),
    group_id=Query(None, alias="groupId"),
    doc_id=Query(None, alias="docId", description="Точное совпадение _id"),
    robot_id=Query(None, alias="robotId", description="Любой робот в executionRobots"),
    radius_min=Query(None, alias="radiusMin", description="taskDetails.radius >= ... (для scanRadius)"),
    radius_max=Query(None, alias="radiusMax", description="taskDetails.radius <= ... (для scanRadius)"),
    radius_m_min=Query(None, alias="radiusMMin", include_in_schema=False),
    radius_m_max=Query(None, alias="radiusMMax", include_in_schema=False),
    image_filename=Query(None, alias="imageFilename", description="Имя картинки (fs.files.filename), связанной с visual_capture событиями этой task"),
    created_after=Query(None),
    created_before=Query(None),
    updated_after=Query(None),
    updated_before=Query(None),
):
    parts = []
    for c in (icontains("name", name), icontains("groupName", group_name)):
        if c:
            parts.append(c)
    if task_type:
        parts.append({"type": task_type})
    if task_status:
        parts.append({"taskStatus": task_status})
    if doc_id and doc_id.strip():
        parts.append({"_id": oid_or_400(doc_id.strip())})
    if group_id:
        parts.append({"groupId": oid_or_400(group_id)})
    if robot_id:
        rid = oid_or_400(robot_id)
        parts.append({"executionRobots": {"$elemMatch": {"robotId": rid}}})

    rmin = radius_min if radius_min is not None else radius_m_min
    rmax = radius_max if radius_max is not None else radius_m_max
    if rmin is not None or rmax is not None:
        r = {}
        if rmin is not None:
            r["$gte"] = rmin
        if rmax is not None:
            r["$lte"] = rmax
        parts.append({"taskDetails.radius": r})

    ca, cb = parse_dt(created_after), parse_dt(created_before)
    if ca:
        parts.append({"createdAt": {"$gte": ca}})
    if cb:
        parts.append({"createdAt": {"$lte": cb}})
    ua, ub = parse_dt(updated_after), parse_dt(updated_before)
    if ua:
        parts.append({"updatedAt": {"$gte": ua}})
    if ub:
        parts.append({"updatedAt": {"$lte": ub}})

    base_filt = {"$and": parts} if parts else {}
    if not image_filename or not image_filename.strip():
        cur = _coll("tasks").find(base_filt).sort("createdAt", ASCENDING).skip(skip).limit(limit)
        return [doc_to_jsonable(d) for d in cur]

    rx = re.escape(image_filename.strip())
    pipeline = [
        {"$match": base_filt},
        {
            "$lookup": {
                "from": "events",
                "let": {"tid": "$_id"},
                "pipeline": [
                    {"$match": {"$expr": {"$eq": ["$taskId", "$$tid"]}}},
                    {"$match": {"type": "visual_capture", "gridFsFileId": {"$ne": None}}},
                    {"$project": {"gridFsFileId": 1}},
                ],
                "as": "_evs",
            }
        },
        {"$unwind": "$_evs"},
        {
            "$lookup": {
                "from": "fs.files",
                "localField": "_evs.gridFsFileId",
                "foreignField": "_id",
                "as": "_files",
            }
        },
        {"$unwind": "$_files"},
        {"$match": {"_files.filename": {"$regex": rx, "$options": "i"}}},
        {"$sort": {"createdAt": 1}},
        {"$skip": skip},
        {"$limit": limit},
        {"$unset": ["_evs", "_files"]},
    ]
    cur = _coll("tasks").aggregate(pipeline)
    return [doc_to_jsonable(d) for d in cur]


@router.get("/api/tasks/{doc_id}", tags=["entities"])
def get_task(doc_id):
    doc = _coll("tasks").find_one({"_id": oid_or_400(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc_to_jsonable(doc)


@router.post("/api/tasks", status_code=201, tags=["entities"])
def create_task(body=Body(...)):
    raw = body_to_bson(body)
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Body must be an object")
    for req in ("groupId", "type", "taskStatus"):
        if req not in raw:
            raise HTTPException(status_code=400, detail=f"{req} is required")
    if not str(raw.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="name is required")
    gid = raw["groupId"]
    if isinstance(gid, str):
        gid = oid_or_400(gid)
    group = _coll("groups").find_one({"_id": gid})
    if not group:
        raise HTTPException(status_code=400, detail="groupId not found")
    now = utcnow()
    def _int(v):
        if isinstance(v, bool):
            raise HTTPException(status_code=400, detail="Invalid int")
        if isinstance(v, int):
            return v
        if isinstance(v, float) and v.is_integer():
            return int(v)
        raise HTTPException(status_code=400, detail="Invalid int")

    def _task_details(task_type, td):
        if not isinstance(td, dict):
            raise HTTPException(status_code=400, detail="taskDetails must be an object")
        if task_type == "moveToTarget":
            tp = td.get("targetPosition")
            if not isinstance(tp, dict):
                raise HTTPException(status_code=400, detail="targetPosition required")
            return {"targetPosition": {"x": _int(tp.get("x")), "y": _int(tp.get("y"))}}
        if task_type == "patrol":
            route = td.get("route")
            if not isinstance(route, list) or not route:
                raise HTTPException(status_code=400, detail="route required")
            pts = []
            for p in route:
                if not isinstance(p, dict):
                    raise HTTPException(status_code=400, detail="route points must be objects")
                pts.append({"x": _int(p.get("x")), "y": _int(p.get("y"))})
            until = td.get("until")
            if isinstance(until, str):
                until = parse_dt(until)
            if not isinstance(until, datetime):
                raise HTTPException(status_code=400, detail="until required")
            return {"route": pts, "until": until}
        if task_type == "scanRadius":
            center = td.get("center")
            if not isinstance(center, dict):
                raise HTTPException(status_code=400, detail="center required")
            return {
                "center": {"x": _int(center.get("x")), "y": _int(center.get("y"))},
                "radius": _int(td.get("radius")),
            }
        if task_type == "custom":
            params = td.get("parameters")
            if not isinstance(params, str):
                raise HTTPException(status_code=400, detail="parameters required")
            if len(params) > 512:
                raise HTTPException(status_code=400, detail="parameters too long")
            return {"parameters": params}
        raise HTTPException(status_code=400, detail="Invalid type")

    doc = {
        "name": str(raw.get("name") or "").strip(),
        "groupId": gid,
        "groupName": raw.get("groupName") or group.get("name"),
        "type": raw["type"],
        "taskStatus": raw["taskStatus"],
        "taskDetails": _task_details(str(raw["type"]), raw.get("taskDetails")),
        "executionRobots": raw.get("executionRobots") or [],
        "plannedRoute": raw.get("plannedRoute"),
        "startTime": now,
        "endTime": None,
        "createdAt": raw.get("createdAt") or now,
        "updatedAt": raw.get("updatedAt") or now,
    }
    for key in ("createdAt", "updatedAt"):
        if isinstance(doc.get(key), str):
            doc[key] = parse_dt(doc[key])
    if doc.get("executionRobots"):
        for item in doc["executionRobots"]:
            if isinstance(item.get("robotId"), str):
                item["robotId"] = oid_or_400(item["robotId"])
            if isinstance(item.get("assignedAt"), str):
                item["assignedAt"] = parse_dt(item["assignedAt"])
            if item.get("removedAt") and isinstance(item["removedAt"], str):
                item["removedAt"] = parse_dt(item["removedAt"])
    try:
        res = _coll("tasks").insert_one(doc)
    except OperationFailure as e:
        raise mongo_validation_error(e) from e
    doc["_id"] = res.inserted_id
    try:
        _coll("events").insert_one(
            {
                "robotId": None,
                "taskId": doc["_id"],
                "type": "task_created",
                "message": "Task created",
                "timestamp": utcnow(),
                "createdAt": utcnow(),
            }
        )
    except Exception:
        pass
    return doc_to_jsonable(doc)


@router.patch("/api/tasks/{doc_id}", tags=["entities"])
def patch_task(doc_id, body=Body(...)):
    _id = oid_or_400(doc_id)
    existing = _coll("tasks").find_one({"_id": _id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    raw = body_to_bson(body)
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Body must be an object")
    patch = {k: v for k, v in raw.items() if k != "_id"}
    if "name" in patch and not str(patch.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="name is required")
    if "type" in patch and not isinstance(patch["type"], str):
        raise HTTPException(status_code=400, detail="type must be a string")
    if "taskDetails" in patch:
        t = str(patch.get("type") or existing.get("type") or "")

        def _int(v):
            if isinstance(v, bool):
                raise HTTPException(status_code=400, detail="Invalid int")
            if isinstance(v, int):
                return v
            if isinstance(v, float) and v.is_integer():
                return int(v)
            raise HTTPException(status_code=400, detail="Invalid int")

        def _task_details(task_type, td):
            if not isinstance(td, dict):
                raise HTTPException(status_code=400, detail="taskDetails must be an object")
            if task_type == "moveToTarget":
                tp = td.get("targetPosition")
                if not isinstance(tp, dict):
                    raise HTTPException(status_code=400, detail="targetPosition required")
                return {"targetPosition": {"x": _int(tp.get("x")), "y": _int(tp.get("y"))}}
            if task_type == "patrol":
                route = td.get("route")
                if not isinstance(route, list) or not route:
                    raise HTTPException(status_code=400, detail="route required")
                pts = []
                for p in route:
                    if not isinstance(p, dict):
                        raise HTTPException(status_code=400, detail="route points must be objects")
                    pts.append({"x": _int(p.get("x")), "y": _int(p.get("y"))})
                until = td.get("until")
                if isinstance(until, str):
                    until = parse_dt(until)
                if not isinstance(until, datetime):
                    raise HTTPException(status_code=400, detail="until required")
                return {"route": pts, "until": until}
            if task_type == "scanRadius":
                center = td.get("center")
                if not isinstance(center, dict):
                    raise HTTPException(status_code=400, detail="center required")
                return {
                    "center": {"x": _int(center.get("x")), "y": _int(center.get("y"))},
                    "radius": _int(td.get("radius")),
                }
            if task_type == "custom":
                params = td.get("parameters")
                if not isinstance(params, str):
                    raise HTTPException(status_code=400, detail="parameters required")
                if len(params) > 512:
                    raise HTTPException(status_code=400, detail="parameters too long")
                return {"parameters": params}
            raise HTTPException(status_code=400, detail="Invalid type")

        patch["taskDetails"] = _task_details(t, patch["taskDetails"])
    if "groupId" in patch:
        gid = patch["groupId"]
        if isinstance(gid, str):
            patch["groupId"] = oid_or_400(gid)
        g = _coll("groups").find_one({"_id": patch["groupId"]})
        if not g:
            raise HTTPException(status_code=400, detail="groupId not found")
        patch.setdefault("groupName", g.get("name"))
    for key in ("createdAt", "updatedAt", "startTime", "endTime"):
        if key in patch and isinstance(patch[key], str):
            patch[key] = parse_dt(patch[key])
    if "executionRobots" in patch and patch["executionRobots"]:
        for item in patch["executionRobots"]:
            if isinstance(item.get("robotId"), str):
                item["robotId"] = oid_or_400(item["robotId"])
            if isinstance(item.get("assignedAt"), str):
                item["assignedAt"] = parse_dt(item["assignedAt"])
            if item.get("removedAt") and isinstance(item["removedAt"], str):
                item["removedAt"] = parse_dt(item["removedAt"])
    patch.setdefault("updatedAt", utcnow())
    merged = {**existing, **patch}
    merged["_id"] = _id
    try:
        _coll("tasks").replace_one({"_id": _id}, merged)
    except OperationFailure as e:
        raise mongo_validation_error(e) from e
    return doc_to_jsonable(_coll("tasks").find_one({"_id": _id}))


@router.delete("/api/tasks/{doc_id}", status_code=204, tags=["entities"])
def delete_task(doc_id):
    res = _coll("tasks").delete_one({"_id": oid_or_400(doc_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
