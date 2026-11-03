# D 盘后端重新审计：Workflow

审计日期：2026-11-02。唯一源码根目录：`D:\CloudFlowPro`；基线提交：`e0b9e7d27b7690e5eac5f3c02be55b59a52924bf`。本文件只记录审计，未改业务源码、SQL、配置，未构建、运行测试、重建数据库或部署；结论不引用桌面副本的旧审计作为证据。

## 范围与结论

`cloudflow-service-workflow` 的清单覆盖 542 个源码、资源及构建描述文件，共 63,301 行；全模块进行了兼容分支、异常吞并、反射、序列化、查询和循环扫描，再对候选追踪入口、写入方、读取方、前端及 SQL。扫描覆盖全部文件不代表逐行验证全部方法，本文只将有调用链证据的项目列为确认发现。

发现分成 7 项确认可简化的计算/查询、4 项数据契约统一问题、2 项重建时可移除的数据库重复列，以及 2 项必须先作业务判断的数据库候选；其中部门负责人契约也包含待业务选择。P1 表示可能随输入规模放大或造成业务结果错误，应优先核实整改；P2 表示可以局部简化、统一契约或结构。这里的等级用于本轮代码质量排序，不等于已发生线上故障。

现有数据可全量重建，可以取消为旧数据保留的解析分支；仍在使用的页面、内部服务和种子脚本必须同步统一，否则重建后仍会产生多种格式。租户、权限、事务、并发锁、版本号、幂等及外部调用失败处理继续保留。

## 确认可简化的计算与查询

### WF-Q01：图可达性检查在分支汇合后重复遍历共同后继

等级 P1，确定性高；属于重复计算，未发现需要保留的历史兼容语义。

证据：[WorkflowGraphModelResolver.java:295](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/model/WorkflowGraphModelResolver.java:295) 仅用 `reachable` 集合检查孤立节点；[同文件:394](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/model/WorkflowGraphModelResolver.java:394) 的递归只检查当前路径 `path`，`reachable.add(current)` 不判断节点此前是否已遍历，离开节点后移除 `path`。同文件 534–569 行明确支持合法分支汇合，因此共享后继会被不同路径重复扫描；311–329 行另外构建运行图并执行节点/网关校验。

| 当前流程 | 建议流程 |
| --- | --- |
| 进入节点 → 检查当前路径 → 加入路径/可达集合 → 遍历后继 → 移除路径；另一分支汇合时重新遍历同一后继 | 进入节点 → 使用全局访问集合判断是否首次访问 → 仅首次访问时遍历后继；保持原节点与网关校验 |

成本：重复次数受路径数量影响；连续分支汇合会放大共同子图遍历。仅可达性遍历可以做到每个节点/边访问一次，即 `O(V+E)`（V 为节点数，E 为边数）；未做实测，不能把这个复杂度推广为整个模型校验器的总复杂度。必要边界：可达性集合不能替代网关配对、环、孤立节点和非法边校验。验证建议：线性图、两个分支汇合后接长链、连续多次汇合、孤立节点及环分别核对结果并统计该方法节点访问次数。

### WF-Q02：已办列表重复解析同一流程定义及实例变量

等级 P2，确定性高；属于请求内重复计算。

入口：[WfTaskServiceImpl.java:920](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WfTaskServiceImpl.java:920) 调用 `enrichDoneTasks`；[同文件:1602](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WfTaskServiceImpl.java:1602) 已批量读取实例、定义和历史，但 1649–1655 行每任务解析实例变量，1660 行每任务解析/校验模型，1661–1662 行再线性寻找历史，1668 行再提取步骤。

| 当前流程 | 建议流程 |
| --- | --- |
| 批量取数据库记录 → 每任务解析变量 → 解析定义 → 扫描历史 → 提取步骤 → 计算按钮权限 | 批量取记录 → 按实例解析变量/建立历史编号索引 → 按定义解析模型/提取步骤 → 各任务引用结果并计算自己的权限 |

同页 T 条任务、D 个不同定义、I 个不同实例时，模型解析可由 T 次降为 D 次，变量解析可由 T 次降为 I 次；均为满足当前解析条件的任务计数。必须保持 1664–1667 行当前用户、有效审批、运行状态和允许撤回节点判断，不能把用户相关权限作为共享缓存。相邻待办逻辑 1477–1537 行已经缓存定义图及步骤，不能将其报告成同样缺失；待办 1496–1501 行的实例变量解析仍有复用空间。验证建议：同定义多实例、同实例多条历史、多定义混合、不同操作者的撤回按钮。

