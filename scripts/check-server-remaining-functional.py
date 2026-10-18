"""Bounded checks against the deployed development server; no performance suite.

Credentials stay in environment variables and memory. Only this run's account and
templates are changed. Existing users, schedules and business records are preserved.
Browser cookies travel through stdin, never a file. No independent runtime is built.
"""
import argparse
import csv
import importlib.util
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import time

import pymysql
import requests

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("server_smoke", ROOT / "scripts/check-server-job-smoke.py")
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)


def session():
    value = requests.Session()
    value.trust_env = False
    value.headers.update({"Origin": support.ENTRY, "Referer": support.ENTRY + "/"})
    return value


def authenticate(client, username, password):
    challenge = api(client, "GET", "/auth/captcha/slider")
    passed = api(client, "POST", "/auth/captcha/check", json={
        "uuid": challenge["uuid"], "x": support.captcha_position(challenge)})
    release = api(client, "GET", "/auth/legal/public/active", params={"tenantCode": "xinyuan"})
    response = request(client, "POST", "/auth/login", json={"tenantCode": "xinyuan",
        "username": username, "password": password, "captchaToken": passed["passToken"],
        "legalReleaseCode": release["releaseCode"]})
    body = response.json()
    if response.status_code != 200 or body.get("code") != 200:
        message = str(body.get("msg", "")).replace(password, "[redacted]")
        raise RuntimeError(f"Login HTTP={response.status_code}, code={body.get('code')}, msg={message[:240]}")
    result = body["data"]
    assert result.get("token") and not result.get("requiresTotp"), "Login requires a usable session"
    client.headers["Authorization"] = "Bearer " + result["token"].removeprefix("Bearer ")
    csrf = client.cookies.get("XSRF-TOKEN")
    if csrf:
        client.headers["X-CSRF-Token"] = csrf
    return result


def request(client, method, target, **kwargs):
    return client.request(method, support.ENTRY + "/api" + target, timeout=(5, 25), **kwargs)


def api(client, method, target, **kwargs):
    response = request(client, method, target, **kwargs)
    try:
        body = response.json()
    except ValueError:
        raise RuntimeError(f"{method} {target}: HTTP={response.status_code}, non-JSON response") from None
    if response.status_code != 200 or body.get("code") != 200:
        message = str(body.get("msg", ""))
        for name, value in os.environ.items():
            if value and name.startswith("CLOUDFLOW_") and "PASSWORD" in name:
                message = message.replace(value, "[redacted]")
        raise RuntimeError(f"{method} {target}: HTTP={response.status_code}, code={body.get('code')}, msg={message[:240]}")
    return body.get("data")


