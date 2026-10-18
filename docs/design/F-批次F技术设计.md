# 批次 F 技术设计（OA 深度）

| 项 | 内容 |
| --- | --- |
| 覆盖 | F1（资产）· F2（供应商）· F3（工时+任务树）· F4（合同履约）· F5（询价比价） |
| 表改动 | **新增 25 张**，改 5 张 |
| 版本 | v1 · 2026-08-31 |

## 0. 设计前补查的两个未查项（又发现两处 PRD 偏差）

### 0.1 🔴 `ProjectExecutionStateService` **已实现项目进度自动计算**

**F3（OA-05）的 PRD 写**：
> "项目进度（`oa_project.progress`）靠手填"

**实测该 Service 已有完整进度计算**：
```java
public void syncProjectStatus(Long projectId, String updateBy)
private BigDecimal resolveProjectProgress(OaProject project,
                                          List<OaProjectMilestone> milestones,
                                          List<WorkTask> tasks, String targetStatus) {
    if ("COMPLETED".equals(targetStatus)) return BigDecimal.valueOf(100);
    if (!tasks.isEmpty() && !milestones.isEmpty()) {
        // 任务 + 里程碑的完成数比例
        return completionRate(completedTasks + completedMilestones, tasks.size() + milestones.size());
    }
    if (!tasks.isEmpty())      return completionRate(completedTasks, tasks.size());
    if (!milestones.isEmpty()) return completionRate(completedMilestones, milestones.size());
    return project.getProgress();      // 都没有才回退手填值
}
```

**结论**：`TASK_COMPLETION` 模式（按完成数）**已实现**，且已同时考虑 `oa_project_milestone` 与 `oa_work_task`。

**F3 的真实缺口收敛为 2 项**：
1. `TASK_PROGRESS` 模式（按 `task_weight` 加权，而非简单计数）
2. 进度来源从 `oa_work_task` 换到新的 `oa_project_task`（WBS 树）

**影响**：F3 的 OA-05 部分工作量下降；`percent_complete_mode` 的三种模式里**已有一种**。改造时应**扩展 `resolveProjectProgress` 而非重写**。

### 0.2 🔴 耗材出入库**已实现**（H4 的 OA-08 判断需修正）

**H4 的 PRD 写**：
> "`oa_consumable` 单表，库存数量应是就地增减。与 D1 假期余额同类问题 —— 数量错了无法追溯，无出入库流水"

**实测 `ConsumableServiceImpl` 已有**：
```java
public List<SysConsumable> getLowStockList()                          // 安全库存预警已有
public boolean addStock(Long consumableId, int quantity, String remark) {
    consumable.setQuantity(consumable.getQuantity() + quantity);      // 就地增减（判断正确）
    saveStockLog(consumableId, "入库", quantity, remark);             // ★ 但有日志
}
private void saveStockLog(Long consumableId, String type, Integer quantityChange, String remark) {
    SysAssetLog log = new SysAssetLog();
    log.setRefId(consumableId);
    log.setRefType("2");                    // ← 与资产共用 oa_asset_log，refType 区分
    log.setType(type);
    log.setQuantityChange(quantityChange);  // ← 已有数量变动字段
    assetLogMapper.insert(log);
}
```

**精确结论**：
- 库存数量确实是**就地增减**（H4 判断正确）
- 但**已有变动日志**（写 `oa_asset_log`，`refType="2"` 标识耗材，含 `quantity_change`）
- 缺的是：**结存快照**（日志无 `balance_after`，无法还原任意时点库存）、领用申请单、单价与成本

**H4 的 OA-08 工作量下降**：不需从零建日志，可**扩展现有 `oa_asset_log` 或迁移到专用台账表**（见 §6-2 决策）。

---

## 1. F1 资产（6 新表 + 1 改表）

### 1.1 定位调整（按摸排 §5.1）

`AssetServiceImpl` 已有 `borrowAsset` / `returnAsset` / `repairAsset` / `scrapAsset` / `generateQrCode`。本批是**把状态操作扩展为结构化单据**：