### WF-Q03：归档/删除安全检查四阶段重复读取相同定义

等级 P2，确定性高；安全检查本身必须保留。

入口：[ArchiveServiceImpl.java:128](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/ArchiveServiceImpl.java:128)、[BatchOperationController.java:165](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/controller/BatchOperationController.java:165)。[SafetyChecker.java:55](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/util/SafetyChecker.java:55) 顺序调用四阶段；69、80、105、149 行各自对相同 ID `selectById`，89 行逐定义计数运行实例。

| 当前流程 | 建议流程 |
| --- | --- |
| N 次定义存在检查 → 再 N 次读定义/逐项计数 → 再 N 次读定义/查依赖 → 再 N 次读定义/检查权限 | 一次批量取定义 → 复用定义映射完成四阶段 → 按定义分组统计运行实例；依赖检查单独保持等价行为 |

有登录用户、N 个不同且存在的定义时，仅定义按编号读取就是 4N 次，不包含 N 次运行计数、N 次依赖查询及角色查询；可把定义读取降为一次批量查询。112 行对 `model_json` 使用模糊匹配查引用，是否改为结构化引用关系另行评估，不能借本项直接移除依赖检查。租户、创建者/管理员、运行中和暂停中实例均须保留。验证建议：混合不存在/跨租户/他人定义、运行和暂停实例、选中集合内部引用与外部引用，核对逐项提示及查询数量。

### WF-Q04：发布通知与通知节点逐个验证接收人，重叠角色重复查同一用户

等级 P2，确定性高；确认优化范围为收件人数据库解析。

证据：[DeployEnhancementServiceImpl.java:330](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/DeployEnhancementServiceImpl.java:330) 按用户/角色/部门循环，362–366 行每角色先查关系、再逐成员调用 388–395 行的单用户查询；最终才用集合去重。[NotificationNodeHandler.java:101](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/handler/impl/NotificationNodeHandler.java:101) 至 173 行存在同类路径。

| 当前流程 | 建议流程 |
| --- | --- |
| 每角色查成员 → 每个关系查用户有效性 → 加入去重集合 | 批量取角色关系 → 用户编号先去重 → 带租户、状态、删除条件批量取有效用户 |

角色路径有 R 个角色、M 条角色成员关系时，当前收件人查询为 R+M 次；可转为一次关系查询和一次有效用户查询，超出单批参数容量时分批。直接指定用户也可由逐人查询改为批量查询。保留用户有效性、租户、空收件人处理和收件人顺序要求。

313–327 行及通知节点 81–85 行还逐人发送。统一消息接口 [MessageSendRequest.java:25](/D:/CloudFlowPro/cloudflow-backend/cloudflow-common/cloudflow-common-message/src/main/java/com/cloudflow/common/message/api/MessageSendRequest.java:25) 支持多收件人，但旧入口用用户编号作为 `bizId`，每次生成消息事件；直接合并会改变事件身份、重试与逐人记录关系。因此“合并发送事件”列为相关候选，本文不将其计入已确认等价优化。验证建议：多角色重叠、停用/删除/跨租户用户、空列表，以及发送失败后的通知状态。

### WF-Q05：查询回滚历史先取发布记录，再逐发布记录查历史

等级 P2，确定性高；属于查询往返和内存排序冗余。

入口：[DeployEnhancementController.java:120](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/controller/DeployEnhancementController.java:120)。[DeployEnhancementServiceImpl.java:545](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/DeployEnhancementServiceImpl.java:545) 先校验定义和租户，558 行取发布记录，561–566 行每条记录调用 [WfDeployRollbackHistoryMapper.xml:7](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow/WfDeployRollbackHistoryMapper.xml:7)，最后 568 行在内存排序。

| 当前流程 | 建议流程 |
| --- | --- |
| 查定义/校验租户 → 查该定义发布记录 → P 次查历史 → 合并 → 再排序 | 查定义/校验租户 → 一条带租户和原发布记录关联条件的历史查询，并在数据库排序 |

