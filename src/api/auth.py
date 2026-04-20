import os
import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from jose import JWTError, jwt

from src.db.database import get_db

_PBKDF2_ITERS_DEFAULT = 210_000


def _b64u_decode(s):
    pad = "=" * ((4 - len(s) % 4) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _pbkdf2_iters():
    try:
        n = int(os.environ.get("AUTH_PBKDF2_ITERS", str(_PBKDF2_ITERS_DEFAULT)))
    except ValueError:
        n = _PBKDF2_ITERS_DEFAULT
    return max(10_000, min(n, 2_000_000))


def _secret():
    return os.environ.get("AUTH_JWT_SECRET", "dev-secret-change-me")


def _ttl_minutes():
    try:
        return int(os.environ.get("AUTH_JWT_TTL_MIN", "720"))
    except ValueError:
        return 720


def hash_password(plain):
    iters = _pbkdf2_iters()
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, iters, dklen=32)
    salt_b64 = base64.urlsafe_b64encode(salt).decode("ascii").rstrip("=")
    dk_b64 = base64.urlsafe_b64encode(dk).decode("ascii").rstrip("=")
    return f"pbkdf2_sha256${iters}${salt_b64}${dk_b64}"


def verify_password(plain, hashed):
    if not hashed:
        return False
    if hashed.startswith("pbkdf2_sha256$"):
        try:
            _, iters_s, salt_b64, dk_b64 = hashed.split("$", 3)
            iters = int(iters_s)
            salt = _b64u_decode(salt_b64)
            dk_expected = _b64u_decode(dk_b64)
            dk = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, iters, dklen=len(dk_expected))
            return hmac.compare_digest(dk, dk_expected)
        except Exception:
            return False
    return False


def issue_token(*, username, role):
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=_ttl_minutes())
    payload = {"sub": username, "role": role, "iat": int(now.timestamp()), "exp": int(exp.timestamp())}
    return jwt.encode(payload, _secret(), algorithm="HS256")


def decode_token(token):
    try:
        data = jwt.decode(token, _secret(), algorithms=["HS256"])
        if not isinstance(data, dict):
            raise HTTPException(status_code=401, detail="Invalid token")
        return data
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


def authenticate(username, password):
    u = get_db()["users"].find_one({"username": username, "active": True})
    if not u:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(password, str(u.get("passwordHash", ""))):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    role = str(u.get("role") or "user")
    if role not in ("admin", "user"):
        role = "user"
    return {"username": username, "role": role}

