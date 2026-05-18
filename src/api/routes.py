import base64
import json
import re
import mimetypes
from datetime import datetime
from io import BytesIO

from fastapi import APIRouter, Body, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi import UploadFile, File
from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError, OperationFailure

from src.api.list_filters import (
    events_filter,
    gridfs_files_filter,
    groups_filter,
    obstacles_filter,
    robots_filter,
    tasks_filter,
)
from src.api.mongo_http import body_to_bson, doc_to_jsonable, icontains, mongo_validation_error, oid_or_400, parse_dt, utcnow
from src.api.auth import authenticate, issue_token
from src.db.database import get_db
from src.db.schemas import DESCRIPTION_MAX_LENGTH

router = APIRouter()

_MAX_LIMIT = 500
_DEFAULT_LIMIT = 200


def _list_response(items: list, total: int) -> JSONResponse:
    return JSONResponse(content=items, headers={"X-Total-Count": str(total)})

def _coll(name):
    return get_db()[name]


def _validate_description_payload(v) -> None:
    if v is None:
        return
    if not isinstance(v, str):
        raise HTTPException(status_code=400, detail="description must be a string or null")
    if len(v) > DESCRIPTION_MAX_LENGTH:
        raise HTTPException(status_code=400, detail=f"description must be at most {DESCRIPTION_MAX_LENGTH} characters")


def _expr_obstacle_points_flat_text() -> dict:
    return {
        "$reduce": {
            "input": {"$ifNull": ["$points", []]},
            "initialValue": "",
            "in": {
                "$concat": [
                    "$$value",
                    " ",
                    {"$toString": {"$ifNull": [{"$arrayElemAt": ["$$this", 0]}, ""]}},
                    ",",
                    {"$toString": {"$ifNull": [{"$arrayElemAt": ["$$this", 1]}, ""]}},
                ]
            },
        }
    }


def _files_coll():
    return get_db().fs.files


def _ejson_oid_str(v) -> str | None:
    if isinstance(v, dict) and isinstance(v.get("$oid"), str):
        return v["$oid"].strip() or None
    if isinstance(v, str) and v.strip():
        return v.strip()
    return None


def _attach_linked_task_ids_to_gridfs_docs(docs: list) -> None:
    oids: list[ObjectId] = []
    for d in docs:
        s = _ejson_oid_str(d.get("_id"))
        if not s:
            continue
        try:
            oids.append(ObjectId(s))
        except InvalidId:
            continue
    if not oids:
        return
    file_to_task: dict[str, object] = {}
    for e in _coll("events").find(
        {"gridFsFileId": {"$in": oids}, "taskId": {"$ne": None}},
        {"gridFsFileId": 1, "taskId": 1},
    ).sort("_id", ASCENDING):
        gf = e.get("gridFsFileId")
        tid = e.get("taskId")
        if gf is None or tid is None:
            continue
        key = str(gf)
        if key not in file_to_task:
            file_to_task[key] = doc_to_jsonable({"_id": tid})["_id"]
    for d in docs:
        s = _ejson_oid_str(d.get("_id"))
        if not s:
            continue
        try:
            key = str(ObjectId(s))
        except InvalidId:
            continue
        if key in file_to_task:
            d["taskId"] = file_to_task[key]


def _mongo_sort_dir(sort_dir: str) -> int:
    return DESCENDING if str(sort_dir or "").lower().strip() == "desc" else ASCENDING


def _telemetry_battery(val) -> int:
    try:
        n = int(float(val))
    except (TypeError, ValueError):
        return 100
    return max(0, min(100, n))


_LAST_TELEMETRY_BATTERY: dict[str, int] = {}


def _robot_to_jsonable(doc):
    out = doc_to_jsonable(doc)
    if isinstance(out, dict) and doc is not None:
        if doc.get("robotStatus") is None:
            out["robotStatus"] = "online"
    return out


def _embed_group_robots_defaults(group_jsonable):
    if not isinstance(group_jsonable, dict):
        return group_jsonable
    bots = group_jsonable.get("robots")
    if isinstance(bots, list):
        for r in bots:
            if isinstance(r, dict):
                if r.get("robotStatus") is None:
                    r["robotStatus"] = "online"
    return group_jsonable


