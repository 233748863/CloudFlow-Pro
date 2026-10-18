# 批次 B 技术设计（工作流审批语义）

| 项 | 内容 |
| --- | --- |
| 覆盖 | B1（WF-01/02/03/05/06/12）+ B2（WF-04/07/08） |
| 表改动 | 改 5 张，新增 2 张，**无删表** |
| 接口 | 改 8 个，新增 4 个 |
| 版本 | v1 · 2026-08-31 |

## 0. 遵循的工作流模块规范（实测提取，与 common 表不同）

```sql
主键：      VARCHAR(64)  NOT NULL COMMENT 'xxxID'    ← 非 BIGINT 自增
租户：      tenant_id  BIGINT(20)  DEFAULT 100000
乐观锁：    lock_version INT DEFAULT 1              ← 注意：不是 version
           （wf_task_delegation 用 version INT NOT NULL DEFAULT 0，两种并存）
时间：      create_time DATETIME DEFAULT NULL 或 DEFAULT CURRENT_TIMESTAMP
表尾：      ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='xxx'
```

**注意**：工作流表**普遍无 `deleted` 列**（流程数据靠归档而非逻辑删除），本批新表遵循此惯例。

---

## 1. 表结构改动

### 1.1 `wf_task` 增 `task_type`（WF-01）

```sql
-- 在 candidate_roles 之后插入
  task_type         VARCHAR(30)     DEFAULT 'APPROVAL' COMMENT '任务语义类型',
```

取值 **18 种**（B1 的 FR-1.2 列 17 种 + B2 的 `WEIGHT_SIGN`）—— 原文误写"17 种（B1 的 16 种）"，2026-09-01 更正，**以下面的清单为准，共 18 行**：
```
APPROVAL / CC / MANUAL
COUNTERSIGN / OR_SIGN / PERCENT_SIGN / SEQUENTIAL_SIGN / WEIGHT_SIGN
TRANSFER / DELEGATE / DELEGATE_RETURN / ADD_SIGN / REDUCE_SIGN
REJECT / REJECT_JUMP
AUTO_PASS / AUTO_REJECT / AUTO_SKIP
```

> `WEIGHT_SIGN` 是 B2 的票签，与 B1 的 17 种合并为 **18** 种，避免分两次改表。

`wf_task_history` 同步增同名列。

### 1.2 `wf_countersign_vote` 增权重（WF-04）

```sql
-- 在 vote_result 之后插入
  vote_weight       DECIMAL(6,2)    NOT NULL DEFAULT 1.00 COMMENT '投票权重',
```

### 1.3 `wf_countersign_task` 增权重汇总（WF-04）

```sql
-- 在 reject_count 之后插入
  total_weight      DECIMAL(10,2)   DEFAULT NULL COMMENT '总权重',
  approve_weight    DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '同意权重累计',
  reject_weight     DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '反对权重累计',
  pass_weight       DECIMAL(10,2)   DEFAULT NULL COMMENT '通过所需权重阈值',
```

`sign_type` 扩展取值：现有 `ALL/ANY/PERCENT/SEQUENTIAL` + 新增 `WEIGHT`

### 1.4 `wf_task_delegation` 增代理模式（预留 H1 的 WF-09）

```sql
  agent_mode        VARCHAR(20)     DEFAULT 'DELEGATE' COMMENT '模式：DELEGATE委派/AGENT代理/AGENT_ASSIST协办',
```

> H1 的 WF-09 才用，本批只加列不实现逻辑（避免两次改表）。

### 1.5 `wf_process_instance.status` 取值扩展（WF-08）

**不改表结构，只改取值范围与注释**。从 6 态扩到 14 态：

| 新状态 | 对应动作 | 现状映射 |
| --- | --- | --- |
| `DRAFT` | 草稿（H1 的 WF-11 用） | 新增 |
| `RUNNING` | start | 保留 |
| `PASSED` | complete 到 END | **原 `COMPLETED` 改名** |
| `AUTO_PASSED` | 超时/定时自动通过 | 新增 |
| `REJECTED` | reject（TERMINATE 策略） | 保留 |
| `TERMINATED` | terminate | **从 `INVALIDATED` 拆出** |
| `INVALIDATED` | invalidate | 保留 |
| `CANCELLED` | recall（发起人撤销） | **从 `REVOKED` 拆出** |
| `WITHDRAWN` | withdraw（审批人撤回） | **从 `REVOKED` 拆出** |
| `TASK_BACK` | rejectToPrevious | 新增 |
| `PAUSED` | pause | **原 `SUSPENDED` 改名** |
| `RESTARTED` | 重新发起 | 新增 |
| `PENDING` | 定时/触发节点阻塞中 | 新增 |
| `FAILED` | 触发节点 BLOCK | 新增 |

