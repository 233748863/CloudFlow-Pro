# H 批 HR-09 加班调班设计确认稿

状态：用户已确认 HR 三表方案 A并实施，真实业务验收进行中。设计日期：2026-09-13；实施日期：2026-09-14。本文只覆盖 HR-09。

下文保留设计时的基线与政策决策；对应正式结构和业务代码已实施，历史工作区变更保留。倍率、调休比例、休息间隔及审批人未获业务核定时保持停用或空值；临时验收值在验证后恢复，不能据此处理正式薪资。逐项证据见 [H 首轮实施与验收记录](H-首轮实施与验收记录.md)。

实施接线补充：加班工时规则通过仅允许HR服务调用的内部接口读取，限定`hr.overtime.hours.limit`及对应日/月命中；当前租户显式停用优先于既有默认回退。员工锁查询仍带显式租户条件，方法级避开当前SQL解析器的锁语句重排。真实在线入口为`scripts/verify-batch-h-hr.mjs`，每次独立记录覆盖范围和政策恢复证据，阶段通过不代替完整薪资结算与补正验收。

术语：DDL = 建表及改列语句；DTO = 接口接收的字段集合；VO = 接口返回的字段集合；台账 = 只追加、不覆盖的业务收支记录；幂等 = 同一业务操作重复到达只产生一次结果；快照 = 保存当时参与计算或审批的原始依据；Outbox = 与业务数据同事务保存、由消费者在事务外执行的待发送事件；CAS = 更新时同时匹配状态和版本，防止覆盖并发操作。

## 0. 必须确认的三个核心决策

### Q1：独立申请与表数冲突

`docs/prd/H2-HR-增强项合集-PRD.md:47` 的 FR-1 要新建 `hr_overtime_type`，FR-3 要扩展 `hr_time_request`，FR-6 要新建 `hr_shift_request`。原始 PRD 的“新增 2 张”指“类型表 + 调班申请表”；H 优先级同时指出加班混入请假表的缺陷。建议增加独立加班申请表，实现完整独立化；用户已选择增强条目，尚未指定 HR 表数，此项结构增量须确认。

| 方案 | 新表 | 改现有表 | 表数结果，仅计算 HR-09 | 待确认含义 |
| --- | --- | --- | --- | --- |
| A，建议确认的独立申请方案 | 3：`hr_overtime_type`、`hr_overtime_request`、`hr_shift_request` | 5，见 §2.4 | DB03：100 → 103；全库：317 → 320 | 完整独立化，同时保留 PRD 的类型、倍率主数据，待用户确认 |
| B，原始 PRD 方案 | 2：`hr_overtime_type`、`hr_shift_request` | 5，同一名单，`hr_time_request` 改为扩展而非禁止加班 | DB03：100 → 102；全库：317 → 319 | 保留原 PRD 共表建模，作为需用户裁决的差异方案 |

OA-08 专项设计新增 3 表，因此四项合并总增量在 A 下为 **+6**、在 B 下为 **+5**。建议采用 A，仍待用户确认。§2.1—§2.4 完整展开 A；§2.5 给出 B 的替代规则及完整改列语句。两套互斥，不能混用。

### Q2：工时与报酬政策

建议流程为“员工登记 → 实际打卡结束后提交 → HR 核定分钟 → 加班费由财务核价 → 发起正式审批 → 通过后自动结算”。尚未确认的业务选择集中如下，不要求用户决定数据库精度：

- 工时按有效进出打卡与申请时段的交集计算，扣除明确的休息；核定分钟不得超过实际分钟。建议沿用 D 当前的“超出应工作分钟后再扣班次阈值”口径，日/月上限依据类型配置、由规则中心决定 BLOCK/WARN。上限数值未提供，不能自行填成法定标准。
- PRD 已写 1.50 / 2.00 / 3.00，但当前库没有倍率主数据。建议仅作为停用的待核定类型种子，启用须 HR/财务确认；加班费的基础时薪由财务逐单核定，不能擅自使用月薪 ÷ 21.75 ÷ 8。调休比例建议按 PRD §综合待确认的 1:1，仍待确认，未确认时不启用转入。
- 建议首期调休只转入现有 `HOUR` 假种，按同员工、假种、原假期周期累计精确分钟及比例，累计向下取两位后逐单记差额，禁止逐单四舍五入放大额度；不足 0.01 小时的余量留在原周期累计，周期最终结案时不自动抬高或带往下期。这项舍入取舍待确认，详见 §4.5。有效期沿 D 周期/结转规则；现 `COMP_TIME.quota_rule.expiryDays=90` 未成为 D 的通用到期算法，若要求 90 天到期，须补齐算法与验收，否则该分支阻塞。加班费进入财务核定的下一有效工资周期；审批期间目标关闭时停止自动结算，建议由有权经办人明确选择额度补入、真实已发工资的 D 补正或终止本次自动结算，不静默换周期，也不将终止自动结算解释为员工放弃报酬。舍入、有效期及关账处置合并为本政策决策，不让用户选择技术字段。

### Q3：调班范围、同意及撤销边界

建议首期支持“未来一个考勤日的个人换班”及“同部门两名在职员工同一考勤日互换现有班次”，允许班次本身跨午夜。双人互换必须对方本人同意，再走负责人/HR 审批；不允许管理员代同意。多日、跨部门、跨日期互换、休息日与工作日互换需要另外确认，不能把空班次当休息班。

建议相邻班次间的最短休息分钟由 HR 明确配置，未配置时拒绝提交调班，不编造法定时长。已打卡、已有人工考勤结论、已封账、已算薪的日期禁止调班。两类申请只允许审批前撤回；已通过不能调用工作流作废接口反向取消，已入账差错走留痕的额度核查或 D 工资补正，不自动冲销、删除或重写历史单据。

Q1—Q3 未获确认前不编码。若用户改变单日范围、比例/到期政策、核价方式或已通过撤销范围，先修订对应 DDL、状态机和验收，不把上述建议写成已定业务规则。

## 1. 第一步：重新摸排与差异记录

### 1.1 已读资料与基线来源

已完整阅读 `docs/design/04-编码任务通用约束.md`、`docs/design/11-批次H编码任务提示词.md`、`docs/design/H-批次H技术设计要点.md`；补读 `docs/prd/H2-HR-增强项合集-PRD.md:27` 的 HR-09 背景、FR-1—FR-7、AC-1—AC-7、依赖及 `docs/prd/H2-HR-增强项合集-PRD.md:245` 的待确认项。

关联依据：`docs/design/A-批次A技术设计-01-DDL.md:403`、`docs/design/A-批次A技术设计-03-SDK与执行协议.md:265`、`docs/design/D-批次D技术设计.md:63`、`docs/design/D-批次D技术设计.md:229`、`docs/design/D-批次D技术设计.md:422`、`docs/design/D-批次D实施核对.md:7`、`docs/design/D-批次D实施核对.md:22`、`docs/design/D-批次D实施核对.md:96`、`docs/design/DE-真实验收里程碑.md:152`。以现实现和真实验收记录修正旧设计示意代码。

主代理只读核实并提供：当前全库 317 表，正式 01—05 分别 50/45/100/87/35；`sys_menu` 731 条、最大 1762；1800—1859 无占用，`sys_job`/`sys_job_handler` 同段无占用。本项只使用 **1830—1859**，最终落库前碰撞查询仍由主代理负责。

种子角色为 11 个：1 admin、2 manager、3 finance、4 hr、5 employee、6 legal、7 oa_clerk、8 sales_manager、9 sales_rep、10 crm_ops、11 customer_success。`workflow:process:start` 现仅 1/2/3/4/5/8/9 持有；本项不向其他角色增加通用发起、流程管理或任务管理权限。C 批子表和受限表单解析器未落地，本稿使用现有普通表单控件与原生 DTO 校验，不依赖那些能力。

### 1.2 当前源码证据

以下行号为本次摸排时工作区行号；并行文档工作不改变这些实现结论。它们是实际路径，不把早期设计中的伪代码当实现。

