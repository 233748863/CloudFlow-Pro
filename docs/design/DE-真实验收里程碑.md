# D/E 真实验收里程碑

里程碑编号：`DE-20260912`。状态：约定范围验收完成，2026-09-12 15:18:02 归档。D1–D4 与 E M1–M9 的真实业务、最新 18 个桌面页面、合同活动表单及共享权限检查通过；正式税率、E5-b、F/G 整批与移动端等边界在末节单列。`milestone-result.json` 为 `passed=true`、`status=ACCEPTED_WITH_DEFERRED_SCOPE`，记录各证据哈希、最终六服务健康及数据库状态；验证码限额已恢复 100，原成功计数保留。未创建 Git 提交、分支或标签。

## 范围与证据口径

- 验收 D 的假期、考勤、薪资与申诉，以及 E 的活动、工单时限、丢单/额度、线索资质和营销归因；使用当前数据库及真实认证、HR、CRM、OA、工作流、规则中心、任务和消息链路。
- 真实验收 = 经真实登录和运行服务调用业务接口，核对数据库结果、审批回调、任务回执和消息投递；验收业务对象为专用合成资料，不代表对外真实资金支付。未用模拟 HTTP 响应替代本轮业务和页面结果。
- 2026-09-07 D 独立库/模拟页面和 2026-09-08 E 独立库/模拟页面、增量部署保留为历史记录，分别见 [D 实施核对](D-批次D实施核对.md)、[E 实施记录](E-批次E实施验收记录.md)。旧 705 次 E 断言不计作本次真实微服务场景数。

以下结果、历史尝试、脚本和日志文件名均相对于 `.cloudflow-runtime/milestone-de-20260912/`；该目录为本机忽略目录，证据文件未随文档纳入 Git。文内时间统一为北京时间 `UTC+08:00`，JSON 中的 `completedAt` 原值可能为 UTC。

`*-result.json` 的 `passed=true` 表示该脚本本次续跑完成；已完成的准备和业务阶段可能由 `fixture` 跳过，其证据保存在 `*-attempt-*.json` 的 `checks`。历史文件中的 `passed=false` 和 `failure` 保持原样，只引用中止前已经通过的具体检查，不能将整份失败尝试改称成功，也不把跨次重复检查相加为独立场景数。业务拒绝要求 HTTP 4xx，或兼容旧接口的 HTTP 200 且业务码失败；HTTP 500 不计作正确拒绝。

## 已授权备份与正式重建

| 项目 | 已核对事实与证据 |
| --- | --- |
| 目标库 | `192.168.1.173:3306/cloud_flow_db`，MySQL 8.0.25；采用用户授权的当前库，无新增独立验收库 |
| 授权与状态 | `state.json`：`userAuthorizedRebuild=true`，授权记录时间 2026-09-12 10:03:23，`status=REBUILT`，重建完成时间 10:09:23 |
| 表数 | 重建前 296 张，重建后 317 张；旧版 D/G 缺表属于重建前事实，不再作为当前待部署项 |
| 导入范围 | 按顺序执行正式 `01.cloudflow-common.sql`、`02.cloudflow-workflow.sql`、`03.cloudflow-hr.sql`、`04.cloudflow-oa.sql`、`05.cloudflow-crm.sql`、`06.cloudflow-business-seed.sql`；`state.json.scripts` 保留当时重建所用脚本哈希，后续 1762 精准同步的新 06 哈希另行记录；未导入 07 演示数据 |
| 备份文件 | `.cloudflow-runtime/milestone-de-20260912/before-DE-20260912-100332.sql`；完成时间 10:04:00，大小 293,119,836 字节 |
| 备份 SHA-256 | `6178B651FD537E606BBEFD0013F7712E4EC047F9A2876333AD80E09F1D03C45F`；本次文档整理只读重算文件哈希，与 `state.json.backup.sha256` 一致 |
| 最新构建及服务快照 | 主线程确认包含 `AuthController.java:625` 修复的 `mvn.cmd -q -DskipTests install` 退出 0；`current-backend-build.log` 记录静态规则零发现。`health-result.json` 于 13:47:54 汇总 `passed=true`、`failed=[]`，gateway、auth、workflow、OA、CRM、HR 的 9100—9105 管理端口均为 `UP`；本行替代旧 12:34 快照，不代替最终权限及页面复验 |

