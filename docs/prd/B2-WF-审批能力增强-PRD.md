# PRD：工作流审批能力增强（WF-04/07/08）

| 项 | 内容 |
| --- | --- |
| 条目编号 | WF-04 票签权重 · WF-07 定时与触发节点 · WF-08 状态机细化 |
| 所属批次 | 批次 B（第 2 份，依赖 B1 的 `task_type` 与节点配置扩展） |
| 对标依据 | `docs/benchmark/01-workflow-流程引擎对标.md` §一·五修正 |
| 优先级 | P1 |
| 预估工作量 | M（原估 WF-04 M + WF-07 L + WF-08 M，实测后 WF-04 与 WF-07 均下调） |
| 版本 | v1 · 2026-08-31 |

## 0. 基于实测的范围收敛

对标文档 §一·五 已记录四处修正，其中两处直接影响本 PRD：

| 条目 | 原判断 | 实测 | 收敛后范围 |
| --- | --- | --- | --- |
| WF-04 | 「无或签语义，会签票签混在一张表」 | `CountersignServiceImpl` 实测：第 107 行显式校验 `ALL/ANY/PERCENT/SEQUENTIAL` 四值，第 348-388 行有对应 switch-case 分支；`PERCENT` 有 `passPercent` 范围校验（1-100）与默认值逻辑；`SEQUENTIAL` 有顺序推进 | **只剩票签权重（`passWeight` + `vote_weight`）**，工作量 M → S |
| WF-07 | 「有超时告警但无超时自动流转」「定时节点不可配」 | **🔴 `TimerNodeHandler`（143 行）与 `ScriptNodeHandler`（233 行）已完整实现** —— 详见 §0B | **工作量 L → S+**，只补动作分支与设计器面板 |
| WF-08 | 「实例状态取值较粗」 | `WfProcessStatus` 实测 **6 态**：`RUNNING/COMPLETED/REJECTED/REVOKED/SUSPENDED/INVALIDATED`；`WfTaskStatus` 6 态 | 缺 8 态；**`REVOKED` 一词两义需拆分**，见 §0C |

## 0B. 🔴 定时节点与触发节点**已实现**（2026-08-31 摸排修正）

`handler/impl/` 实测已有 **6 个节点处理器**：
```
CopyNodeHandler          抄送
ManualNodeHandler        人工任务
NotificationNodeHandler  通知
ScriptNodeHandler        脚本（含 HTTP 外调）← 本 PRD 原想新建的"触发节点"
SubprocessNodeHandler    子流程
TimerNodeHandler         定时 ← 本 PRD 原想新建的"定时节点"
```

**`TimerNodeHandler` 已支持**：
- `timerType` = `DELAY`（延迟）/ `SCHEDULE`（定时到点），配置从 `node.getProps()` 读
- Redis ZSet 注册（`sys:wf:timers`），与 `TimerSchedulerService` 配合
- `_skipTimers=true` 流程变量可跳过等待
- 未配置属性时安全降级（直接放行，不卡死流程）

**`ScriptNodeHandler` 已支持**：
- `scriptType` = `API`（HTTP 外调，走 `HttpClientService.executeRequest(url, method, headers, body)`）/ `GROOVY` / `JAVASCRIPT`
- `ScriptExecutionPolicy` 安全策略：进程内脚本默认禁用、JavaScript 不支持、执行超时控制

**因此 WF-07 的真实缺口只有 4 项**（不是"新建两类节点"）：

| # | 缺口 | 说明 |
| --- | --- | --- |
| 1 | `timerAction` 动作分支 | 现在到期就放行，无 `AUTO_PASS` / `AUTO_REJECT` / `NOTIFY_ONLY` 区分 |
| 2 | `delayUnit=WORKDAY` | 工作日延迟需接批次 A 的节假日日历 |
| 3 | `failStrategy` | API 调用失败后的 `BLOCK` / `SKIP` / `TO_DLQ` 分支需核实与补齐 |
| 4 | 设计器配置面板 | `props` 已能存配置，但设计器无对应 UI |

