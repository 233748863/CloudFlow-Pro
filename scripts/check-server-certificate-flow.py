"""One real certificate application, approval, issuance and filtered print.

Uses public APIs for every write and read-only SQL for committed evidence. A
dedicated process is selected temporarily, then the original setting is restored.
Records and templates remain while artifact cleanup is paused. No external calls,
clock changes, direct callback injection or full regression are performed.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import time

import pymysql

spec = importlib.util.spec_from_file_location("flow", Path(__file__).with_name("check-server-consumable-flow.py"))
flow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow)
api = flow.api
check = flow.check
query = flow.query


def create_process(admin, tag):
    field_ids = ("id", "requestNo", "employeeName", "certificateType", "recipientOrg", "copies")
    form = api(admin, "POST", "/workflow/wf/form/save", json={
        "formKey": tag, "formName": "证明专项 " + tag,
        "fieldsJson": json.dumps([{"id": name, "type": "TEXT", "label": name} for name in field_ids])})
    graph = {"nodes": [{"id": "start", "type": "START", "title": "申请"},
        {"id": "approve", "type": "APPROVAL", "title": "证明审批", "approverType": "USER",
         "approverValue": "2", "rejectStrategy": "TERMINATE"},
        {"id": "end", "type": "END", "title": "签发"}],
        "edges": [flow.flow.edge("start", "approve"), flow.flow.edge("approve", "end")]}
    saved = api(admin, "POST", "/workflow/wf/definition/save", json={
        "processKey": tag, "processName": "证明专项 " + tag, "formId": form.get("formId", form.get("id")),
        "modelJson": json.dumps(graph), "startPermissionType": "USER", "startPermissionValue": "[1]"})
    definition_id = saved.get("definitionId", saved.get("id"))
    api(admin, "PUT", f"/workflow/wf/definition/{definition_id}/field-permissions", json=[
        {"nodeKey": node, "fieldId": "recipientOrg", "visibleFlag": False,
         "editableFlag": False, "requiredFlag": False} for node in ("__START__", "approve")])
    api(admin, "POST", "/workflow/wf/definition/deploy/" + definition_id, json={})
    print("DEFINITION", json.dumps({"definitionId": definition_id, "processKey": tag}), flush=True)
    return definition_id


def request_row(connection, request_id):
    rows = query(connection, "SELECT id,employee_id,status,process_instance_id,pdf_file_id,issued_at,remark,recipient_org "
        "FROM hr_certificate_request WHERE tenant_id=100000 AND id=%s AND deleted=0", (request_id,))
    if len(rows) != 1:
        raise AssertionError("Expected one certificate request")
    return rows[0]


def verify(connection, admin, approver, request_id=None):
    tag = "CERT_" + time.strftime("%Y%m%d_%H%M%S")
    if request_id is None:
        config_rows = query(connection, "SELECT config_id FROM sys_config WHERE tenant_id=100000 AND config_key=%s",
            ("sys.hr.certificate.processKey",))
        if len(config_rows) != 1:
            raise AssertionError("Expected certificate workflow setting")
        config_id = config_rows[0]["config_id"]
        original = api(admin, "GET", f"/auth/system/config/{config_id}")
        create_process(admin, tag)
        changed = False
        try:
            api(admin, "PUT", "/auth/system/config", json={**original, "configValue": tag})
            changed = True
            check("certificate_process_selected", api(admin, "GET",
                f"/auth/system/config/{config_id}")["configValue"] == tag)
            request_id = api(admin, "POST", "/hr/ess/certificates", json={"certificateType": "EMPLOYMENT",
                "purpose": "内部功能验收", "recipientOrg": "HIDDEN_" + tag, "copies": 1,
                "language": "zh-CN", "remark": tag})
            print("APPLICATION", json.dumps({"requestId": request_id, "tag": tag}), flush=True)
            row = flow.wait_for(lambda: request_row(connection, request_id),
                lambda value: bool(value["process_instance_id"]), "Certificate workflow binding", seconds=60)
            check("certificate_bound_to_real_workflow", bool(row["process_instance_id"]))
        finally:
            if changed:
                current = api(admin, "GET", f"/auth/system/config/{config_id}")
                if current["configValue"] != tag:
                    raise RuntimeError("Certificate setting changed concurrently; not overwritten")
                api(admin, "PUT", "/auth/system/config", json={**current, "configValue": original["configValue"]})
                check("certificate_process_setting_restored", api(admin, "GET",
                    f"/auth/system/config/{config_id}")["configValue"] == original["configValue"])
    row = request_row(connection, request_id)
    tag = row["remark"]
    if not tag or not tag.startswith("CERT_"):
        raise AssertionError("Only this checker's dedicated applications may be resumed")
    instance_id = row["process_instance_id"]
    if not instance_id:
        raise AssertionError("Application has not yet bound its workflow")
    instances = query(connection, "SELECT business_key,start_user_id,status FROM wf_process_instance "
        "WHERE instance_id=%s AND tenant_id=100000", (instance_id,))
    check("certificate_workflow_business_binding", len(instances) == 1
        and instances[0]["business_key"] == "HR_CERTIFICATE_REQUEST:" + str(request_id)
        and instances[0]["start_user_id"] == 1)
    if instances[0]["status"] in ("RUNNING", "PENDING"):
        pending = flow.wait_for(lambda: flow.flow.tasks(connection, instance_id), bool, "Certificate approval")
        check("certificate_real_approver", len(pending) == 1 and pending[0]["assignee"] == 2)
        api(approver, "GET", "/workflow/wf/todo/" + pending[0]["task_id"])
        api(approver, "POST", "/workflow/wf/complete", json={"taskId": pending[0]["task_id"],
            "action": "APPROVE", "comment": tag})
    row = flow.wait_for(lambda: request_row(connection, request_id),
        lambda value: value["status"] == "ISSUED" and value["pdf_file_id"] is not None,
        "Certificate callback and PDF issuance", seconds=60)
    check("certificate_issued_by_real_callback", row["status"] == "ISSUED" and row["issued_at"] is not None)
    check("certificate_workflow_passed", flow.flow.instance(connection, instance_id)["status"] == "PASSED")
    detail = api(admin, "GET", f"/hr/ess/certificates/{request_id}")
    check("certificate_owner_reads_issued_detail", detail["status"] == "ISSUED")
    response = admin.get(flow.flow.support.ENTRY + f"/api/hr/ess/certificates/{request_id}/pdf", timeout=(5, 25))
    check("certificate_issued_pdf_download", response.status_code == 200 and response.content.startswith(b"%PDF-"))
    file_rows = query(connection, "SELECT file_size FROM sys_file WHERE tenant_id=100000 AND file_id=%s AND deleted=0",
        (row["pdf_file_id"],))
    check("certificate_file_metadata_matches_download", len(file_rows) == 1
        and file_rows[0]["file_size"] == len(response.content))
    template_code = tag + "_PRINT"
    templates = query(connection, "SELECT template_id FROM sys_print_template WHERE tenant_id=100000 "
        "AND template_code=%s AND deleted=0", (template_code,))
    if not templates:
        value = {"templateCode": template_code, "templateName": "证明字段过滤 " + tag,
            "bizType": "CERTIFICATE", "templateFormat": "HTML", "outputFormat": "PDF",
            "templateContent": "<html><body><h1>证明验收</h1><p>{{certificateType}}</p>"
                "<p>{{recipientOrg}}</p><p>{{requestNo}}</p><p>{{employeeName}}</p></body></html>",
            "paperSize": "A4", "orientation": "PORTRAIT", "marginTop": 10, "marginBottom": 10,
            "marginLeft": 10, "marginRight": 10, "defaultFlag": 0, "status": "ENABLED"}
        template = api(admin, "POST", "/auth/system/print/template", files={
            "template": ("template.json", json.dumps(value, ensure_ascii=False).encode(), "application/json")})
        template_id = template["templateId"]
    else:
        template_id = templates[0]["template_id"]
    options = api(admin, "GET", f"/auth/system/print/CERTIFICATE/{request_id}/templates")
    check("certificate_print_template_available", any(value["templateCode"] == template_code for value in options))
    outputs = {}
    for format_name in ("HTML", "PDF"):
        response = admin.post(flow.flow.support.ENTRY + f"/api/auth/system/print/CERTIFICATE/{request_id}",
            params={"templateCode": template_code, "outputFormat": format_name}, timeout=(5, 25))
        check("certificate_filtered_" + format_name, response.status_code == 200
            and (response.content.startswith(b"%PDF-") if format_name == "PDF" else "EMPLOYMENT" in response.text))
        if format_name == "HTML":
            check("certificate_hidden_field_absent_from_rendered_output", row["recipient_org"] not in response.text)
        check("certificate_print_no_store_" + format_name, "no-store" in response.headers.get("Cache-Control", ""))
        records = query(connection, "SELECT record_id,file_size,operator_id,print_time,ip_address FROM sys_print_record "
            "WHERE tenant_id=100000 AND template_id=%s AND biz_id=%s AND output_format=%s ORDER BY record_id DESC LIMIT 1",
            (template_id, str(request_id), format_name))
        check("certificate_print_audit_" + format_name, len(records) == 1
            and records[0]["operator_id"] == 1 and records[0]["file_size"] == len(response.content)
            and records[0]["print_time"] is not None and bool(records[0]["ip_address"]))
        outputs[format_name] = {"recordId": records[0]["record_id"], "bytes": len(response.content)}
    print("CERTIFICATE", json.dumps({"requestId": request_id, "instanceId": instance_id,
        "fileId": row["pdf_file_id"], "templateId": template_id, "outputs": outputs,
        "retainedWhileCleanupPaused": True}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume-request", type=int)
    args = parser.parse_args()
    connection = pymysql.connect(host=flow.flow.support.HOST, user="root",
        password=os.environ["CLOUDFLOW_DB_PASSWORD"], database="cloud_flow_db", autocommit=True,
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor, connect_timeout=10, read_timeout=15)
    sessions = []
    try:
        admin = flow.flow.login(os.environ["CLOUDFLOW_TEST_ADMIN_USERNAME"])
        sessions.append(admin)
        approver = flow.flow.login(os.environ.get("CLOUDFLOW_TEST_APPROVER_USERNAME", "li"))
        sessions.append(approver)
        verify(connection, admin, approver, args.resume_request)
        print("RESULT", json.dumps({"checks": len(flow.flow.checks), "status": "PASS"}), flush=True)
    finally:
        flow.flow.close_sessions(sessions, connection)


if __name__ == "__main__":
    main()
