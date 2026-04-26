"""JSON Schema ($jsonSchema) для валидации документов MongoDB."""

_EVENT_TYPES = [
    "battery_low",
    "battery_critical",
    "battery_delta",
    "task_created",
    "task_start",
    "task_complete",
    "task_failed",
    "error",
    "warning",
    "info",
    "track_point",
    "status_change",
    "metric_change",
    "visual_capture",
]

_XY_POINT = {
    "bsonType": ["object", "null"],
    "additionalProperties": False,
    "required": ["x", "y"],
    "properties": {
        "x": {"bsonType": "int"},
        "y": {"bsonType": "int"},
    },
}

GROUPS_JSON_SCHEMA = {
    "bsonType": "object",
    "required": ["name", "status", "createdAt", "updatedAt"],
    "additionalProperties": False,
    "properties": {
        "_id": {"bsonType": "objectId"},
        "name": {"bsonType": "string", "minLength": 1},
        "description": {"bsonType": ["string", "null"]},
        "status": {
            "bsonType": "string",
            "enum": ["active", "inactive", "paused", "error"],
        },
        "createdAt": {"bsonType": "date"},
        "updatedAt": {"bsonType": "date"},
    },
}

ROBOTS_JSON_SCHEMA = {
    "bsonType": "object",
    "required": ["name", "groupId", "model", "scanRadius", "weight", "createdAt", "updatedAt"],
    "additionalProperties": False,
    "properties": {
        "_id": {"bsonType": "objectId"},
        "name": {"bsonType": "string", "minLength": 1},
        "scanRadius": {"bsonType": ["double", "int"]},
        "weight": {"bsonType": "int"},
        "groupId": {"bsonType": "objectId"},
        "groupName": {"bsonType": ["string", "null"]},
        "model": {"bsonType": "string", "minLength": 1},
        "coordinates": {
            "bsonType": ["object", "null"],
            "additionalProperties": False,
            "required": ["x", "y"],
            "properties": {"x": {"bsonType": "int"}, "y": {"bsonType": "int"}},
        },
        "comments": {"bsonType": ["string", "null"], "maxLength": 512},
        "createdAt": {"bsonType": "date"},
        "updatedAt": {"bsonType": "date"},
    },
}

EVENTS_JSON_SCHEMA = {
    "bsonType": "object",
    "required": ["type", "timestamp"],
    "additionalProperties": False,
    "properties": {
        "_id": {"bsonType": "objectId"},
        "robotId": {"bsonType": ["objectId", "null"]},
        "taskId": {"bsonType": ["objectId", "null"]},
        "type": {"bsonType": "string", "enum": _EVENT_TYPES},
        "message": {"bsonType": ["string", "null"], "minLength": 1},
        "position": _XY_POINT,
        "prevPosition": _XY_POINT,
        "target": _XY_POINT,
        "speed": {"bsonType": ["double", "null"]},
        "prevTimestamp": {"bsonType": ["date", "null"]},
        "metric": {
            "bsonType": ["object", "null"],
            "additionalProperties": False,
            "required": ["key", "from", "to"],
            "properties": {
                "key": {"bsonType": "string"},
                "from": {"bsonType": ["double", "int", "null"]},
                "to": {"bsonType": ["double", "int", "null"]},
            },
        },
        "gridFsFileId": {"bsonType": ["objectId", "null"]},
        "description": {"bsonType": ["string", "null"]},
        "timestamp": {"bsonType": "date"},
        # Spec includes createdAt; not required for seed/API writes.
        "createdAt": {"bsonType": ["date", "null"]},
    },
}