| 对象 | 路径与起始行 | 已核实事实 |
| --- | --- | --- |
| 时间申请实体/载荷 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/entity/HrTimeRequest.java:6`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrTimeRequestPayload.java:21` | 实体继承载荷；没有 `overtimeType`、`compensationType`、实际/核定工时、倍率及结算字段 |
| 时间申请入口 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/controller/HrAttendanceResourceControllers.java:371` | LEAVE 交给 D 服务；OVERTIME 创建直接进通用 CRUD；使用管理级 `hr:attendance:*` 权限 |
| 通用状态入口 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrLeaveBusinessService.java:715`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrTypedCrudService.java:237` | 非 LEAVE 可以直接修改/删除，submit/approve/reject 只是状态映射，没有发起真实加班流程 |
| 请假与取消 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrLeaveBusinessService.java:85`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrLeaveBusinessService.java:172` | D 提交服务端计算、冻结，审批实扣/释放；`onApproval` 对非 LEAVE 立即返回；撤回统一发送 `HR_TIME_REQUEST`，不是独立加班取消 |
| 回调及去重 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/impl/HrWorkflowCallbackServiceImpl.java:119`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/impl/HrWorkflowCallbackServiceImpl.java:173`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/impl/HrWorkflowCallbackServiceImpl.java:374` | OVERTIME 指向旧时间申请；只触发请假副作用；有租户、实例、当前状态条件更新及既有副作用唯一标记可复用 |
| 调休台账 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrLeaveBusinessService.java:626`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrLeaveBusinessService.java:676` | 手工 COMPENSATORY 校验假种标记、正数、OPEN 周期，写账后刷新额度；手工入口使用 `HR_LEAVE_OPERATION` 来源，不能直接作为 H 自动结算公开入口 |
| 规则检查 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrLeaveBusinessService.java:1072` | 已有 `BusinessRuleClient` 和规则命中记录；不是一个现成的加班日/月上限服务 |
| 工作流可靠启动 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrRuleWorkflowService.java:44`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/client/WorkflowServiceClient.java:35` | Outbox、失败恢复、撤回交错保护已存在；target 当前仅支持请假和工资补正，须显式增加两类新业务，不能落入补正默认分支 |
| 工作流内部入口 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/client/WorkflowServiceClient.java:83`；`cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WfInstanceServiceImpl.java:1151` | 受限内部 start/invalidate-by-business 已有；已通过流程不允许作废，H 不放宽这个边界 |
| 打卡、考勤 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAttendanceBusinessService.java:55`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAttendanceBusinessService.java:102` | 写卡尚未赋 `overtime_type_id`；非工作日且不要求考勤会生成零工时结论；不能把这些零值当作已核实的加班 |
| D 加班候选分钟 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAttendanceJudge.java:20`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAttendanceJudge.java:80` | 过滤 offshift/skip_auto/窗口外打卡；候选加班为 max(0, work−expected−threshold)，并未校验申请或折算工资 |
| 封账与月汇总 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAttendanceBusinessService.java:234`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAttendanceBusinessService.java:529` | 月加班从日 `overtime_minutes` 求和/60，CONFIRMED 后不允许修改 |
| 排班服务 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAttendanceBusinessService.java:368` | 支持 EMPLOYEE/DEPT、单日或日期区间，保存后使日历归属缓存失效；没有换班同意、休息间隔或双人原子交换 |
| 排班取值 XML | `cloudflow-backend/cloudflow-common/cloudflow-common-holiday/src/main/resources/mapper/holiday/HolidayResolverMapper.xml:9` | 员工优先于部门，同级单日优先于区间，再按生效日/id 降序；班次取 assignment.shift_id 或 rule.shift_id |
| 日历与休息 | `cloudflow-backend/cloudflow-common/cloudflow-common-holiday/src/main/java/com/cloudflow/common/holiday/service/HolidayCalendarServiceImpl.java:53`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrShiftBreaks.java:16` | 班次→部门→租户默认；休息位置读规则 `config_json.breakStartTime/breakEndTime`，跨夜或部分时段不可猜午休 |
| 工资真实入口 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrPayrollCalculationService.java:141`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrPayrollCalculationService.java:223` | 仅取 APPROVED、日期落在周期内的 BONUS/OVERTIME/REFERRAL_BONUS/LEAVE_ENCASHMENT；已存在加班费消费分支，缺来源与核价链路 |
| 工资金额保护 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrCompChangePayload.java:44`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/controller/HrCompensationResourceControllers.java:295` | `change_amount` 是加密字符串并转换为 BigDecimal；通用新增/状态接口须防止伪造或改写 H 自动结算来源 |
| D 补正及关账 | `cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrPayrollCorrectionService.java:37`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrPayrollConfigurationService.java:128`；`cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrLeaveBusinessService.java:462` | 工资补正只接受真实 PAID 原工资单及开放目标；工资关账检查未发补正，假期关账有周期行锁；H 需补来源关联及待结算检查，不能假造原工资单 |
| 自审边界 | `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/SelfApprovalPolicy.java:17`；`cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/strategy/impl/VariableUserAssignStrategy.java:28`；`cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WfTaskServiceImpl.java:235` | 当前默认 ALLOW，转派仍命中本人会降级允许；VARIABLE_USER 与禁止转办/加签已有，排除申请双方须另补受限接线 |
| 防重与日志 | `cloudflow-backend/cloudflow-common/cloudflow-common-idempotent/src/main/java/com/cloudflow/common/idempotent/annotation/RepeatSubmit.java:37`；`cloudflow-backend/cloudflow-common/cloudflow-common-idempotent/src/main/java/com/cloudflow/common/idempotent/annotation/RepeatSubmit.java:90`；`cloudflow-backend/cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/aspect/RequestLogAspect.java:40`；`cloudflow-backend/cloudflow-common/cloudflow-common-log/src/main/java/com/cloudflow/common/log/annotation/SysLog.java:41` | 防重默认 5 秒，与创建重放返回原单冲突；已有 Disabled 豁免；请求切面未遵守 logParams=false，需集成人共用修正 |
| 加班页面/API | `cloudflow-frontend/src/pages/OvertimeApplicationPage.tsx:79`；`cloudflow-frontend/src/services/api/overtimeApplication.ts:98`；`cloudflow-frontend/src/services/api/hr/attendance.ts:94` | 页面手选类型/补偿方式，发给旧时间申请；发送字段后端载荷未定义，不能证明已持久化；详情靠取全列表 find，导出也是客户端聚合 |
| 考勤页面 | `cloudflow-frontend/src/pages/hr/HrAttendancePage.tsx:127`；`cloudflow-frontend/src/pages/hr/HrAttendancePage.tsx:384` | 仍有通用时间申请表单和状态按钮；H 切换后需关闭加班旁路，同时保留请假、补卡及既有出差相关处理 |
| 正式结构/种子 | `cloudflow-backend/DB/03.cloudflow-hr.sql:442`；`cloudflow-backend/DB/03.cloudflow-hr.sql:625`；`cloudflow-backend/DB/03.cloudflow-hr.sql:2139`；`cloudflow-backend/DB/06.cloudflow-business-seed.sql:3781`；`cloudflow-backend/DB/06.cloudflow-business-seed.sql:11456` | 字段、枚举、精度、无物理外键及现有种子在此核对；新 DDL 不从旧表数演进推算 |

### 1.3 本项当前库只读核实

连接使用既有环境加载函数，验证目标为授权当前库，查询均位于 `START TRANSACTION READ ONLY` 会话且结束回滚；未输出密码、会话或员工薪资。HR 子集的实查结果如下，全库/菜单/角色基线采用主代理共享结果，不重复主代理的总基线工作。

| 项 | 当前库事实 | 设计影响 |
| --- | --- | --- |
| `hr_overtime%`、`hr_shift%` | 只有现有 `hr_shift`；类型表和两张申请表均不存在 | 不可声称倍率表或调班模型已铺好 |
| 原时间申请 | 20 列；存在 OVERTIME/APPROVED 1 条，非 H 验收产生 | 原始 PRD 的 19 列和“含出差枚举”描述不准确；该示例不代表已结算 |
| 调休假种 | id=102，COMP_TIME，HOUR，need_quota=1，status=1，**compensatory_flag=0**，quota_rule={expiryDays:90} | D 字段存在，现种子不能自动转入；修种子须确认，当前不修 |
| 加班类型字典 | WORKDAY/WEEKEND/HOLIDAY；dict_code=687/688/689 | 字典编号不是未来 `hr_overtime_type.type_id`，禁止直接填进打卡类型 ID |
| 补偿方式字典 | PAYMENT/TIME_OFF；与原 PRD 的 PAY/COMPENSATORY 不一致 | 新接口使用 PRD 枚举，需同步种子和前端，明确切换 |
| 阈值 | 标准/弹性班 overtime_threshold_minutes 均为 0；系统参数 `sys.attendance.overtimeThreshold=30` | D 判定实际读班次字段，不能把全局参数 30 当当前生效值 |
| 原始打卡/日/月字段 | 类型 ID BIGINT 可空；日分钟 INT 非空默认 0；月小时 DECIMAL(8,2) 非空默认 0 | 保留分钟原口径，另列核定加班，避免回归悄然换义 |
| 工资 | `change_amount VARCHAR(255)` 加密；现库无 OVERTIME 薪资变动 | 不能新增明文工资金额或声称已有结算副作用 |
| 薪资项目 | BASE/FIXED、ALLOWANCE/FIXED、BONUS/VARIABLE，均启用且 taxable=1 | 缺独立加班 VARIABLE 项，需 06 种子；不能自动选择 BONUS |
| 规则 | 无 `hr.overtime.hours.limit`，无调班休息规则；现有 `hr.leave.quota.limit=5/WARN` 与本项不同 | 新规则先确认，不能借用请假额度阈值 |
| 流程 | definition_id=`wf_overtime_request`，实际 process_key=`overtime_request`；无调班流程 | 不把 definition_id 当 process_key；加班流程模型须核对后接线，调班需新定义 |
| 日期 | 2026 年启用日期明细：HOLIDAY/1 共 14，REST/0 共 10，WORKDAY/0 共 7 | 类型判定读取日历；这些明细数量不等于法定假期认证或生产完整性证明 |
| 台账 | 未查到 COMPENSATORY 记录 | D 的手工台账能力已铺好，H 自动转入尚不存在 |

### 1.4 必须报告、不得顺手修的冲突

已向主代理说明表数/模型冲突和旧加班通用状态旁路。另需确认：现调休种子标记未启用；没有类型倍率主数据；旧全局阈值与 D 实际班次阈值不同；`hr_time_request` 的真实种子类型为 LEAVE/OVERTIME/SUPPLEMENT，D 考勤另有 BUSINESS_TRIP 读取分支，不能删掉此分支来“对齐字典”。

“地基已就绪”应解读为已有日历、台账、字段、工资消费和可靠审批基础；不等于已实现加班工资规则、调班算法或完整独立加班链路。本稿不修前批缺陷，也不把这些缺口隐藏成默认值。

集成审阅补充：`SelfApprovalPolicy` 不提供可靠的“排除本人及互换对象”能力；D 补正 `HrPayrollCorrectionService.java:65` 把 diffAmount 放进流程变量，`:67`、`:91`、`:101` 将金额载荷写入审计，H 金额链路不能直接照搬。核价及关联补正必须采用 §3.5 的白名单日志/审计，并复用主稿已安排的请求切面与参数绑定异常共用修正。以上只报告和设计，共享实现由集成人统一维护。

## 2. 第二步：完整 DDL 待确认

所有新表 BIGINT 自增从 100 起，tenant_id 必填且由服务器上下文赋值，不接受客户端指定；无物理外键。新表配置/申请有逻辑删除和乐观锁，申请仅草稿可删除，提交后必须保留。数量使用现有 DECIMAL(8,2)，倍率按原 PRD DECIMAL(4,2)，金额计算沿 D 已批准的 DECIMAL(18,2)，敏感工资落库沿现有加密字符串模式。NULL 表示尚未核定，不代表 0 或无限制。

仅在 Q1 选择 A 时采用 §2.1—§2.4。SQL 中 CHECK 在当前 MySQL 8.0.25 可用；服务端仍做同样校验并返回明确业务错误，不能只依赖数据库异常。

### 2.1 加班类型主数据，新增第 1 表

这是原 PRD 明确要求的类型主数据表。`compensatory_leave_type_id` 为补充字段，用于明确调休转入的目标假种，避免靠名称或固定 id=102 匹配。按日类型一条规则，修改后历史申请继续用提交快照；不支持未经设计的员工分类多套倍率。

```sql
CREATE TABLE hr_overtime_type (
  type_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '加班类型主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  type_code VARCHAR(50) NOT NULL COMMENT '类型编码',
  type_name VARCHAR(100) NOT NULL COMMENT '类型名称',
  applicable_day_type VARCHAR(20) NOT NULL COMMENT '适用加班日类型(WORKDAY/REST_DAY/HOLIDAY)',
  rate_multiplier DECIMAL(4,2) DEFAULT NULL COMMENT '加班费倍率，NULL表示未核定',
  salary_component_id BIGINT(20) DEFAULT NULL COMMENT '加班费对应薪资项目ID',
  compensatory_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许转调休(0=否,1=是)',
  compensatory_ratio DECIMAL(4,2) DEFAULT NULL COMMENT '每小时加班转入的调休小时比例，NULL表示未核定',
  compensatory_leave_type_id BIGINT(20) DEFAULT NULL COMMENT '调休转入目标假种ID，首期须为HOUR',
  max_hours_per_month DECIMAL(8,2) DEFAULT NULL COMMENT '自然月加班小时上限，NULL表示未核定',
  max_hours_per_day DECIMAL(8,2) DEFAULT NULL COMMENT '自然日加班小时上限，NULL表示未核定',
  need_approval_flag TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否需要审批，首期仅允许1',
  status TINYINT(1) NOT NULL DEFAULT 0 COMMENT '启用状态(0=停用待核定,1=启用)',
  remark VARCHAR(500) DEFAULT NULL COMMENT '规则核定说明',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删除,1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (type_id),
  UNIQUE KEY uk_hr_ot_type_code (tenant_id, type_code),
  UNIQUE KEY uk_hr_ot_type_day (tenant_id, applicable_day_type),
  KEY idx_hr_ot_type_component (tenant_id, salary_component_id),
  KEY idx_hr_ot_type_leave (tenant_id, compensatory_leave_type_id),
  CONSTRAINT ck_hr_ot_type_day CHECK (applicable_day_type IN ('WORKDAY','REST_DAY','HOLIDAY')),
  CONSTRAINT ck_hr_ot_type_rate CHECK (rate_multiplier IS NULL OR rate_multiplier > 0),
  CONSTRAINT ck_hr_ot_type_ratio CHECK (compensatory_ratio IS NULL OR compensatory_ratio > 0),
  CONSTRAINT ck_hr_ot_type_limits CHECK ((max_hours_per_day IS NULL OR max_hours_per_day > 0) AND (max_hours_per_month IS NULL OR max_hours_per_month > 0)),
  CONSTRAINT ck_hr_ot_type_flags CHECK (compensatory_flag IN (0,1) AND need_approval_flag = 1 AND status IN (0,1) AND deleted IN (0,1))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR加班类型及核定规则';
```

首期仅允许审批型类型，未提供自动审批规则，不默认实现 `need_approval_flag=0`。启用校验：日/月上限已核定；PAY 必须有正倍率和启用的 VARIABLE、taxable=1 薪资项；允许调休时必须有正比例、启用且 `compensatory_flag=1`、`need_quota=1`、`unit=HOUR` 的目标假种。缺少任一项拒绝启用。编辑受独立配置服务检查，不能直接用通用 CRUD 修改被快照引用的语义。

### 2.2 独立加班申请，新增第 2 表

一张申请只覆盖一个自然日的半开时段 `[start_time,end_time)`；结束可以恰为次日零点。跨自然日先按日历拆分申请，防止一张单误用同一个倍率。`attendance_date` 是 D 班次归属日，可以与自然加班日不同。分钟为权威计量，hours 为服务端同步写入的两位小数展示值，金额不能用已舍入的展示小时反算。

```sql
CREATE TABLE hr_overtime_request (
  request_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '加班申请主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  request_no VARCHAR(60) NOT NULL COMMENT '服务端生成的加班申请单号',
  employee_id BIGINT(20) NOT NULL COMMENT '申请员工ID',
  dept_id BIGINT(20) NOT NULL COMMENT '申请时部门ID快照',
  work_date DATE NOT NULL COMMENT '加班自然日期，用于倍率及日月上限',
  attendance_date DATE DEFAULT NULL COMMENT 'D考勤归属日，跨夜按班次开始日',
  shift_id BIGINT(20) DEFAULT NULL COMMENT '核算依据班次ID',
  rule_id BIGINT(20) DEFAULT NULL COMMENT '核算依据考勤规则ID',
  calendar_id BIGINT(20) DEFAULT NULL COMMENT '核算依据日历ID',
  date_type VARCHAR(20) DEFAULT NULL COMMENT '日历原始日期类型(WORKDAY/REST/HOLIDAY)',
  triple_pay_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '日历三倍工资日标记快照',
  start_time DATETIME NOT NULL COMMENT '申请开始时间，业务时区Asia/Shanghai',
  end_time DATETIME NOT NULL COMMENT '申请结束时间，不包含此时点',
  requested_minutes INT NOT NULL COMMENT '申请时段分钟数，由服务端计算',
  actual_minutes INT DEFAULT NULL COMMENT '扣休息及阈值后的实际可核定加班分钟',
  actual_hours DECIMAL(8,2) DEFAULT NULL COMMENT '实际加班小时展示值，由实际分钟除60舍入',
  approved_minutes INT DEFAULT NULL COMMENT 'HR核定加班分钟',
  approved_hours DECIMAL(8,2) DEFAULT NULL COMMENT '核定加班小时展示值，由核定分钟除60舍入',
  overtime_type_id BIGINT(20) NOT NULL COMMENT '关联加班类型主键ID',
  settle_mode VARCHAR(20) NOT NULL COMMENT '结算方式(PAY加班费/COMPENSATORY调休)',
  rate_multiplier DECIMAL(4,2) DEFAULT NULL COMMENT '提交时加班费倍率快照',
  compensatory_ratio DECIMAL(4,2) DEFAULT NULL COMMENT '提交时调休比例快照',
  salary_component_id BIGINT(20) DEFAULT NULL COMMENT '加班薪资项目ID快照',
  leave_type_id BIGINT(20) DEFAULT NULL COMMENT '调休目标假种ID快照',
  leave_period_id BIGINT(20) DEFAULT NULL COMMENT '调休转入的假期周期ID',
  compensatory_quantity DECIMAL(8,2) DEFAULT NULL COMMENT '实际转入调休小时，按原周期累计差额计算，可为0',
  payroll_period_id BIGINT(20) DEFAULT NULL COMMENT '财务核定的目标工资周期ID',
  currency VARCHAR(10) NOT NULL DEFAULT 'CNY' COMMENT '币种，首期沿现有CNY工资链路',
  hourly_rate_cipher VARCHAR(255) DEFAULT NULL COMMENT '已核定基础时薪密文，解密后按DECIMAL(18,2)计算',
  settlement_amount_cipher VARCHAR(255) DEFAULT NULL COMMENT '加班费金额密文，解密后按DECIMAL(18,2)计算',
  reason VARCHAR(800) NOT NULL DEFAULT '' COMMENT '申请事由',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '申请状态(DRAFT/SUBMITTED/PENDING/APPROVING/APPROVED/REJECTED/CANCELLED)',
  instance_id VARCHAR(64) DEFAULT NULL COMMENT '当前正式工作流实例ID',
  reviewed_by BIGINT(20) DEFAULT NULL COMMENT '工时核定用户ID',
  reviewed_time DATETIME DEFAULT NULL COMMENT '工时核定时间',
  review_note VARCHAR(500) DEFAULT NULL COMMENT '工时核定依据',
  priced_by BIGINT(20) DEFAULT NULL COMMENT '财务核价用户ID',
  priced_time DATETIME DEFAULT NULL COMMENT '财务核价时间',
  price_note VARCHAR(500) DEFAULT NULL COMMENT '核价依据说明，不存口令或银行信息',
  calculation_snapshot JSON DEFAULT NULL COMMENT '服务端生成的打卡、区间、休息、阈值及版本依据，不存工资明文',
  policy_snapshot JSON DEFAULT NULL COMMENT '服务端生成的类型、日历及规则效果快照，不存工资明文',
  settlement_status VARCHAR(20) NOT NULL DEFAULT 'NOT_READY' COMMENT '结算状态(NOT_READY/PENDING/SETTLED/FAILED/NEEDS_RESOLUTION/CORRECTION_PENDING/REJECTED)',
  settled_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否完成结算，含累计差额为0的调休结算',
  settle_time DATETIME DEFAULT NULL COMMENT '结算成功时间',
  comp_change_id BIGINT(20) DEFAULT NULL COMMENT '生成的薪资变动ID，PAY使用',
  leave_ledger_id BIGINT(20) DEFAULT NULL COMMENT '生成的假期台账ID，COMPENSATORY使用',
  payroll_correction_id BIGINT(20) DEFAULT NULL COMMENT '关账后明确发起的D工资补正ID，与原薪资变动互斥',
  settlement_resolution JSON DEFAULT NULL COMMENT '显式结案或补正的原目标及新目标、原因、经办人和时间，不存金额或密文',
  last_error_code VARCHAR(64) DEFAULT NULL COMMENT '最近结算失败业务码',
  last_error_message VARCHAR(500) DEFAULT NULL COMMENT '脱敏后的最近结算失败说明',
  idempotency_key VARCHAR(64) NOT NULL COMMENT '创建请求幂等键',
  request_digest CHAR(64) NOT NULL COMMENT '初次创建有效载荷SHA256摘要',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志，仅草稿允许删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (request_id),
  UNIQUE KEY uk_hr_ot_request_no (tenant_id, request_no),
  UNIQUE KEY uk_hr_ot_request_idem (tenant_id, employee_id, idempotency_key),
  UNIQUE KEY uk_hr_ot_request_change (tenant_id, comp_change_id),
  UNIQUE KEY uk_hr_ot_request_ledger (tenant_id, leave_ledger_id),
  UNIQUE KEY uk_hr_ot_request_correction (tenant_id, payroll_correction_id),
  KEY idx_hr_ot_request_emp_date (tenant_id, employee_id, work_date, status),
  KEY idx_hr_ot_request_att_date (tenant_id, employee_id, attendance_date),
  KEY idx_hr_ot_request_dept (tenant_id, dept_id, status, work_date),
  KEY idx_hr_ot_request_period (tenant_id, payroll_period_id, settlement_status),
  KEY idx_hr_ot_request_settle (tenant_id, settlement_status, update_time),
  KEY idx_hr_ot_request_leave_sum (tenant_id, employee_id, leave_type_id, leave_period_id, settle_mode, settlement_status),
  CONSTRAINT ck_hr_ot_request_time CHECK (end_time > start_time AND requested_minutes > 0),
  CONSTRAINT ck_hr_ot_request_minutes CHECK ((actual_minutes IS NULL OR actual_minutes >= 0) AND (approved_minutes IS NULL OR (approved_minutes > 0 AND actual_minutes IS NOT NULL AND approved_minutes <= actual_minutes))),
  CONSTRAINT ck_hr_ot_request_mode CHECK (settle_mode IN ('PAY','COMPENSATORY')),
  CONSTRAINT ck_hr_ot_request_status CHECK (status IN ('DRAFT','SUBMITTED','PENDING','APPROVING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT ck_hr_ot_request_settle CHECK (settlement_status IN ('NOT_READY','PENDING','SETTLED','FAILED','NEEDS_RESOLUTION','CORRECTION_PENDING','REJECTED') AND settled_flag IN (0,1)),
  CONSTRAINT ck_hr_ot_request_result CHECK ((settled_flag = 0 AND settlement_status <> 'SETTLED' AND settle_time IS NULL) OR (settled_flag = 1 AND settlement_status = 'SETTLED' AND settle_time IS NOT NULL)),
  CONSTRAINT ck_hr_ot_request_source CHECK ((comp_change_id IS NULL OR leave_ledger_id IS NULL) AND (comp_change_id IS NULL OR payroll_correction_id IS NULL) AND (leave_ledger_id IS NULL OR payroll_correction_id IS NULL)),
  CONSTRAINT ck_hr_ot_request_quantity CHECK (compensatory_quantity IS NULL OR compensatory_quantity >= 0),
  CONSTRAINT ck_hr_ot_request_correction CHECK (settlement_status <> 'CORRECTION_PENDING' OR (settle_mode = 'PAY' AND payroll_correction_id IS NOT NULL)),
  CONSTRAINT ck_hr_ot_request_flags CHECK (triple_pay_flag IN (0,1) AND deleted IN (0,1))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR独立加班申请及结算结果';
```

`hourly_rate_cipher` / `settlement_amount_cipher` 复用现有 `@EncryptField`、字符串与 BigDecimal 转换方法；金额精度是解密后的计算契约，数据库不把密文列改成 DECIMAL。客户端不能提交任何计算、归属、审批、核价人或结算结果字段。数量、小时一致性及单日边界由服务校验，所有写入必须经过该服务。

关账处置只补充本张计划新表内的 `payroll_correction_id`、`settlement_resolution`，复用现有台账 ID；不新增结算表、不改 `hr_payroll_correction` 或工资单结构。JSON 由服务端生成，其字段契约在 §3.4、§4.5 定义，不能用任意 JSON 接受客户端指令。正常结算、额度补入、工资补正和结案共用同一申请行的状态/版本锁；数据库唯一关联及来源键约束防止两条路径各结算一次。

### 2.3 调班申请，新增第 3 表

`from_date=to_date` 是 Q3 的首期单日提案约束，不将原 PRD 的日期列擅自解释成任意日期范围。SINGLE 为本人当日班次替换；SWAP 为本人和对方在同一考勤日交换已解析的班次及规则。快照记录所有受影响记录/版本、前后相邻班次、休息配置及对方确认内容；不是只存两个 shift_id。

```sql
CREATE TABLE hr_shift_request (
  request_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '调班申请主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  request_no VARCHAR(60) NOT NULL COMMENT '服务端生成的调班单号',
  employee_id BIGINT(20) NOT NULL COMMENT '申请员工ID',
  dept_id BIGINT(20) NOT NULL COMMENT '申请时部门ID快照',
  request_mode VARCHAR(20) NOT NULL DEFAULT 'SINGLE' COMMENT '调班方式(SINGLE本人换班/SWAP双方互换)',
  from_shift_id BIGINT(20) NOT NULL COMMENT '申请人原有效班次ID',
  to_shift_id BIGINT(20) NOT NULL COMMENT '申请人目标班次ID，互换时为对方原班次',
  from_rule_id BIGINT(20) DEFAULT NULL COMMENT '申请人原考勤规则ID快照',
  to_rule_id BIGINT(20) DEFAULT NULL COMMENT '目标班次配套规则ID快照',
  from_date DATE NOT NULL COMMENT '原考勤日期，首期单日',
  to_date DATE NOT NULL COMMENT '目标考勤日期，首期等于原日期',
  swap_employee_id BIGINT(20) DEFAULT NULL COMMENT '互换员工ID，本人换班为空',
  peer_acceptance_status VARCHAR(20) NOT NULL DEFAULT 'NONE' COMMENT '对方同意状态(NONE/PENDING/ACCEPTED/DECLINED)',
  peer_responded_by BIGINT(20) DEFAULT NULL COMMENT '对方本人回应用户ID',
  peer_responded_time DATETIME DEFAULT NULL COMMENT '对方回应时间',
  peer_response_note VARCHAR(500) DEFAULT NULL COMMENT '对方回应说明',
  reason VARCHAR(800) NOT NULL DEFAULT '' COMMENT '调班事由',
  approver_id BIGINT(20) DEFAULT NULL COMMENT '最终审批用户ID，由可信审批结果记录',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '申请状态(DRAFT/WAITING_ACCEPTANCE/PENDING/APPROVING/APPROVED/REJECTED/CANCELLED)',
  instance_id VARCHAR(64) DEFAULT NULL COMMENT '正式工作流实例ID',
  minimum_rest_minutes INT DEFAULT NULL COMMENT 'HR核定的相邻班次最短休息分钟快照',
  schedule_snapshot JSON DEFAULT NULL COMMENT '两方原排班、规则、相邻班次与同意内容的服务端快照',
  application_status VARCHAR(20) NOT NULL DEFAULT 'NOT_READY' COMMENT '排班应用状态(NOT_READY/PENDING/APPLIED/FAILED)',
  applied_time DATETIME DEFAULT NULL COMMENT '全部受影响排班成功应用时间',
  last_error_code VARCHAR(64) DEFAULT NULL COMMENT '最近排班应用失败业务码',
  last_error_message VARCHAR(500) DEFAULT NULL COMMENT '脱敏后的排班应用失败说明',
  idempotency_key VARCHAR(64) NOT NULL COMMENT '创建请求幂等键',
  request_digest CHAR(64) NOT NULL COMMENT '初次创建有效载荷SHA256摘要',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志，仅草稿允许删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (request_id),
  UNIQUE KEY uk_hr_shift_request_no (tenant_id, request_no),
  UNIQUE KEY uk_hr_shift_request_idem (tenant_id, employee_id, idempotency_key),
  KEY idx_hr_shift_request_emp_date (tenant_id, employee_id, from_date, status),
  KEY idx_hr_shift_request_peer (tenant_id, swap_employee_id, from_date, peer_acceptance_status),
  KEY idx_hr_shift_request_dept (tenant_id, dept_id, status),
  KEY idx_hr_shift_request_apply (tenant_id, application_status, update_time),
  CONSTRAINT ck_hr_shift_request_date CHECK (from_date = to_date),
  CONSTRAINT ck_hr_shift_request_shifts CHECK (from_shift_id <> to_shift_id),
  CONSTRAINT ck_hr_shift_request_mode CHECK ((request_mode = 'SINGLE' AND swap_employee_id IS NULL) OR (request_mode = 'SWAP' AND swap_employee_id IS NOT NULL AND swap_employee_id <> employee_id)),
  CONSTRAINT ck_hr_shift_request_peer CHECK (peer_acceptance_status IN ('NONE','PENDING','ACCEPTED','DECLINED')),
  CONSTRAINT ck_hr_shift_request_status CHECK (status IN ('DRAFT','WAITING_ACCEPTANCE','PENDING','APPROVING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT ck_hr_shift_request_apply CHECK (application_status IN ('NOT_READY','PENDING','APPLIED','FAILED')),
  CONSTRAINT ck_hr_shift_request_rest CHECK (minimum_rest_minutes IS NULL OR minimum_rest_minutes >= 0),
  CONSTRAINT ck_hr_shift_request_deleted CHECK (deleted IN (0,1))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR调班申请及双方同意记录';
```

### 2.4 现有 5 表的完整 DDL 变更片段，方案 A

以下只描述确认后应合入 DB03 原建表定义的结构差异，不生成或执行迁移脚本。新列是本次补设计的明确增量；不重复加 A/D 已有的 `compensatory_flag`、阈值或加班分钟列。

```sql
ALTER TABLE hr_time_request
  MODIFY COLUMN request_type VARCHAR(30) NOT NULL COMMENT '既有假勤类型，加班OVERTIME改用独立加班申请',
  ADD CONSTRAINT ck_hr_time_request_no_overtime CHECK (request_type <> 'OVERTIME');

ALTER TABLE hr_attendance_checkin
  MODIFY COLUMN overtime_type_id BIGINT(20) DEFAULT NULL COMMENT 'hr_overtime_type类型ID，仅服务端在新打卡时赋值',
  ADD COLUMN overtime_request_id BIGINT(20) DEFAULT NULL COMMENT '新打卡关联的加班申请ID，事后申请不回写原始卡',
  ADD KEY idx_hr_checkin_ot_request (tenant_id, overtime_request_id, check_time);

ALTER TABLE hr_schedule_assignment
  ADD COLUMN source_shift_request_id BIGINT(20) DEFAULT NULL COMMENT '生成该员工单日排班的调班申请ID，手工排班为空',
  ADD UNIQUE KEY uk_hr_schedule_shift_request (tenant_id, source_shift_request_id, target_type, target_id, schedule_date),
  ADD KEY idx_hr_schedule_emp_day (tenant_id, target_type, target_id, schedule_date, status);

ALTER TABLE hr_comp_change
  MODIFY COLUMN change_type VARCHAR(30) NOT NULL COMMENT '薪资变动类型(PROMOTION/PERFORMANCE/ADJUSTMENT/BONUS/OVERTIME/REFERRAL_BONUS/LEAVE_ENCASHMENT)',
  ADD COLUMN salary_component_id BIGINT(20) DEFAULT NULL COMMENT '来源业务确定的薪资项目ID，既有变动可为空',
  ADD COLUMN payroll_period_id BIGINT(20) DEFAULT NULL COMMENT '来源业务指定的目标工资周期ID，既有变动沿生效日期',
  ADD COLUMN source_biz_type VARCHAR(50) DEFAULT NULL COMMENT '来源业务类型，H加班为HR_OVERTIME',
  ADD COLUMN source_biz_id VARCHAR(64) DEFAULT NULL COMMENT '来源业务申请ID',
  ADD UNIQUE KEY uk_hr_comp_change_source (tenant_id, source_biz_type, source_biz_id),
  ADD KEY idx_hr_comp_change_payroll (tenant_id, employee_id, payroll_period_id, status),
  ADD CONSTRAINT ck_hr_comp_change_source CHECK ((source_biz_type IS NULL AND source_biz_id IS NULL) OR (source_biz_type IS NOT NULL AND source_biz_id IS NOT NULL));

ALTER TABLE hr_leave_ledger
  ADD COLUMN source_event_key VARCHAR(128) DEFAULT NULL COMMENT '自动业务入账幂等键，既有台账为空',
  ADD UNIQUE KEY uk_hr_leave_ledger_event (tenant_id, source_event_key),
  ADD KEY idx_hr_leave_ledger_tenant_source (tenant_id, source_biz_type, source_biz_id);
```

最小化复核后的 5 张改表及必要性：

| 现有表 | 必要变化 | 不采用更大变化的理由 |
| --- | --- | --- |
| hr_time_request | 禁止 OVERTIME 的数据库约束 | 与服务入口双重关闭旧通用状态旁路，不删除表或其他假勤字段 |
| hr_attendance_checkin | 原类型字段改为真实关联；可选申请 ID 与来源检索索引 | 新录入加班卡需要可追溯来源；历史卡不回写，不额外复制卡明细或照片 |
| hr_schedule_assignment | 来源申请 ID、每个申请/员工/日唯一键 | 双人应用可追溯、重投不重复造排班，不加第三张交换明细表 |
| hr_comp_change | 来源、目标周期、薪资项目及来源唯一键 | 金额已有密文列；要保证正确项目/周期入薪、阻止伪造与重复结算，不新增工资流水表 |
| hr_leave_ledger | 可空业务事件幂等键及 tenant/source 查询索引 | 不改变既有 D 手工/冻结/结转的唯一性，H 自动入账有数据库去重依据，不新建调休台账 |

初稿还拟给日/月考勤各加核定汇总列，复核后删除：核定分钟直接从 `hr_overtime_request` 按员工、归属日、APPROVED 汇总；月查询累加整数分钟后除 60，作为 VO 的 `approvedOvertimeMinutes/approvedOvertimeHours` 返回。已有申请索引足够，避免两份物化值同步、结算失败回滚和封账改写。此项使 **改表由 7 减为 5**，新表仍为 3；不是少实现核定展示。

既有表保留原审计列和版本；原始打卡仍不增加 update/deleted，假期台账仍不增加 update/deleted/version、不删改旧账。`hr_attendance_record`、`hr_attendance_monthly`、`hr_shift`、`hr_leave_type`、工资单、工资批次不改结构：使用已铺字段及现有工资 components 快照。这些复用项不计入 5 张改表。字典、规则、消息、流程、菜单、角色授权属于 06 数据变更，不计作结构改表。

### 2.5 Q1 选择 B 时的完整替代片段

只新建 §2.1 的类型表和 §2.3 的调班表；不建 §2.2 的独立加班申请表。§2.4 中除 `hr_time_request` 外的 4 个 ALTER 保持，打卡 `overtime_request_id` 指向受 `request_type='OVERTIME'` 限定的 `hr_time_request.id`，COMMENT 同步改为“时间申请表中的加班申请ID”。§2.4 的旧表禁止加班 CHECK 不执行，改为以下完整片段：

```sql
ALTER TABLE hr_time_request
  MODIFY COLUMN request_type VARCHAR(30) NOT NULL COMMENT 'LEAVE/OVERTIME/SUPPLEMENT及既有其他假勤类型',
  MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '假勤申请状态，加班使用DRAFT/SUBMITTED/PENDING/APPROVING/APPROVED/REJECTED/CANCELLED',
  ADD COLUMN dept_id BIGINT(20) DEFAULT NULL COMMENT '加班申请时部门ID快照',
  ADD COLUMN work_date DATE DEFAULT NULL COMMENT '加班自然日期，用于倍率及日月上限',
  ADD COLUMN attendance_date DATE DEFAULT NULL COMMENT '加班对应D考勤归属日',
  ADD COLUMN shift_id BIGINT(20) DEFAULT NULL COMMENT '加班核算班次ID',
  ADD COLUMN rule_id BIGINT(20) DEFAULT NULL COMMENT '加班核算考勤规则ID',
  ADD COLUMN calendar_id BIGINT(20) DEFAULT NULL COMMENT '加班核算日历ID',
  ADD COLUMN date_type VARCHAR(20) DEFAULT NULL COMMENT '加班日历原始日期类型(WORKDAY/REST/HOLIDAY)',
  ADD COLUMN triple_pay_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '加班三倍工资日快照',
  ADD COLUMN requested_minutes INT DEFAULT NULL COMMENT '加班申请分钟，非加班为空',
  ADD COLUMN actual_minutes INT DEFAULT NULL COMMENT '实际可核定加班分钟',
  ADD COLUMN actual_hours DECIMAL(8,2) DEFAULT NULL COMMENT '实际加班小时展示值',
  ADD COLUMN approved_minutes INT DEFAULT NULL COMMENT 'HR核定加班分钟',
  ADD COLUMN approved_hours DECIMAL(8,2) DEFAULT NULL COMMENT '核定加班小时展示值',
  ADD COLUMN overtime_type_id BIGINT(20) DEFAULT NULL COMMENT '加班类型主键ID',
  ADD COLUMN settle_mode VARCHAR(20) DEFAULT NULL COMMENT '加班结算方式(PAY/COMPENSATORY)',
  ADD COLUMN rate_multiplier DECIMAL(4,2) DEFAULT NULL COMMENT '加班费倍率快照',
  ADD COLUMN compensatory_ratio DECIMAL(4,2) DEFAULT NULL COMMENT '转调休比例快照',
  ADD COLUMN salary_component_id BIGINT(20) DEFAULT NULL COMMENT '加班薪资项目ID',
  ADD COLUMN leave_period_id BIGINT(20) DEFAULT NULL COMMENT '调休转入假期周期ID',
  ADD COLUMN compensatory_quantity DECIMAL(8,2) DEFAULT NULL COMMENT '实际转入调休小时，按原周期累计差额计算，可为0',
  ADD COLUMN payroll_period_id BIGINT(20) DEFAULT NULL COMMENT '财务核定目标工资周期ID',
  ADD COLUMN currency VARCHAR(10) DEFAULT NULL COMMENT '加班费币种，首期CNY',
  ADD COLUMN hourly_rate_cipher VARCHAR(255) DEFAULT NULL COMMENT '基础时薪密文，解密后精度DECIMAL(18,2)',
  ADD COLUMN settlement_amount_cipher VARCHAR(255) DEFAULT NULL COMMENT '加班费密文，解密后精度DECIMAL(18,2)',
  ADD COLUMN reviewed_by BIGINT(20) DEFAULT NULL COMMENT '加班工时核定用户ID',
  ADD COLUMN reviewed_time DATETIME DEFAULT NULL COMMENT '加班工时核定时间',
  ADD COLUMN review_note VARCHAR(500) DEFAULT NULL COMMENT '加班工时核定依据',
  ADD COLUMN priced_by BIGINT(20) DEFAULT NULL COMMENT '加班核价用户ID',
  ADD COLUMN priced_time DATETIME DEFAULT NULL COMMENT '加班核价时间',
  ADD COLUMN price_note VARCHAR(500) DEFAULT NULL COMMENT '核价依据说明',
  ADD COLUMN calculation_snapshot JSON DEFAULT NULL COMMENT '加班工时计算依据，不存工资明文',
  ADD COLUMN policy_snapshot JSON DEFAULT NULL COMMENT '加班类型日历规则快照，不存工资明文',
  ADD COLUMN settlement_status VARCHAR(20) NOT NULL DEFAULT 'NOT_READY' COMMENT '加班结算状态(NOT_READY/PENDING/SETTLED/FAILED/NEEDS_RESOLUTION/CORRECTION_PENDING/REJECTED)',
  ADD COLUMN settled_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '加班是否成功结算',
  ADD COLUMN settle_time DATETIME DEFAULT NULL COMMENT '加班结算成功时间',
  ADD COLUMN comp_change_id BIGINT(20) DEFAULT NULL COMMENT '加班生成薪资变动ID',
  ADD COLUMN leave_ledger_id BIGINT(20) DEFAULT NULL COMMENT '加班生成假期台账ID',
  ADD COLUMN payroll_correction_id BIGINT(20) DEFAULT NULL COMMENT '加班关账后明确发起的D工资补正ID',
  ADD COLUMN settlement_resolution JSON DEFAULT NULL COMMENT '加班显式结案或补正的原新目标原因经办人时间，不存金额或密文',
  ADD COLUMN last_error_code VARCHAR(64) DEFAULT NULL COMMENT '加班结算最近失败业务码',
  ADD COLUMN last_error_message VARCHAR(500) DEFAULT NULL COMMENT '加班结算最近失败脱敏说明',
  ADD COLUMN idempotency_key VARCHAR(64) DEFAULT NULL COMMENT '加班创建幂等键，非加班为空',
  ADD COLUMN request_digest CHAR(64) DEFAULT NULL COMMENT '加班创建有效载荷SHA256摘要',
  ADD UNIQUE KEY uk_hr_time_ot_idem (tenant_id, employee_id, idempotency_key),
  ADD UNIQUE KEY uk_hr_time_ot_change (tenant_id, comp_change_id),
  ADD UNIQUE KEY uk_hr_time_ot_ledger (tenant_id, leave_ledger_id),
  ADD UNIQUE KEY uk_hr_time_ot_correction (tenant_id, payroll_correction_id),
  ADD KEY idx_hr_time_ot_emp_date (tenant_id, employee_id, request_type, work_date, status),
  ADD KEY idx_hr_time_ot_att_date (tenant_id, employee_id, request_type, attendance_date),
  ADD KEY idx_hr_time_ot_period (tenant_id, payroll_period_id, settlement_status),
  ADD KEY idx_hr_time_ot_leave_sum (tenant_id, employee_id, leave_type_id, leave_period_id, settle_mode, settlement_status),
  ADD CONSTRAINT ck_hr_time_ot_required CHECK (request_type <> 'OVERTIME' OR (dept_id IS NOT NULL AND work_date IS NOT NULL AND overtime_type_id IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time AND requested_minutes IS NOT NULL AND requested_minutes > 0 AND settle_mode IS NOT NULL AND settle_mode IN ('PAY','COMPENSATORY') AND idempotency_key IS NOT NULL AND request_digest IS NOT NULL)),
  ADD CONSTRAINT ck_hr_time_ot_minutes CHECK (request_type <> 'OVERTIME' OR ((actual_minutes IS NULL OR actual_minutes >= 0) AND (approved_minutes IS NULL OR (approved_minutes > 0 AND actual_minutes IS NOT NULL AND approved_minutes <= actual_minutes)))),
  ADD CONSTRAINT ck_hr_time_ot_status CHECK (request_type <> 'OVERTIME' OR status IN ('DRAFT','SUBMITTED','PENDING','APPROVING','APPROVED','REJECTED','CANCELLED')),
  ADD CONSTRAINT ck_hr_time_ot_result CHECK ((settled_flag = 0 AND settlement_status <> 'SETTLED' AND settle_time IS NULL) OR (settled_flag = 1 AND settlement_status = 'SETTLED' AND settle_time IS NOT NULL)),
  ADD CONSTRAINT ck_hr_time_ot_settle CHECK (settlement_status IN ('NOT_READY','PENDING','SETTLED','FAILED','NEEDS_RESOLUTION','CORRECTION_PENDING','REJECTED') AND settled_flag IN (0,1)),
  ADD CONSTRAINT ck_hr_time_ot_source CHECK ((comp_change_id IS NULL OR leave_ledger_id IS NULL) AND (comp_change_id IS NULL OR payroll_correction_id IS NULL) AND (leave_ledger_id IS NULL OR payroll_correction_id IS NULL)),
  ADD CONSTRAINT ck_hr_time_ot_quantity CHECK (compensatory_quantity IS NULL OR compensatory_quantity >= 0),
  ADD CONSTRAINT ck_hr_time_ot_correction CHECK (settlement_status <> 'CORRECTION_PENDING' OR (request_type = 'OVERTIME' AND settle_mode = 'PAY' AND payroll_correction_id IS NOT NULL));
```

B 复用旧 `id`、`employee_id`、`leave_type_id`、`start_time/end_time`、`reason`、审计列和 `process_instance_id VARCHAR(100)`；VO 映射为统一的 requestId/instanceId。`duration/unit` 对加班固定由服务端同步为核定前实际小时、核定后核定小时以及 HOUR，不允许客户端直接改。所有新增可空业务列对 LEAVE/SUPPLEMENT 保持空值，已有请假字段不变。

B 仍用独立加班服务与独立外部接口，不让通用 CRUD 审批加班。旧 `time-requests` 的加班写入与动作端点拒绝并提示新业务入口；新服务在内部写同一表。回调必须先按 `HR_OVERTIME` 路由到加班服务，再判断实体，不能因为两类业务共用实体而套入请假锁和请假副作用。B 不是数据迁移方案，项目未上线，未来只修改原建表和种子脚本。

## 3. 第三步：接口、DTO/VO 与权限

### 3.1 通用接口约束

以下列出浏览器经网关访问的完整路径；HR Controller 内仍按现有约定使用 `/attendance` 前缀，网关去掉 `/hr`。Controller 追加到 `HrAttendanceResourceControllers.java` 的对应独立类，不把事务逻辑塞进 Controller 或 `HrTypedCrudService`。

所有写接口使用 `@SysLog`，敏感链路按 §3.5 关闭参数日志。两类申请的 POST 创建接口承诺同 Idempotency-Key 重放返回原单，因此仅标 `@RepeatSubmit.Disabled`，不同时加 `@RepeatSubmit`；现 RepeatSubmitAspect 默认 5 秒会在业务逻辑前拒绝重放。创建由数据库唯一键、载荷摘要、事务及行锁真正防重，保留现有网关/接口限流。其余仅承诺状态/版本冲突的写端保留 `@RepeatSubmit`，不能拿 5 秒防重代替业务幂等。高风险 Service 方法按启动扫描要求使用 `@Audit(highRisk=true)`。每个业务接口明确 `@SaCheckPermission`，不只加 `@SaCheckLogin`。新增 SQL 查询/条件更新/行锁放 XML，禁注解 SQL、拼 SQL、`.last()`/`.apply()`。不引入依赖。

创建请求必带 `Idempotency-Key`（1—64 个 ASCII 可见字符），服务端按 tenant+employee+key 唯一保存；同键同有效载荷返回原记录，同键不同载荷返回 409。所有修改/提交/回应/核定/撤回传 version；服务端同时检查租户、所有者/处理资格、当前状态和版本。版本冲突 409，输入错误 400，越权 403，未配置或状态冲突 409；依赖暂不可用 503。不可用结果不伪装成功，也不放宽校验为 WARN。

创建摘要以初次归一化 DTO 加本人/租户为准，文本 trim、时间格式固定，保存后不随编辑覆盖；重放只返回该单当前允许读取的状态，不回滚后续编辑。并发插入唯一键冲突时回读同一租户/员工的原单并比摘要；逻辑删除也保留唯一键，同键不复活草稿。对外传输 BIGINT ID 和金额/小时十进制值均使用字符串；后端解析为 Long/BigDecimal，前端不使用 Number 运算资金或长整型 ID。

返回 `R<VO>`、`R<PageResult<VO>>`、`R<Void>`。分页为 pageNum/pageSize，默认 1/10，新接口 pageSize 最大 100；排序字段白名单为 createTime/workDate/requestNo，不能传 SQL。后端 ID 为 Long，前端沿项目 ID 序列化配置适配，不转换为字典 code。日期为 yyyy-MM-dd，时间为无时区偏移的 yyyy-MM-dd'T'HH:mm:ss，业务时区固定 Asia/Shanghai；申请时分精度、秒必须为 00。页面不使用 UTC 截取日期决定加班归属。

### 3.2 加班接口

下表公共前缀为 `/hr/attendance/overtime-requests`，每个完整路径由前缀与后缀组成；“本人或管理”必须在服务中继续校验所属员工/授权数据范围，拥有菜单不等于能读任意 ID。

| HTTP | 后缀 | 输入 → 输出 | 权限码/附加条件 |
| --- | --- | --- | --- |
| GET | `/mine` | OvertimeQuery → PageResult<OvertimeListVO> | `hr:overtime:mine`，忽略 employeeId 筛选，固定当前员工 |
| GET | 空 | OvertimeQuery → PageResult<OvertimeListVO> | `hr:overtime:list`，按 HR 数据范围过滤 |
| GET | `/{id}` | id → OvertimeDetailVO | `hr:overtime:mine` 或 `hr:overtime:list`，逐单授权 |
| GET | `/options` | 无 → OvertimeOptionsVO | `hr:overtime:apply`，只返回可申请类型/结算方式，不返回他人薪资 |
| POST | `/preview` | OvertimeDraftDTO → OvertimePreviewVO | `hr:overtime:apply`，纯预览，不写单、不占上限、不写命中流水 |
| POST | 空 | OvertimeDraftDTO + Idempotency-Key → OvertimeDetailVO | `hr:overtime:apply`，固定本人，创建 DRAFT |
| PUT | `/{id}` | OvertimeDraftDTO+version → OvertimeDetailVO | `hr:overtime:apply`，本人 DRAFT |
| DELETE | `/{id}` | version → Void | `hr:overtime:apply`，仅本人 DRAFT 逻辑删除 |
| POST | `/{id}/submit` | VersionDTO → OvertimeDetailVO | `hr:overtime:apply`，本人、时段已结束且证据可核算 |
| POST | `/{id}/cancel` | ReasonVersionDTO → OvertimeDetailVO | `hr:overtime:cancel`，本人、仅审批前 |
| POST | `/{id}/review-hours` | OvertimeHoursReviewDTO → OvertimeDetailVO | `hr:overtime:verify`，HR 范围、非本人申请、SUBMITTED |
| POST | `/{id}/review-pay` | OvertimePayReviewDTO → OvertimeDetailVO | `hr:overtime:price`，财务范围、非本人申请、工时已核定 |
| POST | `/{id}/review-reject` | ReasonVersionDTO → OvertimeDetailVO | `hr:overtime:verify`，SUBMITTED，核定拒绝，不代替正式流程拒绝 |
| GET | `/{id}/settlement` | id → OvertimeSettlementVO | 本人 `hr:overtime:mine`；他人 PAY 须 `hr:overtime:finance`，他人 COMPENSATORY 须 `hr:overtime:verify`，均须在数据范围内；调休视图不返回薪资字段 |
| POST | `/{id}/settlement/retry` | ReasonVersionDTO → OvertimeSettlementVO | `hr:overtime:retry`，仅 APPROVED/FAILED 且错误可重试，按 PAY/调休再限制经办范围；保留原依据和目标周期 |
| POST | `/{id}/settlement/resolve` | OvertimeResolutionDTO → OvertimeSettlementVO | `hr:overtime:resolve`，仅 APPROVED/NEEDS_RESOLUTION、非本人；PAY_CORRECTION 还须已有 `hr:payroll:correct`，分支资格见 §4.5 |
| GET | `/export` | OvertimeQuery → 现有格式文件流 | `hr:overtime:export`，与管理列表同范围及字段裁剪 |
| GET | `/mine/export` | OvertimeQuery → 现有格式文件流 | `hr:overtime:mine`，固定本人，不借机取得管理导出权限 |

不增加 `/approve` 通用快捷接口。正式 APPROVED/REJECTED 只来自绑定工作流的可信终审事件。用户无通用工作流发起权限也可凭 `hr:overtime:apply` 提交本人业务申请，由受限内部链路发起审批。

结算详情 Controller 使用上述权限的 OR 守卫，服务层再按本人/结算方式选择唯一允许的字段视图；持 mine 不能读取他人，持 verify 不能读取他人 PAY 金额。重试/处置除对应动作权限外，PAY 还须 price、COMPENSATORY 还须 verify，并继续校验数据范围及非本人经办边界；不能把同时授予的 retry/resolve 当成跨报酬模式的授权。财务不获得调休核定权，HR 不为查看调休依据而被授予 finance 或 price。

### 3.3 加班类型与调班接口

类型前缀 `/hr/attendance/overtime-types`：GET 空、GET `/{id}` 使用 `hr:overtime-type:list`；POST 空接 OvertimeTypeDTO 使用 `hr:overtime-type:add`；PUT `/{id}` 接 OvertimeTypeDTO+version 使用 `hr:overtime-type:edit`；POST `/{id}/status` 接 `{version,status,reason}` 使用同一 edit 权限，停用方法有高风险审计。返回 `R<OvertimeTypeVO>` 或 `R<List<OvertimeTypeVO>>`，不提供物理删除。

调班公共前缀 `/hr/attendance/shift-requests`：

| HTTP | 后缀 | 输入 → 输出 | 权限码/附加条件 |
| --- | --- | --- | --- |
| GET | `/mine` | ShiftRequestQuery → PageResult<ShiftRequestVO> | `hr:shift-request:mine`，固定本人 |
| GET | `/invitations` | ShiftRequestQuery → PageResult<ShiftInvitationVO> | `hr:shift-request:respond`，固定本人为 swap_employee_id |
| GET | 空 | ShiftRequestQuery → PageResult<ShiftRequestVO> | `hr:shift-request:list`，按管理数据范围 |
| GET | `/{id}` | id → ShiftRequestDetailVO | `hr:shift-request:mine` 或 `hr:shift-request:list`，校验申请人本人或管理范围；仅被邀请身份不能读取完整详情 |
| GET | `/invitations/{id}` | id → ShiftInvitationVO | `hr:shift-request:respond` 且本人为 swap_employee_id，只返回固定同意摘要 |
| GET | `/options` | `{attendanceDate}` → ShiftOptionsVO | `hr:shift-request:apply`，同部门有效员工与班次/规则摘要 |
| POST | `/preview` | ShiftDraftDTO → ShiftPreviewVO | `hr:shift-request:apply`，只读预检 |
| POST | 空 | ShiftDraftDTO+Idempotency-Key → ShiftRequestDetailVO | `hr:shift-request:apply`，创建本人 DRAFT |
| PUT | `/{id}` | ShiftDraftDTO+version → ShiftRequestDetailVO | `hr:shift-request:apply`，本人 DRAFT |
| DELETE | `/{id}` | version → Void | `hr:shift-request:apply`，仅本人 DRAFT |
| POST | `/{id}/submit` | VersionDTO → ShiftRequestDetailVO | `hr:shift-request:apply`，本人，检查两方排班/日期/休息/冲突 |
| POST | `/{id}/respond` | ShiftResponseDTO → ShiftInvitationVO | `hr:shift-request:respond`，被邀请人本人且 WAITING_ACCEPTANCE |
| POST | `/{id}/cancel` | ReasonVersionDTO → ShiftRequestDetailVO | `hr:shift-request:cancel`，申请人本人，审批前 |
| POST | `/{id}/application/retry` | ReasonVersionDTO → ShiftRequestDetailVO | `hr:shift-request:retry`，HR 范围、APPROVED/FAILED，不能修改原快照 |

审批复用现有工作流任务操作及任务归属校验；不为这张申请赋予新的通用流程管理权。选项接口由 HR 员工 ID 关联到登录用户，不能把 `sys_user.user_id` 当 `hr_employee.id`。

### 3.4 DTO/VO 完整字段契约

未注明可选的输入必填，所有长文本先 trim、按列宽校验；不使用 Map 接收任意持久化字段。

| 类型 | 字段与约束 |
| --- | --- |
| VersionDTO / ReasonVersionDTO | `version:Integer>=0`；后者增加 `reason:String(1..500)` |
| OvertimeDraftDTO | `startTime:LocalDateTime,endTime:LocalDateTime,settleMode:PAY/COMPENSATORY,reason:String(1..800)`；编辑另传 version。不得传 employeeId、类型、小时、倍率、金额、tenantId 或 status |
| OvertimeQuery | `pageNum,pageSize,workDateFrom?,workDateTo?,status?,settlementStatus?,settleMode?,employeeId?,deptId?`；仅管理列表允许 employee/dept，起止日期成对且 from<=to |
| OvertimeHoursReviewDTO | `version,approvedMinutes:Integer>0,note:String(1..500)`；必须 <= 当前快照 actualMinutes，不能改申请时间或结算方式 |
| OvertimePayReviewDTO | `version,hourlyRate:BigDecimal(18,2)>0,payrollPeriodId:Long,note:String(1..500)`；仅核价端接金额，工资币种由服务端确定 |
| OvertimeResolutionDTO | `version,action:REJECT/COMPENSATORY_ADJUSTMENT/PAY_CORRECTION,reason:String(1..500),targetPeriodId?:Long,originalSlipId?:Long`；REJECT 不接新目标，额度补入只接新假期周期，PAY_CORRECTION 两个 ID 必填；不接金额、数量、来源 ID 或自由 JSON |
| OvertimeTypeDTO | `typeCode:String(1..50),typeName:String(1..100),applicableDayType:WORKDAY/REST_DAY/HOLIDAY,rateMultiplier?:Decimal(4,2),salaryComponentId?:Long,compensatoryFlag:0/1,compensatoryRatio?:Decimal(4,2),compensatoryLeaveTypeId?:Long,maxHoursPerMonth?:Decimal(8,2),maxHoursPerDay?:Decimal(8,2),needApprovalFlag:1,remark?:String(500)`；创建停用，启用单独校验；编辑加 version |
| ShiftDraftDTO | `requestMode:SINGLE/SWAP,attendanceDate:LocalDate,targetShiftId?:Long,targetRuleId?:Long,swapEmployeeId?:Long,reason:String(1..800)`；SINGLE 选合法目标班次/规则；SWAP 必填对方且目标来自其排班，不接受客户端伪造；编辑加 version |
| ShiftRequestQuery | `pageNum,pageSize,dateFrom?,dateTo?,status?,applicationStatus?,employeeId?,deptId?`；本人/邀请查询不允许替换所属人 |
| ShiftResponseDTO | `version,decision:ACCEPTED/DECLINED,note?:String(500)`；拒绝时 note 必填 |
| OvertimeListVO | `requestId,requestNo,employeeId,employeeName,deptId,deptName,workDate,startTime,endTime,overtimeTypeId,overtimeTypeName,settleMode,requestedMinutes,actualMinutes,actualHours,approvedMinutes,approvedHours,status,settlementStatus,settledFlag,createTime,version,allowedActions:String[]` |
| OvertimeDetailVO | ListVO 加 `attendanceDate,shiftId,shiftName,ruleId,calendarId,dateType,triplePayFlag,rateMultiplier,compensatoryRatio,reason,reviewedBy,reviewedTime,reviewNote,instanceId,calculationSummary,ruleWarnings,settleTime,lastErrorCode,lastErrorMessage`；金融字段只能从单独授权的 SettlementVO 获取 |
| OvertimeSettlementVO | `requestId,settleMode,settlementStatus,settledFlag,settleTime,leaveTypeId,leavePeriodId,compensatoryQuantity,quantityUnit,compChangeId,leaveLedgerId,payrollPeriodId,payrollCorrectionId,salaryComponentId,currency,hourlyRate,settlementAmount,pricedBy,pricedTime,priceNote,resolution:ResolutionVO?,rounding:OvertimeRoundingVO?,lastErrorCode,lastErrorMessage,allowedActions,version`；不返回 cipher 字段，PAY 时调休字段为空，反之金额字段为空；结算成功不等于工资已发放 |
| ResolutionVO / OvertimeRoundingVO | Resolution 为 `action,originalPeriodId,targetPeriodId?,originalSlipId?,correctionSlipId?,operatorId,handledTime,reason`，所有字段由服务端生成/核实；Rounding 为 `policy:CUMULATIVE_FLOOR_2_V1,sourcePeriodId,rawMinutes,ratio,currentCreditHours,cumulativeCreditHours,residualNumerator`，residualNumerator 为权威整数余数、范围 0..59，每单位为 1/6000 小时；不含其他员工数据 |
| OvertimePreviewVO | `workDate,attendanceDate,calendarId,dateType,triplePayFlag,overtimeTypeId,overtimeTypeName,requestedMinutes,actualMinutes?,actualHours?,thresholdMinutes,rateMultiplier?,compensatoryRatio?,eligibleSettleModes:String[],segments:TimeSegmentVO[],warnings:RuleWarningVO[],blockers:BusinessBlockerVO[]`；跨日分段只是建议，客户端不能把预览结果作为提交计算值 |
| OvertimeOptionsVO / OvertimeTypeVO | Options 仅 `types:[{typeId,typeName,applicableDayType,eligibleSettleModes}],businessTimezone`；TypeVO 为 typeId+TypeDTO+status/version/createTime/updateTime，无个人薪资 |
| ShiftRequestVO | `requestId,requestNo,employeeId,employeeName,deptName,requestMode,fromDate,toDate,fromShiftId,fromShiftName,toShiftId,toShiftName,swapEmployeeId,swapEmployeeName,peerAcceptanceStatus,status,applicationStatus,createTime,version,allowedActions` |
| ShiftRequestDetailVO | RequestVO 加 `reason,fromRuleId,toRuleId,peerRespondedBy,peerRespondedTime,peerResponseNote,minimumRestMinutes,instanceId,approverId,appliedTime,beforeSlots:ShiftSlotVO[],afterSlots:ShiftSlotVO[],lastErrorCode,lastErrorMessage` |
| ShiftInvitationVO | `requestId,requestNo,applicantName,attendanceDate,ownBefore:ShiftSlotVO,ownAfter:ShiftSlotVO,applicantBefore:ShiftSlotVO,applicantAfter:ShiftSlotVO,reason,peerAcceptanceStatus,status,version,allowedActions`；不返回对方工资、请假内容、完整打卡或管理内部错误 |
| ShiftOptionsVO / ShiftPreviewVO | Options 为 `attendanceDate,ownSlot:ShiftSlotVO,eligibleShifts:[{shiftId,shiftName,ruleId,startTime,endTime}],eligiblePeers:[{employeeId,name,shiftName}]`；Preview 为 `beforeSlots,afterSlots,restGaps:[{employeeId,previousEnd,nextStart,gapMinutes}],minimumRestMinutes,blockers` |
| 共用嵌套 VO | `TimeSegmentVO={startTime,endTime,minutes,kind:WORK/BREAK/EXCLUDED,sourceCheckinIds:Long[]}`；`ShiftSlotVO={employeeId,attendanceDate,assignmentId,assignmentVersion,shiftId,shiftVersion,ruleId,ruleVersion,startTime,endTime,calendarId,dateType}`；`RuleWarningVO={ruleCode,dimension:DAY/MONTH,effect,limitHours,actualHours,message}`；`BusinessBlockerVO={code,message}` |

calculationSummary 使用上述 TimeSegmentVO、实际/排除/阈值分钟与源记录版本，不返回原始 JSON、内部 SQL 或任意 POJO。前端以服务端 allowedActions 决定显示，后端每次仍重验，不能只靠隐藏按钮。

### 3.5 共用日志、校验失败及薪资隐私边界

核价 `/review-pay`、金额/结算详情 `/settlement`、结算重试/处置及其关联 D 补正方法都使用既有 `@SysLog(logParams=false)`。主稿负责让 `RequestLogAspect` 通过 Spring 注解属性读取同一个开关，不能让 common-core 反向依赖 common-log，不另建 HR 日志注解或开关。开关关闭时不序列化参数、不写请求参数属性。没有这项共用修正，HR 核价链路不能宣称完成安全验收。

保护必须覆盖进入 Controller 之前的绑定/校验失败：复用主稿安排的 common-core `GlobalExceptionHandler` 从已解析 HandlerMethod 读取同一开关；只记异常类型、错误码和字段名，不记录 rejectedValue、异常原文、请求正文或 DTO。JSON 解析、数值精度/范围、缺字段及权限失败均纳入检查，不能因为 Controller 未执行就回落打印异常消息。工资/时薪明文、cipher、calculation/policy 快照及核价依据自由文本都不得出现于应用日志、访问日志、错误日志或请求参数属性。

HR 自动审计通过 `@Audit` 的既有新旧值表达式引用专门的白名单摘要，仅含租户/申请/关联记录 ID、状态、版本、操作者、操作类型及错误码；`HrRuleSupport.audit` 同样传该摘要，不传整个实体、DTO、金额、cipher 或快照。D 补正的 H 接线路径必须去掉现有 diffAmount 流程变量及金额审计载荷，改传原申请/补正 ID 与受权限保护的详情入口；此安全接线交集成人维护。前端 `logApiCall`、console 和埋点不接核价 DTO/SettlementVO/整个异常对象，通用列表及工作流变量不包含薪资。金额只在授权返回体、加密业务列和既有受保护算薪快照内使用；本文不改变 D 原存储类型、不新增明文副本。

## 4. 第四步：A/D 实际接线及业务处理

### 4.1 已有基础和本项必须补的能力

| 已存在 | 仅代表什么 | HR-09 需要补什么 |
| --- | --- | --- |
| A 的 `triple_pay_flag` 和 DayTypeInfo | 说明日期是否法定三倍工资日；不是倍率主数据 | 新类型表、自动匹配、倍率核定和提交快照 |
| D 的 `compensatory_flag`、台账 COMPENSATORY | 允许合格假种增加额度的基础；现种子标记仍为 0 | 启用合格假种、按已批准申请幂等入账、回指申请与结果 |
| D 的 `overtime_type_id` | 原始卡的可空预留字段，当前写卡服务没有赋值 | 真实类型 ID 校验、仅新录入卡关联；绝不使用字典 dict_code |
| D 的班次阈值、日 `overtime_minutes`、月 `overtime_hours` | 无申请校验的候选工时和汇总 | 独立区间核算、HR 核定；读视图并列显示候选与核定，保留原 D 算法 |
| D 的 OVERTIME 工资变动消费 | 能将 APPROVED 变动金额纳入应发和个税 | 核价、来源唯一键、目标周期绑定和金额明文保护 |
| D 的启动/取消事件、B 回调标记 | 已有可靠消息、租户/实例绑定、重复回调去重 | 显式增加 HR_OVERTIME / HR_SHIFT_REQUEST 路由及各自副作用，沿用安全边界 |

### 4.2 加班日、打卡与工时核定

1. 创建/预览由服务端根据登录员工和日期调用 `HolidayCalendarService.resolveCalendarId`，继续班次→部门→租户默认。无日历、停用日历、无对应类型、缺生效配置均返回明确阻塞。`WORKDAY` 调休补班按工作日处理，不能见“调休”两个字就套二倍。
2. 分类优先读取 `triple_pay_flag`：HOLIDAY/1 → HOLIDAY；REST/0 或 HOLIDAY/0 → REST_DAY；WORKDAY/0 → WORKDAY。WORKDAY/1、REST/1 等矛盾配置拒绝核算并报配置错误，不优先挑一个值吞掉冲突。用类型表 applicable_day_type 匹配，并核对状态与租户。
3. 草稿可以在加班前登记；提交正式核定必须 endTime<=服务端当前时间。新的加班打卡可以携带可选 overtimeRequestId，服务端验证为本人、同租户、时间落在草稿的申请区间及对应打卡边界，解析真实 overtimeTypeId、班次和归属日；客户端不能传类型 ID、工时或替换归属员工。普通打卡维持 D 的原行为。
4. 已有原始打卡不回写 overtimeTypeId/overtimeRequestId/offshiftFlag。事后申请从同员工的真实卡选取覆盖区间的 IN/OUT 对，保存引用 ID 及时间快照；没有成对证据、skip_auto、非法位置或类型矛盾时先走既有补卡/核正路径，不新增一条虚拟卡。窗口外卡不能因其 D 候选值为零而被误算为零；HR-09 单独校验其确在申请区间、进出配对和有效加班证据范围内，D 正常考勤过滤规则不放宽。
5. 工作区间按 D 的 FIRST_LAST/PAIRED、EARLIEST_LATEST/ALTERNATING 配置解析，交集后扣除明确休息区间；部分区间和跨夜缺 `breakStartTime/breakEndTime` 时拒绝猜测。已有配置不能表达加班时段内的额外休息时，不把整段外班时间都认定为工作，必须先补齐休息依据再提交。休息口径的扩展属于 Q2，不能用固定午休或固定 8 小时替代。
6. 工作日先从日有效工作时间扣应工作时间，再扣一次班次 overtime_threshold_minutes；非工作日应工作时间按日历/有效排班明确为 0，但仍读取该班次配置的阈值。顺序切分可计加班区间，再与申请相交。多张不重叠申请共享同日的“阈值已扣后的区间”，不能每单重复减阈值，也不能用迟到前的空档冒充加班。第一版不自动接受缺班次、规则不一致或实际工作跨多个无法唯一归属班次的申请。
7. 一单只计一个自然日，跨午夜拆单；配对可跨午夜，分钟区间在午夜截断。考勤展示仍按该班次开始日归属，日/月上限和倍率按实际自然日计算。这是两个维度，不把相同卡重复计入两单的重叠分钟。与已提交/已批准请假或已有加班区间重叠时拒绝，休假半天及跨夜检查复用 D 的真实区间定义，不按整日标记粗略放行。
8. 保存 requested/actual 分钟、展示小时、卡 ID、规则/班次/日历实际值及版本、阈值分配区间；保存前及工时核定前重新校验来源。D 的日/月候选列不改写，新增读 VO 的核定数通过 XML 汇总申请得到。CONFIRMED 月份禁止新增或核定影响该归属月的申请，也禁止再新增相关原始卡；不会为 H 解封 D。

日历基础服务当前 DayTypeInfo 不返回全部版本元数据。实现时需用其已有 mapper 增加只读、带 tenant 条件的版本快照读取，或返回一个明确的版本快照 VO；这是待补的 H 接线，不假设已经存在一个“带版本快照”方法。

### 4.3 上限与提交占用

建议 Q2 确认员工所有加班类型合计的日/月上限；启用类型的相同维度阈值须一致，避免通过选择类型绕过总量。若业务实际要求分类型上限，需改本段而非默默改变统计条件。

权威上限来自 `hr_overtime_type.max_hours_per_day/max_hours_per_month`，规则码沿原 PRD 新增 `hr.overtime.hours.limit`，`sys_business_rule.threshold_value` 留 NULL，避免另一份阈值。规则中心负责 effect：BLOCK 拒绝、WARN 允许但返回警示并记命中。PASS/ALERT 是规则中心已有全局取值，但本业务首期只支持 BLOCK/WARN；配置为其他效果、缺失/停用规则或规则服务不可用时不降级放行。

提交时在 tenant+employee+自然月锁内，查询 SUBMITTED/PENDING/APPROVING/APPROVED 的实际加班分钟总和（不包含本单），加入本次 actualMinutes 再与小时阈值比较；核定减少报酬分钟不抹掉实际发生的加班。CANCELLED/REJECTED 释放申请占用；APPROVED 即使结算失败仍计实际工时。跨类型、跨两张申请的并发提交必须一并统计，不分别锁类型。

命中记录复用 `BusinessRuleHitRecordDTO`，code 固定、businessId 为申请 ID；DAY/MONTH 通过新业务标识 `HR_OVERTIME_DAY` / `HR_OVERTIME_MONTH` 区分，thresholdValue/actualValue 单位均为小时。HR 审计另存分钟、类型、日期及规则效果。预览只返回警示；真实提交记录命中，BLOCK 的拒绝也需留记录。记录失败则拒绝提交，不能出现“已绕过但没留痕”。

### 4.4 状态、正式审批与取消

| 业务 | 状态流转 | 前提和副作用 |
| --- | --- | --- |
| 加班 | DRAFT → SUBMITTED | 事后提交、锁内核算/校验上限；冻结业务快照，不冻结调休额度、不产生工资 |
| 加班核定 | SUBMITTED → PENDING | HR 核定正分钟；COMPENSATORY 校验目标假种/周期后就绪；PAY 还须财务核价并确定周期。非本人审核，全部依据齐备才同事务发布启动事件 |
| 加班正式审批 | PENDING → APPROVING → APPROVED/REJECTED | 发起成功绑定 instanceId；APPROVED 发布一次结算事件，REJECTED 不入账 |
| 调班本人换班 | DRAFT → PENDING → APPROVING → APPROVED/REJECTED | 无对方同意环节，保留原排班快照；通过后发布应用事件 |
| 双人互换 | DRAFT → WAITING_ACCEPTANCE → PENDING → APPROVING → APPROVED/REJECTED | 对方同意时再次核对两方快照；对方拒绝直接 REJECTED 且无工作流、无排班变化 |
| 撤回 | 加班 DRAFT/SUBMITTED/PENDING/APPROVING；调班 DRAFT/WAITING_ACCEPTANCE/PENDING/APPROVING → CANCELLED | 同锁竞争，未产生最终副作用；已发起则发送现有可靠取消事件，取消完成前阻止创建重叠生效单 |
| 重复/乱序 | 同一终态重复操作返回当前状态；其他不合法跃迁 409 | 撤回胜出后迟到通过回调不能入账/改班；通过胜出后撤回拒绝 |

SUBMITTED 是本项“待业务核定”，PENDING 是“等待可靠启动”，APPROVING 是已绑定正式实例。PAY 工时已核定后只能财务核价，不能再覆盖核定时间/金额；有误须在正式审批前撤回重建。拒绝/取消为终态，不把同一 requestId 重提交到另一实例，避免复用既有确定性事件 ID。

`HrRuleWorkflowService.target/enqueue` 改为显式映射：HR_OVERTIME → 独立加班实体 / `sys.hr.overtime.processKey`；HR_SHIFT_REQUEST → 调班实体 / `sys.hr.shiftRequest.processKey`。不能继续“不是请假就是补正”的二分默认。B 备选按 §2.5 调整实体限定。

发起人身份也必须显式接线：当前 `HrRuleWorkflowService.enqueue` 直接取 `UserContext.getUserId()`，加班在 HR 核定/财务核价后入队、双人调班在对方同意后入队时，该用户是经办人或被邀请人。新增内部业务专用入队路径，从申请员工经核实的登录关联取得原申请人 userId，在提交时保存于 policy_snapshot/schedule_snapshot 的 applicantUserId；startUserId 固定使用该可信快照。核价人/同意人仍独立记录为操作审计人，不能冒充原发起人，客户端不能指定该值；关联失效或跨租户时阻塞。旧 D 调用保留既有行为，不全局更改 UserContext 或伪造请求头。

同时在真实消费者 `WorkflowBusinessTypeContributor` 注册 HR_OVERTIME→hr_overtime_request、HR_SHIFT_REQUEST→hr_shift_request，两者 module=hr、idField=request_id、processInstanceIdField=instance_id、statusField=status。默认 id/process_instance_id 与新表不一致，不能省略；不新建“业务类型表”。方案 B 的 HR_OVERTIME 改指 hr_time_request/id，并核验对账不会与旧时间申请重复统计。对应业务类型列表、回调显式分支与对账查询一并验证，只注册真实已建立的表。

复用 `HR_RULE_WORKFLOW_START` / `HR_RULE_WORKFLOW_CANCEL`、启动尝试日志、失败后恢复绑定、事务外远程调用、`WorkflowServiceClient` 内部入口及原 callback stream。新增两项业务事件 `HR_OVERTIME_SETTLE` / `HR_SHIFT_REQUEST_APPLY`，由 HR 现有 Outbox/消费者机制处理，无新任务表或新消息依赖。

流程变量仅含申请 ID/编号、employeeId、deptId、日期、核定分钟/方式及业务详情路径；不放基础时薪、加密原文、调查内容或完整薪资。所有变量来自服务端快照，客户端不能指定 processKey、审批人、callbackStreamKey 或 businessType。

自审限制是待补接线：现 `SelfApprovalPolicy` 默认 ALLOW，转派仍为本人也会降级允许，且只识别 startUserId，不识别互换对象。H 的受限启动链路必须先以真实用户/组织关系解析审批人，剔除申请人以及 SWAP 对方的登录用户 ID；合格人为空即阻塞。可复用已有 VARIABLE_USER 节点消费服务端确定的审批人变量，首期各审批节点显式 `allowDelegate=false`、`allowAddSign=false`，不使用 AUTO_SKIP 或空审批人自动通过。提交审批动作和终审副作用再核对参与人排除约束，防止管理员重新指派到双方。此预检与业务限定检查尚未实现，属于集成依赖；不能只配置 `approveSelf` 就宣称已满足。审批人名单/备用负责人由用户在 Q3 确认，不捏造兜底人。

`ApprovalResultDTO` 实际包含 approverId、approvalTime、APPROVED/REJECTED。接收端继续校验 tenant、businessId、businessNo、当前 instanceId 和允许状态；新增路由不复用请假副作用。回调在同一事务内 CAS 状态、写 `wf_callback_side_effect` 标记、发布结算/应用事件，不能先把状态提交再写副作用标记。异步无交互用户时建立可信租户上下文，严格按业务绑定读取；不能把“UserContext 为空时 scope 校验跳过”当外部接口授权。

审批通过不能反向调用 invalidate-by-business。员工、HR、管理员均不能以普通撤回接口把已结算单变成 CANCELLED；自动台账来源的普通手工冲正、自动工资变动的普通编辑/删除/改状态入口须拒绝，防止申请结果与账务脱节。会计差错通过既有 D 补正/授权核查留痕处理，增加“已通过撤销”功能需单独确认与设计。

### 4.5 调休与薪资结算

每个申请仅一个报酬模式、一个最终结算结果。消费者按 §4.7 顺序取得锁后确认 APPROVED 并读取冻结依据；成功结果已经存在时核对并返回，不因周期随后关闭而改判失败或重新入账。`settlement_status` 表示执行结果，独立于审批状态；SETTLED 表示额度已处理、工资变动已建立或 D 补正已应用，不表示工资已发放。

#### 4.5.1 调休累计舍入与入账

目标假种必须同租户、启用、compensatory_flag=1、need_quota=1、unit=HOUR；正常路径按 workDate 唯一解析并冻结的假期周期必须 OPEN。DAY 假种拒绝，不新增“一天等于几小时”的换算规则。以下为 Q2 待确认的防拆单政策，实施前必须获准：

- 累计键固定为 `tenantId + employeeId + leaveTypeId + 原 leavePeriodId`，不按申请、加班类型或审批完成日分组。每笔使用自己的已冻结比例，以整数计算 `weighted = approvedMinutes × (compensatoryRatio × 100)`；累计精确量为 `weightedTotal`，累计可入账小时为 `credit(weightedTotal) = floor(weightedTotal / 60) / 100`。不同倍率版本相加的是各笔 weighted，禁止拿最新比例重新乘历史分钟。
- 在既有 `leave:{employeeId}:{leaveTypeId}` 锁及目标周期行锁内，汇总此累计键已 SETTLED 的 COMPENSATORY 申请，包含累计差额为 0 的单、明确补入新周期的单，排除尚未成功的单。计算 `本单数量 = credit(历史 weighted + 本单 weighted) - credit(历史 weighted)`，同时检查历史 `SUM(compensatory_quantity)` 等于历史 credit；不一致即停止并核查，不能补发来掩盖差异。任何顺序完成、任何非重叠拆单的总授予量都相同；范围超出 DECIMAL(8,2) 即拒绝。
- 例：比例 1.00、连续 3 笔各 1 分钟，实际入账依次为 0.01、0.02、0.02 小时，总计 0.05；60 笔共 1.00 小时。逐单 HALF_UP 会得到 1.20 小时，明确禁止。差额为 0 时不向 D 的正数台账接口塞 0，而在申请内保存数量 0、舍入依据并置 SETTLED，leaveLedgerId 为空；后续同键累计仍包含其原始分钟。余数始终保存于整数 weighted 的可重算依据中，原周期最终结案时不足 0.01 小时的部分不抬高、不自动转下期；若用户要求补足余数或不同舍入规则，先改政策再实现。

`compensatory_quantity` 保存本次实际差额，未结算为空；calculation_snapshot 补固定 rounding 节点，记录策略版本、原周期、计算前后 weighted/credit、当前数量、余数。原核定分钟/比例不变。结算明细向本人及有权 HR 展示累计舍入说明，不把 approvedHours 当额度依据。显式补入仍归原累计键，避免用选择新周期重置舍入；额度消费、普通人工调整或反向流水不改变原 H 授予量累计，不能因此再次获得同一份加班额度。

扩展 `HrLeaveBusinessService` 内部专用入账方法，复用其假种校验、额度限制、`writeLedgerToPeriod`、`syncQuota`；不调用公开 postLedger 冒充 HR_LEAVE_OPERATION。正差额账为 transaction_type=COMPENSATORY、source_biz_type=HR_OVERTIME、source_biz_id=requestId、source_event_key=`HR_OVERTIME:{requestId}:COMPENSATORY`、quantity_unit=HOUR；正常与显式补入使用同一个固定事件键。from/to 记录实际生效周期范围，原加班日期保存在申请中。入账、额度刷新、申请结果及舍入依据同事务；失败全部回滚。已生成的 H 台账不经通用 reverseLedger 自动撤销申请，手工余额核查另留独立调整记录且不得伪造 H 来源。

#### 4.5.2 工资变动与 D 算薪

财务核定基础时薪，金额 `round(approvedMinutes × hourlyRate × rateMultiplier ÷ 60, 2, HALF_UP)`；中间使用 BigDecimal 精确乘积，仅最终除法保留两位，不能按 approvedHours 再算。金额为 0 或溢出拒绝核价；沿 `hr_employee_comp.currency` 当前 CNY 链路，不换汇，不自造时薪分母。此处是逐单财务核定金额，调休额度采用上一节的累计政策，两者不得混用。

“下期算薪”的建议定义：开始日期晚于 workDate、该员工尚无工资覆盖的第一个 OPEN 工资周期，由财务明确确认并冻结 payrollPeriodId；若不存在唯一可用周期则阻塞，不能按审批当天滚到另一周期。正常结算生成 `hr_comp_change`：changeType=OVERTIME、status=APPROVED、changeNo=`OT-{requestId}`、sourceBizType=HR_OVERTIME、sourceBizId=requestId、salaryComponentId/payrollPeriodId 来自快照、effectiveDate=目标周期 startDate、changeAmount 走现有加密序列化。来源存在时比对员工、币种、金额及周期，全部相符才返回原结果；不忽略逻辑删除/取消的同源行来另造一笔。

D `HrPayrollCalculationService.apply` 对 H 来源严格匹配周期 ID，其他变动继续原日期范围逻辑；components 在原 changeId 基础上补 overtimeRequestId、salaryComponentId 和来源分钟/倍率摘要，快照沿 D 的受保护算薪存储，禁止写日志。加班费进入应发后走原累计个税和完整性校验，不另造税公式。算薪 preCheck 及工资周期 closePeriod 对已绑定该目标周期、尚未结清/明确结案的 PAY 单阻塞；尚未核价、未绑定周期的 SUBMITTED 单不得误算成任何一个周期的确定应发。结算与算薪/补正共用既有 `payroll-period:{id}`、`payroll-year:{employeeId}:{year}`，再次检查真实工资覆盖及批次，禁止在已有工资后补插旧 effectiveDate 冒充能被算入。

#### 4.5.3 审批期间关账：停止重试、显式处置

提交/核价时目标已经关闭则直接 409，不启动审批。审批完成后才发现目标关闭、工资覆盖已经生成或原目标永久不可用，且确认没有任何结算结果时，原单保持 APPROVED，结算转 `NEEDS_RESOLUTION`，记录 PERIOD_CLOSED/PAYROLL_ALREADY_GENERATED 等明确原因；此事务成功后确认消费事件，不进入自动重试。`/settlement/retry` 对该状态返回 409 RESOLUTION_REQUIRED，不能让 FAILED 反复写同一个关闭周期。原 leavePeriodId/payrollPeriodId、核定金额/分钟/比例全部保留。

`/settlement/resolve` 只允许有权、非本人经办人提交版本和原因；在同一来源锁内先确认原结果不存在，再按以下互斥路线处理。新目标由人明确选择并在执行时重新校验，页面并列显示原目标和本次补正目标；不把人确认的新目标写回原快照。

| 明确处置 | 前提、真实接线及终局 | 防重复与不能支持的情况 |
| --- | --- | --- |
| REJECT：终止本次自动结算 | PAY 由财务、COMPENSATORY 由 HR 经办；写 settlement_resolution 的经办人/时间/原因，settlementStatus=REJECTED、settledFlag=0，保留 APPROVED 工时及全部依据 | 不删原单、不释放已发生工时的统计占用、不再消费该来源；只是自动处理结案，不代表员工放弃报酬。是否允许此人工结案由 Q2 确认 |
| COMPENSATORY_ADJUSTMENT：明确额度补入 | HR 确认一个同租户 OPEN 新假期周期，原假种/比例/分钟不变，依 §4.5.1 原周期累计键计算差额；新增 COMPENSATORY 台账落所选新周期，记录原/新周期，成功 SETTLED；0 差额按同一政策处理 | 同一个 source_event_key 同时覆盖正常转入及补入；新目标又关闭则本次不提交、保持 NEEDS_RESOLUTION，要求重新明确选择；不自动加期、不把 COMPENSATORY 偷换为金额。有效期政策未确定则不能补入 |
| PAY_CORRECTION：真实 D 工资补正 | 财务还须持有现有 `hr:payroll:correct`；原工资单必须属于该员工和原目标周期、真实 PAID，明确新 OPEN 目标且符合 D 的月份/后续工资限制。复用 D 差额计算和审批，grossAdjustment 固定为原核价金额、deductionAdjustment=0，客户端不能另填金额 | 创建补正与回填 payrollCorrectionId/settlement_resolution 同事务，原单进入 CORRECTION_PENDING；不再生成 hr_comp_change。没有真实 PAID 原单时明确 CORRECTION_REQUIRES_PAID，保留待人工处置，禁止造工资单、改成 PAID 或自动挪至普通工资周期 |

本项只允许一个关联 D 补正：`payroll_correction_id` 唯一且一旦建立不得改指，既有补正工资单受保护 snapshot 增加 overtimeRequestId/原目标/本次目标引用，不改表。调用需提取 D 的同事务内部入口并沿其锁顺序，不能通过自己 HTTP 调用形成两个事务；一般补正外部 DTO 不能指定 H 来源。初次创建失败回滚全部关联，成功后重放或并发处置返回/拒绝当前状态，不能再新建第二笔补正；原 hr_comp_change 来源也必须确认为不存在，避免正常结算与补正各产生一笔。

补正最终 APPROVED 且 D `onApproval` 成功将补正应用为 APPLIED 时，H 才同事务置 SETTLED；发放沿原 D `pay`，不提前标 PAID。补正 REJECTED 时 D 补正工资单 CANCELLED，H 结算 REJECTED，原加班审批仍为 APPROVED；审批及关联历史保留，普通重试不能再建单。D 正式 closePeriod 已阻塞未发补正，H 必须保留该保护。若检测到目标被旁路关闭而真实终审为 APPROVED，H 关联分支必须将未应用的补正工资单置 CANCELLED、原 H 结算置 REJECTED 并记录 CORRECTION_TARGET_CLOSED；保留流程真实 APPROVED 及 D 补正 APPROVED（未 APPLIED），界面明确“审批通过、执行拒绝”，一次记录回调副作用标记后停止重投。禁止将 APPLIED/PAID 已有结果取消，也禁止更改回调结果冒充审批人拒绝。这个 H 关联执行拒绝处理尚未在 D 实现，须集成人接通并验收，不能直接复用 D 当前抛异常重试的行为。

假期关账/结转接入点需在原周期行锁内识别待结算的 H 单；未完结时阻塞该周期关闭，显式 NEEDS_RESOLUTION 处置仍须遵守上述边界。工资/假期最终关闭前的检查与 H 入账使用同一周期锁；正常入口下由锁决定先后，关账先完成则 H 进入明确处置，入账先完成则关账看到实际余额/变动。D 税表 1450 仍未核定，不以验收专用 1451 充当生产税率；缺真实有效税表的 PAY/补正验收保留阻塞。

### 4.6 调班应用与跨夜边界

SINGLE：服务端解析员工当前有效排班，目标 shift/rule 必须兼容且租户一致、启用。SWAP：校验两员工不同、同部门、均在职，双方原班次不同，原有效班次/配套规则互换；不能只交换 shift_id 却留用对方不适用的休息或打卡规则。

提交、对方同意、应用三次验证：日期严格晚于当天；未来受影响时段和相邻时段无交叠；无原始卡、人工日结论、已封账月份、已算薪覆盖；无待审批/已批准的请假或重叠加班/调班；不存在一方已离职、跨租户或源排班变化。任何一项失败都不改变排班。检查的数据范围包含两方，不以仅校验申请人为充分条件。

`sys.hr.shift.minimumRestMinutes` 为新配置，值由 HR 确认；缺值/非整数/负值阻塞。显式配置 0 仅表示不设额外间隔，仍禁止时间重叠。按实际 start/end 时间计算上一班结束→新班开始、新班结束→下一班开始的间隔；夜班用 D `shiftEnd`，休息段用 `HrShiftBreaks`。查找范围覆盖目标区间前后 minimumRestMinutes 以及可能跨午夜的班次，不只检查“前一天/后一天有没有排班”。日历休息日不凭空制造一个工作班次，SINGLE/SWAP 首期只替换实际工作日已有的工作班。

对方同意必须对应未改变的 schedule_snapshot 与 version；同意后不允许编辑本单。修改要取消并重建，原同意不能继承。应用时重新解析同一优先级规则的 assignmentId/version、shiftId/version、ruleId/version 和日历依据，任何变化标记明确冲突并不自动选择最新班次。

通过后使用 `target_type=EMPLOYEE`、明确 schedule_date 的新单日排班覆盖，不改部门的长期排班或批量改写他人。SINGLE 写一条，SWAP 在同一数据库事务中写两条；rule_id 与 shift_id 一起取对应快照，status=PUBLISHED、source_shift_request_id 指回原单。旧有效记录保留，解析优先级沿当前 XML；应用前必须确认新行优先级确能生效，不能靠不受控 id 排序替代校验。

复用 `attendance-config` 租户锁，并在同一顺序取得双方受影响月份锁。数据库中锁定申请行与两名员工行（ID 升序），重新核对排班源，唯一键确保每个申请/员工/日只生成一条。插完后再次按真实解析器校验两方新有效结果，失败则全部回滚。提交成功后用 `afterCommit(holidayCalendarService::invalidateAssignments)` 失效归属缓存，不 FLUSHDB。

既有 saveSchedule/saveRule/saveShift/deleteConfiguration 需仅对 HR-09 已占用或生成的排班增加来源保护：不能直接删除/改写 H 单日覆盖或改变待应用快照的已确认内容；改成新的未来业务申请。其他无 H 引用的配置行为不趁机重写。未来自动考勤、请假计算、工资的工作日计算仍走原解析器，自然读到新班次；不更新历史原始卡、不强制覆盖人工结论。

### 4.7 失败恢复、事务和锁顺序

复用 `HrRuleSupport.locked/lockedWithoutTransaction` 的租户键、自动续租及事务完成后解锁机制；远程 start/cancel 不在数据库事务中。新增服务不能在 SQL 已提交后释放锁再“补写”结果。

固定获取顺序：attendance-config（需要改班或冻结配置时）→ 工资周期（PAY 时，涉及原/新周期按 ID 升序）→ 员工工资年度 → 员工自然月加班锁 → 员工考勤月份（员工 ID、月份升序）→ 假期 employee/type 锁 → 假期原/新周期行锁（ID 升序）→ 申请/来源行的数据库锁。D `getPeriod` 在事务内使用 selectLocked，H 沿已有 leave→period 顺序，不逆转；需要新旧目标的处置先只读解析键，再按顺序加锁后重读。无需的锁跳过；D 调用如会交叉须提取共享的锁内方法，不在已锁申请之后再调外层工资锁。跨服务 start/cancel 仍在事务外。

消息成功消费的最小事务：再次校验状态/快照 → 唯一来源入账或写排班 → 回指结果 → SETTLED/APPLIED → 白名单审计，一次提交。网络、锁超时等暂时失败回滚后记录 FAILED，允许原依据重试；周期关闭等永久结算失败转 NEEDS_RESOLUTION 并确认消息，REJECTED 为执行结案终态。配置/排班快照冲突使用明确错误码，禁止无限自动重投或伪造成功。

业务重试只允许当前申请绑定的原快照；重试事件键包含当前申请版本以便重新投递，最终账务幂等键始终固定为原申请来源。即便消息键变化，也不会写第二笔台账/工资/排班。重试不能改金额、目标周期、参与人或班次；只有独立 resolve 动作可记录人明确选择的补正目标，原快照不改。FAILED 的失败记录也须 CAS 且不能覆盖已经 SETTLED/REJECTED 的并发结果。

调班应用失败不占用新的生效排班；记录保留。若由于快照过期需新申请，旧失败单仍可查看，后续重试必须因源快照/新申请冲突被拒绝。审批状态 APPROVED 与应用状态 FAILED 并列展示，不冒称“已调班”。APPROVED 的加班结算失败也并列展示，不伪称已拿到调休/加班费。外部服务停机、重复回调和取消/通过竞态均须在 §6 验收。

## 5. 第五步：跨模块取值与计量对齐

以下是同一次实施必须一起调整的接口、字典、页面、审批和统计契约；不能只改新表而保留旧加班接口继续写入。表内“既有”来自 §1 摸排，“本项”属于待确认设计。

| 字段或语义 | 既有标准/当前取值 | 本项接线与对齐结果 |
| --- | --- | --- |
| 认证用户与员工 | `sys_user.user_id` 与 `hr_employee.id` 为两种 ID | 所属人和统计使用 employeeId；审批人、核定人、同意人使用 userId。服务端核实当前租户内的有效关联，缺员工关联时禁止本人申请，不用相等数值猜关联。 |
| 日历与类型 | A：`date_type=WORKDAY/REST/HOLIDAY`、`triple_pay_flag=0/1` | `(WORKDAY,0)`→WORKDAY；`(REST,0)`、`(HOLIDAY,0)`→REST_DAY；`(HOLIDAY,1)`→HOLIDAY。其他组合阻塞；原始两列和匹配后的真实 typeId 均保留快照。 |
| 加班类型字典 | `hr_overtime_type` 字典值 WORKDAY/WEEKEND/HOLIDAY，687/688/689 是字典记录编号 | 同名字典与新业务表不是同一实体；字典 WEEKEND 改为 REST_DAY，三种标签与 applicableDayType 一致。申请类型来自日历匹配主数据，字典仅供展示，不能将 dict_code 写入 `overtime_type_id`。 |
| 结算方式 | 旧字典 PAYMENT/TIME_OFF；PRD 为 PAY/COMPENSATORY | 同批统一为 PAY/COMPENSATORY，前端、DTO、字典及演示生成器共同更新。项目未上线，不保留两套入参或做旧值迁移。 |
| 请假、加班、补卡 | 原 `hr_time_request` 混有 LEAVE/OVERTIME/SUPPLEMENT；D 另有 BUSINESS_TRIP 读取分支 | 方案 A 只移出 OVERTIME，旧写入口拒绝该值；既有 LEAVE/SUPPLEMENT/BUSINESS_TRIP 行为保持。方案 B 明确保留 OVERTIME，但也必须经专用服务、可信审批及来源保护，不能走通用改状态。 |
| 打卡、核定、考勤汇总 | 原始卡的类型 ID 可空；日 `overtime_minutes` 为候选整数分钟；月 `overtime_hours` 为 DECIMAL(8,2) | 仅新加班卡由服务端填真实 typeId/requestId；旧卡不更新。候选列不换义，独立申请的核定分钟按 employeeId/attendanceDate 聚合，界面分别标“考勤候选”和“审批核定”。 |
| 业务日期与时间 | D 按班次开始日归属；现日历用于工作日判断 | `work_date` 是自然加班日，用于倍率和日/月上限；`attendance_date` 是班次开始日，用于考勤核定展示与封账。统一 Asia/Shanghai，半开时段、秒为 00；跨自然日拆单，跨夜配对不重复计分钟。 |
| 审批状态 | B 的流程实例状态与回调 APPROVED/REJECTED 是不同层级 | 新业务的 SUBMITTED/PENDING/APPROVING 依 §4.4 显式转换；只处理绑定实例的可信终审回调，不直接复制任意流程状态字符串。加班/调班草稿保存在各自业务表，不写 WF-11 通用草稿表、不生成 DRAFT 实例。 |
| 执行结果 | 原 D 调休入账、工资变动、工资发放各有完成点 | 加班 `status` 与 `settlement_status`、调班 `status` 与 `application_status` 并列返回。SETTLED/APPLIED 不表示 PAID；终止自动结算不把审批工时改成 REJECTED，也不代表员工放弃报酬。 |
| 工资变动与项目 | `hr_comp_change.change_type=OVERTIME` 是既有算薪消费类型；`hr_comp_component` 用 VARIABLE/FIXED | H 来源固定 HR_OVERTIME，项目选已核定的 VARIABLE、taxable=1 项，周期显式绑定；非 H 来源仍走 D 原日期范围。不得以 BONUS 代替未配置加班项目，不向月薪主数据加明文时薪。 |
| 调休台账与假种 | D `transaction_type=COMPENSATORY`；假种有 unit、need_quota、compensatory_flag；台账数量列名仍为 leave_days | H 首期只接 HOUR 假种，`quantity_unit=HOUR`，leave_days 存按累计政策计算的小时正差额；零差额只记申请结果。`COMP_TIME` 是假种代码，COMPENSATORY 是交易/结算语义，二者不混用。 |
| 周期与有效期 | D 假期/工资周期 OPEN/CLOSED；到期算法当前仅覆盖既有周期/结转路径 | 使用冻结的实际周期 ID；关账后进入 NEEDS_RESOLUTION，不自动换周期。`quota_rule.expiryDays=90` 不能作为已实现的逐笔 90 天到期保证；未确认期限策略时不启用对应类型。 |
| 排班与同意 | D `target_type=EMPLOYEE/DEPT`、排班 PUBLISHED；没有双人同意字段 | 申请模式 SINGLE/SWAP、同意 NONE/PENDING/ACCEPTED/DECLINED 与业务状态分别保存；本人替换生成 1 条 EMPLOYEE 单日覆盖，互换同事务生成 2 条，旧排班保留。 |
| 规则中心 | `effect` 全局有 PASS/BLOCK/WARN/ALERT；现请假额度规则使用独立 code | `hr.overtime.hours.limit` 首期只接 BLOCK/WARN，阈值来自类型表；DAY/MONTH 命中维度及实际值单位一致，不能借用请假额度阈值。缺配置不解释为 PASS 或无限制。 |
| 流程注册与权限 | definition_id 与 process_key 是不同字段；权限只允许五种模块前缀 | 配置填 processKey，注册使用 HR_OVERTIME/HR_SHIFT_REQUEST；新业务权限均为 `hr:*:*`。不新增通用流程发起权，不把菜单授权当作员工范围、审批资格或财务资格。 |

精度与来源规则固定如下，不交给浏览器自行计算：

| 计量项 | 权威值与返回值 | 舍入和越界 |
| --- | --- | --- |
| 时间与上限 | 区间与实际/核定时间为整数分钟；日/月上限列 DECIMAL(8,2) 小时 | 上限比较使用分钟与阈值×60 的精确值，不能先把分钟舍入为小时再比较；仅展示小时按分钟÷60、HALF_UP 两位。 |
| 调休 | 每单 `approvedMinutes × ratioHundredths` 的整数 weighted；累计组固定到原假种/周期 | 按 §4.5.1 累计 FLOOR 两位、逐单取差额；余数 0..59，每单位 1/6000 小时。保存策略版本和原周期，反复结算、改目标周期或换类型均不重置累计。 |
| 金额 | 时薪/报酬解密后的计算契约 DECIMAL(18,2)，倍率 DECIMAL(4,2)，币种 CNY | 精确分钟参与乘除，仅最终金额 HALF_UP 两位；落库为现有加密字符串，接口金额为十进制字符串。数量/金额超过列精度或金额为 0 时拒绝，不能截断、改成 0 或改币种。 |
| 业务与消息来源 | 创建键 tenant+employee+Idempotency-Key；工资来源 tenant+HR_OVERTIME+requestId；调休事件键 `HR_OVERTIME:{requestId}:COMPENSATORY` | 重投或人工重试可用新的消息键，最终业务来源键固定。调班按来源申请+员工+日期唯一，正常结算与关账补正互斥；普通写接口不得传或改自动来源字段。 |

旧加班页面、考勤通用时间申请页、字典消费、演示数据和算薪读入口属于同一切换清单。代码中 LEAVE/OVERTIME 等字符串不能全仓替换；只调整命中本项语义的入口，其他模块同名字典值、请假/补卡枚举和已验收 D 算法均保持。

## 6. 第六步：表数、菜单、种子与可执行验收

### 6.1 表数与实施清单

方案 A 新增 `hr_overtime_type`、`hr_overtime_request`、`hr_shift_request` 3 表，改 §2.4 的 5 张现有表，DB03 为 100→103；与主稿的 OA 新增 3 表合并后，全库 317→323、正式 01—05 为 50/45/103/90/35。方案 B 新增 2 表，DB03 为 102、全库 322；不在同一份脚本保留两套模型。菜单、字典、规则、薪资项目、流程及配置只是数据种子，不增加新表。

确认后将 DDL 合入 `03.cloudflow-hr.sql` 原定义，种子合入 `06.cloudflow-business-seed.sql` 及已有演示生成器，`07.cloudflow-demo-seed.sql` 只由生成器生成。设计稿中的 ALTER 是差异说明，不生成迁移脚本、不直接对当前库执行。本项不新增任务表、不增加定时任务；可靠启动/取消、结算/排班事件复用现有 Outbox 扫描与消费者。主稿的草稿清理及 OA 两项任务由各自负责人维护。

后续实施顺序为：确认 Q1—Q3 → 表/字典/受限审批注册 → 加班核定与结算 → 调班同意与原子应用 → 六步联验及 D 回归。前后端、审批事件和种子必须在同一发布中切换，禁止出现独立表已建而旧 OVERTIME 通用改状态仍可结算的中间交付。

### 6.2 精确菜单与旧入口切换

新增 19 条菜单/权限，使用 1830—1848，1849—1859 保留为空。C 为可打开的页面，F 为操作权限；所有 C 直接挂既有 HR 目录 7，避免员工入口依赖管理菜单 725。新行统一 status=0、visible=0、is_frame=1，order_num=menu_id；F 不填可导航路径和组件，各 C 只填写自身的一种入口权限，不用逗号表达权限 OR。

| menu_id | 名称 | 类型/parent_id | 权限码 | 路由/组件或职责 |
| --- | --- | --- | --- | --- |
| 1830 | 我的加班 | C/7 | `hr:overtime:mine` | `/hr/ess/overtime`；`pages/OvertimeApplicationPage`，复用文件并改接本人接口 |
| 1831 | 申请加班 | F/1830 | `hr:overtime:apply` | 本人创建、修改、草稿删除、预览与提交 |
| 1832 | 撤回加班 | F/1830 | `hr:overtime:cancel` | 仅本人审批前撤回 |
| 1833 | 加班管理 | C/7 | `hr:overtime:list` | `/hr/overtime`；`pages/hr/HrOvertimePage` |
| 1834 | 核定工时 | F/1833 | `hr:overtime:verify` | 工时核定/拒绝及调休结果裁剪视图 |
| 1835 | 核定加班费 | F/1833 | `hr:overtime:price` | 财务逐单核价 |
| 1836 | 查看加班费结算 | F/1833 | `hr:overtime:finance` | 数据范围内他人 PAY 结算详情 |
| 1837 | 重试加班结算 | F/1833 | `hr:overtime:retry` | 限原依据及可重试错误，并按报酬模式校验资格 |
| 1838 | 处置结算异常 | F/1833 | `hr:overtime:resolve` | 显式结案/补入/补正，非本人且分模式校验 |
| 1839 | 导出加班记录 | F/1833 | `hr:overtime:export` | 与管理列表相同范围，默认无薪资字段 |
| 1840 | 加班规则 | C/7 | `hr:overtime-type:list` | `/hr/overtime-types`；`pages/hr/rules/HrOvertimeTypePage` |
| 1841 | 新增加班类型 | F/1840 | `hr:overtime-type:add` | 只创建停用类型 |
| 1842 | 调整加班规则 | F/1840 | `hr:overtime-type:edit` | 编辑及经过完整校验的启停 |
| 1843 | 我的调班 | C/7 | `hr:shift-request:mine` | `/hr/ess/shift-requests`；`pages/hr/ess/HrEssShiftRequestPage` |
| 1844 | 申请调班 | F/1843 | `hr:shift-request:apply` | 本人草稿、预览、提交 |
| 1845 | 撤回调班 | F/1843 | `hr:shift-request:cancel` | 仅申请人审批前撤回 |
| 1846 | 换班邀请 | C/7 | `hr:shift-request:respond` | `/hr/ess/shift-invitations`；`pages/hr/ess/HrEssShiftInvitationPage` |
| 1847 | 调班管理 | C/7 | `hr:shift-request:list` | `/hr/shift-requests`；`pages/hr/HrShiftRequestPage` |
| 1848 | 重试调班应用 | F/1847 | `hr:shift-request:retry` | HR 对已通过且应用失败的原快照重试 |

当前 06 的实际入口是 725 `/hr/attendance`（`hr:attendance:list`），写权限为 938/939/940（add/edit/remove）；728 为 `/hr/ess`。这些菜单保留请假、补卡、考勤及其他原职责，H 不借用它们的权限控制新加班。现有 OvertimeApplicationPage 文件没有独立种子菜单，不能声称复用某个不存在的旧 menu_id；使用上表的 1830 明确接入动态路由。

旧 HrAttendancePage 的申请选项移除 OVERTIME，旧时间申请服务、通用状态动作、旧加班回调同时拒绝该旁路；其他请假、补卡及 D 已有 BUSINESS_TRIP 读取保持。原 `hr_attendance_request_type` 字典按实际消费者处理：方案 A 移除旧加班可写选项，方案 B 仅为受限内部记录保留，不能重新开放旧通用界面。通用表单 `form_overtime_request` 的手填小时/中文报酬选择不再充当正式入口，工作台卡片改跳转受权限保护的业务页面。

上线前对 `sys_menu`、前端路由及组件匹配做逐行检查；菜单搜索只收录当前用户可见的 C 页面，不展示 F 操作。动态路由的权限列表是 AND 语义，各页面不能写 `mine,list` 期待任选其一；详情是否可操作由后端 allowedActions 与服务校验共同决定。

### 6.3 十一角色最小授权矩阵

下表是待确认的新授权，不改变各角色原权限。S 精确表示 1830、1831、1832、1843、1844、1845、1846 共 7 项本人功能；无有效员工关联时不可申请，管理员也没有代本人或代对方同意的豁免。各角色仅保留/补齐目录 7，不附带 725 或额外管理按钮。

| role_id/role_key | 新 HR 菜单集合 | 数据与操作边界 | 原通用流程发起权 |
| --- | --- | --- | --- |
| 1/admin | 1830—1848 全部 | 租户内受控管理，仍禁止代同意、自审及伪造来源 | 保持有 |
| 2/manager | S + 1833、1847 | 本人申请；管理列表仅授权部门，无 HR 核定/财务核价 | 保持有 |
| 3/finance | S + 1833、1835、1836、1837、1838 | 核价及 PAY 结算/处置，仍受 HR 数据范围；补正另需原 correct 权限 | 保持有 |
| 4/hr | S + 1833、1834、1837、1838、1839、1840、1841、1842、1847、1848 | 工时、调休、加班规则、调班及裁剪导出；不授予 1835/1836，不读他人时薪 | 保持有 |
| 5/employee | S | 仅本人申请、撤回与本人收到的邀请 | 保持有 |
| 6/legal | S | 同上，不获得通用流程能力 | 保持无 |
| 7/oa_clerk | S | 同上，不获得 HR/OA 之外管理权 | 保持无 |
| 8/sales_manager | S + 1833、1847 | 本人申请；管理列表仅授权部门 | 保持有 |
| 9/sales_rep | S | 仅本人及本人邀请 | 保持有 |
| 10/crm_ops | S | 仅本人及本人邀请，不获得通用流程能力 | 保持无 |
| 11/customer_success | S | 仅本人及本人邀请，不漏掉第 11 角色 | 保持无 |

这些集合去重后为 108 对新 role_id/menu_id，不含已存在的目录授权。种子逐角色显式插入允许的配对并断言差集为空，不用全角色 CROSS JOIN 整段菜单，不以 INSERT IGNORE 隐藏冲突。`workflow:process:start` 仍只有 1/2/3/4/5/8/9；业务申请走受限内部链路。正式审批人须另有既有任务办理权限，H 不给无资格者补权限后再当默认审批人。

财务与 HR 对共享 retry/resolve 按 §3.2 再分别验证 price/verify；结算查询用模式裁剪，不能为方便 HR 查看调休而授予薪资详情权。拥有多角色时取真实授权并集，仍执行租户、员工数据范围和非本人校验，不靠前端角色名字符串放行。

### 6.4 基础种子、审批和演示场景

种子使用实际表的 tenant+业务代码查重，业务主键由真实自增或已核对的映射取得；未提供的公司规则保持停用或空配置。菜单编号固定如上；字典、规则、薪资项、消息的主键不是 menu_id，不拿菜单空段推断其他表无冲突。

| 类别 | 完整种子内容与约束 |
| --- | --- |
| 类型主数据 | 按 WORKDAY/REST_DAY/HOLIDAY 各 1 条，名称“工作日加班/休息日加班/法定节假日加班”，type_code 与 applicable_day_type 一致；倍率先记 PRD 的 1.50/2.00/3.00，status=0、need_approval_flag=1、compensatory_flag=0、ratio/目标假种/日月上限=NULL。remark 标明“待公司核定，禁止生产启用”；项目、额度、期限和上限完整核定后再启用。 |
| 薪资项目 | 在既有 hr_comp_component 新增业务代码 OVERTIME、名称“加班费”、component_type=VARIABLE、category=OTHER、taxable=1、status=0、sort_order=40、version=0；按 tenant+component_code 取得 ID，不能固定填现有 BONUS 的102。财务核定后启用，类型引用该 ID；不修改 BASE/ALLOWANCE/BONUS 原行为。 |
| 调休假种 | 复用 tenant+COMP_TIME 的真实假种，现 id=102；不新增同义假种。Q2 选择沿 D 周期/结转策略后，清除误导的未实现 expiryDays=90 规则并核定 need_quota=1、unit=HOUR、compensatory_flag=1；若明确要求逐笔90天，则先补设计与算法，未补齐前保持新类型不可转入。 |
| 业务规则 | 新增 rule_code=hr.overtime.hours.limit、module=hr、threshold_value=NULL、effect=BLOCK、enabled=0、priority=100；remark 指明阈值权威在类型表。BLOCK 是建议的停用草案，启用时确认 BLOCK/WARN 并生成既有版本记录；不得沿用请假规则阈值5。 |
| 流程配置 | `sys.hr.overtime.processKey=overtime_request`；`sys.hr.shiftRequest.processKey=hr_shift_request`。加班复用真实 definition_id=wf_overtime_request 的原定义位置并改安全模型；调班新增 definition_id=`batch-h-hr09-shift-<tenantId>`、同租户 process_key=hr_shift_request。定义ID不作为启动key，多租户记录分别隔离。 |
| 审批人配置 | 建议沿现有加班的“负责人→人事”两节点，调班同样两节点；加班前置工时/核价仍独立。`sys.hr.overtime.approvalUsers`、`sys.hr.shiftRequest.approvalUsers` 值为严格 JSON `{responsibleUserId,hrUserId}`，每项为一个已核实用户ID字符串；默认空配置，用户确认两类负责人与HR人选后填写。两人须有相应办理资格且均排除申请人/互换对方；缺人、重复人或失效时阻塞，不默认使用用户1。 |
| 调班休息配置 | `sys.hr.shift.minimumRestMinutes` 初始空值；由 HR 明确非负整数后使用。0 必须是显式确认值，表示不设额外间隔，但仍禁止交叠；配置缺失与0不可等同。 |
| 字典复用 | `hr_overtime_type` 改 WORKDAY/REST_DAY/HOLIDAY；`hr_overtime_compensation_type` 改 PAY/COMPENSATORY；`hr_overtime_status` 完整为 DRAFT/SUBMITTED/PENDING/APPROVING/APPROVED/REJECTED/CANCELLED，中文依次为草稿/待核定/待启动审批/审批中/已通过/已拒绝/已撤回。不改其他业务的同名状态。 |
| 新状态字典 | `hr_overtime_settlement_status`：NOT_READY/PENDING/SETTLED/FAILED/NEEDS_RESOLUTION/CORRECTION_PENDING/REJECTED（未就绪/待结算/已结算/执行失败/待人工处置/补正审批中/自动结算已结案）；`hr_shift_request_mode`：SINGLE/SWAP；`hr_shift_request_status`：DRAFT/WAITING_ACCEPTANCE/PENDING/APPROVING/APPROVED/REJECTED/CANCELLED；`hr_shift_peer_acceptance_status`：NONE/PENDING/ACCEPTED/DECLINED；`hr_shift_application_status`：NOT_READY/PENDING/APPLIED/FAILED。字典数据按 tenant/type/value 唯一，并同步前端类型。 |
| 消息模板 | 新增 `HR_OVERTIME_ACTION_REQUIRED`、`HR_SHIFT_REQUEST_INVITATION`、`HR_REQUEST_EXECUTION_RESULT`，统一 INTERNAL、biz_module=hr、BIZ_REMINDER；params_declare 只声明必填 requestNo/status/actionLabel/linkUrl，标题分别为“加班申请待处理/收到换班邀请/申请执行结果”。正文“单据 ${requestNo}，状态 ${status}；${actionLabel}”，link_url_template=${linkUrl}，只取服务端生成的受保护站内路径；沿既有占位符替换器，不引入模板表达式。force_send_flag=0、dedupe_window_sec=300、status=ENABLED、deleted=0、version=0。按 tenant/template_code/channel_type 查重，不占用1450或1750等既有模板；只启用站内信，不依赖SMTP。 |

审批模型明确为 START→responsible APPROVAL→hr APPROVAL→END，两个节点均 VARIABLE_USER；approverValue 分别为服务端变量 responsibleApproverIds、hrApproverIds，每个列表严格只有一个合格用户。设置禁止转办/加签，不采用空审批人自动通过；§4.4 的独立自审防线必须同时实现。只在审批人及模型验证通过后发布；空配置不通过 PUBLISHED 演示定义伪装可用。旧 form_overtime_request 的演示表单不再接收可影响实际工时/金额的用户值，工作台入口转到专项页面。

HR_OVERTIME 和 HR_SHIFT_REQUEST 的业务类型注册在代码中与真实表绑定；启动/取消仍用既有事件，新增结算/应用事件依 §4.4。收到换班邀请只通知真实对方用户；待核定/核价只通知具有对应动作权限且在该员工数据范围内的经办人；执行结果通知原申请人，调班还通知实际对方，并使用可见字段裁剪。既有流程待办通知继续复用，不重复新建通知渠道或定时任务；消息按申请ID+状态/版本去重，不携带工资明文或密文。

旧 06 直接插入的 OVERTIME/APPROVED 示例与手填小时的流程演示随方案 A 移出旧表；新业务正式初始种子仅创建可重放的 DRAFT，APPROVED/SETTLED/APPLIED 等状态必须由实际审批与业务动作产生。生成器按符号引用真实员工、用户、日历、班次、周期和类型ID，不预造流程实例或虚构不存在的表。07 只重新生成，不手工拼改。

最小演示场景：同租户有真实登录关联的申请人和同部门对方，以及排除双方的负责人、HR和财务；三个日类型、一个已核定的HOUR假种和开放周期、相应加班费项目/后续工资周期、两种真实班次。基础数值只用 §6.5 的明确测试规则；未核定生产税表、倍率、上限、比例/期限、休息或人选时，演示不能被标为生产政策已生效。每次重跑校验业务代码、载荷与来源一致，发现同键不同内容就失败，不清库后假报幂等通过。

### 6.5 原 PRD 验收逐项落点

以下均是确认后执行的验收要求，当前未执行、未标通过。只使用既有真实表、服务、角色和工作流；测试规则、时薪、日历与人员明确标注为验收用例，不能当作公司已核定政策。原 PRD 未覆盖的核定、撤回、失败处置和权限边界依 §6.6 一并验收。

| 原验收项 | 可操作输入与检查 | 通过条件 |
| --- | --- | --- |
| AC-1 自动分类 | 在实际 A 日历分别配置并读取 WORKDAY/0、REST/0、HOLIDAY/1，提交对应日的真实申请；尝试篡改客户端类型 ID | 服务端分别匹配 WORKDAY/REST_DAY/HOLIDAY 主数据，保存日历依据；客户端指定类型无效或被拒绝。缺日历/停用类型/矛盾 flag 均阻塞，无伪造默认倍率。 |
| AC-2 节假日与补班 | 验收类型倍率显式核定为 1.50/2.00/3.00；分别覆盖 HOLIDAY/1、HOLIDAY/0、REST/0、WORKDAY/0 的调休补班日 | HOLIDAY/1 匹配 3.00；HOLIDAY/0、REST/0 匹配休息日 2.00；调休补班的 WORKDAY/0 匹配 1.50。原 PRD“调休日匹配2倍”仅指休息日，不能把补班日也算2倍。 |
| AC-3 加班费入薪 | 真实成对打卡产生 120 核定分钟，测试时薪 20.00、倍率 1.50；财务明确下一 OPEN 工资周期，经真实审批后结算、D 批次算薪 | 建立 1 条 HR_OVERTIME/OVERTIME 来源变动，密文金额解密为 60.00；只在指定周期进入指定 VARIABLE 项并纳入应发/个税，其他周期不重复计入；员工列表和工作流变量无时薪明文。缺已核定税表时该端到端项保持阻塞，不能用测试1451冒充正式税表。 |
| AC-4 调休转入 | 合格 HOUR 假种、OPEN 原周期、已核定比例 1.00；批准 120 分钟并完成结算，再走 D 的真实调休请假审批 | 产生 1 条 COMPENSATORY 来源台账、授予 2.00 HOUR，额度同步；D 请假冻结/扣减按小时正确变化。重复回调无第二笔；零差额、拆单和关闭周期见 §6.6。 |
| AC-5 上限 | 测试配置日限 3.00 小时、月限 10.00 小时，分别运行 BLOCK/WARN；使用跨类型、不重叠的申请与并发提交 | 在 180/600 分钟边界允许，超出 1 分钟触发对应维度；BLOCK 无提交成功，WARN 有警示并留实际命中。并发总量不可绕过；核定报酬分钟减少不减少实际工时占用；拒绝/取消释放申请占用。 |
| AC-6 调班应用 | 选择未来实际工作日与真实员工/规则，分别完成 SINGLE 和同部门 SWAP；SWAP 先由被邀请人本人同意，再由排除双方的审批人通过 | SINGLE 新增 1 条、SWAP 同事务新增 2 条员工单日覆盖；真实日历解析结果均符合快照，旧排班保留。非本人不能代同意；任一写入失败两方均不改变，缓存只在提交后按既有接口失效。 |
| AC-7 既有行为回归 | 运行已验收 D 的请假、补卡、日/月考勤、工资与实际存在的 BUSINESS_TRIP 读取路径 | LEAVE/SUPPLEMENT/BUSINESS_TRIP 不因 H 改名或全仓替换而改变；非 H 工资变动、手工假期账与普通排班仍遵循原规则。方案 A 的旧 OVERTIME 入口明确拒绝，不能以保留旧旁路充当回归兼容。 |

### 6.6 安全、并发及业务边界验收

| 场景 | 具体操作 | 必须可观察的结果 |
| --- | --- | --- |
| 创建重放与版本 | 同 Idempotency-Key/载荷立即重放及并发创建；随后编辑，再重放初次创建；同键改载荷，另以旧 version 修改 | 同键同载荷仅 1 单，立即重放进入持久幂等逻辑，编辑后返回当前允许读取结果；不同载荷与旧版本为 409。删除草稿后同键不复活，不返回其他员工记录。 |
| 逐单越权与角色 | 对 11 角色逐一测试本人、同范围、范围外和另一租户的列表、详情、导出、核定、核价、重试、处置与邀请 | 所有者及数据范围在后端生效；普通员工没有管理写权限，HR 无权查看 PAY 时薪，财务不能借核价权限改调班；管理员不能代对方同意或自审。伪造 tenantId、employeeId、source 字段被拒绝。 |
| 审批可靠性与自审 | 工作流不可用、成功但响应丢失、重复/乱序回调、伪造 instanceId/租户；审批任务被重新指派给申请人或 SWAP 对方 | 启动可恢复并只绑定同一业务实例；伪造/过期回调无副作用；双方均不能终审。没有合格审批人时阻塞，不自动通过、不扩大通用流程权限。 |
| 取消与通过竞争 | 同时发撤回和可信通过，覆盖启动前、启动响应丢失和 APPROVING；取消后提交新的重叠单 | 锁及状态决定唯一结果：取消胜出无台账/工资/排班，通过胜出撤回被拒。取消未完成时不允许新的重叠生效单；已通过不能调用普通作废接口反向抹账。 |
| 原始证据与阈值 | 时段未结束、缺成对卡、休息不明确、skip_auto、跨夜；同日分两笔申请，阈值 30 分钟且总可计原区间 120 分钟 | 不完整证据阻塞，不制造卡或改历史卡；可计总分钟为 90，不重复扣阈值，也不把不在有效工作区间的空档算进加班。跨自然日拆单后分钟不重叠，考勤仍按班次日归属。 |
| 重叠与封账 | 两张重叠加班、与已提交/批准请假重叠、与待生效调班冲突；考勤月已 CONFIRMED 后新增/核定或写相关加班卡 | 冲突拒绝且无部分入账；核定分钟不能超过实际分钟。日历、班次或规则版本在冻结期间改变时报告快照冲突，不静默重算已批准依据。 |
| 调休防拆单 | 同员工/假种/原周期、比例 1.00，3 笔各 1 分钟顺序入账，再覆盖 60 笔、倒序、不同类型/比例版本、并发及重复消息 | 3 笔结果为 0.01/0.02/0.02 小时，60 分钟合计 1.00；总额等于累计精确 weighted 向下取两位。累计历史量与已记数量不一致必须停止，不通过补发掩盖；余量策略与用户确认一致。 |
| 零差额与非法单位 | 用已核定的小比例生成小于 0.01 小时的单笔差额，再提交后续单；尝试 DAY、compensatory_flag=0 或未启用假种 | 零差额申请 SETTLED/quantity=0/leaveLedgerId=NULL，无零数量 D 台账；其分钟参与后续累计。非法假种拒绝，不能默认一天8小时或默认为90天有效期。 |
| 周期关闭与人工处置 | 核定前关闭目标；并发关账/结算；PAY 审批期间真实算薪产生覆盖；单测覆盖目标被旁路关闭的异常状态 | 前置关闭返回 409；关账/入账使用同锁且无部分成功。永久失败进入 NEEDS_RESOLUTION，普通 retry 返回 RESOLUTION_REQUIRED；显式新目标保留原快照，正常转入与补入共用来源键。不能无限重试关闭周期。 |
| 调休补入与终止 | 在 NEEDS_RESOLUTION 用有权 HR 选择新的 OPEN 假期周期并提交两次；再测试目标再次关闭和 REJECT 分支 | 只有一次差额入账，仍用原累计组；新目标关闭时保持待处置。终止记录经办人/原因/原目标且不删账、不释放已发生工时、不表述为放弃权益；未经 Q2 批准不开放该动作。 |
| 真实工资补正 | PAY 原目标已生成并实际 PAID，财务持现有 correct 权限选择真实后续周期；并发 resolve、D 通过/拒绝、目标异常关闭 | 仅 1 个关联 D 补正且不再生成普通变动；原工时/金额/周期不变。只有 APPLIED 才置 H SETTLED；没有 PAID 原单明确拒绝，不能造单或改状态。D 拒绝/未应用目标关闭按 §4.5.3 结案，保留真实审批结果，不取消已 APPLIED/PAID 结果。 |
| 调班同意与休息 | SWAP 对方拒绝、越权代同意、同意后源排班改变；SINGLE/SWAP 跨午夜，前后班次交叠或不足已核定休息间隔 | 拒绝后无流程、无排班；过期同意不可复用；缺最短休息配置时不能提交。检查两方前后实际时间，不只检查日期；首期跨部门/跨日期/空休息班交换均拒绝。 |
| 调班原子应用 | 双方并发申请同一日，第二条排班写入失败，重复应用消息；通过通用排班接口改写 H 来源行 | 不产生单边换班、重复覆盖或静默覆盖新来源；失败状态可解释且不冒称已应用。受保护来源拒绝通用改写，普通无 H 来源排班回归不变。 |
| 账务与来源保护 | 对 H 台账调用通用冲正，对 H 薪资变动调用普通新增/改状态/删除，篡改金额、项目、周期或来源键 | 明确拒绝；重复消费者验证已有结果并返回，不忽略逻辑删除/取消记录再生成一笔。任何临时失败不能把另一消费者已完成的 SETTLED/APPLIED 覆盖为 FAILED。 |
| 日志与金额隐私 | 对核价/结算/关联补正发送正常、精度越界、格式错误 JSON、缺字段、权限失败请求；检查全部应用/错误/前端日志和审计 | 日志只含白名单元数据，正文、rejectedValue、异常原文、时薪/金额/cipher 均不出现；数据库金额加密，授权本人/财务详情正常，其他界面和导出无泄露。不能只检查成功响应。 |

### 6.7 可转为检查脚本的账务不变量

以下是设计阶段的只读核验 SQL，不在本轮执行。实施时由既有测试工具绑定 `tenantId` 等参数，并限制到明确的验收人员/周期；预期异常查询返回 0 行。不得打印工资解密结果到报告，金额比对在受控断言中执行。

同员工、假种和原周期，已结算调休数量必须等于累计精确量向下取两位；包括零差额和显式补入新周期的申请。

```sql
SELECT employee_id, leave_type_id, leave_period_id,
       SUM(compensatory_quantity) AS credited_hours,
       FLOOR(SUM(approved_minutes * compensatory_ratio * 100) / 60) / 100 AS expected_hours
FROM hr_overtime_request
WHERE tenant_id = :tenantId
  AND employee_id = :employeeId
  AND settle_mode = 'COMPENSATORY'
  AND settlement_status = 'SETTLED'
GROUP BY employee_id, leave_type_id, leave_period_id
HAVING SUM(compensatory_quantity) <> FLOOR(SUM(approved_minutes * compensatory_ratio * 100) / 60) / 100;
```

调休正差额必须回指同租户、同员工、固定业务来源的台账；零差额没有台账引用。

```sql
SELECT request_row.request_id
FROM hr_overtime_request request_row
LEFT JOIN hr_leave_ledger ledger_row
  ON ledger_row.tenant_id = request_row.tenant_id
 AND ledger_row.ledger_id = request_row.leave_ledger_id
WHERE request_row.tenant_id = :tenantId
  AND request_row.employee_id = :employeeId
  AND request_row.settle_mode = 'COMPENSATORY'
  AND request_row.settlement_status = 'SETTLED'
  AND (
    request_row.compensatory_quantity IS NULL
    OR (
      request_row.compensatory_quantity = 0
      AND request_row.leave_ledger_id IS NOT NULL
    )
    OR (
      request_row.compensatory_quantity > 0
      AND (
        ledger_row.ledger_id IS NULL
        OR NOT (ledger_row.employee_id <=> request_row.employee_id)
        OR NOT (ledger_row.leave_type_id <=> request_row.leave_type_id)
        OR NOT (ledger_row.transaction_type <=> 'COMPENSATORY')
        OR NOT (ledger_row.quantity_unit <=> 'HOUR')
        OR NOT (ledger_row.source_biz_type <=> 'HR_OVERTIME')
        OR NOT (ledger_row.source_biz_id <=> CAST(request_row.request_id AS CHAR))
        OR NOT (ledger_row.source_event_key <=> CONCAT('HR_OVERTIME:', request_row.request_id, ':COMPENSATORY'))
        OR NOT (ledger_row.leave_days <=> request_row.compensatory_quantity)
      )
    )
  );
```

应用成功的调班必须有完整且唯一的来源排班；之后的新申请可以覆盖它的生效优先级，但不能删除这些历史来源行。

```sql
SELECT request_row.request_id, request_row.request_mode,
       COUNT(assignment_row.id) AS assignment_count
FROM hr_shift_request request_row
LEFT JOIN hr_schedule_assignment assignment_row
  ON assignment_row.tenant_id = request_row.tenant_id
 AND assignment_row.source_shift_request_id = request_row.request_id
 AND assignment_row.target_type = 'EMPLOYEE'
 AND assignment_row.schedule_date = request_row.from_date
 AND (assignment_row.target_id = request_row.employee_id
      OR assignment_row.target_id = request_row.swap_employee_id)
WHERE request_row.tenant_id = :tenantId
  AND request_row.application_status = 'APPLIED'
GROUP BY request_row.request_id, request_row.request_mode
HAVING COUNT(assignment_row.id) <> CASE request_row.request_mode WHEN 'SINGLE' THEN 1 ELSE 2 END;
```

另以脚本断言：每个 PAY 正常结算申请仅有同源 hr_comp_change，工资 components 中同一个 changeId 只出现一次且周期一致；PAY_CORRECTION 分支只有关联补正、没有同源普通变动。重试前后比较台账数、额度、工资来源、排班来源与业务状态，不能只以接口返回 200 判断成功。

### 6.8 工程与前批回归出口

依通用约束执行 Maven validate/后端构建、完整 HR/工作流启动及高风险审计检查，前端 type-check/build，新增接口权限守卫和静态规则、XML SQL、自增/注释/索引、menu_id 冲突与 11 角色授权核验。新外部接口不能只有登录注解；远程 start/cancel 不进入本地数据库事务；不新建解析器、任务调度器或测试框架。

回归沿 `scripts/verify-batch-d.ps1`、`scripts/verify-batch-d-db.ps1`、`scripts/verify-batch-d-workflow.ps1`、`scripts/verify-batch-d-ui.mjs` 及已有 hr-checks 的实际内容，先检查参数和副作用再安排实施运行；不盲跑历史重建、清缓存或恢复脚本。DE-20260912 仅代表既有已验收范围；税表/有效期/审批人未核定、C 子表未实现及其他批次延后项分别列明，不用 H 的成功用例冲销这些阻塞。

主稿范围与方案 A 已获用户确认并实施；本文测试数值和预期结果仍只用于复现验证，正式政策须另行核定。实施记录分别标明已通过、仅临时配置验证、尚未覆盖和前置阻塞，未核定政策不记为生产可用。

## 7. 用户确认后的实施记录

方案A的三张人事业务表、既有来源字段和工作流接线已实施，2026-09-15本轮验收及恢复完成。日历显式标记与分钟核算127项、关闭周期处置及关闭保护257项、限额250项通过；此前加班审批、累计调休、双人调班、核价算薪、发放及工资补正保留实际办理证据。最新源码的隔离库16组861项通过，工资及补正日志隐私单列；覆盖汇总逐份校验线上报告与源码摘要，16项覆盖均有明确证据类型。

逐项结果及保留边界见[H首轮实施与验收记录](H-首轮实施与验收记录.md)。临时工资加密已恢复关闭，自有薪资依据、周期配置和借用身份逐项恢复；测试密钥仍由Windows当前用户保护以复核合成数据，不能用于正式上线。倍率、比例、期限、上限及审批人等未核定规则继续保持正式停用或空值边界。