本次采用完整备份后重建，旧库数据以备份保存；2026-09-08 的 E 增量部署保留原记录属于前次操作。后续只精准同步 1762 基础读取权限，未再次重建或重新导入整个 06。账号、会话及连接配置中的秘密不纳入验收文档；验证码日限额依用户授权临时调整并恢复，验证码校验、登录频率、重复提交及其他安全保护保留。

## 基础读取授权与 06 哈希追踪

业务基础查询 = 读取启用字典的展示值、五项客户端参数和当前租户同事摘要，权限码为 `system:lookup:read`。三个入口均同时要求 `@SaCheckLogin` 和 `@SaCheckPermission("system:lookup:read")`；登录身份必须同时具备这项基础读取授权。此轮新增基础读取授权，不扩展管理权限。

| 项目 | 已核实事实与证据 |
| --- | --- |
| 菜单定义 | 正式 `cloudflow-backend/DB/06.cloudflow-business-seed.sql` 中菜单 1762“业务基础选项查询”，`menu_type=F`、`visible=1`（隐藏）、`status=0`（启用）、`perms=system:lookup:read` |
| 正式种子授权范围 | 只匹配 `deleted=0`、`status=0` 且 `role_key` 位于明确名单的 11 个启用种子角色：`admin`、`manager`、`finance`、`hr`、`employee`、`legal`、`oa_clerk`、`sales_manager`、`sales_rep`、`crm_ops`、`customer_success` |
| 当前库同步方式 | 13:36:40 从正式 06 精确提取并同步 1762 单条菜单，再调用正常角色更新 API `PUT /auth/system/role` 给 11 个角色的原菜单集合各加入 1762；没有重建数据库或重新执行整个 06 |
| 原授权与数据范围 | `lookup-permission-fixture.json.beforeRoles` 保存更新前完整角色快照，`updatedRoleIds` 记录完成角色；已归档的 `lookup-permission-attempt-1789192248550.json` 中 11 项逐角色前后检查验证 `menuIds` 集合仅增加 1762，`dsType`、`dsScope` 及角色身份/状态字段保留。正常更新的审计和版本字段不作为不变字段 |
| 重建时 06 SHA-256 | `25A9461107BA8CD765EC878782846361D920F9D7F24F37584B077A4A79B40D88`；保留在 `state.json.scripts`，并对应 `lookup-permission-fixture.json.rebuildSeedHash`，未追改重建历史 |
| 本次同步所据 06 SHA-256 | `77CFFF60FD8CDDD6DD9945D5C743CC994568F30459B48FC071E61313EA836BFA`；对应 `lookup-permission-fixture.json.currentSeedHash`，已只读重算当前 06 文件并核对一致 |

13:39:03 的授权刷新中止结果已归档为 `lookup-permission-attempt-1789192248550.json`：角色菜单和数据范围前后检查通过，随后 HR 重新登录读到旧权限，暴露下文缓存命名空间问题。修复后正常撤销旧会话，13:50 的续跑又受验证码日额度阻断；旧中止结果保持原样。最新 `lookup-permission-result.json` 于 15:02:34 为 `passed=true`、60 项检查通过：11 个验收身份完成真实登录，11 个角色原菜单与数据范围保留，仅加入 1762；employee/sales/salespeer/salesother 基础读取成功，原管理接口仍返回 403。11 个角色与 11 个验收身份分别记录。

### 验证码临时配置已恢复

用户已明确授权全部自动化处理。等待期间管理员会话也到期，因此只定向修改 `sys_config` 第 12 行及该项配置缓存，将 `sys.captcha.dailyLimit` 从 100 临时增为 120；其余配置字段保留。随后经真实管理员接口确认并广播配置，11 个验收身份均完成真实验证码及登录流程，未伪造会话、IP 或验证码结果。

