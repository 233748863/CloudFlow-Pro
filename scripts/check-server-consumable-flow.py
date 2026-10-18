"""Bounded live request -> workflow -> callback -> stock posting check.

Uses one tagged material and two owned requests. Only the approver configuration
is temporarily adjusted through its public API and restored in finally. Audit
records remain; owned material is disabled after stock is drained. No external
provider, performance suite, artificial callback or direct database DML is used.
"""
import importlib.util
import json
import os
from pathlib import Path
import time

import pymysql

spec = importlib.util.spec_from_file_location("flow", Path(__file__).with_name("check-server-flow-special.py"))
flow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow)
TAG = "SPECIAL_OA_" + time.strftime("%Y%m%d_%H%M%S")
query = flow.query
check = flow.check


def api(session, method, target, **kwargs):
    response = session.request(method, flow.support.ENTRY + "/api" + target, timeout=(5, 15), **kwargs)
    body = response.json()
    if response.status_code != 200 or body.get("code") != 200:
        raise RuntimeError(f"{method} {target}: HTTP {response.status_code}, code={body.get('code')}, "
                           + str(body.get("message", body.get("msg", "")))[:300])
    return body.get("data")


def wait_for(read, ready, label, seconds=60):
    deadline = time.monotonic() + seconds
    while True:
        result = read()
        if ready(result):
            return result
        if time.monotonic() >= deadline:
            raise AssertionError(label + " not completed within " + str(seconds) + " seconds")
        time.sleep(1)


