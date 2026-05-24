from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query

from src.api.list_filters import (
    events_filter,
    groups_filter,
    obstacles_filter,
    robots_filter,
    tasks_filter,
)
from src.db.database import get_db

router = APIRouter(tags=["stats"])

_STATS_COLLECTIONS = frozenset({"groups", "robots", "tasks", "events", "obstacles"})

_AXIS_FIELDS: dict[str, frozenset[str]] = {
    "groups": frozenset({"name", "status"}),
    "robots": frozenset({"scanRadius", "weight", "model", "groupName", "robotStatus", "name"}),
    "tasks": frozenset({"type", "taskStatus", "groupName", "name"}),
    "events": frozenset({"type", "message", "description", "robotId", "taskId", "robotName", "taskName"}),
    "obstacles": frozenset({"name", "active"}),
}

_LABEL_MAX_LEN: dict[tuple[str, str], int] = {
    ("events", "message"): 48,
    ("events", "description"): 48,
    ("robots", "name"): 40,
    ("robots", "comments"): 48,
    ("groups", "name"): 40,
    ("groups", "description"): 48,
    ("tasks", "name"): 40,
    ("obstacles", "name"): 40,
}
_DEFAULT_LABEL_MAX = 64
_MAX_AXIS_LABELS = 24
_OTHER = "(other)"


def _coll(name: str):
    return get_db()[name]


def _label_max_len(coll_key: str, field: str) -> int:
    return _LABEL_MAX_LEN.get((coll_key, field), _DEFAULT_LABEL_MAX)


def _value_to_string_expr(source_expr) -> dict:
    return {
        "$switch": {
            "branches": [
                {"case": {"$in": [{"$type": source_expr}, ["null", "missing"]]}, "then": ""},
                {"case": {"$eq": [{"$type": source_expr}, "bool"]}, "then": {"$cond": [source_expr, "true", "false"]}},
                {"case": {"$eq": [{"$type": source_expr}, "objectId"]}, "then": {"$toString": source_expr}},
                {
                    "case": {"$eq": [{"$type": source_expr}, "date"]},
                    "then": {"$dateToString": {"format": "%Y-%m-%d %H:%M", "date": source_expr}},
                },
                {
                    "case": {"$in": [{"$type": source_expr}, ["int", "long", "double", "decimal"]]},
                    "then": {"$toString": source_expr},
                },
            ],
            "default": {"$toString": source_expr},
        }
    }


def _axis_source_expr(coll_key: str, field: str):
    if coll_key == "robots" and field == "robotStatus":
        return {"$ifNull": ["$robotStatus", "online"]}
    if coll_key == "events" and field == "robotName":
        return "$_robotName"
    if coll_key == "events" and field == "taskName":
        return "$_taskName"
    return f"${field}"


def _lookup_stages(coll_key: str, x_field: str, y_field: str) -> list:
    if coll_key != "events":
        return []
    stages = []
    if x_field == "robotName" or y_field == "robotName":
        stages.extend(
            [
                {"$lookup": {"from": "robots", "localField": "robotId", "foreignField": "_id", "as": "_robotLk"}},
                {"$addFields": {"_robotName": {"$ifNull": [{"$arrayElemAt": ["$_robotLk.name", 0]}, ""]}}},
            ]
        )
    if x_field == "taskName" or y_field == "taskName":
        stages.extend(
            [
                {"$lookup": {"from": "tasks", "localField": "taskId", "foreignField": "_id", "as": "_taskLk"}},
                {"$addFields": {"_taskName": {"$ifNull": [{"$arrayElemAt": ["$_taskLk.name", 0]}, ""]}}},
            ]
        )
    return stages


def _axis_expr(coll_key: str, field: str) -> dict:
    src = _axis_source_expr(coll_key, field)
    max_len = _label_max_len(coll_key, field)
    trimmed = {"$trim": {"input": _value_to_string_expr(src)}}
    return {
        "$let": {
            "vars": {"s": trimmed},
            "in": {
                "$cond": [
                    {"$eq": ["$$s", ""]},
                    "(empty)",
                    {
                        "$cond": [
                            {"$gt": [{"$strLenCP": "$$s"}, max_len]},
                            {"$concat": [{"$substrCP": ["$$s", 0, max_len - 1]}, "…"]},
                            "$$s",
                        ]
                    },
                ]
            },
        }
    }


def _rollup_axes(cells: list[dict], max_labels: int) -> list[dict]:
    if not cells:
        return cells

    def marginal(axis: str) -> dict[str, int]:
        totals: dict[str, int] = defaultdict(int)
        for c in cells:
            totals[c[axis]] += c["count"]
        return totals

    x_totals = marginal("x")
    y_totals = marginal("y")
    keep_x = set(sorted(x_totals, key=lambda k: (-x_totals[k], k))[:max_labels])
    keep_y = set(sorted(y_totals, key=lambda k: (-y_totals[k], k))[:max_labels])

    merged: dict[tuple[str, str], int] = defaultdict(int)
    for c in cells:
        x = c["x"] if c["x"] in keep_x else _OTHER
        y = c["y"] if c["y"] in keep_y else _OTHER
        merged[(x, y)] += c["count"]

    out = [{"x": x, "y": y, "count": n} for (x, y), n in merged.items()]
    out.sort(key=lambda c: (c["y"], c["x"]))
    return out


