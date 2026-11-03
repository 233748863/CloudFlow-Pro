# D 盘改造与远程 dev 整合核对

2026-11-03，只读比较公共基线 `e0b9e7d27b7690e5eac5f3c02be55b59a52924bf`、远程 `origin/dev=ffebc351fb2a3e7777a473d0e2af6bf13054769b` 和 `D:\CloudFlowPro` 当前工作树。本文未执行合并、提交、推送或部署，也未修改生产源码。当前 D 盘仍含本轮未提交改造；下文“保留远程”表示保留对应功能片段并适配 D 盘最终协议，不表示以桌面版本覆盖 D 盘。

结论：D 盘新改造应作为费用累计、审计快照、消息占额、客户工作台、HR 业务字段与催办统计的最终实现；远程有 D 盘尚未包含的独立运行修复和字段调用方同步，必须在正常合并中保留。仅把远程历史接入后用整个 D 盘树覆盖，会重新引入旧网关和已删除 `leader` 列的调用。

2026-11-03 后续实施更正：Root 已按本报告分工迁入独立片段；下文表格保留原比较状态，不代表修复后的当前树。Workflow 已接入 `title/source/target` 简化、正式导出字段与 D `WorkflowStartPermissions` 预检，并按 HR 现行代码补工伤 `DETERMINING`、继任 `IN_PROGRESS`；本轮 D 录用正式业务类型继续为 `OFFER`，入职统一 `HR_LIFECYCLE`，没有照搬远程 `HR_OFFER` 整组。具体生产改动、46 项整合检查、局部读取检查及最终 Maven 编译退出 0 记录在 `backend-quality-refactor-20261102-d-workflow.md` 的“远程独立修复接入与覆盖核对”。本代理仍未执行 Git 合并、提交、推送或部署。

## 1. 必须保留或接通的远程片段

| 范围与精确文件 | 当前 D 盘 | origin/dev | 整合处理 |
| --- | --- | --- | --- |
| 网关认证线程：`cloudflow-backend/cloudflow-gateway/src/main/java/com/cloudflow/gateway/filter/AuthFilter.java` | `filter` 中使用 `Mono.fromCallable(() -> Optional.ofNullable(tokenService.verifyToken(rawToken))).subscribeOn(...).flatMap(...)`，`authenticated` 仍通过先前保存的 `request.mutate()` 转发 | 将 `verifyToken` 和 `authenticated` 的同步 Cookie 续期操作一起放进 `Mono.defer(() -> authenticate(...)).subscribeOn(Schedulers.boundedElastic())`；认证后使用 `exchange.getRequest().mutate()` | D 未修改该文件，可以保留远程完整修复。远程同目录测试 `src/test/java/com/cloudflow/gateway/filter/AuthFilterThreadBoundaryTest.java` 断言由 Redis 回调线程订阅时验证和 Cookie 配置读取均离开回调线程、同一请求只转发一次、伪造用户/内部调用头被删除；应保留并运行这项直接测试。 |
| 外部网关配置：`config/cloudflow-gateway.yaml` | 从 `cloudflow-auth` 路由开始；没有 `/oauth2/**` 和 `/portal/**` 专属路由；只有通用跨域规则 | 新增 `cloudflow-oauth2`、`cloudflow-portal-auth`，目标均为 `lb://cloudflow-auth`，均不剥离前缀；新增退订及门户跨域规则、通用 `X-Trace-Id` 暴露 | 保留远程整份配置差异。单改应用内路由不能代替外部列表配置同步。既有其他路由仍须保留。 |
| 通讯录：`cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/ContactMapper.xml` 的 `selectDeptTree`；`cloudflow-frontend/src/services/api/contact.ts` 的 `DeptNode` | SQL 仍选择 `sys_dept.leader`；前端仍声明 `leader?: string`。D 当前 DDL 已删除 `leader` | SQL 返回 `d.leader_user_id`，同租户关联 `sys_user` 得到 `leader_name`；前端声明 `leader_user_id?: number`、`leader_name?: string` | 两个文件成对保留；这是删列后的实际调用方修复。 |
| HR 负责人：`cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrAdvanceApplicationMapper.xml`、`HrOfferMapper.xml` 的 `departmentLeaders`；`client/dto/DeptCreateDTO.java`、`client/vo/DeptVO.java`、`client/vo/DeptTreeVO.java` | 两个 Mapper 仍按 `CAST(user_id AS CHAR) / user_name / nick_name` 匹配 `department.leader`；三个 DTO/VO 仍为 `String leader` | 两个 Mapper 统一 `user_row.user_id = department.leader_user_id`，保留租户、部门和用户有效条件；创建字段为 `Long leaderUserId`，查询同时有 `leaderName` | 保留远程对应片段；必须与 D 的 `leader_user_id` 结构同步，否则预支/录用负责人查询会访问不存在的列。已单独通知 Root。 |
| 内部部门入口：`cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/controller/RemoteAuthController.java` | `getDeptTree/getDeptById/createDept` 未补负责人名称/校验，仍有旧递归树代码 | 调用 `SysDeptLeaderService.fillNames/validate`，使用新 `DeptTreeBuilder` | 保留行为，优先复用 D 已存在的 `SysDeptAdminService.enrichLeaders/addDept` 与负责人校验；不要为了此入口同时维护两套负责人服务。若采用远程 `DeptTreeBuilder`，统一两个控制器的树构造使用点。 |
| HR 审批业务类型与实例字段：下文“HR 原子整合组” | 当前 `HrEmployeeOnboardingService` 仍发 `ONBOARDING`，录用仍发 `OFFER`；回调还剥离 `HR_` 猜类型，多个 `CallbackTarget` 的实例字段为空。工作流登记的工伤/继任待审批状态仍使用默认值 | `HrWorkflowBusinessTypes` 统一正式类型；生命周期为 `HR_LIFECYCLE`，录用为 `HR_OFFER`；回调显式 `processInstanceId`，绩效计划/结果分别匹配自己的审批状态；登记工伤 `DETERMINING`、继任 `IN_PROGRESS` | 此组包含真实审批实例/状态修复，必须把发送、回调、登记与种子作为一组整合，保留 D 新实现的工伤权限、结案时间、商城快照和证据授权。只改种子或登记会留下协议断裂。 |