**8 个动作到新状态的映射**（B2 §0C 待确认项的答案）：
```
recall            → CANCELLED
reject            → REJECTED（TERMINATE 策略）/ TASK_BACK（回退策略）
rejectToPrevious  → TASK_BACK
withdraw          → WITHDRAWN
pause             → PAUSED
resume            → RUNNING
terminate         → TERMINATED
invalidate        → INVALIDATED
```

`WfProcessStatus` 枚举同步改造。`WfTaskStatus` 保持 6 态不动（任务状态无歧义）。

### 1.6 新增 `wf_form_field_permission`（C3 的 LC-04 依赖，本批建表）

> C3 的字段级权限需要此表。**放本批建**，因为它挂 `definition_id` + `node_key`，属工作流域。

```sql
-- 47. 表单字段权限表
DROP TABLE IF EXISTS wf_form_field_permission;
CREATE TABLE wf_form_field_permission (
  permission_id     VARCHAR(64)     NOT NULL COMMENT '权限ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  definition_id     VARCHAR(64)     NOT NULL COMMENT '流程定义ID',
  node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key（__START__表示发起环节）',
  field_id          VARCHAR(100)    NOT NULL COMMENT '字段ID（子表列用 subTableId.columnId）',
  visible_flag      TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否可见',
  editable_flag     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否可编辑',
  required_flag     TINYINT(1)      DEFAULT NULL COMMENT '是否必填（NULL=继承字段自身定义）',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (permission_id),
  UNIQUE KEY uk_wffp_def_node_field (tenant_id, definition_id, node_key, field_id),
  KEY idx_wffp_def_node (definition_id, node_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表单字段权限表';
```

### 1.7 新增 `wf_form_draft`（H1 的 WF-11 预留，本批建表）

```sql
-- 48. 表单草稿表
DROP TABLE IF EXISTS wf_form_draft;
CREATE TABLE wf_form_draft (
  draft_id          VARCHAR(64)     NOT NULL COMMENT '草稿ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  definition_id     VARCHAR(64)     NOT NULL COMMENT '流程定义ID',
  definition_name   VARCHAR(100)    DEFAULT NULL COMMENT '流程名称',
  form_id           VARCHAR(64)     DEFAULT NULL COMMENT '表单ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  title             VARCHAR(200)    DEFAULT NULL COMMENT '标题',
  form_data         LONGTEXT COMMENT '表单数据JSON',
  node_assignees    TEXT COMMENT '发起人自选审批人JSON',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '附件',
  last_save_time    DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '最近保存时间',
  expire_time       DATETIME        DEFAULT NULL COMMENT '过期时间',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (draft_id),
  UNIQUE KEY uk_wfdraft_user_def (tenant_id, user_id, definition_id),
  KEY idx_wfdraft_expire (expire_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表单草稿表';
```

### 1.8 表数变化

`02.cloudflow-workflow.sql`：43（批次 A 删 3 后）→ **45**（+2）
全库：252 → **254**

---

## 2. `WfNodeConfig` 扩展（JSON 模型，不改表）

`wf_process_definition.model_json` 的节点对象新增字段。现有 18 字段 → **35 字段**。

```java
// ===== B1 新增 11 字段 =====
private String  rejectStrategy;      // TO_INITIATOR|TO_PREVIOUS_NODE|TO_SPECIFIED_NODE|TERMINATE|TO_PARENT_NODE
private String  rejectToNodeKey;     // TO_SPECIFIED_NODE 用
private String  approveSelf;         // ALLOW|AUTO_SKIP|TO_DIRECT_LEADER|TO_DEPT_MANAGER
private Integer directorLevel;       // MULTI_LEVEL_MANAGER 用，1=直属上级
private String  directorFallback;    // TOP_LEVEL|SKIP|FAIL
private Map<String,Object> selectableScope;  // INITIATOR_SELECTED 的可选范围
private Boolean allowAddSign;        // 默认 true
private Boolean allowReduceSign;     // 默认 true
private Boolean allowDelegate;       // 默认 true
private Boolean allowUrge;           // 默认 true
private Boolean allowRollback;       // 默认 true
private Boolean allowCc;             // 默认 true
private Boolean allowSelection;      // 默认 true

// ===== B2 新增 6 字段 =====
private BigDecimal passWeight;       // 票签通过权重阈值
private String  weightSource;        // EQUAL|BY_JOB_LEVEL|BY_CONFIG
private List<Map<String,Object>> assigneeWeights;  // BY_CONFIG 时的人员权重
private String  timerAction;         // AUTO_PASS|AUTO_REJECT|NOTIFY_ONLY
private String  delayUnit;           // MINUTE|HOUR|DAY|WORKDAY
private String  failStrategy;        // BLOCK|SKIP|TO_DLQ
```

