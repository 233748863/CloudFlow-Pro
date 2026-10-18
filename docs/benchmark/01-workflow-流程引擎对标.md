# 工作流模块对标调研

> 本文档独立可用。调研时间 2026-08-31，对标源均为实际克隆源码后读取模型定义，不是读 README。

## 一、许可证规则（每份对标文档统一口径）

| 分类 | 项目 | 使用方式 |
| --- | --- | --- |
| 可读可借鉴实现 | flowable(Apache-2.0)、Activiti(Apache-2.0)、camunda-bpm(Apache-2.0)、warm-flow(Apache-2.0)、turbo(Apache-2.0)、dolphinscheduler(Apache-2.0)、temporal(MIT)、van(MIT) | 可参照实现思路与代码结构 |
| 仅借鉴业务设计 | o2oa(AGPL-3.0) | 只提取业务语义，禁止复制代码 |
| 需逐项复核 | flowlong(NOASSERTION，仓库自带商业授权说明)、bpmn-js(bpmn.io 许可，嵌入需保留水印) | 借鉴模型设计前先确认条款 |

**flowlong 特别说明**：它是本模块最高价值的语义参考源（中式审批语义最全），但许可证为 NOASSERTION，落地时只提取「概念与状态机设计」，代码自行实现。

## 一·五、⚠️ 本文档结论的四处修正（2026-08-31 写 PRD 前深入实测）

本文档初版基于对标项目模型对比 + 表结构与端点清单得出结论。写批次 B 的 PRD 时深入读了 `strategy/`、`handler/`、`job/` 包，**发现四处判断偏保守，现状比文档写的完整**：

| # | 本文档原判断 | 实测现状 | 对条目的影响 |
| --- | --- | --- | --- |
| 1 | WF-03：「只有 `assignee` + `candidate_roles` 两条路，主管/多级主管/部门负责人/发起人自选全不支持」 | **已有 `AssignUserStrategy` 策略模式 + 工厂 + 7 个实现类，覆盖 9 种类型**：`USER`/`USERS`/`USER_LIST`/`ROLE`/`DEPT`/`DEPT_MANAGER`/`DIRECT_LEADER`/`INITIATOR`/`VARIABLE_USER` | **WF-03 工作量 L → S/M**，真实缺口只剩发起人自选与多级主管 2 类 |
| 2 | WF-02：「驳回去向固定实现，不可配置」 | `WorkflowP4ServiceImpl.rejectToPrevious()`（P4.8）**已实现驳回到上一步** | 5 策略里 2 种已有，缺 3 种 + 节点级配置 |
| 3 | WF-04：「无或签语义」 | `WfNodeConfig.signType` **已声明 `ALL`/`ANY`/`PERCENT`**；前端 `PARALLEL_SIGN_MODES` 有四值且注释写明与后端枚举对齐 | **WF-04 真实缺口只剩票签权重 `passWeight`** |
| 4 | WF-07：「有超时告警但无超时自动流转」 | `TaskTimeoutJob.handleTimeoutTask()` **已实现超时自动通过**，走完整 `completeTask` 引擎 | 缺口是 `slaAction` 字段已声明但 `TaskTimeoutJob` 未读取（grep 计数 0），`AUTO_REJECT` 未接线，成本极低 |

**下方第三节差距矩阵与第四节条目描述未逐条重写**，读时请以本节修正为准。详细的修正后基线与落地方案见 `docs/prd/B1-WF-审批语义地基-PRD.md`。

**教训**：靠表结构 + 端点清单 + 枚举对比做的差距判断，会低估"逻辑已实现但没有独立表/端点"的能力。后续模块排期前应先读 service/strategy/handler 层。

## 二、我们的现状基线（实测）

- Controller 文件 17 个，HTTP 端点 159 个
- 结构表 46 张（`DB/02.cloudflow-workflow.sql`）
- 核心表字段实测：
  - `wf_process_definition`（30 列）：已有 version / is_latest / checksum / change_type / is_rollback / rollback_from_version / is_archived / start_permission_type
  - `wf_process_instance`（24 列）：已有 parent_instance_id / parent_node_key（子流程已具备）、variables、priority、process_no
  - `wf_task`（15 列）：task_id, node_key, assignee, proxy_user_id, candidate_roles, status, priority, is_timeout, due_time
  - `wf_countersign_task`（17 列）：sign_type, pass_percent, total_count, approve_count, reject_count, assignee_order, current_index
  - `wf_task_delegation`（13 列）：from_user_id, to_user_id, delegation_type
  - `wf_node_record`（18 列）：node_type, executor_id, duration_ms, event_type, extra_data