外部网关的精确新增值：

```yaml
- id: cloudflow-oauth2
  uri: lb://cloudflow-auth
  predicates:
    - Path=/oauth2/**
- id: cloudflow-portal-auth
  uri: lb://cloudflow-auth
  predicates:
    - Path=/portal/**
```

跨域规则从远程保留：`[/crm/track/unsubscribe]` 允许 `GET/POST/OPTIONS`、`Content-Type`、不携带凭据、缓存 3600 秒；`[/portal/**]` 来源为 `${cloudflow.portal.public-url:}`，允许 `GET/POST/DELETE/OPTIONS` 与 `Content-Type/Accept/portal-token`，暴露 `X-Trace-Id/Retry-After`、不携带凭据、缓存 600 秒；通用规则新增暴露 `X-Trace-Id`。这些路由和跨域配置不自动启用门户或 OAuth2 业务开关。

通讯录关键 SQL 必须保持如下字段关系，避免恢复文本猜人：

```sql
SELECT d.dept_id, d.parent_id, d.dept_name, d.order_num,
       d.leader_user_id,
       COALESCE(NULLIF(u.nick_name, ''), u.user_name) AS leader_name,
       d.phone, d.email
FROM sys_dept d
LEFT JOIN sys_user u
  ON u.user_id = d.leader_user_id
 AND u.tenant_id = d.tenant_id
 AND u.deleted = 0
WHERE d.deleted = '0' AND d.status = '0'
ORDER BY d.parent_id, d.order_num
```

HR 原子整合组的精确文件清单（路径均以 `cloudflow-backend/` 开始）：

- 新增 `cloudflow-common/cloudflow-common-workflow-callback/src/main/java/com/cloudflow/common/workflow/callback/registry/HrWorkflowBusinessTypes.java`。
- HR `service/HrEmployeeOnboardingService.java`、`HrRecruitmentApprovalService.java`、`HrRuleWorkflowService.java`；`service/impl/HrWorkflowCallbackServiceImpl.java`；`event/consumer/WorkflowStartFallbackRetryConsumer.java`；`client/dto/ProcessStartDTO.java`。最后一个 DTO 的变更只有业务类型注释；重试消费者的远程变更是读取 `TenantContext.getTenantId()`，需要与本轮消费者上下文方式一致。
- HR `service/impl/HrBenefitRequestServiceImpl.java`、`HrCertificateServiceImpl.java`、`HrContractSignatureServiceImpl.java`、`HrTrainingEnrollmentServiceImpl.java`、`HrTalentReviewServiceImpl.java`、`HrTalentSuccessionServiceImpl.java` 的正式类型常量替换可以保留。`HrMallOrderServiceImpl.java`、`HrWorkInjuryServiceImpl.java`、`HrLaborDisputeServiceImpl.java` 同时有 D 新业务改造，应仅迁入正式类型与真实审批状态片段，保留 D 的全部新字段和授权行为。
- 工作流 `config/WorkflowBusinessTypeContributor.java`、`service/WorkflowHParticipantPolicy.java`；与 Root 的 06/07/生成器正式业务类型同步。
- 远程 `HrEmployeeOnboardingService.assertNoOtherActiveApplication` 还把逐申请读取入职明细改为一次 `application_id IN (...) AND detail_type='ONBOARDING'`，可保留独立的批量读取部分；申请排除与入职明细语义保持。

