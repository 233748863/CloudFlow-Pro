"""Check only the missing import page evidence with an owned validation task.

Reuse the already verified dedicated account. No business import is executed,
existing accounts are not changed, and no screenshot or report copy is saved.
"""
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("imports", ROOT / "scripts/check-server-business-imports.py")
imports = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imports)
ordinary = imports.ordinary


def main():
    state_path = ROOT / ".cloudflow-runtime/server-deployment-20261018/import-page-20261018.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    if state.get("complete"):
        print("SKIP completed import page checks", flush=True)
        return 0
    checks = ordinary.Checks()
    try:
        checks.account(verify_reset=False, reuse=True)
        if state.get("operatorId") not in (None, checks.user_id):
            raise AssertionError("Existing validation task belongs to a different dedicated account")
        state["operatorId"] = checks.user_id
        if "taskId" not in state:
            tag = checks.tag + "_PAGE"
            task = ordinary.api(checks.owned, "POST", "/oa/system/import/SUPPLIER/upload", files={"file": (
                tag + ".xlsx", imports.workbook(["供应商编号", "供应商名称", "状态"],
                    [[tag + "1", "页面验收专用供应商", "停用"], [tag + "2", "", "停用"]]),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
            state["taskId"] = task["taskId"]
            state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        task_id = state["taskId"]
        task = ordinary.api(checks.owned, "GET", f"/oa/system/import/{task_id}")
        if task["status"] == "UPLOADED":
            ordinary.api(checks.owned, "POST", f"/oa/system/import/{task_id}/validate")
        # This is a two-row validation task. The browser waits for its real error table.
        settings = {"entry": ordinary.support.ENTRY, "importOnly": True, "importTask": task_id,
            "importStatus": "VALIDATED", "cookies": [
                {"name": cookie.name, "value": cookie.value, "domain": ordinary.support.HOST,
                 "path": cookie.path or "/", "httpOnly": cookie.name == "Authorization",
                 "secure": False, "sameSite": "Lax"} for cookie in checks.owned.cookies]}
        result = subprocess.run(["node", "scripts/check-server-functional-browser.mjs"],
            cwd=ROOT / "cloudflow-frontend", input=json.dumps(settings), text=True, encoding="utf-8",
            capture_output=True, timeout=90)
        print(result.stdout, end="", flush=True)
        if result.returncode:
            print(result.stderr[-3000:], flush=True)
            return result.returncode
        task = ordinary.api(checks.owned, "GET", f"/oa/system/import/{task_id}")
        checks.check(task["status"] == "VALIDATED" and task["successRows"] == 0 and task["failRows"] == 0,
                     "页面补验仅校验文件，没有执行业务写入")
        state.update(complete=True, taskStatus=task["status"], browserOutput=result.stdout)
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        print("IMPORT_PAGE_PASS", json.dumps({"taskId": task_id, "operatorId": checks.user_id}), flush=True)
        return 0
    finally:
        checks.close()


if __name__ == "__main__":
    raise SystemExit(main())
