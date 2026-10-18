"""Bounded real HTTP workflow checks on the development server; no external calls.

The timer keeps its original deadline and uses the installed 180-second scan.
Only test-owned process definitions are archived at the end. Credentials stay in
environment variables, session tokens in memory; output contains evidence only.
Run scripts sharing these users sequentially: a new login replaces the old one.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import time
import pymysql
import requests

spec = importlib.util.spec_from_file_location("job_smoke", Path(__file__).with_name("check-server-job-smoke.py"))
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)
api = support.api
query = support.query
TAG = "SPECIAL_" + time.strftime("%Y%m%d_%H%M%S")
checks = []


def check(label, condition):
    if not condition:
        raise AssertionError(label)
    checks.append(label)
    print("PASS " + label, flush=True)


def login(username):
    session = requests.Session()
    session.trust_env = False
    session.headers.update(Origin=support.ENTRY, Referer=support.ENTRY + "/")
    previous = os.environ["CLOUDFLOW_TEST_ADMIN_USERNAME"]
    try:
        os.environ["CLOUDFLOW_TEST_ADMIN_USERNAME"] = username
        support.login(session, "xinyuan")
    finally:
        os.environ["CLOUDFLOW_TEST_ADMIN_USERNAME"] = previous
    return session


def instance(connection, instance_id):
    return query(connection, "SELECT instance_id,status,variables FROM wf_process_instance "
                 "WHERE tenant_id=100000 AND instance_id=%s", (instance_id,))[0]


def tasks(connection, instance_id):
    return query(connection, "SELECT task_id,node_key,assignee,status FROM wf_task "
                 "WHERE tenant_id=100000 AND instance_id=%s AND status='TODO' ORDER BY create_time,task_id", (instance_id,))


def server_ms(connection):
    return query(connection, "SELECT CAST(UNIX_TIMESTAMP(NOW(3))*1000 AS UNSIGNED) AS at_ms")[0]["at_ms"]


def definition(session, suffix, middle, links):
    key = TAG + "_" + suffix
    form = api(session, "POST", "/workflow/wf/form/save", json={"formKey": key, "formName": key,
        "fieldsJson": json.dumps([{"id": "note", "type": "TEXT", "label": "说明"},
                                   {"id": "choice", "type": "TEXT", "label": "选择"}])})
    form_id = form.get("formId", form.get("id"))
    graph = {"nodes": [{"id": "start", "type": "START", "title": "发起"}, *middle,
                        {"id": "end", "type": "END", "title": "结束"}], "edges": links}
    saved = api(session, "POST", "/workflow/wf/definition/save", json={"processKey": key,
        "processName": key, "formId": form_id, "modelJson": json.dumps(graph),
        "startPermissionType": "ALL", "startPermissionValue": "[]"})
    definition_id = saved.get("definitionId", saved.get("id"))
    api(session, "POST", "/workflow/wf/definition/deploy/" + definition_id, json={})
    return definition_id


def edge(source, target, **attributes):
    return {"id": source + "-" + target, "source": source, "target": target, **attributes}


def start_draft(session, definition_id, title, choice="approve"):
    context = api(session, "GET", "/workflow/wf/draft/context/" + definition_id)
    draft = api(session, "POST", "/workflow/wf/draft", json={"definitionId": definition_id,
        "expectedVersion": 0, "loadedContextHash": context["contextHash"], "title": title,
        "formData": {"note": title, "choice": choice}, "nodeAssignees": {}})
    restored = api(session, "GET", "/workflow/wf/draft/" + draft["draftId"])
    check("draft_restored_" + choice, restored["formData"] == {"note": title, "choice": choice})
    result = api(session, "POST", "/workflow/wf/start", json={"draftId": draft["draftId"] ,
                                                           "expectedVersion": draft["lockVersion"]})
    return result.get("instanceId", result.get("processInstanceId")), draft["draftId"]


def archive(session, definition_ids):
    if not definition_ids:
        return
    result = cleanup_api(session, "POST", "/workflow/batch/archive", json={
        "workflowIds": definition_ids, "reason": TAG + " verification complete"})
    if result["successCount"] != len(definition_ids) or result["failedCount"] != 0:
        raise RuntimeError("Test definitions could not be archived: " + json.dumps(result, ensure_ascii=False))


def cleanup_api(session, method, target, **kwargs):
    """Recover an expired administrator session once, only for owned cleanup."""
    try:
        return api(session, method, target, **kwargs)
    except requests.HTTPError as error:
        if error.response is None or error.response.status_code != 401:
            raise
        support.login(session, "xinyuan")
        return api(session, method, target, **kwargs)


def close_sessions(sessions, connection):
    errors = []
    try:
        for session in sessions:
            try:
                api(session, "POST", "/auth/logout")
            except requests.HTTPError as error:
                if error.response is None or error.response.status_code != 401:
                    errors.append(error)
            except Exception as error:
                errors.append(error)
            finally:
                session.close()
    finally:
        connection.close()
    if errors:
        raise errors[0]


def workflows(connection, admin, approver, outsider, case="all"):
    definitions = []
    instances = []
    try:
        approval = {"type": "APPROVAL", "approverType": "USER", "approverValue": "2",
                    "allowEdit": True, "rejectStrategy": "TERMINATE"}
        definition_id = definition(admin, "APPROVAL", [
            {"id": "route", "type": "ROUTE", "title": "条件路由"},
            {"id": "approve", "title": "通过分支", **approval},
            {"id": "reject", "title": "驳回分支", **approval}], [edge("start", "route"),
            edge("route", "approve", condition="#choice == 'approve'"),
            edge("route", "reject", isDefault=True), edge("approve", "end"), edge("reject", "end")]) if case != "timer" else None
        if definition_id:
            definitions.append(definition_id)
        for choice, action in ((("approve", "APPROVE"), ("reject", "REJECT")) if definition_id else ()):
            instance_id, draft_id = start_draft(admin, definition_id, TAG + "_" + choice, choice)
            instances.append(instance_id)
            pending = tasks(connection, instance_id)
            check("exclusive_route_" + choice, len(pending) == 1 and pending[0]["node_key"] == choice
                  and pending[0]["assignee"] == 2)
            task_id = pending[0]["task_id"]
            # A regular unassigned user must be denied; administrators can handle tasks.
            response = outsider.post(support.ENTRY + "/api/workflow/wf/complete", json={"taskId": task_id,
                "action": action, "comment": TAG}, timeout=(5, 15))
            body = response.json()
            check("non_assignee_denied_" + choice, response.status_code == 403
                  and body.get("code") == "PERMISSION_DENIED"
                  and tasks(connection, instance_id) == pending)
            api(approver, "GET", "/workflow/wf/todo/" + task_id)
            api(approver, "POST", "/workflow/wf/complete", json={"taskId": task_id, "action": action, "comment": TAG})
            expected = "PASSED" if action == "APPROVE" else "REJECTED"
            check("approval_terminal_" + choice, instance(connection, instance_id)["status"] == expected
                  and not tasks(connection, instance_id))
            draft_row = query(connection, "SELECT draft_id FROM wf_form_draft WHERE tenant_id=100000 AND draft_id=%s", (draft_id,))
            check("draft_consumed_" + choice, not draft_row)
            api(admin, "GET", "/workflow/wf/instance/" + instance_id + "/trace")
            print("APPROVAL", json.dumps({"instanceId": instance_id, "branch": choice, "status": expected}), flush=True)

        if case == "approval":
            return
        timer_definition = definition(admin, "TIMER", [{"id": "timer", "type": "TIMER", "title": "自然一分钟",
            "props": {"timerType": "DELAY", "delayValue": 1, "delayUnit": "MINUTE", "timerAction": "AUTO_PASS"}}],
            [edge("start", "timer"), edge("timer", "end")])
        definitions.append(timer_definition)
        requested_at = server_ms(connection)
        timer_id, _ = start_draft(admin, timer_definition, TAG + "_timer", "timer")
        instances.append(timer_id)
        initial = instance(connection, timer_id)
        waits = [wait for wait in json.loads(initial["variables"])["_wf_waits"].values() if wait["kind"] == "TIMER"]
        check("timer_wait_created", initial["status"] == "PENDING" and len(waits) == 1)
        expires = waits[0]["payload"]["expireAt"]
        check("timer_original_deadline", requested_at + 59000 <= expires <= server_ms(connection) + 60000)
        print("TIMER_WAIT", json.dumps({"instanceId": timer_id, "expireAt": expires, "manualTriggers": 0,
                                      "clockChanges": 0, "deadlineWrites": 0}), flush=True)
        limit = time.monotonic() + 300
        next_progress = 0
        early = 0
        while time.monotonic() < limit:
            current = instance(connection, timer_id)
            now = server_ms(connection)
            if now < expires - 1000:
                check_wait = next(wait for wait in json.loads(current["variables"])["_wf_waits"].values()
                                  if wait["waitId"] == waits[0]["waitId"])
                if current["status"] != "PENDING" or check_wait["payload"]["expireAt"] != expires:
                    raise AssertionError("Timer completed early or deadline changed")
                early += 1
            if current["status"] == "AUTO_PASSED":
                break
            if time.monotonic() >= next_progress:
                print("WAIT natural_timer seconds_until_due=" + str(max(0, (expires-now)//1000)), flush=True)
                next_progress = time.monotonic() + 30
            time.sleep(3)
        history = query(connection, "SELECT action,CAST(UNIX_TIMESTAMP(create_time)*1000 AS UNSIGNED) AS at_ms "
                        "FROM wf_task_history WHERE tenant_id=100000 AND instance_id=%s AND node_key='timer'", (timer_id,))
        check("timer_naturally_completed_once", current["status"] == "AUTO_PASSED" and len(history) == 1 and early > 0)
        delay = history[0]["at_ms"] - expires
        check("timer_within_original_scan_interval", -1000 <= delay <= 180000)
        print("TIMER_PASS", json.dumps({"instanceId": timer_id, "expireAt": expires,
            "historyAt": history[0]["at_ms"], "delayMs": delay, "originalScanMs": 180000, "earlyObservations": early}), flush=True)
    finally:
        for instance_id in instances:
            if instance(connection, instance_id)["status"] in ("RUNNING", "PENDING", "PAUSED", "TASK_BACK"):
                cleanup_api(admin, "POST", "/workflow/wf/instance/terminate", json={"instanceId": instance_id, "reason": TAG + " cleanup"})
        archive(admin, definitions)
        print("CLEANUP definitions_archived=" + str(len(definitions)), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=("all", "approval", "timer"), default="all")
    args = parser.parse_args()
    connection = pymysql.connect(host=support.HOST, user="root", password=os.environ["CLOUDFLOW_DB_PASSWORD"],
        database="cloud_flow_db", autocommit=True, charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=10, read_timeout=15)
    sessions = []
    try:
        admin = login(os.environ["CLOUDFLOW_TEST_ADMIN_USERNAME"]); sessions.append(admin)
        approver = outsider = None
        if args.case != "timer":
            approver = login(os.environ.get("CLOUDFLOW_TEST_APPROVER_USERNAME", "li")); sessions.append(approver)
            outsider = login(os.environ.get("CLOUDFLOW_TEST_OUTSIDER_USERNAME", "wang")); sessions.append(outsider)
        workflows(connection, admin, approver, outsider, args.case)
        print("RESULT", json.dumps({"tag": TAG, "checks": len(checks), "status": "PASS"}), flush=True)
    finally:
        close_sessions(sessions, connection)


if __name__ == "__main__":
    main()
