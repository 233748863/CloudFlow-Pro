# Workflow改造实施记录

实施目录D:\CloudFlowPro，起始版本e0b9e7d27b7690e5eac5f3c02be55b59a52924bf。用户已授权改造。执行代理implement_workflow，实际开始处理WF-Q01至Q07、WF-C01/C03、X01的Workflow部分；共享SQL与登记表由主代理负责。X02等待共享返回类型约定。状态按项回写，未执行的验证不记为通过。

当前已确认X01规则：部门负责人用leader_user_id，逐级查找有效父部门负责人；仍无人则阻止发起，取消任意manager兜底，保留租户、停用和环路约束。

## 已落代码，待局部运行验证

- WF-Q01：可达性按reachable集合首次访问递归，移除单路径重复遍历；节点/网关验证保持。WF-C03：版本比较统一读取title。已静态复核修改位置，尚未编译/运行。
- WF-Q03：SafetyChecker一次批量加载定义，四阶段复用；运行/暂停实例按definition_id分组计数。依赖与授权检查保留。尚未编译/数据库验证。
- X01（Workflow部分）：SysDept改leaderUserId；新WorkflowDepartmentLeaders按同租户、有效部门/用户及环路集合解析父链。部门指派、监控及超时升级复用；无负责人时部门指派抛出明确错误，不选择manager。多级主管保留原层级策略。已有BatchB检查构造同步真实字段与状态。SQL需主代理统一leader_user_id后验证。
- WF-Q02：待办/已办的实例变量按实例解析一次；已办模型及步骤按定义解析一次、历史按编号索引。当前用户撤回判断仍逐任务执行。
- WF-Q04：发布通知按角色批量取关系、去重用户后批量校验；部门接收人一次查询后按配置部门顺序组装，通知节点角色成员同样批量有效性查询；发送事件逐人身份保持。
- WF-Q05：回滚历史改用原发布记录关联的一次查询，租户同时限定关联两侧，数据库排序。
- WF-Q06：发布统计改COUNT条件聚合及COUNT/MAX版本摘要，共定义读取+两聚合；避免加载model_json。
- WF-Q07：startPermissionCheck显式创建请求内对象，角色与部门按需各加载一次，目录和两处表单循环共用；真正提交仍新建检查，不使用跨请求权限缓存。
- WF-C01：两个编辑入口均使用相同多选组件，发起权限固定角色ID及JSON字符串编号数组；保存和导入明确验证类型、正整数编号、重复和非法JSON，读取不再猜角色键或CSV。ALL须显式指定。节点审批人组件的既有CSV协议独立保留，通过组件valueFormat选择不同业务字段的输出协议，不做自动格式猜测。
- WF-DB03：按用户第二组答复保留操作时姓名快照。实体新增rollbackByName映射既有列，回滚时由同租户操作人资料填姓名，历史页面读取快照，不随用户改名改变。

## 提供主代理的衔接信息

WF-C01将统一为明确ALL/ROLE/DEPT/USER，受限权限值为JSON字符串编号数组（例如["1","2"]），ALL值为空；不再接受角色键或CSV。需要主代理把正式/演示SQL里的start_permission_value按对应类型转换为该格式；两个前端编辑入口和保存/导入边界由本代理处理。WF-DB01仅删除wf_process_definition.version_lock，保留lock_version；WF-DB02仅删除回滚history.success，保留rollback_status/error_message。

构建请求：目前尚未运行Maven，请主代理分配Workflow -pl cloudflow-service-workflow -am compile时段，随后本代理执行局部独立检查（不连接数据库/服务器）。

## 2026-11-03 续接实施（finish_workflow）

