"""Bounded checks for the two recently added jobs on the development server.

Read-only by default. --trigger invokes each existing job once through the public
gateway as the supplied administrator. No task configuration, passwords, fixture
rows, runtime files or shared infrastructure are changed. Results go to stdout;
credentials and captcha images stay in memory and the login session is logged out.
"""

import argparse
import base64
import io
import json
import os
import time

import pymysql
import requests
from PIL import Image


HOST = "192.168.1.173"
ENTRY = f"http://{HOST}:18080"
HANDLERS = ("observabilityLogArchive", "hrReferralEmployment")
DEFINITION_FIELDS = ("job_id,tenant_id,service_name,handler_name,handler_param,"
                     "status,trigger_type,cron_expression,interval_ms,concurrent_flag,"
                     "misfire_strategy,retry_count,dispatch_retry_count,timeout_seconds,"
                     "lock_time_seconds,critical_flag,log_success_flag,alarm_on_fail_flag")


def query(connection, sql, params=()):
    # Polls must see committed execution reports, not a repeatable-read snapshot.
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()


def api(session, method, target, **kwargs):
    response = session.request(method, ENTRY + "/api" + target, timeout=(5, 15), **kwargs)
    response.raise_for_status()
    body = response.json()
    if body.get("code") != 200:
        # Never include a login response or request body in an error.
        raise RuntimeError(f"{method} {target}: business response code {body.get('code')}")
    return body.get("data")


def captcha_position(challenge):
    def pixels(value):
        return Image.open(io.BytesIO(base64.b64decode(value.split(",")[-1]))).convert("RGBA")
    background = pixels(challenge["bgImage"])
    slider = pixels(challenge["sliderImage"])
    edges = []
    for y in range(4, slider.height - 4, 2):
        for x in range(4, slider.width - 4, 2):
            if slider.getpixel((x, y))[3] < 240:
                continue
            for dx, dy in ((4, 0), (-4, 0), (0, 4), (0, -4)):
                if slider.getpixel((x + dx, y + dy))[3] < 30:
                    edges.append((x, y, x + dx, y + dy))
    if len(edges) < 5:
        raise RuntimeError("Captcha edges missing")

    def luminance(x, y):
        red, green, blue, _ = background.getpixel((x, y))
        return red * .2126 + green * .7152 + blue * .0722

    def score(position):
        return sum(luminance(position + x, challenge["y"] + y)
                   - luminance(position + dx, challenge["y"] + dy)
                   for x, y, dx, dy in edges)
    return max(range(slider.width, background.width - slider.width), key=score)


