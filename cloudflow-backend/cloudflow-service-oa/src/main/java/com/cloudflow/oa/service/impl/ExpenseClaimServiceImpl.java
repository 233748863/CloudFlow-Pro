package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BizExpenseItem;
import com.cloudflow.oa.domain.VehicleExpense;
import com.cloudflow.oa.domain.dto.BusinessRuleDTO;
import com.cloudflow.oa.domain.dto.BusinessRuleHitRecordDTO;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.domain.vo.OaExpenseExceedDetailVO;
import com.cloudflow.oa.domain.vo.OaExpenseExceedResultVO;
import com.cloudflow.oa.mapper.BizExpenseClaimMapper;
import com.cloudflow.oa.mapper.BizExpenseItemMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.VehicleExpenseMapper;
import com.cloudflow.oa.service.BudgetReserveResult;
import com.cloudflow.oa.service.IExpenseClaimService;
import com.cloudflow.oa.service.IOaBudgetService;
import com.cloudflow.oa.service.IOaExpenseStandardService;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.remote.RemoteBusinessRuleService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.oa.util.OaAttachmentUrlUtils;
import com.cloudflow.common.redis.lock.DistributedLock;
import com.cloudflow.common.statemachine.core.StateMachine;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.oa.enums.ExpenseClaimStatus;
import com.cloudflow.oa.enums.ExpenseClaimEvent;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.event.ExpenseClaimSubmittedEvent;
import com.cloudflow.oa.event.ExpenseClaimPaidEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 报销申请Service实现类
 */
