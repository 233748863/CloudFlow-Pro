"""Check only outstanding employee print permissions on the development server.

Reuse the existing dedicated account and its employee link. All writes use normal
APIs; SQL is read-only. No successful print, template, file or business is created.
Completed checks are saved individually so a retry does not replay them.
"""
import importlib.util
import json
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ordinary", ROOT / "scripts/check-server-remaining-functional.py")
ordinary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ordinary)


def main():
    state_path = ROOT / ".cloudflow-runtime/server-deployment-20261018/print-permissions-20261018.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    if state.get("complete"):
        print("SKIP completed employee print permission checks", flush=True)
        return 0
    if state.get("blockedOnDate") == time.strftime("%Y-%m-%d"):
        reset_path = state_path.with_name("captcha-quota-authorized-reset-20261018.json")
        reset = json.loads(reset_path.read_text(encoding="utf-8")) if reset_path.exists() else {}
        quota = reset.get("captchaQuota", {})
        if not (reset.get("observedAt", "").startswith(state["blockedOnDate"])
                and quota.get("database") == 10
                and quota.get("key") == "CAPTCHA:LIMIT:192.168.1.175"
                and quota.get("deletedKeys") == 1
                and quota.get("afterExists") is False
                and quota.get("afterTtl") == -2
                and quota.get("authorization")
                and state.get("quotaResetConsumedAt") != reset["observedAt"]):
            print("BLOCKED daily verification quota already reached; no login attempted", flush=True)
            return 2
        state.setdefault("blockingHistory", []).append({
            "date": state.pop("blockedOnDate"), "reason": state.pop("blockedReason", None),
            "resolvedBy": reset_path.name, "resolvedAt": reset["observedAt"]})
        state["quotaResetConsumedAt"] = reset["observedAt"]
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    def save():
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    checks = ordinary.Checks()
    try:
        checks.account(verify_reset=False, reuse=True)
        assert checks.user_id == 33249060, "Use only the existing dedicated print account"
        employees = checks.sql("SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=%s AND deleted=0",
                               (checks.user_id,))
        assert employees == [{"id": 8949052}], "Preserve the dedicated employee link"
        salaries = checks.sql("SELECT s.id,e.user_id FROM hr_salary_slip s JOIN hr_employee e "
            "ON e.id=s.employee_id AND e.tenant_id=s.tenant_id WHERE s.tenant_id=100000 "
            "AND s.id IN (24060,14749051) AND s.deleted=0 ORDER BY s.id")
        assert salaries == [{"id": 24060, "user_id": 1}, {"id": 14749051, "user_id": checks.user_id}]
        ordinary.api(checks.admin, "PUT", "/auth/system/user", json={"userId": checks.user_id,
            "userName": checks.tag, "nickName": "功能验收" + checks.tag[-6:], "status": "0", "roleIds": [5]})
        checks.owned.close()
        checks.owned = ordinary.session()
        ordinary.authenticate(checks.owned, checks.tag, checks.password)
        roles = checks.sql("SELECT role_id FROM sys_user_role WHERE user_id=%s ORDER BY role_id", (checks.user_id,))
        assert roles == [{"role_id": 5}], "Employee role only; no administrator role"
        state.update(operatorId=checks.user_id, employeeId=8949052, roleId=5)
        save()
        salary_case = json.loads((state_path.parent / "hr-print-pages-20261018.json").read_text(encoding="utf-8"))["cases"]["SALARY_SLIP"]
        assert salary_case["templateId"] == 31949059 and salary_case["complete"]

        if not (state.get("ownSalaryTemplates") or state.get("ownSalaryAccessObserved")):
            options = ordinary.api(checks.owned, "GET", "/auth/system/print/SALARY_SLIP/14749051/templates")
            assert any(item["templateCode"] == salary_case["templateCode"] for item in options), "Own salary normal access"
            state["ownSalaryTemplates"] = True
            save()
            checks.check(True, "普通员工可读取本人工资可用模板，正常授权对照通过")

        def denied(key, method, target, **kwargs):
            if key in state:
                return
            response = ordinary.request(checks.owned, method, target, **kwargs)
            assert not response.content.startswith((b"%PDF-", b"PK")), "Rejected response must not contain a document"
            body = response.json()
            assert response.status_code == 403 and body.get("code") == 403, (
                f"Expected permission denial: HTTP={response.status_code}, code={body.get('code')}")
            assert not body.get("data"), "Rejected response must not expose business data"
            state[key] = {"http": response.status_code, "code": body["code"], "message": body.get("msg")}
            save()
            checks.check(True, key + " 真实HTTP403拒绝且无文档或业务数据")

        before = checks.sql("SELECT COUNT(*) n FROM sys_print_record WHERE tenant_id=100000 "
            "AND operator_id=%s AND biz_type='SALARY_SLIP' AND biz_id='24060'", (checks.user_id,))[0]["n"]
        denied("otherSalaryTemplatesDenied", "GET", "/auth/system/print/SALARY_SLIP/24060/templates")
        denied("otherSalaryPrintDenied", "POST", "/auth/system/print/SALARY_SLIP/24060",
               params={"templateCode": salary_case["templateCode"], "outputFormat": "PDF"})
        after = checks.sql("SELECT COUNT(*) n FROM sys_print_record WHERE tenant_id=100000 "
            "AND operator_id=%s AND biz_type='SALARY_SLIP' AND biz_id='24060'", (checks.user_id,))[0]["n"]
        assert before == after == 0, "Unauthorized salary requests must not produce successful print records"
        state["rejectedPrintRecordCount"] = after
        save()

        code = checks.tag + "_DENIED_UPLOAD"
        template = {"templateCode": code, "templateName": "无权上传校验", "bizType": "SALARY_SLIP",
            "templateFormat": "HTML", "outputFormat": "PDF", "paperSize": "A4",
            "orientation": "PORTRAIT", "marginTop": 10, "marginBottom": 10, "marginLeft": 10,
            "marginRight": 10, "defaultFlag": 0, "status": "ENABLED"}
        denied("templateUploadDenied", "POST", "/auth/system/print/template", files={
            "template": ("template.json", json.dumps(template, ensure_ascii=False).encode(), "application/json"),
            "file": ("denied.html", b"<html><body>{{employeeName}}</body></html>", "text/html")})
        rows = checks.sql("SELECT template_id FROM sys_print_template WHERE tenant_id=100000 AND template_code=%s", (code,))
        assert not rows, "Unauthorized upload must not create a template"
        state["rejectedUploadTemplateCount"] = len(rows)
        denied("printRecordListDenied", "GET", "/auth/system/print/record/list", params={"pageNum": 1, "pageSize": 10})
        state["checksPassed"] = True
        save()
    except RuntimeError as error:
        if "今日验证次数已达上限" in str(error):
            state.update(blockedOnDate=time.strftime("%Y-%m-%d"),
                         blockedReason="今日验证次数已达上限", complete=False)
            save()
        raise
    finally:
        checks.close()
    state.update(complete=True, finishedAt=time.strftime("%Y-%m-%d %H:%M:%S %z"))
    save()
    print("RESULT", json.dumps(state, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
