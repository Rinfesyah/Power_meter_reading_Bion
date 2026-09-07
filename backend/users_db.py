"""
users_db.py — User database helpers for Power Meter Reading Bion
Stores users in database/users.json
Auto-seeds a default Admin account on first run.
"""

import os
import json
import uuid
from datetime import datetime, timezone
from auth import hash_password

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_DB_PATH = os.path.abspath(os.path.join(BACKEND_DIR, "..", "database", "users.json"))


def read_users() -> list:
    if not os.path.exists(USERS_DB_PATH):
        return []
    try:
        with open(USERS_DB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def write_users(users: list) -> None:
    os.makedirs(os.path.dirname(USERS_DB_PATH), exist_ok=True)
    with open(USERS_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2, ensure_ascii=False)


def find_user_by_username(username: str) -> dict | None:
    users = read_users()
    for u in users:
        if u.get("username", "").lower() == username.lower():
            return u
    return None


def find_user_by_id(user_id: str) -> dict | None:
    users = read_users()
    for u in users:
        if u.get("id") == user_id:
            return u
    return None


def seed_default_admin():
    """
    Create a default Admin account if no users exist yet.
    Default credentials: admin / admin123
    """
    users = read_users()
    if len(users) == 0:
        default_admin = {
            "id": str(uuid.uuid4()),
            "username": "admin",
            "fullName": "System Administrator",
            "password_hash": hash_password("admin123"),
            "role": "Admin",
            "isActive": True,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        write_users([default_admin])
        print("[USERS] Default admin account created. Username: admin, Password: admin123")
        print("[USERS] *** PLEASE CHANGE THE DEFAULT PASSWORD AFTER FIRST LOGIN! ***")
