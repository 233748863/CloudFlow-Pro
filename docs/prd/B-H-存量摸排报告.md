# 批次 B–H 存量摸排报告

| 项 | 内容 |
| --- | --- |
| 目的 | 在做 B–H 技术设计前，核实各 PRD 的现状基线判断（A2 的 M0 排查已证明这一步不可跳过） |
| 摸排时间 | 2026-08-31 |
| 方式 | 读 service / handler / strategy / job / validator 层实现，不只看表结构与端点 |
| 结论 | **发现 11 处 PRD 判断偏差，其中 6 处会显著改变工作量，2 处是现存安全缺陷** |

---

## 0. 摘要：11 处偏差分级

| 级别 | 数量 | 说明 |
| --- | --- | --- |
| 🔴 **工作量显著下降**（PRD 大幅低估现状） | 4 | B2 定时/触发节点、C4 表单版本字段、D3 薪资批量、G1 移动端基建 |
| 🟠 **工作量上升 / 问题更严重** | 2 | D1 假期额度、F1 资产 |
| 🟡 **范围需修正** | 3 | B2 状态机、C1 服务端校验、G3 文件存储 |
| ⚠️ **现存安全缺陷**（非本次引入） | 2 | SCRIPT 节点 SSRF、假期额度不校验 |

---

## 1. 批次 B（工作流）

### 1.1 🔴 B2 的定时节点与触发节点 **已完整实现**

**PRD 原判断**（B2 §3.1）：
> "定时节点：节点配置 + `TimerNodeHandler`，复用 `TimerSchedulerService` 的 ZSet 机制"
> "触发节点：节点配置 + `TriggerNodeHandler`，复用现有回调与 DLQ 通道"

**实测 `handler/impl/` 目录下已有 6 个处理器**：
```
CopyNodeHandler.java        抄送
ManualNodeHandler.java      人工任务
NotificationNodeHandler.java 通知
ScriptNodeHandler.java      脚本（含 HTTP 外调）← 即 PRD 想新建的"触发节点"
SubprocessNodeHandler.java  子流程
TimerNodeHandler.java       定时 ← PRD 想新建的"定时节点"
```

**`TimerNodeHandler`（143 行）实测已支持**：
- `timerType` = `DELAY`（延迟）/ `SCHEDULE`（定时到点），从 `node.getProps()` 读配置
- Redis ZSet 注册（`sys:wf:timers`），与 `TimerSchedulerService` 配合
- `_skipTimers=true` 变量可跳过等待（测试友好）
- 未配置属性时安全降级（直接放行而非卡死）

**`ScriptNodeHandler`（233 行）实测已支持**：
- `scriptType` = `API`（HTTP 外调，用 `HttpClientService.executeRequest(url, method, headers, body)`）/ `GROOVY` / `JAVASCRIPT`
- `ScriptExecutionPolicy` 安全策略：进程内脚本默认禁用、JavaScript 不支持、执行超时控制

**影响**：
- **WF-07 的工作量从 L 降到 S** —— 定时与触发节点的执行能力已在，缺的只是：
  1. `timerAction`（AUTO_PASS / AUTO_REJECT / NOTIFY_ONLY）—— 现在到期就放行，无动作分支
  2. `delayUnit=WORKDAY`（工作日计算，需接批次 A 的日历）
  3. `failStrategy`（BLOCK / SKIP / TO_DLQ）—— 现在 API 调用失败的处理需核实
  4. 设计器的配置面板（`props` 里已能存，但设计器无 UI）
- B2 的 §3.1 与里程碑 M3/M4 需重写

### 1.2 ⚠️ **现存安全缺陷：SCRIPT 节点无 SSRF 防护**

B2 的 PRD 把"触发节点 SSRF"列为**最高风险项**并设计了白名单方案。实测发现：

| 组件 | 有无防护 |
| --- | --- |
| `ScriptExecutionPolicy` | ✅ 管住进程内脚本（Groovy 默认禁用、JS 不支持、超时） |
| `HttpClientService` | ❌ **无白名单、无私网地址校验、无协议限制** |

**这意味着 SCRIPT 节点的 API 类型现在就能调任意 URL**，包括 `127.0.0.1`、`10.x`、`169.254.169.254`（云元数据端点）。

