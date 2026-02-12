# OA模块前后端审计报告

> 审计时间：2026-02-13  
> 审计范围：`cloudflow-backend/cloudflow-service-oa` + `cloudflow-frontend/src`（OA相关页面、API服务）  
> 网关配置：`Path=/oa/**` + `StripPrefix=1`（前端请求 `/oa/xxx` 经网关后变为 `/xxx` 转发到OA服务）

---

## 一、API路径不对称（P0 严重 — 会导致请求404）

| # | Controller | 当前 @RequestMapping | 前端请求路径（示例） | 网关strip后实际到达路径 | 问题 | 修复方案 |
|---|-----------|---------------------|--------------------|-----------------------|------|---------|
| 1 | `ExpenseClaimController` | `/oa/expense/claim` | `/oa/expense/claim/list` | `/expense/claim/list` | 后端映射 `/oa/expense/claim/list`，不匹配 | 改为 `@RequestMapping("/expense/claim")` |
| 2 | `PaymentRequestController` | `/oa/payment/request` | `/oa/payment/request/list` | `/payment/request/list` | 后端映射 `/oa/payment/request/list`，不匹配 | 改为 `@RequestMapping("/payment/request")` |

其余10个Controller路径正确：`/vehicle`、`/asset`、`/attendance`、`/meeting-room`、`/announcement`、`/notice`、`/schedule`、`/work-task`、`/workplace`、`/sync`。

---

## 二、前端响应解包错误（P0 严重 — 会导致数据为undefined）

| # | 文件 | 问题描述 | 修复方案 |
|---|------|---------|---------|
| 1 | `cloudflow-frontend/src/services/api/workTask.ts` | 所有方法使用 `const res = await request.get(...); return res.data;`，但 `request.ts` 响应拦截器已执行 `return res.data` 解包，`res` 本身就是业务数据，再取 `.data` 会得到 `undefined` | 去掉 `.data`，直接 `return await request.get(...)` |

受影响的6个方法：`getWorkTasks`、`getWorkTaskDetail`、`createWorkTask`、`updateWorkTask`、`updateWorkTaskStatus`、`deleteWorkTask`

---

## 三、后端TODO待完成开发

| # | 文件 | 位置 | TODO内容 | 优先级 |
|---|------|------|---------|--------|
| 1 | `WorkplaceServiceImpl.java` | `getRecentTasks()` | 返回空列表，需对接 `RemoteWorkflowService` 获取最近任务 | P1 |
| 2 | `WorkplaceServiceImpl.java` | `getWorkplaceSummary()` | 待办任务数量硬编码为0，需对接工作流服务统计接口 | P1 |
| 3 | `ExpenseClaimServiceImpl.java` | `submitClaim()` | 工作流启动被注释：`// workflowService.startProcess("expense_claim", claim)` | P1 |
| 4 | `PaymentRequestServiceImpl.java` | `submitPayment()` | 工作流启动被注释：`// workflowService.startProcess("payment_request", payment)` | P1 |
| 5 | `ExpenseClaimServiceImpl.java` | `convertVehicleExpenseToClaim()` | 车辆费用转报销功能直接返回false，未实现 | P2 |
| 6 | `NotificationWebSocketHandler.java` | `sendMessage()` | WebSocket实时推送逻辑未实现，仅打日志 | P2 |

---

## 四、前端TODO待完成开发

| # | 文件 | TODO内容 | 优先级 |
|---|------|---------|--------|
| 1 | `mobile/pages/MobileMeetingRoom.tsx` | 会议室列表使用硬编码mock数据（4条），未调用后端 `/oa/meeting-room/list` API | P1 |
| 2 | `mobile/pages/MobileMeetingRoom.tsx` | 预订提交使用 `setTimeout` 模拟延迟，未调用后端日程创建API | P1 |
| 3 | `mobile/pages/MobileLeaveRequest.tsx` | 请假提交使用 `setTimeout` 模拟，无真实API调用 | P1 |
| 4 | `mobile/pages/MobileReimbursement.tsx` | 报销提交使用 `setTimeout` 模拟，未调用后端报销API | P1 |
| 5 | `components/ui/ErrorBoundary.tsx` | 错误上报服务未接入（Sentry等） | P3 |

---

## 五、前后端模块缺失不对称

| # | 缺失侧 | 模块 | 详情 |
|---|--------|------|------|
| 1 | 后端缺失 | 请假模块 | 前端有 `MobileLeaveRequest.tsx` 页面，工作台快捷操作有"请假申请"入口（路径 `/leave/apply`），但后端无 `LeaveController`、`LeaveService`、请假实体等任何代码 |
| 2 | 前端缺失 | 耗材管理 | 后端有 `SysConsumable` 实体和 `SysConsumableMapper`，但前端无对应的耗材管理页面和API服务 |

---

## 六、完整的前后端API对照表

### 后端Controller → 前端API服务映射

