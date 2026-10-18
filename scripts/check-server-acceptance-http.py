"""Resume the outstanding HTTP acceptance checks, without replaying passed suites.

Uses existing dedicated fixtures, normal application APIs and read-only SQL.
No credentials, cookies, ticket URLs or generated documents are saved to disk.
"""
import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ordinary", ROOT / "scripts/check-server-remaining-functional.py")
ordinary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ordinary)
STATE = ROOT / ".cloudflow-runtime/server-deployment-20261018/acceptance-http-20261018.json"


def main():
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    if state.get("complete"):
        print("SKIP completed outstanding HTTP checks", flush=True)
        return
    if not state.get("templates", {}).get("complete"):
        # Fail before login or printing if the optional PDF parser is unavailable.
        from PyPDF2 import PdfReader

    def save():
        STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    checks = ordinary.Checks()
    original = None
    alternate = None
    access = None
    try:
        # All SQL, including fixture assertions and final checks, is read-only.
        with checks.connection.cursor() as cursor:
            cursor.execute("SET SESSION TRANSACTION READ ONLY")
        state["accountDisabled"] = False
        save()
        checks.account(verify_reset=False, reuse=True)
        assert checks.user_id == 33249060
        assert checks.sql("SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=%s AND deleted=0",
                          (checks.user_id,)) == [{"id": 8949052}]
        state.update(operatorId=checks.user_id, employeeId=8949052,
                     startedAt=time.strftime("%Y-%m-%d %H:%M:%S %z"))
        save()

        # Start one default-duration ticket while performing independent missing checks.
        if not state.get("expiry", {}).get("complete"):
            if state.get("expiry"):
                state.setdefault("expiryAttempts", []).append(state["expiry"])
            file_id = 28549053
            files = checks.sql("SELECT file_id,create_by,access_type FROM sys_file "
                "WHERE tenant_id=100000 AND file_id=%s AND deleted=0", (file_id,))
            assert files == [{"file_id": file_id, "create_by": checks.tag, "access_type": "PRIVATE"}]
            access = ordinary.api(checks.owned, "GET", f"/auth/system/file/{file_id}/url", params={"bizType": "PUBLIC"})
            assert access["url"].startswith("/api/auth/system/file/download?token=")
            wait_seconds = (access["expiresAt"] - int(time.time() * 1000)) / 1000
            assert 0 < wait_seconds <= 3600
            expires_deadline = time.monotonic() + wait_seconds + 1
            before = checks.owned.get(ordinary.support.ENTRY + access["url"], timeout=(5, 25))
            assert before.status_code == 200 and before.content == ("verification," + checks.tag + "\r\n").encode()
            state["expiry"] = {"fileId": file_id, "beforeHttp": 200, "beforeBytes": len(before.content),
                "expiresAt": access["expiresAt"], "issuedAtObserved": int(time.time() * 1000),
                "complete": False, "clockChanged": False, "configurationChanged": False,
                "explicitRedisWrites": 0}
            save()
            print("PASS 本人既有文件的正式短期链接到期前可用；等待原有效期自然结束", flush=True)

        if not state.get("templates", {}).get("complete"):
            original = ordinary.api(checks.admin, "GET", "/auth/system/print/template/31949059")
            assert original["templateCode"] == checks.tag + "_HRPAGE_SALARY_SLIP"
            assert original["bizType"] == "SALARY_SLIP" and original["defaultFlag"] == 0
            assert not checks.sql("SELECT template_id FROM sys_print_template WHERE tenant_id=100000 "
                "AND biz_type='SALARY_SLIP' AND default_flag=1 AND deleted=0")

            def template_save(value, method):
                return ordinary.api(checks.admin, method, "/auth/system/print/template", files={
                    "template": ("template.json", json.dumps(value, ensure_ascii=False).encode(), "application/json")})

            state.setdefault("templates", {})["defaultRestored"] = False
            save()
            current = template_save({**original, "defaultFlag": 1}, "PUT")
            code = checks.tag + "_SWITCH_B"
            existing = checks.sql("SELECT template_id FROM sys_print_template "
                "WHERE tenant_id=100000 AND template_code=%s AND deleted=0", (code,))
            if existing:
                assert len(existing) == 1
                alternate = ordinary.api(checks.admin, "GET", f"/auth/system/print/template/{existing[0]['template_id']}")
                assert alternate["templateContent"] == "<html><body><h1>SWITCH-TEMPLATE-B</h1><p>{{id}}</p></body></html>"
                if alternate["status"] != "ENABLED":
                    state["templates"]["alternateDisabled"] = False
                    save()
                    alternate = template_save({**alternate, "status": "ENABLED"}, "PUT")
            else:
                alternate = template_save({"templateCode": code, "templateName": "工资切换验收 B",
                    "bizType": "SALARY_SLIP", "templateFormat": "HTML", "outputFormat": "PDF",
                    "templateContent": "<html><body><h1>SWITCH-TEMPLATE-B</h1><p>{{id}}</p></body></html>",
                    "paperSize": "A4", "orientation": "PORTRAIT", "defaultFlag": 0,
                    "marginTop": 10, "marginBottom": 10, "marginLeft": 10, "marginRight": 10,
                    "status": "ENABLED"}, "POST")
            state.setdefault("templates", {}).update({"originalTemplateId": original["templateId"],
                "alternateTemplateId": alternate["templateId"], "originalDefaultFlag": 0,
                "complete": False})
            save()
            case = state["templates"]
            if not case.get("backendDefault"):
                before_records = checks.sql("SELECT record_id FROM sys_print_record WHERE tenant_id=100000 "
                    "AND operator_id=%s AND template_id=%s", (checks.user_id, original["templateId"]))
                response = ordinary.request(checks.owned, "POST", "/auth/system/print/SALARY_SLIP/14749051",
                                            params={"outputFormat": "HTML"})
                assert response.status_code == 200 and "14749051" in response.text
                assert "SWITCH-TEMPLATE-B" not in response.text
                assert "no-store" in response.headers.get("Cache-Control", "")
                after_records = checks.sql("SELECT record_id,template_id,file_size FROM sys_print_record "
                    "WHERE tenant_id=100000 AND operator_id=%s AND template_id=%s ORDER BY record_id",
                    (checks.user_id, original["templateId"]))
                new = [r for r in after_records if r["record_id"] not in {x["record_id"] for x in before_records}]
                assert len(new) == 1 and new[0]["file_size"] == len(response.content)
                case["backendDefault"] = {"http": 200, "recordId": new[0]["record_id"], "templateCodeOmitted": True}
                save()
                print("PASS 未指定模板编码时，真实打印接口选用唯一默认模板并留痕", flush=True)
            cookies = [{"name": c.name, "value": c.value, "domain": ordinary.support.HOST,
                        "path": c.path or "/", "httpOnly": c.has_nonstandard_attr("HttpOnly"),
                        "secure": c.secure, "sameSite": "Lax"} for c in checks.owned.cookies]
            result = subprocess.run(["node", "scripts/check-server-print-switch-browser.mjs"],
                cwd=ROOT / "cloudflow-frontend", input=json.dumps({"entry": ordinary.support.ENTRY,
                "cookies": cookies, "defaultCode": original["templateCode"], "defaultName": original["templateName"],
                "alternateCode": alternate["templateCode"], "alternateName": alternate["templateName"]}),
                text=True, encoding="utf-8", capture_output=True, timeout=100)
            if result.returncode:
                raise AssertionError("Template switching browser check failed: " + result.stderr[-900:])
            browser = json.loads(result.stdout.strip())
            for item in browser["prints"]:
                raw = base64.b64decode(item.pop("pdf"))
                text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(raw)).pages)
                assert ("SWITCH-TEMPLATE-B" in text) == (item["code"] == alternate["templateCode"])
                records = checks.sql("SELECT record_id,file_size FROM sys_print_record WHERE tenant_id=100000 "
                    "AND operator_id=%s AND template_code=%s AND biz_id='14749051' AND output_format='PDF' "
                    "ORDER BY record_id DESC LIMIT 1", (checks.user_id, item["code"]))
                assert len(records) == 1 and records[0]["file_size"] == len(raw)
                item.update(recordId=records[0]["record_id"], sha256=hashlib.sha256(raw).hexdigest(), markerChecked=True)
            case.update(browser=browser, checksPassed=True)
            save()
            print("PASS 实际工资页面默认选中A、生成A、切换B并生成不同内容；两条打印留痕一致", flush=True)

        if not state.get("aggregation", {}).get("complete"):
            samples = ["d078fbcd45f702294493d32dfd90cfb9", "03c6ba8e875b24a81d1643d7179a9d84",
                       "c2a5dea9e87b48bbad8de816d0fc8dd3"]
            actual_errors = checks.sql("SELECT trace_id FROM sys_api_error_log WHERE tenant_id=100000 "
                "AND occur_time >= '2026-10-18' AND occur_time < '2026-10-19' "
                "AND trace_id IS NOT NULL ORDER BY error_id DESC LIMIT 1")
            if actual_errors and actual_errors[0]["trace_id"] not in samples:
                samples.append(actual_errors[0]["trace_id"])
            evidence = []
            for trace in samples:
                bundle = ordinary.api(checks.admin, "GET", "/auth/system/log/trace/" + trace,
                                      params={"pageNum": 1, "pageSize": 200})
                assert bundle["traceId"] == trace
                entry = {"traceId": trace, "http": 200}
                for group, table, key, condition in (("operations", "sys_log", "log_id", "create_time"),
                        ("errors", "sys_api_error_log", "error_id", "occur_time"),
                        ("frontend", "oa_frontend_error_log", "id", "create_time")):
                    db = checks.sql(f"SELECT {key} FROM {table} WHERE tenant_id=100000 AND trace_id=%s "
                        f"AND {condition} >= '2026-10-18' AND {condition} < '2026-10-19' ORDER BY {key}", (trace,))
                    id_field = {"log_id": "logId", "error_id": "errorId", "id": "id"}[key]
                    section = bundle[group]
                    assert section["total"] == len(db) <= 200
                    assert sorted(row[id_field] for row in section["rows"]) == [r[key] for r in db]
                    assert all(row["traceId"] == trace for row in section["rows"])
                    entry[group] = {"count": len(db), "ids": [r[key] for r in db]}
                entry["services"] = sorted({r["serviceName"] for r in bundle["operations"]["rows"] if r.get("serviceName")})
                evidence.append(entry)
            assert evidence[0]["frontend"]["count"] == 1 and evidence[0]["operations"]["count"] >= 2
            assert any(e["errors"]["count"] for e in evidence), "A real current-day backend error is required"
            state["aggregation"] = {"complete": True, "samples": evidence,
                "scope": "Existing real current-day traces, exact API/database ID equality; no synthetic six-service chain"}
            save()
            print("PASS 正式日志聚合接口与当日真实前端、网关、业务及异常记录逐项一致", flush=True)

    except Exception as error:
        state.setdefault("failures", []).append({"observedAt": time.strftime("%Y-%m-%d %H:%M:%S %z"),
                                                "type": type(error).__name__, "message": str(error)[:1000]})
        save()
        print("FAILED", type(error).__name__, str(error)[:1000], flush=True)
        raise
    finally:
        try:
            try:
                if access is not None:
                    while time.monotonic() < expires_deadline:
                        remaining = max(0, expires_deadline - time.monotonic())
                        print("WAIT 原下载凭据自然到期，剩余秒数", round(remaining), flush=True)
                        time.sleep(min(30, remaining))
                    expired = checks.owned.get(ordinary.support.ENTRY + access["url"], timeout=(5, 25))
                    body = expired.json()
                    assert expired.status_code == 410 and body.get("code") == 410 and not body.get("data")
                    state["expiry"].update(complete=True, afterHttp=410, afterCode=410,
                        finishedAt=time.strftime("%Y-%m-%d %H:%M:%S %z"))
                    save()
                    print("PASS 原签发链接自然到期后，正式网关HTTP410拒绝且无文件数据", flush=True)
            finally:
                restore_templates(checks, state, original, alternate, save)
        finally:
            checks.connection.rollback()
            checks.close()
            state["accountDisabled"] = True
            state["accountFinalizedAt"] = time.strftime("%Y-%m-%d %H:%M:%S %z")
            save()
    state.update(complete=all(state.get(key, {}).get("complete") for key in ("templates", "aggregation", "expiry")),
                 finishedAt=time.strftime("%Y-%m-%d %H:%M:%S %z"))
    save()
    print("RESULT", json.dumps(state, ensure_ascii=False), flush=True)


def restore_templates(checks, state, original, alternate, save):
    if original is not None:
        current = ordinary.api(checks.admin, "GET", f"/auth/system/print/template/{original['templateId']}")
        restore = {**original, "version": current["version"]}
        ordinary.api(checks.admin, "PUT", "/auth/system/print/template", files={
            "template": ("template.json", json.dumps(restore, ensure_ascii=False).encode(), "application/json")})
        assert not checks.sql("SELECT template_id FROM sys_print_template WHERE tenant_id=100000 "
            "AND biz_type='SALARY_SLIP' AND default_flag=1 AND deleted=0")
        state.setdefault("templates", {})["defaultRestored"] = True
        if alternate is not None:
            latest = ordinary.api(checks.admin, "GET", f"/auth/system/print/template/{alternate['templateId']}")
            ordinary.api(checks.admin, "PUT", "/auth/system/print/template", files={"template": (
                "template.json", json.dumps({**latest, "status": "DISABLED"}, ensure_ascii=False).encode(), "application/json")})
            state["templates"]["alternateDisabled"] = True
        if state["templates"].get("checksPassed"):
            state["templates"]["complete"] = True
        save()


if __name__ == "__main__":
    main()