**结论**：SSRF 不是 B2 新引入的风险，而是**现存缺陷**。建议：
- 从 B2 剥离为**独立的安全修复项**，优先级提到 P0（现存漏洞比新功能优先）
- 修复点在 `HttpClientService`，一处收口即可同时保护 SCRIPT 节点与未来的触发节点

### 1.3 ✅ WF-04 判断正确（票签权重确为唯一缺口）

`CountersignServiceImpl` 实测：
- `signType` 四值**校验与实现都完整**：第 107 行显式校验 `ALL/ANY/PERCENT/SEQUENTIAL`，第 348-388 行有对应的 switch-case 分支
- `PERCENT` 有 `passPercent` 范围校验（1-100），默认值逻辑（ALL→100，其余→50）
- `SEQUENTIAL` 有 `assignee_order` / `current_index` 顺序推进
- 全仓无 `passWeight` / `voteWeight` 痕迹

**B2 的 WF-04 范围（只补权重）准确，工作量 S 成立。**

### 1.4 🟡 WF-08 状态机：实测 6 态而非"取值较粗"

`WfProcessStatus` 枚举实测 6 值：`RUNNING / COMPLETED / REJECTED / REVOKED / SUSPENDED / INVALIDATED`
`WfTaskStatus` 实测 6 值：`TODO / COMPLETED / REJECTED / REVOKED / SUSPENDED / DELEGATED`

**PRD 目标 14 态**。缺 8 态：`DRAFT` / `AUTO_PASSED` / `TERMINATED`（与 INVALIDATED 区分）/ `CANCELLED`（与 REVOKED 区分）/ `WITHDRAWN` / `TASK_BACK` / `RESTARTED` / `PENDING` / `FAILED`。

**注意**：现有 `REVOKED` 同时承载"发起人撤销"与"审批人撤回"两义（`recall` 与 `withdraw` 都可能落到它）。拆分时需梳理现有 8 个流转动作到新状态的映射，**这是 B2 的 §12-4 待确认项的实际答案**。

### 1.5 附带发现：`DeployEnums` 已有渠道枚举

`DeployEnums` 实测含 `EMAIL / SMS / WEBSOCKET / WECHAT` 通知渠道枚举（服务于 `wf_deploy_notification`）。**批次 A 的 A2 定义渠道类型时应与之对齐命名**，避免系统内两套渠道枚举。

---

## 2. 批次 C（表单）

### 2.1 🔴 C4 表单版本：字段**已存在**，缺的是版本行为

**PRD 原判断**（C4 §1.1）：
> "`wf_form_definition` **无任何版本字段**"

**实测 `wf_form_definition`（12 列）已有 4 个版本相关字段**：
```sql
version       INT  DEFAULT 1  COMMENT '版本号'
lock_version  INT  DEFAULT 1  COMMENT '乐观锁版本号'
version_lock  INT  DEFAULT 0  COMMENT '版本锁'
is_latest     TINYINT(1) DEFAULT 1 COMMENT '是否最新版本'
```

**但 `WfFormServiceImpl.saveFormDefinition()` 实测行为**：
```java
definition.setVersion(exist.getVersion() + 1);        // 版本号递增
definition.setVersionLock(exist.getVersionLock() + 1);
definition.setIsLatest(1);                            // 恒为 1
formDefinitionMapper.updateById(definition);           // ← 原地覆盖，不留历史行
```

**精确结论**：
- `version` 只是**递增计数器**，不产生历史版本行
- `is_latest` **恒为 1，从不用于筛选**（因为只有一行）
- 真正生效的乐观锁是 `versionLock`（第 97 行有并发冲突检测）
- **C4 的问题（历史实例渲染不出已删字段）成立**，但表述要从"无版本字段"改为"有字段但保存时原地覆盖，无历史行"
- **工作量下降**：不需加 `version`/`is_latest` 字段，只需加 `checksum` / `change_log` / `change_type` / `is_rollback` / `rollback_from_version` 5 列 + 改保存逻辑为 insert 新行

### 2.2 🟡 C1 服务端校验：已有 schema 校验，但校验对象不同

**实测 `JsonSchemaValidator.validateFormSchema()` 已存在**，在 `WfFormServiceImpl` 第 81 行被调用，会校验字段 ID 集合。