| 后端Controller | 后端路径 | 前端API文件 | 前端页面 | 状态 |
|---------------|---------|------------|---------|------|
| `WorkplaceController` | `/workplace` | `services/api/workplace.ts` | `pages/Workplace.tsx` | ✅ 对称 |
| `SysAnnouncementController` | `/announcement` | `services/api/announcement.ts` | `pages/AnnouncementPage.tsx` | ✅ 对称 |
| `SysNoticeController` | `/notice` | `services/api/notice.ts` | 通知组件 | ✅ 对称 |
| `SysScheduleController` | `/schedule` | `services/api/schedule.ts` | `pages/SchedulePage.tsx` | ✅ 对称 |
| `MeetingRoomController` | `/meeting-room` | `services/api/schedule.ts` | `pages/MeetingRoomPage.tsx` | ✅ 对称 |
| `VehicleController` | `/vehicle` | `services/api/vehicle.ts` | `pages/admin/vehicle/` | ✅ 对称 |
| `AssetController` | `/asset` | `services/api/admin.ts` | `pages/admin/asset/` | ✅ 对称 |
| `AttendanceController` | `/attendance` | `services/api/admin.ts` | `pages/admin/attendance/` | ✅ 对称 |
| `WorkTaskController` | `/work-task` | `services/api/workTask.ts` | `pages/TaskListPage.tsx` | ⚠️ 响应解包错误 |
| `ExpenseClaimController` | `/oa/expense/claim` ❌ | `services/api/expense.ts` | `pages/ExpenseClaimPage.tsx` | ❌ 路径不匹配 |
| `PaymentRequestController` | `/oa/payment/request` ❌ | `services/api/expense.ts` | `pages/PaymentRequestPage.tsx` | ❌ 路径不匹配 |
| `SyncController` | `/sync` | `services/offline/syncManager.ts` | — | ✅ 对称 |
| — | — | — | `mobile/MobileLeaveRequest.tsx` | ❌ 后端缺失 |
| 后端有 `SysConsumable` | — | — | — | ❌ 前端缺失 |

---

## 修复优先级建议

1. ~~**P0（立即修复）**：API路径不对称（2处）+ workTask.ts响应解包错误（1处）~~ ✅ 已修复
2. ~~**P1（尽快完成）**：工作流集成TODO（4处）+ 移动端mock数据替换（4处）~~ ✅ 已修复（请假模块因后端缺失，已标注说明）
3. ~~**P2（计划完成）**：车辆费用转报销、WebSocket推送、请假模块后端开发、耗材管理前端开发~~ ✅ 已完成
4. **P3（低优先级）**：ErrorBoundary错误上报接入

---

## 修复记录（2026-02-13）

### P2修复记录（2026-02-13 第二批）

已完成文件清单：
- `ExpenseClaimServiceImpl.java` — 实现车辆费用转报销功能（查询VehicleExpense → 创建BizExpenseClaim + BizExpenseItem）
- `NotificationWebSocketHandler.java` — 重写为真正的WebSocket推送实现（基于TextWebSocketHandler，支持多设备连接、心跳、广播）
- `WebSocketConfig.java` — 新增WebSocket配置类，注册 `/ws/notification` 端点
- `pom.xml (oa)` — 新增 `spring-boot-starter-websocket` 依赖
- `LeaveRequest.java` — 新增请假申请实体类
- `LeaveRequestMapper.java` — 新增请假Mapper
- `ILeaveRequestService.java` — 新增请假Service接口
- `LeaveRequestServiceImpl.java` — 新增请假Service实现（含工作流集成）
- `LeaveController.java` — 新增请假Controller（/leave路径）
- `biz_leave_request.sql` — 新增请假表建表SQL
- `leave.ts` — 新增前端请假API服务
- `MobileLeaveRequest.tsx` — 替换模拟逻辑为真实API调用
- `IConsumableService.java` — 新增耗材Service接口
- `ConsumableServiceImpl.java` — 新增耗材Service实现（含出入库、低库存预警）
- `ConsumableController.java` — 新增耗材Controller（/consumable路径）
- `consumable.ts` — 新增前端耗材API服务
- `ConsumablePage.tsx` — 新增耗材管理前端页面（列表/搜索/CRUD/出入库/低库存预警）

### P1修复记录（2026-02-13 第一批）

已修复文件清单：
- `ExpenseClaimController.java` — 路径 `/oa/expense/claim` → `/expense/claim`
- `PaymentRequestController.java` — 路径 `/oa/payment/request` → `/payment/request`
- `workTask.ts` — 去掉多余的 `.data` 解包
- `RemoteWorkflowService.java` — 扩展接口，新增 `getTasksCount`、`getTaskStatistics`、`getTaskGroups` 方法
- `RemoteWorkflowFallbackFactory.java` — 适配新接口签名，提供降级响应
- `WorkplaceServiceImpl.java` — 对接工作流服务获取待办任务数量和最近任务
- `ExpenseClaimServiceImpl.java` — 提交报销时启动工作流
- `PaymentRequestServiceImpl.java` — 提交付款时启动工作流
- `MobileMeetingRoom.tsx` — 替换mock数据为真实API调用
- `MobileReimbursement.tsx` — 替换mock为真实报销API调用
- `MobileLeaveRequest.tsx` — 标注后端缺失说明，保留模拟逻辑