| 现有 | 改造后 |
| --- | --- |
| `repairAsset(id, remark)` 只改状态 + 记日志 | 保留，另建 `oa_asset_repair` 单据（含停机时长/费用/是否资本化/延长寿命） |
| `borrowAsset` / `returnAsset` | 保留，另建 `oa_asset_movement` 记录调拨（purpose 六种） |
| `generateQrCode` | 直接复用，无需改动 |
| `getAllCategories()`（distinct 现有数据） | 改为读 `oa_asset_category` 主数据 |

### 1.2 六张新表

```
oa_asset_category               分类主数据（含折旧默认值，树形 parent_id + level_path）
oa_asset_depreciation_schedule  折旧计划（asset_id/period_no/period_date/depreciation_amount/
                                accumulated_amount/net_value/status(PLANNED/POSTED/CANCELLED)/post_time）
oa_asset_maintenance_plan       维保计划（maintenance_type/frequency/next_due_date/responsible_id/reminder_days）
oa_asset_maintenance_task       维保任务（plan_id/planned_date/actual_date/result/cost/status）
oa_asset_repair                 维修单（failure_date/repair_status/downtime_hours/repair_cost/
                                capitalize_flag/life_extension_months/supplier_id/instance_id）
oa_asset_movement               调拨单（purpose(ISSUE/RETURN/TRANSFER/SCRAP/DISPOSE/LOST)/
                                from_custodian_id/to_custodian_id/from_location/to_location/instance_id）
```

`oa_asset` 增 24 列（分类/保管人/金额与折旧/保险/维保/状态扩展，见 F1 的 PRD §FR-2.1）

### 1.3 折旧三方法（AC-2，最易算错处）

```java
@Service
public class OaDepreciationService {

    /** 生成完整折旧计划 */
    public List<OaAssetDepreciationSchedule> generatePlan(OaAsset asset) {
        BigDecimal base = asset.getPurchaseAmount().subtract(nvl(asset.getSalvageValue()));
        int periods = computePeriods(asset);        // useful_life_months / frequency
        List<OaAssetDepreciationSchedule> plan = new ArrayList<>();
        BigDecimal accumulated = nvl(asset.getOpeningAccumulatedDepreciation());

        for (int i = 1; i <= periods; i++) {
            BigDecimal amount = switch (asset.getDepreciationMethod()) {
                case "STRAIGHT_LINE"    -> base.divide(BigDecimal.valueOf(periods), 2, HALF_UP);
                case "DOUBLE_DECLINING" -> doubleDeclining(asset, base, periods, i, accumulated);
                case "SUM_OF_YEARS"     -> sumOfYears(base, periods, i);
                default -> throw new OaBusinessException("UNKNOWN_DEPRECIATION_METHOD");
            };
            // ★ 末期补齐到残值（AC-3：各期之和 + 残值 = 购入金额）
            if (i == periods) {
                amount = asset.getPurchaseAmount()
                              .subtract(nvl(asset.getSalvageValue()))
                              .subtract(accumulated.subtract(nvl(asset.getOpeningAccumulatedDepreciation())));
            }
            accumulated = accumulated.add(amount);
            plan.add(build(asset, i, amount, accumulated));
        }
        return plan;
    }

    /** 双倍余额递减：最后两期改直线法 */
    private BigDecimal doubleDeclining(OaAsset a, BigDecimal base, int periods, int i, BigDecimal accumulated) {
        if (i > periods - 2) {
            BigDecimal remaining = base.subtract(accumulated.subtract(nvl(a.getOpeningAccumulatedDepreciation())));
            return remaining.divide(BigDecimal.valueOf(periods - i + 1), 2, HALF_UP);
        }
        BigDecimal netValue = a.getPurchaseAmount().subtract(accumulated);
        BigDecimal rate = BigDecimal.valueOf(2).divide(BigDecimal.valueOf(periods), 6, HALF_UP);
        return netValue.multiply(rate).setScale(2, HALF_UP);
    }

    /** 年数总和法 */
    private BigDecimal sumOfYears(BigDecimal base, int periods, int i) {
        int sumOfPeriods = periods * (periods + 1) / 2;
        int remaining = periods - i + 1;
        return base.multiply(BigDecimal.valueOf(remaining))
                   .divide(BigDecimal.valueOf(sumOfPeriods), 2, HALF_UP);
    }
}
```

