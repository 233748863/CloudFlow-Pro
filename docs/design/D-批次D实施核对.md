# 批次 D 实施与验收记录

首次验收日期：2026-09-07；真实验收追加日期：2026-09-12。继续历史会话 `01a071ed-7fb1-7ad2-b140-3857fa5218da` 已批准的 D1 假期、D2 考勤、D3 薪资与个税、D4 员工申诉范围。

2026-09-07 的代码实现、完整构建、临时数据库业务检查和模拟接口页面检查通过，当时未执行真实微服务联调。2026-09-12 本轮 D1—D4 范围验收完成，真实业务、异常对账、最新桌面复验及构建专项证据见下文。`DE-20260912` 整体最终结论以 [D/E 真实验收里程碑](DE-真实验收里程碑.md) 为准；正式税率仍待财务确认。

## 实施口径

| 范围 | 已实现内容 |
| --- | --- |
| 假期 | 以不可变台账记录分配、冻结、扣减、释放、结转、过期、折现与调整；重复审批不重复扣减，冲正保留原记录；汇总不一致只告警，明确授权的重建操作单独执行。 |
| 假期数量 | 金额使用已批准的 `DECIMAL(18,2)`，假期数量使用 `DECIMAL(8,2)`；保留 `DAY` / `HOUR`，按实际日历和班次计算，未固定一天等于 8 小时；跨周期数量采用累计舍入差。 |
| 考勤 | 原始打卡与日结论分离；覆盖进出配对、跨夜归属、迟到早退和缺卡；重算保护人工记录，已封账月份禁止覆盖；当天已有批准请假按 D2 口径判定为请假。 |
| 夜班休息 | 复用 `hr_attendance_rule.config_json` 的 `breakStartTime` / `breakEndTime`，精确扣除请假与休息的交集；部分夜班缺休息位置或应工作分钟不明确时拒绝猜测。未新增休息时间数据库列。 |
| 薪资 | 周期、批次、员工计算结果、补正、税率表和员工税档；前置检查封账和假期状态；计薪与社保扣除时机显式配置；按年度累计预扣，本期负税按零，不退款。 |
| 薪资快照 | 保存计薪周期、累计税额、已用扣除和社保记录；同月分期不重复扣除社保或起征扣除；后续工资或补正不得绕过同年度待审补正；周期存在工资记录后禁止改写计算边界。 |
| 员工申诉 | 员工提交、补充、撤回、确认结论；人力资源和指定处理人受理、调查、分派、给出结论及升级劳动争议；申诉类型读取 `hr_grievance_type` 字典的 6 项配置。 |
| 隐私 | 逐案校验租户、本人、人力资源和处理人身份；被指向用户无权访问，申请人不能处理本人案件；内部调查轨迹不向员工开放；申诉、请假和税务证明文件在 HR 与通用文件入口均受保护。 |

配置类继续复用 `HrTypedCrudService`，业务计算使用独立服务，接口追加到现有聚合 Controller。复用既有 `HR_TYPED` 生成模板；HR 模块仅补充已使用 Redisson 的直接依赖声明，版本沿用父项目管理的 `3.27.0`。

## 审批可靠性

- `HR_RULE_WORKFLOW_START` 与 `HR_RULE_WORKFLOW_CANCEL` 使用现有待发送事件表保存启动、撤回请求；远程审批请求在本地数据库事务之外执行。
- 启动前独立提交尝试记录，按业务编号重试；远端成功而本地绑定失败后仍可恢复实例编号。撤回与恢复交错时保持业务单据为已撤回，并继续取消远端实例。
- 远端取消成功后记录完成标记；工作流端先验证租户和业务绑定，再允许已作废、已撤销、已驳回、已终止实例重复取消成功。已通过和自动通过实例继续拒绝该操作。