- X02 已增加共享 `com.cloudflow.common.core.domain.ProcessStartResult`，仅有 `String instanceId` 与 `String processNo`；普通/内部/草稿首次和重复提交全部返回 `R<ProcessStartResult>`。前端普通启动及草稿共用 `ProcessStartResult`，不再返回或要求 `processInstanceId` 别名。子流程节点直接创建实例、返回节点执行布尔结果，无启动响应拆装链，不为此改变其执行语义。此项代码已落地，待编译/局部草稿检查；OA/CRM/HR/Auth 消费由各负责代理同步。
- WF-DB04 复核：当前 `docs/prd` 未定义催办“效果评分”的采样规则，页面和 Controller 也没有此记录的展示/查询入口；`IWorkflowP4Service.recordUrgeEffect` 只有实现，无真实调用，不能把本轮删兼容的授权解释为任意增加评分规则。需主代理向用户明确：是否需要“催办后多久处理”的统计（可采用最后一次催办到实际完成的耗时，仅记录事实），或删除整条闲置效果评分功能（保留已有催办通知与催办记录）。用户答复前不删除 `wf_urge_effect`，不填伪完成时间。
- 费用撤回衔接核对：`recallProcess` 发布 `ProcessRevokedEvent`，`OaWorkflowEventListener` 将同实例且审批中的 `expense_claim` 更新为 `CANCELLED`；不经过只有 APPROVED/REJECTED 的回调。费用累计应排除 CANCELLED，具体实现由 Root 负责。

## 2026-11-03 续接进展与数据库契约

- X02：共享响应增加 `requireInstanceId()`，只验证编号非空白、长度不超过 64 且无 ISO 控制字符；无效成功响应抛出 `IllegalStateException`，有效编号原样返回。内部消费者不强制读取 `processNo`。前序实际执行 `cloudflow-frontend/node_modules/.bin/tsx.cmd --tsconfig cloudflow-frontend/tsconfig.json cloudflow-frontend/scripts/check-workflow-drafts.ts`，草稿前端独立检查 59 项通过；未启动服务或写业务数据。历史两次失败分别是未传 tsconfig 导致别名无法解析、旧 React 假实现缺少 memo；同步脚本所需 memo/useCallback 后上述检查通过。后端尚未编译。
- X01：多级主管指派补足发起人有效状态检查；部门策略已验证真实负责人后，多级主管调用方不再重复查询同一个用户。缺有效负责人抛出的 `AssigneeResolutionException` 会穿透首节点执行并回滚发起事务。保留既有显式多级主管层级策略。
- WF-DB04：Root 已传达用户确定保留“最后一次催办到任务完成的耗时”。删除无调用的旧 `recordUrgeEffect` 与效果评级及其字典回退。完成历史入库时，同事务关联当时最后一条催办；重投按历史编号保留首次关联。普通审批、两种驳回入口及每个会签投票的真实完成均登记；转办、加减签不算完成。人工催办与完成使用同一任务行锁；自动提醒同事务留催办记录，按任务/提醒档位/到期时间/接收人的稳定编号去重，重试不改首次催办时间。
- WF-DB04 查询/展示代码已接通：流程追踪完成权限校验后，按历史编号一次批量关联查询；时间取真实催办/完成历史，秒数在查询时计算。桌面与移动端轨迹显示“最后催办后 … 完成”，支持 0 秒；从未催办的任务无此统计。此项尚未编译、运行 SQL 或界面验收。

Root 统一重建 SQL 的精确要求：

| 表 | 保留/增加 | 删除 |
| --- | --- | --- |
| `wf_urge_effect` | `history_id VARCHAR(64) NOT NULL PRIMARY KEY`、`tenant_id BIGINT NOT NULL`、`urge_id BIGINT NOT NULL`，索引 `(tenant_id, urge_id)` | `effect_id`、`task_id`、`before_duration`、`after_duration`、`effectiveness`、`urge_time`、`complete_time` |
| `wf_task_urge` | `sender_id` 允许 NULL 表示系统提醒；`source_key VARCHAR(160) NULL`；唯一索引 `(tenant_id, source_key)`；查询索引 `(tenant_id, task_id, create_time, id)` | 无 |

`wf_urge_effect` 种子必须关联同租户、同任务、早于或等于真实完成的最后催办，不能填造完成时间。`workflow_efficiency_tier` 已无生产评分调用，Root 可全仓复核后移除其专用种子。生产 `getUrgeRecords` 的旧空实现未算作本轮接通；既有催办通知与催办记录继续保留。