**过账幂等**（AC-5）：`uk_asset_period(asset_id, period_no)` 唯一索引 + 过账前查 `status='PLANNED'`。

**资本化与寿命延长后重算**（AC-13/14）：**只重算未过账期次**，已过账的保持不变：
```java
public void recalcAfterRepair(Long assetId, BigDecimal capitalizedCost, Integer extensionMonths) {
    OaAsset asset = assetMapper.selectById(assetId);
    if (capitalizedCost != null) {
        asset.setPurchaseAmount(asset.getPurchaseAmount().add(capitalizedCost));
    }
    if (extensionMonths != null) {
        asset.setUsefulLifeMonths(asset.getUsefulLifeMonths() + extensionMonths);
    }
    // 保留已过账，只重生成未过账部分
    scheduleMapper.deleteUnposted(assetId);
    List<...> newPlan = generatePlanFromPeriod(asset, nextUnpostedPeriodNo(assetId));
    scheduleMapper.insertBatch(newPlan);
}
```

---

## 2. F2 供应商（4 新表 + 1 改表）

```
oa_supplier_category      分类（树形 parent_id + level_path）
oa_supplier_qualification 资质证件（qualification_type/cert_no/expire_date/long_term_flag/
                          file_url/verify_status/reminder_days）
oa_supplier_scorecard     周期评分（period_type/period_start/period_end/total_score/
                          standing/indicator_color/warn_flag/prevent_flag/calc_time）
oa_supplier_score_criteria 评分维度（scorecard_id/criteria_code/weight/score/max_score/data_source/auto_value）
```

`oa_supplier` 增 26 列（14 → 40，见 F2 的 PRD §FR-1.1）

### 2.1 AUTO 维度：交付及时率（F2 的 §10-2 只做这一个）

```java
/** 从 biz_purchase_receipt 推导：实际收货日 vs 期望日 */
private BigDecimal calcDeliveryOnTimeRate(Long supplierId, LocalDate from, LocalDate to) {
    List<DeliveryRecord> records = receiptMapper.selectBySupplierAndPeriod(supplierId, from, to);
    if (records.isEmpty()) return null;      // 无数据返回 null，评分时该维度跳过
    long onTime = records.stream()
            .filter(r -> !r.getActualDate().isAfter(r.getExpectedDate()))
            .count();
    return BigDecimal.valueOf(onTime)
            .divide(BigDecimal.valueOf(records.size()), 4, HALF_UP)
            .multiply(BigDecimal.valueOf(100));
}
```

**计算依据可追溯**（NFR）：`oa_supplier_score_criteria.auto_value` 存计算结果，`remark` 存"基于 N 笔收货记录"。

### 2.2 准入拦截（走规则中心，4 个规则码）

```java
public void assertSupplierAllowed(Long supplierId, String scene) {   // scene: PURCHASE|RFQ|CONTRACT
    OaSupplier s = supplierMapper.selectById(supplierId);

    if (Boolean.TRUE.equals(s.getBlacklistFlag())) {
        businessRuleService.evaluateBlock("oa.supplier.blacklist.block",
            "供应商在黑名单：" + s.getBlacklistReason());
    }
    if ("ELIMINATED".equals(s.getStanding())) {
        businessRuleService.evaluateBlock("oa.supplier.eliminated.block",
            "供应商评级为淘汰级");
    }
    if ("WATCH".equals(s.getStanding())) {
        businessRuleService.evaluateWarn("oa.supplier.standing.limit",
            "供应商评级为观察级，请谨慎选择");
    }
    List<String> expired = qualificationMapper.selectExpiredKeyTypes(supplierId);
    if (!expired.isEmpty()) {
        businessRuleService.evaluateBlock("oa.supplier.qualification.expired",
            "供应商关键资质已过期：" + String.join("、", expired));
    }
    if ("RFQ".equals(scene) && Boolean.TRUE.equals(s.getPreventRfqFlag())) {
        throw new OaBusinessException("SUPPLIER_RFQ_FORBIDDEN", "该供应商已禁止询价");
    }
}
```