入口实现：`HrRuleWorkflowService`、`HrRuleWorkflowCancelConsumer`、`HrRuleSupport.lockedWithoutTransaction`，以及工作流服务 `WfInstanceServiceImpl.invalidateProcessByBusiness` 的重复取消保护。

## 数据与任务（2026-09-07 独立库）

| 项目 | 实测结果 |
| --- | --- |
| 建表 | 空库按顺序执行 `01`–`07` 成功；物理表共 269 张，HR 共 100 张，D 新增 15 张。 |
| D1 新表 | `hr_leave_ledger`、`hr_leave_period`、`hr_leave_policy`、`hr_leave_policy_detail`、`hr_leave_policy_assignment`、`hr_earned_leave_schedule`。 |
| D2 新表 | `hr_attendance_checkin`。 |
| D3 新表 | `hr_payroll_period`、`hr_payroll_batch`、`hr_payroll_batch_employee`、`hr_payroll_correction`、`hr_tax_slab`、`hr_tax_slab_detail`。 |
| D4 新表 | `hr_grievance`、`hr_grievance_record`。 |
| 菜单 | 使用 1450–1474 共 25 项，均在批准的 1450–1549 区间；新增前区间无冲突，重复执行数量不变。 |
| 员工权限 | 员工角色没有薪资发放、薪资配置、假期额度调整和考勤封账权限。指定申诉处理人的页面权限与逐案业务权限分开验证。 |
| 默认流程 | `wf_hr_leave`、`wf_hr_payroll_correction` 发布模型种子存在；对应流程键可通过系统参数配置。 |
| 任务 | 注册 8 个 HR 任务；业务触发的考勤重算和薪资批次任务保持暂停计划、自动重试次数 0；全仓仅保留原有待发送事件扫描器的 1 处方法级 `@Scheduled`。 |
| 演示数据 | 07 仅由 `scripts/generate-demo-seed.ps1` 重新生成；15 张新增表各有 2500 条演示记录，覆盖 50 个租户。 |
| 演示保护 | 税表未发布，薪资批次无虚构计算结果；补正为草稿且没有补正工资单，避免指向其他员工工资单；演示假期周期关闭、班次不自动计算、申诉已撤回。 |
| 字典 | 假期台账类型、单位、申诉状态和申诉类型已补齐；申诉类型种子重复执行后仍为 6 项。 |

## 验收结果（2026-09-07）

| 检查 | 结果与范围 |
| --- | --- |
| 完整后端 | `mvn -q -DskipTests install` 通过，包括构建期静态规则和直接依赖检查；静态规则零发现。此命令跳过 Maven 测试，业务检查由以下独立脚本执行。 |
| HR 规则 | 纯计算 72 项通过；加入真实 MySQL、MyBatis 映射和服务事务后共 140 项通过，包含纯计算项，未重复累计为两套数量。 |
| 工作流 | 原有工作流 476 项检查通过；另有 16 项 HR 重复取消、跨租户、错误业务绑定和禁止取消已通过流程的检查通过。 |
| 入职回归 | 原有 HR 入职 316 项检查通过。 |
| 前端 | `npm run type-check` 与 `npm run build` 通过。 |
| 浏览器 | 7 个页面、21 个页签切换通过；申诉表单使用字典返回标签，夜班休息编辑保留已有围栏和其他配置，仅有新增权限时不出现修改按钮；页面运行与控制台错误均为 0。 |
| 数据 | 初始化、菜单区间、种子重复执行、角色权限、任务、税率占位、演示数量与关联检查通过。 |
| 差异 | 已暂存和未暂存改动的 `git diff --check` 均通过。 |

2026-09-07 的独立数据库检查覆盖额度不足时的并发提交、停用假种后的释放、重复审批、无额度假台账、额度对账与重建、夜班休息读取、封账和人工保护、分期工资、跨月扣薪、年度个税重置、社保不重复扣除、申诉和私密附件权限。

## 复验入口（历史独立验证）