**兼容性**：全部有默认值，旧模型 JSON 无这些字段时按默认值处理（等价现状行为）。这是 B1 的 AC-14 的实现基础。

**注意 `TimerNodeHandler` 现有配置读法**：从 `node.getProps()`（Map）读 `timerType` / `scheduleTime`。新增的 `timerAction` / `delayUnit` 应**保持同样方式放 `props`**，而非提升为 `WfNodeConfig` 一级字段 —— 避免改动现有 Handler 的读取逻辑。

同理 `ScriptNodeHandler` 的 `failStrategy` 放 `props`。

---

## 3. 审批人策略扩展（WF-03）

### 3.1 复用现有体系，只新增 2 个实现类

现有 `AssignUserStrategy` + `AssignUserStrategyFactory` + 7 实现（9 类型）**不动**。新增：

```java
@Component
public class InitiatorSelectedAssignStrategy implements AssignUserStrategy {
    @Override public boolean supports(String t) { return "INITIATOR_SELECTED".equals(t); }

    @Override public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        // 从 wf_task_candidate 读发起时选定的人（source='INITIATOR_SELECTED'）
        List<WfTaskCandidate> cands = candidateMapper.selectList(
            new LambdaQueryWrapper<WfTaskCandidate>()
                .eq(WfTaskCandidate::getInstanceId, instance.getInstanceId())
                .eq(WfTaskCandidate::getNodeKey, node.getId())
                .eq(WfTaskCandidate::getSource, "INITIATOR_SELECTED"));
        return cands.isEmpty() ? null : cands.get(0).getUserId();
    }
    @Override public List<Long> resolveMulti(...) { /* 会签场景返回全部 */ }
}

@Component
public class MultiLevelManagerAssignStrategy implements AssignUserStrategy {
    private static final int MAX_LEVEL = 10;   // 防部门树成环

    @Override public boolean supports(String t) { return "MULTI_LEVEL_MANAGER".equals(t); }

    @Override public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        int target = node.getDirectorLevel() != null ? node.getDirectorLevel() : 1;
        Long deptId = resolveStarterDeptId(instance);
        Long found = null; int level = 0; Set<Long> visited = new HashSet<>();

        while (deptId != null && level < MAX_LEVEL) {
            if (!visited.add(deptId)) { break; }     // 成环保护
            SysDept dept = deptMapper.selectById(deptId);
            if (dept == null) break;
            Long leader = resolveLeaderUserId(dept);  // 复用 DeptManagerAssignStrategy 的三形态兼容
            if (leader != null) {
                level++;
                found = leader;
                if (level == target) return leader;
            }
            deptId = dept.getParentId();
        }
        // 层级不足
        return switch (nullSafe(node.getDirectorFallback(), "TOP_LEVEL")) {
            case "TOP_LEVEL" -> found;      // 用能找到的最高级
            case "SKIP"      -> null;       // 返回 null 触发节点跳过
            case "FAIL"      -> throw WorkflowException.validationError("主管层级不足");
            default          -> found;
        };
    }
}
```

**关键**：`resolveLeaderUserId(dept)` 必须**抽取现有 `DeptManagerAssignStrategy` 的 leader 解析逻辑**（它已兼容 leader 字段存 userId / userName / nickName 三种形态），做成公共方法供两个策略复用，不重复实现。

### 3.2 `wf_task_candidate` 增 `source` 列

```sql
  source            VARCHAR(30)     DEFAULT 'NODE_CONFIG' COMMENT '来源：NODE_CONFIG|INITIATOR_SELECTED|ADD_SIGN',
```