**紧急采购例外通道**（F2 的 §10-4）：复用 E3 的 bypass 模式 —— `oa_supplier` 增 `bypass_flag` / `bypass_reason` / `bypass_by` / `bypass_expire_date`，放行仍记命中。

---

## 3. F3 工时与任务树（7 新表 + 1 改表）

### 3.1 七张表

```
oa_activity_type       活动类型（type_code/type_name/billable_default_flag）
oa_activity_cost       单价（activity_type_id/employee_id/job_level_id/costing_rate/billing_rate/
                       currency/effective_start/effective_end）  ← 员工级或职级级二选一
oa_timesheet           工时单（employee_id/start_date/end_date/total_hours/billable_hours/
                       costing_amount/billing_amount/status/instance_id）
oa_timesheet_detail    工时明细（timesheet_id/project_id/task_id/activity_type_id/work_date/
                       hours/billable_flag/costing_rate/costing_amount/billing_rate/billing_amount）
oa_project_task        项目任务树（parent_task_id/level_path/task_no/is_group_flag/is_milestone_flag/
                       task_weight/progress/planned_hours/actual_hours）
oa_project_template    项目模板
oa_project_template_task 模板任务（start_offset_days/duration_days，套模板时按开始日换算）
```

`oa_project` 增 10 列（成本与毛利，见 F3 的 PRD §FR-4.1）
`oa_project_dependency` 改挂 `oa_project_task`

### 3.2 扩展现有进度计算（按 §0.1 摸排结果）

**不重写 `ProjectExecutionStateService`，扩展它**：

```java
private BigDecimal resolveProjectProgress(OaProject project,
                                          List<OaProjectMilestone> milestones,
                                          List<WorkTask> workTasks,
                                          List<OaProjectTask> projectTasks,   // ← 新增参数
                                          String targetStatus) {
    if ("COMPLETED".equalsIgnoreCase(targetStatus)) return BigDecimal.valueOf(100);

    String mode = nvl(project.getPercentCompleteMode(), "TASK_COMPLETION");
    return switch (mode) {
        case "MANUAL" -> nvl(project.getProgress(), BigDecimal.ZERO);

        // ★ 新增：按 task_weight 加权
        case "TASK_PROGRESS" -> {
            if (projectTasks.isEmpty()) yield nvl(project.getProgress(), BigDecimal.ZERO);
            BigDecimal weightSum = projectTasks.stream()
                    .map(t -> nvl(t.getTaskWeight(), BigDecimal.ONE))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            if (weightSum.signum() == 0) yield BigDecimal.ZERO;
            BigDecimal weighted = projectTasks.stream()
                    .map(t -> nvl(t.getTaskWeight(), BigDecimal.ONE)
                              .multiply(nvl(t.getProgress(), BigDecimal.ZERO)))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            yield weighted.divide(weightSum, 2, HALF_UP);
        }

        // 现有逻辑保留，但数据源优先用 oa_project_task
        default -> {
            List<?> tasks = projectTasks.isEmpty() ? workTasks : projectTasks;
            yield existingCompletionRateLogic(tasks, milestones);   // ← 现有实现不动
        }
    };
}
```

### 3.3 任务树（`level_path` 物化路径）

```java
// 保存时维护路径
String levelPath = parent == null
        ? "/" + taskId + "/"
        : parent.getLevelPath() + taskId + "/";
// 层级校验（≤5 层）
if (StringUtils.countMatches(levelPath, "/") - 1 > 5) {
    throw new OaBusinessException("TASK_LEVEL_EXCEEDED", "任务层级不能超过 5 层");
}
// 查子树
wrapper.likeRight(OaProjectTask::getLevelPath, node.getLevelPath());
```