从仓库根目录使用 PowerShell 7，先完成后端构建，再顺序执行以下脚本；不要同时安装本地 Maven 依赖并运行使用这些依赖的 Java 检查。

```powershell
pwsh -NoProfile -File scripts/generate-demo-seed.ps1
pwsh -NoProfile -File scripts/verify-batch-d.ps1
pwsh -NoProfile -File scripts/verify-batch-d-db.ps1
pwsh -NoProfile -File scripts/verify-batch-d-workflow.ps1
pwsh -NoProfile -File scripts/verify-hr-onboarding.ps1
```

页面脚本为 `node scripts/verify-batch-d-ui.mjs`。前提是已构建前端，并在 `127.0.0.1:4187` 启动独立预览；脚本复用本机已有 `playwright-core` 和浏览器，工具目录默认 `.cloudflow-runtime/playwright`，可通过 `CLOUDFLOW_PLAYWRIGHT_HOME` 指定。未向项目增加前端依赖或测试框架。

本机日志保存在 `.cloudflow-runtime/batch-d-*.log`，页面检查摘要为 `.cloudflow-runtime/batch-d-ui-results.json`，夜班休息表单截图为 `.cloudflow-runtime/playwright/batch-d-night-breaks.png`。

## 验证边界（2026-09-07）

本节保留首次验收的独立库、替身和页面模拟边界；当前库真实验收及合成税表的使用范围见下一节，不以历史结论覆盖本轮事实。

- 数据库仅使用脚本创建的独立 MySQL 实例；检查程序还校验服务器数据目录属于 `cloudflow-backend/target/batch-d-mysql-*`。实例已关闭，临时数据目录已清理，未连接或修改现有业务库。
- 数据库测试的分布式锁使用本地锁替身，远端审批、业务规则等调用使用测试替身；页面测试拦截全部业务 HTTP 请求并关闭 WebSocket，未启动连接现有基础设施的业务后端。独立 4187 预览进程已停止。
- 未验证真实 Spring 微服务启动、真实 Redis 集群竞争、消息投递和跨服务审批联调；这些结果不能由本次服务级或页面模拟检查替代。
- 正式 2026 税率仍待财务提供并核验。06 中编号 1450 的税表保持 `DRAFT` 且无有效税档；检查所用合成税率只写入临时数据库，未进入 06、07 或业务库。
- 保留现有前端构建提示：资源块超过 500 kB、Browserslist 数据陈旧；未进行范围外依赖升级。未提交代码、建立分支或撤销原有暂存及非本批修改。

## 2026-09-12 真实验收追加（本轮 D 范围验收完成）

本节属于里程碑 `DE-20260912`。当前库 `192.168.1.173:3306/cloud_flow_db` 经用户授权完整备份后，顺序重建正式 01—06，共 317 张表，未导入 07；旧 269 表、独立数据库及模拟页面数字继续作为 2026-09-07 历史记录。备份为 `.cloudflow-runtime/milestone-de-20260912/before-DE-20260912-100332.sql`，大小、SHA-256、授权状态及服务快照统一见 [D/E 真实验收里程碑](DE-真实验收里程碑.md)。本次不另建独立测试库。

后续业务基础查询菜单 1762 从正式 06 单条精准同步，11 个启用种子角色经正常角色更新 API 各增加此菜单，原菜单集合及 `dsType`/`dsScope` 保留，不扩展管理权限；没有再次重建或重跑 06。`state.json.scripts` 保留重建时旧哈希，`lookup-permission-fixture.json` 保存同步所据新哈希、原角色快照和更新完成标记；11 个角色前后不变检查见 `lookup-permission-attempt-1789192248550.json`，详细哈希与名单在里程碑中记录。

以下证据文件名相对于 `.cloudflow-runtime/milestone-de-20260912/`，时间为北京时间。真实脚本使用运行服务、真实登录、Redis、审批和消息；检查对象是专用合成业务记录。续跑会保留已经完成的业务阶段，历史 `attempt` 中只有已写入 `checks` 的成功步骤可作阶段证据，`passed=false` 不代表整轮通过。