**⚠️ 同时发现现存安全缺陷**：`HttpClientService` **无 SSRF 防护**（无白名单、无私网校验、无协议限制），SCRIPT 节点的 API 类型现在就能调 `169.254.169.254` 等内网地址。

**该缺陷已于 2026-08-31 决定暂不修复**（依据：SCRIPT 的 API 类型当前无人使用或使用者可信、设计器权限受控）。但**本 PRD 的触发节点落地时必须一并处理** —— 因为它会新增一条走同一 `HttpClientService` 的路径，使"无人使用"这个前提失效。详见 `B-H-存量摸排报告.md` §9.1。

## 0C. 🟡 状态机现状：6 态且 `REVOKED` 一词两义

`WfProcessStatus` 实测 6 值，与本 PRD 目标 14 态的差集是 8 态。但更需注意的是**语义重叠**：

| 现有状态 | 承载的语义 | 拆分建议 |
| --- | --- | --- |
| `REVOKED` | **同时承载"发起人撤销"(`recall`) 与"审批人撤回"(`withdraw`)** | 拆为 `CANCELLED`（发起人撤销）+ `WITHDRAWN`（审批人撤回） |
| `INVALIDATED` | 作废 | 保留，另加 `TERMINATED`（管理员终止）区分 |
| `COMPLETED` | 人工通过 | 保留，另加 `AUTO_PASSED`（超时/定时自动通过） |

**这是本 PRD §12-4 待确认项"映射表由谁确认"的实际答案**：现有 8 个流转动作（`recall`/`reject`/`rejectToPrevious`/`withdraw`/`pause`/`resume`/`terminate`/`invalidate`）到 6 态的映射存在多对一，拆分时需逐个动作确认目标状态。

另：前端 `NodeType` 枚举已含 `TIMER` 与 `SCRIPT`，与后端 handler 对应，无需新增节点类型。

## 1. 背景与目标

### 1.1 问题
1. **票签无权重**：`wf_countersign_task` 有 `pass_percent`（按人数比例）但无按权重计票。"董事占 3 票、股东占 1 票"这类场景表达不了
2. **定时节点不可配**：`NodeType.TIMER` 已声明、`TimerScanJob` 已有扫描机制，但节点上无"等待多久/等到何时"的配置，无法用设计器画出"提交后等 3 天自动进入下一节点"
3. **触发节点不可配**：`NodeType.SCRIPT` 已声明、外部回调与 DLQ 基建已有，但节点上无"调哪个 URL/同步还是异步/失败怎么办"的配置
4. **实例状态粒度粗**：`wf_process_instance.status` 取值较粗，而已实现的动作有 recall / reject / rejectToPrevious / withdraw / pause / resume / terminate / invalidate 八种，状态取值与动作不一一对应，监控报表口径易糊

### 1.2 目标
1. 票签支持按权重计票
2. 定时节点与触发节点可在设计器配置并正确执行
3. 实例状态机细化到与已有动作一一对应
4. 复用现有基建（`TimerScanJob`、回调 DLQ、`TaskTimeoutJob`），不新建调度机制

## 2. 现状基线（实测）

| 能力 | 现状 |
| --- | --- |
| 会签表 | `wf_countersign_task`(17列)：`sign_type` / `pass_percent` / `total_count` / `voted_count` / `approve_count` / `reject_count` / `assignee_order` / `current_index` |
| 投票表 | `wf_countersign_vote`（无 `vote_weight`） |
| 签署类型 | `WfNodeConfig.signType` = ALL / ANY / PERCENT；前端另有 SEQUENTIAL |
| 定时基建 | `TimerScanJob`（`fixedRate 60s` + 每日 3 点清理）、`TimerSchedulerService.scanAndTriggerTimers()`（Redis ZSet + 自持 lock key，注释明确要求单点调度） |
| 超时自动处理 | `TaskTimeoutJob.handleTimeoutTask()` → `completeTask`，默认 AUTO_PASS |
| 外部调用基建 | `wf_callback_dead_letter`、`wf_callback_side_effect`、`CallbackDlqAdminController`（list / replay / ignore） |
| 节点类型 | 前端 `NodeType` 11 类已含 `TIMER` / `SCRIPT` / `SUBPROCESS` / `NOTIFICATION` / `MANUAL` / `COPY` |
| 节点处理器 | `handler/impl/` 下已有 `CopyNodeHandler`、`ManualNodeHandler` 等，**处理器模式已建立** |
| 实例状态 | `wf_process_instance.status`；已实现 8 种流转动作 |
| 事务消息 | `wf_transaction_message`、`TransactionConsistencyService` |