**分组任务进度由子任务汇总**（AC-13）：`is_group_flag=1` 时 `progress` 不可手工填，由子任务加权算。

### 3.4 循环依赖检测（AC-14）

```java
public void assertNoCycle(Long projectId, Long fromTaskId, Long toTaskId) {
    // DFS 从 toTaskId 出发，若能到达 fromTaskId 则成环
    Set<Long> visited = new HashSet<>();
    Deque<Long> stack = new ArrayDeque<>();
    stack.push(toTaskId);
    while (!stack.isEmpty()) {
        Long cur = stack.pop();
        if (cur.equals(fromTaskId)) {
            throw new OaBusinessException("TASK_DEPENDENCY_CYCLE", "存在循环依赖");
        }
        if (!visited.add(cur)) continue;
        dependencyMapper.selectSuccessors(projectId, cur).forEach(stack::push);
    }
}
```

### 3.5 单价锁定（AC-5）

工时提交时把当时单价**写进明细行**，之后改 `oa_activity_cost` 不影响历史：
```java
BigDecimal costingRate = activityCostService.resolveRate(
        detail.getActivityTypeId(), employeeId, jobLevelId, detail.getWorkDate(), "COSTING");
detail.setCostingRate(costingRate);                       // ← 落库锁定
detail.setCostingAmount(costingRate.multiply(detail.getHours()).setScale(2, HALF_UP));
```

**单价匹配优先级**：员工级 > 职级级 > 默认（`effective_start/end` 内）

### 3.6 ✅ `oa_project_milestone` 删表（已定决策 2026-08-31）

**决策：删表，里程碑收敛为 `oa_project_task.is_milestone_flag=1` 的任务。**
理由：两套里程碑数据必然不一致。

**因为 `ProjectExecutionStateService` 现在同时读 milestones 与 tasks（§0.1），删表需按以下顺序改造**：

```java
// 改造前（现状）
public void syncProjectStatus(Long projectId, String updateBy) {
    List<OaProjectMilestone> milestones = milestoneMapper.selectByProject(projectId);
    List<WorkTask> tasks = workTaskMapper.selectByProject(projectId);
    BigDecimal progress = resolveProjectProgress(project, milestones, tasks, targetStatus);
}

// 改造后
public void syncProjectStatus(Long projectId, String updateBy) {
    List<OaProjectTask> tasks = projectTaskMapper.selectByProject(projectId);
    // 里程碑不再是独立集合，而是 tasks 的子集
    List<OaProjectTask> milestones = tasks.stream()
            .filter(t -> Boolean.TRUE.equals(t.getIsMilestoneFlag())).toList();
    BigDecimal progress = resolveProjectProgress(project, milestones, tasks, targetStatus);
}
```

**⚠️ 保留里程碑的权重语义**：现有 `resolveProjectProgress` 在"任务与里程碑都有"时是 `(完成任务数 + 完成里程碑数) / (任务总数 + 里程碑总数)` —— 里程碑在分母里**独立计一次**。收敛后里程碑是任务的子集，若沿用原公式会**重复计数**（里程碑既算在 tasks 里又算在 milestones 里）。

**修正后的公式**：
```java
case "TASK_COMPLETION" -> {
    if (tasks.isEmpty()) yield nvl(project.getProgress(), ZERO);
    // ★ 里程碑作为任务子集，不再独立计入分母；改为给里程碑更高权重
    long completed = tasks.stream().filter(this::isTaskCompleted).count();
    yield completionRate(completed, tasks.size());
}
case "TASK_PROGRESS" -> {
    // 里程碑的 task_weight 默认设更高（如 3.0 vs 普通任务 1.0），
    // 在加权模式下自然体现其重要性，无需特殊处理
    ...
}
```

**迁移步骤**（项目未上线，可直接改）：
1. 建 `oa_project_task`
2. 现有 `oa_project_milestone` 数据转为 `is_milestone_flag=1` 的任务（`task_weight` 设 3.0）
3. 改 `ProjectExecutionStateService`（含上述公式修正）
4. 改 `oa_project_dependency` 的外键指向
5. 删 `oa_project_milestone` 表 + 相关 Entity/Mapper/Service/Controller
6. 前端 `ProjectManagementPage.tsx` 的里程碑视图改为按 `is_milestone_flag` 过滤任务

