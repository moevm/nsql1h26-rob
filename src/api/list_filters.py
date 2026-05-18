import re

from src.api.mongo_http import icontains, oid_or_400, parse_dt


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


def groups_filter(
    *,
    name: str | None = None,
    description: str | None = None,
    status: str | None = None,
    doc_id: str | None = None,
    created_after: str | None = None,
    created_before: str | None = None,
    updated_after: str | None = None,
    updated_before: str | None = None,
) -> dict:
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
        return {}
    return q


def robots_filter(
    *,
    name: str | None = None,
    model: str | None = None,
    group_name: str | None = None,
    comments: str | None = None,
    group_id: str | None = None,
    doc_id: str | None = None,
    scan_radius_min: float | None = None,
    scan_radius_max: float | None = None,
    weight_min: int | None = None,
    weight_max: int | None = None,
    created_after: str | None = None,
    created_before: str | None = None,
    updated_after: str | None = None,
    updated_before: str | None = None,
) -> dict:
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
    return {"$and": parts} if parts else {}


def tasks_filter(
    *,
    name: str | None = None,
    group_name: str | None = None,
    task_type: str | None = None,
    task_status: str | None = None,
    group_id: str | None = None,
    doc_id: str | None = None,
    robot_id: str | None = None,
    start_after: str | None = None,
    start_before: str | None = None,
    end_after: str | None = None,
    end_before: str | None = None,
    route_point: str | None = None,
    radius_min: int | None = None,
    radius_max: int | None = None,
    created_after: str | None = None,
    created_before: str | None = None,
    updated_after: str | None = None,
    updated_before: str | None = None,
) -> dict:
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
    sa, sb = parse_dt(start_after), parse_dt(start_before)
    if sa:
        parts.append({"startTime": {"$gte": sa}})
    if sb:
        parts.append({"startTime": {"$lte": sb}})
    ea, eb = parse_dt(end_after), parse_dt(end_before)
    if ea:
        parts.append({"endTime": {"$gte": ea}})
    if eb:
        parts.append({"endTime": {"$lte": eb}})
    if route_point and route_point.strip():
        pairs = re.findall(r"(\d+)\s*,\s*(\d+)", route_point)
        for xs, ys in pairs:
            x, y = int(xs), int(ys)
            parts.append(
                {
                    "$or": [
                        {"taskDetails.route": {"$elemMatch": {"x": x, "y": y}}},
                        {"plannedRoute.points": [x, y]},
                    ]
                }
            )
    if radius_min is not None or radius_max is not None:
        r = {}
        if radius_min is not None:
            r["$gte"] = radius_min
        if radius_max is not None:
            r["$lte"] = radius_max
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
    return {"$and": parts} if parts else {}


def events_filter(
    *,
    event_type: str | None = None,
    message: str | None = None,
    description: str | None = None,
    robot_id: str | None = None,
    task_id: str | None = None,
    grid_fs_file_id: str | None = None,
    doc_id: str | None = None,
    timestamp_after: str | None = None,
    timestamp_before: str | None = None,
) -> dict:
    parts = []
    if event_type:
        parts.append({"type": event_type})
    for c in (icontains("message", message), icontains("description", description)):
        if c:
            parts.append(c)
    if doc_id and doc_id.strip():
        parts.append({"_id": oid_or_400(doc_id.strip())})
    if robot_id:
        parts.append({"robotId": oid_or_400(robot_id)})
    if task_id:
        parts.append({"taskId": oid_or_400(task_id)})
    if grid_fs_file_id and grid_fs_file_id.strip():
        parts.append({"gridFsFileId": oid_or_400(grid_fs_file_id.strip())})
    ta, tb = parse_dt(timestamp_after), parse_dt(timestamp_before)
    if ta:
        parts.append({"timestamp": {"$gte": ta}})
    if tb:
        parts.append({"timestamp": {"$lte": tb}})
    return {"$and": parts} if parts else {}


def obstacles_filter(
    *,
    name: str | None = None,
    active: bool | None = None,
    doc_id: str | None = None,
    points_q: str | None = None,
    min_x_gte: int | None = None,
    max_x_lte: int | None = None,
    min_y_gte: int | None = None,
    max_y_lte: int | None = None,
    created_after: str | None = None,
    created_before: str | None = None,
    updated_after: str | None = None,
    updated_before: str | None = None,
) -> dict:
    parts = []
    if doc_id and doc_id.strip():
        parts.append({"_id": oid_or_400(doc_id.strip())})
    c = icontains("name", name)
    if c:
        parts.append(c)
    if points_q and points_q.strip():
        raw = points_q.strip()
        tokens = [t.strip() for t in re.split(r"[;\n\r]+", raw) if t and t.strip()]
        if tokens:
            ors = []
            for tok in tokens:
                ors.append(
                    {
                        "$expr": {
                            "$regexMatch": {
                                "input": _expr_obstacle_points_flat_text(),
                                "regex": re.escape(tok),
                                "options": "i",
                            }
                        }
                    }
                )
            parts.append({"$or": ors} if len(ors) > 1 else ors[0])
    if active is not None:
        parts.append({"active": active})
    if min_x_gte is not None:
        parts.append({"minX": {"$gte": min_x_gte}})
    if max_x_lte is not None:
        parts.append({"maxX": {"$lte": max_x_lte}})
    if min_y_gte is not None:
        parts.append({"minY": {"$gte": min_y_gte}})
    if max_y_lte is not None:
        parts.append({"maxY": {"$lte": max_y_lte}})
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
    return {"$and": parts} if parts else {}


def gridfs_files_filter(
    *,
    filename: str | None = None,
    doc_id: str | None = None,
    upload_after: str | None = None,
    upload_before: str | None = None,
    length_min: int | None = None,
    length_max: int | None = None,
) -> dict:
    q = {"$and": []}
    if doc_id and doc_id.strip():
        q["$and"].append({"_id": oid_or_400(doc_id.strip())})
    if filename and filename.strip():
        q["$and"].append({"filename": {"$regex": re.escape(filename.strip()), "$options": "i"}})
    ua, ub = parse_dt(upload_after), parse_dt(upload_before)
    if ua:
        q["$and"].append({"uploadDate": {"$gte": ua}})
    if ub:
        q["$and"].append({"uploadDate": {"$lte": ub}})
    if length_min is not None:
        q["$and"].append({"length": {"$gte": int(length_min)}})
    if length_max is not None:
        q["$and"].append({"length": {"$lte": int(length_max)}})
    if not q["$and"]:
        return {}
    return q