P 条发布记录时当前为 P+2 次查询；可为 2 次。为严格保持当前关联语义，优先使用关联发布记录查询；不能未经判断仅换成历史表 `process_def_id` 条件并扩大结果范围。租户条件须下推到 SQL，保留定义访问校验。验证建议：无发布、多发布、多回滚、跨租户、同时间记录和关联条件一致性。

### WF-Q06：发布统计重复读取定义，并加载所有完整版本模型计算数量和最大版本

等级 P2，确定性高。

入口：[DeployEnhancementController.java:198](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/controller/DeployEnhancementController.java:198)。[DeployEnhancementServiceImpl.java:911](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/DeployEnhancementServiceImpl.java:911) 912 行已读定义，927/937/947 行分别计数发布总数/成功数/回滚数，953 行又读同一定义，961–964 行查询并排序所有同 key 定义实体，仅取列表数量与第一行版本；实体包含 `model_json`。

| 当前流程 | 建议流程 |
| --- | --- |
| 读定义 → 三次发布计数 → 重读定义 → 拉取全部版本实体/模型并排序 → 取数量和最新版本 | 读定义 → 一次条件聚合统计发布 → 一次 `COUNT/MAX(version)` 查询版本摘要 |

正常存在定义时为 6 次查询，可为 3 次；且不再为统计传输所有版本模型。必要边界：保留同租户、同 processKey、原成功和回滚口径，空结果保持 0；`snapshotCount` 目前表示版本行数，不可顺手改为实际快照表数。538 行用于返回实际版本详情的查询不在本项删除范围。验证建议：零发布、成功/失败混合、回滚、多个版本、跨租户同 key，以及统计前后结果一致。

### WF-Q07：发起目录逐流程检查权限时，重复查询同一用户的角色和部门

等级 P2，确定性高；应复用请求内身份事实，保留每个流程的授权判定。

证据：[WfDefinitionServiceImpl.java:429](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WfDefinitionServiceImpl.java:429) 对目录逐定义调用 `canStartProcess`；[WorkflowPermissionService.java:237](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/WorkflowPermissionService.java:237) 每个 DEPT 定义读一次用户，244–245、283–307 行每个 ROLE 定义查询用户角色关系及角色。表单相关循环在 [WorkflowFormAccessService.java:83](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/WorkflowFormAccessService.java:83) 和 [WfFormServiceImpl.java:92](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WfFormServiceImpl.java:92)。

| 当前流程 | 建议流程 |
| --- | --- |
| 每个流程解析权限 → 再取相同用户部门/角色 → 判断该流程 | 同一请求按需加载一次用户部门与有效角色 → 每个流程解析自己的权限并判断 |

R 个 ROLE 定义、用户存在角色关联且进入角色实体查询时为 2R 次身份查询；D 个 DEPT 定义为 D 次用户查询，分别可降为 2 次和 1 次。只允许请求内复用，不引入未设计失效规则的跨请求权限缓存。不能跳过单个流程权限、租户、停用角色或提交时重新鉴权。验证建议：ALL/USER/ROLE/DEPT 混合目录、空角色、停用角色、多租户，以及目录与实际发起权限一致。

## 当前写入契约与历史格式混用

### WF-C01：启动权限同时使用角色编号/角色键、单值/逗号列表/JSON 数组

等级 P1，确定性高；兼容分支确实存在，并且当前页面仍产生不同格式，不能只清旧数据。

证据：[WorkflowPermissionService.java:218](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/WorkflowPermissionService.java:218) 明示 JSON/逗号双格式；250–254 行同时匹配 `roleId`、`roleKey`；311–342 行 JSON 失败回落逗号拆分，再逐项去引号。实体 [WfProcessDefinition.java:49](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/domain/WfProcessDefinition.java:49) 注释为 JSON。

| 当前入口与字段 | 建议统一契约 |
| --- | --- |
| `WorkflowSettingsModal.tsx:315–323` 单选角色，写 `String(roleId)`；部门/用户同样单选编号 | ROLE/DEPT/USER 都写编号数组，并明确是否均允许多选 |
| `GlobalPropertyPanel.tsx:162–166` 使用多选 `ApproverValueSelector`；其 29、112 行默认 `roleKey`，148 行写逗号列表 | 两个页面使用相同选择控件/存储格式；角色固定编号 |
| 后端 `startPermissionValue` 先试 JSON，再按逗号拆分，角色匹配两种身份 | 写入/导入边界校验一次，读取只解析一种格式 |