### 真实业务与证据

| 范围 | 本次通过内容 | 精确证据 |
| --- | --- | --- |
| D1 日历和额度 | 跨年、周末、调休补班及半天计算；日历重复保存后日期主键保留且无重复；同员工仅剩一天额度时，真实 Redis 下两单并发一成一败；客户端伪造员工与时长被覆盖；冻结、撤回/拒绝释放；部门和实际人事终审经消息回调实扣一天，扣减台账仅一笔 | `d-leave-result.json`，11:17:04，`passed=true`；并发、冻结和释放阶段在 `d-leave-attempt-1789182415331.json`。断言名包含“真实 Redis 下同员工两单并发一成一败”“审批通过仅写一笔不可变扣减台账” |
| D2 考勤 | 未齐备日结论禁止封账；原始打卡按真实班次算出迟到 10 分钟、早退 5 分钟及缺卡缺勤；默认重算保留人工核正；已封账月份强制重算跳过且原值不变、人工改写拒绝；员工无封账权限；跨夜下班卡归属前日并扣休息 | 准备及封账阶段见 `d-payroll-attempt-1789183356002.json`；后续保护及跨夜见 `d-payroll-attempt-1789183461267.json`、`d-payroll-result.json`，11:24:21，`passed=true` |
| D3 薪资与补正 | 正式税率未核定和考勤未封账分别阻止算薪；封账及合成税表齐备后真实后台任务生成唯一工资单；普通员工不能发放，草稿不向员工开放，发放后仅本人读取且完整性通过；待审补正阻止第二单；实际部门/财务审批回调生成独立补正，原工资不变 | 未核定税率检查在 `d-payroll-attempt-1789183220449.json`；算薪任务阶段在 `d-payroll-attempt-1789183461267.json`；发放、隐私及补正在 `d-payroll-result.json`。fixture：验收员工 1054、批次 100、原工资单 24063、补正申请 100 |
| D4 申诉 | 申请人可读，非关联员工、被申诉 HR 和未分派管理员均拒绝；被指定非 HR 处理人获得逐案权限；真实私有附件与通用文件入口均防绕过，内部记录/附件不向员工开放；真实消息投递不含申诉内容且排除冲突 HR；结论只允许一次退回、确认关闭；实际升级劳动争议并保持权限隔离 | `d-grievance-result.json`，11:28:27，`passed=true`；包含“真实消息投递成功且不含申诉内容”“通用文件入口不能绕过申诉附件授权”“被申诉HR不能经劳动争议入口读取案件” |

上述 Redis 并发证据验证运行中 Redis 的锁竞争，不扩展为集群故障切换或容灾验收；工资“发放”指合成工资单完成真实业务状态流转，不代表对外银行支付。

本轮已真实注入并验证异常对账：`d-reconcile-result.json` 于 15:11:23 记录 `passed=true`、17 项检查、`restored=true`。仅将专用验收员工 1053、假种 103、周期 100、额度记录 21 的 `available` 从 0 临时改为 0.25；真实后台 `hrLeaveQuotaReconcile` 在基线、异常、恢复后三次均为 `SUCCESS`。实际 HR `WARN` 包含租户 100000、员工 1053 及 `expected=0.00 / actual=0.25`；异常期间汇总与不可变台账均未被自动修正，结束后全部原字段恢复。初次快速触发的 409 失败证据保留于 `d-reconcile-attempt-1789197083269.json`；脚本触发间隔改为 6000 ms 后通过，未降低重复提交保护。授权重建操作仍沿用历史独立库的验证边界。

### 正式税率与合成输入

