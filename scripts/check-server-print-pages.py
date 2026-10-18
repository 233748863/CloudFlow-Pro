"""Check only missing expense/purchase detail print buttons on the deployed app.

Uses the existing dedicated account and normal business APIs. Existing business
records are read, with one print record per missing page. No screenshots, output
copies, full regression, employee changes or administrator password changes.
Completed pages are skipped; templates remain while cleanup is paused.
"""
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ordinary", ROOT / "scripts/check-server-remaining-functional.py")
ordinary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ordinary)

CASES = {
    "EXPENSE_CLAIM": ("/expense/claim", "/oa/expense/claim/list", "claimNo", 9012),
    "PURCHASE_ORDER": ("/office/purchase-request", "/oa/purchase/request/list", "purchaseNo", 1749051),
}


def main():
    state_path = ROOT / ".cloudflow-runtime/server-deployment-20261018/print-pages-20261018.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {"cases": {}}
    if all(state["cases"].get(name, {}).get("complete") for name in CASES):
        print("SKIP completed print page checks", flush=True)
        return 0

    def save():
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    checks = ordinary.Checks()
    try:
        checks.account(verify_reset=False, reuse=True)
        if state.get("operatorId") not in (None, checks.user_id):
            raise AssertionError("Stored page evidence belongs to another dedicated account")
        state["operatorId"] = checks.user_id
        save()
        for biz_type, (route, list_path, number_key, verified_id) in CASES.items():
            case = state["cases"].setdefault(biz_type, {})
            if case.get("complete"):
                print("SKIP", biz_type, flush=True)
                continue
            if case.get("bizId") != verified_id or "pageNum" not in case:
                if case.get("browser") or case.get("recordId"):
                    raise AssertionError("Completed evidence must not be reassigned to another sample")
                if case.get("bizId"):
                    previous = checks.sql("SELECT record_id FROM sys_print_record WHERE tenant_id=100000 "
                        "AND template_id=%s AND biz_id=%s AND operator_id=%s",
                        (case["templateId"], str(case["bizId"]), checks.user_id))
                    if previous:
                        raise AssertionError("Previous sample has print evidence; inspect before changing it")
                    case.setdefault("rejectedSamples", []).append({"bizId": case["bizId"],
                        "documentNo": case["documentNo"], "reason": "demo workflow authorization refused", "http": 403})
                selected = None
                for page_num in range(1, 21):
                    result = ordinary.api(checks.owned, "GET", list_path, params={"pageNum": page_num, "pageSize": 10})
                    rows = result.get("records") or result.get("rows") or []
                    selected = next((row for row in rows if row["id"] == verified_id), None)
                    if selected or len(rows) < 10:
                        break
                if selected is None or not selected.get(number_key):
                    raise AssertionError("The previously verified business sample must be visible through the real list")
                case.update(bizId=selected["id"], documentNo=selected[number_key], pageNum=page_num)
                save()
            if "templateId" not in case:
                code = checks.tag + "_PAGE_" + biz_type
                templates = checks.sql("SELECT template_id,template_name FROM sys_print_template "
                    "WHERE tenant_id=100000 AND template_code=%s AND deleted=0", (code,))
                name = "页面验收 " + biz_type
                if templates:
                    template_id = templates[0]["template_id"]
                    name = templates[0]["template_name"]
                else:
                    template = checks.save_template({"templateCode": code, "templateName": name,
                        "bizType": biz_type, "templateFormat": "HTML", "outputFormat": "PDF",
                        "templateContent": "<html><body><h1>页面打印验收</h1><p>{{id}}</p></body></html>",
                        "paperSize": "A4", "orientation": "PORTRAIT", "marginTop": 10, "marginBottom": 10,
                        "marginLeft": 10, "marginRight": 10, "defaultFlag": 0, "status": "ENABLED"})
                    template_id = template["templateId"]
                case.update(templateId=template_id, templateCode=code, templateName=name)
                save()
            if "browser" not in case:
                existing = checks.sql("SELECT record_id FROM sys_print_record WHERE tenant_id=100000 "
                    "AND template_id=%s AND biz_id=%s AND operator_id=%s",
                    (case["templateId"], str(case["bizId"]), checks.user_id))
                if existing:
                    raise AssertionError("Print already exists without completed browser evidence; inspect before retry")
                settings = {"entry": ordinary.support.ENTRY, "printOnly": True,
                    "printCase": {**case, "bizType": biz_type, "route": route}, "cookies": [
                        {"name": cookie.name, "value": cookie.value, "domain": ordinary.support.HOST,
                         "path": cookie.path or "/", "httpOnly": cookie.name == "Authorization",
                         "secure": False, "sameSite": "Lax"} for cookie in checks.owned.cookies]}
                result = subprocess.run(["node", "scripts/check-server-functional-browser.mjs"],
                    cwd=ROOT / "cloudflow-frontend", input=json.dumps(settings), text=True, encoding="utf-8",
                    capture_output=True, timeout=75)
                print(result.stdout, end="", flush=True)
                if result.returncode:
                    print(result.stderr[-3000:], flush=True)
                    return result.returncode
                evidence = [json.loads(line.removeprefix("BROWSER_PRINT "))
                    for line in result.stdout.splitlines() if line.startswith("BROWSER_PRINT ")]
                if len(evidence) != 1 or evidence[0]["bizId"] != case["bizId"]:
                    raise AssertionError("Expected one completed browser print result")
                case["browser"] = evidence[0]
                save()
            records = checks.sql("SELECT record_id,file_size,operator_id,print_time,ip_address "
                "FROM sys_print_record WHERE tenant_id=100000 AND template_id=%s AND biz_id=%s "
                "AND operator_id=%s AND output_format='PDF'", (case["templateId"], str(case["bizId"]), checks.user_id))
            checks.check(len(records) == 1 and records[0]["file_size"] == case["browser"]["bytes"]
                and records[0]["print_time"] is not None and bool(records[0]["ip_address"]),
                biz_type + "详情打印按钮产生唯一真实打印记录，操作者及长度一致")
            case.update(recordId=records[0]["record_id"], complete=True)
            save()
            print("PRINT_PAGE_PASS", json.dumps({"bizType": biz_type, "bizId": case["bizId"],
                "templateId": case["templateId"], "recordId": case["recordId"]}), flush=True)
        return 0
    finally:
        checks.close()


if __name__ == "__main__":
    raise SystemExit(main())