## 2. 应保留但需按 D 当前结构适配的其他片段

| 精确文件 | 远程改动 | D 整合约束 |
| --- | --- | --- |
| `cloudflow-backend/cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/event/SystemNoticeCreatedEvent.java` | `createTime` 显式 `@JsonFormat(shape=STRING, pattern="yyyy-MM-dd'T'HH:mm:ss.SSSSSSSSS")` | D 已固定外层 `BusinessEventEnvelope.occurredAt`，该片段固定内层通知时间；可保留后运行已有事件往返检查，不替换 D 的单层 Stream 运输实现。 |
| `cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/SecurityChangeNoticeService.java`、`TotpService.java` | `notifyTotpDisabled` 改名 `sendTotpDeactivationNotice` 并去掉发送提醒方法的多余 `@Audit`，调用方同步 | 两文件成对保留，真实关闭双因素操作及通知仍执行；避免只改一侧。 |
| `cloudflow-backend/cloudflow-gateway/src/main/java/com/cloudflow/gateway/filter/TenantStatusChecker.java` | `Map` 与顶层/嵌套双形态解析改为 `TenantStatusResponse(TenantStatus data)` | 属远程已经完成的单一响应简化，D 当前仍是旧代码。可保留；网络故障原有放行政策未变，不把本次改造成新的政策变更。 |
| `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/ScriptExecutionPolicy.java`、`util/VersionNumberGenerator.java` | 分别移除节点 `label`、连线 `from/to` 的旧别名读取 | 可保留，配合 D 已统一的 `title/source/target`，不改脚本执行权限和版本编号策略。 |
| `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/ExportServiceImpl.java` | 删除 metadata 中与正式字段重复的 `processKey/formId/startPermissionType/startPermissionValue/deptId`；非法 JSON 导出明确抛错 | 若保留，核对 D `ImportServiceImpl` 已使用正式 `WorkflowData` 字段，且不需要重复 metadata。不要只迁入删除而留下依赖重复 metadata 的读取。 |
| `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/validator/ImportValidator.java` | 在导入预检调用 `StartPermissionValues.validate(...)` | D `ImportServiceImpl` 已在实际创建/更新阶段调用自己的 `WorkflowStartPermissions.validate`。保留预检能力时应调用 D 规则，不新增一套 `StartPermissionValues`；特别是 D 对 ALL 要求空字符串，远程旧规则接受 `[]`。 |
| `cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/impl/CrmRenewalRiskEvaluator.java` | 新增 `enrichAll`，续约列表只读取和排序一次到期分档字典 | D 当前此类仍是基线版；远程调用已删除的 `CrmHealthCalculator.sortedTiers`，不能整文件直接取用。若保留批量优化，应将到期规则排序放在续约自己的处理内，调用方同步，不能恢复 D 已删除的健康计算旧接口。 |
| `cloudflow-frontend/src/components/TaskHandleModal.tsx`、`src/components/workflow/FieldPermissionDialog.tsx` | 节点显示统一 `node.title` | 可保留，兼容 D 当前类型；保持 D 的其他业务变更。 |

## 3. 已由 D 改造覆盖或取代，禁止旧实现覆盖的范围