| 对象 | 当前证据与限制 |
| --- | --- |
| 正式税表 1450 | 租户 100000，状态 `DRAFT`，有效明细 0 条，财务尚未核定；算薪前置检查正确拒绝，验收后仍保持草稿 |
| 合成税表 1451 | 经当前库真实接口配置并启用，名称标注非正式税表；七档统一 10% 仅验证计算链路，专门绑定验收员工 1054，不能用于正式工资。与首次独立库检查所用合成数据分开记录 |
| 原工资与补正 | 原单应发 10000、个税 900、实发 9100；补正应发 1000、个税 100、实发 900。`d-payroll-result.json` 核对补正不重复扣起征额、原单金额和完整性不变 |

本轮验证未提供正式生产税率，也未把合成税表写成 06/07 的正式种子；财务核定继续列为生产使用前置条件。

### 本轮修复与已有专项

生产源码核对及完整路径见里程碑的“本轮生产代码修复核对”。D 相关修复保留以下安全范围：

| 修复 | 已核对实现 |
| --- | --- |
| 启动审计 | 七个方法补 `@Audit(highRisk=true)`：`HrAttendanceBusinessService.deleteConfiguration`、`HrLeaveBusinessService.revoke/deleteRequest`、`HrPayrollBatchService.cancel`、`HrPayrollConfigurationService.deleteDeduction`、`HrRuleWorkflowService.cancel/processCancellation`；保留生产 `HighRiskAuditVerifier` 强校验 |
| HR Redis | `application.yml` 超时 10 秒；`HrRedisConfiguration` 复用 Redisson 定制器，单机最小空闲连接默认 4；依赖显式声明并沿用父 POM 版本，Nacos 超时同步证据为 `nacos-hr-timeout-fix.log` |
| 日历读写 | `HolidayResolverMapper` 仅对两项元数据列存在性查询忽略租户拦截；业务数据查询保留隔离。`HolidayDateWriteMapper` 与 `HolidayManagementService.batchSave` 锁定本租户日历后按唯一键保存，保留日期主键/创建信息 |
| 工作流监控 | `ProcessMonitorMapper.xml` 补齐内部实例查询和结果映射的 `node_count` 等字段；真实审批完成后的监控链路可继续执行 |
| 基础选项显式授权 | 字典展示、五键客户端配置及同事摘要三个入口均要求 `SaCheckLogin` 加 `SaCheckPermission(system:lookup:read)`；菜单 1762 为隐藏 F 类型。基础读取授权通过正常角色 API 增加，原字典、配置和用户管理权限保持不变 |
| 登录旧权限根因 | `completeLogin` 查询用户权限前未进入租户上下文，登录读写 `user_details` 与角色更新清理的 `100000:user_details` 名称不一致。`cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/controller/AuthController.java:625` 单行改用 `TenantBroker.applyAs`，保持行数，无需改扫描器白名单；已纳入本轮全量构建 |

| 专项日志 | 日志时间（2026-09-12） | 最新通过结果 |
| --- | --- | --- |
| `current-d-precision.log` | 13:46:09 | 最新后端构建轮次的 86 项 HR 规则边界检查，退出 0；早期 77 项不作为当前总数 |
| `holiday-tenant-result.log` | 13:46:11 | 8 项生产日历映射器只读租户检查，退出 0 |
| `final-regression-20260912-135140-672-batch-d-workflow.log` | 13:52:16 | 最新轮次 503 项工作流批次 B 检查，另 16 项 HR 重复取消及绑定保护检查，共 519，全部通过 |

这些专项与真实 HTTP、审批回调及消息证据分别计量；本节没有重新运行独立库脚本，也没有把历史 140 项、316 项等数字改记为本轮真实联调总数。最新 `final-regression-20260912-135140-672-summary.json` 于 13:53:12 记录四命令、16 组、1231 项全部通过：CRM 137、OA 157、工作流 503、HR 取消 16、G 418；新增登录租户缓存 100 已包含在 G 418 中，定向重复运行不另计。D 86 与真实日历只读 8 另列，旧 1131 仅保留历史。

