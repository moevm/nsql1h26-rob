import sys

from pymongo import ASCENDING, DESCENDING

from src.db.database import get_client, get_db
from src.db.load_dump import link_seed_events_to_gridfs, load_seed_json_if_empty, seed_gridfs_if_empty
from src.db.schemas import COLLECTION_SCHEMAS

_DROP_ORDER = ("events", "tasks", "robots", "groups", "obstacles", "fs.chunks", "fs.files")


def _drop_collections(db):
    for name in _DROP_ORDER:
        if name in db.list_collection_names():
            db.drop_collection(name)


def _ensure_validators(db):
    for coll_name, schema in COLLECTION_SCHEMAS.items():
        validator = {"$jsonSchema": schema}
        if coll_name in db.list_collection_names():
            db.command(
                {
                    "collMod": coll_name,
                    "validator": validator,
                    "validationLevel": "strict",
                    "validationAction": "error",
                }
            )
        else:
            db.create_collection(
                coll_name,
                validator=validator,
                validationLevel="strict",
                validationAction="error",
            )


def _ensure_indexes(db):
    indexes = [
        ("groups", [("name", ASCENDING)]),
        ("groups", [("status", ASCENDING)]),
        ("groups", [("createdAt", DESCENDING)]),
        ("robots", [("groupId", ASCENDING), ("updatedAt", DESCENDING)]),

        # Events
        ("events", [("robotId", ASCENDING), ("timestamp", DESCENDING)]),
        ("events", [("type", ASCENDING), ("timestamp", DESCENDING)]),
        ("events", [("position.x", ASCENDING), ("position.y", ASCENDING)]),
        ("events", [("speed", DESCENDING)]),
        ("events", [("gridFsFileId", ASCENDING)]),
        ("events", [("robotId", ASCENDING), ("metric.key", ASCENDING), ("timestamp", DESCENDING)]),
        ("events", [("taskId", ASCENDING), ("timestamp", DESCENDING)]),

        # Tasks
        ("tasks", [("groupId", ASCENDING), ("taskStatus", ASCENDING)]),
        ("obstacles", [("active", ASCENDING)]),
        ("obstacles", [("createdAt", DESCENDING)]),
        (
            "obstacles",
            [("minX", ASCENDING), ("maxX", ASCENDING), ("minY", ASCENDING), ("maxY", ASCENDING)],
        ),
    ]
    for coll_name, keys in indexes:
        db[coll_name].create_index(keys)


def init_database(drop=False):
    client = get_client()
    db = get_db()
    if drop:
        _drop_collections(db)
    _ensure_validators(db)
    _ensure_indexes(db)
    client.admin.command("ping")
    load_seed_json_if_empty(db)
    seed_gridfs_if_empty(db)
    link_seed_events_to_gridfs(db)


def main():
    drop = "--drop" in sys.argv
    try:
        init_database(drop=drop)
    except Exception as exc:
        print("init_db failed:", exc, file=sys.stderr)
        return 1
    print("MongoDB: коллекции, валидаторы и индексы готовы.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