## 3. 范围

### 3.1 做（**按 §0B 摸排结果收敛**）
1. `wf_countersign_vote` 增 `vote_weight`；节点增 `passWeight`；票签按权重计票
2. **扩展现有 `TimerNodeHandler`**：补 `timerAction` 动作分支（AUTO_PASS/AUTO_REJECT/NOTIFY_ONLY）+ `delayUnit=WORKDAY` 工作日计算
3. **扩展现有 `ScriptNodeHandler`**：补 `failStrategy` 分支（BLOCK/SKIP/TO_DLQ）+ 失败进 DLQ 的接线
4. 实例状态机细化到 14 态（含 `REVOKED` 拆分为 `CANCELLED`/`WITHDRAWN`），监控接口按新状态分组
5. 设计器补定时/触发节点配置面板（后端 `props` 已支持，只缺 UI）
6. **`HttpClientService` 补 SSRF 防护** —— 触发节点落地会使"无人使用"前提失效（§0B）

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| **新建 `TimerNodeHandler`** | **已存在且功能完整**（§0B），只扩展动作分支 |
| **新建 `TriggerNodeHandler`** | **`ScriptNodeHandler` 已承担该职责**（`scriptType=API` 即 HTTP 外调），不新建处理器 |
| 新建定时调度机制 | `TimerScanJob` + `TimerSchedulerService` + Redis ZSet 已有 |
| 新建外部调用与重试机制 | `HttpClientService` + `wf_callback_*` + DLQ 已有 |
| 新增 `TIMER`/`SCRIPT` 节点类型 | 前后端枚举与 handler 均已存在 |
| 改 `TaskTimeoutJob` 的超时自动处理 | 已实现，`slaAction` 接线在 B1 |
| 包含网关与路由分支 | WF-10（批次 H） |
| 代理四态与草稿 | WF-09 / WF-11（批次 H） |

## 4. 功能需求

### FR-1 票签权重（WF-04）
- FR-1.1 `wf_countersign_vote` 增 `vote_weight DECIMAL(6,2)`（默认 1.00）
- FR-1.2 `WfNodeConfig` 增 `passWeight DECIMAL(6,2)`（通过所需权重阈值）与 `weightSource`（`EQUAL` 等权 / `BY_JOB_LEVEL` 按职级 / `BY_CONFIG` 按节点配置的人员权重表）
- FR-1.3 `sign_type` 扩展 `WEIGHT_SIGN`（票签），与已有 `ALL`/`ANY`/`PERCENT`/`SEQUENTIAL` 并列
- FR-1.4 计票逻辑：累计同意权重 ≥ `passWeight` 即通过；累计反对权重 > (总权重 - passWeight) 即否决（提前结束，避免无意义等待）
- FR-1.5 提前结束时未投票任务批量置 `task_type=AUTO_PASS`（依赖 B1 的 `task_type`）
- FR-1.6 `BY_JOB_LEVEL` 时权重取自 `hr_job_level`（需跨服务调 HR，走现有 `@Inner` 通道；HR 不可达时降级为等权并告警）

### FR-2 定时节点（WF-07 前半）
- FR-2.1 `WfNodeConfig` 增定时配置：
  ```
  timerType     DELAY | FIXED_TIME | CRON_ONCE
  delayValue    Integer（DELAY 用）
  delayUnit     MINUTE | HOUR | DAY | WORKDAY
  fixedTime     String（FIXED_TIME 用，支持流程变量占位）
  timerAction   AUTO_PASS | AUTO_REJECT | NOTIFY_ONLY
  ```
