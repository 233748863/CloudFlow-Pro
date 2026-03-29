import datetime as dt
import json
import sys

import redis

from regression_common import CloudFlowSession, ROOT_DIR, format_datetime, save_json

TOKENS_PATH = ROOT_DIR / "ui_session_tokens.json"
LOCAL_CAPTCHA_LIMIT_KEY = "CAPTCHA:LIMIT:127.0.0.1"
DEFAULT_USERS = ("admin", "zhang", "zhao", "li", "wang")


def load_existing_tokens():
    if not TOKENS_PATH.exists():
        return {"generatedAt": None, "users": {}}
    try:
        return json.loads(TOKENS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"generatedAt": None, "users": {}}


def clear_local_captcha_limit():
    """本机回归时若命中验证码日限流，仅清理 127.0.0.1 的计数键。"""
    client = redis.Redis(
        host="192.168.1.173",
        port=6379,
        password="Juwangkeji@2025",
        db=0,
        decode_responses=True,
    )
    return client.delete(LOCAL_CAPTCHA_LIMIT_KEY)


def login_with_retry(session: CloudFlowSession, username: str):
    try:
        return session.login(username)
    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        if "今日验证次数已达上限" not in message:
            raise
        clear_local_captcha_limit()
        return session.login(username)


def main():
    target_users = tuple(sys.argv[1:]) or DEFAULT_USERS
    session = CloudFlowSession()
    existing = load_existing_tokens()
    users = dict(existing.get("users", {}))

    for username in target_users:
        token, info = login_with_retry(session, username)
        user = info["user"]
        users[username] = {
            "token": token,
            "userId": user["userId"],
            "userName": user["userName"],
            "nickName": user.get("nickName"),
            "role": user.get("role"),
            "deptId": user.get("deptId"),
            "deptName": user.get("deptName"),
            "tenantId": user.get("tenantId"),
            "avatar": user.get("avatar"),
            "email": user.get("email"),
            "phone": user.get("phonenumber"),
        }

    payload = {
        "generatedAt": format_datetime(dt.datetime.now()),
        "users": users,
    }
    save_json(TOKENS_PATH, payload)
    print(f"UI_TOKENS_READY {TOKENS_PATH}")


if __name__ == "__main__":
    main()