包含第 625 行修复的后端全量构建已由主线程确认退出 0，`current-backend-build.log` 于 13:44:15 记录静态规则零发现；`health-result.json` 于 13:47:54 记录六服务均 `UP`、`passed=true`。前端 `frontend-type-check.log` 与 `frontend-build.log` 也已退出 0，保留体积超过 500 kB、Browserslist 数据已过 8 个月的警告。上述专项通过后生产源码未再变更；验证码配置恢复及其后的真实权限、页面和表单复验均已完成。

### 真实桌面页面及验收结论

最新 `ui-real-result.json` 于 15:08:07 记录 `scope=D_AND_E`、`passed=true`，18/18 页、86 项检查通过，`mockedResponses=0`、`pageErrors=[]`。其中 D 覆盖管理端 `/hr/leave-rules`、`/hr/attendance`、`/hr/payroll`、`/hr/grievances`，以及员工端 `/hr/ess/leave-balance`、`/hr/ess/slips`、`/hr/ess/grievances`。`ui-activity-contract-result.json` 于 15:08:13 记录真实合同活动表单 8 项检查通过；两份最新证据均在权限同步、登录缓存修复及验证码配置恢复后生成。

历史 `ui-real-hr-result.json` 于 13:56:46 记录 `scope=D_ONLY`、7/7 页、48 项检查通过，页面尺寸 1440×1000、零页面错误、零模拟响应，保留独立日志 `ui-real-hr-run.log` 与截图 `ui-real-hr/`。该轮实际下载有效工资 PDF（1345 字节），并通过已关闭申诉详情不暴露内部说明检查；主线程已视觉查看 `ui-real-hr/ess-payroll.png`。D_ONLY、修复前旧页面通过记录及 2026-09-07 模拟检查均按历史范围保留，不与最新 18 页重复累计。

用户已授权全部自动化，验证码日额度临时调整为 120 后已按约定恢复 100。`captcha-adjustment-result.json` 于 15:05:53 记录 `passed=true`、`restored=true`，配置接口、数据库及运行缓存均确认 100；成功校验计数从 100 增至 111 并完整保留，`counterManuallyChanged=false`。原 `captcha-limit-result.json` 继续保留为阻塞历史。`lookup-permission-result.json` 于 15:02:34 记录 60 项检查整轮通过，原销售身份登录及权限复验阻塞已解除。

| 验收项 | 当前结论 |
| --- | --- |
| D 业务、异常对账及构建 | 本轮 D1—D4 范围验收完成；异常对账真实注入 17 项及完整恢复通过，后端构建、六服务健康均已有通过证据 |
| 权限及桌面复验 | 权限 60 项、最新 18 页 86 项、合同活动表单 8 项均通过；验证码额度恢复 100，计数未清空；历史 D_ONLY 7 页 48 项另存 |
| 专项回归 | 最新四专项 1231 全部通过，G 418 已包含新增登录缓存 100；D 86 与真实日历只读 8 另列，重复运行不累计 |
| 范围外及生产前置 | 正式税率财务核定仍未完成；E5-b 邮件与追踪延期、G/F 整体及移动端范围继续保留，D4 文件安全证据不等同于 G 整体验收 |

本记录仅确认以上 D 本轮范围验收完成；`DE-20260912` 整体最终结论由主线程维护的 [D/E 真实验收里程碑](DE-真实验收里程碑.md) 统一给出。权限与页面旧失败记录继续保留为历史证据，不作为当前阻塞，也不以本记录扩展 E5-b、G/F 整体或移动端验收范围。

2026-10-16过期产物清理约定：本记录中的已完成历史轮次保留版本、检查范围、结果及未解决边界；过期服务包、独立环境、截图、输入快照及脚本副本按用户授权移除。当前运行和未完成验收依赖单独保护，历史失败不改写为通过；实际删除范围与空间结果见《开发测试过期文件清理-20261016.md》。
