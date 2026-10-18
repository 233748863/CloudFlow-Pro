package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.event.commission.CommissionEvents;
import com.cloudflow.common.event.commission.CommissionEvents.Fact;
import com.cloudflow.common.event.commission.CommissionEvents.Progress;
import com.cloudflow.common.event.commission.CommissionEvents.Request;
import com.cloudflow.common.event.commission.CommissionEvents.Selection;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.hr.domain.entity.HrCompChange;
import com.cloudflow.hr.domain.entity.HrCompComponent;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrPayrollPeriod;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrCommissionMapper;
import com.cloudflow.hr.mapper.HrCompChangeMapper;
import com.cloudflow.hr.mapper.HrCompComponentMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class HrCommissionService {
    private final HrCommissionMapper sources;
    private final HrCompChangeMapper changes;
    private final HrCompComponentMapper components;
    private final HrEmployeeAdvanceMapper employeeLocks;
    private final HrSalarySlipMapper salaries;
    private final OutboxEventMapper events;
    private final OutboxPublisher publisher;
    private final HrRuleSupport support;
    private final ObjectMapper json;

    @Audit(name = "按真实到账来源建立提成工资项")
    public Progress synchronize(String eventId) {
        Request request = request(eventId);
        Fact initial = source(request.allocationId());
        return support.transaction(() -> {
            HrPayrollPeriod period = "POST".equals(request.operation()) ? sources.lockPeriod(tenant(), request.payrollPeriodId()) : null;
            if (employeeLocks.lockEmployee(tenant(), initial.employeeId()) == null) throw invalid("提成员工档案不存在");
            Fact fact = source(request.allocationId());
            if (!initial.employeeId().equals(fact.employeeId()) || !request.factDigest().equals(CommissionEvents.fingerprint(fact)))
                throw invalid("提成传送与原冻结分配不一致");
            if ("RECOVERY".equals(request.operation()) && fact.originalAllocationId() == null) throw invalid("待处理扣回必须引用原款退款");
            HrCompChange change = change(fact.allocationId());
            if (change != null) {
                verifyChange(change, fact);
                Progress latest = latest(change);
                if ("RECOVERY".equals(request.operation())) return latest;
                if (change.getPayrollPeriodId() != null) {
                    if (!request.payrollPeriodId().equals(change.getPayrollPeriodId()) || !request.salaryComponentId().equals(change.getSalaryComponentId())
                            || !request.eventId().equals(latest.requestEventId())) throw invalid("提成已绑定其他工资周期或项目");
                    return latest;
                }
                if (!"PENDING".equals(latest.state()) || fact.originalAllocationId() == null) throw invalid("提成待处理状态与来源不一致");
            }
            if ("POST".equals(request.operation())) {
                if (period == null || !"OPEN".equals(period.getStatus()) || period.getEndDate().isBefore(fact.occurredTime().toLocalDate()))
                    throw invalid("提成须选择开放且不早于来源发生日期的工资周期");
                HrCompComponent component = components.selectById(request.salaryComponentId());
                if (component == null || !tenant().equals(component.getTenantId()) || !Integer.valueOf(1).equals(component.getStatus())
                        || !"VARIABLE".equals(component.getComponentType()) || !Integer.valueOf(1).equals(component.getTaxable()))
                    throw invalid("提成须使用启用且计税的变动薪资项目");
                requireUncalculated(fact.employeeId(), period);
                requireRelatedSources(fact, period.getPeriodId(), Set.of());
            }
            boolean created = change == null;
            if (created) {
                change = new HrCompChange();
                change.setTenantId(tenant()); change.setEmployeeId(fact.employeeId()); change.setChangeNo("CRMC" + fact.allocationId());
                change.setChangeType("BONUS"); change.setSourceBizType(CommissionEvents.SOURCE); change.setSourceBizId(fact.allocationId().toString());
                change.setBeforeTotal(BigDecimal.ZERO); change.setAfterTotal(fact.commissionAmount()); change.setChangeAmount(fact.commissionAmount());
                change.setEffectiveDate(fact.occurredTime().toLocalDate()); change.setStatus("DRAFT"); change.setDeleted(0); change.setVersion(0);
                change.setCreateBy(HrRuleSupport.userName()); change.setCreateTime(now());
            }
            if (period != null) {
                change.setPayrollPeriodId(period.getPeriodId()); change.setSalaryComponentId(request.salaryComponentId());
                change.setEffectiveDate(period.getEndDate()); change.setStatus("APPROVED");
            }
            change.setReason((fact.originalAllocationId() == null ? "已核定销售提成，分配编号：" : "原收款退款提成扣回，分配编号：") + fact.allocationId());
            change.setUpdateBy(HrRuleSupport.userName()); change.setUpdateTime(now());
            if ((created ? changes.insert(change) : changes.updateById(change)) != 1) throw invalid("提成工资项保存失败");
            return advance(change, request.eventId(), period == null ? "PENDING" : "POSTED", null, null, null);
        });
    }

    public void consume(BusinessEventEnvelope envelope) {
        if (envelope == null) throw invalid("提成传送消息不能为空");
        CommissionEvents.matchingEnvelope(stored(envelope.getEventId()), envelope, json);
        synchronize(envelope.getEventId());
    }

    public void validateSelection(Selection selection) {
        if (selection == null || selection.allocationIds() == null || selection.allocationIds().isEmpty() || selection.allocationIds().size() > 100
                || selection.allocationIds().stream().anyMatch(identifier -> identifier == null || identifier <= 0)
                || new HashSet<>(selection.allocationIds()).size() != selection.allocationIds().size()
                || selection.payrollPeriodId() == null || selection.salaryComponentId() == null) throw invalid("提成传送选择无效");
        support.transaction(() -> {
            HrPayrollPeriod period = sources.lockPeriod(tenant(), selection.payrollPeriodId());
            List<Fact> facts = selection.allocationIds().stream().map(this::source).toList();
            for (Long employeeId : facts.stream().map(Fact::employeeId).distinct().sorted().toList()) {
                if (employeeLocks.lockEmployee(tenant(), employeeId) == null) throw invalid("提成员工档案不存在");
            }
            for (Fact fact : facts) {
                requireRelatedSources(fact, selection.payrollPeriodId(), Set.copyOf(selection.allocationIds()));
                HrCompChange existing = change(fact.allocationId());
                if (existing != null && existing.getPayrollPeriodId() != null) {
                    verifyChange(existing, fact); latest(existing);
                    if (!selection.payrollPeriodId().equals(existing.getPayrollPeriodId()) || !selection.salaryComponentId().equals(existing.getSalaryComponentId()))
                        throw invalid("提成已绑定其他工资周期或项目");
                    continue;
                }
                if (period == null || !"OPEN".equals(period.getStatus()) || period.getEndDate().isBefore(fact.occurredTime().toLocalDate()))
                    throw invalid("提成须选择开放且不早于来源发生日期的工资周期");
                HrCompComponent component = components.selectById(selection.salaryComponentId());
                if (component == null || !tenant().equals(component.getTenantId()) || !Integer.valueOf(1).equals(component.getStatus())
                        || !"VARIABLE".equals(component.getComponentType()) || !Integer.valueOf(1).equals(component.getTaxable()))
                    throw invalid("提成须使用启用且计税的变动薪资项目");
                requireUncalculated(fact.employeeId(), period);
            }
            return null;
        });
    }

    public void requireReady(Long employeeId, Long periodId) {
        if (periodId == null) return;
        for (OutboxEvent stored : sources.requests(tenant(), employeeId)) {
            Request request = CommissionEvents.request(stored, tenant(), json);
            if (!"POST".equals(request.operation()) || !periodId.equals(request.payrollPeriodId())) continue;
            HrCompChange change = change(request.allocationId());
            if (change == null || !periodId.equals(change.getPayrollPeriodId()) || !"APPROVED".equals(change.getStatus()))
                throw invalid("本周期有已选定但尚未完成传送的提成，请先恢复传送");
        }
    }

    public void validatePayroll(HrCompChange change, Long employeeId, Long periodId) {
        Fact fact = source(identifier(change.getSourceBizId()));
        verifyChange(change, fact);
        Progress progress = latest(change);
        if (!employeeId.equals(change.getEmployeeId()) || !periodId.equals(change.getPayrollPeriodId())
                || !"APPROVED".equals(change.getStatus()) || !"POSTED".equals(progress.state()))
            throw invalid("提成尚未进入所选工资周期或已经实际发放");
        requireRelatedSources(fact, periodId, Set.of());
    }

    public Map<String, Object> payrollIdentity(HrCompChange change) {
        Progress progress = latest(change);
        return Map.of("sourceBizType", CommissionEvents.SOURCE, "allocationId", change.getSourceBizId(),
                "salaryComponentId", change.getSalaryComponentId().toString(), "commissionRequestEventId", progress.requestEventId(),
                "name", change.getChangeAmount().signum() < 0 ? "销售提成扣回" : "销售提成");
    }

    public void postSalary(HrSalarySlip slip) {
        requireTransaction();
        if (slip == null || !tenant().equals(slip.getTenantId()) || !"PAID".equals(slip.getStatus())) throw invalid("提成仅可依据实际发薪入账");
        List<SalaryEntry> entries = salaryEntries(slip);
        if (!entries.isEmpty() && slip.getNetTotal().signum() < 0) throw invalid("本期工资不足以扣回提成，请保留待处理并核对发薪安排");
        Set<Long> salaryAllocations = new HashSet<>();
        for (SalaryEntry entry : entries) salaryAllocations.add(entry.fact().allocationId());
        entries.sort(Comparator.comparing(entry -> entry.fact().originalAllocationId() != null));
        for (SalaryEntry entry : entries) {
            Progress progress = latest(entry.change());
            if ("PAID".equals(progress.state())) {
                if (!slip.getId().equals(progress.salarySlipId()) || !Objects.equals(slip.getReservedSettlementId(), progress.settlementId()))
                    throw invalid("同一提成已在其他工资单发放");
                continue;
            }
            if (!"POSTED".equals(progress.state())) throw invalid("提成工资项尚未核定");
            if (entry.fact().originalAllocationId() == null && !salaryAllocations.containsAll(sources.refunds(tenant(), entry.fact().allocationId())))
                throw invalid("原提成已有退款扣回未包含在本工资单，请先核对原款及全部退款");
            if (entry.fact().originalAllocationId() != null) {
                HrCompChange original = change(entry.fact().originalAllocationId());
                if (original == null) throw invalid("原提成尚未入薪，退款扣回继续待处理");
                verifyChange(original, source(entry.fact().originalAllocationId()));
                Progress originalPayment = latest(original);
                HrSalarySlip paid = originalPayment.salarySlipId() == null ? null : salaries.selectById(originalPayment.salarySlipId());
                if (!"PAID".equals(originalPayment.state()) || paid == null || !tenant().equals(paid.getTenantId())
                        || !slip.getEmployeeId().equals(paid.getEmployeeId()) || !"PAID".equals(paid.getStatus()))
                    throw invalid("原提成尚未实际发放，不能单独扣回");
            }
            advance(entry.change(), progress.requestEventId(), "PAID", slip.getId(), slip.getReservedSettlementId(), null);
        }
    }

    void reverseSettlementSalaryLocked(HrSalarySlip slip, Long settlementId, Long reversalId, boolean apply) {
        requireTransaction();
        if (slip == null || !tenant().equals(slip.getTenantId()) || !"PAID".equals(slip.getStatus())
                || settlementId == null || !settlementId.equals(slip.getReservedSettlementId())
                || reversalId == null || reversalId <= 0 || reversalId.equals(settlementId)) throw invalid("提成结算退回依据无效");
        for (SalaryEntry entry : salaryEntries(slip)) {
            Progress progress = latest(entry.change());
            if ("POSTED".equals(progress.state()) && reversalId.equals(progress.reversalSettlementId())
                    && settlementId.equals(progress.settlementId()) && slip.getId().equals(progress.salarySlipId())) continue;
            if (!"PAID".equals(progress.state()) || !slip.getId().equals(progress.salarySlipId()) || !settlementId.equals(progress.settlementId()))
                throw invalid("提成缺少本次结算的原发薪事实");
            if (entry.fact().originalAllocationId() == null) {
                for (HrCompChange refund : changes.selectList(new LambdaQueryWrapper<HrCompChange>().eq(HrCompChange::getTenantId, tenant())
                        .eq(HrCompChange::getEmployeeId, slip.getEmployeeId()).eq(HrCompChange::getSourceBizType, CommissionEvents.SOURCE)
                        .eq(HrCompChange::getDeleted, 0))) {
                    Fact refundSource = source(identifier(refund.getSourceBizId()));
                    if (!entry.fact().allocationId().equals(refundSource.originalAllocationId())) continue;
                    Progress recovered = latest(refund);
                    if ("PAID".equals(recovered.state()) && !slip.getId().equals(recovered.salarySlipId()))
                        throw invalid("原提成已有其他工资单实际扣回，请先核对对应退款结算");
                }
            }
            if (apply) advance(entry.change(), progress.requestEventId(), "POSTED", slip.getId(), settlementId, reversalId);
        }
    }

    public Set<Long> verifiedSalarySources(HrSalarySlip slip) {
        Set<Long> verified = new HashSet<>();
        for (SalaryEntry entry : salaryEntries(slip)) {
            Progress progress = latest(entry.change());
            if ("PAID".equals(slip.getStatus())) {
                if (!"PAID".equals(progress.state()) || !slip.getId().equals(progress.salarySlipId())) throw invalid("工资中的提成缺少本单实际发放依据");
            } else if (!"POSTED".equals(progress.state())) throw invalid("工资中的提成来源尚未核定或已在其他单据发放");
            verified.add(entry.change().getId());
        }
        return Set.copyOf(verified);
    }

    private List<SalaryEntry> salaryEntries(HrSalarySlip slip) {
        if (slip == null || !tenant().equals(slip.getTenantId())) throw invalid("提成工资来源不可访问");
        List<SalaryEntry> entries = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (Map<String, Object> item : slip.getComponents() == null ? List.<Map<String, Object>>of() : slip.getComponents()) {
            Long changeId = optionalIdentifier(item.get("changeId"));
            HrCompChange change = changeId == null ? null : changes.selectById(changeId);
            boolean declared = CommissionEvents.SOURCE.equals(item.get("sourceBizType"));
            if (change == null || !CommissionEvents.SOURCE.equals(change.getSourceBizType())) {
                if (declared) throw invalid("工资中的提成来源不存在");
                continue;
            }
            Fact fact = source(identifier(change.getSourceBizId()));
            verifyChange(change, fact);
            Progress progress = latest(change);
            Long periodId = optionalIdentifier(HrPayrollCalculationService.snapshot(slip).get("payrollPeriodId"));
            if (!seen.add(changeId) || !declared || !"COMPENSATION_CHANGE".equals(item.get("sourceType"))
                    || !"EARNING".equals(item.get("type")) || !fact.allocationId().equals(optionalIdentifier(item.get("allocationId")))
                    || !slip.getEmployeeId().equals(change.getEmployeeId()) || !Objects.equals(periodId, change.getPayrollPeriodId())
                    || !Objects.equals(change.getSalaryComponentId(), optionalIdentifier(item.get("salaryComponentId")))
                    || change.getVersion() == null || !change.getVersion().toString().equals(String.valueOf(item.get("changeVersion")))
                    || !change.getEffectiveDate().toString().equals(item.get("effectiveDate"))
                    || !progress.requestEventId().equals(item.get("commissionRequestEventId"))
                    || !"APPROVED".equals(change.getStatus()) || fact.commissionAmount().compareTo(decimal(item.get("amount"))) != 0)
                throw invalid("工资中的提成身份、金额、版本或指定周期不一致");
            entries.add(new SalaryEntry(change, fact));
        }
        return entries;
    }

    private Fact source(Long allocationId) {
        Fact fact = sources.source(tenant(), allocationId);
        try { CommissionEvents.validateFact(fact); }
        catch (IllegalArgumentException failure) { throw invalid(failure.getMessage()); }
        HrEmployee employee = support.employee(fact.employeeId());
        if (!fact.salesUserId().equals(employee.getUserId()) || !"CNY".equals(fact.currency())
                || !Set.of("APPROVED", "POSTED", "PAID").contains(fact.commissionStatus())
                    && !(fact.originalAllocationId() != null && "READY".equals(fact.commissionStatus()))) throw invalid("提成缺少已核定原币金额或真实员工映射");
        if (fact.originalAllocationId() != null) {
            Fact original = sources.source(tenant(), fact.originalAllocationId());
            try { CommissionEvents.validateFact(original); }
            catch (IllegalArgumentException failure) { throw invalid(failure.getMessage()); }
            if (original.originalAllocationId() != null || !fact.originalEventId().equals(original.eventId())
                    || !fact.employeeId().equals(original.employeeId()) || !fact.salesUserId().equals(original.salesUserId())
                    || !fact.deptId().equals(original.deptId()) || !fact.bizId().equals(original.bizId()) || !fact.currency().equals(original.currency())
                    || fact.commissionRate().compareTo(original.commissionRate()) != 0
                    || !Set.of("APPROVED", "POSTED", "PAID").contains(original.commissionStatus())) throw invalid("退款提成与原到账冻结来源不一致");
        }
        return fact;
    }

    private void verifyChange(HrCompChange change, Fact fact) {
        if (change == null || !tenant().equals(change.getTenantId()) || !Integer.valueOf(0).equals(change.getDeleted())
                || !CommissionEvents.SOURCE.equals(change.getSourceBizType()) || !fact.allocationId().toString().equals(change.getSourceBizId())
                || !fact.employeeId().equals(change.getEmployeeId()) || !"BONUS".equals(change.getChangeType())
                || change.getBeforeTotal() == null || change.getBeforeTotal().signum() != 0
                || change.getAfterTotal() == null || change.getChangeAmount() == null
                || fact.commissionAmount().compareTo(change.getAfterTotal()) != 0 || fact.commissionAmount().compareTo(change.getChangeAmount()) != 0
                || fact.compChangeId() != null && !fact.compChangeId().equals(change.getId())
                || !Set.of("DRAFT", "APPROVED").contains(change.getStatus())) throw invalid("提成工资变动与真实来源不一致");
    }

    private Progress latest(HrCompChange change) {
        Map<String, Object> detail = support.auditDetail(CommissionEvents.SOURCE, change.getId(), "COMMISSION_PROGRESS");
        if (detail.isEmpty()) throw invalid("提成工资项缺少原始传送或发薪依据");
        Progress progress;
        try { progress = json.convertValue(detail, Progress.class); }
        catch (IllegalArgumentException failure) { throw invalid("提成工资项原始状态无法读取"); }
        Progress persisted = CommissionEvents.progress(stored(progress.eventId()), tenant(), json);
        Request request = request(progress.requestEventId());
        if (!progress.equals(persisted) || !change.getId().equals(progress.compChangeId())
                || !change.getSourceBizId().equals(progress.allocationId().toString()) || !request.allocationId().equals(progress.allocationId())
                || !request.factDigest().equals(CommissionEvents.fingerprint(source(progress.allocationId())))
                || !Objects.equals(change.getPayrollPeriodId(), progress.payrollPeriodId())
                || !Objects.equals(change.getSalaryComponentId(), progress.salaryComponentId())
                || !("PENDING".equals(progress.state()) ? "DRAFT" : "APPROVED").equals(change.getStatus()))
            throw invalid("提成工资项与最新持久凭据不一致");
        return progress;
    }

    private Progress advance(HrCompChange change, String requestId, String state, Long salarySlipId, Long settlementId, Long reversalId) {
        Map<String, Object> detail = support.auditDetail(CommissionEvents.SOURCE, change.getId(), "COMMISSION_PROGRESS");
        Progress previous = detail.isEmpty() ? null : json.convertValue(detail, Progress.class);
        if (previous != null && (!previous.equals(CommissionEvents.progress(stored(previous.eventId()), tenant(), json))
                || !previous.compChangeId().equals(change.getId()) || previous.revision() == Long.MAX_VALUE)) throw invalid("提成工资状态链无法核验");
        Progress progress = new Progress(1, tenant(), identifier(change.getSourceBizId()), change.getId(), previous == null ? 1L : previous.revision() + 1,
                state, requestId, change.getPayrollPeriodId(), change.getSalaryComponentId(), salarySlipId, settlementId, reversalId,
                previous == null ? null : previous.eventId(), now());
        publisher.publishOnceAt(CommissionEvents.encode(progress, json), null);
        support.audit(CommissionEvents.SOURCE, change.getId(), "COMMISSION_PROGRESS", progress);
        return progress;
    }

    private void requireUncalculated(Long employeeId, HrPayrollPeriod period) {
        for (HrSalarySlip salary : salaries.selectList(new LambdaQueryWrapper<HrSalarySlip>().eq(HrSalarySlip::getTenantId, tenant())
                .eq(HrSalarySlip::getEmployeeId, employeeId).eq(HrSalarySlip::getDeleted, 0).ne(HrSalarySlip::getStatus, "CANCELLED"))) {
            if (salary.getComponents() == null) continue;
            for (Map<String, Object> component : salary.getComponents()) {
                if ("TAX_SNAPSHOT".equals(component.get("type")) && period.getPeriodId().equals(optionalIdentifier(component.get("payrollPeriodId"))))
                    throw invalid("所选周期已生成该员工工资，请先通过工资业务入口撤销草稿或选择其他开放周期");
            }
        }
    }

    private void requireRelatedSources(Fact fact, Long periodId, Set<Long> selected) {
        if (fact.originalAllocationId() != null) {
            Fact original = source(fact.originalAllocationId());
            if (!actuallyPaid(original) && !assignedTogether(original, periodId, selected))
                throw invalid("原提成尚未实际发放，请与原提成一同传送到同一工资周期");
        } else if (!actuallyPaid(fact)) {
            for (Long refundId : sources.refunds(tenant(), fact.allocationId())) {
                if (!assignedTogether(source(refundId), periodId, selected))
                    throw invalid("原提成已有退款，请将原款及全部扣回一同传送到同一工资周期");
            }
        }
    }

    private boolean actuallyPaid(Fact fact) {
        HrCompChange change = change(fact.allocationId());
        if (change == null) return false;
        verifyChange(change, fact);
        Progress progress = latest(change);
        if (!"PAID".equals(progress.state())) return false;
        HrSalarySlip salary = salaries.selectById(progress.salarySlipId());
        if (salary == null || !tenant().equals(salary.getTenantId()) || !fact.employeeId().equals(salary.getEmployeeId())
                || !"PAID".equals(salary.getStatus())) throw invalid("原提成缺少实际已支付工资依据");
        return true;
    }

    private boolean assignedTogether(Fact fact, Long periodId, Set<Long> selected) {
        HrCompChange change = change(fact.allocationId());
        if (change != null) {
            verifyChange(change, fact);
            Progress progress = latest(change);
            if (change.getPayrollPeriodId() != null) return periodId.equals(change.getPayrollPeriodId()) && "POSTED".equals(progress.state());
        }
        if (selected.contains(fact.allocationId())) return true;
        for (OutboxEvent stored : events.selectList(new LambdaQueryWrapper<OutboxEvent>().eq(OutboxEvent::getTenantId, tenant())
                .eq(OutboxEvent::getAggregateType, CommissionEvents.CRM).eq(OutboxEvent::getAggregateId, fact.allocationId())
                .eq(OutboxEvent::getEventType, CommissionEvents.REQUEST))) {
            Request request = CommissionEvents.request(stored, tenant(), json);
            if ("POST".equals(request.operation()) && periodId.equals(request.payrollPeriodId())
                    && request.factDigest().equals(CommissionEvents.fingerprint(fact))) return true;
        }
        return false;
    }

    private HrCompChange change(Long allocationId) {
        return changes.selectOne(new LambdaQueryWrapper<HrCompChange>().eq(HrCompChange::getTenantId, tenant())
                .eq(HrCompChange::getSourceBizType, CommissionEvents.SOURCE).eq(HrCompChange::getSourceBizId, allocationId.toString()));
    }
    private Request request(String eventId) {
        try { return CommissionEvents.request(stored(eventId), tenant(), json); }
        catch (IllegalArgumentException failure) { throw invalid(failure.getMessage()); }
    }
    private OutboxEvent stored(String eventId) {
        if (eventId == null || !eventId.matches("[0-9a-f-]{36}")) throw invalid("提成来源编号无效");
        return events.selectOne(new LambdaQueryWrapper<OutboxEvent>().eq(OutboxEvent::getTenantId, tenant()).eq(OutboxEvent::getEventId, eventId));
    }
    private static void requireTransaction() { if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("提成发薪状态必须与本地工资共同提交"); }
    private static Long identifier(Object value) { Long result = optionalIdentifier(value); if (result == null) throw invalid("提成来源编号无效"); return result; }
    private static Long optionalIdentifier(Object value) {
        if (value == null) return null;
        try { long identifier = new BigDecimal(String.valueOf(value)).longValueExact(); if (identifier <= 0) throw invalid("提成来源编号无效"); return identifier; }
        catch (ArithmeticException | NumberFormatException failure) { throw invalid("提成来源编号无效"); }
    }
    private static BigDecimal decimal(Object value) {
        try { return new BigDecimal(String.valueOf(value)); }
        catch (NumberFormatException failure) { throw invalid("提成工资金额无效"); }
    }
    private static Long tenant() { return HrRuleSupport.tenantId(); }
    private static LocalDateTime now() { return LocalDateTime.now().withNano(0); }
    private static HrBusinessException invalid(String message) { return new HrBusinessException("COMMISSION_SOURCE_CONFLICT", message); }
    private record SalaryEntry(HrCompChange change, Fact fact) { }
}