---

## 4. 驳回策略 5 种（WF-02）

### 4.1 复用现有 `rejectToPrevious`

`WorkflowP4ServiceImpl.rejectToPrevious()`（P4.8）已实现"回到上一审批节点"。**改造为策略分派的一个分支**，不重写：

```java
public R<?> reject(String taskId, RejectRequest req) {
    WfTask task = loadAndAssertAccess(taskId);
    WfNodeConfig node = resolveNodeConfig(task);

    // 节点开关校验（WF-06）
    assertNodeAllows(node, "allowRollback");

    String strategy = req.getStrategy() != null ? req.getStrategy()
                    : nullSafe(node.getRejectStrategy(), "TO_INITIATOR");

    return switch (strategy) {
        case "TO_INITIATOR"     -> rejectToInitiator(task, req);        // 现有 reject 逻辑
        case "TO_PREVIOUS_NODE" -> rejectToPrevious(taskId, ...);        // 现有 P4.8 逻辑，复用
        case "TO_SPECIFIED_NODE"-> rejectToSpecifiedNode(task, req, node);  // 新增
        case "TERMINATE"        -> terminateByReject(task, req);         // 新增，复用 terminate
        case "TO_PARENT_NODE"   -> rejectToParent(task, req);            // 新增
        default -> throw WorkflowException.validationError("未知驳回策略: " + strategy);
    };
}
```

### 4.2 `TO_SPECIFIED_NODE` 的合法性校验（AC-4）

```java
private void assertTargetNodeBefore(String definitionId, String currentNodeKey, String targetNodeKey) {
    List<String> order = resolveNodeExecutionOrder(definitionId);   // 从 model_json 拓扑排序
    int cur = order.indexOf(currentNodeKey);
    int tgt = order.indexOf(targetNodeKey);
    if (tgt < 0)        throw WorkflowException.validationError("目标节点不存在");
    if (tgt >= cur)     throw WorkflowException.validationError("只能驳回到当前节点之前的节点");
}
```

### 4.3 `TO_PARENT_NODE` 的边界（AC-5）

```java
private R<?> rejectToParent(WfTask task, RejectRequest req) {
    WfProcessInstance inst = instanceMapper.selectById(task.getInstanceId());
    if (inst.getParentInstanceId() == null) {
        // 非子流程，降级为 TO_INITIATOR
        log.warn("非子流程实例使用 TO_PARENT_NODE，降级为 TO_INITIATOR");
        return rejectToInitiator(task, req);
    }
    WfProcessInstance parent = instanceMapper.selectById(inst.getParentInstanceId());
    if (parent == null || isFinished(parent.getStatus())) {
        // 父实例已结束 → 降级为 TERMINATE 并留痕（AC-5）
        writeNodeRecord(inst, "PARENT_FINISHED_DEGRADE_TO_TERMINATE");
        return terminateByReject(task, req);
    }
    // 正常穿透：子实例置 REJECTED，父实例回到 parent_node_key
    ...
}
```

多层嵌套时逐级向上，最多穿透至根实例。

---

## 5. 自审策略（WF-05）

```java
// 在审批人解析完成后调用
private Long applyApproveSelfPolicy(Long resolved, WfNodeConfig node, WfProcessInstance inst) {
    if (resolved == null || !resolved.equals(inst.getStartUserId())) {
        return resolved;   // 非自审，原样返回
    }
    String policy = nullSafe(node.getApproveSelf(), "ALLOW");
    Long redirected = switch (policy) {
        case "ALLOW"            -> resolved;
        case "AUTO_SKIP"        -> null;                                    // 返回 null → 节点跳过
        case "TO_DIRECT_LEADER" -> deptManagerStrategy.resolveDirectLeader(inst);
        case "TO_DEPT_MANAGER"  -> deptManagerStrategy.resolveDeptManager(inst);
        default                 -> resolved;
    };
    // AC-10：转派后仍是本人 → 降级 ALLOW 并留痕，防死循环
    if (redirected != null && redirected.equals(inst.getStartUserId())) {
        writeNodeRecord(inst, node, "APPROVE_SELF_REDIRECT_FAILED_DEGRADE_TO_ALLOW");
        return resolved;
    }
    if ("AUTO_SKIP".equals(policy)) {
        writeNodeRecord(inst, node, "AUTO_SKIP");   // AC-9
    }
    return redirected;
}
```

