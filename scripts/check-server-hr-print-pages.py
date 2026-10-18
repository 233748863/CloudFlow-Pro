"""Resume only the two missing HR browser print checks on the deployed server.

Writes use normal APIs. SQL is read-only. A dedicated employee, zero-value salary
and tax configuration belong exclusively to the existing verification account.
Original employees, passwords, wages, schedules and certificate settings remain.
Completed cases are skipped; no artifact removal while cleanup is paused.
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


ordinary = module("ordinary", "check-server-remaining-functional.py")
certificate = module("certificate", "check-server-certificate-flow.py")
api = ordinary.api


def main():
    state_path = ROOT / ".cloudflow-runtime/server-deployment-20261018/hr-print-pages-20261018.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {"cases": {}}
    if all(state["cases"].get(name, {}).get("complete") for name in ("CERTIFICATE", "SALARY_SLIP")):
        print("SKIP completed HR print page checks", flush=True)
        return 0

    def save():
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    checks = ordinary.Checks()
    approver = None
    try:
        checks.account(verify_reset=False, reuse=True)
        if state.get("operatorId") not in (None, checks.user_id):
            raise AssertionError("Stored evidence belongs to another dedicated account")
        state.update(operatorId=checks.user_id, tag=checks.tag)
        save()
        tag = checks.tag + "_HRPAGE"
        employees = checks.sql("SELECT id,employee_no FROM hr_employee WHERE tenant_id=100000 "
            "AND user_id=%s AND deleted=0", (checks.user_id,))
        if not employees:
            if state.get("employeeId"):
                raise AssertionError("Recorded employee disappeared; inspect before recreating")
            employee_id = api(checks.owned, "POST", "/hr/employees", json={
                "employeeNo": tag, "name": "页面打印验收", "gender": "MALE", "deptId": 100,
                "employeeType": "FULL_TIME", "employeeStatus": "ACTIVE", "hireDate": "2026-10-01",
                "userId": checks.user_id})
        else:
            if len(employees) != 1 or employees[0]["employee_no"] != tag:
                raise AssertionError("Dedicated user has an unrelated employee; not overwritten")
            employee_id = employees[0]["id"]
        state["employeeId"] = employee_id
        save()
        checks.check(True, "独立验收员工由正常入口建立，仅绑定专用账号")
        settings_before = checks.sql("SELECT config_id,config_value FROM sys_config "
            "WHERE tenant_id=100000 AND config_id IN (131,132) ORDER BY config_id")

        for biz_type in ("CERTIFICATE", "SALARY_SLIP"):
            case = state["cases"].setdefault(biz_type, {})
            if case.get("complete"):
                print("SKIP", biz_type, flush=True)
                continue
            if biz_type == "CERTIFICATE":
                requests = checks.sql("SELECT id,request_no FROM hr_certificate_request "
                    "WHERE tenant_id=100000 AND employee_id=%s AND remark=%s AND deleted=0", (employee_id, tag))
                if not requests:
                    if case.get("bizId"):
                        raise AssertionError("Recorded request disappeared")
                    case["bizId"] = api(checks.owned, "POST", "/hr/ess/certificates", json={
                        "certificateType": "EMPLOYMENT", "purpose": "页面打印验收", "recipientOrg": "内部验收",
                        "copies": 1, "language": "zh-CN", "remark": tag})
                    save()
                else:
                    if len(requests) != 1 or case.get("bizId") not in (None, requests[0]["id"]):
                        raise AssertionError("Ambiguous certificate request")
                    case["bizId"] = requests[0]["id"]
                    save()
                row = certificate.flow.wait_for(lambda: certificate.request_row(checks.connection, case["bizId"]),
                    lambda value: bool(value["process_instance_id"]), "Owned certificate workflow")
                case["instanceId"] = row["process_instance_id"]
                save()
                if row["status"] != "ISSUED":
                    pending = certificate.flow.wait_for(lambda: certificate.flow.flow.tasks(
                        checks.connection, case["instanceId"]), bool, "Owned HR approval task")
                    members = checks.sql("SELECT u.user_id,u.user_name FROM sys_user u "
                        "JOIN sys_user_role ur ON ur.user_id=u.user_id JOIN sys_role r ON r.role_id=ur.role_id "
                        "WHERE u.tenant_id=100000 AND r.tenant_id=100000 AND r.role_key='hr' "
                        "AND u.status='0' AND u.deleted=0 AND r.status='0' AND r.deleted=0")
                    eligible = {member["user_id"]: member["user_name"] for member in members}
                    checks.check(len(pending) == 1 and pending[0]["assignee"] in eligible,
                        "独立证明由正式人事角色流程分派")
                    task = pending[0]
                    approver = certificate.flow.flow.login(eligible[task["assignee"]])
                    api(approver, "GET", "/workflow/wf/todo/" + task["task_id"])
                    api(approver, "POST", "/workflow/wf/complete", json={"taskId": task["task_id"],
                        "action": "APPROVE", "comment": tag})
                    case.update(approverId=task["assignee"], taskId=task["task_id"])
                    save()
                    row = certificate.flow.wait_for(lambda: certificate.request_row(checks.connection, case["bizId"]),
                        lambda value: value["status"] == "ISSUED" and value["pdf_file_id"] is not None,
                        "Owned certificate issuance")
                details = api(checks.owned, "GET", f"/hr/ess/certificates/{case['bizId']}")
                checks.check(details["status"] == "ISSUED", "独立证明经真实审批后签发且本人详情可读")
                case.update(documentNo=details["requestNo"], route="/hr/ess/certificates", fileId=row["pdf_file_id"])
            else:
                prepare_salary(checks, state, save, employee_id, tag)
                slips = checks.sql("SELECT id,status FROM hr_salary_slip WHERE tenant_id=100000 "
                    "AND employee_id=%s AND period_month='2026-10' AND deleted=0", (employee_id,))
                if not slips:
                    if case.get("bizId"):
                        raise AssertionError("Recorded salary disappeared")
                    created = api(checks.owned, "POST", "/hr/ess/salary-slips/generate",
                        params={"periodMonth": "2026-10", "employeeId": employee_id})
                    checks.check(created.get("created") == 1 and created.get("periodMonth") == "2026-10",
                        "仅指定验收员工生成一份工资，无付款操作")
                    slips = checks.sql("SELECT id,status FROM hr_salary_slip WHERE tenant_id=100000 "
                        "AND employee_id=%s AND period_month='2026-10' AND deleted=0", (employee_id,))
                checks.check(len(slips) == 1 and slips[0]["status"] == "SUBMITTED", "独立工资单唯一且已确定")
                details = api(checks.owned, "GET", f"/hr/ess/salary-slips/{slips[0]['id']}")
                checks.check(all(float(details.get(key) or 0) == 0 for key in
                    ("grossTotal", "deductionTotal", "taxAmount", "netTotal")), "独立样本工资金额为零")
                case.update(bizId=slips[0]["id"], documentNo="2026-10", route="/hr/ess/slips")
            save()
            code = tag + "_" + biz_type
            if "templateId" not in case:
                templates = checks.sql("SELECT template_id,template_name FROM sys_print_template "
                    "WHERE tenant_id=100000 AND template_code=%s AND deleted=0", (code,))
                name = "页面验收 " + biz_type
                if templates:
                    if len(templates) != 1:
                        raise AssertionError("Ambiguous template")
                    template_id, name = templates[0]["template_id"], templates[0]["template_name"]
                else:
                    template_id = checks.save_template({"templateCode": code, "templateName": name,
                        "bizType": biz_type, "templateFormat": "HTML", "outputFormat": "PDF",
                        "templateContent": "<html><body><h1>页面打印验收</h1><p>{{id}}</p></body></html>",
                        "paperSize": "A4", "orientation": "PORTRAIT", "marginTop": 10, "marginBottom": 10,
                        "marginLeft": 10, "marginRight": 10, "defaultFlag": 0, "status": "ENABLED"})["templateId"]
                case.update(templateId=template_id, templateName=name, templateCode=code)
                save()
            if "browser" not in case:
                records = checks.sql("SELECT record_id FROM sys_print_record WHERE tenant_id=100000 "
                    "AND template_id=%s AND biz_id=%s AND operator_id=%s",
                    (case["templateId"], str(case["bizId"]), checks.user_id))
                if records:
                    raise AssertionError("Print exists without browser result; inspect before replay")
                settings = {"entry": ordinary.support.ENTRY, "hrPrintOnly": True,
                    "printCase": {**case, "bizType": biz_type, "pageNum": 1}, "cookies": [
                        {"name": cookie.name, "value": cookie.value, "domain": ordinary.support.HOST,
                         "path": cookie.path or "/", "httpOnly": cookie.name == "Authorization",
                         "secure": False, "sameSite": "Lax"} for cookie in checks.owned.cookies]}
                result = subprocess.run(["node", "scripts/check-server-functional-browser.mjs"],
                    cwd=ROOT / "cloudflow-frontend", input=json.dumps(settings), text=True,
                    encoding="utf-8", capture_output=True, timeout=75)
                print(result.stdout, end="", flush=True)
                if result.returncode:
                    print(result.stderr[-3000:], flush=True)
                    return result.returncode
                evidence = [json.loads(line.removeprefix("BROWSER_PRINT ")) for line in result.stdout.splitlines()
                    if line.startswith("BROWSER_PRINT ")]
                if len(evidence) != 1 or evidence[0]["bizId"] != case["bizId"]:
                    raise AssertionError("Expected one completed HR browser print")
                case["browser"] = evidence[0]
                save()
            records = checks.sql("SELECT record_id,file_size,print_time,ip_address FROM sys_print_record "
                "WHERE tenant_id=100000 AND template_id=%s AND biz_id=%s AND operator_id=%s AND output_format='PDF'",
                (case["templateId"], str(case["bizId"]), checks.user_id))
            checks.check(len(records) == 1 and records[0]["file_size"] == case["browser"]["bytes"]
                and records[0]["print_time"] is not None and bool(records[0]["ip_address"]),
                biz_type + "页面打印有唯一记录，操作者、长度、时间及IP核对一致")
            case.update(recordId=records[0]["record_id"], complete=True, verifiedAt=time.strftime("%Y-%m-%d %H:%M:%S %z"))
            save()
            print("HR_PRINT_PAGE_PASS", json.dumps({"bizType": biz_type, "bizId": case["bizId"],
                "templateId": case["templateId"], "recordId": case["recordId"]}), flush=True)
        checks.check(settings_before == checks.sql("SELECT config_id,config_value FROM sys_config "
            "WHERE tenant_id=100000 AND config_id IN (131,132) ORDER BY config_id"), "正式证明公司与流程配置保持原值")
        state["complete"] = True
        save()
        return 0
    finally:
        if approver is not None:
            try:
                ordinary.request(approver, "POST", "/auth/logout")
            finally:
                approver.close()
        checks.close()


def prepare_salary(checks, state, save, employee_id, tag):
    salary = state.setdefault("salarySetup", {})
    structures = checks.sql("SELECT id FROM hr_comp_structure WHERE tenant_id=100000 AND structure_code=%s", (tag,))
    if not structures:
        salary["structureId"] = api(checks.owned, "POST", "/hr/compensation/structures", json={
            "structureCode": tag, "structureName": "独立打印验收零元结构", "status": 1, "componentConfig": {}})
    else:
        salary["structureId"] = structures[0]["id"]
    save()
    comps = checks.sql("SELECT id FROM hr_employee_comp WHERE tenant_id=100000 AND employee_id=%s AND deleted=0", (employee_id,))
    if not comps:
        salary["compensationId"] = api(checks.owned, "POST", "/hr/compensation/employee-compensations", json={
            "employeeId": employee_id, "structureId": salary["structureId"], "totalSalary": 0,
            "componentValues": {}, "effectiveDate": "2026-10-01", "status": "ACTIVE"})
        save()
    slabs = checks.sql("SELECT slab_id,status,version FROM hr_tax_slab WHERE tenant_id=100000 AND slab_name=%s AND deleted=0", (tag,))
    payload = {"slabName": tag, "region": "独立打印验收", "thresholdAmount": 5000,
        "effectiveFrom": "2026-01-01", "effectiveTo": "2026-12-31", "status": "DRAFT", "remark": tag}
    if not slabs:
        salary["slabId"] = api(checks.owned, "POST", "/hr/compensation/payroll/tax-slabs", json=payload)
        save()
        slabs = checks.sql("SELECT slab_id,status,version FROM hr_tax_slab WHERE tenant_id=100000 AND slab_id=%s", (salary["slabId"],))
    else:
        salary["slabId"] = slabs[0]["slab_id"]
        save()
    if slabs[0]["status"] == "DRAFT":
        details = checks.sql("SELECT level_no FROM hr_tax_slab_detail WHERE tenant_id=100000 AND slab_id=%s AND deleted=0", (salary["slabId"],))
        if not details:
            brackets = [(0, 36000, .03, 0), (36000, 144000, .1, 2520), (144000, 300000, .2, 16920),
                (300000, 420000, .25, 31920), (420000, 660000, .3, 52920),
                (660000, 960000, .35, 85920), (960000, None, .45, 181920)]
            api(checks.owned, "PUT", f"/hr/compensation/payroll/tax-slabs/{salary['slabId']}/details", json=[
                {"levelNo": index + 1, "fromAmount": lower, "toAmount": upper, "taxRate": rate,
                 "quickDeduction": quick} for index, (lower, upper, rate, quick) in enumerate(brackets)])
        api(checks.owned, "PUT", f"/hr/compensation/payroll/tax-slabs/{salary['slabId']}",
            json={**payload, "status": "ACTIVE", "version": slabs[0]["version"]})
        save()
    profiles = checks.sql("SELECT id FROM hr_tax_profile WHERE tenant_id=100000 AND employee_id=%s", (employee_id,))
    if not profiles:
        salary["profileId"] = api(checks.owned, "POST", "/hr/compensation/tax-profiles", json={
            "employeeId": employee_id, "taxSlabId": salary["slabId"], "threshold": 5000,
            "taxResidenceCity": "独立打印验收", "status": "ACTIVE"})
        save()


if __name__ == "__main__":
    raise SystemExit(main())
