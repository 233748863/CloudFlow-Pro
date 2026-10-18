"""Publish the approved HR-role certificate flow and check one real application.

All writes use normal APIs; SQL is read-only. Existing users, passwords, employee
links, schedules and certificate settings are unchanged. Published configuration
and its tagged application remain. Completed verification is never replayed.
"""
import importlib.util
import json
import os
from pathlib import Path
import time

import pymysql

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("certificate", ROOT / "scripts/check-server-certificate-flow.py")
certificate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(certificate)
flow = certificate.flow
api = certificate.api
query = certificate.query
check = certificate.check
PROCESS_KEY = "wf_hr_certificate_request"
FORM_KEY = PROCESS_KEY + "_form"
FIELDS = [
    {"id": "certificateType", "type": "DICT_SELECT", "label": "证明类型",
     "dictType": "hr_certificate_type", "required": True},
    {"id": "recipientOrg", "type": "TEXT", "label": "接收单位"},
    {"id": "copies", "type": "NUMBER", "label": "份数", "required": True, "min": 1},
]


def main():
    state_path = ROOT / ".cloudflow-runtime/server-deployment-20261018/certificate-default-20261018.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {
        "processKey": PROCESS_KEY, "tag": "CERT_DEFAULT_" + time.strftime("%Y%m%d_%H%M%S"),
        "approvedAssignment": {"approverType": "ROLE", "approverValue": "hr"},
    }
    if state.get("complete"):
        print("SKIP default certificate configuration and basic check already completed", flush=True)
        return
    if state.get("processKey") != PROCESS_KEY:
        raise AssertionError("Unexpected configuration state")

    def save():
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    save()
    connection = pymysql.connect(host=flow.flow.support.HOST, user="root",
        password=os.environ["CLOUDFLOW_DB_PASSWORD"], database="cloud_flow_db", autocommit=True,
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor, connect_timeout=10, read_timeout=15)
    sessions = []
    try:
        settings = query(connection, "SELECT config_id,config_key,config_value FROM sys_config "
            "WHERE tenant_id=100000 AND config_id IN (131,132) ORDER BY config_id")
        check("default_certificate_setting_matches", len(settings) == 2
            and settings[1]["config_key"] == "sys.hr.certificate.processKey"
            and settings[1]["config_value"] == PROCESS_KEY)
        members = query(connection, "SELECT u.user_id,u.user_name FROM sys_role r "
            "JOIN sys_user_role ur ON ur.tenant_id=r.tenant_id AND ur.role_id=r.role_id "
            "JOIN sys_user u ON u.tenant_id=ur.tenant_id AND u.user_id=ur.user_id "
            "WHERE r.tenant_id=100000 AND r.role_key='hr' AND r.status='0' AND r.deleted=0 "
            "AND u.status='0' AND u.deleted=0 ORDER BY u.user_id")
        check("default_certificate_hr_role_has_enabled_members", bool(members))
        state["enabledHrMembers"] = members
        save()
        admin = flow.flow.login(os.environ["CLOUDFLOW_TEST_ADMIN_USERNAME"])
        sessions.append(admin)

        forms = query(connection, "SELECT form_id,fields_json FROM wf_form_definition "
            "WHERE tenant_id=100000 AND form_key=%s", (FORM_KEY,))
        if not forms:
            if state.get("formId"):
                raise AssertionError("Saved form was removed; do not silently recreate it")
            form = api(admin, "POST", "/workflow/wf/form/save", json={"formKey": FORM_KEY,
                "formName": "证明开具申请", "fieldsJson": json.dumps(FIELDS, ensure_ascii=False)})
            state["formId"] = form.get("formId", form.get("id"))
            save()
        else:
            if len(forms) != 1 or json.loads(forms[0]["fields_json"]) != FIELDS:
                raise AssertionError("Existing default form differs; not overwritten")
            if state.get("formId") not in (None, forms[0]["form_id"]):
                raise AssertionError("Default form changed concurrently")
            state["formId"] = forms[0]["form_id"]
            save()

        graph = {"nodes": [{"id": "start", "type": "START", "title": "提交申请"},
            {"id": "hr_approve", "type": "APPROVAL", "title": "人事审批",
             "approverType": "ROLE", "approverValue": "hr", "rejectStrategy": "TERMINATE"},
            {"id": "end", "type": "END", "title": "完成"}],
            "edges": [flow.flow.edge("start", "hr_approve"), flow.flow.edge("hr_approve", "end")]}
        definitions = query(connection, "SELECT definition_id,form_id,model_json,status,version "
            "FROM wf_process_definition WHERE tenant_id=100000 AND process_key=%s", (PROCESS_KEY,))
        if not definitions:
            if state.get("definitionId"):
                raise AssertionError("Saved definition was removed; do not silently recreate it")
            saved = api(admin, "POST", "/workflow/wf/definition/save", json={"processKey": PROCESS_KEY,
                "processName": "证明开具审批", "formId": state["formId"],
                "modelJson": json.dumps(graph, ensure_ascii=False),
                "startPermissionType": "ALL", "startPermissionValue": "[]"})
            state["definitionId"] = saved.get("definitionId", saved.get("id"))
            state["version"] = saved["version"]
            save()
        else:
            if len(definitions) != 1 or definitions[0]["form_id"] != state["formId"]:
                raise AssertionError("Existing default definition differs; not overwritten")
            existing = definitions[0]
            actual_graph = json.loads(existing["model_json"])
            if actual_graph != graph or state.get("definitionId") not in (None, existing["definition_id"]):
                raise AssertionError("Default definition changed concurrently")
            state.update(definitionId=existing["definition_id"], version=existing["version"])
            save()
        definition_id = state["definitionId"]
        detail = api(admin, "GET", "/workflow/wf/definition/" + definition_id)
        if detail["status"] == "DRAFT":
            api(admin, "POST", "/workflow/wf/definition/deploy/" + definition_id, json={})
        elif detail["status"] != "PUBLISHED":
            raise AssertionError("Default definition cannot be published from its current status")
        detail = api(admin, "GET", "/workflow/wf/definition/" + definition_id)
        check("default_certificate_definition_published", detail["status"] == "PUBLISHED"
            and detail["processKey"] == PROCESS_KEY and detail["formId"] == state["formId"])
        state["published"] = True
        save()
        print("DEFAULT_PUBLISHED", json.dumps({"definitionId": definition_id,
            "formId": state["formId"], "version": state["version"],
            "approverType": "ROLE", "approverValue": "hr"}), flush=True)

        owned = query(connection, "SELECT id FROM hr_certificate_request "
            "WHERE tenant_id=100000 AND remark=%s AND deleted=0", (state["tag"],))
        if len(owned) > 1:
            raise AssertionError("Duplicate tagged application; inspect without replaying")
        if not owned:
            if state.get("requestId"):
                raise AssertionError("Saved application was removed; do not replay submission")
            request_id = api(admin, "POST", "/hr/ess/certificates", json={"certificateType": "EMPLOYMENT",
                "purpose": "内部功能验收", "recipientOrg": "内部验收", "copies": 1,
                "language": "zh-CN", "remark": state["tag"]})
            state["requestId"] = request_id
            save()
        else:
            if state.get("requestId") not in (None, owned[0]["id"]):
                raise AssertionError("Stored application ID differs")
            state["requestId"] = owned[0]["id"]
            save()
        request_id = state["requestId"]
        row = flow.wait_for(lambda: certificate.request_row(connection, request_id),
            lambda value: bool(value["process_instance_id"]), "Default certificate workflow binding")
        instance_id = row["process_instance_id"]
        state["instanceId"] = instance_id
        save()
        instances = query(connection, "SELECT process_def_key,business_key,start_user_id,status "
            "FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=%s", (instance_id,))
        check("default_certificate_real_business_binding", len(instances) == 1
            and instances[0]["process_def_key"] == PROCESS_KEY
            and instances[0]["business_key"] == "HR_CERTIFICATE_REQUEST:" + str(request_id)
            and instances[0]["start_user_id"] == 1)
        if instances[0]["status"] in ("RUNNING", "PENDING"):
            pending = flow.wait_for(lambda: flow.flow.tasks(connection, instance_id), bool, "HR approval task")
            eligible = {member["user_id"]: member["user_name"] for member in members}
            check("default_certificate_assigned_to_hr_role", len(pending) == 1
                and pending[0]["node_key"] == "hr_approve" and pending[0]["assignee"] in eligible)
            task = pending[0]
            state.update(taskId=task["task_id"], approverId=task["assignee"],
                approverUsername=eligible[task["assignee"]])
            save()
            approver = flow.flow.login(eligible[task["assignee"]])
            sessions.append(approver)
            api(approver, "GET", "/workflow/wf/todo/" + task["task_id"])
            api(approver, "POST", "/workflow/wf/complete", json={"taskId": task["task_id"],
                "action": "APPROVE", "comment": state["tag"]})
        row = flow.wait_for(lambda: certificate.request_row(connection, request_id),
            lambda value: value["status"] == "ISSUED" and value["pdf_file_id"] is not None,
            "Default certificate approval callback and issuance")
        check("default_certificate_issued_after_real_approval", row["issued_at"] is not None
            and flow.flow.instance(connection, instance_id)["status"] == "PASSED")
        detail = api(admin, "GET", f"/hr/ess/certificates/{request_id}")
        check("default_certificate_owner_reads_issued_detail", detail["status"] == "ISSUED")
        response = admin.get(flow.flow.support.ENTRY + f"/api/hr/ess/certificates/{request_id}/pdf", timeout=(5, 25))
        file_rows = query(connection, "SELECT file_size FROM sys_file "
            "WHERE tenant_id=100000 AND file_id=%s AND deleted=0", (row["pdf_file_id"],))
        check("default_certificate_owner_downloads_pdf", response.status_code == 200
            and response.content.startswith(b"%PDF-") and len(file_rows) == 1
            and file_rows[0]["file_size"] == len(response.content))
        check("default_certificate_settings_unchanged", settings == query(connection,
            "SELECT config_id,config_key,config_value FROM sys_config WHERE tenant_id=100000 "
            "AND config_id IN (131,132) ORDER BY config_id"))
        state.update(fileId=row["pdf_file_id"], pdfBytes=len(response.content), complete=True,
            checks=list(flow.flow.checks), verifiedAt=time.strftime("%Y-%m-%d %H:%M:%S %z"))
        save()
        print("DEFAULT_CERTIFICATE_PASS", json.dumps({"requestId": request_id, "instanceId": instance_id,
            "approverId": state.get("approverId"), "fileId": state["fileId"], "pdfBytes": state["pdfBytes"],
            "checks": len(flow.flow.checks)}), flush=True)
    finally:
        flow.flow.close_sessions(sessions, connection)


if __name__ == "__main__":
    main()