`captcha-limit-result.json` 于 13:57:12 只读记录 `CAPTCHA:LIMIT:127.0.0.1` 成功校验计数 100、上限 100、剩余有效期 86003 秒，`configurationChanged=false`、`counterChanged=false`。TTL = 计数键剩余存活时间；`cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/CaptchaService.java:106` 在每次成功校验后递增计数，第 107 行把 TTL 续为 24 小时，该规则不能解释为零点自动清零。

已通过真实管理员接口恢复 100；`captcha-adjustment-result.json` 与 `captcha-adjustment-recovery.log` 于 15:05:53 独立复核接口、数据库、运行缓存均为 100，`restored=true`。成功计数从 100 增至 111，未清空或回退；恢复后的限额按现存计数继续生效。本机证据连接曾空闲超时，恢复后的独立核验成功，不将中止脚本冒称整轮通过。最终数据库和缓存状态还由 `milestone-result.json` 再次校验。

## 已通过的真实业务证据索引

| 范围 | 本轮实际通过内容 | 完成结果及必要历史阶段 |
| --- | --- | --- |
| D1 假期 | 跨年/周末/调休和半天计算；日历重复保存保留主键；真实 Redis 下同员工仅剩一天额度时两单并发一成一败；服务端覆盖伪造员工与时长；冻结、撤回/拒绝释放；真实部门和人事终审回调实扣，仅一笔扣减台账 | `d-leave-result.json`，11:17:04；并发、冻结及释放在 `d-leave-attempt-1789182415331.json` |
| D2/D3 考勤薪资 | 未核定税率及未封账考勤阻止算薪；迟到早退/缺卡、人工核正、封账保护、跨夜归属；真实后台算薪、工资提交和发放、本人隐私与完整性；真实审批后的补正独立计税并保留原单 | `d-payroll-result.json`，11:24:21；税率预检查见 `d-payroll-attempt-1789183220449.json`，考勤准备与封账见 `d-payroll-attempt-1789183356002.json`，封账/跨夜/算薪续跑见 `d-payroll-attempt-1789183461267.json` |
| D4 申诉 | 申请人、无关员工、被申诉 HR、未分派管理员及指定非 HR 处理人的逐案权限；真实私有附件与通用入口防绕过；内部记录隔离；消息实际投递且不泄露正文；仅一次退回、关闭和劳动争议升级 | `d-grievance-result.json`，11:28:27 |
| E1 活动 | 真实 HR 参与人查询；参与人可读不可改、无关销售拒绝；四种接受状态、改期撤销旧提醒、版本冲突；集中提醒任务真实投递与去重；完成生成跟进及后续活动继承 | `e-activity-result.json`，11:50:50；客户创建及 HR 查询见 `e-activity-attempt-1789184854926.json`，接受状态早期阶段见 `e-activity-attempt-1789185050503.json` |
| E2 工单时限 | SLA = 工单承诺响应及解决时限。真实日历覆盖周末、下班后、跨年假日/补班和午休；P1—P4；工作时段暂停累计 1 分钟并顺延，午休暂停累计 0 分钟；解决/关闭不双算；策略引用保护；集中扫描、负责人和部门负责人真实告警及去重 | `e-sla-result.json`，12:15:09；`e-sla-lunch-result.json`，12:14:27；早期所有权拒绝及午休准备差异仍保存在 `e-sla-attempt-1789185961181.json`、`e-sla-attempt-1789186509207.json`，未通过更改业务权限或计时算法消除 |
| E3 额度与丢单 | 首次额度待审零额禁用，部门和财务真实审批后生效；调整待审及拒绝保留原额；规则草稿不生效；真实 WARN/BLOCK/PASS；报价提交、赢单和客户工作台建合同三入口限制；例外审计、真实应收/超期占用及确认回款释放；丢单真实审批与唯一主因 | `e-credit-result.json`，12:03:07；首次额度及调整审批阶段在 `e-credit-attempt-1789185787275.json` |
| E4/E5-a 线索营销 | 区域路径与防环；服务端资质/评分保护、白名单评分和后台消息；区域/分层动态名单；人工资质评估、重评及真实转客户/联系人/商机；邮箱去重、跨身份排除/退订、脱敏和表格公式防护；营销合同及真实确认回款归因、重跑不翻倍 | `e-marketing-result.json`，12:16:18；区域、评分、资质和首次转化阶段在 `e-marketing-attempt-1789186578998.json` |
| E1/E3 跨服务合同及时间线 | 销售无 OA 普通新增权限；公网伪造内部请求头返回 403；合同详情保持用户数据范围、活动客户绑定不能伪造；客户合同列表正确过滤、来源固定并保持草稿；六来源 500 条事件五页完整排序、无重复遗漏 | `e-contract-timeline-result.json`，12:37:39；原 500 误报保存在 `e-contract-timeline-attempt-1789187859513.json` |