def login(session, tenant_code):
    challenge = api(session, "GET", "/auth/captcha/slider")
    passed = api(session, "POST", "/auth/captcha/check", json={
        "uuid": challenge["uuid"], "x": captcha_position(challenge)})
    release = api(session, "GET", "/auth/legal/public/active", params={"tenantCode": tenant_code})
    result = api(session, "POST", "/auth/login", json={
        "tenantCode": tenant_code, "username": os.environ["CLOUDFLOW_TEST_ADMIN_USERNAME"],
        "password": os.environ["CLOUDFLOW_TEST_ADMIN_PASSWORD"],
        "captchaToken": passed["passToken"], "legalReleaseCode": release["releaseCode"]})
    if not result.get("token") or result.get("requiresTotp"):
        raise RuntimeError("Administrator login did not return a usable session")
    token = result["token"]
    session.headers["Authorization"] = token if token.startswith("Bearer ") else "Bearer " + token
    csrf = session.cookies.get("XSRF-TOKEN")
    if csrf:
        session.headers["X-CSRF-Token"] = csrf
    print("LOGIN", json.dumps({"authenticated": True,
                                "forcePasswordChange": result.get("forcePasswordChange")}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--trigger", action="store_true", help="Invoke each existing job once")
    args = parser.parse_args()
    if args.trigger:
        for name in ("CLOUDFLOW_TEST_ADMIN_USERNAME", "CLOUDFLOW_TEST_ADMIN_PASSWORD"):
            if not os.environ.get(name):
                raise RuntimeError("Missing required environment variable: " + name)
    connection = pymysql.connect(host=HOST, user=os.environ.get("DB_USERNAME", "root"),
        password=os.environ["CLOUDFLOW_DB_PASSWORD"], database="cloud_flow_db", charset="utf8mb4",
        autocommit=True, connect_timeout=10, read_timeout=15, cursorclass=pymysql.cursors.DictCursor)
    session = requests.Session()
    session.trust_env = False
    session.headers["Origin"] = ENTRY
    session.headers["Referer"] = ENTRY + "/"
    signed_in = False
    try:
        definitions = query(connection, "SELECT " + DEFINITION_FIELDS
            + " FROM sys_job WHERE deleted=0 AND handler_name IN (%s,%s) ORDER BY handler_name", HANDLERS)
        if len(definitions) != 2 or any(row["tenant_id"] != 100000 for row in definitions):
            raise RuntimeError("Expected the two installed default-tenant jobs")
        heartbeats = query(connection, "SELECT service_name,handler_name,status,"
            "TIMESTAMPDIFF(SECOND,last_report_time,NOW()) AS age_seconds FROM sys_job_handler "
            "WHERE handler_name IN (%s,%s) ORDER BY handler_name", HANDLERS)
        if (len(heartbeats) != 2 or any(row["status"] != "ONLINE" or row["age_seconds"] is None
                                      or not 0 <= row["age_seconds"] <= 180 for row in heartbeats)):
            raise RuntimeError("A selected job handler has no recent online heartbeat")
        natural = query(connection, "SELECT execute_no,execute_status,affected_rows,result_msg,"
            "start_time,end_time,report_time FROM sys_job_log WHERE handler_name=%s "
            "AND trigger_type='CRON' ORDER BY log_id DESC LIMIT 1", ("hrReferralEmployment",))
        if not natural or natural[0]["execute_status"] != "SUCCESS" or not natural[0]["report_time"]:
            raise RuntimeError("No successful naturally scheduled referral scan with a report")
        print("HEARTBEATS", json.dumps(heartbeats, ensure_ascii=False), flush=True)
        print("REFERRAL_NATURAL", json.dumps(natural[0], ensure_ascii=False, default=str), flush=True)
        if not args.trigger:
            return

        tenants = query(connection, "SELECT tenant_code FROM sys_tenant WHERE tenant_id=100000 "
                        "AND status='0' AND deleted=0")
        if len(tenants) != 1:
            raise RuntimeError("Default tenant is unavailable")
        login(session, tenants[0]["tenant_code"])
        signed_in = True
        for job in definitions:
            job_id = job["job_id"]
            detail = api(session, "GET", f"/auth/system/job/{job_id}")
            if detail["handlerName"] != job["handler_name"]:
                raise RuntimeError("Task API returned a different handler")
            result = api(session, "POST", f"/auth/system/job/{job_id}/trigger", json={})
            if not result.get("accepted") or not result.get("executeNo"):
                raise RuntimeError("Task was not accepted: " + job["handler_name"])
            deadline = time.monotonic() + 20
            while True:
                logs = query(connection, "SELECT log_id,execute_no,trigger_type,trigger_by,execute_status,"
                    "affected_rows,result_msg,start_time,end_time,report_time,duration_ms,"
                    "executor_ip,dispatcher_ip FROM sys_job_log WHERE execute_no=%s", (result["executeNo"],))
                if logs and logs[0]["execute_status"] != "RUNNING":
                    break
                if time.monotonic() >= deadline:
                    raise RuntimeError("Task report was not completed within 20 seconds")
                time.sleep(.5)
            log = logs[0]
            if (log["execute_status"] != "SUCCESS" or log["trigger_type"] != "MANUAL"
                    or log["trigger_by"] != os.environ["CLOUDFLOW_TEST_ADMIN_USERNAME"]
                    or not all(log[field] is not None for field in
                               ("affected_rows", "start_time", "end_time", "report_time", "duration_ms"))
                    or log["executor_ip"] != HOST or log["dispatcher_ip"] != HOST):
                raise RuntimeError("Task execution or its platform report was incomplete")
            stored = api(session, "GET", f"/auth/system/job/log/{log['log_id']}")
            if stored["executeNo"] != result["executeNo"] or stored["executeStatus"] != "SUCCESS":
                raise RuntimeError("Task log API did not match the committed report")
            print("MANUAL", json.dumps({"handler": job["handler_name"], **log},
                                        ensure_ascii=False, default=str), flush=True)
        current = query(connection, "SELECT " + DEFINITION_FIELDS
            + " FROM sys_job WHERE deleted=0 AND handler_name IN (%s,%s) ORDER BY handler_name", HANDLERS)
        if current != definitions:
            raise RuntimeError("A task definition changed during these checks")
        print("PASS task_definitions_preserved=true; fixture_rows=0; local_artifacts=0", flush=True)
    finally:
        try:
            if signed_in:
                api(session, "POST", "/auth/logout")
                print("LOGOUT session_invalidated=true", flush=True)
        finally:
            session.close()
            connection.close()


if __name__ == "__main__":
    main()
