import datetime as dt
from regression_common import CloudFlowSession, ROOT_DIR, format_datetime, save_json

TOKENS_PATH = ROOT_DIR / "ui_session_tokens.json"


def main():
    session = CloudFlowSession()
    users = {}
    for username in ("admin", "zhang", "zhao", "li", "wang"):
        token, info = session.login(username)
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