时间线六来源为 `ACTIVITY / FOLLOW_UP / OPPORTUNITY / QUOTE / RECEIVABLE / TICKET`；每页 100 条，五页响应分别为 51、46、46、46、47 毫秒，均低于 5000 毫秒。原有 8 条验收事件之外，经真实活动接口增加 492 条基准记录；结束后按原业务接口软删除这 492 条并保留审计日志，见结果中的 `cleanedBenchmarkCount=492`。该测量只代表本机单次验收，不代表生产负载性能。

## 最新真实桌面页面与合同表单

`ui-real-result.json` 于 15:08:07 记录 `passed=true`、18/18 页面、86 项检查、`pageErrors=[]`、`mockedResponses=0`，桌面尺寸为 1440×1000；运行日志为 `ui-real-run.log`，截图索引在结果的 `screens`，文件位于 `ui-real/`。本轮使用 1762 同步和登录修复后的真实会话，覆盖最终版本；13:16 的前轮结果保存为 `ui-real-attempt-1789196887867.json`，不重复累计。

| 页面组 | 实际身份与路由 | 已核对结果 |
| --- | --- | --- |
| D 管理四页 | admin：`/hr/leave-rules`、`/hr/attendance`、`/hr/payroll`、`/hr/grievances` | 真实菜单、业务接口、假期及考勤页签通过 |
| D 员工三页 | employee：`/hr/ess/leave-balance`、`/hr/ess/grievances`；peer：`/hr/ess/slips` | 本人已发放工资和计算快照可见；实际下载生成有效 PDF，1345 字节 |
| E 十一页 | `/office/crm/` 下 `activity`、`sla`、`lost-analysis`、`credit`、`territory`、`lead-score`、`campaign`、`target-list`、`profile-report`、`leads`、`tickets`；各页实际 admin/sales 身份见结果 | 真实页面及接口通过，额度页展示实际审批后的 2000 元额度 |

`ui-activity-contract-result.json` 于 15:08:13 为 `passed=true`、8 项检查通过：先选客户再选本人客户合同、真实 POST 活动及独立详情一致性、同事选择经 HR 有效员工验证后保存参与人均通过；无脚本错误、接口拒绝或管理接口越权请求。验收活动随后按原业务删除入口软删除，保留审计。此前 `UserSelector` 误用管理列表的中止结果和修复前通过结果保存在 `ui-activity-contract-attempt-*.json`，不改写历史。桌面结果不代表移动端验收。

### D_ONLY 独立页面记录

`ui-real-hr-result.json` 于 13:56:46（`05:56:46Z`）记录 `scope=D_ONLY`、`passed=true`、7/7 页面和 48 条检查通过、0 页面错误、0 模拟响应，脚本退出 0；身份为已重新登录的 admin、employee、peer。工资 PDF 实际下载有效（1345 字节），本人已关闭申诉详情不暴露内部说明的检查通过。独立日志为 `ui-real-hr-run.log`，截图在 `ui-real-hr/`，主线程已视觉查看 `ui-real-hr/ess-payroll.png`。该结果只覆盖 D，未覆盖原 `ui-real-result.json`，不冒充最新 18 页整轮。

### 最新只读权限复验

