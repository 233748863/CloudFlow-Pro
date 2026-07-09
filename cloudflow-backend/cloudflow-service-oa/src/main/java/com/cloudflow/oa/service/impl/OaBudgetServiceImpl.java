package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaBudgetAdjustment;
import com.cloudflow.oa.domain.OaBudgetLedger;
import com.cloudflow.oa.domain.OaBudgetLine;
import com.cloudflow.oa.domain.OaBudgetPlan;
import com.cloudflow.oa.domain.OaBudgetSubject;
import com.cloudflow.oa.domain.dto.BusinessRuleDTO;
import com.cloudflow.oa.domain.dto.BusinessRuleHitRecordDTO;
import com.cloudflow.oa.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.event.BudgetAdjustmentSubmittedEvent;
import com.cloudflow.oa.event.BudgetPlanSubmittedEvent;
import com.cloudflow.oa.domain.vo.BudgetExecutionSummaryVO;
import com.cloudflow.oa.mapper.OaBudgetAdjustmentMapper;
import com.cloudflow.oa.mapper.OaBudgetLedgerMapper;
import com.cloudflow.oa.mapper.OaBudgetLineMapper;
import com.cloudflow.oa.mapper.OaBudgetPlanMapper;
import com.cloudflow.oa.mapper.OaBudgetSubjectMapper;
import com.cloudflow.oa.service.IOaBudgetService;
import com.cloudflow.oa.service.remote.RemoteBusinessRuleService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class OaBudgetServiceImpl extends ServiceImpl<OaBudgetPlanMapper, OaBudgetPlan> implements IOaBudgetService {

    private static final String RULE_WARN = "oa.budget.warn.threshold";
    private static final String RULE_ALERT = "oa.budget.alert.threshold";
    private static final String RULE_BLOCK = "oa.budget.block.threshold";

    private final OaBudgetSubjectMapper budgetSubjectMapper;
    private final OaBudgetAdjustmentMapper budgetAdjustmentMapper;
    private final OaBudgetLineMapper budgetLineMapper;
    private final OaBudgetLedgerMapper budgetLedgerMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final RemoteBusinessRuleService remoteBusinessRuleService;
    private final OaWorkflowFailureHelper workflowFailureHelper;
    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;

    @Override
    public PageResult<OaBudgetPlan> queryBudgetPage(OaBudgetPlan query, PageQuery pageQuery) {
        PageResult<OaBudgetPlan> result = PageResult.build(baseMapper.selectPageByDataScope(
                pageQuery.build(), query, DataScopeUtils.listScope("dept_id", "owner_id")));
        if (result.getRows() != null) {
            result.getRows().forEach(this::fillBudgetComputedFields);
        }
        return result;
    }

    @Override
    public PageResult<OaBudgetSubject> querySubjectPage(OaBudgetSubject query, PageQuery pageQuery) {
        LambdaQueryWrapper<OaBudgetSubject> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaBudgetSubject::getDeleted, "0").orderByAsc(OaBudgetSubject::getSortOrder);
        if (StringUtils.hasText(query.getSubjectName())) {
            wrapper.like(OaBudgetSubject::getSubjectName, query.getSubjectName());
        }
        Page<OaBudgetSubject> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        budgetSubjectMapper.selectPage(page, wrapper);
        return PageResult.build(page);
    }

    @Override
    public PageResult<OaBudgetAdjustment> queryAdjustmentPage(OaBudgetAdjustment query, PageQuery pageQuery) {
        return PageResult.build(budgetAdjustmentMapper.selectPageByDataScope(
                pageQuery.build(), query, DataScopeUtils.listScope("dept_id", "owner_id")));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createBudget(OaBudgetPlan budgetPlan) {
        validateBudget(budgetPlan);
        LocalDateTime now = LocalDateTime.now();
        budgetPlan.setTenantId(resolveTenantId());
        budgetPlan.setBudgetNo(StringUtils.hasText(budgetPlan.getBudgetNo()) ? budgetPlan.getBudgetNo()
                : "YS" + now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")));
        budgetPlan.setVersionNo(budgetPlan.getVersionNo() == null ? 1 : budgetPlan.getVersionNo());
        budgetPlan.setReservedAmount(BigDecimal.ZERO);
        budgetPlan.setActualAmount(BigDecimal.ZERO);
        budgetPlan.setAvailableAmount(defaultDecimal(budgetPlan.getTotalAmount()));
        budgetPlan.setStatus(StringUtils.hasText(budgetPlan.getStatus()) ? budgetPlan.getStatus() : "DRAFT");
        budgetPlan.setCreateBy(resolveUserName());
        budgetPlan.setCreateTime(now);
        budgetPlan.setUpdateBy(resolveUserName());
        budgetPlan.setUpdateTime(now);
        budgetPlan.setDeleted(0);
        boolean saved = save(budgetPlan);
        if (!saved) {
            return false;
        }
        replaceLines(budgetPlan, now);
        refreshBudgetComputedAmounts(budgetPlan.getBudgetId());
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新预算")
    public boolean updateBudget(OaBudgetPlan budgetPlan) {
        if (budgetPlan == null || budgetPlan.getBudgetId() == null) {
            throw new IllegalArgumentException("预算ID不能为空");
        }
        OaBudgetPlan persisted = requireBudget(budgetPlan.getBudgetId());
        if (!List.of("DRAFT", "REJECTED").contains(persisted.getStatus())) {
            throw new IllegalArgumentException("当前预算状态不允许编辑");
        }
        validateBudget(budgetPlan);
        budgetPlan.setTenantId(persisted.getTenantId());
        budgetPlan.setBudgetNo(StringUtils.hasText(budgetPlan.getBudgetNo()) ? budgetPlan.getBudgetNo() : persisted.getBudgetNo());
        budgetPlan.setInstanceId(persisted.getInstanceId());
        budgetPlan.setReservedAmount(persisted.getReservedAmount());
        budgetPlan.setActualAmount(persisted.getActualAmount());
        budgetPlan.setAvailableAmount(persisted.getAvailableAmount());
        budgetPlan.setVersionNo(persisted.getVersionNo());
        budgetPlan.setStatus(persisted.getStatus());
        budgetPlan.setDeleted(persisted.getDeleted());
        budgetPlan.setCreateBy(persisted.getCreateBy());
        budgetPlan.setCreateTime(persisted.getCreateTime());
        budgetPlan.setUpdateBy(resolveUserName());
        budgetPlan.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(budgetPlan);
        if (!updated) {
            return false;
        }
        replaceLines(budgetPlan, budgetPlan.getUpdateTime());
        refreshBudgetComputedAmounts(budgetPlan.getBudgetId());
        return true;
    }

    @Override
    public OaBudgetPlan getBudgetDetail(Long budgetId) {
        OaBudgetPlan budget = requireBudget(budgetId);
        budget.setLines(listLines(budgetId));
        fillBudgetComputedFields(budget);
        return budget;
    }

    @Override
    public boolean createSubject(OaBudgetSubject subject) {
        if (subject == null || !StringUtils.hasText(subject.getSubjectCode()) || !StringUtils.hasText(subject.getSubjectName())) {
            throw new IllegalArgumentException("预算科目编码和名称不能为空");
        }
        subject.setTenantId(resolveTenantId());
        subject.setEnabled(subject.getEnabled() == null ? 1 : subject.getEnabled());
        subject.setDeleted(0);
        subject.setCreateBy(resolveUserName());
        subject.setCreateTime(LocalDateTime.now());
        subject.setUpdateBy(resolveUserName());
        subject.setUpdateTime(LocalDateTime.now());
        return budgetSubjectMapper.insert(subject) > 0;
    }

    @Override
    @Audit(name = "更新预算科目")
    public boolean updateSubject(OaBudgetSubject subject) {
        if (subject == null || subject.getSubjectId() == null) {
            throw new IllegalArgumentException("预算科目ID不能为空");
        }
        subject.setUpdateBy(resolveUserName());
        subject.setUpdateTime(LocalDateTime.now());
        return budgetSubjectMapper.updateById(subject) > 0;
    }

    @Override
    public boolean createAdjustment(OaBudgetAdjustment adjustment) {
        if (adjustment == null || adjustment.getBudgetId() == null || adjustment.getChangeAmount() == null) {
            throw new IllegalArgumentException("预算调整信息不完整");
        }
        OaBudgetPlan budget = requireBudget(adjustment.getBudgetId());
        LocalDateTime now = LocalDateTime.now();
        adjustment.setTenantId(resolveTenantId());
        adjustment.setBudgetNo(StringUtils.hasText(adjustment.getBudgetNo()) ? adjustment.getBudgetNo() : budget.getBudgetNo());
        adjustment.setAdjustmentNo(StringUtils.hasText(adjustment.getAdjustmentNo()) ? adjustment.getAdjustmentNo()
                : "TZ" + now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")));
        adjustment.setStatus(StringUtils.hasText(adjustment.getStatus()) ? adjustment.getStatus() : "DRAFT");
        adjustment.setDeleted(0);
        adjustment.setCreateBy(resolveUserName());
        adjustment.setCreateTime(now);
        adjustment.setUpdateBy(resolveUserName());
        adjustment.setUpdateTime(now);
        return budgetAdjustmentMapper.insert(adjustment) > 0;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean submitBudget(Long budgetId) {
        OaBudgetPlan budget = requireBudget(budgetId);
        if (!List.of("DRAFT", "REJECTED").contains(budget.getStatus())) {
            throw new IllegalArgumentException("只有草稿或已驳回预算可以提交");
        }
        budget.setStatus("PENDING");
        budget.setUpdateBy(resolveUserName());
        budget.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(budget);
        if (updated) {
            BudgetPlanSubmittedEvent event = new BudgetPlanSubmittedEvent();
            event.setBudgetId(budgetId);
            event.setBudgetNo(budget.getBudgetNo());
            event.setSubmittedAt(LocalDateTime.now());
            publishBudgetPlanSubmittedEvent(budget, event);
        }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean submitAdjustment(Long adjustmentId) {
        OaBudgetAdjustment adjustment = budgetAdjustmentMapper.selectById(adjustmentId);
        if (adjustment == null || !Integer.valueOf(0).equals(adjustment.getDeleted())) {
            throw new IllegalArgumentException("预算调整不存在");
        }
        if (!List.of("DRAFT", "REJECTED").contains(adjustment.getStatus())) {
            throw new IllegalArgumentException("只有草稿或已驳回预算调整可以提交");
        }
        adjustment.setStatus("PENDING");
        adjustment.setUpdateBy(resolveUserName());
        adjustment.setUpdateTime(LocalDateTime.now());
        boolean updated = budgetAdjustmentMapper.updateById(adjustment) > 0;
        if (updated) {
            BudgetAdjustmentSubmittedEvent event = new BudgetAdjustmentSubmittedEvent();
            event.setAdjustmentId(adjustment.getAdjustmentId());
            event.setAdjustmentNo(adjustment.getAdjustmentNo());
            event.setSubmittedAt(LocalDateTime.now());
            publishBudgetAdjustmentSubmittedEvent(adjustment, event);
        }
        return updated;
    }

    @Override
    public PageResult<OaBudgetLedger> queryLedgerPage(OaBudgetLedger query, PageQuery pageQuery) {
        return PageResult.build(budgetLedgerMapper.selectPageByDataScope(
                pageQuery.build(), query, DataScopeUtils.listScope("dept_id", "owner_id")));
    }

    @Override
    public BudgetExecutionSummaryVO getExecutionSummary(Long budgetId, String subjectCode) {
        OaBudgetPlan budget = requireBudget(budgetId);
        BudgetExecutionSummaryVO summary = new BudgetExecutionSummaryVO();
        summary.setBudgetId(budget.getBudgetId());
        summary.setBudgetNo(budget.getBudgetNo());
        summary.setBudgetName(budget.getBudgetName());

        if (StringUtils.hasText(subjectCode)) {
            OaBudgetLine line = requireBudgetLine(budgetId, subjectCode);
            fillSummary(summary, line.getAmount(), line.getReservedAmount(), line.getActualAmount(), line.getAvailableAmount(),
                    defaultRatio(line.getWarningRatio(), resolveThresholdRule(RULE_WARN, new BigDecimal("0.80"))),
                    defaultRatio(line.getAlertRatio(), resolveThresholdRule(RULE_ALERT, new BigDecimal("0.90"))),
                    defaultRatio(line.getBlockRatio(), resolveThresholdRule(RULE_BLOCK, BigDecimal.ONE)));
            return summary;
        }

        fillBudgetComputedFields(budget);
        fillSummary(summary, budget.getTotalAmount(), budget.getReservedAmount(), budget.getActualAmount(), budget.getAvailableAmount(),
                resolveThresholdRule(RULE_WARN, new BigDecimal("0.80")),
                resolveThresholdRule(RULE_ALERT, new BigDecimal("0.90")),
                resolveThresholdRule(RULE_BLOCK, BigDecimal.ONE));
        return summary;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void reserveBudget(String businessType, Long businessId, String businessNo,
                              Long deptId, String deptName, Long projectId, String projectName,
                              String subjectCode, String subjectName, BigDecimal amount, String remark) {
        applyBudgetOperation("RESERVE", businessType, businessId, businessNo, deptId, deptName, projectId, projectName, subjectCode, subjectName, amount, remark);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public com.cloudflow.oa.service.BudgetReserveResult reserveBudgetWithFallback(
            String businessType, Long businessId, String businessNo,
            Long deptId, String deptName, Long projectId, String projectName,
            String subjectCode, String subjectName, BigDecimal amount, String remark) {
        try {
            applyBudgetOperation("RESERVE", businessType, businessId, businessNo, deptId, deptName,
                    projectId, projectName, subjectCode, subjectName, amount, remark);
            return com.cloudflow.oa.service.BudgetReserveResult.accepted();
        } catch (IllegalArgumentException e) {
            String msg = e.getMessage() == null ? "" : e.getMessage();
            if (msg.contains("预算") || msg.contains("拦截阈值") || msg.contains("额度不足")) {
                log.warn("预算预占受阻 businessType={} businessId={} amount={} reason={}",
                        businessType, businessId, amount, msg);
                return com.cloudflow.oa.service.BudgetReserveResult
                        .rejected(amount, null, msg);
            }
            throw e;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void releaseBudget(String businessType, Long businessId, String businessNo,
                              Long deptId, String deptName, Long projectId, String projectName,
                              String subjectCode, String subjectName, BigDecimal amount, String remark) {
        applyBudgetOperation("RELEASE", businessType, businessId, businessNo, deptId, deptName, projectId, projectName, subjectCode, subjectName, amount, remark);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void writeoffBudget(String businessType, Long businessId, String businessNo,
                               Long deptId, String deptName, Long projectId, String projectName,
                               String subjectCode, String subjectName, BigDecimal amount, String remark) {
        applyBudgetOperation("WRITEOFF", businessType, businessId, businessNo, deptId, deptName, projectId, projectName, subjectCode, subjectName, amount, remark);
    }

    private void validateBudget(OaBudgetPlan budgetPlan) {
        if (budgetPlan == null) {
            throw new IllegalArgumentException("预算不能为空");
        }
        if (!StringUtils.hasText(budgetPlan.getBudgetName())) {
            throw new IllegalArgumentException("预算名称不能为空");
        }
        if (!StringUtils.hasText(budgetPlan.getTargetType())) {
            throw new IllegalArgumentException("目标类型不能为空");
        }
        if (budgetPlan.getTargetId() == null) {
            throw new IllegalArgumentException("目标对象不能为空");
        }
        if (budgetPlan.getTotalAmount() == null) {
            throw new IllegalArgumentException("预算总额不能为空");
        }
        if (budgetPlan.getLines() == null || budgetPlan.getLines().isEmpty()) {
            throw new IllegalArgumentException("预算明细不能为空");
        }
        if (budgetPlan.getLines().stream().noneMatch(line -> defaultDecimal(line.getAmount()).compareTo(BigDecimal.ZERO) > 0)) {
            throw new IllegalArgumentException("预算明细金额必须大于0");
        }
    }

    private void replaceLines(OaBudgetPlan budgetPlan, LocalDateTime now) {
        LambdaQueryWrapper<OaBudgetLine> deleteWrapper = new LambdaQueryWrapper<>();
        deleteWrapper.eq(OaBudgetLine::getBudgetId, budgetPlan.getBudgetId());
        budgetLineMapper.delete(deleteWrapper);
        int sortOrder = 1;
        for (OaBudgetLine line : budgetPlan.getLines()) {
            if (!StringUtils.hasText(line.getSubjectCode()) || !StringUtils.hasText(line.getSubjectName())) {
                continue;
            }
            line.setLineId(null);
            line.setTenantId(budgetPlan.getTenantId());
            line.setBudgetId(budgetPlan.getBudgetId());
            line.setAmount(defaultDecimal(line.getAmount()));
            line.setReservedAmount(BigDecimal.ZERO);
            line.setActualAmount(BigDecimal.ZERO);
            line.setAvailableAmount(line.getAmount());
            line.setWarningRatio(defaultRatio(line.getWarningRatio(), resolveThresholdRule(RULE_WARN, new BigDecimal("0.80"))));
            line.setAlertRatio(defaultRatio(line.getAlertRatio(), resolveThresholdRule(RULE_ALERT, new BigDecimal("0.90"))));
            line.setBlockRatio(defaultRatio(line.getBlockRatio(), resolveThresholdRule(RULE_BLOCK, BigDecimal.ONE)));
            line.setSortOrder(line.getSortOrder() == null ? sortOrder++ : line.getSortOrder());
            if (line.getSubjectId() == null) {
                OaBudgetSubject subject = findSubjectByCode(line.getSubjectCode());
                line.setSubjectId(subject == null ? null : subject.getSubjectId());
            }
            budgetLineMapper.insert(line);
        }
    }

    private OaBudgetPlan requireBudget(Long budgetId) {
        OaBudgetPlan budget = baseMapper.selectByIdWithDataScope(
                budgetId, DataScopeUtils.listScope("dept_id", "owner_id"));
        if (budget == null || !Integer.valueOf(0).equals(budget.getDeleted())) {
            throw new IllegalArgumentException("预算不存在");
        }
        return budget;
    }

    private OaBudgetLine requireBudgetLine(Long budgetId, String subjectCode) {
        OaBudgetLine line = budgetLineMapper.selectPage(new Page<>(1, 1, false), new LambdaQueryWrapper<OaBudgetLine>()
                .eq(OaBudgetLine::getBudgetId, budgetId)
                .eq(OaBudgetLine::getSubjectCode, subjectCode))
                .getRecords().stream().findFirst().orElse(null);
        if (line == null) {
            throw new IllegalArgumentException("预算科目不存在: " + subjectCode);
        }
        return line;
    }

    private List<OaBudgetLine> listLines(Long budgetId) {
        return budgetLineMapper.selectList(new LambdaQueryWrapper<OaBudgetLine>()
                .eq(OaBudgetLine::getBudgetId, budgetId)
                .orderByAsc(OaBudgetLine::getSortOrder)
                .orderByAsc(OaBudgetLine::getLineId));
    }

    private void fillBudgetComputedFields(OaBudgetPlan budget) {
        if (budget == null) {
            return;
        }
        refreshBudgetComputedAmounts(budget.getBudgetId());
        OaBudgetPlan latest = getById(budget.getBudgetId());
        if (latest != null) {
            budget.setReservedAmount(defaultDecimal(latest.getReservedAmount()));
            budget.setActualAmount(defaultDecimal(latest.getActualAmount()));
            budget.setAvailableAmount(defaultDecimal(latest.getAvailableAmount()));
        }
        budget.setThresholdStatus(resolveBudgetThresholdStatus(budget));
    }

    private void refreshBudgetComputedAmounts(Long budgetId) {
        OaBudgetPlan budget = getById(budgetId);
        if (budget == null) {
            return;
        }
        List<OaBudgetLine> lines = listLines(budgetId);
        BigDecimal totalAmount = lines.stream().map(OaBudgetLine::getAmount).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal reservedAmount = lines.stream().map(OaBudgetLine::getReservedAmount).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal actualAmount = lines.stream().map(OaBudgetLine::getActualAmount).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal availableAmount = totalAmount.subtract(reservedAmount).subtract(actualAmount);
        LambdaUpdateWrapper<OaBudgetPlan> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaBudgetPlan::getBudgetId, budgetId)
                .set(OaBudgetPlan::getTotalAmount, totalAmount)
                .set(OaBudgetPlan::getReservedAmount, reservedAmount)
                .set(OaBudgetPlan::getActualAmount, actualAmount)
                .set(OaBudgetPlan::getAvailableAmount, availableAmount)
                .set(OaBudgetPlan::getUpdateBy, resolveUserName())
                .set(OaBudgetPlan::getUpdateTime, LocalDateTime.now());
        update(null, wrapper);
    }

    private void applyBudgetOperation(String operationType, String businessType, Long businessId, String businessNo,
                                      Long deptId, String deptName, Long projectId, String projectName,
                                      String subjectCode, String subjectName, BigDecimal amount, String remark) {
        BigDecimal normalizedAmount = defaultDecimal(amount);
        if (normalizedAmount.compareTo(BigDecimal.ZERO) <= 0 || !StringUtils.hasText(subjectCode)) {
            return;
        }
        List<BudgetTargetContext> targets = new ArrayList<>();
        if (deptId != null) {
            targets.add(new BudgetTargetContext("DEPT", deptId, deptName));
        }
        if (projectId != null) {
            targets.add(new BudgetTargetContext("PROJECT", projectId, projectName));
        }
        for (BudgetTargetContext target : targets) {
            applySingleTargetOperation(operationType, businessType, businessId, businessNo, target, subjectCode, subjectName, normalizedAmount, remark);
        }
    }

    private void applySingleTargetOperation(String operationType, String businessType, Long businessId, String businessNo,
                                            BudgetTargetContext target, String subjectCode, String subjectName,
                                            BigDecimal amount, String remark) {
        OaBudgetPlan budget = findEffectiveBudget(target.targetType, target.targetId);
        if (budget == null) {
            throw new IllegalArgumentException("未找到可用预算: " + target.targetType + " / " + target.targetName);
        }
        OaBudgetLine line = requireBudgetLine(budget.getBudgetId(), subjectCode);
        Long ledgerId = insertBudgetLedgerClaim(budget, line, target, operationType, businessType, businessId,
                businessNo, subjectCode, subjectName, amount, remark);
        if (ledgerId == null) {
            log.info("预算操作已存在，跳过重复处理: operationType={}, businessType={}, businessId={}, targetType={}, targetId={}, subjectCode={}",
                    operationType, businessType, businessId, target.targetType, target.targetId, subjectCode);
            return;
        }

        int updated = switch (operationType) {
            case "RESERVE" -> budgetLineMapper.reserveAmount(line.getLineId(), amount);
            case "RELEASE" -> budgetLineMapper.releaseAmount(line.getLineId(), amount);
            case "WRITEOFF" -> budgetLineMapper.writeoffAmount(line.getLineId(), amount);
            default -> throw new IllegalArgumentException("不支持的预算操作类型: " + operationType);
        };
        if (updated <= 0) {
            throw new IllegalArgumentException("预算额度不足或预算行已变更: " + subjectCode);
        }

        OaBudgetLine latest = budgetLineMapper.selectById(line.getLineId());
        if (latest == null) {
            throw new IllegalArgumentException("预算科目不存在: " + subjectCode);
        }
        if ("RESERVE".equals(operationType)) {
            BigDecimal total = defaultDecimal(latest.getAmount());
            BigDecimal executionRatio = total.compareTo(BigDecimal.ZERO) > 0
                    ? defaultDecimal(latest.getActualAmount()).add(defaultDecimal(latest.getReservedAmount()))
                    .divide(total, 4, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            evaluateThreshold(budget, latest, businessType, businessId, executionRatio,
                    defaultRatio(latest.getWarningRatio(), resolveThresholdRule(RULE_WARN, new BigDecimal("0.80"))),
                    defaultRatio(latest.getAlertRatio(), resolveThresholdRule(RULE_ALERT, new BigDecimal("0.90"))),
                    defaultRatio(latest.getBlockRatio(), resolveThresholdRule(RULE_BLOCK, BigDecimal.ONE)));
        }
        LambdaUpdateWrapper<OaBudgetLedger> ledgerWrapper = new LambdaUpdateWrapper<>();
        ledgerWrapper.eq(OaBudgetLedger::getLedgerId, ledgerId)
                .set(OaBudgetLedger::getAvailableAfter, latest.getAvailableAmount());
        budgetLedgerMapper.update(null, ledgerWrapper);

        refreshBudgetComputedAmounts(budget.getBudgetId());
    }

    private Long insertBudgetLedgerClaim(OaBudgetPlan budget,
                                         OaBudgetLine line,
                                         BudgetTargetContext target,
                                         String operationType,
                                         String businessType,
                                         Long businessId,
                                         String businessNo,
                                         String subjectCode,
                                         String subjectName,
                                         BigDecimal amount,
                                         String remark) {
        if (hasBudgetLedger(budget.getTenantId(), target, operationType, businessType, businessId, subjectCode)) {
            return null;
        }
        OaBudgetLedger ledger = new OaBudgetLedger();
        ledger.setTenantId(budget.getTenantId());
        ledger.setBudgetId(budget.getBudgetId());
        ledger.setLineId(line.getLineId());
        ledger.setTargetType(target.targetType);
        ledger.setTargetId(target.targetId);
        ledger.setBusinessType(businessType);
        ledger.setBusinessId(businessId);
        ledger.setBusinessNo(businessNo);
        ledger.setSubjectCode(subjectCode);
        ledger.setSubjectName(StringUtils.hasText(subjectName) ? subjectName : line.getSubjectName());
        ledger.setOperationType(operationType);
        ledger.setAmount(amount);
        ledger.setAvailableAfter(defaultDecimal(line.getAvailableAmount()));
        ledger.setStatus("VALID");
        ledger.setRemark(remark);
        ledger.setCreateBy(resolveUserName());
        ledger.setCreateTime(LocalDateTime.now());
        try {
            budgetLedgerMapper.insert(ledger);
            return ledger.getLedgerId();
        } catch (DuplicateKeyException ex) {
            if (hasBudgetLedger(budget.getTenantId(), target, operationType, businessType, businessId, subjectCode)) {
                return null;
            }
            throw ex;
        }
    }

    private boolean hasBudgetLedger(Long tenantId,
                                    BudgetTargetContext target,
                                    String operationType,
                                    String businessType,
                                    Long businessId,
                                    String subjectCode) {
        Long count = budgetLedgerMapper.selectCount(new LambdaQueryWrapper<OaBudgetLedger>()
                .eq(OaBudgetLedger::getTenantId, tenantId)
                .eq(OaBudgetLedger::getBusinessType, businessType)
                .eq(OaBudgetLedger::getBusinessId, businessId)
                .eq(OaBudgetLedger::getOperationType, operationType)
                .eq(OaBudgetLedger::getTargetType, target.targetType)
                .eq(OaBudgetLedger::getTargetId, target.targetId)
                .eq(OaBudgetLedger::getSubjectCode, subjectCode));
        return count != null && count > 0;
    }

    private void evaluateThreshold(OaBudgetPlan budget, OaBudgetLine line, String businessType, Long businessId,
                                   BigDecimal executionRatio, BigDecimal warnThreshold, BigDecimal alertThreshold, BigDecimal blockThreshold) {
        if (executionRatio.compareTo(blockThreshold) >= 0) {
            recordRuleHit(RULE_BLOCK, businessType, businessId, blockThreshold, executionRatio, "BLOCK");
            throw new IllegalArgumentException("预算额度不足，已达到拦截阈值");
        }
        if (executionRatio.compareTo(alertThreshold) >= 0) {
            recordRuleHit(RULE_ALERT, businessType, businessId, alertThreshold, executionRatio, "ALERT");
            log.warn("预算告警: budgetId={}, lineId={}, ratio={}", budget.getBudgetId(), line.getLineId(), executionRatio);
            return;
        }
        if (executionRatio.compareTo(warnThreshold) >= 0) {
            recordRuleHit(RULE_WARN, businessType, businessId, warnThreshold, executionRatio, "WARN");
            log.warn("预算预警: budgetId={}, lineId={}, ratio={}", budget.getBudgetId(), line.getLineId(), executionRatio);
        }
    }

    private OaBudgetPlan findEffectiveBudget(String targetType, Long targetId) {
        return page(new Page<>(1, 1, false), new LambdaQueryWrapper<OaBudgetPlan>()
                .eq(OaBudgetPlan::getDeleted, "0")
                .eq(OaBudgetPlan::getTargetType, targetType)
                .eq(OaBudgetPlan::getTargetId, targetId)
                .in(OaBudgetPlan::getStatus, "APPROVED", "ACTIVE")
                .orderByDesc(OaBudgetPlan::getVersionNo)
                .orderByDesc(OaBudgetPlan::getBudgetId))
                .getRecords().stream().findFirst().orElse(null);
    }

    private void fillSummary(BudgetExecutionSummaryVO summary, BigDecimal total, BigDecimal reserved, BigDecimal actual, BigDecimal available,
                             BigDecimal warn, BigDecimal alert, BigDecimal block) {
        summary.setTotalAmount(defaultDecimal(total));
        summary.setReservedAmount(defaultDecimal(reserved));
        summary.setActualAmount(defaultDecimal(actual));
        summary.setAvailableAmount(defaultDecimal(available));
        summary.setWarningThreshold(warn);
        summary.setAlertThreshold(alert);
        summary.setBlockThreshold(block);
        BigDecimal ratio = defaultDecimal(total).compareTo(BigDecimal.ZERO) > 0
                ? defaultDecimal(actual).add(defaultDecimal(reserved)).divide(defaultDecimal(total), 4, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        summary.setExecutionRatio(ratio);
        summary.setThresholdStatus(resolveThresholdStatus(ratio, warn, alert, block));
    }

    private String resolveThresholdStatus(BigDecimal ratio, BigDecimal warn, BigDecimal alert, BigDecimal block) {
        if (ratio.compareTo(block) >= 0) {
            return "BLOCK";
        }
        if (ratio.compareTo(alert) >= 0) {
            return "ALERT";
        }
        if (ratio.compareTo(warn) >= 0) {
            return "WARN";
        }
        return "NORMAL";
    }

    private String resolveBudgetThresholdStatus(OaBudgetPlan budget) {
        if (budget == null) {
            return "NORMAL";
        }
        BigDecimal warn = resolveThresholdRule(RULE_WARN, new BigDecimal("0.80"));
        BigDecimal alert = resolveThresholdRule(RULE_ALERT, new BigDecimal("0.90"));
        BigDecimal block = resolveThresholdRule(RULE_BLOCK, BigDecimal.ONE);
        BigDecimal total = defaultDecimal(budget.getTotalAmount());
        BigDecimal reserved = defaultDecimal(budget.getReservedAmount());
        BigDecimal actual = defaultDecimal(budget.getActualAmount());
        BigDecimal ratio = total.compareTo(BigDecimal.ZERO) > 0
                ? actual.add(reserved).divide(total, 4, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        return resolveThresholdStatus(ratio, warn, alert, block);
    }

    public void startBudgetWorkflow(OaBudgetPlan budget) {
        try {
            Long startUserId = resolveBudgetWorkflowStartUserId(budget);
            String startUserName = resolveBudgetWorkflowStartUserName(budget, null, startUserId);
            if (startUserId == null) {
                throw new IllegalArgumentException("预算审批发起人不能为空");
            }
            InternalWorkflowStartDTO dto = new InternalWorkflowStartDTO();
            dto.setTenantId(budget.getTenantId());
            dto.setProcessDefKey("budget_plan_approval");
            dto.setBusinessKey("BUDGET_PLAN:" + budget.getBudgetId());
            dto.setStartUserId(startUserId);
            dto.setStartUserName(startUserName);
            Map<String, Object> payload = new HashMap<>();
            payload.put("budgetId", budget.getBudgetId());
            payload.put("budgetNo", budget.getBudgetNo());
            payload.put("budgetName", budget.getBudgetName());
            payload.put("targetType", budget.getTargetType());
            payload.put("targetName", budget.getTargetName());
            payload.put("totalAmount", budget.getTotalAmount());
            WorkflowCallbackConstants.applyCallbackMetadata(payload, OaBusinessTypes.BUDGET_PLAN, budget.getBudgetId(), budget.getBudgetNo(),
                    "workflow:stream:approval-callback:oa");
            dto.setVariables(payload);
            R<?> result = remoteWorkflowService.startProcessInternal(dto);
            if (result != null && result.isSuccess() && result.getData() instanceof Map<?, ?> resultMap) {
                Object instanceId = resultMap.get("processInstanceId");
                if (instanceId == null) {
                    instanceId = resultMap.get("instanceId");
                }
                if (instanceId != null) {
                    LambdaUpdateWrapper<OaBudgetPlan> wrapper = new LambdaUpdateWrapper<>();
                    wrapper.eq(OaBudgetPlan::getBudgetId, budget.getBudgetId())
                            .and(w -> w.isNull(OaBudgetPlan::getInstanceId).or().eq(OaBudgetPlan::getInstanceId, ""))
                            .set(OaBudgetPlan::getInstanceId, String.valueOf(instanceId))
                            .set(OaBudgetPlan::getUpdateBy, "event-consumer")
                            .set(OaBudgetPlan::getUpdateTime, LocalDateTime.now());
                    update(null, wrapper);
                }
            }
        } catch (Exception e) {
            log.error("预算 {} 启动工作流失败", budget.getBudgetNo(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.BUDGET_PLAN, budget.getBudgetId(), budget.getBudgetNo(),
                    resolveUserName(), resolveBudgetWorkflowStartUserId(budget), e);
        }
    }

    public void startAdjustmentWorkflow(OaBudgetAdjustment adjustment) {
        try {
            OaBudgetPlan budget = adjustment.getBudgetId() == null ? null : getById(adjustment.getBudgetId());
            Long startUserId = resolveBudgetWorkflowStartUserId(budget);
            String startUserName = resolveBudgetWorkflowStartUserName(budget, adjustment.getCreateBy(), startUserId);
            if (startUserId == null) {
                throw new IllegalArgumentException("预算调整发起人不能为空");
            }
            InternalWorkflowStartDTO dto = new InternalWorkflowStartDTO();
            dto.setTenantId(adjustment.getTenantId());
            dto.setProcessDefKey("budget_adjustment_approval");
            dto.setBusinessKey("BUDGET_ADJUSTMENT:" + adjustment.getAdjustmentId());
            dto.setStartUserId(startUserId);
            dto.setStartUserName(startUserName);
            Map<String, Object> variables = new HashMap<>();
            variables.put("adjustmentId", adjustment.getAdjustmentId());
            variables.put("adjustmentNo", adjustment.getAdjustmentNo());
            variables.put("budgetId", adjustment.getBudgetId());
            variables.put("budgetNo", adjustment.getBudgetNo());
            variables.put("budgetName", budget == null ? null : budget.getBudgetName());
            variables.put("changeAmount", adjustment.getChangeAmount());
            variables.put("subjectCode", adjustment.getSubjectCode());
            variables.put("subjectName", adjustment.getSubjectName());
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.BUDGET_ADJUSTMENT,
                    adjustment.getAdjustmentId(),
                    adjustment.getAdjustmentNo(),
                    "workflow:stream:approval-callback:oa"
            );
            dto.setVariables(variables);
            R<?> result = remoteWorkflowService.startProcessInternal(dto);
            if (result != null && result.isSuccess() && result.getData() instanceof Map<?, ?> resultMap) {
                Object instanceId = resultMap.get("processInstanceId");
                if (instanceId == null) {
                    instanceId = resultMap.get("instanceId");
                }
                if (instanceId != null) {
                    LambdaUpdateWrapper<OaBudgetAdjustment> wrapper = new LambdaUpdateWrapper<>();
                    wrapper.eq(OaBudgetAdjustment::getAdjustmentId, adjustment.getAdjustmentId())
                            .and(w -> w.isNull(OaBudgetAdjustment::getInstanceId).or().eq(OaBudgetAdjustment::getInstanceId, ""))
                            .set(OaBudgetAdjustment::getInstanceId, String.valueOf(instanceId))
                            .set(OaBudgetAdjustment::getUpdateBy, "event-consumer")
                            .set(OaBudgetAdjustment::getUpdateTime, LocalDateTime.now());
                    budgetAdjustmentMapper.update(null, wrapper);
                }
            }
        } catch (Exception e) {
            log.error("预算调整 {} 启动工作流失败", adjustment.getAdjustmentNo(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.BUDGET_ADJUSTMENT, adjustment.getAdjustmentId(), adjustment.getAdjustmentNo(),
                    resolveUserName(), null, e);
        }
    }

    private Long resolveBudgetWorkflowStartUserId(OaBudgetPlan budget) {
        if (UserContext.getUserId() != null) {
            return UserContext.getUserId();
        }
        return budget == null ? null : budget.getOwnerId();
    }

    private String resolveBudgetWorkflowStartUserName(OaBudgetPlan budget, String fallbackName, Long startUserId) {
        if (StringUtils.hasText(UserContext.getUserName())) {
            return UserContext.getUserName();
        }
        if (budget != null && StringUtils.hasText(budget.getOwnerName())) {
            return budget.getOwnerName();
        }
        if (StringUtils.hasText(fallbackName)) {
            return fallbackName;
        }
        return startUserId == null ? "system" : String.valueOf(startUserId);
    }

    private OaBudgetSubject findSubjectByCode(String subjectCode) {
        return budgetSubjectMapper.selectPage(new Page<>(1, 1, false), new LambdaQueryWrapper<OaBudgetSubject>()
                .eq(OaBudgetSubject::getDeleted, "0")
                .eq(OaBudgetSubject::getSubjectCode, subjectCode))
                .getRecords().stream().findFirst().orElse(null);
    }

    private BigDecimal resolveThresholdRule(String ruleCode, BigDecimal fallback) {
        try {
            R<BusinessRuleDTO> result = remoteBusinessRuleService.getEffectiveRule(ruleCode);
            if (result != null && result.isSuccess() && result.getData() != null && result.getData().getThresholdValue() != null) {
                return result.getData().getThresholdValue();
            }
        } catch (Exception e) {
            log.warn("读取预算规则失败: {}", ruleCode, e);
        }
        return fallback;
    }

    private void recordRuleHit(String ruleCode, String businessType, Long businessId,
                               BigDecimal thresholdValue, BigDecimal actualValue, String effect) {
        try {
            BusinessRuleHitRecordDTO record = new BusinessRuleHitRecordDTO();
            record.setTenantId(resolveTenantId());
            record.setRuleCode(ruleCode);
            record.setBusinessType(businessType);
            record.setBusinessId(businessId);
            record.setThresholdValue(thresholdValue);
            record.setActualValue(actualValue);
            record.setEffect(effect);
            record.setHitResult(effect);
            remoteBusinessRuleService.recordHit(record);
        } catch (Exception e) {
            log.warn("写入预算规则命中记录失败: ruleCode={}, businessId={}", ruleCode, businessId, e);
        }
    }

    private Long resolveTenantId() {
        return UserContext.getTenantId() == null ? 100000L : UserContext.getTenantId();
    }

    private String resolveUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    public OaBudgetAdjustment getAdjustmentById(Long adjustmentId) {
        return budgetAdjustmentMapper.selectById(adjustmentId);
    }

    private void publishBudgetPlanSubmittedEvent(OaBudgetPlan budget, BudgetPlanSubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("BUDGET_PLAN_SUBMITTED")
                    .sourceModule("cloudflow-oa")
                    .sourceId(budget.getBudgetId())
                    .tenantId(budget.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            throw new IllegalArgumentException("预算提交流程事件发布失败");
        }
    }

    private void publishBudgetAdjustmentSubmittedEvent(OaBudgetAdjustment adjustment, BudgetAdjustmentSubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("BUDGET_ADJUSTMENT_SUBMITTED")
                    .sourceModule("cloudflow-oa")
                    .sourceId(adjustment.getAdjustmentId())
                    .tenantId(adjustment.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            throw new IllegalArgumentException("预算调整提交流程事件发布失败");
        }
    }

    private BigDecimal defaultDecimal(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private BigDecimal defaultRatio(BigDecimal value, BigDecimal fallback) {
        return value == null ? fallback : value;
    }

    private record BudgetTargetContext(String targetType, Long targetId, String targetName) {
    }
}