构建时段 3 已释放：在 `D:\CloudFlowPro\cloudflow-backend` 执行 `mvn -q -pl cloudflow-service-workflow -am -DskipTests -Dmaven.repo.local=D:\CloudFlowProCache\m2\repository compile dependency:build-classpath -Dmdep.outputFile=target/quality-workflow-classpath.txt`，退出码 0；Workflow 及所需 Common 模块编译成功。随后运行 `tsx --tsconfig cloudflow-frontend/tsconfig.json cloudflow-frontend/scripts/check-workflow-semantics.ts`，270 项前端工作流语义检查通过，其中新增真实催办时间保留、0 秒完成、跨日耗时显示检查。上述不包含真实数据库或页面视觉验收。后续仅使用 javac/java 执行局部检查，不占 Maven 构建时段。

局部行为验证：`scripts/quality-checks/run-workflow-quality-checks.ps1` 已实际执行，`WorkflowQualityChecks` 82 项、发起目录 35 项、草稿引用与租户/分页拦截器 279 项、受影响的既有 Workflow Batch B 922 项、催办扫描与 Spring 事务模板 126 项全部通过。新检查覆盖：单一启动编号及其必要边界；字符串编号精度与非法协议拒绝；部门/角色每请求读取一次、下次请求重新查询；无效/跨租户负责人向上查找及环路/无人明确失败；版本标题；催办轨迹权限与一次批量查询、0 秒/无催办展示数据；真实 Mapper XML 绑定与生产 SQL 解析器；催办事实写入失败时消息事务回滚、保留重试索引、恢复时同事务提交。MySQL 执行和并发数据库语义仍未验证。

本批历史失败均限定为检查装配：新增检查初次编译误用异常类包名，修正为实际 `strategy.AssigneeResolutionException` 后编译成功；草稿引用首次启动漏传工作区参数，补全运行参数后只重跑该失败项及尚未执行的 Batch B/催办检查，前两项未重复运行。未为检查装配增加生产可空依赖。Root 更新后的 02 建表结构已只读核对，与 WF-DB04 契约一致；未改共用 06/07 种子、服务器或数据。

为 Root 的专用 MySQL 验证补充 `scripts/quality-checks/WorkflowUrgeDatabaseChecks.java`，已用本轮 Workflow classpath 编译成功，尚未运行。仅允许显式 `quality_` 前缀数据库；环境变量 `WF_QUALITY_JDBC_URL`、`WF_QUALITY_JDBC_USER`、`WF_QUALITY_JDBC_PASSWORD` 由执行者提供，不打印秘密。实际运行生产 Mapper 与租户拦截器，以唯一标记写入后全部回滚；检查最后催办、同秒编号排序、跨租户/未来提醒排除、完成重投保留原关联、自动提醒重投不改首次时间、租户去重及回滚无残留。当前运行参数文件为 `.cloudflow-runtime/quality-refactor-20261103/workflow/urge-db-run.args`，执行 `java @该参数文件`；Root 验证前保留这组临时产物，完成并记文档后统一清理，检查源码保留。

2026-11-03 最终入口复核：实际审批/驳回/会签投票已在历史入库后登记催办关联；票签达到结束条件而自动清理的未投票任务、节点自动跳过、委派归还、加减签、流程作废及补偿记录均不作为实际审批处理耗时。未发现需追加的真实人工完成入口。Workflow 生产改造及上述局部检查交付 Root；真实 MySQL 催办检查仍待专用验证库，未进行数据库和浏览器验收。接续按协作记录承接 OA/CRM 检查源码及局部验证，OA/CRM 生产缺陷由 Root 修复。

2026-11-03 新会话补验：`WorkflowUrgeDatabaseChecks` 在本轮独占 MySQL 的 `quality_oa_workflow_20261103` 中实际执行，14 项通过，使用当前 01/02 DDL、生产 Mapper 和租户拦截器；覆盖最后催办及同秒排序、真实耗时、跨租户和伪造显式租户拒绝、重投关联稳定、系统提醒去重与首次时间，全部检查数据事务回滚，提交行数为 0。连接配置与临时参数只留忽略目录，实例由 Root 统一清理；检查源码允许该独占本机实例的空密码，未修改生产登录策略。