**对外汇报的里程碑视图**：用 `GET /oa/project/{id}/milestones` 返回 `is_milestone_flag=1` 的任务，接口路径与返回结构可保持兼容，前端无需大改。

---

## 4. F4 合同履约（2 新表 + 1 改表）

```
oa_contract_fulfilment_term   履约条款（term_no/term_category/term_content/requirement/
                              responsible_party/deadline_date/fulfilled_flag/evidence_file_url/
                              overdue_flag/waived_flag/waived_reason）
oa_contract_template_term     模板条款（deadline_offset_days）
```

`oa_contract` 增 18 列（履约状态 + 签署留痕，见 F4 的 PRD §FR-2.1/FR-3.1）

### 4.1 签署 IP 由服务端取（AC-9）

```java
@PostMapping("/{id}/sign")
public R<Void> sign(@PathVariable Long id, @RequestBody ContractSignDTO dto,
                    HttpServletRequest request) {
    OaContract c = contractMapper.selectById(id);
    c.setSignedFlag(1);
    c.setOurSigneeId(UserContext.getUserId());              // ← 服务端取，不信 dto
    c.setOurSigneeName(UserContext.getUserName());
    c.setOurSignTime(LocalDateTime.now());
    c.setOurSignIp(resolveClientIp(request));               // ← 服务端取
    c.setSignMethod(dto.getSignMethod());
    contractMapper.updateById(c);
    ...
}

/** 反向代理场景：读 X-Forwarded-For 首个可信值 */
private String resolveClientIp(HttpServletRequest req) {
    String xff = req.getHeader("X-Forwarded-For");
    if (StringUtils.hasText(xff)) {
        // 取第一个非 unknown 的值（网关追加在最左）
        return Arrays.stream(xff.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty() && !"unknown".equalsIgnoreCase(s))
                .findFirst().orElse(req.getRemoteAddr());
    }
    return req.getRemoteAddr();
}
```

**需确认网关是否透传 `X-Forwarded-For`**（F4 的 §9.2 风险项）。

### 4.2 履约状态五态推导（AC-4）

```java
public String deriveFulfilmentStatus(Long contractId) {
    OaContract c = contractMapper.selectById(contractId);
    if (!Boolean.TRUE.equals(c.getRequiresFulfilmentFlag())) return "NOT_STARTED";

    List<OaContractFulfilmentTerm> terms = termMapper.selectByContract(contractId);
    if (terms.isEmpty()) return "NOT_STARTED";

    long total     = terms.size();
    long fulfilled = terms.stream().filter(t -> isDone(t)).count();     // fulfilled_flag 或 waived_flag
    long overdue   = terms.stream().filter(t -> !isDone(t) && isOverdue(t)).count();

    if (fulfilled == total) return "FULFILLED";
    if (c.getFulfilmentDeadline() != null
        && LocalDate.now().isAfter(c.getFulfilmentDeadline()) && fulfilled < total) return "BREACHED";
    if (overdue > 0) return "PARTIALLY_BREACHED";
    return "ONGOING";
}
```

**条款到期用自然日**（F4 的 §10-2 已定），不用工作日历。

---

## 5. F5 询价比价（5 新表 + 1 改表）

```
oa_purchase_rfq           询价单（rfq_no/purchase_request_id/quote_deadline/status/
                          awarded_supplier_id/awarded_quotation_id/award_reason/instance_id）
oa_purchase_rfq_item      询价物料（item_name/spec/unit/quantity/expected_price/technical_requirement）
oa_purchase_rfq_supplier  被邀供应商（supplier_id/invite_time/invite_channel(EMAIL/PHONE/OFFLINE)/
                          respond_time/quote_status/decline_reason）
oa_supplier_quotation     供应商报价（rfq_id/supplier_id/quote_date/valid_until/total_amount/
                          delivery_days/warranty_months/entry_by/entry_time）
oa_supplier_quotation_item 报价明细（rfq_item_id/unit_price/discount_rate/tax_rate/line_amount/brand）
```

