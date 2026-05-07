import os
import time
import math
import requests
import random
from io import BytesIO
from datetime import datetime
from PIL import Image, ImageDraw

from pathfinding.core.grid import Grid
from pathfinding.finder.a_star import AStarFinder
from pathfinding.core.diagonal_movement import DiagonalMovement

API_BASE = os.getenv("API_URL", "http://web:8000/api")
USERNAME = os.getenv("BOT_USERNAME", "admin")
PASSWORD = os.getenv("BOT_PASSWORD", "admin")

GRID_SIZE = 500

try:
    _bd = float(os.getenv("BOT_BATTERY_DRAIN", "0.45"))
except ValueError:
    _bd = 0.45
BATTERY_DRAIN = max(0.01, min(25.0, _bd))

try:
    _loop = float(os.getenv("BOT_LOOP_SLEEP_SEC", "1.0"))
except ValueError:
    _loop = 1.0
BOT_LOOP_SLEEP_SEC = max(0.15, min(30.0, _loop))

try:
    _stride = int(os.getenv("BOT_PATH_STRIDE", "4"), 10)
except ValueError:
    _stride = 4
BOT_PATH_STRIDE = max(1, min(32, _stride))

def clean_id(oid):
    if isinstance(oid, dict) and "$oid" in oid:
        return oid["$oid"]
    return str(oid)

class RobotSimulator:
    def __init__(self):
        self.battery_levels = {}
        self.paths = {}
        self.session = requests.Session()
        self._offline_rids = set()

    def login(self):
        try:
            resp = requests.post(f"{API_BASE}/auth/login", json={
                "username": USERNAME, "password": PASSWORD
            }, timeout=5)
            if resp.status_code == 200:
                token = resp.json().get("access_token")
                self.session.headers.update({"Authorization": f"Bearer {token}"})
                return True
        except: pass
        return False

    def wait_for_api(self):
        while not self.login():
            time.sleep(3)

    def build_collision_map(self, obstacles):
        matrix = [[1 for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
        for obs in obstacles:
            for x in range(max(0, int(obs['minX'])), min(GRID_SIZE, int(obs['maxX']) + 1)):
                for y in range(max(0, int(obs['minY'])), min(GRID_SIZE, int(obs['maxY']) + 1)):
                    matrix[y][x] = 0
        return matrix

if __name__ == "__main__":
    RobotSimulator().run()