真实页面证据：[WorkflowSettingsModal.tsx:315](/D:/CloudFlowPro/cloudflow-frontend/src/components/WorkflowSettingsModal.tsx:315)、[GlobalPropertyPanel.tsx:162](/D:/CloudFlowPro/cloudflow-frontend/src/components/workflow-builder/GlobalPropertyPanel.tsx:162)、[ApproverValueSelector.tsx:29](/D:/CloudFlowPro/cloudflow-frontend/src/components/workflow-builder/ApproverValueSelector.tsx:29)。编号数组是建议的标准，具体 API 类型可在改造时确定；不要只删除 CSV 分支导致当前页面发起权限失效。

成本主要是多格式解析、重复身份匹配与页面互相无法准确回显；未测量耗时。224 行把空权限类型视为 ALL，可在新写入协议中要求显式 ALL，使空值不再承担授权含义，但这涉及失败语义，应连同创建/导入验证一起改，不能直接无条件删除默认分支。保留拒绝未知类型、租户及提交时鉴权。验证建议：两个编辑入口交互保存、导出/导入、单人/多人/角色/部门授权及非法格式拒绝。

### WF-C02：部门负责人通过编号、账号、昵称猜测，失败后按 manager 角色逐级找人

等级 P1；格式混用确定性高，兜底指派规则须业务判断。

证据：[DeptManagerAssignStrategy.java:75](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/strategy/impl/DeptManagerAssignStrategy.java:75) 明示兼容三种身份；121–134 行先尝试 Long 编号，失败按账号或昵称取第一条；143–177 行每层部门重新查 manager 角色/关系/用户并按最小 userId 选人，再向父部门递归。[WorkflowMonitorServiceImpl.java:667](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WorkflowMonitorServiceImpl.java:667) 也有负责人多类型解析。当前前端 [OrgStructure.tsx:670](/D:/CloudFlowPro/cloudflow-frontend/src/components/OrgStructure.tsx:670) 写 `form.leader.trim()`，786 行仍是文本输入，因此属于活跃字段设计问题。

| 当前字段/步骤 | 建议字段/步骤 |
| --- | --- |
| `sys_dept.leader` 文本：用户编号/账号/昵称皆可能 → 猜类型 → 查用户 → 失败回退角色/父部门 → 排序取第一人 | 在重建前统一负责人用户编号和人员选择器 → 带租户/有效性读取指定人员；缺负责人时按明确业务规则处理 |

成本包括失败解析、名字查询、每层重复角色/关系读取，并存在重名含义不明确的风险。若保留逐级找 manager，至少请求内复用角色与成员集合；但“未填写负责人时能否自动指派父部门或编号最小的 manager”改变审批对象，需要明确业务决策。不得把 `visitedDeptIds` 防止组织关系成环的检查随格式兼容一起删除。验证建议：同名用户、无负责人、离职/停用负责人、父部门负责人、多 manager 和跨租户组织。

### WF-C03：版本比较读取旧 `name`，实际图节点使用 `title`

等级 P1，确定性高；属于字段契约残留和宽松空串掩盖问题。

证据：[VersionComparisonServiceImpl.java:195](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/VersionComparisonServiceImpl.java:195) 的 `createNodeChange` 在 198 行读取 `name`，缺失返回空串；[WorkflowGraphModelResolver.java:413](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/model/WorkflowGraphModelResolver.java:413) 读取 `title`；前端 [workflowGraph.ts:269](/D:/CloudFlowPro/cloudflow-frontend/src/utils/workflowGraph.ts:269) 创建节点也使用 `title`。

| 当前字段/步骤 | 建议字段/步骤 |
| --- | --- |
| 图写入 `title` → 比较器找 `name` → 缺失回空串 → 变更节点名称为空 | 图写入 `title` → 比较器按同一节点模型取 `title` → 输出节点名称 |

当前合法图只提供 title 时，比较结果节点名称会为空；这是一项静态可推导的结果错误，不是性能实测。无需新增 `name` 列或长期保留 name/title 双写。保留节点编号、类型及真实改动比较，针对非法模型按既定边界报错。验证建议：增加/删除/重命名节点的比较结果；不要借本项改变合法可空标题的产品约定。

### WF-C04：流程启动响应把同一实例编号返回两个字段，消费方依赖双字段