@Slf4j
@Service
public class ExpenseClaimServiceImpl extends ServiceImpl<BizExpenseClaimMapper, BizExpenseClaim>
        implements IExpenseClaimService {

    @Autowired
    private BizExpenseItemMapper expenseItemMapper;

    @Autowired
    private OaIdentityReferenceMapper identities;
    
    @Autowired
    private VehicleExpenseMapper vehicleExpenseMapper;
    
    @Autowired
    private RemoteWorkflowService remoteWorkflowService;

    @Autowired
    private RemoteBusinessRuleService remoteBusinessRuleService;

    @Autowired
    private IOaTraceEventService oaTraceEventService;

    @Autowired
    private IOaBudgetService oaBudgetService;

    @Autowired
    private IOaExpenseStandardService oaExpenseStandardService;

    @Autowired
    private OaWorkflowFailureHelper workflowFailureHelper;

    @Autowired
    private StateMachineRegistry stateMachineRegistry;

    @Autowired
    private OutboxPublisher outboxPublisher;

    @Autowired
    private ObjectMapper objectMapper;

    @Override
    public Page<BizExpenseClaim> queryPage(Integer pageNum, Integer pageSize, String status, String category, Long userId) {
        return (Page<BizExpenseClaim>) baseMapper.selectPageByDataScope(
                new Page<>(pageNum, pageSize), status, category, userId, DataScopeUtils.listScope());
    }

    @Override
    public List<BizExpenseClaim> listForExport(String status, String category, Long userId) {
        return baseMapper.selectListByDataScope(status, category, userId, DataScopeUtils.listScope());
    }

    @Override
    public BizExpenseClaim getClaimWithItems(Long id) {
        if (id == null) {
            throw new IllegalArgumentException("报销申请ID不能为空");
        }
        BizExpenseClaim claim = baseMapper.selectClaimWithItems(id, DataScopeUtils.listScope());
        if (claim == null) {
            throw new IllegalArgumentException("报销申请不存在或无权访问");
        }
        return claim;
    }

    @Override
    public String generateClaimNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("BX%s%04d", today, nextSeq);
    }

    @Override
    @Audit(name = "创建报销申请", spel = "#claim")
    @Transactional(rollbackFor = Exception.class)
    public boolean createClaim(BizExpenseClaim claim) {
        normalizeClaimItems(claim);
        // 从当前登录用户上下文中填充用户信息
        claim.setUserId(UserContext.getUserId());
        claim.setUserName(UserContext.getUserName());
        claim.setDeptId(UserContext.getDeptId());
        claim.setDeptName(UserContext.getDeptName());
        claim.setTenantId(requireTenantId());
        LocalDateTime now = LocalDateTime.now();
        claim.setCreateBy(UserContext.getUserName());
        claim.setCreateTime(now);
        claim.setUpdateTime(now);
        // 生成报销单号
        claim.setClaimNo(generateClaimNo());
        claim.setStatus("DRAFT");
        
        // 保存报销申请
        boolean result = save(claim);
        
        // 保存报销明细
        if (result && claim.getItems() != null && !claim.getItems().isEmpty()) {
            for (BizExpenseItem item : claim.getItems()) {
                item.setClaimId(claim.getId());
                expenseItemMapper.insert(item);
            }
        }
        
        return result;
    }

    @Override
    @Audit(name = "更新报销申请", spel = "#claim", oldVal = "@expenseClaimServiceImpl.getById(#claim.id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean updateClaim(BizExpenseClaim claim) {
        normalizeClaimItems(claim);
        // M1-4: 所有权校验
        BizExpenseClaim existing = baseMapper.lockClaim(claim.getId(), requireTenantId());
        if (existing == null || !Integer.valueOf(0).equals(existing.getDeleted())) {
            throw new IllegalArgumentException("报销申请不存在");
        }
        getClaimWithItems(claim.getId());
        assertStatus(existing, Set.of("DRAFT", "REJECTED"), "当前状态不允许修改");
        claim.setTenantId(existing.getTenantId());
        claim.setUserId(existing.getUserId());
        claim.setUserName(existing.getUserName());
        claim.setDeptId(existing.getDeptId());
        claim.setDeptName(existing.getDeptName());
        claim.setClaimNo(existing.getClaimNo());
        claim.setStatus(existing.getStatus());
        claim.setDeleted(existing.getDeleted());
        claim.setCreateBy(existing.getCreateBy());
        claim.setCreateTime(existing.getCreateTime());
        claim.setUpdateBy(UserContext.getUserName());
        claim.setUpdateTime(LocalDateTime.now());
        // 更新报销申请
        boolean result = updateById(claim);
        
        // 删除旧的报销明细
        if (result) {
            LambdaQueryWrapper<BizExpenseItem> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(BizExpenseItem::getClaimId, claim.getId());
            expenseItemMapper.delete(wrapper);
            
            // 保存新的报销明细
            if (claim.getItems() != null && !claim.getItems().isEmpty()) {
                for (BizExpenseItem item : claim.getItems()) {
                    item.setClaimId(claim.getId());
                    expenseItemMapper.insert(item);
                }
            }
        }
        
        return result;
    }

    @Override
    @Audit(name = "删除报销申请", spel = "#ids", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteClaims(Long[] ids) {
        if (ids == null || ids.length == 0) {
            return false;
        }
        Long tenantId = requireTenantId();
        for (Long id : ids) {
            BizExpenseClaim existing = getClaimWithItems(id);
            assertStatus(existing, Set.of("DRAFT", "REJECTED", "CANCELLED"), "当前状态不允许删除");
            boolean updated = update(new LambdaUpdateWrapper<BizExpenseClaim>()
                    .eq(BizExpenseClaim::getId, id)
                    .eq(BizExpenseClaim::getTenantId, tenantId)
                    .eq(BizExpenseClaim::getDeleted, 0)
                    .set(BizExpenseClaim::getDeleted, 1)
                    .set(BizExpenseClaim::getUpdateBy, UserContext.getUserName())
                    .set(BizExpenseClaim::getUpdateTime, LocalDateTime.now()));
            if (!updated) {
                throw new IllegalStateException("报销申请删除失败: " + id);
            }
        }
        return true;
    }

    @Override
    @Audit(name = "提交报销申请", spel = "#id", oldVal = "@expenseClaimServiceImpl.getById(#id)")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    // 同一单据防重入；申请人数据库行锁覆盖不同单据的额度累计直至事务提交。
    @DistributedLock(key = "'expense:claim:' + #id + ':submit'")
    public boolean submitClaim(Long id) {
        BizExpenseClaim claim = baseMapper.lockClaim(id, requireTenantId());
        if (claim == null) {
            return false;
        }
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(claim, BizExpenseClaim::getUserId, "报销单");
        StateMachine<ExpenseClaimStatus, ExpenseClaimEvent> stateMachine = stateMachineRegistry.require("ExpenseClaim");
        ExpenseClaimStatus newStatus = stateMachine.fire(ExpenseClaimStatus.valueOf(claim.getStatus()), ExpenseClaimEvent.SUBMIT);
        OaRecordSupport.require(identities.userForUpdate(claim.getUserId(), claim.getTenantId()), "报销申请人不存在");
        claim.setItems(getClaimWithItems(id).getItems());
        validateSubmissionItems(claim);
        evaluateExpenseAmountRule(claim);
        // OA-P0-3 超标校验, 命中后落表用于流程 CONDITION 分支
        OaExpenseExceedResultVO exceedResult = evaluateExpenseStandard(claim);
        reserveBudget(claim);

        claim.setStatus(newStatus.name());
        
        boolean updated = updateById(claim);

        // M1-7: 发布事件到 Outbox
        if (updated) {
            ExpenseClaimSubmittedEvent event = new ExpenseClaimSubmittedEvent();
            event.setClaimId(claim.getId());
            event.setClaimNo(claim.getClaimNo());
            event.setUserId(claim.getUserId());
            event.setUserName(claim.getUserName());
            event.setTotalAmount(claim.getTotalAmount());
            event.setCategory(claim.getCategory());
            event.setDescription(claim.getDescription());
            event.setDeptName(claim.getDeptName());
            event.setExceededStandard(claim.getExceededStandard() != null && claim.getExceededStandard() == 1);
            event.setExceededAmount(exceedResult != null ? exceedResult.getTotalExceededAmount() : BigDecimal.ZERO);
            event.setBudgetExceeded(claim.getBudgetExceeded() != null && claim.getBudgetExceeded() == 1);
            event.setBudgetExceededAmount(claim.getBudgetExceededAmount() != null ? claim.getBudgetExceededAmount() : BigDecimal.ZERO);
            event.setSubmittedAt(LocalDateTime.now());

            try {
                BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                        .eventType("EXPENSE_CLAIM_SUBMITTED")
                        .sourceModule("cloudflow-oa")
                        .sourceId(claim.getId())
                        .tenantId(claim.getTenantId())
                        .payload(objectMapper.writeValueAsString(event))
                        .build();
                outboxPublisher.publish(envelope);
            } catch (Exception e) {
                throw new IllegalStateException("报销提交事件保存失败，本次提交已回滚", e);
            }
        }

        return updated;
    }

    @Override
    @Audit(name = "确认报销打款", spel = "#id", oldVal = "@expenseClaimServiceImpl.getById(#id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmPaid(Long id) {
        BizExpenseClaim claim = getById(id);
        if (claim == null || !Integer.valueOf(0).equals(claim.getDeleted())) {
            throw new IllegalArgumentException("报销申请不存在");
        }

        // M1-6: 使用状态机进行状态转换
        StateMachine<ExpenseClaimStatus, ExpenseClaimEvent> stateMachine = stateMachineRegistry.require("ExpenseClaim");
        ExpenseClaimStatus currentStatus = ExpenseClaimStatus.valueOf(claim.getStatus());
        ExpenseClaimStatus newStatus = stateMachine.fire(currentStatus, ExpenseClaimEvent.PAY);
        claim.setStatus(newStatus.name());

        claim.setUpdateBy(UserContext.getUserName());
        claim.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(claim);
        if (updated) {
            writeoffBudget(claim);

            // M1-7: 发布事件到 Outbox
            ExpenseClaimPaidEvent event = new ExpenseClaimPaidEvent();
            event.setClaimId(claim.getId());
            event.setClaimNo(claim.getClaimNo());
            event.setUserId(claim.getUserId());
            event.setUserName(claim.getUserName());
            event.setTotalAmount(claim.getTotalAmount());
            event.setPaidAt(LocalDateTime.now());

            try {
                BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                        .eventType("EXPENSE_CLAIM_PAID")
                        .sourceModule("cloudflow-oa")
                        .sourceId(claim.getId())
                        .payload(objectMapper.writeValueAsString(event))
                        .build();
                outboxPublisher.publish(envelope);
            } catch (Exception e) {
                log.warn("报销单打款事件发布失败, claimId=" + claim.getId() + ", error=" + e.getMessage());
            }
        }
        return updated;
    }

    @Override
    @Audit(name = "车辆费用转报销", spel = "#vehicleExpenseIds")
    @Transactional(rollbackFor = Exception.class)
    public boolean convertVehicleExpenseToClaim(List<Long> vehicleExpenseIds, Long userId) {
        if (vehicleExpenseIds == null || vehicleExpenseIds.isEmpty()) {
            return false;
        }
        
        // 1. 批量查询车辆费用记录
        List<VehicleExpense> vehicleExpenses = vehicleExpenseMapper.selectBatchIds(vehicleExpenseIds);
        if (vehicleExpenses.isEmpty()) {
            log.warn("未找到对应的车辆费用记录，IDs: {}", vehicleExpenseIds);
            return false;
        }

        Long existingConvertedCount = expenseItemMapper.selectCount(new LambdaQueryWrapper<BizExpenseItem>()
                .in(BizExpenseItem::getVehicleExpenseId, vehicleExpenseIds));
        if (existingConvertedCount != null && existingConvertedCount > 0) {
            throw new IllegalArgumentException("所选费用中存在已转报销记录");
        }
        
        // 2. 创建报销申请单
        BizExpenseClaim claim = new BizExpenseClaim();
        claim.setClaimNo(generateClaimNo());
        claim.setUserId(userId);
        claim.setUserName(UserContext.getUserName());
        claim.setDeptId(UserContext.getDeptId());
        claim.setDeptName(UserContext.getDeptName());
        claim.setTenantId(requireTenantId());
        claim.setCategory("TRANSPORT"); // 车辆费用归类为交通类
        claim.setStatus("DRAFT");
        claim.setDescription("车辆费用转报销（共" + vehicleExpenses.size() + "笔）");
        LocalDateTime now = LocalDateTime.now();
        claim.setCreateBy(UserContext.getUserName());
        claim.setCreateTime(now);
        claim.setUpdateBy(UserContext.getUserName());
        claim.setUpdateTime(now);
        
        // 3. 计算总金额
        BigDecimal totalAmount = vehicleExpenses.stream()
                .map(VehicleExpense::getAmount)
                .filter(amount -> amount != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        claim.setTotalAmount(totalAmount);
        
        boolean saved = save(claim);
        if (!saved) {
            return false;
        }
        
        // 4. 将每笔车辆费用转为报销明细
        for (VehicleExpense ve : vehicleExpenses) {
            BizExpenseItem item = new BizExpenseItem();
            item.setClaimId(claim.getId());
            item.setExpenseType(mapVehicleExpenseType(ve.getExpenseType()));
            item.setAmount(ve.getAmount());
            if (ve.getExpenseDate() != null) {
                item.setExpenseDate(ve.getExpenseDate());
            }
            item.setDescription(ve.getDescription());
            item.setReceiptUrl(
                    OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(ve.getReceiptUrl(), "报销明细凭证附件")
            );
            item.setVehicleExpenseId(ve.getExpenseId()); // 关联原始车辆费用ID
            expenseItemMapper.insert(item);
        }
        
        log.info("车辆费用转报销成功，报销单号: {}，费用笔数: {}，总金额: {}", 
                claim.getClaimNo(), vehicleExpenses.size(), totalAmount);
        return true;
    }
    
    /**
     * 将车辆费用类型映射为报销费用类型
     * 车辆费用类型：1油费 2过路费 3停车费 4维修保养 5保险 6其他
     * 报销费用类型：TRANSPORT交通
     */
    private String mapVehicleExpenseType(String vehicleExpenseType) {
        if (vehicleExpenseType == null) {
            return "OTHER";
        }
        switch (vehicleExpenseType) {
            case "1": return "TRANSPORT";  // 油费 → 交通
            case "2": return "TRANSPORT";  // 过路费 → 交通
            case "3": return "TRANSPORT";  // 停车费 → 交通
            case "4": return "OTHER";      // 维修保养 → 其他
            case "5": return "OTHER";      // 保险 → 其他
            default:  return "OTHER";
        }
    }

    @Override
    public List<DynamicMapVO> getMonthlyExpenseByDept(String month) {
        YearMonth targetMonth = YearMonth.parse(month);
        return listPaidClaimsForMonth(targetMonth).stream()
                .collect(Collectors.groupingBy(
                        claim -> StringUtils.hasText(claim.getDeptName()) ? claim.getDeptName() : "未分配部门",
                        Collectors.collectingAndThen(Collectors.toList(), rows -> {
                            BigDecimal total = rows.stream()
                                    .map(BizExpenseClaim::getTotalAmount)
                                    .filter(amount -> amount != null)
                                    .reduce(BigDecimal.ZERO, BigDecimal::add);
                            Map<String, Object> item = new HashMap<>();
                            item.put("dept_name", rows.get(0).getDeptName());
                            item.put("total_amount", total);
                            item.put("claim_count", rows.size());
                            return DynamicMapVO.from(item);
                        })))
                .values().stream().toList();
    }

    @Override
    public List<DynamicMapVO> getMonthlyExpenseByCategory(String month) {
        YearMonth targetMonth = YearMonth.parse(month);
        return listPaidClaimsForMonth(targetMonth).stream()
                .collect(Collectors.groupingBy(
                        claim -> StringUtils.hasText(claim.getCategory()) ? claim.getCategory() : "OTHER",
                        Collectors.collectingAndThen(Collectors.toList(), rows -> {
                            BigDecimal total = rows.stream()
                                    .map(BizExpenseClaim::getTotalAmount)
                                    .filter(amount -> amount != null)
                                    .reduce(BigDecimal.ZERO, BigDecimal::add);
                            Map<String, Object> item = new HashMap<>();
                            item.put("category", rows.get(0).getCategory());
                            item.put("total_amount", total);
                            item.put("claim_count", rows.size());
                            return DynamicMapVO.from(item);
                        })))
                .values().stream().toList();
    }
    
    private void normalizeClaimItems(BizExpenseClaim claim) {
        if (claim == null) {
            throw new IllegalArgumentException("报销申请不能为空");
        }
        if (claim.getItems() == null || claim.getItems().isEmpty()) {
            return;
        }
        for (BizExpenseItem item : claim.getItems()) {
            if (item.getCity() != null) {
                item.setCity(item.getCity().strip());
                if (item.getCity().length() > 60) throw new IllegalArgumentException("费用发生城市最多60个字符");
            }
            item.setReceiptUrl(
                    OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(item.getReceiptUrl(), "报销明细凭证附件")
            );
        }
    }

    private List<BizExpenseClaim> listPaidClaimsForMonth(YearMonth month) {
        return listForExport(null, null, null).stream()
                .filter(claim -> claim.getCreateTime() != null && YearMonth.from(claim.getCreateTime()).equals(month))
                .filter(claim -> Set.of("APPROVED", "PAID").contains(claim.getStatus()))
                .toList();
    }

    private Long requireTenantId() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            throw new IllegalArgumentException("tenantId不能为空");
        }
        return tenantId;
    }

    private void assertStatus(BizExpenseClaim claim, Set<String> allowedStatuses, String message) {
        if (claim == null || claim.getStatus() == null || !allowedStatuses.contains(claim.getStatus())) {
            throw new IllegalArgumentException(message);
        }
    }

    /**
     * OA-P0-3 超标校验, 返回 standard 服务结果, 同时把超标标记写入 claim 字段。
     */
    private OaExpenseExceedResultVO evaluateExpenseStandard(BizExpenseClaim claim) {
        OaExpenseExceedResultVO result = oaExpenseStandardService.validateExceed(claim);
        claim.setExceededStandard(result.isExceeded() ? 1 : 0);
        claim.setExceededAmount(result.getTotalExceededAmount());
        try {
            claim.setExceededDetail(objectMapper.writeValueAsString(result.getDetails()));
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
            throw new IllegalStateException("报销超标明细保存失败", failure);
        }
        return result;
    }

    private void validateSubmissionItems(BizExpenseClaim claim) {
        if (claim.getItems() == null || claim.getItems().isEmpty()) throw new IllegalArgumentException("请至少填写一条报销明细");
        BigDecimal total = BigDecimal.ZERO;
        for (BizExpenseItem item : claim.getItems()) {
            if (!StringUtils.hasText(item.getExpenseType()) || item.getExpenseDate() == null
                    || !StringUtils.hasText(item.getCity()) || item.getAmount() == null || item.getAmount().signum() <= 0) {
                throw new IllegalArgumentException("每条报销明细必须填写费用类型、发生日期、发生城市和正数金额");
            }
            total = total.add(item.getAmount());
        }
        claim.setTotalAmount(total);
    }

    private void evaluateExpenseAmountRule(BizExpenseClaim claim) {
        BusinessRuleDTO rule = getRule("oa.expense.amount.limit");
        if (rule == null || rule.getThresholdValue() == null || !Integer.valueOf(1).equals(rule.getEnabled())) {
            return;
        }
        BigDecimal totalAmount = claim.getTotalAmount() == null ? BigDecimal.ZERO : claim.getTotalAmount();
        if (totalAmount.compareTo(rule.getThresholdValue()) <= 0) {
            return;
        }
        String effect = StringUtils.hasText(rule.getEffect()) ? rule.getEffect().trim().toUpperCase() : "WARN";
        String message = "报销金额 " + totalAmount + " 超过规则阈值 " + rule.getThresholdValue();
        recordRuleHit(rule, "EXPENSE_CLAIM", claim.getId(), totalAmount, effect);
        if ("BLOCK".equals(effect)) {
            throw new IllegalArgumentException(message);
        }
        if ("WARN".equals(effect)) {
            oaTraceEventService.record(null, "EXPENSE_CLAIM", claim.getId(), "BUSINESS_RULE", null,
                    "RULE_WARN", "报销规则预警", message,
                    UserContext.getUserId(), UserContext.getUserName(), null);
            log.warn("报销申请触发规则预警，claimId={}, {}", claim.getId(), message);
        }
    }

    private void recordRuleHit(BusinessRuleDTO rule, String businessType, Long businessId, BigDecimal actualValue, String effect) {
        try {
            BusinessRuleHitRecordDTO record = new BusinessRuleHitRecordDTO();
            record.setTenantId(UserContext.getTenantId());
            record.setRuleCode(rule.getRuleCode());
            record.setBusinessType(businessType);
            record.setBusinessId(businessId);
            record.setThresholdValue(rule.getThresholdValue());
            record.setActualValue(actualValue);
            record.setEffect(effect);
            record.setHitResult(effect);
            remoteBusinessRuleService.recordHit(record);
        } catch (Exception e) {
            log.warn("写入业务规则命中记录失败，ruleCode={}, businessType={}, businessId={}",
                    rule == null ? null : rule.getRuleCode(), businessType, businessId, e);
        }
    }

    private BusinessRuleDTO getRule(String ruleCode) {
        try {
            R<BusinessRuleDTO> result = remoteBusinessRuleService.getEffectiveRule(ruleCode);
            if (result != null && result.isSuccess()) {
                return result.getData();
            }
        } catch (Exception e) {
            log.warn("读取业务规则失败，ruleCode={}", ruleCode, e);
        }
        return null;
    }

    private void reserveBudget(BizExpenseClaim claim) {
        if (claim == null || claim.getId() == null) {
            return;
        }
        // OA-P0-2 累计预算超额信息(用于流程变量 budgetExceeded / budgetExceededAmount)
        BigDecimal totalExceeded = BigDecimal.ZERO;
        boolean anyExceeded = false;

        List<BizExpenseItem> items = claim.getItems();
        if (items == null || items.isEmpty()) {
            BudgetReserveResult r = oaBudgetService.reserveBudgetWithFallback(
                    OaBusinessTypes.EXPENSE_CLAIM,
                    claim.getId(),
                    claim.getClaimNo(),
                    claim.getDeptId(),
                    claim.getDeptName(),
                    claim.getProjectId(),
                    claim.getProjectName(),
                    claim.getBudgetSubjectCode(),
                    claim.getBudgetSubjectName(),
                    claim.getTotalAmount(),
                    "报销提交占用预算"
            );
            if (r != null && !r.isAccepted()) {
                anyExceeded = true;
                if (r.getExceededAmount() != null) {
                    totalExceeded = totalExceeded.add(r.getExceededAmount());
                }
            }
        } else {
            for (BizExpenseItem item : items) {
                BudgetReserveResult r = oaBudgetService.reserveBudgetWithFallback(
                        OaBusinessTypes.EXPENSE_CLAIM,
                        claim.getId(),
                        claim.getClaimNo(),
                        claim.getDeptId(),
                        claim.getDeptName(),
                        claim.getProjectId(),
                        claim.getProjectName(),
                        StringUtils.hasText(item.getBudgetSubjectCode()) ? item.getBudgetSubjectCode() : claim.getBudgetSubjectCode(),
                        StringUtils.hasText(item.getBudgetSubjectName()) ? item.getBudgetSubjectName() : claim.getBudgetSubjectName(),
                        item.getAmount(),
                        "报销明细占用预算"
                );
                if (r != null && !r.isAccepted()) {
                    anyExceeded = true;
                    if (r.getExceededAmount() != null) {
                        totalExceeded = totalExceeded.add(r.getExceededAmount());
                    }
                }
            }
        }

        if (anyExceeded) {
            claim.setBudgetExceeded(1);
            claim.setBudgetExceededAmount(totalExceeded);
        } else {
            claim.setBudgetExceeded(0);
            claim.setBudgetExceededAmount(BigDecimal.ZERO);
        }
    }

    private void writeoffBudget(BizExpenseClaim claim) {
        if (claim == null || claim.getId() == null) {
            return;
        }
        BizExpenseClaim detail = getClaimWithItems(claim.getId());
        List<BizExpenseItem> items = detail == null ? null : detail.getItems();
        if (items == null || items.isEmpty()) {
            oaBudgetService.writeoffBudget(
                    OaBusinessTypes.EXPENSE_CLAIM,
                    claim.getId(),
                    claim.getClaimNo(),
                    claim.getDeptId(),
                    claim.getDeptName(),
                    claim.getProjectId(),
                    claim.getProjectName(),
                    claim.getBudgetSubjectCode(),
                    claim.getBudgetSubjectName(),
                    claim.getTotalAmount(),
                    "报销完成核销预算"
            );
            return;
        }
        for (BizExpenseItem item : items) {
            oaBudgetService.writeoffBudget(
                    OaBusinessTypes.EXPENSE_CLAIM,
                    claim.getId(),
                    claim.getClaimNo(),
                    claim.getDeptId(),
                    claim.getDeptName(),
                    claim.getProjectId(),
                    claim.getProjectName(),
                    StringUtils.hasText(item.getBudgetSubjectCode()) ? item.getBudgetSubjectCode() : claim.getBudgetSubjectCode(),
                    StringUtils.hasText(item.getBudgetSubjectName()) ? item.getBudgetSubjectName() : claim.getBudgetSubjectName(),
                    item.getAmount(),
                    "报销明细核销预算"
            );
        }
    }
}