`ui-lookup-readonly-result.json` 于 15:05:12 为 `passed=true`，101 项通过、0 失败、1 跳过；日志为 `ui-lookup-readonly-full-20260912-150507.log`。该代理只使用已刷新的真实会话执行 GET 和只读查询，未自行登录或写入会话。13:55 的 63 通过、1 失败、4 跳过旧结果保留在 `ui-lookup-readonly-previous-1789196712095-result.json`。

| 范围 | 实际结果 |
| --- | --- |
| 已通过 | employee 新 `system:lookup:read` 生效；启用字典严格 8 展示字段、5 项白名单配置可读；同事严格 4 字段，`pageSize=10000` 仍封顶 100，返回当前租户启用用户，伪造租户参数不改变归属；原管理接口继续 403，非白名单配置拒绝，匿名字典/客户端参数请求 401；admin 原管理能力保留 |
| 销售及合同边界 | sales 基础读取和管理 403、额度/营销客户合同仅返回本客户四字段、两客户结果不混入、salespeer 无权读取他人客户均通过；sales 缺少 `customerId` 明确返回 400 并指明缺失参数 |
| 唯一跳过 | 当前库无其他租户真实用户样本；已实测伪造租户参数被忽略、返回 ID 全部属于当前租户，未构造其他租户账号，不将其写成跨租户真实账号验收通过 |

## 本轮生产代码修复核对

下表后端源码路径相对于 `cloudflow-backend/`；以 `scripts/` 或 `cloudflow-frontend/` 开头的路径相对于仓库根目录。此节修复已纳入本轮后端构建，并由最新权限/API/UI 及专项回归覆盖。

| 问题与修复 | 源码及验证依据 |
| --- | --- |
| HR 高危方法缺审计声明导致完整启动失败；七个方法补 `@Audit(highRisk=true)`，保留启动强校验 | `cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/` 下 `HrAttendanceBusinessService.deleteConfiguration`、`HrLeaveBusinessService.revoke/deleteRequest`、`HrPayrollBatchService.cancel`、`HrPayrollConfigurationService.deleteDeduction`、`HrRuleWorkflowService.cancel/processCancellation`；早期 77 项为审计修复快照，后续 D 86 项见专项表 |
| HR Redis 连接准备影响真实启动；超时设 10 秒，单机连接池最小空闲数默认 4，复用既有定制器和父项目依赖版本 | `cloudflow-service-hr/src/main/resources/application.yml`、`cloudflow-service-hr/src/main/java/com/cloudflow/hr/config/HrRedisConfiguration.java`、HR `pom.xml`；Nacos 同步操作见 `nacos-hr-timeout-fix.log` |
| 日历元数据查询被附加租户条件；仅两项列存在性查询忽略租户拦截，员工、部门、班次和引用查询保留隔离 | `cloudflow-common/cloudflow-common-holiday/src/main/java/com/cloudflow/common/holiday/mapper/HolidayResolverMapper.java`；`holiday-tenant-result.log` 为生产映射器只读租户检查 |
| 日历年度再次保存发生唯一键冲突；先锁定本租户日历，再软删除并按唯一键更新/插入，保留日期主键和创建信息 | `cloudflow-auth/src/main/java/com/cloudflow/auth/mapper/HolidayDateWriteMapper.java`、`cloudflow-auth/src/main/java/com/cloudflow/auth/service/HolidayManagementService.java`；D1 真实重复保存通过 |
| 实际审批后的内部监控查询映射不完整；补全内部实例查询和结果映射，含 `node_count` | `cloudflow-service-workflow/src/main/resources/mapper/workflow/ProcessMonitorMapper.xml`；真实 D/E 审批及 `scripts/workflow-checks/WorkflowMonitorMappingChecks.java` 所属专项提供回归依据 |
| CRM 已知业务拒绝被误报 500；改用明确的 `CrmBusinessException`，仅 CRM Controller 的分类处理器返回 400；未知异常继续脱敏返回 500 | `cloudflow-service-crm/src/main/java/com/cloudflow/crm/exception/CrmBusinessException.java`、`CrmExceptionHandler.java`，以及 `service/impl/CrmRecordSupport.java` 等 E 业务服务；未开放所有 `IllegalArgumentException` 原文 |
| CRM 调用 OA 普通合同入口需要额外管理权限；改为限定 CRM 调用方的内部草稿/详情/列表接口，要求用户身份，读取继续走用户数据范围，返回受限摘要；客户工作台强制来源及客户绑定 | `cloudflow-service-oa/src/main/java/com/cloudflow/oa/controller/InnerCrmContractController.java`、`cloudflow-service-oa/src/main/resources/mapper/OaContractMapper.xml`，以及 CRM `service/remote/RemoteOaService.java`、`service/impl/CrmCrossModuleDraftServiceImpl.java`；创建复用 OA 原服务强制 `DRAFT`，未给销售增加 OA 普通新增权限；后台 `/origins` 保留租户隔离 |
| 外部伪造内部头已被拒绝却误报 500；内部切面将明确安全拒绝分类为 403，保留内部标记与来源服务白名单校验 | `cloudflow-common/cloudflow-common-security/src/main/java/com/cloudflow/common/security/aspect/InnerAspect.java` 使用带 `FORBIDDEN` 的 `ServiceException`，由公共异常处理器映射状态；修后真实请求返回 403，13:35 开始的四专项轮次中内部安全边界 35 项通过 |