已有能力（不需要重复建设）：会签（含通过率与顺序）、加签/减签、委派、抄送、超时告警、异常告警、发布窗口、发布审批、回滚、归档、热更新、流程模拟、导入导出、DLQ 重放、性能统计、流程分类、模板库、版本对比。

**结论：工程治理面（发布、监控、告警、DLQ）已经比多数开源项目做得深，缺的是"审批语义丰富度"和"节点级配置能力"。**

## 三、功能深度差距矩阵

深度等级：`0`=无 / `1`=有雏形 / `2`=可用 / `3`=完整

| 能力项 | 我们 | flowlong | warm-flow | flowable/camunda | 差距判定 |
| --- | --- | --- | --- | --- | --- |
| 任务语义类型数 | 约 8 类（审批/抄送/会签/加签/减签/委派/终止/驳回） | **31 类** | 7 类 | BPMN 全集 | **重点缺口** |
| 驳回策略 | 1（回到发起人/终止） | **5 种可配** | SkipType 三态 | 网关+边界事件表达 | **重点缺口** |
| 审批人来源类型 | 2（assignee / candidate_roles） | **8 种 setType** | UserType | 表达式+监听器 | **重点缺口** |
| 自己审自己处理 | 0 | **4 种策略** | 0 | 需自实现 | 缺口 |
| 节点级开关 | 0（全局配置） | **11 个开关** | 部分 | 扩展属性 | 缺口 |
| 或签 / 票签（权重） | 会签有通过率，或签票签无独立语义 | orSign + voteSign + passWeight | VOTE | 多实例+完成条件 | 缺口 |
| 条件/并行/包含分支 | 有并行 join 表，无包含分支 | 条件+并行+包含+路由 4 类 | SERIAL/PARALLEL/INCLUSIVE | 完整网关 | 缺口 |
| 定时/触发节点 | 有超时告警，无定时节点 | timer + trigger 节点 | 0 | 定时器事件 | 缺口 |
| 跳转语义 | 无自由跳转 | jump / rejectJump / routeJump / reApproveJump | 0 | 自实现 | 缺口 |
| 多级主管审批 | 0 | multiLevelSupervisors + directorLevel | 0 | 自实现 | 缺口 |
| 流程状态机粒度 | status 字段 | InstanceState + FlowState | **14 态 FlowStatus** | 完整 | 中等缺口 |
| 草稿保存 | 0 | saveAsDraft | 0 | 0 | 小缺口 |
| 委托代理（agent） | 仅 delegation | agent/agentReturn/agentAssist/agentOwn 4 态 | DEPUTE | 0 | 中等缺口 |
| 发布/回滚/影响分析 | **3（已完整）** | 1 | 1 | 2 | 我们领先 |
| 监控/超时/异常/DLQ | **3（已完整）** | 1 | 0 | 2 | 我们领先 |

## 四、可移植条目

### [WF-01] 任务类型语义扩展到中式审批全集
- **参考来源**：`aizuda/flowlong` → `flowlong-core/src/main/java/com/aizuda/bpm/engine/core/enums/TaskType.java`（NOASSERTION，仅借鉴概念）
- **参考实现怎么做的**：单个 `TaskType` 枚举承载 31 种任务语义，实测取值：
  `end=-1, major=0, approval=1, cc=2, conditionNode=3, conditionBranch=4, callProcess=5, timer=6, trigger=7, parallelBranch=8, inclusiveBranch=9, transfer=10, delegate=11, delegateReturn=12, agent=13, agentReturn=14, agentAssist=15, agentOwn=16, reclaim=17, withdraw=18, reject=19, jump=20, rejectJump=21, routeJump=22, routeBranch=23, reApproveJump=24, saveAsDraft=25, autoPass=30, autoReject=31, triggerJump=32`
  关键设计：把「谁在什么语义下产生了这条任务」编码进任务本身，历史轨迹可直接还原审批语义，不需要额外表。
- **我们现状**：`wf_task` 无 task_type 字段，语义散落在 `wf_task_delegation`、`wf_task_add_sign`、`wf_countersign_task` 等多张表；`wf_node_record.event_type` 只记录事件不记录任务语义。
- **落地改动**：
  - `wf_task` 增 `task_type VARCHAR(30)`，取值先落地我们真实用到的子集：`APPROVAL/CC/COUNTERSIGN/OR_SIGN/VOTE_SIGN/TRANSFER/DELEGATE/DELEGATE_RETURN/ADD_SIGN/REDUCE_SIGN/RECLAIM/WITHDRAW/REJECT/JUMP/REJECT_JUMP/AUTO_PASS/AUTO_REJECT/TIMER/TRIGGER`
  - `wf_task_history` 同步增字段，保证归档轨迹一致
  - `/wf/instance/{id}/trace` 返回体带 taskType，前端流程轨迹按语义渲染图标