---

## 6. 节点开关校验（WF-06）

统一在 6 个动作接口入口调用：

```java
private void assertNodeAllows(WfNodeConfig node, String switchName) {
    if (node == null) return;                    // 无节点配置 → 放行（兼容旧定义）
    Boolean allowed = switch (switchName) {
        case "allowAddSign"    -> node.getAllowAddSign();
        case "allowReduceSign" -> node.getAllowReduceSign();
        case "allowDelegate"   -> node.getAllowDelegate();
        case "allowUrge"       -> node.getAllowUrge();
        case "allowRollback"   -> node.getAllowRollback();
        case "allowCc"         -> node.getAllowCc();
        default -> Boolean.TRUE;
    };
    if (Boolean.FALSE.equals(allowed)) {         // 只有显式 false 才拦
        throw new WorkflowException("NODE_ACTION_FORBIDDEN",
            "当前节点不允许该操作：" + switchName);
    }
}
```

**关键**：`Boolean.FALSE.equals(allowed)` 而非 `!allowed` —— null（旧定义未配）视为允许，这是 AC-14 行为兼容的实现要点。

---

## 7. 票签权重计票（WF-04）

在 `CountersignServiceImpl` 现有 switch 中加 `WEIGHT` 分支：

```java
case "WEIGHT": {
    BigDecimal approveW = csTask.getApproveWeight();
    BigDecimal rejectW  = csTask.getRejectWeight();
    BigDecimal passW    = csTask.getPassWeight();
    BigDecimal totalW   = csTask.getTotalWeight();

    if (approveW.compareTo(passW) >= 0) {
        return "PASS";     // 同意权重达阈值
    }
    // 反对权重超过"剩余可能同意的最大权重" → 提前否决（AC-2）
    if (rejectW.compareTo(totalW.subtract(passW)) > 0) {
        return "REJECT";
    }
    return "VOTING";
}
```

**权重来源**（`weightSource`）：
```java
private BigDecimal resolveVoterWeight(WfNodeConfig node, Long voterId) {
    return switch (nullSafe(node.getWeightSource(), "EQUAL")) {
        case "EQUAL"        -> BigDecimal.ONE;
        case "BY_CONFIG"    -> findInAssigneeWeights(node, voterId);
        case "BY_JOB_LEVEL" -> {
            try {
                yield hrClient.getJobLevelWeight(voterId);      // Feign 调 HR
            } catch (Exception e) {
                log.warn("取 HR 职级权重失败，降级等权: voterId={}", voterId, e);
                alertService.warn("职级权重取值失败，已降级等权");   // AC-3
                yield BigDecimal.ONE;
            }
        }
        default -> BigDecimal.ONE;
    };
}
```

投票时累加权重并更新 `approve_weight` / `reject_weight`（用乐观锁 `version` 防并发）。

---

## 8. 定时与触发节点扩展（WF-07）

### 8.1 `TimerNodeHandler` 补动作分支

现有实现到期后直接放行。改造点：

```java
// 到期触发时（在 TimerSchedulerService.scanAndTriggerTimers 的消费侧）
String timerAction = (String) props.getOrDefault("timerAction", "AUTO_PASS");
switch (timerAction) {
    case "AUTO_PASS"   -> completeTask(taskId, "定时到期自动通过");   // task_type=AUTO_PASS
    case "AUTO_REJECT" -> rejectTask(taskId, node.getRejectStrategy()); // 联动 WF-02
    case "NOTIFY_ONLY" -> { sendNotice(...); /* 不流转，继续等人工 */ }
}
```

### 8.2 `delayUnit=WORKDAY` 接批次 A 日历

```java
long computeExpireMillis(Map<String,Object> props, WfProcessInstance inst) {
    String unit = (String) props.getOrDefault("delayUnit", "HOUR");
    int value = toInt(props.get("delayValue"));
    if ("WORKDAY".equals(unit)) {
        Long calendarId = holidayResolver.resolveCalendarId(
                resolveEmployeeId(inst.getStartUserId()), LocalDate.now());
        LocalDate target = holidayService.nextWorkday(calendarId, LocalDate.now(), value);
        return target.atTime(LOCAL_WORK_START).toInstant(ZONE).toEpochMilli();
    }
    return System.currentTimeMillis() + value * unitMillis(unit);
}
```

### 8.3 流程作废时清理 ZSet（AC-6）