- FR-2.2 `delayUnit=WORKDAY` 时用批次 A 的节假日日历计算（`nextWorkday`），这是与 HR-04 的联动点
- FR-2.3 新增 `TimerNodeHandler`（按现有 `handler/impl/` 模式），流程流转到定时节点时注册到 `TimerSchedulerService` 的 Redis ZSet
- FR-2.4 到期由现有 `TimerScanJob`（60s 扫描）触发，**不新建调度器**；`TimerSchedulerService` 的单点约束保持不变
- FR-2.5 定时节点可被人工提前结束（管理员操作，走审计）
- FR-2.6 流程作废/终止时清理对应 ZSet 条目，防悬挂

### FR-3 触发节点（WF-07 后半）
- FR-3.1 `WfNodeConfig` 增触发配置：
  ```
  triggerType     HTTP_CALLBACK | INNER_SERVICE | MESSAGE
  actionUrl       String（HTTP_CALLBACK 用）
  actionMethod    GET | POST
  actionHeaders   Object
  actionBody      String（支持流程变量占位）
  callAsync       Boolean（默认 true）
  retryCount      Integer
  failStrategy    BLOCK | SKIP | TO_DLQ
  ```
- FR-3.2 新增 `TriggerNodeHandler`，复用现有回调通道；失败进 `wf_callback_dead_letter`，可用现有 `CallbackDlqAdminController` 重放
- FR-3.3 `callAsync=false` 时同步等待响应（有超时上限），响应体可写入流程变量供后续节点用
- FR-3.4 `failStrategy=BLOCK` 时流程停在该节点并告警（写 `wf_anomaly_alert`）；`SKIP` 时继续流转并留痕；`TO_DLQ` 时进 DLQ 后继续
- FR-3.5 **安全**：`actionUrl` 必须走白名单校验（见 §6 NFR），禁止调用内网敏感地址
- FR-3.6 `triggerType=MESSAGE` 时走 SYS-01 消息中心发送（依赖批次 A）

### FR-4 实例状态机细化（WF-08）
- FR-4.1 `wf_process_instance.status` 统一到 14 态（参照 warm-flow `FlowStatus`，Apache-2.0 可直接借鉴实现）：
  | 状态 | 含义 | 对应动作 |
  | --- | --- | --- |
  | `DRAFT` | 草稿待提交 | （WF-11 用，本期预留） |
  | `RUNNING` | 审批中 | start |
  | `PASSED` | 人工通过结束 | complete 到 END |
  | `AUTO_PASSED` | 自动通过结束 | 超时 AUTO_PASS / 定时节点 |
  | `REJECTED` | 驳回结束 | reject（TERMINATE 策略） |
  | `TERMINATED` | 管理员终止 | terminate |
  | `INVALIDATED` | 作废 | invalidate |
  | `CANCELLED` | 发起人撤销 | recall |
  | `WITHDRAWN` | 审批人撤回 | withdraw |
  | `TASK_BACK` | 已回退（驳回到上一步/指定节点后的中间态） | rejectToPrevious |
  | `PAUSED` | 已暂停 | pause |
  | `RESTARTED` | 重新发起 | （重新提交场景） |
  | `PENDING` | 等待外部（定时/触发节点阻塞中） | TimerNodeHandler / TriggerNodeHandler |
  | `FAILED` | 执行异常 | 触发节点 BLOCK 等 |
- FR-4.2 项目未上线，直接改建表 SQL 与种子数据，不做旧值兼容
- FR-4.3 `WorkflowMonitorController` 的 `/monitor/overview`、`/monitor/trend`、`/monitor/process/list` 按新状态分组
- FR-4.4 前端状态标签与筛选项同步；状态色用批次 A 的 `--cf-chart-good/warning/critical` 语义色（不占分类槽）
- FR-4.5 状态流转合法性校验：定义允许的状态转移矩阵，非法转移拒绝并记日志

