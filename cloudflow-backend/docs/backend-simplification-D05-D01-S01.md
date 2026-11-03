# D05、D01、S01 改造记录

本分工记录由主审计文档汇总；保留现有工作区修改。测试数据全量重建，不保留旧格式兼容。

| 项目 | 已核实问题 | 处理与验证 | 状态 |
| --- | --- | --- | --- |
| D05 | 注册使用 HR_RECRUITMENT、HR_LIFECYCLE、HR_TIME_REQUEST、HR_COMP_CHANGE，回调仍使用 RECRUITMENT_REQUEST、ONBOARDING 等，简单剥离 HR_ 无法对应；绩效注册只有一项，实际有计划与结果两条流程字段 | 统一正式业务类型常量，核对启动、回调副作用、对账字段及初始化样例 | 代码与测试完成，正式库重建通过 |
| D01 | HR 网页日期格式覆盖事件时间，消费端先后尝试三种日期格式 | 事件发生时间独立使用 ISO 本地日期时间，保留精度，网页格式不变 | 已完成 |
| S01 | 网关同时解析 data.available 和顶层 available，提供端固定 R 包装 | 仅解析当前包装，保留远程失败放行及不缓存失败的行为 | 已完成 |

## 基线静态规则

HrEmployeeOnboardingService 的事务方法同步启动远程流程；同类第 170、198 行使用 `.last("LIMIT 1")`。在不延长数据库事务到远程请求的前提下调整入职提交，并改用明确的分页/批量查询；完成后运行静态检查。

## 验证结果

D01：新增 HrEventTimeContractTest 通过，确认 HR 网页仍输出 `yyyy-MM-dd HH:mm:ss`，事件 `occurredAt` 输出 ISO 格式并保留 9 位纳秒精度，往返相等。首次 HR 全模块测试被同时新增的招聘测试失败阻断（expected 12, actual 0），已交招聘分工修正；本项相关测试和公共审计测试通过，待整体验证补记。

D05 范围核实：当前招聘、假勤通用状态操作及绩效 submitPlan/submitResult 仅更新本地状态，没有实际调用流程启动；此次统一现有契约，不增加未经业务确认的新启动流程。绩效回调原允许状态遗漏 PLAN_APPROVING/RESULT_APPROVING，本轮按阶段修正；对账分别使用 plan_process_instance_id/result_process_instance_id 和对应阶段状态，避免计划已结束但结果审批中被误报。

> 主代理调度：请读取 backend-simplification-coordination.md；MESSAGE 内容丢失，后续 Maven/npm 构建及依赖安装由主代理统一串行执行，请勿自行启动。继续改造，待验证命令写入本文件。


## 当前交付与待统一验收

- D05：新增 `HrWorkflowBusinessTypes` 供现有启动/撤销/回调/对账注册共享；删除大小写/连字符/前缀猜测。生命周期子类型从业务记录 `type` 读取。两类绩效流程分别匹配计划/结果实例列及审批状态。修正合同签署对账的 `sign_status`、考勤申诉对账的 `instance_id`。初始化回调示例的离职类型统一为 `HR_LIFECYCLE`。
- D05 基线修正：入职申请/明细/任务在短事务内提交后同步启动流程；不在远程请求期间持有数据库事务。成功仍返回流程编号并通过原审计入口回填。远程失败保留申请，已有 fallback 重试成功后回填编号；该重试租户验证改读 `TenantContext`，与事件消费者的 `TenantBroker.runAs` 一致。入职明细改分页读取，检查重复工号时批量读取待办入职明细，去除两处 `.last`。
- D01：事件字段显式绑定标准 LocalDateTime 序列化器，保留纳秒精度；消费端仅解析 ISO 本地时间。HR 网页日期配置保留。
- S01：网关使用明确响应记录读取 `data.available`。停用仍拒绝并缓存；调用错误、缺失包装仍按现有远程失败放行策略处理且不缓存。

首次 D05/S01 `verify` 在 common-event 依赖治理处中断：新增日期序列化器缺少直接 `jackson-datatype-jsr310` 依赖，已补入 pom。未继续自建，按统一调度交主代理运行最终验证。

新增待验收测试：`HrWorkflowCallbackContractTest`（正式类型、旧类型拒绝、绩效阶段、业务子类和幂等键）、`HrEmployeeOnboardingServiceTest`（远程启动前事务已提交、失败保留可重试申请）、`HrBusinessTypeRegistrationTest`（对账列与阶段）、`EventEnvelopeContractTest`（ISO 精度、拒绝旧日期格式）、`TenantStatusCheckerTest`（禁用缓存、失败放行不缓存、旧包装拒绝后不缓存）。`HrEventTimeContractTest` 已单次通过。

主代理待执行：`mvn -B -ntp -f cloudflow-backend/pom.xml verify`；本分工修改完成后不再自行运行 Maven。所有状态待主代理统一验证成功后标完成。

范围限制：招聘/假勤/绩效当前仅改变本地状态的提交入口没有新增远程启动，这属于既有业务缺口，未借精简改造扩充业务。入职远程启动返回业务拒绝且未投递重试消息时，已提交申请仍会保留，需按现有业务处理失败申请；不伪装成成功。

统一验证补记：主代理 12:08 全量 verify 中，cloudflow-common-static-rules 通过，原 3 项基线违规已清除；gateway 模块 verify 通过，TenantStatusCheckerTest 的 3 个测试全通过，S01 标完成。全量构建在 workflow 的 checkTenantIsolation 缺失处中断，HR 与 workflow 本分工新增测试尚待后续统一运行。

续接复核补充：工作流业务撤销入口仍有 HR_ 前缀剥离，已改为业务类型精确匹配，新增 WfBusinessBindingTest 验证裸 LIFECYCLE 不能撤销 HR_LIFECYCLE 实例；与启动、回调的单一正式契约一致。待主代理统一验证。

12:19 HR 定向 verify 补记：共 9 个 HR 测试全通过，包含 D01 的网页/事件纳秒精度、消费端 ISO 拒绝旧格式，以及 D05 的 3 个回调契约测试和 1 个事务边界测试。依赖治理随后因 C05 测试间接引用 Javers/AspectJ 阻断，已在协调记录提供不改变运行依赖的调整建议。D01 标完成；D05 的 workflow 对账注册及撤销精确匹配仍待统一测试。

## 主代理统一验证结果

2026-11-02 全后端 install 成功；独立复核修复后 HR verify、Workflow install 与 Auth verify 通过。当前45个测试无失败/错误/跳过，前端 type-check/build 通过；01—07已在隔离库和正式项目库成功导入。阶段记录中的待构建项已完成，页面交互和未接入业务能力不包含在构建通过结论内，最终运行结果以主审计文档为准。
