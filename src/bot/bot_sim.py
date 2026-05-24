import os
import time
import math
import requests
import random
from io import BytesIO
from datetime import datetime, timezone
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
    _stride = int(os.getenv("BOT_PATH_STRIDE", "2"), 10)
except ValueError:
    _stride = 2
BOT_PATH_STRIDE = max(1, min(32, _stride))

def clean_id(oid):
    if isinstance(oid, dict) and "$oid" in oid:
        return oid["$oid"]
    return str(oid)


def iso_datetime_from_api(val):
    """Строка ISO или BSON Extended JSON {\"$date\": ...} из ответа API."""
    if isinstance(val, str):
        return val.replace("Z", "+00:00")
    if isinstance(val, dict) and "$date" in val:
        inner = val["$date"]
        if isinstance(inner, str):
            return inner.replace("Z", "+00:00")
        if isinstance(inner, (int, float)):
            return datetime.fromtimestamp(inner / 1000.0, tz=timezone.utc).isoformat()
        if isinstance(inner, dict) and "$numberLong" in inner:
            ms = int(inner["$numberLong"])
            return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat()
    raise TypeError(f"unsupported datetime value: {type(val)!r}")


class RobotSimulator:
    def __init__(self):
        self.battery_levels = {}
        self.paths = {}
        self._patrol_idx = {}
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

    def get_path(self, start, end, obstacles):
        try:
            matrix = self.build_collision_map(obstacles)
            grid = Grid(matrix=matrix)
            start_node = grid.node(max(0, min(GRID_SIZE-1, int(start['x']))),
                                   max(0, min(GRID_SIZE-1, int(start['y']))))
            end_node = grid.node(max(0, min(GRID_SIZE-1, int(end['x']))),
                                 max(0, min(GRID_SIZE-1, int(end['y']))))
            finder = AStarFinder(diagonal_movement=DiagonalMovement.always)
            path, _ = finder.find_path(start_node, end_node, grid)
            return path
        except: return []

    def create_scan_image(self, robot_pos, radius, visible_obstacles):
        img = Image.new("RGB", (400, 400), "#1a1a1a")
        draw = ImageDraw.Draw(img)
        cx, cy = 200, 200
        draw.ellipse([cx-radius, cy-radius, cx+radius, cy+radius], outline="#00ff00", width=2)
        for obs in visible_obstacles:
            rx1, ry1 = cx + (obs['minX'] - robot_pos['x']), cy + (obs['minY'] - robot_pos['y'])
            rx2, ry2 = cx + (obs['maxX'] - robot_pos['x']), cy + (obs['maxY'] - robot_pos['y'])
            draw.rectangle([rx1, ry1, rx2, ry2], fill="#ff4444", outline="white")
        draw.ellipse([cx-4, cy-4, cx+4, cy+4], fill="yellow")
        buf = BytesIO()
        img.save(buf, format="JPEG")
        return buf.getvalue()

    def _drain_and_send_telemetry(self, rid, tid, new_pos):
        prev = self.battery_levels.get(rid, 100.0)
        self.battery_levels[rid] = max(0.0, prev - BATTERY_DRAIN)
        b = max(0, min(100, int(self.battery_levels[rid])))
        self.session.post(
            f"{API_BASE}/robots/telemetry",
            json={
                "robotId": rid,
                "taskId": tid,
                "x": int(new_pos["x"]),
                "y": int(new_pos["y"]),
                "battery": b,
            },
        )
        if b <= 0:
            self._mark_robot_offline(rid)

    def _mark_robot_offline(self, rid):
        if rid in self._offline_rids:
            return
        try:
            resp = self.session.patch(
                f"{API_BASE}/robots/{rid}",
                json={"robotStatus": "offline"},
                timeout=15,
            )
            if resp.status_code == 200:
                self._offline_rids.add(rid)
                self.paths.pop(rid, None)
                self.session.post(
                    f"{API_BASE}/events",
                    json={
                        "type": "info",
                        "robotId": rid,
                        "message": "Robot offline (battery depleted).",
                    },
                    timeout=15,
                )
        except Exception:
            pass

    def _patrol_until_active(self, details):
        until_raw = details.get("until")
        if not until_raw:
            return True
        u_str = iso_datetime_from_api(until_raw)
        return datetime.now().timestamp() <= datetime.fromisoformat(u_str).timestamp()

    def _patrol_target(self, rid, route):
        if not route:
            return None
        if rid not in self._patrol_idx:
            self._patrol_idx[rid] = 0
        return route[self._patrol_idx[rid] % len(route)]

    def step(self, robot, task, obstacles):
        rid = clean_id(robot['_id'])
        tid = clean_id(task['_id'])
        if rid in self._offline_rids:
            return False
        if str(robot.get("robotStatus") or "").strip() == "offline":
            self._offline_rids.add(rid)
            self.paths.pop(rid, None)
            return False
        curr_pos = robot.get('coordinates') or {'x': random.randint(10,50), 'y': random.randint(10,50)}
        details = task['taskDetails']

        target = None
        if task['type'] == "moveToTarget": target = details['targetPosition']
        elif task['type'] == "scanRadius": target = details['center']
        elif task['type'] == "patrol":
            route = details.get("route") or []
            if not route:
                return False
            if not self._patrol_until_active(details):
                return True
            target = self._patrol_target(rid, route)

        if not target:
            return False

        if rid not in self.paths or not self.paths[rid]:
            p = self.get_path(curr_pos, target, obstacles)
            if not p: return False
            self.paths[rid] = p[::BOT_PATH_STRIDE]

        if self.paths[rid]:
            next_pt = self.paths[rid].pop(0)
            new_pos = {'x': next_pt[0], 'y': next_pt[1]}
        else: new_pos = curr_pos

        dist = math.hypot(target['x'] - new_pos['x'], target['y'] - new_pos['y'])
        arrive_thresh = 2 if task['type'] == 'patrol' else 12
        arrived = dist < arrive_thresh

        if task['type'] == "scanRadius" and arrived:
            r = details['radius']
            visible = [o for o in obstacles if math.hypot((o['minX']+o['maxX'])/2 - new_pos['x'],
                                                          (o['minY']+o['maxY'])/2 - new_pos['y']) <= r]
            img = self.create_scan_image(new_pos, r, visible)
            up = self.session.post(f"{API_BASE}/gridfs/upload", files={'file': ('scan.jpg', img, 'image/jpeg')})
            if up.status_code == 200:
                fid = clean_id(up.json().get('fileId'))
                self.session.post(f"{API_BASE}/events", json={
                    "type": "info", "robotId": rid, "taskId": tid,
                    "message": f"Scan found {len(visible)} objects.", "gridFsFileId": fid
                })
            self._drain_and_send_telemetry(rid, tid, new_pos)
            return True

        self._drain_and_send_telemetry(rid, tid, new_pos)

        if task['type'] == "moveToTarget" and arrived:
            return True
        if task['type'] == "patrol":
            if not self._patrol_until_active(details):
                return True
            if arrived:
                route = details.get("route") or []
                if route:
                    self._patrol_idx[rid] = (self._patrol_idx.get(rid, 0) + 1) % len(route)
                    self.paths.pop(rid, None)
            return False
        return False

    def run(self):
        self.wait_for_api()
        while True:
            try:
                t_resp = self.session.get(f"{API_BASE}/tasks?taskStatus=active")
                if t_resp.status_code == 401:
                    self.login()
                    continue

                tasks = t_resp.json()
                obstacles = self.session.get(f"{API_BASE}/obstacles?active=true").json()

                for task in tasks:
                    robots_list = task.get('executionRobots', [])
                    done_count = 0
                    for r_entry in robots_list:
                        robot_id = clean_id(r_entry['robotId'])

                        if r_entry['status'] == 'completed':
                            done_count += 1
                            continue

                        r_resp = self.session.get(f"{API_BASE}/robots/{robot_id}")
                        if r_resp.status_code == 200:
                            if self.step(r_resp.json(), task, obstacles):
                                done_count += 1

                    if done_count >= len(robots_list) and robots_list:
                        self.session.patch(f"{API_BASE}/tasks/{clean_id(task['_id'])}", json={
                            "taskStatus": "completed", "updatedAt": datetime.now().isoformat()
                        })
            except Exception as e:
                print(f"Error: {e}")
            time.sleep(BOT_LOOP_SLEEP_SEC)

if __name__ == "__main__":
    RobotSimulator().run()