等级 P2，确定性高；与 OA/CRM 专项的实例编号提取兼容归为同一个跨模块问题，汇总不重复计数。

生产端：[WfInstanceServiceImpl.java:1521](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WfInstanceServiceImpl.java:1521) 将 `instanceId`、`processInstanceId` 都写为 `instance.getInstanceId()`，另有独立 `processNo`；[WorkflowInnerController.java:31](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/controller/WorkflowInnerController.java:31) 直接委托启动实现并返回 `R<?>`。活跃前端 [workflowDraftSession.ts:444](/D:/CloudFlowPro/cloudflow-frontend/src/hooks/workflowDraftSession.ts:444) 同时要求三个字段均为字符串，缺任一会判定失败。

| 当前字段/步骤 | 建议字段/步骤 |
| --- | --- |
| `Map` 写两个同义实例编号 + 业务单号 → 多服务猜键/类型 → 草稿前端要求双编号 | 明确启动结果类型，统一一个实例编号字段并保留独立业务单号 → 所有内部客户端和前端读同一类型 |

成本主要是分支、重复键及内部 API 不明确，不声称显著服务器性能收益。必须同时改草稿提交、普通启动、内部启动与 OA/CRM/HR 消费方，不能只删 `processInstanceId`；`processNo` 是业务单号，不能合并到实例编号。验证建议：草稿首次提交及重复提交、普通启动、业务服务发起后的绑定与审批回写。

## 数据库字段核对

### WF-DB01：流程定义 `version_lock` 与实际使用的 `lock_version` 重复

等级 P2，确定性高；重建方案建议去掉流程定义表的闲置重复列。

| 当前表/字段 | 实际用途与建议结构 |
| --- | --- |
| `wf_process_definition.lock_version`，SQL 25 行 | 实体 `versionLock` 明确映射此列并使用 `@Version`，保留 |
| `wf_process_definition.version_lock`，SQL 29 行 | 工作流生产实体/Mapper 未发现读写，建议从重建结构及种子删除 |
| `wf_form_definition.version_lock`，SQL 100 行 | 表单实体和条件更新真实使用，保留；不可全仓同名删除 |

证据：[02.cloudflow-workflow.sql:25](/D:/CloudFlowPro/cloudflow-backend/DB/02.cloudflow-workflow.sql:25)、[WfProcessDefinition.java:58](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/domain/WfProcessDefinition.java:58)、[WorkflowConfigurationLockMapper.xml:10](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow/WorkflowConfigurationLockMapper.xml:10)。反证：[WfFormDefinition.java:45](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/domain/WfFormDefinition.java:45)、[WfFormDefinitionMapper.xml:37](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow/WfFormDefinitionMapper.xml:37) 用表单 `version_lock` 比较和递增。

当前步骤是维护两个看似并发版本的列，但只有一个参与定义更新；建议只保留实际并发列。成本是结构歧义、种子维护和多余存储，未实测存储节省。没有查阅提交历史以证明最初新增原因，故只判定当前冗余。验证建议：重建导入、定义编辑冲突、发布/回滚与表单并发更新，保证被保留的实际并发控制不变。

### WF-DB02：回滚历史 `success` 无业务映射，实际状态使用 `rollback_status`

等级 P2，确定性高；建议重建时删除 `success`，保留状态与错误信息。

| 当前字段 | 建议字段及业务含义 |
| --- | --- |
| `wf_deploy_rollback_history.rollback_status`，SQL 687 行 | 保留，实体/接口使用的回滚状态 |
| 同表 `success`，SQL 692 行，默认 1 | 当前无实体属性/生产写入/前端消费，建议删除 |
| 同表 `error_message`，SQL 693 行 | 失败原因与状态不是同义信息，保留 |

证据：[02.cloudflow-workflow.sql:687](/D:/CloudFlowPro/cloudflow-backend/DB/02.cloudflow-workflow.sql:687)、[WfDeployRollbackHistory.java:43](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/domain/WfDeployRollbackHistory.java:43)、[DeployEnhancementServiceImpl.java:476](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/DeployEnhancementServiceImpl.java:476) 至 488 行只设置 `rollbackStatus` 等实体属性；[deployEnhancement.ts:80](/D:/CloudFlowPro/cloudflow-frontend/src/services/api/deployEnhancement.ts:80) 读取 `rollbackStatus`。Mapper 的 `SELECT *` 映射实体没有该属性；全仓除结构与种子未找到此表 success 的业务用途。