- **工作量**：M（表改 2 张 + trace 接口 + 前端轨迹组件）
- **优先级**：P0 —— 这是后续所有审批语义扩展的公共地基，先做它其余条目才好落

### [WF-02] 驳回策略可配置（5 种）
- **参考来源**：`aizuda/flowlong` → `core/enums/RejectStrategy.java`
- **参考实现怎么做的**：实测枚举 `TO_INITIATOR=1, TO_PREVIOUS_NODE=2, TO_SPECIFIED_NODE=3, TERMINATE_APPROVAL=4, TO_PARENT_NODE=5`，配在**节点模型**上（`NodeModel.rejectStrategy` + `rejectStart`），即每个节点可以有自己的驳回去向；`TO_PARENT_NODE` 专门处理子流程驳回穿透到父流程。
- **我们现状**：`WorkflowController` 有 `POST /reject`，但驳回去向是固定实现，不可按节点配置；子流程驳回（我们已有 `parent_instance_id`）没有对应穿透策略。
- **落地改动**：
  - `wf_process_definition.model_json` 的节点结构增 `rejectStrategy` + `rejectToNodeKey`
  - `POST /wf/reject` 增可选 `strategy` 入参，缺省读节点配置
  - 新增 `wf_task` 驳回产生的任务 taskType=`REJECT_JUMP`（依赖 WF-01）
  - 子流程场景：驳回到 `TO_PARENT_NODE` 时用现有 `parent_instance_id`/`parent_node_key` 回溯
- **工作量**：M
- **优先级**：P0 —— 实际审批里"驳回到指定节点"是高频诉求，当前完全没有

### [WF-03] 审批人来源类型扩展（8 种 setType）
- **参考来源**：`aizuda/flowlong` → `core/enums/NodeSetType.java`、`model/NodeModel.java`、`model/NodeAssignee.java`
- **参考实现怎么做的**：实测 `specifyMembers=1, supervisor=2, role=3, initiatorSelected=4, initiatorThemselves=5, multiLevelSupervisors=6, department=7, designatedCandidate=8`，配合 `NodeModel` 上的 `directorLevel`（第几级主管）、`directorMode`、`selectMode`、`examineLevel` 精确定位人；`ActorType` 再区分 `user=0, role=1, department=2, group=3`。
- **我们现状**：`wf_task` 只有 `assignee` + `candidate_roles` 两条路；`wf_process_definition` 有 `start_permission_type/value` 但那是发起权限，不是审批人解析。发起人自选、主管、多级主管、部门负责人全部不支持。
- **落地改动**：
  - 节点模型增 `setType` + `assigneeList[]`（含 actorType/actorId/actorName）+ `directorLevel`
  - 新增审批人解析器接口，按 setType 分派；主管链依赖 `sys_dept` 上级关系与 `hr_employee` 汇报线
  - `POST /wf/start` 支持传入发起人自选审批人（`initiatorSelected`）
  - `wf_task_candidate` 表复用承载候选人快照
- **工作量**：L（解析器 + 主管链数据来源 + 前端节点配置面板）
- **优先级**：P0 —— 没有主管/多级主管，OA 与 HR 的真实审批链条搭不起来

### [WF-04] 或签与票签独立语义（含通过权重）
- **参考来源**：`aizuda/flowlong` → `core/enums/PerformType.java`（实测 `start=0, sort=1, countersign=2, orSign=3, voteSign=4, timer=6, trigger=7, copy=9`）、`NodeModel.passWeight`；`dromara/warm-flow` → `CooperateType`（`APPROVAL=1, TRANSFER=2, DEPUTE=3, COUNTERSIGN=4, VOTE=5, ADD_SIGNATURE=6, REDUCTION_SIGNATURE=7`，Apache-2.0 可参照实现）
- **参考实现怎么做的**：flowlong 用 `PerformType` 区分「依次审批(sort)/会签/或签/票签」，票签额外用 `passWeight` 定权重阈值；warm-flow 把协作类型平铺成 7 类，`VOTE` 与 `COUNTERSIGN` 分离。
- **我们现状**：只有 `wf_countersign_task`（含 `pass_percent`、`assignee_order`、`current_index`），实际上把会签、顺序审批混在一张表；无"任一人通过即过"的或签语义，无按权重计票。
- **落地改动**：
  - `wf_countersign_task.sign_type` 扩展取值：`COUNTERSIGN/OR_SIGN/VOTE_SIGN/SEQUENTIAL`
  - `wf_countersign_vote` 增 `vote_weight DECIMAL(6,2)`，节点模型增 `passWeight`
  - 或签命中后未投票任务批量置为 `AUTO_PASS`（依赖 WF-01 的 taskType）