@router.get("/api/stats/chart")
def stats_chart(
    collection: str = Query(...),
    x_field: str = Query(..., alias="xField"),
    y_field: str = Query(..., alias="yField"),
    name: str | None = Query(None),
    description: str | None = Query(None),
    status: str | None = Query(None),
    model: str | None = Query(None),
    group_name: str | None = Query(None, alias="groupName"),
    comments: str | None = Query(None),
    group_id: str | None = Query(None, alias="groupId"),
    doc_id: str | None = Query(None, alias="docId"),
    scan_radius_min: float | None = Query(None, alias="scanRadiusMin"),
    scan_radius_max: float | None = Query(None, alias="scanRadiusMax"),
    weight_min: int | None = Query(None, alias="weightMin"),
    weight_max: int | None = Query(None, alias="weightMax"),
    type_filter: str | None = Query(None, alias="type"),
    task_status: str | None = Query(None, alias="taskStatus"),
    robot_id: str | None = Query(None, alias="robotId"),
    start_after: str | None = Query(None, alias="startTimeAfter"),
    start_before: str | None = Query(None, alias="startTimeBefore"),
    end_after: str | None = Query(None, alias="endTimeAfter"),
    end_before: str | None = Query(None, alias="endTimeBefore"),
    route_point: str | None = Query(None, alias="route"),
    radius_min: int | None = Query(None, alias="radiusMin"),
    radius_max: int | None = Query(None, alias="radiusMax"),
    message: str | None = Query(None),
    task_id: str | None = Query(None, alias="taskId"),
    grid_fs_file_id: str | None = Query(None, alias="gridFsFileId"),
    timestamp_after: str | None = Query(None, alias="timestampAfter"),
    timestamp_before: str | None = Query(None, alias="timestampBefore"),
    active: bool | None = Query(None),
    points_q: str | None = Query(None, alias="pointsQ"),
    min_x_gte: int | None = Query(None, alias="minXGte"),
    max_x_lte: int | None = Query(None, alias="maxXLte"),
    min_y_gte: int | None = Query(None, alias="minYGte"),
    max_y_lte: int | None = Query(None, alias="maxYLte"),
    created_after: str | None = Query(None),
    created_before: str | None = Query(None),
    updated_after: str | None = Query(None),
    updated_before: str | None = Query(None),
):
    coll_key = (collection or "").strip().lower()
    if coll_key not in _STATS_COLLECTIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported collection: {collection}")

    allowed = _AXIS_FIELDS[coll_key]
    if x_field not in allowed:
        raise HTTPException(status_code=400, detail=f"xField must be one of: {', '.join(sorted(allowed))}")
    if y_field not in allowed:
        raise HTTPException(status_code=400, detail=f"yField must be one of: {', '.join(sorted(allowed))}")
    if x_field == y_field:
        raise HTTPException(status_code=400, detail="xField and yField must differ")

    if coll_key == "groups":
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
    elif coll_key == "robots":
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
    elif coll_key == "tasks":
        filt = tasks_filter(
            name=name,
            group_name=group_name,
            task_type=type_filter,
            task_status=task_status,
            group_id=group_id,
            doc_id=doc_id,
            robot_id=robot_id,
            start_after=start_after,
            start_before=start_before,
            end_after=end_after,
            end_before=end_before,
            route_point=route_point,
            radius_min=radius_min,
            radius_max=radius_max,
            created_after=created_after,
            created_before=created_before,
            updated_after=updated_after,
            updated_before=updated_before,
        )
    elif coll_key == "events":
        filt = events_filter(
            event_type=type_filter,
            message=message,
            description=description,
            robot_id=robot_id,
            task_id=task_id,
            grid_fs_file_id=grid_fs_file_id,
            doc_id=doc_id,
            timestamp_after=timestamp_after,
            timestamp_before=timestamp_before,
            created_after=created_after,
            created_before=created_before,
        )
    else:
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

    coll = _coll(coll_key)
    matched_total = coll.count_documents(filt)

    pipeline = [{"$match": filt}]
    pipeline.extend(_lookup_stages(coll_key, x_field, y_field))
    pipeline.extend(
        [
            {
                "$project": {
                    "_x": _axis_expr(coll_key, x_field),
                    "_y": _axis_expr(coll_key, y_field),
                }
            },
            {"$group": {"_id": {"x": "$_x", "y": "$_y"}, "count": {"$sum": 1}}},
        ]
    )
    cells = []
    for row in coll.aggregate(pipeline):
        gid = row.get("_id") or {}
        cells.append({"x": gid.get("x", ""), "y": gid.get("y", ""), "count": int(row.get("count") or 0)})

    cells = _rollup_axes(cells, _MAX_AXIS_LABELS)

    x_labels = sorted({c["x"] for c in cells}, key=lambda s: (s == _OTHER, s == "(empty)", s))
    y_labels = sorted({c["y"] for c in cells}, key=lambda s: (s == _OTHER, s == "(empty)", s))

    return {
        "collection": coll_key,
        "xField": x_field,
        "yField": y_field,
        "matchedTotal": matched_total,
        "xLabels": x_labels,
        "yLabels": y_labels,
        "cells": cells,
        "labelMaxLen": {
            "x": _label_max_len(coll_key, x_field),
            "y": _label_max_len(coll_key, y_field),
        },
        "axisCap": _MAX_AXIS_LABELS,
    }


@router.get("/api/stats/fields")
def stats_fields(collection: str = Query(...)):
    coll_key = (collection or "").strip().lower()
    if coll_key not in _STATS_COLLECTIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported collection: {collection}")
    fields = sorted(_AXIS_FIELDS[coll_key])
    return {"collection": coll_key, "fields": fields}