## 2026-11-03 远程独立修复接入与覆盖核对（resume_workflow_oa）

本次以 D 盘当前实现为最终业务规则，参照 `origin/dev=ffebc351fb2a3e7777a473d0e2af6bf13054769b` 仅迁入适用的独立片段，未执行 Git 合并、提交、推送或部署。

- `ScriptExecutionPolicy` 删除节点 `label` 读取，错误显示使用 `title/id`；`VersionNumberGenerator` 只从 `source/target` 读取连线，原版本分类策略保留。
- `ExportServiceImpl` 不再把 `processKey/formId/startPermissionType/startPermissionValue/deptId` 复制到 `metadata`；正式 `WorkflowData` 字段完整保留，非法流程 JSON 抛出异常。静态核对 `ImportServiceImpl` 新建和覆盖路径都读取正式字段，无 `metadata` 回退。
- `ImportValidator` 复用 `WorkflowStartPermissions.validate(type, value)`；原实体入口委托同一规则并继续把 `ALL` 空值写为 `""`。预检拒绝数组形式的 `ALL`、缺失类型、数字数组、角色键、CSV、重复和越界编号；受限编号保持 JSON 字符串数组。没有恢复 `StartPermissionValues`。
- 与 HR 代理按 D 生产提交状态确认后，在 `WorkflowBusinessTypeContributor` 明确工伤待审为 `DETERMINING`、继任待审为 `IN_PROGRESS`。保留 D 的 `OFFER`、`HR_LIFECYCLE` 和绩效两个阶段的正式字段/状态；没有整份迁入远程 `HrWorkflowBusinessTypes` 方案。

编译与实际执行：

- 独立 `javac` 编译上述 6 份生产源码及新检查到忽略目录，不写入共享 `target/classes`；`WorkflowIntegrationChecks` 46 项通过，实际调用导出、序列化往返、预检、脚本策略、版本检测和业务登记。包括默认导出敏感值遮盖、跨租户拒绝、编号精度和 `ALL` 规则。
- `WorkflowBatchReadChecks.taskPages` 的正常代表流程已实际执行通过：同实例的 2 条待办、2 条已办，分别验证一次实例批取、一次定义批取、一次变量解析、一次流程解析和步骤提取；审批历史可撤回，驳回历史不可借用其他历史的撤回权限。首次执行随后进入安全检查时失败，失败点与任务页无关，后续没有重复运行此已通过组。
- 修正安全用例的预期后，仅执行 `safety/notifications/deploy`：分别 13、21、19 项，共 53 项通过。测试依赖为受控 Mapper 与消息接收器；服务方法、查询条件和 XML 绑定为真实实现，未将消息发送到外部应用。
- 最终在 `D:\CloudFlowPro\cloudflow-backend` 执行 `mvn -q -pl cloudflow-service-workflow -am -DskipTests -Dmaven.repo.local=D:\CloudFlowProCache\m2\repository compile`，退出码 0，Workflow 与所需 Common 模块编译通过。此命令没有运行 Maven 测试；以上基本行为为独立检查结果。

本次两次检查失败均为新检查预期错误：旧连线带来的连线数量变化仍触发既有 `MINOR` 策略，原检查误写 `PATCH`；暂停状态正式值为 `PAUSED`，原检查误写 `SUSPENDED`。按实际生产规则修正检查后，仅复测失败及尚未执行部分，没有为通过检查修改这两项生产行为。Java 新检查和本次新代码未使用 `var`，本次生产差异空白检查通过。

WF-Q01 至 Q06 的基本行为覆盖按实际检查区分如下；不能把本表当作真实数据库、并发压测或浏览器全项验收。