**但这是校验「表单定义」的合法性，不是校验「提交值」**。C1 的 FR-3（按 schema 校验提交数据）**仍然成立** —— 全仓无 `validateFormData` 类逻辑。

**建议**：C1 的服务端校验器可**扩展 `JsonSchemaValidator`** 而非新建，保持一处收口。

---

## 3. 批次 D（HR）

### 3.1 ⚠️🟠 D1 假期额度：**从不校验也从不扣减**（比 PRD 判断严重得多）

**PRD 原判断**（D1 §1.1）：
> "请假审批通过后**直接改 used_quota**。余额算错时无法逐笔还原"

**实测结论完全不同**：

| 检查项 | 结果 |
| --- | --- |
| `LeaveQuota` 引用文件 | 仅 6 个：Controller / Payload / Entity / VO / Mapper / `HrEssServiceImpl` |
| service 层扣减逻辑 | **不存在**（`usedQuota` / `availableQuota` 只出现在 DTO/VO/门户汇总里） |
| `HrBusinessException.insufficientQuota()` | 异常方法**已定义，但全仓无任何调用点** |
| `HrWorkflowCallbackServiceImpl`（请假审批回调） | **完全不碰额度** |

**这意味着**：
1. 请假申请时**不校验额度**（可以请超过额度的假）
2. 审批通过后**不扣减额度**（`used_quota` 永远是 HR 手工填的值）
3. `insufficientQuota` 异常是"设计了但没接线"的遗留

**影响**：
- D1 的问题描述要改：不是"就地改数无法追溯"，而是"**额度完全脱离业务流程,纯手工维护**"
- **工作量上升**：除建台账外，还要**从零建立"申请校验 → 审批扣减 → 驳回释放"的完整链路**（PRD 假设这条链路已存在只是实现方式不好）
- 这也解释了为什么 `duration` 是客户端传入的 —— **整条请假额度链路都没有服务端权威计算**

### 3.2 🔴 D3 薪资批量：**已支持批量生成**

**PRD 原判断**（D3 §1.1）：
> "**没有批次**：算 500 人的薪只能逐条"

**实测 `HrEssServiceImpl.generateSalarySlips(String periodMonth, Long employeeId)`**：
```java
if (employeeId != null) { compWrapper.eq("employee_id", employeeId); }  // 传 null 则全员
List<HrEmployeeComp> comps = employeeCompMapper.selectList(compWrapper);
for (HrEmployeeComp comp : comps) {
    if (existsSlip(tenantId, comp.getEmployeeId(), periodMonth)) { continue; }  // 幂等
    salarySlipMapper.insert(composeSlip(tenantId, comp, periodMonth));
    created++;
}
log.info("月度工资条生成完成，employees: {}, created: {}", comps.size(), created);
```

**已具备**：全员批量、幂等跳过、生成计数、按 `status='ACTIVE'` 筛选

**真实缺口**（D3 的价值仍成立，但要重新表述）：
| 缺什么 | 说明 |
| --- | --- |
| 批次实体 | 无 `hr_payroll_batch`，所以无法回滚、无法只重跑失败项、无状态跟踪 |
| 前置校验 | 无"考勤未齐不许算薪" |
| 错误清单 | 循环里失败会中断整批（无 per-employee 错误收集） |
| 异步 | 同步循环，500 人会超 HTTP 超时 |
| 两阶段提交 | 无 created → submitted 状态机 |

**工作量从 L 降到 M**：算薪逻辑（`composeSlip`）已在，只需包一层批次管理。

---

## 4. 批次 E（CRM）

### 4.1 ✅ 现状基线基本准确

| 检查项 | 结果 |
| --- | --- |
| `CrmHealthCalculator` | **真实逻辑**，含续约窗口计算、按 `crm_receivable_overdue_tier` 字典的逾期档位（缺失时回退 30/60/90 内置档）。健康度不是摆设 |
| `autoReleaseExpiredCustomers()` | 已实现（公海自动释放） |
| 商机阶段校验 | **无任何校验**（H3 的 CRM-09 判断准确） |
| 活动管理 | 确无（E1 判断准确） |
| SLA 模型 | 确无（E2 判断准确，只有 `due_time` 固定值 + 提醒任务） |

**E 批次的 PRD 无需修正。**

### 4.2 附带发现：字典驱动的档位配置是可复用模式