`biz_purchase_request` 增 `rfq_id`

### 5.1 报价保密（AC-16，最重要的安全要求）

```java
@GetMapping("/{rfqId}/comparison")
@SaCheckPermission("oa:rfq:comparison")
public R<RfqComparisonVO> comparison(@PathVariable Long rfqId) {
    OaPurchaseRfq rfq = rfqMapper.selectById(rfqId);

    // ★ 截止前不可见（无论谁）
    if (rfq.getQuoteDeadline() != null && LocalDate.now().isBefore(rfq.getQuoteDeadline())) {
        throw new OaBusinessException("RFQ_COMPARISON_LOCKED",
                "报价截止前不可查看比价（截止日：" + rfq.getQuoteDeadline() + "）");
    }
    // 仅采购负责人与审批人可见
    assertOwnerOrApprover(rfq);
    return R.ok(buildComparison(rfqId));
}
```

**报价录入接口同样限制**：录入人只能看自己录的那一家（`entry_by = 当前用户` 过滤），不能看其他家。

### 5.2 比价视图（含 F2 评分，AC-8）

```java
private RfqComparisonVO buildComparison(Long rfqId) {
    List<OaPurchaseRfqItem> items = itemMapper.selectByRfq(rfqId);
    List<OaSupplierQuotation> quotes = quotationMapper.selectByRfq(rfqId);

    // 按物料横向对比
    List<ItemComparisonVO> itemRows = items.stream().map(item -> {
        List<QuoteCellVO> cells = quotes.stream()
                .map(q -> toCell(q, item))
                .sorted(comparing(QuoteCellVO::getUnitPrice))
                .collect(toList());
        if (!cells.isEmpty()) cells.get(0).setIsLowest(true);      // 标最低单价
        return new ItemComparisonVO(item, cells);
    }).toList();

    // 供应商汇总（★ 带 F2 的评分与分档，避免只看价格）
    List<SupplierSummaryVO> suppliers = quotes.stream().map(q -> {
        OaSupplier s = supplierMapper.selectById(q.getSupplierId());
        return SupplierSummaryVO.builder()
                .supplierId(q.getSupplierId()).supplierName(q.getSupplierName())
                .totalAmount(q.getTotalAmount()).deliveryDays(q.getDeliveryDays())
                .standing(s.getStanding()).score(s.getScore())        // ← F2 数据
                .indicatorColor(s.getIndicatorColor())
                .build();
    }).sorted(comparing(SupplierSummaryVO::getTotalAmount)).toList();
    if (!suppliers.isEmpty()) suppliers.get(0).setIsLowestTotal(true);
    ...
}
```

### 5.3 非最低价定标（AC-11）

```java
public void award(Long rfqId, RfqAwardDTO dto) {
    OaSupplierQuotation winner = quotationMapper.selectById(dto.getQuotationId());
    OaSupplierQuotation lowest = quotationMapper.selectLowestByRfq(rfqId);

    if (!winner.getQuotationId().equals(lowest.getQuotationId())) {
        // 非最低价 → 理由必填且更严格（走规则中心 WARN）
        if (!StringUtils.hasText(dto.getAwardReason()) || dto.getAwardReason().length() < 20) {
            throw new OaBusinessException("AWARD_REASON_REQUIRED",
                    "非最低价定标需填写不少于 20 字的定标理由");
        }
        businessRuleService.evaluateWarn("oa.rfq.non-lowest.award",
                String.format("非最低价定标：中标 %s，最低 %s", winner.getTotalAmount(), lowest.getTotalAmount()));
    }
    ...
}
```

### 5.4 邮件邀请阻塞的降级（摸排决策）