def _group_robots_lookup_stage() -> dict:
    return {
        "$lookup": {
            "from": "robots",
            "localField": "_id",
            "foreignField": "groupId",
            "pipeline": [
                {"$sort": {"name": ASCENDING}},
                {"$project": {"_id": 1, "name": 1}},
            ],
            "as": "robots",
        }
    }


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
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    name: str | None = Query(None),
    description: str | None = Query(None),
    status: str | None = Query(None),
    doc_id: str | None = Query(None, alias="docId"),
    created_after: str | None = Query(None),
    created_before: str | None = Query(None),
    updated_after: str | None = Query(None),
    updated_before: str | None = Query(None),
    sort_dir: str = Query("asc", alias="sortDir"),
):
    filt = groups_filter(
        name=name,
        description=description,
        status=status,
        doc_id=doc_id,
        created_after=created_after,
        created_before=created_before,
        updated_after=updated_after,
        updated_before=updated_before,
    )
    total = _coll("groups").count_documents(filt)
    sd = _mongo_sort_dir(sort_dir)
    pipeline = [
        {"$match": filt},
        {"$sort": {"createdAt": sd}},
        {"$skip": skip},
        {"$limit": limit},
        _group_robots_lookup_stage(),
    ]
    cur = _coll("groups").aggregate(pipeline)
    items = [_embed_group_robots_defaults(doc_to_jsonable(d)) for d in cur]
    return _list_response(items, total)


@router.get("/api/groups/{doc_id}", tags=["entities"])
def get_group(doc_id):
    _id = oid_or_400(doc_id)
    pipeline = [
        {"$match": {"_id": _id}},
        _group_robots_lookup_stage(),
    ]
    docs = list(_coll("groups").aggregate(pipeline))
    if not docs:
        raise HTTPException(status_code=404, detail="Not found")
    return _embed_group_robots_defaults(doc_to_jsonable(docs[0]))


@router.post("/api/groups", status_code=201, tags=["entities"])
def create_group(body=Body(...)):
    if "name" not in body or "status" not in body:
        raise HTTPException(status_code=400, detail="name and status are required")
    name = str(body.get("name") or "").strip()
    status = str(body.get("status") or "").strip()
    if not name or not status:
        raise HTTPException(status_code=400, detail="name and status are required")
    _validate_description_payload(body.get("description"))
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
    if "description" in patch:
        _validate_description_payload(patch.get("description"))
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
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    name: str | None = Query(None),
    model: str | None = Query(None),
    group_name: str | None = Query(None, alias="groupName"),
    comments: str | None = Query(None),
    group_id: str | None = Query(None, alias="groupId"),
    doc_id: str | None = Query(None, alias="docId"),
    scan_radius_min: float | None = Query(None, alias="scanRadiusMin"),
    scan_radius_max: float | None = Query(None, alias="scanRadiusMax"),
    weight_min: int | None = Query(None, alias="weightMin"),
    weight_max: int | None = Query(None, alias="weightMax"),
    created_after: str | None = Query(None),
    created_before: str | None = Query(None),
    updated_after: str | None = Query(None),
    updated_before: str | None = Query(None),
    sort_dir: str = Query("asc", alias="sortDir"),
):
    filt = robots_filter(
        name=name,
        model=model,
        group_name=group_name,
        comments=comments,
        group_id=group_id,
        doc_id=doc_id,
        scan_radius_min=scan_radius_min,
        scan_radius_max=scan_radius_max,
        weight_min=weight_min,
        weight_max=weight_max,
        created_after=created_after,
        created_before=created_before,
        updated_after=updated_after,
        updated_before=updated_before,
    )
    total = _coll("robots").count_documents(filt)
    sd = _mongo_sort_dir(sort_dir)
    cur = _coll("robots").find(filt).sort("createdAt", sd).skip(skip).limit(limit)
    items = [_robot_to_jsonable(d) for d in cur]
    return _list_response(items, total)


@router.post("/api/gridfs/upload", tags=["gridfs"])
async def upload_gridfs_file(file: UploadFile = File(...)):
    from gridfs import GridFSBucket
    db = get_db()
    bucket = GridFSBucket(db)
    content = await file.read()
    file_id = bucket.upload_from_stream(
        file.filename,
        BytesIO(content),
        metadata={"contentType": file.content_type}
    )
    return {"fileId": str(file_id), "filename": file.filename}