`CrmHealthCalculator` 用 `SysDictHelper` 加载 `crm_receivable_overdue_tier` 字典做档位，缺失时回退内置值。**这个模式值得在 E2（SLA 优先级分档）与 F2（供应商评分分档）复用**，比硬编码阈值好。

---

## 5. 批次 F（OA）

### 5.1 🟠 F1 资产：状态操作**已有**，但 PRD 的表字段判断成立

**实测 `AssetServiceImpl`（223 行）已有 7 个方法**：
```java
generateQrCode(assetId, outputStream)   // ← 资产二维码标签（F1 的 §FR-8.x 想做的）
borrowAsset(assetId, userId)            // 借用
returnAsset(assetId)                    // 归还
repairAsset(assetId, remark)            // 报修
scrapAsset(assetId, remark)             // 报废
getStatistics()                         // 统计
getAllCategories()                      // 分类列表（从现有数据 distinct）
```

**双向影响**：
- **工作量下降**：借用/归还/维修/报废的**状态流转已实现**，F1 不需从零做；二维码标签已有
- **工作量上升的部分不变**：这些是"改状态 + 记 `oa_asset_log`"，**无结构化记录表**（无维修单字段如停机时长/维修费用/是否资本化，无维保计划，无折旧计划）。F1 的 18 列 → 42 列判断成立

**F1 的 §3.1 需改为"扩展现有状态操作为结构化单据"，而非"新建维修/调拨能力"。**

### 5.2 ✅ OA-04/05 判断准确

| 检查项 | 结果 |
| --- | --- |
| 工时 | 全仓无 `timesheet` / `workHour`（确无） |
| 项目进度 | `OaProjectServiceImpl` 无 progress 计算逻辑（确为手填） |
| 项目任务树 | `oa_work_task` 有 `parentId` 父子与级联（`hasUnfinishedChildren` / `cascadeToParent`），但不挂项目 WBS |
| 合同风险扫描 | `OaRiskScanServiceImpl.scanContractRisks()` 已实现 |
| 折旧/维保 | 全仓无痕迹（确无） |

### 5.3 附带发现：`ProjectExecutionStateService` 值得核查

`service/impl/` 下有 `ProjectExecutionStateService.java`，F3 的技术设计前需确认它与项目进度/状态的关系，避免重复建设。

---

## 6. 批次 G（体验与集成）

### 6.1 🔴 G1 移动端：基建**已存在**，PRD 大幅低估

**PRD 原判断**（G1 §1.1）：
> "移动端组件**仅 3 个**"、需新建 6 个移动端专用组件含 `MobilePullRefresh`

**实测已存在的移动端基建**：

| 资产 | 说明 |
| --- | --- |
| `hooks/usePullToRefresh.ts` | **下拉刷新已实现**（PRD 想新建 `MobilePullRefresh`） |
| `hooks/useGestures.ts` | 手势处理 |
| `hooks/useKeyboardHeight.ts` | 移动端键盘高度（软键盘遮挡处理） |
| `utils/device.ts` | `isMobileDevice()`：UA + 屏宽 + 触摸 + iPad 伪装四重判断 |
| 响应式断点 | **已用 779 处**（`md:` 246 / `sm:` 209 / `lg:` 185 / `xl:` 139） |
| `useOffline.ts` | 离线状态 |

**影响**：
- **G1 的工作量从 L 降到 M**：6 个新组件里至少 2 个（下拉刷新、手势）已有 hook 支撑
- 响应式已铺开 779 处，说明**不是"大部分页面没适配"而是"适配程度不均"** —— G1 的 §3.1 场景清单需重新评估哪些真的缺

### 6.2 🟡 G1 与现状的一处**设计冲突**

**G1 的 FR-1.4 明确要求**：
> "判断依据以视口宽度为准，**不做 UA 嗅探**（PWA 与桌面浏览器窄窗口应表现一致）"

**但现有 `utils/device.ts` 的 `isMobileDevice()` 正是 UA 嗅探**（`/android|webos|iphone|.../i.test(userAgent)`），且已被 `router.tsx` 与 `ThemeContext.tsx` 使用。