在 `invalidate` / `terminate` / `reject(TERMINATE)` 三处收口后统一调：
```java
timerSchedulerService.removeInstanceTimers(instanceId);
// 内部：扫 sys:wf:timers 中 member 前缀匹配 instanceId 的条目并 remove
```

### 8.4 `ScriptNodeHandler` 补 `failStrategy` + **SSRF 防护**

```java
// handleApiCall 失败后
String failStrategy = (String) props.getOrDefault("failStrategy", "BLOCK");
switch (failStrategy) {
    case "BLOCK" -> {
        writeAnomalyAlert(instance, node, "触发节点调用失败，流程已阻塞");
        instanceMapper.updateStatus(instanceId, "FAILED");
        return false;      // 不流转
    }
    case "SKIP"  -> { writeNodeRecord(..., "TRIGGER_FAILED_SKIP"); return true; }
    case "TO_DLQ"-> { callbackDlqService.enqueue(...); return true; }
}
```

**SSRF 防护**（在 `HttpClientService` 一处收口，B2 §3.1-6）：

```java
public void assertUrlAllowed(String url) {
    URI uri = URI.create(url);
    String scheme = uri.getScheme();
    if (!"http".equals(scheme) && !"https".equals(scheme)) {
        throw new WorkflowException("URL_SCHEME_FORBIDDEN", "只允许 http/https");
    }
    String host = uri.getHost();
    List<String> whitelist = sysConfigService.getList("workflow.trigger.url.whitelist");

    if (!whitelist.isEmpty()) {
        // 配了白名单 → 只放白名单（含自己服务的私网地址）
        if (!matchesWhitelist(host, whitelist)) {
            throw new WorkflowException("URL_NOT_WHITELISTED", "目标地址不在白名单内");
        }
    } else {
        // 白名单为空 → 默认拒绝私网
        if (isPrivateOrLoopback(host)) {
            throw new WorkflowException("URL_PRIVATE_FORBIDDEN", "禁止访问内网地址");
        }
    }
    // 无论哪种都禁元数据端点
    if (isMetadataEndpoint(host)) {
        throw new WorkflowException("URL_METADATA_FORBIDDEN", "禁止访问云元数据端点");
    }
}

private boolean isPrivateOrLoopback(String host) {
    InetAddress addr = InetAddress.getByName(host);   // 注意：需防 DNS rebinding，解析后校验
    return addr.isLoopbackAddress() || addr.isSiteLocalAddress()
        || addr.isLinkLocalAddress() || addr.isAnyLocalAddress();
}
private boolean isMetadataEndpoint(String host) {
    return host.startsWith("169.254.") || "metadata.google.internal".equals(host);
}
```

**HttpClient 配置**：`disableRedirectHandling()`（不跟随重定向，防公网 302 到内网）+ 连接/读超时上限。

> **注意 DNS rebinding**：`InetAddress.getByName()` 解析后校验，但实际请求时可能重新解析到不同 IP。彻底方案是自定义 `DnsResolver` 在连接阶段校验。本设计先做解析后校验（覆盖绝大多数场景），DNS rebinding 属高级攻击，可在 §11 待确认里记录。

---

## 9. 接口改动

### 9.1 改 8 个

| 接口 | 改动 |
| --- | --- |
| `POST /wf/start` | 增 `nodeAssignees: Map<String,List<Long>>`（发起人自选）、`draftId`（从草稿发起） |
| `POST /wf/reject` | 增 `strategy` + `targetNodeKey` |
| `GET /wf/instance/{id}/trace` | 返回体增 `taskType` |
| `GET /wf/definition/{id}` | 返回含新节点配置字段 |
| `POST /wf/definition/save` | 接收并校验新节点配置 |
| `POST /enhance/task/addSign` | 增 `allowAddSign` 校验 |
| `POST /enhance/task/removeSign` | 增 `allowReduceSign` 校验 |
| `POST /enhance/task/delegate` | 增 `allowDelegate` 校验 |
| `POST /wf/task/urge` | 增 `allowUrge` 校验 |

### 9.2 新增 4 个

