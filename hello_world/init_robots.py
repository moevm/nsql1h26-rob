from pymongo import MongoClient
from datetime import datetime

# Соединение с бд
client = MongoClient("robot_mongodb", 27017)
db = client["robot_control"]

# Для теста затираем предыдущие данные
db.groups.drop()
db.robots.drop()
db.obstacles.drop()

# Данные-болванки для теста
groups = [
    {
        "groupId": "1",
        "name": "Группа 1",
        "taskQuery": [
            {"taskId": "101", "taskType": "patrol", "taskStatus": "processing"},
            {"taskId": "102", "taskType": "inspection", "taskStatus": "not_started"},
        ],
        "logFile": "/logs/group1.log",
        "currentTaskId": "101",
        "created": datetime.now(),
    }
]

robots = [
    {
        "id": "1",
        "model": "Explorer",
        "status": "online",
        "battery": 78,
        "location": {"type": "Point", "coordinates": [37.615, 55.755]},
        "creation_time": datetime.now(),
        "currentTaskId": "101",
        "photos": [
            {
                "photoId": "1001",
                "taskId": "101",
                "time": datetime.now(),
                "location": {"type": "Point", "coordinates": [37.612, 55.752]},
                "pngName": "dummy/photos/robot1/photo001.png",
            }
        ],
        "trajectory": None,
        "logs": None,
    },
    {
        "id": "2",
        "model": "Explorer",
        "status": "charging",
        "battery": 45,
        "location": {"type": "Point", "coordinates": [37.625, 55.765]},
        "creation_time": datetime.now(),
        "currentTaskId": None,
        "photos": [],
        "trajectory": None,
        "logs": None,
    },
]

# Примерный вид препятствий
obstacles = [
    {
        "obstacleId": "501",
        "type": "wall",
        "location": {
            "type": "Polygon",
            # Обязательное замыкание многоульника
            "coordinates": [
                [
                    [37.60, 55.74],
                    [37.61, 55.74],
                    [37.61, 55.75],
                    [37.60, 55.75],
                    [37.60, 55.74],
                ]
            ],
        },
        "height": 2.5,
        "detected_at": datetime.now(),
        "taskId": "101",
    }
]

# Вставка данных и вывод для теста
db.groups.insert_one(groups[0])
db.robots.insert_many(robots)
db.obstacles.insert_one(obstacles[0])

print("Группа:", db.groups.find_one({"groupId": "1"}))

client.close()