当前由业务状态与数据库默认成功位并行表达结果，建议所有判断归于 `rollback_status`。06/07 种子存在显式 success 列，重建必须一并更新，不能只删建表字段。成本是双状态歧义与维护负担；未证明历史动机，亦未验证外部未入库脚本。验证建议：重建 SQL、正常回滚记录、状态展示及失败/错误信息语义。

### WF-DB03：回滚人姓名列当前只由种子写入，是否保留取决于历史姓名快照需求

等级 P2，待业务判断，不列为确认可删除。

证据：[02.cloudflow-workflow.sql:689](/D:/CloudFlowPro/cloudflow-backend/DB/02.cloudflow-workflow.sql:689) 同时有 `rollback_by`、`rollback_by_name`；[WfDeployRollbackHistory.java:49](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/domain/WfDeployRollbackHistory.java:49) 只有操作人编号；生产写入 [DeployEnhancementServiceImpl.java:486](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/DeployEnhancementServiceImpl.java:486) 同样只写编号。全仓对应列命中主要在 DDL 与 [06.cloudflow-business-seed.sql:8989](/D:/CloudFlowPro/cloudflow-backend/DB/06.cloudflow-business-seed.sql:8989)、[07.cloudflow-demo-seed.sql:996](/D:/CloudFlowPro/cloudflow-backend/DB/07.cloudflow-demo-seed.sql:996)。

| 当前字段/流程 | 业务决定后的单一流程 |
| --- | --- |
| 编号由生产写入；姓名列种子有值、生产未形成完整记录链 | 需要保留操作当时姓名：补齐真实快照写入/展示；只显示当前姓名：保留编号、读取时批量关联，移除闲置姓名列 |

姓名快照与编号有不同业务意义，不能仅因“都表示同一个人”删除。成本是种子与真实行为不一致及结构歧义；没有证据声称该列当前保存了完整审计快照。验证建议：用户改名/删除后的历史显示约定，再检查正常发布回滚记录。

### WF-DB04：催办效果字段已建模但未找到写入调用入口，不能按重复列删除

等级 P2，待业务判断。

证据：[02.cloudflow-workflow.sql:639](/D:/CloudFlowPro/cloudflow-backend/DB/02.cloudflow-workflow.sql:639) 的 `effect_id` 是效果主键，`urge_id` 关联催办，`before_duration`/`after_duration` 是计算输入；[WorkflowP4ServiceImpl.java:825](/D:/CloudFlowPro/cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WorkflowP4ServiceImpl.java:825) 至 835 行分别赋值并计算 `effectiveness`。全后端检索 `recordUrgeEffect(` 仅找到接口声明与此实现，未找到业务调用方，因此不能把方法存在写成效果记录已在真实流程自动产生。

| 当前字段/链路 | 需要确认的业务结果 |
| --- | --- |
| `effect_id`、`urge_id`、前后时长、效果等级有独立模型；记录方法未发现上游调用 | 要保留催办效果统计：确定采样时点并接通写入；不需要该功能：按整条功能链决策，不单独误删主键/关联列 |

这几列没有构成“同义兼容字段”的证据。当前不足是完整调用链证据，不能宣称已经完成自动统计，也不能凭静态未调用推断运行时数据一定为空。验证建议：确认催办后评价口径、事件来源、时间单位及效果页读写关系。

## 不应误删的防护与暂未定论项