| 登记项 | 实际覆盖 | 尚未验证的边界 |
| --- | --- | --- |
| WF-Q01 图可达性复用 | 已有 `WorkflowBatchBChecks/WorkflowBatchBConfigChecks` 实际调用图解析、定义完整性检查；本次导入预检真实验证合法开始到结束图，任务页真实解析开始—审批—结束图，均执行当前可达性代码。基本正常路径通过。 | 没有对每个节点访问次数作探针统计，没有大图性能测量。 |
| WF-Q02 待办/已办复用 | 本次真实 `getTodoTasks/getDoneTasks` 配受控 Mapper；2 条同实例任务的批取和解析次数均验证为每请求各 1 次，步骤与按钮输出保持，历史编号对应的撤回权限单独验证。 | 数据库分页执行、界面渲染、所有筛选组合未在本次重测。 |
| WF-Q03 批量安全检查 | 本次真实 `SafetyChecker.checkSafety`；两份本人流程正常通过，定义只批取 1 次，运行实例仅分组查询 1 次；运行/暂停条件、缺失流程、外部引用和跨租户拒绝保留。 | 聚合 SQL 没有在真实 MySQL 执行；引用检查仍按原业务逐定义查询，未宣称全部读取均为常数。 |
| WF-Q04 发布与节点通知批取 | 本次真实 `sendDeployNotification` 和 `NotificationNodeHandler.handle`；角色成员及有效用户各批取 1 次，重复成员只发送一次、无效成员排除；部门顺序保持且只查 1 次；发布记录跨租户时不发送。 | 接收事件为内存收集，未验消息出库、队列、浏览器或最终投递。 |
| WF-Q05 回滚历史关联查询 | 本次真实 `listRollbackHistory`；定义读取 1 次、带定义和租户参数的关联 Mapper 1 次，历史操作人快照保留，跨租户提前拒绝。真实 Mapper XML 加载、参数绑定与生产 SQL 解析器通过，关联两侧租户与确定性排序均检查。 | 本查询没有真实 MySQL 执行；14 项真实库催办检查不能作为回滚查询已验收证据。 |
| WF-Q06 发布统计聚合 | 本次真实 `getDeployStatistics`；定义读取 1 次、发布和版本各聚合 1 次，五个返回字段保持，查询带租户且不读取 `model_json`，跨租户在聚合前拒绝。 | `COUNT/MAX` 在本次为受控返回，未记录真实数据库性能或真实库聚合值。 |

可复用命令：`scripts/quality-checks/run-workflow-integration-checks.ps1` 默认运行两份检查；仅执行补充组时可传 `-Checks WorkflowBatchReadChecks -BatchGroups safety,notifications,deploy`。临时输出目录为 `.cloudflow-runtime/quality-refactor-20261103/workflow-integration`，本轮结论落文档后清理；检查源码与脚本保留。其他已交 Root 的专用数据库、OA/CRM 和催办临时产物仍由 Root 统一收尾。

2026-11-03 OA/CRM 接续检查状态（finish_workflow，仍在运行）：`run-oa-crm-quality-checks.ps1 -Checks CrmQualityChecks,CrmScheduledNotificationChecks` 已通过，CRM 质量93项、扫描58项。覆盖健康优先级/结清释放、默认及配置账龄编号与边界/一次规则读取、日历失败明确抛错、工作台七类记录各读一次、两客户共享四面板、可访问客户仅读一次、仪表盘SQL筛选上限与活动范围。首编译仅检查装配误用 PageResult.build(List)，已改真实 Page 并重跑成功。继续编辑 OaQualityChecks.java / OaQualityDatabaseChecks.java，请 Root / 新续接代理勿并行写这两个文件或运行同 runner 目录。若已由 resume_workflow_oa 接管，应让本 finish_workflow 明确退出后再开始写，避免双代理同文件。

2026-11-03 17:30 续接状态对齐（finish_workflow）：进一步读取现有文档和日志确认，resume_workflow_oa 已完成 OA 服务18项、OA真实MySQL54项、Workflow催办真实MySQL14项及 Workflow 后续独立整合检查，结果分别已记入 OA/CRM 与本实施文档。本代理本次实际重跑 CRM 质量93项、扫描58项均通过，其余上述已通过组不重复执行；前段“继续编辑 OaQualityChecks/OaQualityDatabaseChecks”计划撤销，保留现有实现与成功记录。本代理范围代码/检查已交付，不再写共享文件或运行检查。数据库和临时产物由 Root 统一收尾；未声称 HTTP、浏览器、部署或全项回归通过。