### FR-5 设计器（补 B1 未覆盖的节点类型）
- FR-5.1 定时节点属性面板：`timerType` / 延迟值与单位 / 固定时间 / `timerAction`
- FR-5.2 触发节点属性面板：`triggerType` / URL / 方法 / 请求头 / 请求体（带变量插入辅助）/ 同步异步 / 重试 / 失败策略
- FR-5.3 票签配置：`sign_type=WEIGHT_SIGN` 时显示 `passWeight` 与 `weightSource`
- FR-5.4 触发节点 URL 输入时提示白名单规则

## 5. 数据模型

| 表 | 改动 |
| --- | --- |
| `wf_countersign_vote` | 增 `vote_weight DECIMAL(6,2) DEFAULT 1.00` |
| `wf_countersign_task` | `sign_type` 扩展取值 `WEIGHT_SIGN`；增 `total_weight` / `approve_weight` / `reject_weight` DECIMAL(10,2) |
| `wf_process_instance` | `status` 取值统一到 14 态（改建表 SQL 注释与种子数据） |
| `wf_process_definition.model_json` | 节点新增定时/触发/票签配置字段（JSON，不改表结构） |

**新增节点权重配置**：若 `weightSource=BY_CONFIG`，人员权重存在节点 JSON 的 `assigneeWeights` 数组里，不新建表。

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| **触发节点 SSRF 防护** | `actionUrl` 必须过白名单（域名或 IP 段白名单，配置在 `sys_config`）；**禁止内网私有地址**（10.x / 172.16-31.x / 192.168.x / 127.x / 169.254.x）除非显式加白；禁止 file/gopher 等非 HTTP 协议；重定向不自动跟随 |
| 触发节点超时 | 同步模式必须有超时上限（默认 10 秒，上限 60 秒），防流程被外部服务拖死 |
| 定时节点可靠性 | 复用现有 ZSet + `TimerScanJob`；流程作废时清理 ZSet 防悬挂（FR-2.6） |
| 定时精度 | **受 `TimerScanJob` 3 分钟扫描周期限制，到期误差 ≤ 3 分钟**，必须在设计器提示。<br>注：批次 A A3 已定"调大高频任务间隔后统一走集中调度"，`TimerScanJob` 从 60s 调整为 3min。若某流程对定时精度要求高，可在任务管理界面单独调小该任务间隔（无需改代码） |
| 状态机一致性 | FR-4.5 的转移矩阵在服务端强制校验 |
| 权重计算精度 | DECIMAL 计算，避免浮点误差导致阈值判断错 |
| 跨服务降级 | `BY_JOB_LEVEL` 取 HR 职级失败时降级等权 + 告警（FR-1.6） |
| 变量占位安全 | `actionBody` / `fixedTime` 的流程变量替换只允许白名单变量，**不做表达式求值** |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 票签按权重计票：设 `passWeight=5`，权重 3+2 两人同意即通过；未投票任务置 AUTO_PASS |
| AC-2 | 反对权重超阈值时提前否决，不等剩余人投票 |
| AC-3 | `weightSource=BY_JOB_LEVEL` 时权重取自 HR 职级；HR 不可达时降级等权并告警 |
| AC-4 | 定时节点 `DELAY 1 HOUR`：流程停在该节点，1 小时后（**误差 ≤ 3 分钟**）自动流转；设计器已提示该精度 |
| AC-5 | `delayUnit=WORKDAY` 时跨周末与节假日正确计算（联动批次 A 节假日日历） |
| AC-6 | 流程作废后对应 ZSet 条目被清理，不再触发 |
| AC-7 | 定时节点可被管理员人工提前结束，操作记审计 |
| AC-8 | 触发节点调用外部 URL 成功后流转；失败按三种 `failStrategy` 分别正确处理 |
| AC-9 | 触发失败进 `wf_callback_dead_letter`，可用现有 DLQ 接口重放 |
| AC-10 | **SSRF 防护：填内网地址（127.0.0.1 / 10.x / 192.168.x）被拒绝；非 HTTP 协议被拒绝；重定向不跟随** |
| AC-11 | 同步触发节点超时后按 `failStrategy` 处理，不无限等待 |
| AC-12 | 14 种实例状态在对应动作后正确落库 |
| AC-13 | 非法状态转移（如已结束实例被 resume）被拒绝 |
| AC-14 | 监控接口 overview / trend / process list 按新状态正确分组；前端筛选项同步 |
| AC-15 | 设计器可配置定时、触发、票签全部项；URL 输入有白名单提示 |
| AC-16 | 回归：现有 ALL / ANY / PERCENT / SEQUENTIAL 四种签署行为不变 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **B1（WF 审批语义地基）** | `task_type` 字段、节点配置扩展机制、`slaAction` 接线 |
| **批次 A HR-04 节假日日历** | `delayUnit=WORKDAY` 计算 |
| **批次 A SYS-01 消息中心** | `triggerType=MESSAGE` |
| 现有 `TimerScanJob` + `TimerSchedulerService` | 定时节点执行 |
| 现有 `wf_callback_*` + DLQ | 触发节点失败处理 |
| HR `@Inner` 接口 | `BY_JOB_LEVEL` 权重 |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **触发节点是 SSRF 攻击面**（用户可配 URL，服务端发起请求） | NFR 白名单 + 私有地址禁止 + 协议限制 + 不跟随重定向；AC-10 专项验证。**这是本 PRD 最高风险项** |
| 触发节点同步调用拖死流程 | 超时上限（NFR）+ `failStrategy` 兜底 |
| 定时节点 ZSet 条目悬挂（流程已作废但定时未清） | FR-2.6 + AC-6 |
| `TimerSchedulerService` 单点约束被破坏 | 该服务源码注释明确"不挂 `@Scheduled` 避免两个调度器并发消费 ZSet"，改造时保持由 `TimerScanJob` 单点调度；批次 A SYS-02 若纳管 `TimerScanJob` 需同步确认（已在 SYS-02 PRD §12-4 记录） |
| 状态机改造影响现有监控报表 | AC-14；改造前梳理现有状态取值到新 14 态的映射表 |
| 权重来源跨服务依赖 HR | 降级等权（FR-1.6 + AC-3） |
| 定时精度 60 秒误差不满足业务预期 | 设计器提示；如需更高精度需调 `TimerScanJob` 频率（会增加扫描开销） |