```java
// 供设计器选驳回目标节点（只列当前节点之前的）
@GetMapping("/wf/definition/{definitionId}/selectable-nodes")
@SaCheckPermission("workflow:definition:list")
R<List<NodeOptionVO>> selectableNodes(@PathVariable String definitionId,
                                     @RequestParam String currentNodeKey);

// 发起页查询哪些节点需要发起人选人
@GetMapping("/wf/definition/{definitionId}/start-assignee-nodes")
@SaCheckPermission("workflow:process:start")
R<List<StartAssigneeNodeVO>> startAssigneeNodes(@PathVariable String definitionId);
// 返回 [{nodeKey, nodeName, selectableScope, multiple}]

// 表单字段权限配置（C3 的 LC-04 用，本批建接口）
@GetMapping("/wf/definition/{definitionId}/field-permissions")
@SaCheckPermission("workflow:definition:list")
R<List<FieldPermissionVO>> fieldPermissions(@PathVariable String definitionId);

@SysLog("保存表单字段权限")
@PutMapping("/wf/definition/{definitionId}/field-permissions")
@SaCheckPermission("workflow:definition:edit")
R<Void> saveFieldPermissions(@PathVariable String definitionId,
                             @RequestBody List<FieldPermissionDTO> list);
```

**权限码沿用现有 `workflow:*` 命名空间，本批不新增权限码。**

---

## 10. 实施顺序与回归要点

| 阶段 | 内容 | 回归重点 |
| --- | --- | --- |
| M1 | `task_type` 字段 + 各入口写入 + trace 返回 | 现有流程发起/审批/驳回不受影响 |
| M2 | 两个新 `AssignUserStrategy` + `wf_task_candidate.source` | **现有 9 种 approverType 行为不变**（AC-16） |
| M3 | 驳回 5 策略（复用 `rejectToPrevious`）+ 校验 | 现有 `reject` 与 `rejectToPrevious` 行为不变 |
| M4 | 自审 4 策略 + 节点 7 开关 | **旧定义无新字段时行为完全不变**（AC-14，靠 `Boolean.FALSE.equals` 与默认值） |
| M5 | 状态机 14 态 + `WfProcessStatus` 改造 + 监控接口分组 | 监控看板 overview/trend/process-list 数据正确 |
| M6 | 票签权重 + `WEIGHT` 分支 | 现有 ALL/ANY/PERCENT/SEQUENTIAL 四种行为不变 |
| M7 | `TimerNodeHandler` 动作分支 + WORKDAY + ZSet 清理 | 现有 DELAY/SCHEDULE 定时节点行为不变 |
| M8 | `ScriptNodeHandler` failStrategy + **SSRF 防护** | 现有 API/GROOVY 脚本节点在白名单配置后仍可用 |
| M9 | 设计器面板（前端） | — |

**M8 的部署注意**：SSRF 防护上线后，若现有流程已在用 SCRIPT 节点调内网地址，会立即失效。**上线前需先配好 `workflow.trigger.url.whitelist`**（含自己各服务的内网地址），否则会造成生产中断。

---

## 11. 待确认

**全部 4 项已于 2026-08-31 定案**（见 `01-决策汇总.md` §2）：

| # | 问题 | ✅ 决策 |
| --- | --- | --- |
| 1 | `WfProcessStatus` 改名影响面 | **改名，全仓同步**。`COMPLETED`→`PASSED`、`SUSPENDED`→`PAUSED`，`REVOKED` 拆为 `CANCELLED`/`WITHDRAWN`。**实现前需全仓搜这四个字符串的硬编码比较（含前端 `types.ts` 与各页面状态标签）** |
| 2 | SSRF 的 DNS rebinding | **只做解析后校验**。DNS rebinding 记入风险清单不做（需攻击者控制 DNS 服务器，门槛高于直接填内网地址） |
| 3 | 两张预建表位置 | **都放 B 批次建**，避免 C 与 H 再动 `02` 脚本 |
| 4 | `MULTI_LEVEL_MANAGER` 数据源 | **先用部门树**（`sys_dept.parent_id` + `leader`，复用现有三形态兼容逻辑），**同时预留 `MULTI_LEVEL_REPORT_LINE` 策略类位置不实现** —— 待 HR 汇报线数据就绪后新增一个实现类即可，不改现有代码 |

2026-10-16过期产物清理约定：本记录中的已完成历史轮次保留版本、检查范围、结果及未解决边界；过期服务包、独立环境、截图、输入快照及脚本副本按用户授权移除。当前运行和未完成验收依赖单独保护，历史失败不改写为通过；实际删除范围与空间结果见《开发测试过期文件清理-20261016.md》。