- **工作量**：M
- **优先级**：P1

### [WF-05] 自己审自己的处理策略
- **参考来源**：`aizuda/flowlong` → `core/enums/NodeApproveSelf.java`
- **参考实现怎么做的**：实测 `initiatorThemselves=0`（就是本人审）、`AutoSkip=1`（自动跳过）、`TransferDirectSuperior=2`（转直属上级）、`TransferDepartmentHead=3`（转部门负责人），节点级配置。
- **我们现状**：无该概念。发起人恰好是审批人时会产生自审自批，属于合规风险面。
- **落地改动**：节点模型增 `approveSelf`；审批人解析后做一次自审检测，按策略改派或跳过；跳过时写 `wf_node_record`（event_type=AUTO_SKIP）留痕
- **工作量**：S
- **优先级**：P1 —— 改动小、合规收益直接

### [WF-06] 节点级开关能力
- **参考来源**：`aizuda/flowlong` → `model/NodeModel.java`（实测字段）
- **参考实现怎么做的**：节点模型上有 11 个布尔/配置开关：`remind`（催办）、`allowSelection`（允许选人）、`allowTransfer`（允许转办）、`allowAppendNode`（允许加签）、`allowRollback`（允许回退）、`allowCc`（允许抄送）、`termAuto`+`term`+`termMode`（超时自动处理）、`examineMode`、`groupStrategy`。
- **我们现状**：加签/减签/委派/催办都是全局能力，任意任务都能用；不能按节点关掉（例如"总经理节点不允许加签"）。
- **落地改动**：节点模型加上述开关；`WorkflowEnhanceController` 的 addSign/removeSign/delegate 与 `POST /wf/task/urge` 入口增节点开关校验，拒绝时返回明确业务码
- **工作量**：M
- **优先级**：P1

### [WF-07] 定时节点与触发节点
- **参考来源**：`aizuda/flowlong` → `TaskType.timer=6 / trigger=7`、`NodeModel.triggerType/delayType`；`flowable/flowable-engine`（Apache-2.0）定时器事件实现可直接参照代码
- **参考实现怎么做的**：flowlong 把"等待一段时间自动流转"和"调用外部动作后继续"做成两类节点，`NodeModel.actionUrl` 承载触发目标，`callAsync` 控制同步/异步。
- **我们现状**：有超时**告警**（`wf_timeout_alert`、`wf_escalation_chain`）但没有超时**自动流转**；有回调 DLQ（`wf_callback_dead_letter`、`wf_callback_side_effect`）说明外部调用能力已具备，缺的是把它做成节点类型。
- **落地改动**：
  - `wf_process_definition.model_json` 支持 timer/trigger 节点
  - 复用现有超时扫描调度补"到期自动通过/自动驳回"分支
  - trigger 节点复用现有回调与 DLQ 通道，失败进 `wf_callback_dead_letter`
- **工作量**：L
- **优先级**：P1 —— 现有告警与回调基建已在，改造成本比从零低

### [WF-08] 流程实例状态机细化
- **参考来源**：`dromara/warm-flow` → `core/enums/FlowStatus.java`（Apache-2.0，可直接参照）
- **参考实现怎么做的**：实测 14 态：`TOBESUBMIT=0, APPROVAL=1, PASS=2, AUTO_PASS=3, TERMINATE=4, NULLIFY=5, CANCEL=6, RETRIEVE=7, FINISHED=8, REJECT=9, INVALID=10, TASK_BACK=11, RE_START=12, PENDING=13`。区分了「自动通过 vs 人工通过」「作废 vs 撤销 vs 取回」「任务回退 vs 重新发起」。
- **我们现状**：`wf_process_instance.status` 取值较粗；`recall/reject/pause/resume/terminate/invalidate` 六个动作都有接口，但状态取值没有一一对应，报表口径容易糊。
- **落地改动**：统一 status 取值到上述语义集（本项目未上线，直接改建表 SQL，不做旧值兼容）；`WorkflowMonitorController` 的 overview/trend 按新状态分组
- **工作量**：M
- **优先级**：P1