页面联调新增的权限与最小数据返回修复已核对如下；三个业务基础入口统一增加 `system:lookup:read` 显式授权，保留管理接口权限，不扩展管理权限：

| 修复 | 精确范围与源码 |
| --- | --- |
| 已登录且获基础授权的字典选项 | `/system/dict/data/type/{dictType}` 同时要求登录和 `system:lookup:read`，仅返回启用项的 8 个展示字段：`dictType, dictLabel, dictValue, dictSort, cssClass, listClass, isDefault, status`；管理 `/list`、详情和写接口继续鉴权。源码：auth `controller/system/SysDictDataController.java` |
| 前端配置白名单 | 新 `/system/config/client/{configKey}` 同时要求登录和 `system:lookup:read`，仅放行 5 键：`sys.page.defaultPageSize`、`sys.upload.maxFileSize`、`sys.upload.allowedTypes`、`sys.visitor.workflowEnabled`、`sys.hr.employee.defaultCreateMode`；管理 `/configKey/{configKey}` 保留 `system:config:query`。源码：auth `controller/SysConfigController.java` |
| 公告和 CRM 预加载 | 公告预取及消息铃铛中的公告读取检查 `oa:announcement:list`；CRM 各组数据按自己的读取权限加载，避免无合同/产品权限导致整页失败。源码：`cloudflow-frontend/src/hooks/useAnnouncementSync.ts`、`cloudflow-frontend/src/components/common/UnifiedMessageBell.tsx`、`cloudflow-frontend/src/components/crm/management/store.tsx` |
| 活动合同候选 | CRM `/activity/contracts` 要求 `crm:activity:list` 和客户编号，先检查客户权限，再复用 OA 内部摘要并核对返回客户；仅返回 `contractId, contractNo, contractName, customerId` 四字段。源码：CRM `controller/CrmActivityController.java`、`service/impl/CrmReferenceService.java`；最新真实表单与客户隔离、缺参 400 复验通过 |
| 已登录且获基础授权的同事选项 | 新 `/system/user/options` 同时要求登录和 `system:lookup:read`，校验当前租户，仅返回 `userId, nickName, deptId, deptName` 四字段；管理 `/list` 保留 `system:user:list`。源码：auth `controller/SysUserController.java`、`domain/vo/SysUserOptionVO.java`、`service/impl/SysUserServiceImpl.java`，前端 `cloudflow-frontend/src/components/common/UserSelector.tsx`、`cloudflow-frontend/src/services/api/workflow/users.ts`；最新权限及页面重跑通过 |

### 登录旧权限的根因与修复

权限缓存 = 暂存用户权限查询结果，供后续登录读取。`completeLogin` 原先直接调用 `findUserInfo`，查询参数虽带租户编号，执行时的租户上下文尚未设置；`TenantRedisCacheManager` 据运行上下文选择缓存名称，导致登录读写的名称与正常角色更新清理的租户名称不一致。角色菜单已更新并撤销旧会话，重新登录仍可能读取旧权限。

