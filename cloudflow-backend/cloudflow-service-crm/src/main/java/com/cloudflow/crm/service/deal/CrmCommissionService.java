package com.cloudflow.crm.service.deal;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.event.commission.CommissionEvents;
import com.cloudflow.common.event.commission.CommissionEvents.Fact;
import com.cloudflow.common.event.commission.CommissionEvents.Progress;
import com.cloudflow.common.event.commission.CommissionEvents.Reference;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.crm.domain.CrmDealAllocation;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmCommissionMapper;
import com.cloudflow.crm.mapper.CrmCommissionMapper.Choice;
import com.cloudflow.crm.mapper.CrmCommissionMapper.Filters;
import com.cloudflow.crm.mapper.CrmCommissionMapper.PayrollBinding;
import com.cloudflow.crm.mapper.CrmCommissionMapper.Row;
import com.cloudflow.crm.mapper.CrmDealAllocationMapper;
import com.cloudflow.crm.mapper.CrmDealEventMapper;
import com.cloudflow.crm.service.impl.CrmAuditTrail;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.receivable.CrmReceivableAccessService;
import com.cloudflow.crm.service.remote.CrmCommissionPayrollClient;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class CrmCommissionService {
    private final CrmCommissionMapper sources;
    private final CrmDealAllocationMapper allocations;
    private final CrmDealEventMapper deals;
    private final CrmReceivableAccessService receivables;
    private final CrmCommissionOutbox notifications;
    private final CrmCommissionPayrollClient payroll;
    private final OutboxEventMapper outbox;
    private final CrmAuditTrail audit;
    private final PlatformTransactionManager transactions;
    private final ObjectMapper json;

    public record Confirmation(List<Long> allocationIds, BigDecimal commissionRate, String approvalBasis) { }
    public record Posting(List<Long> allocationIds, Long payrollPeriodId, Long salaryComponentId) { }
    public record PostResult(int sources, int synchronizedSources, boolean pending) { }
    public record Options(List<Choice> periods, List<Choice> components) { }

    public Page<Row> list(Filters filters, int pageNum, int pageSize) {
        StpUtil.checkPermission("crm:deal-allocation:list");
        if (filters == null || pageNum < 1 || pageSize < 1 || pageSize > 100
                || filters.startDate() != null && filters.endDate() != null && filters.startDate().isAfter(filters.endDate())
                || filters.currency() != null && !filters.currency().matches("[A-Z]{3}")
                || filters.eventType() != null && !Set.of("WON", "CONTRACT", "RECEIPT").contains(filters.eventType())
                || filters.bizType() != null && !Set.of("OPPORTUNITY", "CONTRACT", "RECEIVABLE").contains(filters.bizType())
                || filters.bizId() != null && filters.bizId() <= 0) throw invalid("业绩事实筛选条件无效");
        return sources.page(new Page<>(pageNum, pageSize), tenant(), filters, StpUtil.hasPermission("crm:commission:manage"),
                DataScopeUtils.listScope("scope_dept_id", "scope_owner_id"));
    }

    public Options options() {
        StpUtil.checkPermission("crm:commission:manage");
        return new Options(sources.periods(tenant()), sources.components(tenant()));
    }

    @Audit(name = "确认真实到账提成", highRisk = true)
    public void confirm(Confirmation request) {
        StpUtil.checkPermission("crm:commission:manage");
        if (request == null || request.commissionRate() == null || request.commissionRate().signum() < 0
                || request.commissionRate().compareTo(BigDecimal.ONE) > 0 || request.commissionRate().stripTrailingZeros().scale() > 4)
            throw invalid("提成率须在0至100%之间，最多保留万分之一");
        List<Long> identifiers = identifiers(request.allocationIds());
        String basis = CrmRecordSupport.text(request.approvalBasis(), 800, "核定依据");
        transaction(() -> {
            List<Fact> selected = lockSources(identifiers);
            if (selected.stream().anyMatch(source -> source.originalAllocationId() != null)) throw invalid("退款提成沿用原到账核定，不能另行修改提成率");
            for (Fact source : selected) {
                CrmDealAllocation allocation = allocations.selectById(source.allocationId());
                if (Set.of("APPROVED", "POSTED", "PAID").contains(allocation.getCommissionStatus())) {
                    JsonNode previous = tree(sources.approval(tenant(), allocation.getAllocationId()));
                    if (allocation.getCommissionRate().compareTo(request.commissionRate()) != 0 || !basis.equals(previous.path("approvalBasis").asText()))
                        throw invalid("原提成已经核定，提成率和依据不能重复改写");
                    continue;
                }
                if (!Set.of("UNCONFIRMED", "READY").contains(allocation.getCommissionStatus()) || allocation.getCompChangeId() != null)
                    throw invalid("该分配当前不能核定提成");
                allocation.setCommissionRate(request.commissionRate().setScale(4));
                allocation.setCommissionAmount(allocation.getAllocatedAmount().multiply(request.commissionRate()).setScale(2, RoundingMode.HALF_UP));
                allocation.setCommissionStatus("APPROVED"); save(allocation);
                Fact confirmed = sources.source(tenant(), allocation.getAllocationId());
                audit.record("核定到账提成", allocation.getAllocationId().toString(), encoded(Map.of(
                        "allocationId", allocation.getAllocationId(), "operatorId", UserContext.getUserId(), "approvalBasis", basis,
                        "commissionRate", allocation.getCommissionRate(), "factDigest", CommissionEvents.fingerprint(confirmed))), true);
            }
            for (Fact source : selected) confirmEarlierRefunds(source.allocationId(), source.eventId());
            return null;
        });
    }

    @Audit(name = "传送已核定提成到工资", highRisk = true)
    public PostResult post(Posting request) {
        StpUtil.checkPermission("crm:commission:manage");
        if (request == null || request.payrollPeriodId() == null || request.salaryComponentId() == null) throw invalid("请选择工资周期和变动薪资项目");
        List<Long> identifiers = identifiers(request.allocationIds());
        for (Long allocationId : identifiers) {
            Fact source = sources.source(tenant(), allocationId);
            if (source == null || !"RECEIVABLE".equals(source.bizType())) throw invalid("提成来源不存在或不可访问");
            receivables.read(source.bizId());
        }
        if (TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("提成工资校验不能持有CRM事务");
        R<Void> validation;
        try { validation = payroll.validateSelection(new CommissionEvents.Selection(identifiers, request.payrollPeriodId(), request.salaryComponentId())); }
        catch (RuntimeException unavailable) { throw invalid("工资服务暂不可用，本次尚未传送，请稍后重试"); }
        if (validation == null || !validation.isSuccess()) throw invalid(validation == null ? "工资服务未返回校验结果" : validation.getMsg());
        List<String> eventIds = transaction(() -> {
            lockSources(identifiers);
            List<String> queued = new ArrayList<>();
            for (Long allocationId : identifiers) queued.add(notifications.request(allocationId, request.payrollPeriodId(), request.salaryComponentId()));
            audit.record("传送核定提成", identifiers.get(0).toString(), encoded(Map.of("allocationIds", identifiers,
                    "payrollPeriodId", request.payrollPeriodId(), "salaryComponentId", request.salaryComponentId())), true);
            return List.copyOf(queued);
        });
        if (TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("跨服务提成传送必须在本地事务提交后执行");
        int synchronizedSources = 0;
        for (String eventId : eventIds) {
            try {
                R<Progress> response = payroll.synchronize(new Reference(eventId));
                if (response != null && response.isSuccess() && response.getData() != null) {
                    refresh(response.getData().eventId()); synchronizedSources++;
                }
            } catch (RuntimeException unavailable) {
                // The committed source remains available to the existing durable event dispatcher.
            }
        }
        return new PostResult(eventIds.size(), synchronizedSources, synchronizedSources != eventIds.size());
    }

    public void consume(BusinessEventEnvelope envelope) {
        if (envelope == null) throw invalid("提成工资回执不能为空");
        CommissionEvents.matchingEnvelope(stored(envelope.getEventId()), envelope, json);
        refresh(envelope.getEventId());
    }

    @Audit(name = "核对实际提成工资回执")
    public void refresh(String eventId) {
        Progress received = CommissionEvents.progress(stored(eventId), tenant(), json);
        transaction(() -> {
            Fact initial = sources.source(tenant(), received.allocationId());
            if (initial == null) throw invalid("提成回执分配不存在");
            receivables.lockInternal(initial.bizId());
            deals.lockById(initial.originalEventId() == null ? initial.eventId() : initial.originalEventId());
            allocations.lockByEvent(initial.eventId());
            Fact source = sources.source(tenant(), received.allocationId());
            PayrollBinding binding = sources.payroll(tenant(), received.compChangeId());
            if (binding == null || !CommissionEvents.SOURCE.equals(binding.sourceBizType())
                    || !source.allocationId().toString().equals(binding.sourceBizId()) || !source.employeeId().equals(binding.employeeId())
                    || !Integer.valueOf(0).equals(binding.deleted()) || binding.auditJson() == null
                    || source.compChangeId() != null && !source.compChangeId().equals(binding.compChangeId())) throw invalid("提成回执与真实工资变动来源不一致");
            Progress latest = progress(binding.auditJson());
            Progress persisted = CommissionEvents.progress(stored(latest.eventId()), tenant(), json);
            if (!latest.equals(persisted) || latest.revision() < received.revision() || !latest.allocationId().equals(source.allocationId())
                    || !latest.compChangeId().equals(binding.compChangeId()) || !Objects.equals(latest.payrollPeriodId(), binding.payrollPeriodId())
                    || !Objects.equals(latest.salaryComponentId(), binding.salaryComponentId())
                    || !("PENDING".equals(latest.state()) ? "DRAFT" : "APPROVED").equals(binding.status()))
                throw invalid("提成工资最新状态缺少真实持久依据");
            CommissionEvents.Request request = CommissionEvents.request(stored(latest.requestEventId()), tenant(), json);
            if (!request.allocationId().equals(source.allocationId()) || !request.factDigest().equals(CommissionEvents.fingerprint(source)))
                throw invalid("工资来源与原核定提成不一致");
            CrmDealAllocation allocation = allocations.selectById(source.allocationId());
            String status = "PAID".equals(latest.state()) ? "PAID" : "POSTED";
            if (!Objects.equals(allocation.getCompChangeId(), latest.compChangeId()) || !status.equals(allocation.getCommissionStatus())) {
                allocation.setCompChangeId(latest.compChangeId()); allocation.setCommissionStatus(status); save(allocation);
                audit.record("接收提成工资状态", allocation.getAllocationId().toString(), encoded(Map.of(
                        "compChangeId", latest.compChangeId(), "eventId", latest.eventId(), "state", latest.state())), false);
            }
            return null;
        });
    }

    private List<Fact> lockSources(List<Long> identifiers) {
        List<Fact> initial = identifiers.stream().map(allocationId -> sources.source(tenant(), allocationId)).toList();
        for (Fact source : initial) {
            if (source == null || !"RECEIPT".equals(source.eventType()) || !"RECEIVABLE".equals(source.bizType())
                    || !Integer.valueOf(0).equals(source.baselineFlag()) || source.employeeId() == null) throw invalid("仅真实到账分配可以核定或传送提成");
        }
        initial.stream().map(Fact::bizId).distinct().sorted().forEach(receivables::lockInScope);
        initial.stream().map(source -> source.originalEventId() == null ? source.eventId() : source.originalEventId()).distinct().sorted().forEach(deals::lockById);
        initial.stream().map(Fact::eventId).distinct().sorted().forEach(allocations::lockByEvent);
        return identifiers.stream().map(allocationId -> sources.source(tenant(), allocationId)).toList();
    }

    private void confirmEarlierRefunds(Long allocationId, Long eventId) {
        CrmDealAllocation original = allocations.selectById(allocationId);
        BigDecimal remainingAmount = original.getAllocatedAmount();
        BigDecimal remainingCommission = original.getCommissionAmount();
        List<CrmDealEvent> refunds = deals.lockReversals(eventId).stream().sorted(Comparator.comparing(CrmDealEvent::getEventId)).toList();
        for (CrmDealEvent refund : refunds) {
            for (CrmDealAllocation reversal : allocations.lockByEvent(refund.getEventId())) {
                if (!allocationId.equals(reversal.getReversalOfId())) continue;
                BigDecimal refunded = reversal.getAllocatedAmount().negate();
                if (refunded.signum() < 0 || refunded.compareTo(remainingAmount) > 0) throw invalid("原款退款分配超过可扣回余额");
                BigDecimal commission = refunded.compareTo(remainingAmount) == 0 ? remainingCommission
                        : original.getAllocatedAmount().signum() == 0 ? BigDecimal.ZERO
                        : refunded.multiply(original.getCommissionAmount()).divide(original.getAllocatedAmount(), 2, RoundingMode.HALF_UP).min(remainingCommission);
                if (Set.of("APPROVED", "POSTED", "PAID").contains(reversal.getCommissionStatus())) {
                    if (reversal.getCommissionAmount() == null || commission.negate().compareTo(reversal.getCommissionAmount()) != 0
                            || original.getCommissionRate().compareTo(reversal.getCommissionRate()) != 0) throw invalid("已核定退款提成与原款比例不一致");
                } else {
                    reversal.setCommissionRate(original.getCommissionRate()); reversal.setCommissionAmount(commission.negate());
                    reversal.setCommissionStatus("APPROVED"); save(reversal);
                }
                remainingAmount = remainingAmount.subtract(refunded); remainingCommission = remainingCommission.subtract(commission);
                notifications.recovery(reversal.getAllocationId());
            }
        }
    }

    private void save(CrmDealAllocation allocation) {
        allocation.setUpdateBy(CrmRecordSupport.userName()); allocation.setUpdateTime(LocalDateTime.now().withNano(0));
        CrmRecordSupport.saved(allocations.updateById(allocation));
    }
    private OutboxEvent stored(String eventId) {
        if (eventId == null || !eventId.matches("[0-9a-f-]{36}")) throw invalid("提成来源编号无效");
        return outbox.selectOne(new LambdaQueryWrapper<OutboxEvent>().eq(OutboxEvent::getTenantId, tenant()).eq(OutboxEvent::getEventId, eventId));
    }
    private JsonNode tree(String text) {
        try { if (text == null) throw invalid("提成核定依据缺失"); return json.readTree(text); }
        catch (JsonProcessingException failure) { throw invalid("提成核定依据无法读取"); }
    }
    private Progress progress(String text) {
        try { return json.readValue(text, Progress.class); }
        catch (JsonProcessingException failure) { throw invalid("提成工资依据无法读取"); }
    }
    private String encoded(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException failure) { throw invalid("提成业务依据保存失败"); }
    }
    private <T> T transaction(Supplier<T> action) {
        TransactionTemplate template = new TransactionTemplate(transactions);
        template.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        return template.execute(status -> action.get());
    }
    private List<Long> identifiers(List<Long> values) {
        if (values == null || values.isEmpty() || values.size() > 100 || values.stream().anyMatch(value -> value == null || value <= 0)
                || new HashSet<>(values).size() != values.size()) throw invalid("每次请选择1至100条不重复的分配事实");
        return values.stream().sorted().toList();
    }
    private static Long tenant() { return CrmRecordSupport.tenantId(); }
    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