| 检查对象 | 证据与判定 |
| --- | --- |
| 流程图格式 | `WorkflowGraphModelResolver.java:139–149` 已要求 `nodes`、`edges`，不能沿用“仍兼容旧树图”的结论。运行图、节点配置和网关拓扑校验各有不同目标。 |
| 待办图缓存 | `WfTaskServiceImpl.java:1477–1537` 已按定义缓存图/步骤，WF-Q02 重点在已办路径；避免重复改造已实现部分。 |
| 业务锁与事务提交保护 | `WorkflowBusinessLockService.java:127–137` 续期并标记失去所有权，177–201 行提交前检查占用、事务结束后释放；删掉这些步骤会使失去锁的事务仍可能提交，不能归为旧数据防御。 |
| 草稿版本与提交去重 | `WfFormDraftService.java:48–58、86–93、150–172、187–191` 校验版本/上下文摘要、条件更新、提交后删除及重复提交查询；用于多人/多页操作与网络重试，重建测试数据不消除这些条件。 |
| 草稿输入限制 | `WorkflowDraftJson.java:30–39、42–75、165–183` 检查重复 JSON 键、尾随内容、字段类型、嵌套和字节数；处在请求边界，不能当作内部多余判空整体删除。 |
| 外部触发与恢复 | `WorkflowTriggerService.java:66–89、155–216、282–301` 将异步触发放到事务提交后，验证执行上下文、计划重试和死信重放状态；处理外部失败与并发执行，不依赖旧数据。 |
| 事件时序 | `ApprovalResultStreamPublisher.java:38–44`、各业务事件监听器的 `AFTER_COMMIT` 防止回滚业务向外发成功事件；`fallbackExecution` 是否可删须逐发布方证明总有事务，当前不作删除结论。 |
| 导出失败回原字符串 | `ExportServiceImpl.java:211–216` 存在宽泛 catch 后返回原文；但唯一调用 117 行先执行 `WorkflowTriggerSecrets.maskModel`，其 142–166 行对非空非法 JSON 会直接抛错。不能宣称通常会导出破损 JSON 并成功；可在统一结构化导出时去掉这个多余容错，但本轮未将其列成独立高优先级问题。 |
| 触发器 HTTP 旧字段/HTML 解码 | `WorkflowTriggerSecrets.java:174–190` 同时接受对象/JSON 文本并在失败后 HTML 解码；`WorkflowTriggerExecutor.java:49、106、117` 区分旧 api 字段解码；前端 `TriggerPropertyFields.tsx:7–9、28、90–92` 仍可写字符串头配置。对象/文本与 api/action 两套写入确需梳理，但尚未完整证明请求过滤链是否继续编码，不能直接删除解码或把密钥加密/掩码当兼容浪费。 |
| 已有明确映射的列 | `WfDeployImpact` 的 `suggestion→mitigation_plan`、`createdTime→create_time` 是单列映射；`PerformanceStats` 的别名是 `exist=false` 计算属性；`WfDeployRecord` 的 getter 别名也不能当成数据库多存了列。 |
| 仅过时注释 | `WorkflowMonitorServiceImpl.java:830–837` 注释提及旧 0/1，但当前过滤实际只处理 Y/N；属于注释准确性问题，不能据此报告额外查询/旧格式分支仍执行。 |

## 核查范围与未执行事项

重点追踪文件包括：`WorkflowGraphModelResolver`、`SafetyChecker`、`WorkflowPermissionService`、`DeptManagerAssignStrategy`、`WfTaskServiceImpl`、`DeployEnhancementServiceImpl`、`NotificationNodeHandler`、`WorkflowMonitorServiceImpl`、`WorkflowBatchServiceImpl`、`WfInstanceServiceImpl`、`WfDefinitionServiceImpl`、`WfFormServiceImpl`、`WorkflowFormAccessService`、`WorkflowP4ServiceImpl`、`VersionComparisonServiceImpl`、`VersionServiceImpl`、`VersionNumberGenerator`、`ExportServiceImpl`、`ImportServiceImpl`、`ImportValidator`、`WorkflowTriggerSecrets`、`WorkflowTriggerExecutor`、`WorkflowTriggerService`、`WorkflowDraftJson`、`WfFormDraftService`、`WorkflowBusinessLockService`、`ApprovalResultStreamPublisher`、`WorkflowEventListener`，以及相关 DTO/实体、Mapper、入口 Controller、工作流结构及种子 SQL、组织/流程设计/草稿前端。部分文件仅深入读取与候选相关方法，并非宣称全部行已人工核验。

未构建、未执行自动化或手工功能测试、未连接数据库、未读取服务器运行指标，所有查询次数与重复计算描述均来自静态路径分析。未检查仓库之外的报表、脚本或外部数据库消费者，因此删除列建议的范围是本仓库重建方案；没有将全仓无引用等同于外部绝对无消费者。未修改任何业务代码，未生成构建包、截图或临时测试环境。

所有建议尚未实施。后续如进入改造，应逐项把修改范围与实际局部验证结果写回对应编号；“已确认问题”不等于“已改造”或“已测试通过”。