**需决策**：
- 方案 A：新建 `useBreakpoint()`（视口宽度），**与现有 `isMobileDevice()` 并存**，各用于不同场景（布局用视口、功能降级用 UA）
- 方案 B：统一到视口宽度，改造 `router.tsx` 与 `ThemeContext.tsx` 的现有用法
- **建议 A**：UA 判断对"是否真实移动设备"（如是否启用定位打卡）仍有价值，视口判断用于布局。但需在 G1 里写清两者边界

### 6.3 🟡 G3 文件存储：枚举已有但只 2 值

**实测已存在**：
```
enums/FileStorageType.java        → 仅 LOCAL / OSS 两值
config/properties/AuthOssProperties.java
config/properties/FileStorageProperties.java
service/impl/SysFileServiceImpl.java  → 已有文件类别与扩展名白名单校验
```

**vs SYS-04 的 PRD 目标 5 值**（LOCAL / MINIO / S3 / OSS / COS）

**影响**：
- 多存储的**骨架已有**（枚举 + 配置类），工作量略降
- 但**无 `sys_file_config` 表**（配置在 properties），无签名 URL，无去重 —— SYS-04 的核心价值（配置化 + 签名 URL 修越权）成立
- `SysFileServiceImpl` 已有扩展名白名单，**G2 导入框架的文件类型校验可复用**

---

## 7. 批次 H（增强项）

按"按需挑选"定位，只做了关键项抽查：

| 条目 | 抽查结果 |
| --- | --- |
| H1 WF-11 草稿 | 全仓无草稿痕迹，判断准确 |
| H1 WF-09 代理 | `wf_task.proxy_user_id` 字段存在但无 agent 语义，判断准确 |
| H1 WF-10 包含网关 | `WfNodeConfig.branchStrategy` 仅 PARALLEL/EXCLUSIVE，判断准确 |
| H2 HR-09 加班 | 加班确混在 `hr_time_request`，判断准确 |
| H3 CRM-09 阶段 | 确无阶段校验（见 §4.1） |
| H4 OA-08 耗材 | 需在设计前核实 `oa_consumable` 是否有出入库逻辑（未查） |
| H5 INT-06 菜单搜索 | 前端已有 `useBackendMenus.ts`，菜单树数据现成，S 成本判断准确 |

---

## 8. 修正后的批次工作量对比

| 批次 | PRD 原估 | 摸排后 | 变化原因 |
| --- | --- | --- | --- |
| B1 | M+ | M+ | 无变化（§0 四处修正已在 PRD 内） |
| B2 | M | **S+** ↓ | 定时/触发节点已实现，只补动作分支与设计器 |
| **B 新增** | — | **S**（新） | `HttpClientService` SSRF 修复（现存缺陷，建议 P0） |
| C1 | L | L | 无变化（服务端校验可扩展现有 validator） |
| C2 | M | M | 无变化 |
| C3 | M | M | 无变化 |
| C4 | S | **XS** ↓ | 版本字段已有，只加 5 列 + 改保存逻辑 |
| D1 | L | **L+** ↑ | 额度链路完全不存在，需从零建校验+扣减+释放 |
| D2 | M+ | M+ | 无变化 |
| D3 | L | **M** ↓ | 批量生成已有，只需包批次管理层 |
| D4 | S | S | 无变化 |
| E1-E5 | 原估 | 原估 | **无变化**（E 批次判断最准） |
| F1 | L | **M+** ↓ | 状态操作与二维码已有 |
| F2-F5 | 原估 | 原估 | 无变化 |
| G1 | L | **M** ↓ | 移动端 hooks 与 779 处响应式已有 |
| G3 | M+M | **M+S** ↓ | 存储枚举与配置类已有 |
| G2/G4/G5 | 原估 | 原估 | 无变化 |
| H | 按需 | 按需 | 无变化 |

**净结论**：**5 个条目工作量下降，1 个上升（D1），新增 1 个安全修复项**。

---

## 9. 建议的处理

### 9.1 两处现存缺陷的处置决策（2026-08-31 已定）

#### ① SCRIPT 节点 SSRF —— **决定暂不修复**