| 范围 | D 当前最终方案 | 远程旧片段的处置 |
| --- | --- | --- |
| 审计与 HR 快照 | `@Audit(providedSnapshots=true)`、`AuditSnapshotContext`，复用脱敏前后值、缺身份/比较失败可观测 | 不恢复 `@Audit(captureChanges=true)` 和 `AuditChangeScope`；远程这套类及配套测试引用不同方法签名，需要迁移断言或使用 D 已通过的检查。 |
| 客户工作台/账龄 | `CrmCustomerHealthService`、`CrmHealthCalculator.HealthSnapshot`、`CrmReceivableAging`；同请求一次事实读取、授权列表和字典快照 | 不恢复 `CrmCustomerHealth` 实体和 `ICrmCustomerService.refreshHealth(customer, health)` 等旧接口；远程工作台测试仍依赖这些旧接口，不能原样纳入。 |
| 费用标准 | 实际城市、发生日期、四周期累计、提交占额/撤回释放、申请人行锁、事件失败回滚 | 保留 D 的 `OaExpenseLimitCalculator`、新增明细 city、Mapper 聚合查询及 3 依赖构造器；远程单纯“标准维护/逻辑删除”已被 D 覆盖。远程 `OaExpenseStandardTenantTest` 仍调用单参数构造器，须按新 API 改造。 |
| 发起权限 | `WorkflowStartPermissions` 和 D 前端选择器；ALL 空值，其他类型 JSON 字符串编号数组 | 不恢复远程 `StartPermissionValues`、`StartPermissionSelector` 及强制所有 `startPermissionValue` 默认为 `[]` 的编辑器片段；否则与 D 后端 ALL 规则冲突。 |
| 部门审批负责人 | D `WorkflowDepartmentLeaders`，无有效负责人向上查找，仍无人明确拒绝；OA/CRM 保留同租户和父链校验 | 远程早期策略仅作为字段迁移证据，不能覆盖本次用户已确认的找人规则。Auth 展示/内部入口按第 1 节补齐。 |
| HR 业务字段 | 工伤父案授权、事发部门/结案时间，商城排序/物流/取消原因与下单快照，争议证据授权下载和文件名快照 | 保留 D 新功能；远程旧删字段清单不可套用。 |
| 通知尝试与事件 | D `sys_message_delivery_attempt` 实际尝试占额，单一事件对象/文本运输、固定事件时间、缺租户明确失败 | 不恢复远程未包含的新表删除或旧解密历史尝试扫描。 |
| 催办统计 | D `history_id -> urge_id` 真实完成关联，最后催办到完成耗时、桌面和手机展示 | 远程旧 `wf_urge_effect` 字段和种子均由 D 取代，不能恢复猜测评分/冗余耗时列。 |
| 数据库与种子 | Root 正在同步的 D 01—07、生成器，包含上述新业务与正式协议 | 全部以 D 验证通过的最终结构/数据为准，逐项保留需要的远程独立修复，禁止整份远程 SQL 覆盖。 |
| 报表组件 | D 当前新补的 `ReportFilterEditor/ReportResultView/ReportShareDialog/report.css` 由平台代理统一类型与构建检查 | 远程也补过同名缺失文件，两者不能机械覆盖；最终取经当前接口验证的一套，`.gitignore` 已相同为 `/reports/`。 |

远程各模块 POM 的主要新增是测试依赖，保留相关测试时可以保留。仅追加远程 `src/test` 并不能证明 D 新业务通过：已确证 `OaExpenseStandardTenantTest` 使用旧构造器、`CrmCustomerWorkspaceServiceImplTest` 使用旧健康接口、`AuditAspectTest` 使用已被替代的 `captureChanges/AuditChangeScope`；这些需要适配或以 D 对应可复用检查覆盖，不能把缺验证写成已通过。网关线程等独立修复测试应保留。

## 4. 部署配置与验证边界

本次 Git 差异中，部署相关的可执行配置变化集中在 `config/cloudflow-gateway.yaml`；没有发现相对于本公共基线的新 systemd 单元或原生部署脚本变更。远程 `docs/version-merge-deployment.md` 与 `version-consolidation-20261102.md` 是历史部署证据，应保留其日期和版本范围，不能计作 D 新版本已经部署。

历史部署文档记录服务器采用 Java 原生进程、端口 19000—19005 和管理端口 19100—19105、前端 18080、Redis 库 10，并明确 HR 金额加密仍是未启用边界。本文未连接服务器重核这些实况，没有读取或复制环境秘密；如本轮部署，由 Root 以实际当前配置验证，避免从仓库默认值覆盖环境。

整合后检查范围应沿实际迁入片段选择：网关线程/路由、通讯录和两类 HR 负责人 SQL、HR 发送与回调协议、正式导入权限。D 已通过的费用、催办、客户工作台等检查只有相关源码被修改时才复测，正常合并本身不触发全项目回归。正常合并提交须保留远程历史，不强推，不改远程 master/XinYuan。

## 最终合并处置

2026-11-03最终树已人工整合远程独立网关、通知时间、部门字段和HR回调修复。CRM续约批量读取已补齐并通过14项检查，网关限流双失败4项检查通过，细节见平台实施记录末节。保留D正式OFFER、共享ProcessStartResult、AuditSnapshotContext、WorkflowStartPermissions和本轮费用/催办/消息占额实现；远程依赖被替代API的重复实体、工具和检查不重新引入，相关行为由D可复用检查覆盖，历史提交仍完整保留。

运行图接口实际返回label，TaskHandleModal保持label；设计图字段权限使用title。早期整合表建议统一修改二者的判断已由实际接口核对更正。受限发起权限、workflowGraph输入判断均保持D与后端一致的协议。远程18份历史文档原样纳入，历史验证不记为本轮重验。

在双方独立改动已核对并人工迁入后，以当前验证树建立保留双方父提交的整合提交；不机械重放远程旧实现，不强推，不修改master/XinYuan。