## 9. 里程碑

> 里程碑已按 §0B 摸排结果重排：原 M3/M4 的"新建两类节点"改为"扩展现有 Handler"，工作量下降。

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 票签权重（表改 + 计票 + 提前否决） | AC-1/2/3/16 |
| M2 | 实例状态机 14 态 + **`REVOKED` 拆分** + 转移矩阵 + 监控接口调整 | AC-12/13/14 |
| M3 | **扩展 `TimerNodeHandler`**：`timerAction` 三分支 + `delayUnit=WORKDAY`（接批次 A 日历）+ 流程作废时 ZSet 清理 | AC-4/5/6/7 |
| M4 | **扩展 `ScriptNodeHandler`**：`failStrategy` 三分支 + DLQ 接线 + **`HttpClientService` SSRF 防护** | AC-8/9/10/11 |
| M5 | 设计器面板（后端 props 已支持，纯前端工作） | AC-15 |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 触发节点 URL 白名单的维护方式 | 建议存 `sys_config`（key 如 `workflow.trigger.url.whitelist`），管理员维护；默认空表示禁用触发节点的外部调用 |
| 2 | 定时精度 3 分钟是否够用 | 批次 A A3 已把 `TimerScanJob` 从 60s 调为 3min（降低集中调度的调用量）。审批流场景以小时/天为单位，3 分钟误差应可接受；若个别流程不够，可在任务管理界面调小间隔 |
| 3 | `weightSource=BY_JOB_LEVEL` 的职级到权重映射规则 | 建议在节点配置里存映射表（职级→权重），而非硬编码；HR 职级变化不影响历史实例 |
| 4 | 状态从粗到细的映射表由谁确认 | 需产品与运维共同确认现有 status 取值到 14 态的映射，避免历史报表口径断裂（项目未上线，实际影响小） |