@router.post("/api/robots/telemetry", tags=["entities"])
def update_robot_telemetry(body=Body(...)):
    rid = oid_or_400(body.get("robotId"))
    tid = body.get("taskId")
    if tid:
        tid = oid_or_400(tid)

    x = int(body.get("x", 0))
    y = int(body.get("y", 0))
    battery = _telemetry_battery(body.get("battery", 100))
    rid_key = str(rid)
    prev_b = _LAST_TELEMETRY_BATTERY.get(rid_key)

    _coll("robots").update_one(
        {"_id": rid},
        {
            "$set": {
                "coordinates": {"x": x, "y": y},
                "updatedAt": utcnow(),
            },
            "$unset": {"battery": ""},
        },
    )
    _LAST_TELEMETRY_BATTERY[rid_key] = battery

    now = utcnow()
    event_doc = {
        "robotId": rid,
        "taskId": tid,
        "type": "track_point",
        "position": {"x": x, "y": y},
        "timestamp": now,
        "createdAt": now
    }

    try:
        _coll("events").insert_one(event_doc)
    except Exception:
        pass

    if battery < 20 and (prev_b is None or prev_b >= 20):
        try:
            _coll("events").insert_one({
                "robotId": rid,
                "taskId": tid,
                "type": "battery_low",
                "message": f"Low battery: {battery}%",
                "timestamp": now,
                "createdAt": now
            })
        except Exception:
            pass

    return {"status": "ok"}

