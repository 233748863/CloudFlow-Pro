import datetime as dt
import json

from regression_common import (
    ROOT_DIR,
    CloudFlowSession,
    RegressionError,
    StepRecorder,
    ensure,
    ensure_equal,
    format_date,
    format_datetime,
    json_dumps,
    normalize_page_rows,
    normalize_page_total,
    save_json,
    unique_text,
)


RESULT_PATH = ROOT_DIR / "oa_backend_regression_result.json"
TOKENS_PATH = ROOT_DIR / "ui_session_tokens.json"


class OABackendRegression:
    def __init__(self):
        self.session = CloudFlowSession()
        self.recorder = StepRecorder("OA Backend Functional Regression")
        self.users = {}
        self.process_definitions = {}
        self.process_name_by_key = {}

    def run(self):
        self.recorder.run("登录并初始化用户会话", self.init_users)
        self.recorder.run("预检 Workflow 定义覆盖 OA 申请单", self.precheck_workflow_definitions)
        self.recorder.run("工作台与通讯录查询", self.test_workplace_and_contact)
        self.recorder.run("通知列表与未读数", self.test_notices)
        self.recorder.run("公告发布-阅读-统计-撤销链路", self.test_announcements)
        self.recorder.run("考勤规则-打卡-记录-统计", self.test_attendance)
        self.recorder.run("会议室与日程联动", self.test_meeting_and_schedule)
        self.recorder.run("固定资产全状态流", self.test_assets)
        self.recorder.run("耗材库存流转", self.test_consumables)
        self.recorder.run("协作任务 CRUD 与状态流", self.test_work_tasks)
        self.recorder.run("访客预约与进出流程", self.test_visitors)
        self.recorder.run("值班排班与换班流程", self.test_duty_schedule)
        self.recorder.run("前端错误上报接口", self.test_error_report)
        self.recorder.run("离线同步上传/下载/冲突解决", self.test_sync)
        self.recorder.run("车辆管理、用车申请与费用转报销", self.test_vehicle_and_convert)
        self.recorder.run("请假申请工作流闭环", self.test_leave_flow)
        self.recorder.run("加班申请工作流闭环", self.test_overtime_flow)
        self.recorder.run("出差申请工作流闭环", self.test_business_trip_flow)
        self.recorder.run("报销申请工作流闭环", self.test_expense_claim_flow)
        self.recorder.run("付款申请工作流闭环", self.test_payment_request_flow)
        self.recorder.run("补卡/外勤申请工作流闭环", self.test_attendance_appeal_flow)

        summary = self.recorder.summary()
        summary["generatedAt"] = format_datetime(dt.datetime.now())
        summary["users"] = {
            username: {
                "userId": info["user"]["userId"],
                "userName": info["user"]["userName"],
                "nickName": info["user"].get("nickName"),
                "role": info["user"].get("role"),
            }
            for username, info in self.users.items()
        }
        summary["workflowDefinitions"] = self.process_definitions
        save_json(RESULT_PATH, summary)
        print(json_dumps(summary))
        return summary

    # ==================== 基础工具 ====================

    def api(self, username: str):
        return self.session.gateway(username)

    def unwrap_ok(self, response, label: str):
        ensure(response is not None, f"{label} 无响应")
        ensure(response.get("code") == 200, f"{label}失败：{response}")
        return response.get("data")

    def find_record(self, rows, field: str, value):
        for row in rows:
            if row.get(field) == value:
                return row
        raise RegressionError(f"未找到 {field}={value!r} 的记录")

    def list_records(self, username: str, path: str, params=None):
        data = self.unwrap_ok(self.api(username).get(path, params=params), f"查询 {path}")
        return normalize_page_rows(data), data

    def get_workflow_instance(self, instance_id: str):
        return self.unwrap_ok(self.api("admin").get(f"/workflow/instance/{instance_id}"), "查询流程实例详情")

    def get_workflow_trace(self, instance_id: str):
        return self.unwrap_ok(self.api("admin").get(f"/workflow/instance/{instance_id}/trace"), "查询流程轨迹")

    def find_todo_task(self, username: str, instance_id: str):
        rows, _ = self.list_records(username, "/workflow/todo", {"pageNum": 1, "pageSize": 200})
        for row in rows:
            if row.get("instanceId") == instance_id and row.get("status") == "TODO":
                return row
        return None

    def approve_instance_until_completed(self, instance_id: str):
        approvals = []
        approvers = ("admin", "zhao", "wang", "li")
        for _ in range(10):
            matched = None
            matched_user = None
            for username in approvers:
                task = self.find_todo_task(username, instance_id)
                if task:
                    matched = task
                    matched_user = username
                    break
            if not matched:
                break

            payload = {
                "taskId": matched["taskId"],
                "action": "APPROVE",
                "comment": f"OA回归自动审批-{matched_user}",
            }
            self.unwrap_ok(
                self.api(matched_user).post("/workflow/complete", payload),
                f"审批流程任务 {matched['taskId']}",
            )
            approvals.append(
                {
                    "user": matched_user,
                    "taskId": matched["taskId"],
                    "nodeName": matched.get("nodeName"),
                    "assignee": matched.get("assignee"),
                }
            )
            instance = self.get_workflow_instance(instance_id)
            if instance.get("status") in ("COMPLETED", "TERMINATED", "REJECTED", "CANCELLED"):
                return {"approvals": approvals, "instance": instance}

        instance = self.get_workflow_instance(instance_id)
        return {"approvals": approvals, "instance": instance}

    def run_form_workflow(
        self,
        *,
        create_user: str,
        create_path: str,
        list_path: str,
        detail_prefix: str,
        submit_prefix: str,
        payload: dict,
        update_patch: dict,
        match_field: str,
        process_key: str,
        extra_checks=None,
    ):
        self.unwrap_ok(self.api(create_user).post(create_path, payload), f"新增草稿 {create_path}")
        rows, _ = self.list_records(create_user, list_path, {"pageNum": 1, "pageSize": 100})
        record = self.find_record(rows, match_field, payload[match_field])
        record_id = record["id"]

        update_body = {**record, **update_patch, "id": record_id}
        self.unwrap_ok(self.api(create_user).put(create_path, update_body), f"编辑草稿 {create_path}")
        self.unwrap_ok(self.api(create_user).post(f"{submit_prefix}/{record_id}"), f"提交申请 {submit_prefix}")
        detail = self.unwrap_ok(self.api(create_user).get(f"{detail_prefix}/{record_id}"), f"查询申请详情 {detail_prefix}")
        ensure_equal(detail.get("status"), "PENDING", "提交后状态不是 PENDING")
        instance_id = detail.get("instanceId")
        ensure(instance_id, f"{process_key} 提交后未生成 instanceId，可能是流程定义或启动链路异常")
        approval = self.approve_instance_until_completed(instance_id)
        ensure_equal(approval["instance"].get("status"), "COMPLETED", f"{process_key} 流程未完成")
        trace = self.get_workflow_trace(instance_id)
        ensure_equal(trace.get("status"), "COMPLETED", f"{process_key} 流程轨迹状态异常")
        if extra_checks:
            extra_checks(record_id, detail, approval, trace)
        return {
            "id": record_id,
            "instanceId": instance_id,
            "approvals": approval["approvals"],
            "traceStatus": trace.get("status"),
        }

    # ==================== 初始化与预检 ====================

    def init_users(self):
        for username in ("admin", "zhang", "zhao", "li", "wang"):
            _, info = self.session.login(username)
            self.users[username] = info

        token_payload = {
            "generatedAt": format_datetime(dt.datetime.now()),
            "users": {
                username: {
                    "token": self.session.tokens[username],
                    "userId": info["user"]["userId"],
                    "userName": info["user"]["userName"],
                    "nickName": info["user"].get("nickName"),
                    "role": info["user"].get("role"),
                    "deptId": info["user"].get("deptId"),
                    "deptName": info["user"].get("deptName"),
                    "tenantId": info["user"].get("tenantId"),
                    "avatar": info["user"].get("avatar"),
                    "email": info["user"].get("email"),
                    "phone": info["user"].get("phonenumber"),
                }
                for username, info in self.users.items()
            },
        }
        save_json(TOKENS_PATH, token_payload)
        return token_payload

    def precheck_workflow_definitions(self):
        rows, _ = self.list_records("admin", "/workflow/definitions", {"pageNum": 1, "pageSize": 500})
        self.process_definitions = {row["processKey"]: row["status"] for row in rows}
        self.process_name_by_key = {row["processKey"]: row.get("processName") for row in rows}

        expected_published = {
            "leave_request": "请假申请流程",
            "overtime_request": "加班申请流程",
            "business_trip": "出差申请流程",
            "expense_claim": "报销申请流程",
            "payment_request": "付款申请流程",
        }
        for process_key, desc in expected_published.items():
            ensure_equal(self.process_definitions.get(process_key), "PUBLISHED", f"{desc} 未发布")

        ensure_equal(
            self.process_definitions.get("attendance_appeal"),
            "PUBLISHED",
            "补卡/外勤流程定义未发布或被错误覆盖",
        )
        ensure_equal(
            self.process_definitions.get("vehicle_approval"),
            "PUBLISHED",
            "用车审批流程定义缺失或未发布",
        )
        return self.process_definitions

    # ==================== OA 基础模块 ====================

    def test_workplace_and_contact(self):
        summary = self.unwrap_ok(self.api("admin").get("/oa/workplace/summary"), "查询 OA 工作台汇总")
        recent_tasks = self.unwrap_ok(self.api("admin").get("/oa/workplace/recent-tasks"), "查询 OA 最近任务")
        ensure(isinstance(summary, dict), "工作台汇总返回异常")
        ensure(isinstance(recent_tasks, list), "最近任务返回异常")

        contacts, contact_data = self.list_records("admin", "/oa/contact/list", {"pageNum": 1, "pageSize": 20})
        ensure(normalize_page_total(contact_data) >= len(contacts), "通讯录总数异常")
        depts = self.unwrap_ok(self.api("admin").get("/oa/contact/dept/tree"), "查询部门树")
        ensure(isinstance(depts, list) and len(depts) > 0, "部门树为空")
        user = self.unwrap_ok(self.api("admin").get("/oa/contact/user/1"), "查询通讯录用户详情")
        ensure(user.get("user_id") == 1 or user.get("userId") == 1, "通讯录用户详情返回异常")
        return {
            "workplaceKeys": sorted(summary.keys()),
            "recentTaskCount": len(recent_tasks),
            "contactCount": normalize_page_total(contact_data),
            "deptCount": len(depts),
        }

    def test_notices(self):
        notices, notice_data = self.list_records("admin", "/oa/notice/list", {"pageNum": 1, "pageSize": 20})
        unread_count = self.unwrap_ok(self.api("admin").get("/oa/notice/unread-count"), "查询未读通知数量")

        detail = None
        if notices:
            notice_id = notices[0].get("noticeId")
            detail = self.unwrap_ok(self.api("admin").get(f"/oa/notice/{notice_id}"), "查询通知详情")
            self.unwrap_ok(self.api("admin").post(f"/oa/notice/read/{notice_id}"), "标记通知已读")

        return {
            "noticeCount": normalize_page_total(notice_data),
            "unreadCount": unread_count,
            "sampleNoticeId": detail.get("noticeId") if isinstance(detail, dict) else None,
        }

    def test_announcements(self):
        unique_title = unique_text("CODEx-OA-ANN")
        publish_payload = {
            "title": unique_title,
            "content": f"{unique_title} 内容",
            "type": "INFO",
            "scopeType": "ALL",
            "scopeValue": "",
            "priority": "NORMAL",
            "isTop": 0,
        }
        self.unwrap_ok(self.api("admin").post("/oa/announcement/publish", publish_payload), "发布公告")

        manage_data = self.unwrap_ok(
            self.api("admin").get(
                "/oa/announcement/manage-list",
                {"title": unique_title, "page": 1, "size": 20},
            ),
            "查询公告管理列表",
        )
        rows = normalize_page_rows(manage_data)
        announcement = self.find_record(rows, "title", unique_title)
        announcement_id = announcement["announcementId"]

        announcement["priority"] = "HIGH"
        announcement["content"] = f"{unique_title} 已编辑"
        self.unwrap_ok(self.api("admin").put("/oa/announcement", announcement), "编辑公告")
        self.unwrap_ok(self.api("admin").post(f"/oa/announcement/toggle-top/{announcement_id}"), "切换公告置顶")

        my_list = self.unwrap_ok(self.api("zhang").get("/oa/announcement/my-list"), "查询我的公告列表")
        ensure(any(item.get("announcementId") == announcement_id for item in my_list), "员工侧未看到新公告")
        self.unwrap_ok(self.api("zhang").post(f"/oa/announcement/read/{announcement_id}"), "公告标记已读")
        read_stats = self.unwrap_ok(self.api("admin").get(f"/oa/announcement/read-stats/{announcement_id}"), "查询公告阅读统计")

        self.unwrap_ok(self.api("admin").post(f"/oa/announcement/revoke/{announcement_id}"), "撤销公告")
        self.unwrap_ok(self.api("admin").delete(f"/oa/announcement/{announcement_id}"), "删除公告")
        return {"announcementId": announcement_id, "readStats": read_stats}

    def test_attendance(self):
        today = dt.date.today()
        rule_payload = {
            "ruleName": unique_text("CODEx-Attendance-Rule"),
            "checkInTime": "09:00:00",
            "checkOutTime": "18:00:00",
            "elasticMinutes": 60,
            "workDays": "[1,2,3,4,5,6,7]",
            "lunchBreakStart": "12:00:00",
            "lunchBreakEnd": "13:00:00",
            "overtimeEnabled": 1,
            "overtimeMinMinutes": 30,
            "lateToleranceCount": 3,
            "severeLateMinutes": 120,
            "absentMinutes": 240,
            "photoRequired": 0,
            "enabled": 1,
            "locationPoints": "",
            "wifiConfigs": "",
            "radius": 500,
            "remark": "OA回归测试规则",
        }
        self.unwrap_ok(self.api("admin").post("/oa/attendance/rule", rule_payload), "保存考勤规则")
        rule = self.unwrap_ok(self.api("admin").get("/oa/attendance/rule"), "查询考勤规则")
        ensure(rule.get("ruleName") == rule_payload["ruleName"], "考勤规则未更新")

        checkin_payload = {
            "type": "1",
            "checkTime": format_datetime(dt.datetime.now()),
            "location": "31.2304,121.4737",
            "address": "上海市黄浦区人民大道200号",
            "deviceInfo": "Windows Chrome",
            "wifiInfo": "CloudFlow-OA",
            "remark": "OA回归签到",
        }
        checkout_payload = {
            "type": "2",
            "checkTime": format_datetime(dt.datetime.now()),
            "location": "31.2304,121.4737",
            "address": "上海市黄浦区人民大道200号",
            "deviceInfo": "Windows Chrome",
            "wifiInfo": "CloudFlow-OA",
            "remark": "OA回归签退",
        }
        self.unwrap_ok(self.api("zhang").post("/oa/attendance/checkin", checkin_payload), "签到")
        self.unwrap_ok(self.api("zhang").post("/oa/attendance/checkin", checkout_payload), "签退")

        records = self.unwrap_ok(
            self.api("zhang").get(
                "/oa/attendance/records",
                {
                    "userId": self.users["zhang"]["user"]["userId"],
                    "startDate": format_date(today),
                    "endDate": format_date(today),
                    "pageNum": 1,
                    "pageSize": 20,
                },
            ),
            "查询考勤记录",
        )
        stats = self.unwrap_ok(
            self.api("zhang").get(
                "/oa/attendance/statistics",
                {"userId": self.users["zhang"]["user"]["userId"], "month": today.strftime("%Y-%m")},
            ),
            "查询考勤统计",
        )
        ensure(len(normalize_page_rows(records)) >= 2, "当天考勤记录数量异常")
        return {"recordCount": normalize_page_total(records), "statsKeys": sorted(stats.keys())}

    def test_meeting_and_schedule(self):
        room_name = unique_text("CODEx-Room")
        room_payload = {
            "name": room_name,
            "capacity": 12,
            "location": "5楼A区",
            "equipment": '["电视","白板"]',
            "status": "1",
        }
        self.unwrap_ok(self.api("admin").post("/oa/meeting-room", room_payload), "新增会议室")
        rooms = self.unwrap_ok(self.api("admin").get("/oa/meeting-room/list"), "查询会议室列表")
        room = self.find_record(rooms, "name", room_name)
        room_id = room["roomId"]

        room["capacity"] = 16
        self.unwrap_ok(self.api("admin").put("/oa/meeting-room", room), "编辑会议室")
        room_detail = self.unwrap_ok(self.api("admin").get(f"/oa/meeting-room/{room_id}"), "查询会议室详情")
        ensure_equal(room_detail.get("capacity"), 16, "会议室容量未更新")

        start_time = dt.datetime.now() + dt.timedelta(days=1)
        start_time = start_time.replace(hour=14, minute=0, second=0, microsecond=0)
        end_time = start_time + dt.timedelta(hours=1)
        event_payload = {
            "title": unique_text("CODEx-Meeting"),
            "description": "OA回归会议预订",
            "startTime": format_datetime(start_time),
            "endTime": format_datetime(end_time),
            "isAllDay": False,
            "roomId": room_id,
            "attendees": "admin,zhang",
        }
        self.unwrap_ok(self.api("admin").post("/oa/schedule", event_payload), "创建日程")
        my_bookings = self.unwrap_ok(self.api("admin").get("/oa/schedule/my-bookings"), "查询我的预订")
        event = self.find_record(my_bookings, "title", event_payload["title"])
        event_id = event["eventId"]

        room_events = self.unwrap_ok(
            self.api("admin").get(f"/oa/schedule/room/{room_id}", {"date": format_date(start_time.date())}),
            "查询会议室当天日程",
        )
        ensure(any(item.get("eventId") == event_id for item in room_events), "会议室日程未返回新记录")
        week_events = self.unwrap_ok(
            self.api("admin").get(f"/oa/schedule/room/{room_id}/week", {"weekStart": format_date(start_time.date())}),
            "查询会议室周视图",
        )
        today_events = self.unwrap_ok(self.api("admin").get("/oa/schedule/today"), "查询今日日程")
        my_events = self.unwrap_ok(
            self.api("admin").get(
                "/oa/schedule/my-events",
                {"start": format_date(start_time.date()), "end": format_date((start_time + dt.timedelta(days=2)).date())},
            ),
            "查询我的日程",
        )
        stats = self.unwrap_ok(
            self.api("admin").get(
                "/oa/schedule/room-stats",
                {"startDate": format_date(start_time.date()), "endDate": format_date((start_time + dt.timedelta(days=2)).date())},
            ),
            "查询会议室使用统计",
        )
        self.unwrap_ok(self.api("admin").put(f"/oa/schedule/cancel/{event_id}"), "取消会议预订")
        self.unwrap_ok(self.api("admin").delete(f"/oa/schedule/{event_id}"), "删除日程")
        self.unwrap_ok(self.api("admin").delete(f"/oa/meeting-room/{room_id}"), "删除会议室")
        return {
            "roomId": room_id,
            "eventId": event_id,
            "todayCount": len(today_events),
            "myEventsCount": len(my_events),
            "weekEventCount": len(week_events),
            "roomStatsCount": len(stats),
        }

    def test_assets(self):
        asset_code = unique_text("ASSET")
        payload = {
            "assetCode": asset_code,
            "name": unique_text("CODEx-Asset"),
            "category": "LAPTOP",
            "model": "ThinkPad X1",
            "status": "1",
            "price": 12999,
            "location": "IT仓库",
            "remark": "OA回归资产",
        }
        self.unwrap_ok(self.api("admin").post("/oa/asset", payload), "新增资产")
        rows, _ = self.list_records("admin", "/oa/asset/list", {"pageNum": 1, "pageSize": 100, "assetCode": asset_code})
        asset = self.find_record(rows, "assetCode", asset_code)
        asset_id = asset["assetId"]

        asset["location"] = "研发部"
        self.unwrap_ok(self.api("admin").put("/oa/asset", asset), "编辑资产")
        detail = self.unwrap_ok(self.api("admin").get(f"/oa/asset/{asset_id}"), "查询资产详情")
        ensure_equal(detail.get("location"), "研发部", "资产位置未更新")
        self.unwrap_ok(self.api("admin").post(f"/oa/asset/{asset_id}/borrow", params={"userId": self.users["zhang"]["user"]["userId"]}), "借用资产")
        borrow_logs = self.unwrap_ok(self.api("admin").get(f"/oa/asset/{asset_id}/logs"), "查询资产日志")
        ensure(len(borrow_logs) >= 1, "资产借用日志为空")
        self.unwrap_ok(self.api("admin").post(f"/oa/asset/{asset_id}/return"), "归还资产")
        self.unwrap_ok(self.api("admin").post(f"/oa/asset/{asset_id}/repair", params={"remark": "OA回归测试送修"}), "资产送修")
        self.unwrap_ok(self.api("admin").post(f"/oa/asset/{asset_id}/scrap", params={"remark": "OA回归测试报废"}), "资产报废")
        self.api("admin").get(f"/oa/asset/{asset_id}/qrcode")
        stats = self.unwrap_ok(self.api("admin").get("/oa/asset/statistics"), "查询资产统计")
        categories = self.unwrap_ok(self.api("admin").get("/oa/asset/categories"), "查询资产分类")
        self.unwrap_ok(self.api("admin").delete(f"/oa/asset/{asset_id}"), "删除资产")
        return {"assetId": asset_id, "logCount": len(borrow_logs), "categoriesCount": len(categories), "statsKeys": sorted(stats.keys())}

    def test_consumables(self):
        payload = {
            "name": unique_text("CODEx-Consumable"),
            "model": "A4-80g",
            "unit": "包",
            "quantity": 20,
            "lowStockThreshold": 10,
        }
        self.unwrap_ok(self.api("admin").post("/oa/consumable", payload), "新增耗材")
        rows, _ = self.list_records("admin", "/oa/consumable/list", {"pageNum": 1, "pageSize": 100})
        item = self.find_record(rows, "name", payload["name"])
        consumable_id = item["consumableId"]

        item["quantity"] = 18
        self.unwrap_ok(self.api("admin").put("/oa/consumable", item), "编辑耗材")
        detail = self.unwrap_ok(self.api("admin").get(f"/oa/consumable/{consumable_id}"), "查询耗材详情")
        ensure_equal(detail.get("quantity"), 18, "耗材数量未更新")
        self.unwrap_ok(self.api("admin").post(f"/oa/consumable/{consumable_id}/add-stock", {"quantity": 5}), "耗材入库")
        self.unwrap_ok(self.api("admin").post(f"/oa/consumable/{consumable_id}/reduce-stock", {"quantity": 12}), "耗材出库")
        low_stock = self.unwrap_ok(self.api("admin").get("/oa/consumable/low-stock"), "查询低库存耗材")
        ensure(any(item.get("consumableId") == consumable_id for item in low_stock), "低库存列表未包含目标耗材")
        self.unwrap_ok(self.api("admin").delete(f"/oa/consumable/{consumable_id}"), "删除耗材")
        return {"consumableId": consumable_id, "lowStockCount": len(low_stock)}

    def test_work_tasks(self):
        title = unique_text("CODEx-Task")
        payload = {
            "title": title,
            "description": "OA回归任务",
            "assigneeId": self.users["admin"]["user"]["userId"],
            "priority": 1,
            "status": "TODO",
        }
        self.unwrap_ok(self.api("admin").post("/oa/work-task", payload), "创建协作任务")
        task_list = self.unwrap_ok(self.api("admin").get("/oa/work-task/list"), "查询任务列表")
        task = self.find_record(task_list, "title", title)
        task_id = task["taskId"]
        task["description"] = "OA回归任务-已编辑"
        self.unwrap_ok(self.api("admin").put("/oa/work-task", task), "编辑协作任务")
        detail = self.unwrap_ok(self.api("admin").get(f"/oa/work-task/{task_id}"), "查询任务详情")
        ensure_equal(detail.get("description"), "OA回归任务-已编辑", "任务描述未更新")
        self.unwrap_ok(self.api("admin").put("/oa/work-task/status", {"taskId": task_id, "status": "DONE"}), "更新任务状态")
        done_tasks = self.unwrap_ok(self.api("admin").get("/oa/work-task/list", {"status": "DONE"}), "查询已完成任务")
        ensure(any(item.get("taskId") == task_id for item in done_tasks), "任务状态更新后未出现在 DONE 列表")
        self.unwrap_ok(self.api("admin").delete(f"/oa/work-task/{task_id}"), "删除任务")
        return {"taskId": task_id, "doneCount": len(done_tasks)}

    def test_visitors(self):
        visit_date = dt.date.today() + dt.timedelta(days=1)
        base_payload = {
            "visitorName": unique_text("CODEx-Visitor"),
            "visitorPhone": "13800138000",
            "visitorCompany": "CloudFlow",
            "visitorCount": 1,
            "visitReason": "OA回归来访",
            "hostId": self.users["admin"]["user"]["userId"],
            "hostName": "Admin",
            "hostDept": "研发部",
            "visitDate": format_date(visit_date),
            "visitTimeStart": "09:00:00",
            "visitTimeEnd": "10:00:00",
            "visitArea": "A栋前台",
        }
        self.unwrap_ok(self.api("admin").post("/oa/visitor", base_payload), "新增访客预约")
        rows, _ = self.list_records("admin", "/oa/visitor/list", {"pageNum": 1, "pageSize": 100})
        visitor = self.find_record(rows, "visitorName", base_payload["visitorName"])
        visitor_id = visitor["visitorId"]

        visitor["remark"] = "OA回归编辑"
        self.unwrap_ok(self.api("admin").put("/oa/visitor", visitor), "编辑访客预约")
        self.unwrap_ok(self.api("admin").put(f"/oa/visitor/confirm/{visitor_id}"), "确认访客预约")
        self.unwrap_ok(self.api("admin").put(f"/oa/visitor/checkin/{visitor_id}"), "访客签到")
        self.unwrap_ok(self.api("admin").put(f"/oa/visitor/checkout/{visitor_id}"), "访客签退")
        detail = self.unwrap_ok(self.api("admin").get(f"/oa/visitor/{visitor_id}"), "查询访客详情")
        ensure_equal(detail.get("status"), "COMPLETED", "访客流程未完成")

        cancel_payload = {
            **base_payload,
            "visitorName": unique_text("CODEx-Visitor-Cancel"),
            "visitorPhone": "13800138001",
        }
        self.unwrap_ok(self.api("admin").post("/oa/visitor", cancel_payload), "新增待取消访客")
        rows, _ = self.list_records("admin", "/oa/visitor/list", {"pageNum": 1, "pageSize": 100})
        cancel_visitor = self.find_record(rows, "visitorName", cancel_payload["visitorName"])
        self.unwrap_ok(self.api("admin").put(f"/oa/visitor/cancel/{cancel_visitor['visitorId']}"), "取消访客预约")
        self.unwrap_ok(self.api("admin").delete(f"/oa/visitor/{visitor_id},{cancel_visitor['visitorId']}"), "删除访客记录")
        return {"visitorIds": [visitor_id, cancel_visitor["visitorId"]]}

    def test_duty_schedule(self):
        duty_date = dt.date.today() + dt.timedelta(days=1)
        payload = {
            "title": unique_text("CODEx-Duty"),
            "scheduleType": "DAY",
            "dutyDate": format_date(duty_date),
            "shiftType": "MORNING",
            "startTime": "09:00:00",
            "endTime": "18:00:00",
            "userId": self.users["admin"]["user"]["userId"],
            "userName": "admin",
            "deptId": self.users["admin"]["user"]["deptId"],
            "deptName": "研发部",
            "location": "机房A",
            "dutyContent": "OA回归值班",
        }
        self.unwrap_ok(self.api("admin").post("/oa/duty", payload), "新增值班排班")
        rows, _ = self.list_records("admin", "/oa/duty/list", {"pageNum": 1, "pageSize": 100})
        schedule = self.find_record(rows, "title", payload["title"])
        schedule_id = schedule["scheduleId"]

        schedule["location"] = "机房B"
        self.unwrap_ok(self.api("admin").put("/oa/duty", schedule), "编辑值班排班")
        detail = self.unwrap_ok(self.api("admin").get(f"/oa/duty/{schedule_id}"), "查询值班详情")
        ensure_equal(detail.get("location"), "机房B", "值班地点未更新")

        batch_payload = [
            {
                "title": unique_text("CODEx-Duty-Batch"),
                "scheduleType": "DAY",
                "dutyDate": format_date(duty_date + dt.timedelta(days=1)),
                "shiftType": "EVENING",
                "startTime": "18:00:00",
                "endTime": "23:00:00",
                "userId": self.users["zhang"]["user"]["userId"],
                "userName": "zhang",
                "deptId": self.users["zhang"]["user"]["deptId"],
                "deptName": "研发部",
                "location": "机房A",
                "dutyContent": "OA回归批量排班",
            }
        ]
        self.unwrap_ok(self.api("admin").post("/oa/duty/batch", batch_payload), "批量新增值班排班")
        rows, _ = self.list_records("admin", "/oa/duty/list", {"pageNum": 1, "pageSize": 100})
        batch_schedule = self.find_record(rows, "title", batch_payload[0]["title"])
        calendar = self.unwrap_ok(
            self.api("admin").get("/oa/duty/calendar", {"year": duty_date.year, "month": duty_date.month}),
            "查询值班日历",
        )
        ensure(any(item.get("scheduleId") == schedule_id for item in calendar), "值班日历未返回新增排班")
        self.unwrap_ok(self.api("admin").put(f"/oa/duty/checkin/{schedule_id}"), "值班签到")
        self.unwrap_ok(self.api("admin").put(f"/oa/duty/checkout/{schedule_id}"), "值班签退")
        self.unwrap_ok(
            self.api("admin").put(
                f"/oa/duty/swap/{batch_schedule['scheduleId']}",
                {
                    "backupUserId": self.users["admin"]["user"]["userId"],
                    "backupUserName": "admin",
                    "reason": "OA回归换班",
                },
            ),
            "值班换班",
        )
        self.unwrap_ok(self.api("admin").delete(f"/oa/duty/{schedule_id},{batch_schedule['scheduleId']}"), "删除值班排班")
        return {"scheduleIds": [schedule_id, batch_schedule["scheduleId"]], "calendarCount": len(calendar)}

    def test_error_report(self):
        payload = {
            "message": unique_text("CODEx-Frontend-Error"),
            "stack": "Error: regression test",
            "componentStack": "at RegressionComponent",
            "context": "oa-backend-regression",
            "url": "http://127.0.0.1:3000/office/announcement",
            "userAgent": "RegressionBot",
            "level": "error",
            "tags": {"suite": "oa"},
            "extra": {"source": "codex"},
            "clientTime": format_datetime(dt.datetime.now()),
        }
        self.unwrap_ok(self.api("admin").post("/oa/error-report", payload), "前端错误上报")
        return {"message": payload["message"]}

    def test_sync(self):
        timestamp = format_datetime(dt.datetime.now())
        upload_payload = {
            "deviceId": unique_text("CODEx-Device"),
            "timestamp": timestamp,
            "data": [
                {
                    "type": "leave_request",
                    "id": unique_text("LOCAL"),
                    "action": "create",
                    "payload": {"title": "OA离线同步测试"},
                    "localTimestamp": timestamp,
                }
            ],
        }
        upload_result = self.unwrap_ok(self.api("zhang").post("/oa/sync/upload", upload_payload), "上传离线数据")
        download_result = self.unwrap_ok(
            self.api("zhang").get("/oa/sync/download", {"lastSyncTime": timestamp, "deviceId": upload_payload["deviceId"]}),
            "下载增量数据",
        )
        self.unwrap_ok(
            self.api("zhang").post(
                "/oa/sync/resolve-conflicts",
                [
                    {
                        "entityType": "leave_request",
                        "entityId": "LOCAL-1",
                        "clientVersion": 1,
                        "serverVersion": 2,
                        "resolution": "SERVER",
                    }
                ],
            ),
            "解决同步冲突",
        )
        return {"upload": upload_result, "downloadKeys": sorted(download_result.keys())}

    def test_vehicle_and_convert(self):
        plate = f"沪A{int(dt.datetime.now().timestamp()) % 100000:05d}"
        vehicle_payload = {
            "licensePlate": plate,
            "brand": "比亚迪",
            "model": "汉DM",
            "color": "黑色",
            "capacity": 5,
            "status": "1",
            "mileage": 1200,
            "location": "园区停车场",
        }
        self.unwrap_ok(self.api("admin").post("/oa/vehicle", vehicle_payload), "新增车辆")
        rows, _ = self.list_records("admin", "/oa/vehicle/list", {"pageNum": 1, "pageSize": 100})
        vehicle = self.find_record(rows, "licensePlate", plate)
        vehicle_id = vehicle["vehicleId"]
        detail = self.unwrap_ok(self.api("admin").get(f"/oa/vehicle/{vehicle_id}"), "查询车辆详情")
        ensure_equal(detail.get("licensePlate"), plate, "车辆详情返回异常")
        available = self.unwrap_ok(self.api("admin").get("/oa/vehicle/available"), "查询可用车辆")
        ensure(any(item.get("vehicleId") == vehicle_id for item in available), "可用车辆列表未包含新增车辆")
        stats = self.unwrap_ok(self.api("admin").get("/oa/vehicle/stats"), "查询车辆统计")

        start_time = dt.datetime.now() + dt.timedelta(days=1)
        start_time = start_time.replace(hour=9, minute=0, second=0, microsecond=0)
        end_time = start_time + dt.timedelta(hours=4)
        usage_payload = {
            "vehicleId": vehicle_id,
            "applicantId": self.users["zhang"]["user"]["userId"],
            "driverId": self.users["admin"]["user"]["userId"],
            "startTime": format_datetime(start_time),
            "endTime": format_datetime(end_time),
            "destination": "客户现场",
            "returnLocation": "园区停车场",
            "isRoundTrip": 1,
            "reason": unique_text("CODEx-Vehicle-Use"),
            "passengerCount": 2,
            "passengers": "zhang,admin",
            "startMileage": 1200,
        }
        usage_response = self.api("zhang").post("/oa/vehicle/usage", usage_payload)
        ensure(usage_response.get("code") == 200, f"用车申请失败：{usage_response}")

        vehicle_expense_payload = {
            "vehicleId": vehicle_id,
            "expenseType": "1",
            "amount": 88.5,
            "expenseDate": format_date(dt.date.today()),
            "description": unique_text("CODEx-Vehicle-Expense"),
        }
        self.unwrap_ok(self.api("admin").post("/oa/vehicle/expense", vehicle_expense_payload), "新增车辆费用")
        expense_rows, _ = self.list_records("admin", "/oa/vehicle/expense/list", {"pageNum": 1, "pageSize": 100})
        expense = self.find_record(expense_rows, "description", vehicle_expense_payload["description"])
        self.unwrap_ok(self.api("admin").get("/oa/vehicle/expense/stats"), "查询车辆费用统计")
        self.unwrap_ok(
            self.api("admin").post(
                "/oa/expense/claim/convert",
                {"vehicleExpenseIds": [expense["expenseId"]], "userId": self.users["zhang"]["user"]["userId"]},
            ),
            "车辆费用转报销",
        )

        usage_rows, usage_page = self.list_records("admin", "/oa/vehicle/usage/list", {"pageNum": 1, "pageSize": 100})
        usage = self.find_record(usage_rows, "reason", usage_payload["reason"])
        self.unwrap_ok(
            self.api("admin").put(
                f"/oa/vehicle/usage/{usage['usageId']}/approve",
                {"approved": True, "remark": "OA回归审批"},
            ),
            "审批用车申请",
        )
        self.unwrap_ok(
            self.api("admin").put(
                f"/oa/vehicle/usage/{usage['usageId']}/return",
                {"endMileage": 1288, "remark": "OA回归还车"},
            ),
            "归还车辆",
        )

        self.unwrap_ok(self.api("admin").delete(f"/oa/vehicle/{vehicle_id}"), "删除车辆")
        return {
            "vehicleId": vehicle_id,
            "usageResponse": usage_response,
            "usageCount": normalize_page_total(usage_page),
            "statsKeys": sorted(stats.keys()),
        }

    # ==================== 工作流业务闭环 ====================

    def test_leave_flow(self):
        start = (dt.datetime.now() + dt.timedelta(days=2)).replace(hour=9, minute=0, second=0, microsecond=0)
        end = start + dt.timedelta(hours=8)
        payload = {
            "leaveType": "ANNUAL",
            "startTime": format_datetime(start),
            "endTime": format_datetime(end),
            "leaveDays": 1.0,
            "reason": unique_text("CODEx-Leave"),
        }
        return self.run_form_workflow(
            create_user="zhang",
            create_path="/oa/leave",
            list_path="/oa/leave/list",
            detail_prefix="/oa/leave",
            submit_prefix="/oa/leave/submit",
            payload=payload,
            update_patch={"reason": f"{payload['reason']}-已编辑"},
            match_field="reason",
            process_key="leave_request",
        )

    def test_overtime_flow(self):
        start = (dt.datetime.now() + dt.timedelta(days=2)).replace(hour=19, minute=0, second=0, microsecond=0)
        end = start + dt.timedelta(hours=3)
        payload = {
            "overtimeType": "WORKDAY",
            "startTime": format_datetime(start),
            "endTime": format_datetime(end),
            "overtimeHours": 3.0,
            "compensateType": "PAY",
            "reason": unique_text("CODEx-Overtime"),
            "workContent": "OA回归加班",
            "expectedOutput": "完成回归验证",
            "needMeal": 0,
            "workLocation": "办公室",
        }
        return self.run_form_workflow(
            create_user="zhang",
            create_path="/oa/overtime",
            list_path="/oa/overtime/list",
            detail_prefix="/oa/overtime",
            submit_prefix="/oa/overtime/submit",
            payload=payload,
            update_patch={"workContent": "OA回归加班-已编辑"},
            match_field="reason",
            process_key="overtime_request",
        )

    def test_business_trip_flow(self):
        start_date = dt.date.today() + dt.timedelta(days=5)
        end_date = start_date + dt.timedelta(days=2)
        payload = {
            "departure": "上海",
            "destination": "杭州",
            "startDate": format_date(start_date),
            "endDate": format_date(end_date),
            "tripDays": 2.0,
            "transportType": "TRAIN",
            "estimatedCost": 800,
            "accommodation": "杭州西溪酒店",
            "contactPhone": "13800138000",
            "emergencyContact": "李四",
            "emergencyPhone": "13800138002",
            "projectName": "OA回归项目",
            "companions": "zhang",
            "reason": unique_text("CODEx-BusinessTrip"),
            "itinerary": "第一天客户沟通，第二天项目复盘",
        }
        return self.run_form_workflow(
            create_user="zhang",
            create_path="/oa/business-trip",
            list_path="/oa/business-trip/list",
            detail_prefix="/oa/business-trip",
            submit_prefix="/oa/business-trip/submit",
            payload=payload,
            update_patch={"itinerary": "第一天客户沟通，第二天项目复盘-已编辑"},
            match_field="reason",
            process_key="business_trip",
        )

    def test_expense_claim_flow(self):
        payload = {
            "category": "TRANSPORT",
            "totalAmount": 268.5,
            "description": unique_text("CODEx-ExpenseClaim"),
            "items": [
                {
                    "expenseType": "TRANSPORT",
                    "amount": 168.5,
                    "expenseDate": format_date(dt.date.today()),
                    "description": "往返高铁",
                },
                {
                    "expenseType": "MEAL",
                    "amount": 100,
                    "expenseDate": format_date(dt.date.today()),
                    "description": "客户餐费",
                },
            ],
        }
        month = dt.date.today().strftime("%Y-%m")
        result = self.run_form_workflow(
            create_user="zhang",
            create_path="/oa/expense/claim",
            list_path="/oa/expense/claim/list",
            detail_prefix="/oa/expense/claim",
            submit_prefix="/oa/expense/claim/submit",
            payload=payload,
            update_patch={"description": f"{payload['description']}-已编辑"},
            match_field="description",
            process_key="expense_claim",
        )
        dept_stats = self.unwrap_ok(self.api("admin").get("/oa/expense/claim/stats/dept", {"month": month}), "查询报销部门统计")
        category_stats = self.unwrap_ok(self.api("admin").get("/oa/expense/claim/stats/category", {"month": month}), "查询报销分类统计")
        result["deptStatsCount"] = len(dept_stats)
        result["categoryStatsCount"] = len(category_stats)
        return result

    def test_payment_request_flow(self):
        payload = {
            "payeeName": "杭州云流科技有限公司",
            "payeeAccount": "6222020202020202",
            "payeeBank": "招商银行上海分行",
            "amount": 5200,
            "paymentType": "SERVICE",
            "reason": unique_text("CODEx-Payment"),
            "expectedDate": format_date(dt.date.today() + dt.timedelta(days=7)),
        }
        month = dt.date.today().strftime("%Y-%m")
        result = self.run_form_workflow(
            create_user="zhang",
            create_path="/oa/payment/request",
            list_path="/oa/payment/request/list",
            detail_prefix="/oa/payment/request",
            submit_prefix="/oa/payment/request/submit",
            payload=payload,
            update_patch={"reason": f"{payload['reason']}-已编辑"},
            match_field="reason",
            process_key="payment_request",
        )
        dept_stats = self.unwrap_ok(self.api("admin").get("/oa/payment/request/stats/dept", {"month": month}), "查询付款部门统计")
        result["deptStatsCount"] = len(dept_stats)
        return result

    def test_attendance_appeal_flow(self):
        payload = {
            "appealType": "MISSING_CHECKIN",
            "appealDate": format_date(dt.date.today()),
            "appealTime": "09:15:00",
            "checkType": "1",
            "originalStatus": "2",
            "witnessName": "Admin",
            "location": "31.2304,121.4737",
            "address": "上海市黄浦区人民大道200号",
            "reason": unique_text("CODEx-AttendanceAppeal"),
        }
        return self.run_form_workflow(
            create_user="zhang",
            create_path="/oa/attendance/appeal",
            list_path="/oa/attendance/appeal/list",
            detail_prefix="/oa/attendance/appeal",
            submit_prefix="/oa/attendance/appeal/submit",
            payload=payload,
            update_patch={"address": "上海市黄浦区中山东一路1号"},
            match_field="reason",
            process_key="attendance_appeal",
        )

    def init_users(self):
        cached_users = {}
        if TOKENS_PATH.exists():
            try:
                cached_users = json.loads(TOKENS_PATH.read_text(encoding="utf-8")).get("users", {})
            except json.JSONDecodeError:
                cached_users = {}

        for username in ("admin", "zhang", "zhao", "li", "wang"):
            info = None
            try:
                _, info = self.session.login(username)
            except Exception as exc:  # noqa: BLE001
                cached = cached_users.get(username, {})
                token = cached.get("token")
                ensure(token, f"{username} 登录失败，且没有可复用 token：{exc}")
                info_response = self.session.auth_client.get("/info", headers={"Authorization": f"Bearer {token}"})
                ensure(
                    info_response and info_response.get("code") == 200,
                    f"{username} 登录失败，且缓存 token 已失效：{exc}",
                )
                self.session.tokens[username] = token
                info = info_response["data"]
                self.session.user_infos[username] = info
            self.users[username] = info

        token_payload = {
            "generatedAt": format_datetime(dt.datetime.now()),
            "users": {
                username: {
                    "token": self.session.tokens[username],
                    "userId": info["user"]["userId"],
                    "userName": info["user"]["userName"],
                    "nickName": info["user"].get("nickName"),
                    "role": info["user"].get("role"),
                    "deptId": info["user"].get("deptId"),
                    "deptName": info["user"].get("deptName"),
                    "tenantId": info["user"].get("tenantId"),
                    "avatar": info["user"].get("avatar"),
                    "email": info["user"].get("email"),
                    "phone": info["user"].get("phonenumber"),
                }
                for username, info in self.users.items()
            },
        }
        save_json(TOKENS_PATH, token_payload)
        return token_payload

    def precheck_workflow_definitions(self):
        rows, _ = self.list_records("admin", "/workflow/definitions", {"pageNum": 1, "pageSize": 500})
        latest_rows = {}
        for row in rows:
            process_key = row["processKey"]
            current = latest_rows.get(process_key)
            if current is None:
                latest_rows[process_key] = row
                continue
            current_version = current.get("version") or 0
            row_version = row.get("version") or 0
            if row.get("isLatest"):
                latest_rows[process_key] = row
            elif not current.get("isLatest") and row_version >= current_version:
                latest_rows[process_key] = row

        self.process_definitions = {key: row["status"] for key, row in latest_rows.items()}
        self.process_name_by_key = {key: row.get("processName") for key, row in latest_rows.items()}

        expected_published = {
            "leave_request": "请假申请流程",
            "overtime_request": "加班申请流程",
            "business_trip": "出差申请流程",
            "expense_claim": "报销申请流程",
            "payment_request": "付款申请流程",
        }
        for process_key, desc in expected_published.items():
            ensure_equal(self.process_definitions.get(process_key), "PUBLISHED", f"{desc} 未发布")

        ensure_equal(
            self.process_definitions.get("attendance_appeal"),
            "PUBLISHED",
            "补卡/外勤流程定义未发布或被错误覆盖",
        )
        ensure_equal(
            self.process_definitions.get("vehicle_approval"),
            "PUBLISHED",
            "用车审批流程定义缺失或未发布",
        )
        return self.process_definitions

    def _json_date_start(self, value):
        return dt.datetime.combine(value, dt.time.min).strftime("%Y-%m-%dT%H:%M:%S")

    def _utc_millis(self, value=None):
        value = value or dt.datetime.now(dt.timezone.utc)
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        else:
            value = value.astimezone(dt.timezone.utc)
        return value.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    def _sync_timestamp(self, value=None):
        value = value or dt.datetime.now(dt.timezone.utc)
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        else:
            value = value.astimezone(dt.timezone.utc)
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")

    def test_announcements(self):
        unique_title = unique_text("CODEx-OA-ANN")
        publish_payload = {
            "title": unique_title,
            "content": f"{unique_title} 内容",
            "type": "2",
            "scopeType": "ALL",
            "scopeValue": "",
            "priority": "M",
            "isTop": 0,
        }
        self.unwrap_ok(self.api("admin").post("/oa/announcement/publish", publish_payload), "发布公告")

        manage_data = self.unwrap_ok(
            self.api("admin").get("/oa/announcement/manage-list", {"title": unique_title, "page": 1, "size": 20}),
            "查询公告管理列表",
        )
        rows = normalize_page_rows(manage_data)
        announcement = self.find_record(rows, "title", unique_title)
        announcement_id = announcement["announcementId"]

        announcement["priority"] = "H"
        announcement["content"] = f"{unique_title} 已编辑"
        self.unwrap_ok(self.api("admin").put("/oa/announcement", announcement), "编辑公告")
        self.unwrap_ok(self.api("admin").post(f"/oa/announcement/toggle-top/{announcement_id}"), "切换公告置顶")

        my_list = self.unwrap_ok(self.api("zhang").get("/oa/announcement/my-list"), "查询我的公告列表")
        ensure(any(item.get("announcementId") == announcement_id for item in my_list), "员工侧未看到新公告")
        self.unwrap_ok(self.api("zhang").post(f"/oa/announcement/read/{announcement_id}"), "公告标记已读")
        read_stats = self.unwrap_ok(
            self.api("admin").get(f"/oa/announcement/read-stats/{announcement_id}"),
            "查询公告阅读统计",
        )

        self.unwrap_ok(self.api("admin").post(f"/oa/announcement/revoke/{announcement_id}"), "撤销公告")
        self.unwrap_ok(self.api("admin").delete(f"/oa/announcement/{announcement_id}"), "删除公告")
        return {"announcementId": announcement_id, "readStats": read_stats}

    def test_meeting_and_schedule(self):
        room_name = unique_text("CODEx-Room")
        room_payload = {
            "name": room_name,
            "capacity": 12,
            "location": "5F-Area",
            "equipment": '["TV","Whiteboard"]',
            "status": "1",
        }
        self.unwrap_ok(self.api("admin").post("/oa/meeting-room", room_payload), "新增会议室")
        rooms = self.unwrap_ok(self.api("admin").get("/oa/meeting-room/list"), "查询会议室列表")
        room = self.find_record(rooms, "name", room_name)
        room_id = room["roomId"]

        room["capacity"] = 16
        self.unwrap_ok(self.api("admin").put("/oa/meeting-room", room), "编辑会议室")
        room_detail = self.unwrap_ok(self.api("admin").get(f"/oa/meeting-room/{room_id}"), "查询会议室详情")
        ensure_equal(room_detail.get("capacity"), 16, "会议室容量未更新")

        start_time = (dt.datetime.now() + dt.timedelta(days=1)).replace(hour=14, minute=0, second=0, microsecond=0)
        end_time = start_time + dt.timedelta(hours=1)
        event_payload = {
            "title": unique_text("CODEx-Meeting"),
            "description": "OA 回归会议预定",
            "startTime": format_datetime(start_time),
            "endTime": format_datetime(end_time),
            "isAllDay": False,
            "roomId": room_id,
            "attendees": "admin,zhang",
        }
        self.unwrap_ok(self.api("admin").post("/oa/schedule", event_payload), "创建日程")
        my_bookings = self.unwrap_ok(self.api("admin").get("/oa/schedule/my-bookings"), "查询我的预订")
        event = self.find_record(my_bookings, "title", event_payload["title"])
        event_id = event["eventId"]

        room_events = self.unwrap_ok(
            self.api("admin").get(f"/oa/schedule/room/{room_id}", {"date": format_date(start_time.date())}),
            "查询会议室当天日程",
        )
        ensure(any(item.get("eventId") == event_id for item in room_events), "会议室日程未返回新记录")
        week_events = self.unwrap_ok(
            self.api("admin").get(f"/oa/schedule/room/{room_id}/week", {"weekStart": format_date(start_time.date())}),
            "查询会议室周视图",
        )
        today_events = self.unwrap_ok(self.api("admin").get("/oa/schedule/today"), "查询今日日程")
        my_events = self.unwrap_ok(
            self.api("admin").get(
                "/oa/schedule/my-events",
                {"start": format_date(start_time.date()), "end": format_date((start_time + dt.timedelta(days=2)).date())},
            ),
            "查询我的日程",
        )
        stats = self.unwrap_ok(
            self.api("admin").get(
                "/oa/schedule/room-stats",
                {"startDate": format_date(start_time.date()), "endDate": format_date((start_time + dt.timedelta(days=2)).date())},
            ),
            "查询会议室使用统计",
        )
        self.unwrap_ok(self.api("admin").put(f"/oa/schedule/cancel/{event_id}"), "取消会议预订")
        remaining_bookings = self.unwrap_ok(self.api("admin").get("/oa/schedule/my-bookings"), "查询取消后的预订")
        ensure(all(item.get("eventId") != event_id for item in remaining_bookings), "取消后日程仍然存在")
        self.unwrap_ok(self.api("admin").delete(f"/oa/meeting-room/{room_id}"), "删除会议室")
        return {
            "roomId": room_id,
            "eventId": event_id,
            "todayCount": len(today_events),
            "myEventsCount": len(my_events),
            "weekEventCount": len(week_events),
            "roomStatsCount": len(stats),
        }

    def test_assets(self):
        asset_code = unique_text("ASSET")
        payload = {
            "assetCode": asset_code,
            "name": unique_text("CODEx-Asset"),
            "category": "LAPTOP",
            "model": "ThinkPad X1",
            "status": "1",
            "price": 12999,
            "location": "IT-Warehouse",
            "remark": "OA 回归资产",
        }
        self.unwrap_ok(self.api("admin").post("/oa/asset", payload), "新增资产")
        rows, _ = self.list_records("admin", "/oa/asset/list", {"pageNum": 1, "pageSize": 100, "assetCode": asset_code})
        asset = self.find_record(rows, "assetCode", asset_code)
        asset_id = asset["assetId"]

        asset["location"] = "R&D-Dept"
        self.unwrap_ok(self.api("admin").put("/oa/asset", asset), "编辑资产")
        detail = self.unwrap_ok(self.api("admin").get(f"/oa/asset/{asset_id}"), "查询资产详情")
        ensure_equal(detail.get("location"), "R&D-Dept", "资产位置未更新")
        self.unwrap_ok(
            self.api("admin").post(f"/oa/asset/{asset_id}/borrow", params={"userId": self.users["zhang"]["user"]["userId"]}),
            "借用资产",
        )
        borrow_logs = self.unwrap_ok(self.api("admin").get(f"/oa/asset/{asset_id}/logs"), "查询资产日志")
        ensure(len(borrow_logs) >= 1, "资产借用日志为空")
        self.unwrap_ok(self.api("admin").post(f"/oa/asset/{asset_id}/return"), "归还资产")
        self.unwrap_ok(self.api("admin").post(f"/oa/asset/{asset_id}/repair", params={"remark": "OA 回归测试送修"}), "资产送修")
        self.unwrap_ok(self.api("admin").post(f"/oa/asset/{asset_id}/scrap", params={"remark": "OA 回归测试报废"}), "资产报废")
        qrcode = self.api("admin").request_bytes("GET", f"/oa/asset/{asset_id}/qrcode")
        ensure(qrcode.startswith(b"\x89PNG\r\n\x1a\n"), "资产二维码未返回 PNG 数据")
        stats = self.unwrap_ok(self.api("admin").get("/oa/asset/statistics"), "查询资产统计")
        categories = self.unwrap_ok(self.api("admin").get("/oa/asset/categories"), "查询资产分类")
        self.unwrap_ok(self.api("admin").delete(f"/oa/asset/{asset_id}"), "删除资产")
        return {
            "assetId": asset_id,
            "logCount": len(borrow_logs),
            "categoriesCount": len(categories),
            "statsKeys": sorted(stats.keys()),
        }

    def test_consumables(self):
        payload = {
            "name": unique_text("CODEx-Consumable"),
            "model": "A4-80g",
            "unit": "box",
            "quantity": 20,
            "lowStockThreshold": 10,
        }
        self.unwrap_ok(self.api("admin").post("/oa/consumable", payload), "新增耗材")
        rows, _ = self.list_records("admin", "/oa/consumable/list", {"pageNum": 1, "pageSize": 100})
        item = self.find_record(rows, "name", payload["name"])
        consumable_id = item["consumableId"]

        item["quantity"] = 18
        self.unwrap_ok(self.api("admin").put("/oa/consumable", item), "编辑耗材")
        detail = self.unwrap_ok(self.api("admin").get(f"/oa/consumable/{consumable_id}"), "查询耗材详情")
        ensure_equal(detail.get("quantity"), 18, "耗材数量未更新")
        self.unwrap_ok(self.api("admin").post(f"/oa/consumable/{consumable_id}/add-stock", {"quantity": 5}), "耗材入库")
        self.unwrap_ok(self.api("admin").post(f"/oa/consumable/{consumable_id}/reduce-stock", {"quantity": 14}), "耗材出库")
        after_reduce = self.unwrap_ok(self.api("admin").get(f"/oa/consumable/{consumable_id}"), "查询出库后耗材详情")
        ensure_equal(after_reduce.get("quantity"), 9, "耗材库存扣减结果不正确")
        low_stock = self.unwrap_ok(self.api("admin").get("/oa/consumable/low-stock"), "查询低库存耗材")
        ensure(any(item.get("consumableId") == consumable_id for item in low_stock), "低库存列表未包含目标耗材")
        self.unwrap_ok(self.api("admin").delete(f"/oa/consumable/{consumable_id}"), "删除耗材")
        return {"consumableId": consumable_id, "lowStockCount": len(low_stock)}

    def test_visitors(self):
        visit_date = dt.date.today() + dt.timedelta(days=1)
        base_payload = {
            "visitorName": unique_text("CODEx-Visitor"),
            "visitorPhone": "13800138000",
            "visitorCompany": "CloudFlow",
            "visitorCount": 1,
            "visitReason": "OA 回归来访",
            "hostId": self.users["admin"]["user"]["userId"],
            "hostName": "Admin",
            "hostDept": "R&D",
            "visitDate": format_date(visit_date),
            "visitTimeStart": "09:00:00",
            "visitTimeEnd": "10:00:00",
            "visitArea": "Lobby-A",
        }
        self.unwrap_ok(self.api("admin").post("/oa/visitor", base_payload), "新增访客预约")
        rows, _ = self.list_records("admin", "/oa/visitor/list", {"pageNum": 1, "pageSize": 100})
        visitor = self.find_record(rows, "visitorName", base_payload["visitorName"])
        visitor_id = visitor["visitorId"]

        visitor["remark"] = "OA 回归编辑"
        self.unwrap_ok(self.api("admin").put("/oa/visitor", visitor), "编辑访客预约")
        self.unwrap_ok(self.api("admin").put(f"/oa/visitor/confirm/{visitor_id}"), "确认访客预约")
        self.unwrap_ok(self.api("admin").put(f"/oa/visitor/checkin/{visitor_id}"), "访客签到")
        self.unwrap_ok(self.api("admin").put(f"/oa/visitor/checkout/{visitor_id}"), "访客签退")
        detail = self.unwrap_ok(self.api("admin").get(f"/oa/visitor/{visitor_id}"), "查询访客详情")
        ensure_equal(detail.get("status"), "COMPLETED", "访客流程未完成")

        cancel_payload = {
            **base_payload,
            "visitorName": unique_text("CODEx-Visitor-Cancel"),
            "visitorPhone": "13800138001",
        }
        self.unwrap_ok(self.api("admin").post("/oa/visitor", cancel_payload), "新增待取消访客")
        rows, _ = self.list_records("admin", "/oa/visitor/list", {"pageNum": 1, "pageSize": 100})
        cancel_visitor = self.find_record(rows, "visitorName", cancel_payload["visitorName"])
        self.unwrap_ok(self.api("admin").put(f"/oa/visitor/cancel/{cancel_visitor['visitorId']}"), "取消访客预约")
        self.unwrap_ok(self.api("admin").delete(f"/oa/visitor/{visitor_id},{cancel_visitor['visitorId']}"), "删除访客记录")
        return {"visitorIds": [visitor_id, cancel_visitor["visitorId"]]}

    def test_duty_schedule(self):
        duty_date = dt.date.today() + dt.timedelta(days=1)
        payload = {
            "title": unique_text("CODEx-Duty"),
            "scheduleType": "DAILY",
            "dutyDate": format_date(duty_date),
            "shiftType": "DAY",
            "startTime": "09:00:00",
            "endTime": "18:00:00",
            "userId": self.users["admin"]["user"]["userId"],
            "userName": "admin",
            "deptId": self.users["admin"]["user"]["deptId"],
            "deptName": "R&D",
            "location": "IDC-A",
            "dutyContent": "OA 回归值班",
        }
        self.unwrap_ok(self.api("admin").post("/oa/duty", payload), "新增值班排班")
        rows, _ = self.list_records("admin", "/oa/duty/list", {"pageNum": 1, "pageSize": 100})
        schedule = self.find_record(rows, "title", payload["title"])
        schedule_id = schedule["scheduleId"]

        schedule["location"] = "IDC-B"
        self.unwrap_ok(self.api("admin").put("/oa/duty", schedule), "编辑值班排班")
        detail = self.unwrap_ok(self.api("admin").get(f"/oa/duty/{schedule_id}"), "查询值班详情")
        ensure_equal(detail.get("location"), "IDC-B", "值班地点未更新")

        batch_payload = [
            {
                "title": unique_text("CODEx-Duty-Batch"),
                "scheduleType": "DAILY",
                "dutyDate": format_date(duty_date + dt.timedelta(days=1)),
                "shiftType": "NIGHT",
                "startTime": "18:00:00",
                "endTime": "23:00:00",
                "userId": self.users["zhang"]["user"]["userId"],
                "userName": "zhang",
                "deptId": self.users["zhang"]["user"]["deptId"],
                "deptName": "R&D",
                "location": "IDC-A",
                "dutyContent": "OA 回归批量排班",
            }
        ]
        self.unwrap_ok(self.api("admin").post("/oa/duty/batch", batch_payload), "批量新增值班排班")
        rows, _ = self.list_records("admin", "/oa/duty/list", {"pageNum": 1, "pageSize": 100})
        batch_schedule = self.find_record(rows, "title", batch_payload[0]["title"])
        calendar = self.unwrap_ok(
            self.api("admin").get("/oa/duty/calendar", {"year": duty_date.year, "month": duty_date.month}),
            "查询值班日历",
        )
        ensure(any(item.get("scheduleId") == schedule_id for item in calendar), "值班日历未返回新增排班")
        self.unwrap_ok(self.api("admin").put(f"/oa/duty/checkin/{schedule_id}"), "值班签到")
        self.unwrap_ok(self.api("admin").put(f"/oa/duty/checkout/{schedule_id}"), "值班签退")
        self.unwrap_ok(
            self.api("admin").put(
                f"/oa/duty/swap/{batch_schedule['scheduleId']}",
                {
                    "backupUserId": self.users["admin"]["user"]["userId"],
                    "backupUserName": "admin",
                    "reason": "OA 回归换班",
                },
            ),
            "值班换班",
        )
        self.unwrap_ok(self.api("admin").delete(f"/oa/duty/{schedule_id},{batch_schedule['scheduleId']}"), "删除值班排班")
        return {"scheduleIds": [schedule_id, batch_schedule["scheduleId"]], "calendarCount": len(calendar)}

    def test_error_report(self):
        payload = {
            "message": unique_text("CODEx-Frontend-Error"),
            "stack": "Error: regression test",
            "componentStack": "at RegressionComponent",
            "context": "oa-backend-regression",
            "url": "http://127.0.0.1:3000/office/announcement",
            "userAgent": "RegressionBot",
            "level": "error",
            "tags": {"suite": "oa"},
            "extra": {"source": "codex"},
            "timestamp": self._utc_millis(),
        }
        self.unwrap_ok(self.api("admin").post("/oa/error-report", payload), "前端错误上报")
        return {"message": payload["message"]}

    def test_sync(self):
        timestamp = self._sync_timestamp()
        upload_payload = {
            "deviceId": unique_text("CODEx-Device"),
            "timestamp": timestamp,
            "data": [
                {
                    "type": "leave_request",
                    "id": unique_text("LOCAL"),
                    "action": "create",
                    "payload": {"title": "OA 离线同步测试"},
                    "localTimestamp": timestamp,
                }
            ],
        }
        upload_result = self.unwrap_ok(self.api("zhang").post("/oa/sync/upload", upload_payload), "上传离线数据")
        download_result = self.unwrap_ok(
            self.api("zhang").get("/oa/sync/download", {"lastSyncTime": timestamp, "deviceId": upload_payload["deviceId"]}),
            "下载增量数据",
        )
        self.unwrap_ok(
            self.api("zhang").post(
                "/oa/sync/resolve-conflicts",
                [
                    {
                        "actionId": "LOCAL-1",
                        "actionType": "leave_request",
                        "reason": "server",
                        "localData": {"version": 1},
                        "serverData": {"version": 2},
                    }
                ],
            ),
            "解决同步冲突",
        )
        return {"upload": upload_result, "downloadKeys": sorted(download_result.keys())}

    def test_business_trip_flow(self):
        start_date = dt.date.today() + dt.timedelta(days=5)
        end_date = start_date + dt.timedelta(days=2)
        payload = {
            "departure": "Shanghai",
            "destination": "Hangzhou",
            "startDate": format_date(start_date),
            "endDate": format_date(end_date),
            "tripDays": 2.0,
            "transportType": "TRAIN",
            "estimatedCost": 800,
            "accommodation": "WestLake Hotel",
            "contactPhone": "13800138000",
            "emergencyContact": "LiSi",
            "emergencyPhone": "13800138002",
            "projectName": "OA Regression",
            "companions": "zhang",
            "reason": unique_text("CODEx-BusinessTrip"),
            "itinerary": "Day1 client meeting; Day2 project review",
        }
        return self.run_form_workflow(
            create_user="zhang",
            create_path="/oa/business-trip",
            list_path="/oa/business-trip/list",
            detail_prefix="/oa/business-trip",
            submit_prefix="/oa/business-trip/submit",
            payload=payload,
            update_patch={"itinerary": "Day1 client meeting; Day2 project review; updated"},
            match_field="reason",
            process_key="business_trip",
        )

    def test_expense_claim_flow(self):
        today_start = dt.datetime.combine(dt.date.today(), dt.time.min)
        payload = {
            "category": "TRANSPORT",
            "totalAmount": 268.5,
            "description": unique_text("CODEx-ExpenseClaim"),
            "items": [
                {
                    "expenseType": "TRANSPORT",
                    "amount": 168.5,
                    "expenseDate": format_datetime(today_start),
                    "description": "Taxi and train",
                },
                {
                    "expenseType": "MEAL",
                    "amount": 100,
                    "expenseDate": format_datetime(today_start),
                    "description": "Client dinner",
                },
            ],
        }
        month = dt.date.today().strftime("%Y-%m")
        result = self.run_form_workflow(
            create_user="zhang",
            create_path="/oa/expense/claim",
            list_path="/oa/expense/claim/list",
            detail_prefix="/oa/expense/claim",
            submit_prefix="/oa/expense/claim/submit",
            payload=payload,
            update_patch={"description": f"{payload['description']}-updated"},
            match_field="description",
            process_key="expense_claim",
        )
        dept_stats = self.unwrap_ok(self.api("admin").get("/oa/expense/claim/stats/dept", {"month": month}), "查询报销部门统计")
        category_stats = self.unwrap_ok(self.api("admin").get("/oa/expense/claim/stats/category", {"month": month}), "查询报销分类统计")
        result["deptStatsCount"] = len(dept_stats)
        result["categoryStatsCount"] = len(category_stats)
        return result

    def test_payment_request_flow(self):
        expected_date = dt.datetime.combine(dt.date.today() + dt.timedelta(days=7), dt.time.min)
        payload = {
            "payeeName": "CloudFlow Supplier Ltd",
            "payeeAccount": "6222020202020202",
            "payeeBank": "招商银行上海分行",
            "amount": 5200,
            "paymentType": "SERVICE",
            "reason": unique_text("CODEx-Payment"),
            "expectedDate": format_datetime(expected_date),
        }
        month = dt.date.today().strftime("%Y-%m")
        result = self.run_form_workflow(
            create_user="zhang",
            create_path="/oa/payment/request",
            list_path="/oa/payment/request/list",
            detail_prefix="/oa/payment/request",
            submit_prefix="/oa/payment/request/submit",
            payload=payload,
            update_patch={"reason": f"{payload['reason']}-updated"},
            match_field="reason",
            process_key="payment_request",
        )
        dept_stats = self.unwrap_ok(self.api("admin").get("/oa/payment/request/stats/dept", {"month": month}), "查询付款部门统计")
        result["deptStatsCount"] = len(dept_stats)
        return result

    def test_attendance_appeal_flow(self):
        payload = {
            "appealType": "MISSING_CHECKIN",
            "appealDate": format_date(dt.date.today()),
            "appealTime": "09:15:00",
            "checkType": "1",
            "originalStatus": "2",
            "witnessName": "Admin",
            "location": "31.2304,121.4737",
            "address": "Shanghai Test Address",
            "reason": unique_text("CODEx-AttendanceAppeal"),
        }
        return self.run_form_workflow(
            create_user="zhang",
            create_path="/oa/attendance/appeal",
            list_path="/oa/attendance/appeal/list",
            detail_prefix="/oa/attendance/appeal",
            submit_prefix="/oa/attendance/appeal/submit",
            payload=payload,
            update_patch={"address": "Shanghai Updated Address"},
            match_field="reason",
            process_key="attendance_appeal",
        )


if __name__ == "__main__":
    OABackendRegression().run()