```java
public void invite(Long rfqId, List<Long> supplierIds) {
    for (Long sid : supplierIds) {
        assertSupplierAllowed(sid, "RFQ");           // F2 准入校验

        OaSupplier s = supplierMapper.selectById(sid);
        String channel;
        if (StringUtils.hasText(s.getContactEmail()) && emailChannelAvailable()) {
            messageSender.send(...);                 // 邮件渠道就绪时用
            channel = "EMAIL";
        } else {
            channel = "OFFLINE";                     // ★ 批次 A 未做邮件 → 走线下
        }
        rfqSupplierMapper.insert(build(rfqId, sid, channel));
    }
    // 最少家数校验（走规则中心）
    businessRuleService.evaluateWarn("oa.rfq.min.suppliers", supplierIds.size(), 3);
}
```

---

## 6. 表数变化与实施顺序

| 脚本 | 改前 | 改后 | 变化 |
| --- | --- | --- | --- |
| `04.cloudflow-oa.sql` | 63 | **88** | +25（F1 六 + F2 四 + F3 七 + F4 二 + F5 五 + 关联一） |
| 全库 | 289（批次 E 后） | **314** | +25 |

### 实施顺序

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| M1 | F2 四表 + 供应商 26 列 + 资质到期提醒 | 批次 A |
| M2 | F2 评分卡 + AUTO 交付及时率 + **准入拦截** | M1 |
| M3 | F1 六表 + 资产 24 列 + 分类主数据（替换 `getAllCategories`） | 批次 A |
| M4 | F1 **折旧三方法 + 计划预览** | M3 |
| M5 | F1 折旧过账任务 + 幂等 + 资本化重算 | M4、批次 A SYS-02 |
| M6 | F1 维保计划与任务 + 维修单（扩展现有 `repairAsset`）+ 调拨单 | M4 |
| M7 | F3 任务树 + 循环依赖检测 + **扩展 `resolveProjectProgress`** | — |
| M8 | F3 活动类型与单价 + 工时填报 + 双轨计算 + 单价锁定 | M7 |
| M9 | F3 工时审批 + 汇总回写 + 项目模板 | M8 |
| M10 | F4 两表 + 履约条款 + 五态推导 + 签署留痕 | 批次 A |
| M11 | F5 五表 + 询价 + 报价录入 + **比价保密** | M2（供应商准入） |
| M12 | F5 定标 + 生成采购申请 + 线下邀请降级 | M11 |

---

## 7. 待确认

| # | 问题 | 建议 |
| --- | --- | --- |
**4 项已定案，1 项待运维确认**（见 `01-决策汇总.md` §6）：

| # | 问题 | ✅ 决策 |
| --- | --- | --- |
| 1 | `oa_project_milestone` 是否删表 | **删表**，收敛为 `oa_project_task.is_milestone_flag=1`。含进度公式重复计数修正与 6 步迁移，见 §3.6。`04` 脚本比原设计 −1 表 |
| 2 | 耗材台账方案 | **新建 `oa_consumable_ledger` 专用表**（含 `balance_after` 结存快照、`unit_price`、`amount`）。原 `oa_asset_log` 保留作通用变更历史。理由：往共用日志表加 `balance_after` 对资产无意义，且两种语义混在一表难维护 |
| 3 | 网关是否透传 `X-Forwarded-For` | ⛔ **待运维确认**。F4 的签署 IP 依赖它；若网关不透传则只能取 `remoteAddr`（在反代后是网关 IP，无取证价值） |
| 4 | 是否需要一物多账 | **不做**。我们不是 ERP 无总账体系，只需算折旧额不需过账到科目。需要时新增 `oa_asset_finance_book` 表即可，不影响现有设计 |
| 5 | 车辆是否纳入资产台账 | **不纳入**，保持独立 6 表。理由：车辆有违章、加油、年检等资产没有的维度，纳入是大改且收益有限。需统一台账视图时报表层 union `oa_asset` 与 `oa_vehicle` |

2026-10-16过期产物清理约定：本记录中的已完成历史轮次保留版本、检查范围、结果及未解决边界；过期服务包、独立环境、截图、输入快照及脚本副本按用户授权移除。当前运行和未完成验收依赖单独保护，历史失败不改写为通过；实际删除范围与空间结果见《开发测试过期文件清理-20261016.md》。