| 字段或行为（本次租户 100000） | 原异常登录路径 | 修复后登录路径与正常角色更新 |
| --- | --- | --- |
| 查询执行时的租户上下文 | 未设置 | `TenantBroker.applyAs` 临时设置为 100000，调用结束恢复 |
| `findUserInfo` 的缓存键表达式 | `#tenantId + ':' + #username` | 同一表达式保留 |
| 实际缓存名称 | `user_details` | `100000:user_details`；此处为名称中的单个冒号 |
| 正常角色更新清理的缓存名称 | `100000:user_details`，未覆盖旧登录写入的无租户名称 | `100000:user_details`，与修复后登录路径一致 |

生产修复仅替换 `cloudflow-auth/src/main/java/com/cloudflow/auth/controller/AuthController.java:625` 一行：在 `TenantBroker.applyAs(tenant.getTenantId(), ...)` 中调用 `sysUserService.findUserInfo(...)`；文件行数未变，无需修改扫描器白名单。命名空间依据同时核对 `cloudflow-common/cloudflow-common-redis/src/main/java/com/cloudflow/common/cache/TenantRedisCacheManager.java`、auth `service/impl/SysUserServiceImpl.java` 和 `service/impl/SysRoleServiceImpl.java`。该修复进入最新全量构建，新增登录租户缓存 100 项已通过并包含于 G 418 项中；11 个真实身份重新登录后的授权检查及销售页面、表单复验均通过。

## 最新专项回归

最新固定轮次 `final-regression-20260912-135140-672-summary.json` 记录 13:51:40—13:53:12 四个命令全部退出 0，16 个分组、1231 次断言、`failedScripts=0`。1231 = CRM 137 + OA 157 + 工作流 503 + HR 取消 16 + G 418；G 已包含新增登录租户缓存 100，定向 100 不重复累计。D 86 和真实日历只读 8 另列。前轮 `final-regression-20260912-133536-537-summary.json` 的 1131 只保留为历史，不与最新轮次相加；边界断言和真实页面检查也分别计量。

| 日志 | 截至时间 | 已有结果与边界 |
| --- | --- | --- |
| `current-d-precision.log` | 2026-09-12 13:46:09 | 最新后端构建阶段后执行，`PASS: 86 HR rule boundary checks`，退出 0 |
| `holiday-tenant-result.log` | 2026-09-12 13:46:11 | `PASS: 8 production holiday tenant read-only checks`，退出 0；只读生产映射器检查 |
| `final-regression-20260912-135140-672-batch-d-workflow.log` | 2026-09-12 13:52:16 | 最新轮次共 519：工作流批次 B 503，HR 取消及绑定保护 16 |
| `final-regression-20260912-135140-672-batch-e.log` | 2026-09-12 13:51:54 | 最新轮次 CRM 边界 137，通过 |
| `final-regression-20260912-135140-672-batch-f.log` | 2026-09-12 13:52:02 | 最新轮次 OA 边界 157，通过；供跨模块依赖回归，不构成 F 批整体验收 |
| `final-regression-20260912-135140-672-batch-g.log` | 2026-09-12 13:53:12 | 最新轮次 G 共用组件 418，通过；含内部调用 35、基础查询 51、登录租户缓存 100，其余分组及日志行号见摘要。100 已在 418 内，不单独再加；不构成 G 批整体验收 |

前端 `frontend-type-check.log`（13:14:58）与 `frontend-build.log`（13:16:19）已退出 0；构建日志记录 `built in 28.95s`，保留资源块超过 500 kB 和 Browserslist 数据已过 8 个月的警告。后端 `current-backend-build.log`（13:44:15）及其后 D 86、日历 8、13:47:54 六服务健康均通过；含登录缓存新增检查的 1231 项于 13:53:12 完成，最新 D_ONLY 页面于 13:56:46 完成，各自按证据轮次记录。构建和专项均不再列为待执行项。

## 追加异常对账验证