### [WF-09] 代理人（agent）四态模型
- **参考来源**：`aizuda/flowlong` → `TaskType.agent=13/agentReturn=14/agentAssist=15/agentOwn=16`、`core/enums/AgentType.java`
- **参考实现怎么做的**：把"代理"和"委派"分开：委派是把任务交出去，代理是**代表某人处理**（处理结果仍归属被代理人），并区分「代理归还」「协办」「自己的」三种衍生态。
- **我们现状**：`wf_task.proxy_user_id` 字段已存在（说明设计时想过代理），但 `wf_task_delegation.delegation_type` 把委派和代理混用，没有归还与协办语义。
- **落地改动**：`wf_task_delegation` 拆分或增 `agent_mode`；补 agentReturn 接口；审批结果归属按 proxy_user_id 记账
- **工作量**：M
- **优先级**：P2

### [WF-10] 包含网关（inclusive）与路由分支
- **参考来源**：`dromara/warm-flow` → `NodeType`（实测 `START=0, BETWEEN=1, END=2, SERIAL=3, PARALLEL=4, INCLUSIVE=5`，Apache-2.0）；`aizuda/flowlong` → `NodeModel.inclusiveNodes/routeNodes`
- **参考实现怎么做的**：并行是全部分支都走，包含是满足条件的分支才走且需等齐，路由分支是命中即跳走不回来。
- **我们现状**：有 `wf_parallel_join` 表（并行汇聚已实现），无包含网关、无路由分支。
- **落地改动**：节点模型增 inclusive/route 两类；`wf_parallel_join` 扩展为通用汇聚表，支持"应到分支数动态计算"
- **工作量**：L
- **优先级**：P2

### [WF-11] 草稿保存
- **参考来源**：`aizuda/flowlong` → `TaskType.saveAsDraft=25`
- **参考实现怎么做的**：草稿作为任务的一种状态存在，不产生正式实例，复用同一套表单数据结构。
- **我们现状**：无草稿；表单填一半退出即丢失。
- **落地改动**：新增 `wf_form_draft`（instance_id 可空、definition_id、form_data JSON、user_id）；`POST /wf/start` 支持从草稿提交
- **工作量**：S
- **优先级**：P2

### [WF-12] 流程设计器能力对齐
- **参考来源**：`L1yp/van`（MIT，springboot + bpmnjs + form-design 完整实战，可直接读代码）；`bpmn-io/bpmn-js`（许可需复核，嵌入须保留 bpmn.io 水印）
- **参考实现怎么做的**：van 把「流程设计 + 表单设计 + RBAC」串成一套，流程实例列表由系统抽象配置生成而非逐个开发。
- **我们现状**：已有设计器与模板库（`wf_template`、`wf_template_category`、`wf_template_archive`），本条主要是补 WF-01～WF-07 新增的节点配置项在设计器上的配置面板。
- **落地改动**：设计器节点属性面板增 setType/rejectStrategy/approveSelf/节点开关/timer 配置区
- **工作量**：L（前端为主）
- **优先级**：P1（跟随 WF-01～03 一起交付，否则新能力无处配置）

## 五、不建议移植

| 项 | 原因 |
| --- | --- |
| 换用 flowable / Activiti / camunda 引擎 | 我们已有 46 张自研表 + 完整发布回滚监控体系，换引擎是重写而非迭代；这三家的价值在于「读它们怎么实现定时器、多实例、边界事件」，不是替换 |
| camunda 7（camunda-bpm-platform） | 官方已声明 EoL（仓库描述明确写 End of Life），只作历史实现参考 |
| BPMN 2.0 完整规范落地 | 我们是审批流不是流程编排，BPMN 全集里补偿事件、事务子流程等对企业审批无收益 |
| temporal / dolphinscheduler 的编排模型 | 属于任务编排/数据调度，与人工审批流是不同问题域；仅在 WF-07 触发节点的重试语义上可参考 |
| o2oa 代码 | AGPL-3.0，只可看业务语义 |

## 六、建议批次

**P0（地基批次，建议一次性推进）**
1. WF-01 任务类型语义扩展（其余条目的公共前提）
2. WF-03 审批人来源 8 种 setType（主管链是 OA/HR 真实审批的前提）
3. WF-02 驳回策略 5 种

**P1（能力批次）**
4. WF-12 设计器配置面板（承载 P0 新增配置）
5. WF-05 自审策略、WF-06 节点级开关（小改动、合规收益）
6. WF-04 或签票签、WF-08 状态机细化
7. WF-07 定时/触发节点（复用现有告警与 DLQ 基建）

**P2（增强批次）**
8. WF-09 代理四态、WF-10 包含网关与路由、WF-11 草稿

依赖关系：WF-01 → 所有；WF-03 → OA/HR 审批链；WF-12 → WF-01/02/03/05/06 的配置入口。