| 项 | 内容 |
| --- | --- |
| 决策 | **暂不修复**（用户 2026-08-31 决定） |
| 依据的前提 | ① SCRIPT 节点的 `scriptType=API` 当前无人使用或使用者完全可信；② 流程设计器编辑权限只授予可信人员 |
| 风险敞口 | 有设计器编辑权限的人可通过 SCRIPT 节点 API 类型访问：云元数据端点（`169.254.169.254`，可取临时凭据）、内网未鉴权服务（Nacos 8848 / Redis 6379 / Prometheus 9090 / 各服务 actuator）、内网端口探测 |
| **前提失效需重新评估的信号** | ① 设计器权限扩大到非可信人员；② 开始实际使用 SCRIPT 的 API 类型；③ 部署到公有云（元数据端点风险升级为凭据泄露）；④ **B2 触发节点落地**（新增一条走同一 `HttpClientService` 的路径） |
| 修复方案（备查） | 白名单优先：配了白名单只放白名单内地址（含自己服务的私网地址）；白名单为空则回退"禁私网 + 仅 http/https"；无论哪种都禁 `169.254.x`；不跟随重定向。修复点单一（`HttpClientService`），成本 S |

> `ScriptExecutionPolicy` 已管住进程内脚本（Groovy 默认禁用、JavaScript 不支持、超时），说明当初考虑过脚本节点风险，只是 API 类型这条路没一起管住。**B2 触发节点落地时应一并处理。**

#### ② 假期额度不校验不扣减 —— **决定等 D1 一次做完**

| 项 | 内容 |
| --- | --- |
| 决策 | **不单独动，等 D1 一次性把台账 + 校验 + 扣减 + 释放建完**（用户 2026-08-31 决定） |
| 理由 | 避免先改快照再改台账的两次重构 |
| 现状影响 | D1 交付前额度数据持续不准（`used_quota` 纯手工维护，请假不受额度约束） |
| D1 交付时需处理 | 若届时已有真实使用数据，历史 `used_quota` 需人工校正或按台账重算基线 |

### 9.2 需回写 PRD 的 8 处

| PRD | 修正内容 |
| --- | --- |
| B2 | §3.1 定时/触发节点改为"扩展现有 Handler"；里程碑 M3/M4 重写；SSRF 剥离为独立项 |
| B2 | §1.4 状态机补充：现有 6 态清单 + `REVOKED` 一词两义需拆分 |
| C1 | FR-3 注明"扩展 `JsonSchemaValidator`"而非新建 |
| C4 | §1.1 改为"字段已有但保存原地覆盖"；数据模型只加 5 列 |
| D1 | §1.1 改为"额度完全脱离业务流程，纯手工维护"；范围加"建立校验+扣减+释放链路" |
| D3 | §1.1 改为"已有批量生成，缺批次管理"；工作量 L→M |
| F1 | §3.1 改为"扩展现有状态操作为结构化单据" |
| G1 | §1.1 补现有移动端 hooks 清单；§FR-1.4 与 `device.ts` 的 UA 嗅探冲突需决策 |
| G3 | §2 补 `FileStorageType` / 配置类现状 |

### 9.3 技术设计的建议顺序

摸排后各批次的依赖与风险已清晰，建议顺序：

```
1. B（含 SSRF 修复）  ← 工作量下降最多，且有现存缺陷要修
2. C                  ← 表单是后续业务单据的载体
3. D                  ← 最大模块，D1 工作量上升需仔细设计
4. E                  ← 判断最准，设计可快
5. F                  ← 需先核 ProjectExecutionStateService
6. G                  ← 需先决策 UA vs 视口
7. H                  ← 建议不做整批设计，按挑选结果单独做
```

## 10. 未完成的摸排项

诚实列出这次没查到的：

| # | 未查项 | 影响 |
| --- | --- | --- |
| 1 | `oa_consumable` 是否已有出入库逻辑 | H4 的 OA-08 设计前需补 |
| 2 | `ProjectExecutionStateService` 的职责 | F3 设计前需补 |
| 3 | `FormBuilder.tsx`(791 行) 的组件内部结构 | C1 设计前需补（拆分方案依赖它） |
| 4 | HR 22 个 Controller 的实际端点分布 | D 批次设计前建议补（463 端点是全项目最多） |
| 5 | `SysFileServiceImpl` 的完整上传下载链路 | G3 设计前需补（签名 URL 改造依赖它） |
| 6 | 前端 70 个公共组件的响应式覆盖程度 | G1 设计前需补（哪些已适配哪些没有） |

**这 6 项建议在对应批次的技术设计开始前补齐**，而不是现在全部查完 —— 因为技术设计时才知道要查什么精度。