TASKS_JSON_SCHEMA = {
    "bsonType": "object",
    "required": ["name", "groupId", "type", "taskStatus", "createdAt", "taskDetails", "updatedAt"],
    "additionalProperties": False,
    "properties": {
        "_id": {"bsonType": "objectId"},
        "name": {"bsonType": "string", "minLength": 1},
        "groupId": {"bsonType": "objectId"},
        "groupName": {"bsonType": ["string", "null"]},
        "executionRobots": {
            "bsonType": ["array", "null"],
            "items": {
                "bsonType": "object",
                "additionalProperties": False,
                "required": ["robotId", "assignedAt", "status"],
                "properties": {
                    "robotId": {"bsonType": "objectId"},
                    "assignedAt": {"bsonType": "date"},
                    "removedAt": {"bsonType": ["date", "null"]},
                    "status": {
                        "bsonType": "string",
                        "enum": ["assigned", "working", "completed", "removed"],
                    },
                },
            },
        },
        "type": {
            "bsonType": "string",
            "enum": ["moveToTarget", "patrol", "scanRadius", "custom"],
        },
        "taskDetails": {
            "bsonType": "object",
            "additionalProperties": True,
        },
        "taskStatus": {
            "bsonType": "string",
            "enum": ["active", "paused", "completed", "cancelled", "failed"],
        },
        "plannedRoute": {
            "bsonType": ["object", "null"],
            "additionalProperties": False,
            "properties": {
                "points": {
                    "bsonType": "array",
                    "items": {
                        # Spec text: array of [int, int]
                        "bsonType": "array",
                        "minItems": 2,
                        "maxItems": 2,
                        "items": {"bsonType": "int"},
                    },
                }
            },
        },
        "startTime": {"bsonType": ["date", "null"]},
        "endTime": {"bsonType": ["date", "null"]},
        "createdAt": {"bsonType": "date"},
        "updatedAt": {"bsonType": "date"},
    },
    "oneOf": [
        {
            "required": ["type", "taskDetails"],
            "properties": {
                "type": {"enum": ["moveToTarget"]},
                "taskDetails": {
                    "bsonType": "object",
                    "additionalProperties": False,
                    "required": ["targetPosition"],
                    "properties": {
                        "targetPosition": {
                            "bsonType": "object",
                            "additionalProperties": False,
                            "required": ["x", "y"],
                            "properties": {"x": {"bsonType": "int"}, "y": {"bsonType": "int"}},
                        }
                    },
                },
            },
        },
        {
            "required": ["type", "taskDetails"],
            "properties": {
                "type": {"enum": ["patrol"]},
                "taskDetails": {
                    "bsonType": "object",
                    "additionalProperties": False,
                    "required": ["route", "until"],
                    "properties": {
                        "route": {
                            "bsonType": "array",
                            "items": {
                                "bsonType": "object",
                                "additionalProperties": False,
                                "required": ["x", "y"],
                                "properties": {"x": {"bsonType": "int"}, "y": {"bsonType": "int"}},
                            },
                        },
                        "until": {"bsonType": "date"},
                    },
                },
            },
        },
        {
            "required": ["type", "taskDetails"],
            "properties": {
                "type": {"enum": ["scanRadius"]},
                "taskDetails": {
                    "bsonType": "object",
                    "additionalProperties": False,
                    "required": ["center", "radius"],
                    "properties": {
                        "center": {
                            "bsonType": "object",
                            "additionalProperties": False,
                            "required": ["x", "y"],
                            "properties": {"x": {"bsonType": "int"}, "y": {"bsonType": "int"}},
                        },
                        "radius": {"bsonType": "int"},
                    },
                },
            },
        },
        {
            "required": ["type", "taskDetails"],
            "properties": {
                "type": {"enum": ["custom"]},
                "taskDetails": {
                    "bsonType": "object",
                    "additionalProperties": False,
                    "required": ["parameters"],
                    "properties": {"parameters": {"bsonType": "string", "maxLength": 512}},
                },
            },
        },
    ],
}

OBSTACLES_JSON_SCHEMA = {
    "bsonType": "object",
    "required": ["points", "minX", "maxX", "minY", "maxY", "active", "createdAt"],
    "additionalProperties": False,
    "properties": {
        "_id": {"bsonType": "objectId"},
        "points": {
            "bsonType": "array",
            "items": {
                "bsonType": "array",
                "items": {"bsonType": "int"},
            },
        },
        "minX": {"bsonType": "int"},
        "maxX": {"bsonType": "int"},
        "minY": {"bsonType": "int"},
        "maxY": {"bsonType": "int"},
        "name": {"bsonType": ["string", "null"], "minLength": 1},
        "active": {"bsonType": "bool"},
        "createdAt": {"bsonType": "date"},
        "updatedAt": {"bsonType": ["date", "null"]},
    },
}

USERS_JSON_SCHEMA = {
    "bsonType": "object",
    "required": ["username", "passwordHash", "role", "active", "createdAt", "updatedAt"],
    "additionalProperties": False,
    "properties": {
        "_id": {"bsonType": "objectId"},
        "username": {"bsonType": "string", "minLength": 1, "maxLength": 64},
        "passwordHash": {"bsonType": "string"},
        "role": {"bsonType": "string", "enum": ["user", "admin"]},
        "active": {"bsonType": "bool"},
        "createdAt": {"bsonType": "date"},
        "updatedAt": {"bsonType": "date"},
    },
}

COLLECTION_SCHEMAS = {
    "groups": GROUPS_JSON_SCHEMA,
    "robots": ROBOTS_JSON_SCHEMA,
    "events": EVENTS_JSON_SCHEMA,
    "tasks": TASKS_JSON_SCHEMA,
    "obstacles": OBSTACLES_JSON_SCHEMA,
    "users": USERS_JSON_SCHEMA,
}