@router.get("/api/robots/{doc_id}", tags=["entities"])
def get_robot(doc_id):
    doc = _coll("robots").find_one({"_id": oid_or_400(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return _robot_to_jsonable(doc)


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

    rs_raw = raw.get("robotStatus")
    if rs_raw is None:
        robot_status = "online"
    else:
        robot_status = str(rs_raw).strip()
        if robot_status not in ("online", "offline"):
            raise HTTPException(status_code=400, detail="robotStatus must be online or offline")

    doc = {
        "name": str(raw["name"]).strip(),
        "model": str(raw["model"]).strip(),
        "groupId": gid,
        "groupName": raw.get("groupName") or group.get("name"),
        "scanRadius": _num(raw.get("scanRadius")),
        "weight": _int(raw.get("weight")),
        "robotStatus": robot_status,
        "comments": raw.get("comments"),
        "createdAt": _dt(raw.get("createdAt"), now),
        "updatedAt": _dt(raw.get("updatedAt"), now),
    }
    try:
        res = _coll("robots").insert_one(doc)
    except OperationFailure as e:
        raise mongo_validation_error(e) from e
    doc["_id"] = res.inserted_id
    return _robot_to_jsonable(doc)


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
    if "robotStatus" in patch:
        rs = patch.get("robotStatus")
        if rs not in ("online", "offline"):
            raise HTTPException(status_code=400, detail="robotStatus must be online or offline")
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
    merged.pop("battery", None)
    merged["_id"] = _id
    try:
        _coll("robots").replace_one({"_id": _id}, merged)
    except OperationFailure as e:
        raise mongo_validation_error(e) from e
    return _robot_to_jsonable(_coll("robots").find_one({"_id": _id}))


@router.delete("/api/robots/{doc_id}", status_code=204, tags=["entities"])
def delete_robot(doc_id):
    res = _coll("robots").delete_one({"_id": oid_or_400(doc_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/tasks", tags=["entities"])
def list_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    name: str | None = Query(None),
    group_name: str | None = Query(None, alias="groupName"),
    task_type: str | None = Query(None, alias="type"),
    task_status: str | None = Query(None, alias="taskStatus"),
    group_id: str | None = Query(None, alias="groupId"),
    doc_id: str | None = Query(None, alias="docId"),
    robot_id: str | None = Query(None, alias="robotId"),
    start_after: str | None = Query(None, alias="startTimeAfter"),
    start_before: str | None = Query(None, alias="startTimeBefore"),
    end_after: str | None = Query(None, alias="endTimeAfter"),
    end_before: str | None = Query(None, alias="endTimeBefore"),
    route_point: str | None = Query(
        None,
        alias="route",
    ),
    radius_min: int | None = Query(None, alias="radiusMin"),
    radius_max: int | None = Query(None, alias="radiusMax"),
    radius_m_min: int | None = Query(None, alias="radiusMMin", include_in_schema=False),
    radius_m_max: int | None = Query(None, alias="radiusMMax", include_in_schema=False),
    image_filename: str | None = Query(
        None,
        alias="imageFilename",
    ),
    created_after: str | None = Query(None),
    created_before: str | None = Query(None),
    updated_after: str | None = Query(None),
    updated_before: str | None = Query(None),
    sort_dir: str = Query("asc", alias="sortDir"),
):
    rmin = radius_min if radius_min is not None else radius_m_min
    rmax = radius_max if radius_max is not None else radius_m_max
    base_filt = tasks_filter(
        name=name,
        group_name=group_name,
        task_type=task_type,
        task_status=task_status,
        group_id=group_id,
        doc_id=doc_id,
        robot_id=robot_id,
        start_after=start_after,
        start_before=start_before,
        end_after=end_after,
        end_before=end_before,
        route_point=route_point,
        radius_min=rmin,
        radius_max=rmax,
        created_after=created_after,
        created_before=created_before,
        updated_after=updated_after,
        updated_before=updated_before,
    )
    sd = _mongo_sort_dir(sort_dir)
    sort_created_agg = 1 if sd == ASCENDING else -1
    if not image_filename or not image_filename.strip():
        total = _coll("tasks").count_documents(base_filt)
        cur = _coll("tasks").find(base_filt).sort("createdAt", sd).skip(skip).limit(limit)
        items = [doc_to_jsonable(d) for d in cur]
        return _list_response(items, total)

    rx = re.escape(image_filename.strip())
    base_pipeline = [
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
    ]
    count_rows = list(_coll("tasks").aggregate(base_pipeline + [{"$count": "n"}]))
    total = int(count_rows[0]["n"]) if count_rows else 0
    pipeline = base_pipeline + [
        {"$sort": {"createdAt": sort_created_agg}},
        {"$skip": skip},
        {"$limit": limit},
        {"$unset": ["_evs", "_files"]},
    ]
    cur = _coll("tasks").aggregate(pipeline)
    items = [doc_to_jsonable(d) for d in cur]
    return _list_response(items, total)


@router.get("/api/tasks/{task_id}/visual-logs", tags=["entities"])
def list_task_visual_logs(task_id: str):
    tid = oid_or_400(task_id)
    if not _coll("tasks").find_one({"_id": tid}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Not found")
    evs = (
        _coll("events")
        .find({"taskId": tid, "type": "visual_capture", "gridFsFileId": {"$ne": None}})
        .sort("timestamp", DESCENDING)
        .limit(100)
    )
    out = []
    for e in evs:
        fid = e.get("gridFsFileId")
        fdoc = _files_coll().find_one({"_id": fid}) if fid is not None else None
        row = {
            "timestamp": e.get("timestamp"),
            "eventId": e["_id"],
            "gridFsFileId": fid,
        }
        if fdoc:
            row["filename"] = fdoc.get("filename")
            row["length"] = fdoc.get("length")
            row["uploadDate"] = fdoc.get("uploadDate")
        out.append(doc_to_jsonable(row))
    return out


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

    robot_docs = list(_coll("robots").find({"groupId": gid}, projection={"_id": 1}))
    execution_robots = [
        {"robotId": r["_id"], "assignedAt": now, "status": "assigned", "removedAt": None}
        for r in robot_docs
    ]
    doc = {
        "name": str(raw.get("name") or "").strip(),
        "groupId": gid,
        "groupName": raw.get("groupName") or group.get("name"),
        "type": raw["type"],
        "taskStatus": raw["taskStatus"],
        "taskDetails": _task_details(str(raw["type"]), raw.get("taskDetails")),
        "executionRobots": execution_robots,
        "plannedRoute": raw.get("plannedRoute"),
        "startTime": now,
        "endTime": None,
        "createdAt": raw.get("createdAt") or now,
        "updatedAt": raw.get("updatedAt") or now,
    }
    for key in ("createdAt", "updatedAt"):
        if isinstance(doc.get(key), str):
            doc[key] = parse_dt(doc[key])
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
    updated_doc = _coll("tasks").find_one({"_id": _id})
    prev_st = existing.get("taskStatus")
    new_st = merged.get("taskStatus")
    if isinstance(new_st, str) and new_st == "active" and prev_st != "active":
        exec_list = merged.get("executionRobots") or []
        first_robot_id = None
        if exec_list and isinstance(exec_list[0], dict):
            first_robot_id = exec_list[0].get("robotId")
        try:
            _coll("events").insert_one(
                {
                    "robotId": first_robot_id,
                    "taskId": _id,
                    "type": "task_created",
                    "message": f'{str(merged.get("name") or "Task")} started.',
                    "timestamp": utcnow(),
                    "createdAt": utcnow(),
                }
            )
        except Exception:
            pass
    return doc_to_jsonable(updated_doc)


@router.delete("/api/tasks/{doc_id}", status_code=204, tags=["entities"])
def delete_task(doc_id):
    res = _coll("tasks").delete_one({"_id": oid_or_400(doc_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/events", tags=["entities"])
def list_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    event_type: str | None = Query(None, alias="type"),
    message: str | None = Query(None),
    description: str | None = Query(None),
    robot_id: str | None = Query(None, alias="robotId"),
    task_id: str | None = Query(None, alias="taskId"),
    grid_fs_file_id: str | None = Query(None, alias="gridFsFileId"),
    doc_id: str | None = Query(None, alias="docId"),
    timestamp_after: str | None = Query(None, alias="timestampAfter"),
    timestamp_before: str | None = Query(None, alias="timestampBefore"),
    sort_dir: str = Query("asc", alias="sortDir"),
):
    filt = events_filter(
        event_type=event_type,
        message=message,
        description=description,
        robot_id=robot_id,
        task_id=task_id,
        grid_fs_file_id=grid_fs_file_id,
        doc_id=doc_id,
        timestamp_after=timestamp_after,
        timestamp_before=timestamp_before,
    )
    total = _coll("events").count_documents(filt)
    sd = _mongo_sort_dir(sort_dir)
    cur = _coll("events").find(filt).sort("timestamp", sd).skip(skip).limit(limit)
    items = [doc_to_jsonable(d) for d in cur]
    return _list_response(items, total)


@router.get("/api/events/{doc_id}", tags=["entities"])
def get_event(doc_id):
    doc = _coll("events").find_one({"_id": oid_or_400(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc_to_jsonable(doc)


@router.post("/api/events", status_code=201, tags=["entities"])
def create_event(body=Body(...)):
    raw = body_to_bson(body)
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Body must be an object")
    allowed_keys = {"type", "message", "description", "robotId", "taskId", "timestamp", "gridFsFileId"}
    extra = set(raw.keys()) - allowed_keys - {"_id"}
    if extra:
        raise HTTPException(status_code=400, detail="Unknown fields: " + ", ".join(sorted(extra)))

    msg = raw.get("message")
    if msg is not None and not isinstance(msg, str):
        raise HTTPException(status_code=400, detail="message must be a string or null")
    if isinstance(msg, str):
        msg = msg.strip() or None

    desc = raw.get("description")
    if desc is not None and not isinstance(desc, str):
        raise HTTPException(status_code=400, detail="description must be a string or null")
    _validate_description_payload(desc)

    def _opt_ref_oid(key: str):
        if key not in raw:
            return None
        v = raw.get(key)
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return oid_or_400(s) if s else None
        if isinstance(v, ObjectId):
            return v
        raise HTTPException(status_code=400, detail=f"{key} must be an ObjectId hex string or null")

    rid = _opt_ref_oid("robotId")
    tid = _opt_ref_oid("taskId")
    gfid = _opt_ref_oid("gridFsFileId")

    now = utcnow()
    ts = now
    if raw.get("timestamp") is not None:
        tv = raw["timestamp"]
        if isinstance(tv, str):
            ts = parse_dt(tv)
            if ts is None:
                raise HTTPException(status_code=400, detail="timestamp is required when provided")
        elif isinstance(tv, datetime):
            ts = tv
        else:
            raise HTTPException(status_code=400, detail="Invalid timestamp")

    doc: dict = {
        "timestamp": ts,
        "robotId": rid,
        "taskId": tid,
        "createdAt": now,
    }
    if gfid is not None:
        doc["type"] = "visual_capture"
        doc["gridFsFileId"] = gfid
    else:
        doc["type"] = "info"
    if msg is not None:
        doc["message"] = msg
    if desc is not None:
        doc["description"] = desc
    try:
        res = _coll("events").insert_one(doc)
    except OperationFailure as e:
        raise mongo_validation_error(e) from e
    doc["_id"] = res.inserted_id
    return doc_to_jsonable(doc)


@router.patch("/api/events/{doc_id}", tags=["entities"])
def patch_event(doc_id, body=Body(...)):
    _id = oid_or_400(doc_id)
    existing = _coll("events").find_one({"_id": _id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    raw = body_to_bson(body)
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Body must be an object")
    keys = set(raw.keys()) - {"_id"}
    if keys != {"description"}:
        raise HTTPException(status_code=400, detail="Only the description field may be updated.")
    desc = raw.get("description")
    _validate_description_payload(desc)
    merged = {**existing, "description": desc}
    merged.pop("updatedAt", None)
    merged["_id"] = _id
    try:
        _coll("events").replace_one({"_id": _id}, merged)
    except OperationFailure as e:
        raise mongo_validation_error(e) from e
    return doc_to_jsonable(_coll("events").find_one({"_id": _id}))


@router.delete("/api/events/{doc_id}", status_code=204, tags=["entities"])
def delete_event(doc_id):
    res = _coll("events").delete_one({"_id": oid_or_400(doc_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/obstacles", tags=["entities"])
def list_obstacles(
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    name: str | None = Query(None),
    active: bool | None = Query(None),
    doc_id: str | None = Query(None, alias="docId"),
    points_q: str | None = Query(
        None,
        alias="pointsQ",
    ),
    min_x_gte: int | None = Query(None, alias="minXGte"),
    max_x_lte: int | None = Query(None, alias="maxXLte"),
    min_y_gte: int | None = Query(None, alias="minYGte"),
    max_y_lte: int | None = Query(None, alias="maxYLte"),
    created_after: str | None = Query(None),
    created_before: str | None = Query(None),
    updated_after: str | None = Query(None),
    updated_before: str | None = Query(None),
    sort_dir: str = Query("asc", alias="sortDir"),
):
    filt = obstacles_filter(
        name=name,
        active=active,
        doc_id=doc_id,
        points_q=points_q,
        min_x_gte=min_x_gte,
        max_x_lte=max_x_lte,
        min_y_gte=min_y_gte,
        max_y_lte=max_y_lte,
        created_after=created_after,
        created_before=created_before,
        updated_after=updated_after,
        updated_before=updated_before,
    )
    total = _coll("obstacles").count_documents(filt)
    sd = _mongo_sort_dir(sort_dir)
    cur = _coll("obstacles").find(filt).sort("createdAt", sd).skip(skip).limit(limit)
    items = [doc_to_jsonable(d) for d in cur]
    return _list_response(items, total)


@router.get("/api/obstacles/{doc_id}", tags=["entities"])
def get_obstacle(doc_id):
    doc = _coll("obstacles").find_one({"_id": oid_or_400(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc_to_jsonable(doc)


@router.post("/api/obstacles", status_code=201, tags=["entities"])
def create_obstacle(body=Body(...)):
    raw = body_to_bson(body)
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Body must be an object")
    for req in ("points",):
        if req not in raw:
            raise HTTPException(status_code=400, detail=f"{req} is required")
    name = str(raw.get("name") or "").strip()
    now = utcnow()
    points = raw.get("points") or []
    if not isinstance(points, list) or not points:
        raise HTTPException(status_code=400, detail="points must be a non-empty array")
    xs = []
    ys = []
    for item in points:
        if not isinstance(item, list) or len(item) != 2:
            raise HTTPException(status_code=400, detail="points items must be [x,y]")
        x, y = item[0], item[1]
        if isinstance(x, bool) or isinstance(y, bool):
            raise HTTPException(status_code=400, detail="points must be ints")
        if not isinstance(x, int) or not isinstance(y, int):
            if isinstance(x, float) and x.is_integer():
                x = int(x)
            if isinstance(y, float) and y.is_integer():
                y = int(y)
        if not isinstance(x, int) or not isinstance(y, int):
            raise HTTPException(status_code=400, detail="points must be ints")
        xs.append(x)
        ys.append(y)
    min_x = min(xs)
    max_x = max(xs)
    min_y = min(ys)
    max_y = max(ys)
    if not name:
        name = "Obstacle"
    doc = {
        "name": name,
        "points": points,
        "minX": min_x,
        "maxX": max_x,
        "minY": min_y,
        "maxY": max_y,
        "active": raw.get("active", True),
        "createdAt": raw.get("createdAt") or now,
        "updatedAt": raw.get("updatedAt") or now,
    }
    for key in ("createdAt", "updatedAt"):
        if isinstance(doc[key], str):
            doc[key] = parse_dt(doc[key])
    try:
        res = _coll("obstacles").insert_one(doc)
    except (OperationFailure, DuplicateKeyError) as e:
        raise mongo_validation_error(e) from e
    doc["_id"] = res.inserted_id
    return doc_to_jsonable(doc)


@router.patch("/api/obstacles/{doc_id}", tags=["entities"])
def patch_obstacle(doc_id, body=Body(...)):
    _id = oid_or_400(doc_id)
    existing = _coll("obstacles").find_one({"_id": _id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    raw = body_to_bson(body)
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Body must be an object")
    patch = {k: v for k, v in raw.items() if k != "_id"}
    if "name" in patch and not str(patch.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="name is required")
    for key in ("createdAt", "updatedAt"):
        if key in patch and isinstance(patch[key], str):
            patch[key] = parse_dt(patch[key])
    patch.setdefault("updatedAt", utcnow())
    merged = {**existing, **patch}
    merged["_id"] = _id
    try:
        _coll("obstacles").replace_one({"_id": _id}, merged)
    except OperationFailure as e:
        raise mongo_validation_error(e) from e
    return doc_to_jsonable(_coll("obstacles").find_one({"_id": _id}))


@router.delete("/api/obstacles/{doc_id}", status_code=204, tags=["entities"])
def delete_obstacle(doc_id):
    res = _coll("obstacles").delete_one({"_id": oid_or_400(doc_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/gridfs/files", tags=["gridfs"])
def list_gridfs_files(
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    filename: str | None = Query(None),
    doc_id: str | None = Query(None, alias="docId"),
    upload_after: str | None = Query(None),
    upload_before: str | None = Query(None),
    metadata: str | None = Query(None),
    length_min: int | None = Query(None, alias="lengthMin"),
    length_max: int | None = Query(None, alias="lengthMax"),
    sort_dir: str = Query("desc", alias="sortDir"),
):
    filt = gridfs_files_filter(
        filename=filename,
        doc_id=doc_id,
        upload_after=upload_after,
        upload_before=upload_before,
        length_min=length_min,
        length_max=length_max,
    )
    total = _files_coll().count_documents(filt)
    sd = _mongo_sort_dir(sort_dir)
    cur = _files_coll().find(filt).sort("uploadDate", sd).skip(skip).limit(limit)
    docs = [doc_to_jsonable(d) for d in cur]
    if metadata and metadata.strip():
        needle = metadata.strip().lower()

        def _meta_str(x):
            try:
                return json.dumps(x or {}, ensure_ascii=False, sort_keys=True).lower()
            except Exception:
                return str(x or "").lower()

        docs = [d for d in docs if needle in _meta_str((d or {}).get("metadata"))]
        total = len(docs)
    _attach_linked_task_ids_to_gridfs_docs(docs)
    return _list_response(docs, total)


@router.get("/api/gridfs/files/{file_id}/download", tags=["gridfs"])
def download_gridfs_file(file_id):
    from gridfs import GridFSBucket
    from gridfs.errors import NoFile

    db = get_db()
    _id = oid_or_400(file_id)
    bucket = GridFSBucket(db)
    try:
        grid_out = bucket.open_download_stream(_id)
    except NoFile:
        raise HTTPException(status_code=404, detail="File not found") from None

    fname = grid_out.filename or "file"
    meta = grid_out.metadata or {}
    ct = meta.get("contentType") or mimetypes.guess_type(fname)[0] or "application/octet-stream"

    def chunks():
        chunk_size = 256 * 1024
        while True:
            data = grid_out.read(chunk_size)
            if not data:
                break
            yield data

    safe = fname.replace('"', "_")
    return StreamingResponse(
        chunks(),
        media_type=ct,
        headers={"Content-Disposition": f'inline; filename="{safe}"'},
    )


_APP_COLLECTIONS_ORDER = ("groups", "robots", "tasks", "events", "obstacles")


def _require_admin(request: Request):
    user = getattr(request.state, "user", None) or {}
    if str(user.get("role") or "") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")


def _clear_gridfs(db):
    db.fs.files.delete_many({})
    db.fs.chunks.delete_many({})


@router.get("/api/app/export", tags=["app"])
def app_export_bundle(request: Request):
    _require_admin(request)
    from gridfs import GridFSBucket

    db = get_db()
    bundle = {
        "format": "nsql-robot-app-bundle",
        "version": 1,
        "exportedAt": utcnow().isoformat(),
        "collections": {},
        "gridfs": [],
    }
    for name in _APP_COLLECTIONS_ORDER:
        cur = db[name].find({}).sort("_id", ASCENDING)
        if name == "robots":
            bundle["collections"][name] = [_robot_to_jsonable(d) for d in cur]
        else:
            bundle["collections"][name] = [doc_to_jsonable(d) for d in cur]

    bucket = GridFSBucket(db)
    for fdoc in db.fs.files.find({}).sort("uploadDate", ASCENDING):
        _id = fdoc["_id"]
        try:
            stream = bucket.open_download_stream(_id)
            raw = stream.read()
        except Exception:
            continue
        meta = fdoc.get("metadata") or {}
        ct = meta.get("contentType") if isinstance(meta, dict) else None
        if not ct:
            ct = mimetypes.guess_type(fdoc.get("filename") or "")[0] or "application/octet-stream"
        bundle["gridfs"].append(
            {
                "filename": fdoc.get("filename") or "file",
                "metadata": doc_to_jsonable(meta) if meta else {},
                "length": int(fdoc.get("length") or len(raw)),
                "uploadDate": doc_to_jsonable({"d": fdoc.get("uploadDate")}).get("d"),
                "contentType": ct,
                "dataBase64": base64.standard_b64encode(raw).decode("ascii"),
            }
        )
    return bundle


@router.post("/api/app/import", tags=["app"])
def app_import_bundle(request: Request, body=Body(...)):
    _require_admin(request)
    from gridfs import GridFSBucket

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")
    cols_in = body.get("collections")
    if not isinstance(cols_in, dict):
        raise HTTPException(status_code=400, detail="collections map is required")

    db = get_db()
    db.events.delete_many({})
    db.tasks.delete_many({})
    db.robots.delete_many({})
    db.groups.delete_many({})
    db.obstacles.delete_many({})
    _clear_gridfs(db)

    for name in _APP_COLLECTIONS_ORDER:
        docs = cols_in.get(name)
        if docs is None:
            docs = []
        if not isinstance(docs, list):
            raise HTTPException(status_code=400, detail=f"collections.{name} must be an array")
        if not docs:
            continue
        bson_docs = []
        for d in docs:
            if not isinstance(d, dict):
                raise HTTPException(status_code=400, detail="Each document must be an object")
            bson_docs.append(body_to_bson(d))
        db[name].insert_many(bson_docs)

    gfs = body.get("gridfs")
    if gfs is None:
        gfs = []
    if not isinstance(gfs, list):
        raise HTTPException(status_code=400, detail="gridfs must be an array")

    bucket = GridFSBucket(db)
    for item in gfs:
        if not isinstance(item, dict):
            continue
        fname = str(item.get("filename") or "file").strip() or "file"
        b64 = item.get("dataBase64") or item.get("data_base64")
        if not b64 or not isinstance(b64, str):
            raise HTTPException(status_code=400, detail=f"gridfs entry for {fname} requires dataBase64")
        try:
            raw = base64.standard_b64decode(b64.encode("ascii"))
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid base64 for {fname}") from exc
        meta = item.get("metadata")
        meta_bson = body_to_bson(meta) if isinstance(meta, dict) else {}
        ct = item.get("contentType") or (
            meta_bson.get("contentType") if isinstance(meta_bson, dict) else None
        )
        if not ct:
            ct = mimetypes.guess_type(fname)[0] or "application/octet-stream"
        if isinstance(meta_bson, dict) and "contentType" not in meta_bson:
            meta_bson = {**meta_bson, "contentType": ct}
        bucket.upload_from_stream(fname, BytesIO(raw), metadata=meta_bson if meta_bson else None)

    from src.db.load_dump import link_seed_events_to_gridfs

    link_seed_events_to_gridfs(db)
    return {"ok": True, "imported": {k: db[k].count_documents({}) for k in _APP_COLLECTIONS_ORDER}, "gridfs_files": db.fs.files.count_documents({})}