def verify(connection, admin, approver):
    original = api(admin, "GET", "/auth/system/config/219")
    if original["configKey"] != "sys.oa.consumable.approverUserId":
        raise RuntimeError("Expected tenant approver configuration")
    material_id = None
    request_ids = []
    changed = False
    try:
        configured = {**original, "configValue": "2"}
        api(admin, "PUT", "/auth/system/config", json=configured)
        changed = True
        check("approver_configured", api(admin, "GET", "/auth/system/config/219")["configValue"] == "2")
        api(admin, "POST", "/oa/consumable", json={"name": TAG, "unit": "件", "model": "专项验证",
            "lowStockThreshold": 0, "targetStock": 0, "warnEnabled": 0})
        owned = query(connection, "SELECT consumable_id FROM oa_consumable WHERE tenant_id=100000 AND name=%s", (TAG,))
        if len(owned) != 1:
            raise AssertionError("Unique owned material missing")
        material_id = str(owned[0]["consumable_id"])
        inbound = api(admin, "POST", "/oa/consumable/" + material_id + "/add-stock", json={
            "operationKey": TAG + "_IN", "quantity": 1, "unitPrice": "3.25", "remark": TAG})
        check("owned_material_inbound", len(inbound["ledgerIds"]) == 1
              and api(admin, "GET", "/oa/consumable/" + material_id)["quantity"] == 1)
        today = query(connection, "SELECT DATE_FORMAT(CURDATE(),'%%Y-%%m-%%d') AS today")[0]["today"]
        for choice, action, expected in (("reject", "REJECT", "REJECTED"), ("approve", "APPROVE", "APPROVED")):
            created = api(admin, "POST", "/oa/consumable/request", json={"operationKey": TAG + "_" + choice,
                "purpose": TAG + "_" + choice, "applyDate": today, "expectDate": today,
                "items": [{"consumableId": material_id, "applyQuantity": 1, "remark": TAG}]})
            request_id = created["requestId"]
            request_ids.append(request_id)
            check("request_draft_" + choice, created["status"] == "DRAFT")
            submitted = api(admin, "POST", "/oa/consumable/request/" + request_id + "/submit", json={
                "operationKey": TAG + "_SUB_" + choice, "version": created["version"]})
            check("request_approving_" + choice, submitted["status"] == "APPROVING")
            detail = wait_for(lambda: api(admin, "GET", "/oa/consumable/request/" + request_id),
                lambda row: row.get("instanceId") and not row["instanceId"].startswith("F:"), "Workflow binding")
            instance_id = detail["instanceId"]
            pending = wait_for(lambda: flow.tasks(connection, instance_id), bool, "Approval task")
            check("real_workflow_assigned_" + choice, len(pending) == 1 and pending[0]["assignee"] == 2)
            api(approver, "GET", "/workflow/wf/todo/" + pending[0]["task_id"])
            api(approver, "POST", "/workflow/wf/complete", json={"taskId": pending[0]["task_id"],
                "action": action, "comment": TAG})
            detail = wait_for(lambda: api(admin, "GET", "/oa/consumable/request/" + request_id),
                lambda row: row["status"] == expected, "Business callback " + choice)
            check("real_callback_" + choice, detail["status"] == expected
                  and detail["items"][0]["approvedQuantity"] == (1 if choice == "approve" else 0))
            check("workflow_matches_business_" + choice,
                  flow.instance(connection, instance_id)["status"] == ("PASSED" if choice == "approve" else "REJECTED"))
            print("BUSINESS_FLOW", json.dumps({"requestId": request_id, "instanceId": instance_id,
                "decision": expected, "approvedQuantity": detail["items"][0]["approvedQuantity"]}), flush=True)
            if choice == "approve":
                command = {"operationKey": TAG + "_ISSUE", "version": detail["version"],
                    "allowPartial": False, "items": [{"itemId": detail["items"][0]["itemId"], "quantity": 1}], "remark": TAG}
                issued = api(admin, "POST", "/oa/consumable/request/" + request_id + "/issue", json=command)
                check("approved_request_issued", issued["status"] == "ISSUED" and issued["rows"][0]["issuedQuantity"] == 1)
                replay = api(admin, "POST", "/oa/consumable/request/" + request_id + "/issue", json=command)
                check("issue_idempotent", replay["replayed"] is True and replay["ledgerIds"] == issued["ledgerIds"])
                material = api(admin, "GET", "/oa/consumable/" + material_id)
                check("stock_and_ledger_agree", material["quantity"] == 0 and str(material["stockAmount"]) in ("0", "0.00"))
    finally:
        # All writes use product APIs. Historical workflow/ledger/audit rows remain.
        try:
            for request_id in request_ids:
                detail = api(admin, "GET", "/oa/consumable/request/" + request_id)
                if detail["status"] in ("DRAFT", "REJECTED", "APPROVED"):
                    api(admin, "POST", "/oa/consumable/request/" + request_id + "/cancel",
                        json={"version": detail["version"], "reason": TAG + " verification complete"})
                elif detail["status"] == "APPROVING":
                    print("CLEANUP_PENDING requestId=" + request_id + " status=APPROVING", flush=True)
            if material_id:
                material = api(admin, "GET", "/oa/consumable/" + material_id)
                api(admin, "PUT", "/oa/consumable", json={"consumableId": material_id, "version": material["version"],
                    "name": TAG, "unit": "件", "model": "专项验证", "lowStockThreshold": 0,
                    "targetStock": 0, "warnEnabled": 0, "status": "INACTIVE"})
                check("owned_material_disabled", api(admin, "GET", "/oa/consumable/" + material_id)["status"] == "INACTIVE")
        finally:
            if changed:
                current = api(admin, "GET", "/auth/system/config/219")
                if current["configValue"] != "2":
                    raise RuntimeError("Approver configuration changed concurrently; do not overwrite")
                api(admin, "PUT", "/auth/system/config", json={**current, "configValue": original["configValue"]})
                check("approver_config_restored", api(admin, "GET", "/auth/system/config/219")["configValue"] == original["configValue"])
        print("CLEANUP", json.dumps({"materialId": material_id, "requestIds": request_ids, "auditRetained": True}), flush=True)


def main():
    connection = pymysql.connect(host=flow.support.HOST, user="root", password=os.environ["CLOUDFLOW_DB_PASSWORD"],
        database="cloud_flow_db", autocommit=True, charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=10, read_timeout=15)
    sessions = []
    try:
        admin = flow.login(os.environ["CLOUDFLOW_TEST_ADMIN_USERNAME"]); sessions.append(admin)
        approver = flow.login(os.environ.get("CLOUDFLOW_TEST_APPROVER_USERNAME", "li")); sessions.append(approver)
        verify(connection, admin, approver)
        print("RESULT", json.dumps({"tag": TAG, "checks": len(flow.checks), "status": "PASS"}), flush=True)
    finally:
        flow.close_sessions(sessions, connection)


if __name__ == "__main__":
    main()