`d-reconcile-result.json` 于 15:11:23 为 `passed=true`、17 项检查通过、`restored=true`；脚本 `d-reconcile-live.mjs` 与日志 `d-reconcile-live-run.log` 对当前库专用验收员工 1053、假期类型 103、周期 100、额度主键 21 注入 0.25 可用额度差异。真实 `hrLeaveQuotaReconcile` 任务基线、差异与恢复后三次回执均为 `SUCCESS`，日志编号 863、864、865；实际 HR 日志明确记录 `expected=0.00, actual=0.25`。

差异任务完成后汇总保持 0.25，其他额度字段与不可变台账均未被自动修改；脚本只撤销自身注入，复核全部原额度字段及台账恢复原状，再运行一次真实对账成功。初次过快触发被重复提交保护以 409 拒绝，失败记录保留；最终脚本间隔 6000 毫秒重跑通过，未放宽保护。此项验证只告警行为与测试数据恢复，不冒称人工授权重建入口已在本次执行。

## 验收结论与保留边界

- 正式税率：`hr_tax_slab.slab_id=1450` 仍为 `DRAFT`，有效明细 0 条，财务尚未核定。当前库合成税表 1451 仅用于验收员工 1054（租户 100000），通过真实配置接口启用及绑定，不能作为正式税率。合成工资原单为应发 10000、个税 900、实发 9100；补正单为 1000、100、900，原工资单不变。正式财务核定仍是生产使用前置条件。
- E5-b：SMTP = 用于连接邮件服务器发送邮件的协议；真实渠道和追踪域名未就绪，发送明确返回 `NOT_IMPLEMENTED`，`sys_job` 中编号 1554 的 `crmCampaignCountAggregate` 保持 `PAUSED`。合成营销归因收入 1000、成本 100、ROI 9；ROI =（归因回款 − 实际成本）÷ 实际成本；同客户无关合同的 500 回款排除在外，不代表邮件群发已实现。
- G/F 整体与移动端业务均未签署；G 完整附件校验、打印及其余验收另行记录，本次申诉附件与共享安全检查不能覆盖整个 G。D/E 桌面截图不能代替移动验收，也未签署 OA/H4 日程状态一致性联验。

| 验收项 | 当前状态 | 记录与范围 |
| --- | --- | --- |
| 验证码临时配置 | 自动化授权已执行，全部 11 个身份真实登录；接口/数据库/运行缓存限额均恢复 100，成功计数保留为 111 | `captcha-adjustment-result.json`，`restored=true`；无密码或会话写入文档 |
| 最新权限、API、页面及表单 | 18 页/86 检查、合同表单 8、授权核对 60、只读边界 101 均通过 | 只读边界唯一跳过为第二租户真实用户样本缺失，非权限失败 |
| 后端/前端构建与健康 | 最新后端全量构建、D 86、日历只读 8、六服务 13:47:54 健康、前端 type-check/build 均通过 | 已记录各轮日志和体积/Browserslist 警告，不作为剩余阻塞 |
| 含登录缓存检查的专项 | 最新四命令、16 组、1231 项全部通过，G 418 已含登录缓存 100 | `final-regression-20260912-135140-672-summary.json`；D 86、日历 8 另列，定向 100 不双计 |
| D 对账不一致覆盖 | 真实单笔注入、告警、保持原账及恢复后复核通过，17 项 | `d-reconcile-result.json`；验收差异已撤销，不改不可变台账 |
| 整体验收结论 | D1–D4、E M1–M9 的约定里程碑范围验收完成 | `milestone-result.json` 归档 15 份最新结果的哈希、最终六服务健康与当前 317 表、正式脚本哈希；正式税率、E5-b、F/G、移动及第二租户样本限制继续保留 |

2026-10-16过期产物清理约定：本记录中的已完成历史轮次保留版本、检查范围、结果及未解决边界；过期服务包、独立环境、截图、输入快照及脚本副本按用户授权移除。当前运行和未完成验收依赖单独保护，历史失败不改写为通过；实际删除范围与空间结果见《开发测试过期文件清理-20261016.md》。
