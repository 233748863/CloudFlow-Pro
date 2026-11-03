# D盘会议审计交叉复核（2026-11-02）

复核对象：OA/CRM报告 OC06、OC07、OC12；基线 `e0b9e7d27b7690e5eac5f3c02be55b59a52924bf`。仅只读核查指定源码与上下游，未修改他人报告、业务代码、SQL或配置，未构建运行。下列 OA = `D:\CloudFlowPro\cloudflow-backend\cloudflow-service-oa\src\main`，FE = `D:\CloudFlowPro\cloudflow-frontend\src`。

| 项目 | 复核结论 | 独立证据及边界 |
|---|---|---|
| OC06 会议决议字段不一致 | 同意 | `FE/services/api/meetingMinutes.ts:11`/`:12` 为 dueDate/remark；页面 `MeetingMinutesPage.tsx:672`/`:673` 实际编辑 dueDate，`:679` 起编辑 remark，`:286` 原样序列化、`:324` 原样派发。`OA/java/com/cloudflow/oa/controller/OaBatch2P1Controllers.java:238` 直接传 List<Map>，无重命名；`service/impl/OaMeetingMinutesServiceImpl.java:221` 只读 description、`:232` 只读 deadline。因此页面填写的日期和备注未传入目标任务对应字段是静态可确认事实，不依赖旧数据。非法数字/日期回退也存在（`:326`、`:348`）。保留权限、事务、已派发标识，未做运行复现。 |
| OC07 会议双字段 | 同意核心结论，需修正物理表名 | `OaMeetingMinutesServiceImpl.java:292` 同写两字段；`OaMeetingInvitationService.java:41` 同写两字段；`OA/resources/mapper/OaMeetingMinutesMapper.xml:7`、`:29` 明确 COALESCE。但它们关联的实际表是 **oa_schedule_event.event_id**，原报告写成 sys_schedule_event.event_id；证据为该 XML `:6` 以及 `OA/java/com/cloudflow/oa/domain/SysScheduleEvent.java:17` 的 `@TableName("oa_schedule_event")`。类名带 Sys 不代表物理表带 sys。 |
| OC12 参会人身份重复查询 | 同意，明确 N 包含组织者 | `OaMeetingBookingService.java:193` 自动补组织者，`:197` 对整理后的名单逐人调用 identities.user；非草稿 `:73` → `:253` → `OaMeetingInvitationService.java:36` 再逐人调用。`OA/resources/mapper/OaIdentityReferenceMapper.xml:16`–`:22` 每次按一个用户 ID 查有效且同租户用户。普通非草稿路径有 2N 次身份查询调用，N 应定义为去重并补入组织者后的完整名单。 |

补充保留边界：OC07 中独立纪要及其签到可不关联日程；`OaMeetingMinutesServiceImpl.java:174`–`:178` 新建独立签到只写 minutesId，不写两种日程 ID，故统一后的 schedule_event_id 仍应允许空，minutes_id 不能删除。OC12 的 prepared 在事务前，activate 在事务内（`OaMeetingBookingService.java:63`、`:65`、`:292`），保留两个时间点的必要有效性核验，分别批量读取即可；`OaMeetingSeriesService.java:71` 准备一次、`:161` 循环实例、`:182` 每实例 activate，周期实例重复读取成立，但不应声称每实例都完整执行两轮 prepared。上述修正不改变三个问题的确认结论。