class Checks:
    def __init__(self):
        self.connection = pymysql.connect(host=support.HOST, user="root",
            password=os.environ["CLOUDFLOW_DB_PASSWORD"], database="cloud_flow_db", charset="utf8mb4",
            autocommit=True, connect_timeout=10, read_timeout=15, cursorclass=pymysql.cursors.DictCursor)
        self.admin = session()
        self.owned = session()
        self.tag = "SF" + time.strftime("%m%d%H%M%S") + secrets.token_hex(2)
        self.password = "Cfp" + secrets.token_hex(10) + "9aZ"
        self.user_id = None
        self.templates = []
        self.import_task = None
        self.download_file = None
        self.passed = []

    def sql(self, statement, params=()):
        return support.query(self.connection, statement, params)

    def check(self, condition, label):
        if not condition:
            raise AssertionError(label)
        self.passed.append(label)
        print("PASS", label, flush=True)

    def account(self, verify_reset=True, reuse=False):
        authenticate(self.admin, os.environ["CLOUDFLOW_TEST_ADMIN_USERNAME"],
                     os.environ["CLOUDFLOW_TEST_ADMIN_PASSWORD"])
        if reuse:
            rows = self.sql("SELECT user_id,user_name,nick_name FROM sys_user WHERE tenant_id=100000 "
                "AND user_name REGEXP '^SF1018[0-9a-f]{10}$' AND nick_name LIKE %s "
                "AND status='1' AND deleted=0 ORDER BY user_id DESC LIMIT 1", ("功能验收%",))
            self.check(len(rows) == 1, "找到本轮已停用的专用账号，不新增用户")
            self.user_id = rows[0]["user_id"]
            self.tag = rows[0]["user_name"]
            api(self.admin, "PUT", "/auth/system/user", json={"userId": self.user_id,
                "userName": self.tag, "nickName": rows[0]["nick_name"], "status": "0", "roleIds": [1]})
            api(self.admin, "PUT", f"/auth/system/user/{self.user_id}/password", json={"password": self.password})
        else:
            api(self.admin, "POST", "/auth/system/user", json={"userName": self.tag,
                "nickName": "功能验收" + self.tag[-6:], "password": self.password,
                "deptId": 100, "status": "0", "roleIds": [1]})
            rows = self.sql("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=%s AND deleted=0", (self.tag,))
            self.check(len(rows) == 1, "专用测试账号由正式接口创建")
            self.user_id = rows[0]["user_id"]
        authenticate(self.owned, self.tag, self.password)
        if reuse:
            changed = "Cfp" + secrets.token_hex(10) + "7cX"
            api(self.owned, "PUT", "/auth/profile/password", json={"oldPassword": self.password, "newPassword": changed})
            self.password = changed
        info = api(self.owned, "GET", "/auth/info")
        self.check(info.get("forcePasswordChange") is False, "专用账号可正常登录且无需强制改密")
        self.check("password" not in api(self.admin, "GET", f"/auth/system/user/{self.user_id}"),
                   "用户详情真实响应隐藏密码")
        if not verify_reset:
            return
        reset_password = "Cfp" + secrets.token_hex(10) + "8bY"
        api(self.admin, "PUT", f"/auth/system/user/{self.user_id}/password", json={"password": reset_password})
        expired = request(self.owned, "GET", "/auth/info")
        body = expired.json()
        self.check(expired.status_code == 401 or body.get("code") == 401, "管理员重置使测试账号旧会话失效")
        self.owned.close()
        self.owned = session()
        result = authenticate(self.owned, self.tag, reset_password)
        self.check(result.get("forcePasswordChange") is True, "重置后真实登录要求修改密码")
        api(self.owned, "PUT", "/auth/profile/password", json={"oldPassword": reset_password,
                    "newPassword": self.password})
        info = api(self.owned, "GET", "/auth/info")
        self.check(info.get("forcePasswordChange") is False,
                   "测试账号按正式改密流程解除首次改密提示")
        deadline = time.monotonic() + 15
        while True:
            audit = self.sql("SELECT audit_id,before_json,after_json,diff_json FROM sys_audit_log "
                "WHERE tenant_id=100000 AND audit_name='重置用户密码' AND after_json LIKE %s "
                "ORDER BY audit_id DESC LIMIT 1", ("%" + str(self.user_id) + "%",))
            notices = self.sql("SELECT record_id,content,send_status FROM sys_message_record WHERE tenant_id=100000 "
                "AND receiver_id=%s AND biz_type='PASSWORD_RESET_BY_ADMIN' ORDER BY record_id DESC LIMIT 1", (self.user_id,))
            if audit and notices and notices[0]["send_status"] == "SUCCESS":
                break
            if time.monotonic() >= deadline:
                break
            time.sleep(.5)
        self.check(bool(audit), "密码重置审计真实落库")
        self.check(bool(notices) and notices[0]["send_status"] == "SUCCESS", "密码重置站内通知真实送达测试账号")
        serialized = json.dumps([audit, notices], ensure_ascii=False, default=str)
        self.check(self.password not in serialized and reset_password not in serialized
                   and "$2a$" not in serialized and "$2b$" not in serialized, "审计和通知不含密码或密码摘要")
        print("ACCOUNT", json.dumps({"tag": self.tag, "userId": self.user_id,
            "auditIds": [row["audit_id"] for row in audit],
            "noticeIds": [row["record_id"] for row in notices]}), flush=True)

    def save_template(self, value, method="POST"):
        return api(self.owned, method, "/auth/system/print/template",
            files={"template": ("template.json", json.dumps(value, ensure_ascii=False).encode(), "application/json")})

    def salary_denial(self):
        response = request(self.owned, "POST", "/auth/system/print/SALARY_SLIP/24060",
            params={"templateCode": self.tag + "_SALARY_SLIP", "outputFormat": "PDF"})
        body = response.json()
        print("PRINT_DENIAL", json.dumps({"http": response.status_code, "code": body.get("code"),
            "message": body.get("msg")}, ensure_ascii=False), flush=True)
        self.check(not response.content.startswith(b"%PDF-") and body.get("code") == 400
                   and body.get("msg") == "业务打印数据不可访问", "未绑定员工的账号无法获得工资打印数据")
        records = self.sql("SELECT record_id FROM sys_print_record WHERE tenant_id=100000 "
            "AND operator_id=%s AND biz_type='SALARY_SLIP' AND biz_id='24060'", (self.user_id,))
        self.check(not records, "拒绝请求未产生成功打印记录")

    def prerequisites(self):
        response = request(self.owned, "GET", "/hr/attendance/overtime-requests/mine")
        body = response.json()
        print("OVERTIME_PREREQUISITE", json.dumps({"http": response.status_code,
            "code": body.get("code")}), flush=True)
        self.check(response.status_code == 409 and body.get("code") == "EMPLOYEE_LINK_REQUIRED",
            "加班页409来源确认为专用账号未绑定员工档案")
        rows = self.sql("SELECT c.id FROM hr_certificate_request c JOIN hr_employee e ON e.id=c.employee_id "
            "AND e.tenant_id=c.tenant_id LEFT JOIN wf_process_instance w ON w.instance_id=c.process_instance_id "
            "AND w.tenant_id=c.tenant_id WHERE c.tenant_id=100000 AND e.user_id=1 AND c.deleted=0 "
            "AND c.status='ISSUED' AND c.process_instance_id IS NOT NULL AND w.instance_id IS NULL ORDER BY c.id LIMIT 1")
        self.check(bool(rows), "确认现存证明缺少真实关联流程的样本条件")
        biz_id = rows[0]["id"]
        template = self.save_template({"templateCode": self.tag + "_CERTIFICATE_BOUNDARY",
            "templateName": "证明关联流程校验", "bizType": "CERTIFICATE", "templateFormat": "HTML",
            "outputFormat": "PDF", "templateContent": "<html><body>{{id}}</body></html>",
            "paperSize": "A4", "orientation": "PORTRAIT", "marginTop": 10, "marginBottom": 10,
            "marginLeft": 10, "marginRight": 10, "defaultFlag": 0, "status": "ENABLED"})
        self.templates.append(template)
        options = api(self.admin, "GET", f"/auth/system/print/CERTIFICATE/{biz_id}/templates")
        self.check(any(row["templateCode"] == template["templateCode"] for row in options),
            "证明数据跨HR服务完成本人授权并列出模板")
        response = request(self.admin, "POST", f"/auth/system/print/CERTIFICATE/{biz_id}",
            params={"templateCode": template["templateCode"], "outputFormat": "PDF"})
        body = response.json()
        print("CERTIFICATE_BOUNDARY", json.dumps({"bizId": biz_id, "http": response.status_code,
            "code": body.get("code"), "message": body.get("msg")}, ensure_ascii=False), flush=True)
        self.check(response.status_code == 404 and body.get("code") == 404
            and body.get("msg") == "打印字段权限校验失败", "证明关联流程缺失时明确拒绝且不返回PDF")
        records = self.sql("SELECT record_id FROM sys_print_record WHERE tenant_id=100000 AND template_id=%s",
            (template["templateId"],))
        self.check(not records, "流程校验拒绝未产生成功打印记录")

    def printing(self, selected=None):
        candidates = {
            "SALARY_SLIP": "SELECT s.id FROM hr_salary_slip s JOIN hr_employee e ON e.id=s.employee_id "
                "AND e.tenant_id=s.tenant_id WHERE s.tenant_id=100000 AND e.user_id=1 AND s.deleted=0 LIMIT 1",
            "CERTIFICATE": "SELECT c.id FROM hr_certificate_request c JOIN hr_employee e ON e.id=c.employee_id "
                "AND e.tenant_id=c.tenant_id WHERE c.tenant_id=100000 AND e.user_id=1 AND c.deleted=0 AND c.status='ISSUED' LIMIT 1",
            "EXPENSE_CLAIM": "SELECT id FROM biz_expense_claim WHERE tenant_id=100000 AND deleted=0 "
                "AND instance_id IS NULL AND status='APPROVED' ORDER BY id LIMIT 1",
            "PURCHASE_ORDER": "SELECT id FROM biz_purchase_request WHERE tenant_id=100000 AND deleted=0 "
                "AND instance_id IS NULL AND reason=%s ORDER BY id DESC LIMIT 1",
        }
        for biz_type, sql in candidates.items():
            if selected and biz_type not in selected:
                continue
            if biz_type == "PURCHASE_ORDER":
                reason = "普通打印验收" + self.tag
                rows = self.sql(sql, (reason,))
                if not rows:
                    suppliers = self.sql("SELECT supplier_id FROM oa_supplier WHERE tenant_id=100000 "
                        "AND deleted=0 AND status='ACTIVE' ORDER BY supplier_id LIMIT 1")
                    consumables = self.sql("SELECT consumable_id FROM oa_consumable WHERE tenant_id=100000 "
                        "AND deleted=0 ORDER BY consumable_id LIMIT 1")
                    self.check(bool(suppliers) and bool(consumables), "采购打印存在可用供应商与耗材")
                    api(self.owned, "POST", "/oa/purchase/request", json={"supplierId": suppliers[0]["supplier_id"],
                        "reason": reason, "items": [{"consumableId": consumables[0]["consumable_id"], "quantity": 1, "unitPrice": 1}]})
                    rows = self.sql(sql, (reason,))
                print("PURCHASE_DRAFT", json.dumps({"id": rows[0]["id"] if rows else None,
                    "scope": "owned draft only; not submitted; retained while cleanup paused"}), flush=True)
            else:
                rows = self.sql(sql)
            self.check(bool(rows), biz_type + "存在真实可读业务样本")
            biz_id = rows[0]["id"]
            value = {"templateCode": self.tag + "_" + biz_type, "templateName": "验收" + biz_type,
                "bizType": biz_type, "templateFormat": "HTML", "outputFormat": "PDF",
                "templateContent": "<html><body><h1>功能验收 " + biz_type + "</h1><p>编号：{{id}}</p></body></html>",
                "paperSize": "A4", "orientation": "PORTRAIT", "marginTop": 10,
                "marginBottom": 10, "marginLeft": 10, "marginRight": 10,
                "defaultFlag": 0, "status": "ENABLED"}
            template = self.save_template(value)
            self.templates.append(template)
            self.check(template.get("templateId") is not None, biz_type + "模板通过真实接口保存")
            options = api(self.admin, "GET", f"/auth/system/print/{biz_type}/{biz_id}/templates")
            self.check(any(row["templateCode"] == value["templateCode"] for row in options), biz_type + "跨服务授权并列出模板")
            response = request(self.admin, "POST", f"/auth/system/print/{biz_type}/{biz_id}",
                params={"templateCode": value["templateCode"], "outputFormat": "PDF"})
            self.check(response.status_code == 200 and response.content.startswith(b"%PDF-"), biz_type + "真实业务返回PDF")
            self.check("no-store" in response.headers.get("Cache-Control", ""), biz_type + "打印响应禁止缓存")
            record = self.sql("SELECT record_id,file_size FROM sys_print_record WHERE tenant_id=100000 AND "
                "template_id=%s AND biz_id=%s ORDER BY record_id DESC LIMIT 1", (template["templateId"], str(biz_id)))
            self.check(bool(record) and record[0]["file_size"] == len(response.content), biz_type + "打印留痕已提交且文件长度一致")
            print("PRINT", json.dumps({"bizType": biz_type, "bizId": biz_id,
                "templateId": template["templateId"], "recordId": record[0]["record_id"],
                "bytes": len(response.content)}), flush=True)

    def download(self, file_id=None):
        content = ("verification," + self.tag + "\r\n").encode()
        if file_id is None:
            uploaded = api(self.owned, "POST", "/auth/system/file/upload",
                files={"file": (self.tag + ".csv", content, "text/csv")})
            self.download_file = uploaded["fileId"]
            self.check(uploaded["storageType"] == "LOCAL", "自有普通文件通过正式接口上传至本地存储")
        else:
            self.download_file = file_id
            files = self.sql("SELECT file_id FROM sys_file WHERE file_id=%s AND tenant_id=100000 "
                "AND create_by=%s AND deleted=0", (file_id, self.tag))
            self.check(len(files) == 1, "复用已上传的本人文件，仅续测失败与未执行项")
        # PUBLIC is the registered unbound-file context: the checker still requires
        # system:file:list and the original uploader. The file stays PRIVATE.
        endpoint = f"/auth/system/file/{self.download_file}/url"
        access = api(self.owned, "GET", endpoint, params={"bizType": "PUBLIC"})
        self.check(access["url"].startswith("/api/auth/system/file/download?token=")
            and access["expiresAt"] > int(time.time() * 1000), "真实下载入口签发短期会话凭据")
        response = self.owned.get(support.ENTRY + access["url"], timeout=(5, 25))
        self.check(response.status_code == 200 and response.content == content, "本人凭据真实下载内容与上传一致")
        headers = {name: response.headers.get(name, "") for name in ("Cache-Control", "X-Content-Type-Options")}
        print("DOWNLOAD_HEADERS", json.dumps(headers), flush=True)
        self.check("no-store" in headers["Cache-Control"]
            and all(value.strip().lower() == "nosniff" for value in headers["X-Content-Type-Options"].split(",")),
            "下载响应禁止缓存并限制内容嗅探")
        other = self.admin.get(support.ENTRY + access["url"], timeout=(5, 25))
        self.check(other.status_code == 410 or other.json().get("code") == 410, "其他账号不能复用本人下载凭据")
        denied = request(self.admin, "GET", endpoint, params={"bizType": "PUBLIC"})
        self.check(denied.status_code == 403 or denied.json().get("code") == 403,
            "其他账号即使管理员也不能签发本人未绑定文件的下载凭据")
        print("DOWNLOAD", json.dumps({"fileId": self.download_file, "bytes": len(content),
            "retained": True, "scope": "LOCAL, unbound uploader context, session binding"}), flush=True)

    def imports(self, include_catalog=True):
        for service in (("auth", "oa", "hr", "crm") if include_catalog else ()):
            types = api(self.owned, "GET", f"/{service}/system/import/types")
            print("IMPORT_TYPES", json.dumps({"service": service,
                "types": [row["bizType"] for row in types]}, ensure_ascii=False), flush=True)
            self.check(isinstance(types, list), service + "真实网关导入类型可读")
            for business in types:
                biz_type = business["bizType"]
                response = request(self.owned, "GET", f"/{service}/system/import/{biz_type}/template")
                self.check(response.status_code == 200 and response.content.startswith(b"PK"), biz_type + "导入模板真实HTTP下载")
        owner = self.sql("SELECT employee_no FROM hr_employee WHERE tenant_id=100000 AND user_id=1 "
                         "AND deleted=0 AND employee_status NOT IN ('RESIGNED','TERMINATED') ORDER BY id LIMIT 1")[0]["employee_no"]
        data = io.StringIO()
        writer = csv.writer(data)
        writer.writerow(["客户编码", "客户名称", "负责人"])
        writer.writerow([self.tag, "普通功能验收" + self.tag, owner])
        uploaded = api(self.owned, "POST", "/crm/system/import/CUSTOMER/upload",
            files={"file": (self.tag + ".csv", data.getvalue().encode("utf-8-sig"), "text/csv")})
        self.import_task = uploaded["taskId"]
        self.check(uploaded["status"] == "UPLOADED" and uploaded["totalRows"] == 1, "单行客户文件真实上传并建立任务")
        self.check(uploaded.get("fileUrl") == f"/system/import/{self.import_task}/file", "导入响应只提供授权下载入口")
        api(self.owned, "POST", f"/crm/system/import/{self.import_task}/validate")
        checked = self.wait_import()
        self.check(checked["status"] == "VALIDATED" and checked["validRows"] == 1,
                   "真实任务平台完成单行客户校验")
        preview = api(self.owned, "GET", f"/crm/system/import/{self.import_task}/preview")
        self.check(len(preview["rows"]) == 1 and not preview["errorCounts"], "真实预览保留一行且没有校验错误")
        download = request(self.owned, "GET", f"/crm/system/import/{self.import_task}/file")
        self.check(download.status_code == 200 and download.content == data.getvalue().encode("utf-8-sig"),
                   "导入原文件通过当前账号授权下载且内容一致")
        denied = request(self.admin, "GET", f"/crm/system/import/{self.import_task}/file")
        self.check(denied.status_code == 403 or denied.json().get("code") == 403,
                   "其他账号即使管理员也不能下载该导入原文件")
        api(self.owned, "POST", f"/crm/system/import/{self.import_task}/execute", json={"skipInvalidRows": False})
        finished = self.wait_import()
        self.check(finished["status"] == "SUCCESS" and finished["successRows"] == 1,
                   "真实任务平台完成一行客户导入")
        customer = self.sql("SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=%s AND deleted=0", (self.tag,))
        self.check(len(customer) == 1, "导入业务真实落库且仅新增一条")
        print("IMPORT", json.dumps({"taskId": self.import_task, "customerId": customer[0]["customer_id"]}), flush=True)

    def wait_import(self):
        deadline = time.monotonic() + 35
        while True:
            value = api(self.owned, "GET", f"/crm/system/import/{self.import_task}")
            if value["status"] not in ("VALIDATING", "IMPORTING", "PENDING"):
                return value
            if time.monotonic() >= deadline:
                raise AssertionError("Import did not finish within 35 seconds")
            time.sleep(.5)

    def browser(self, start=None, error_only=False):
        data = {"entry": support.ENTRY, "tag": self.tag, "start": start, "errorOnly": error_only, "cookies": [
            {"name": item.name, "value": item.value, "domain": support.HOST,
             "path": item.path or "/", "httpOnly": item.name == "Authorization", "secure": False,
             "sameSite": "Lax"} for item in self.owned.cookies]}
        result = subprocess.run(["node", "scripts/check-server-functional-browser.mjs"],
            cwd=ROOT / "cloudflow-frontend", input=json.dumps(data), text=True, encoding="utf-8", capture_output=True, timeout=240)
        print(result.stdout, end="", flush=True)
        if result.returncode:
            # The browser script reports paths and messages only, never session input.
            print(result.stderr[-2500:], flush=True)
            raise AssertionError("Deployed browser checks failed")
        self.check(True, "真实部署页面专项完成")
        if error_only:
            line = next(item for item in result.stdout.splitlines() if item.startswith("BROWSER_ERROR_REPORT "))
            evidence = json.loads(line.split(" ", 1)[1])
            deadline = time.monotonic() + 10
            while True:
                rows = self.sql("SELECT id,trace_id,user_id,tenant_id FROM oa_frontend_error_log "
                    "WHERE tenant_id=100000 AND message=%s ORDER BY id DESC LIMIT 1", (evidence["message"],))
                if rows or time.monotonic() >= deadline:
                    break
                time.sleep(.25)
            self.check(bool(rows) and rows[0]["trace_id"] == evidence["traceId"]
                and rows[0]["user_id"] == self.user_id, "普通页面错误携带最近真实业务请求编号并落库到当前账号")
            print("ERROR_RECORD", json.dumps(rows, default=str), flush=True)

    def close(self):
        problems = []
        if self.import_task is not None:
            try:
                value = api(self.owned, "GET", f"/crm/system/import/{self.import_task}")
                if value["status"] in ("UPLOADED", "VALIDATED"):
                    api(self.owned, "POST", f"/crm/system/import/{self.import_task}/cancel")
                customers = self.sql("SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=%s AND deleted=0", (self.tag,))
                for customer in customers:
                    api(self.owned, "DELETE", f"/crm/customer/{customer['customer_id']}")
            except Exception:
                problems.append("import:" + str(self.import_task))
        for template in reversed(self.templates):
            try:
                api(self.owned, "DELETE", "/auth/system/print/template/" + str(template["templateId"]),
                            params={"version": template["version"]})
            except Exception:
                problems.append("template:" + str(template["templateId"]))
        if self.user_id is not None:
            try:
                api(self.admin, "PUT", "/auth/system/user", json={"userId": self.user_id,
                    "userName": self.tag, "nickName": "功能验收" + self.tag[-6:], "status": "1", "roleIds": []})
                self.check(self.sql("SELECT status FROM sys_user WHERE user_id=%s", (self.user_id,))[0]["status"] == "1",
                           "专用测试账号收尾停用，审计历史保留")
            except Exception:
                problems.append("account:" + str(self.user_id))
        for client in (self.owned, self.admin):
            try:
                request(client, "POST", "/auth/logout")
            except requests.RequestException:
                pass
            client.close()
        self.connection.close()
        if problems:
            raise AssertionError("Owned fixture finalization required: " + ",".join(problems))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=("account", "print", "salary-denial", "prerequisites", "download", "trace", "remaining", "import", "browser", "all"), default="all")
    parser.add_argument("--download-file-id", type=int, help="Resume checks using a previously uploaded owned file")
    parser.add_argument("--print-types", nargs="+", choices=("SALARY_SLIP", "CERTIFICATE", "EXPENSE_CLAIM", "PURCHASE_ORDER"))
    parser.add_argument("--skip-import-catalog", action="store_true", help="Reuse the already verified type/template result")
    parser.add_argument("--browser-start", help="Resume at width:path; previously passed pages are skipped")
    parser.add_argument("--reuse-account", action="store_true", help="Reuse an owned disabled account via normal activation and password-change APIs")
    args = parser.parse_args()
    checks = Checks()
    try:
        checks.account(verify_reset=args.case in ("account", "all"), reuse=args.reuse_account)
        for name, action in (("print", lambda: checks.printing(selected=args.print_types)),
                ("salary-denial", checks.salary_denial),
                ("prerequisites", checks.prerequisites),
                ("download", lambda: checks.download(file_id=args.download_file_id)),
                ("trace", lambda: checks.browser(error_only=True)),
                ("import", lambda: checks.imports(include_catalog=not args.skip_import_catalog)),
                ("browser", lambda: checks.browser(start=args.browser_start))):
            if args.case in (name, "all") or (args.case == "remaining" and name in ("print", "salary-denial", "download", "trace")):
                action()
        print("FUNCTIONAL_PASS", json.dumps({"case": args.case, "checks": len(checks.passed), "tag": checks.tag}), flush=True)
    finally:
        checks.close()


if __name__ == "__main__":
    main()
