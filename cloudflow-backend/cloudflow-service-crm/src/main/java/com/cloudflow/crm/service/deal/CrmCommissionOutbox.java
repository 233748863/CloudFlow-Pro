package com.cloudflow.crm.service.deal;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.commission.CommissionEvents;
import com.cloudflow.common.event.commission.CommissionEvents.Fact;
import com.cloudflow.common.event.commission.CommissionEvents.Request;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmCommissionMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class CrmCommissionOutbox {
    private final CrmCommissionMapper sources;
    private final OutboxEventMapper events;
    private final OutboxPublisher publisher;
    private final ObjectMapper json;

    public String request(Long allocationId, Long periodId, Long componentId) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("提成通知必须与本地业务共同提交");
        Fact source = sources.source(CrmRecordSupport.tenantId(), allocationId);
        try { CommissionEvents.validateFact(source); }
        catch (IllegalArgumentException failure) { throw new CrmBusinessException(failure.getMessage()); }
        if (!"CNY".equals(source.currency())) throw new CrmBusinessException("当前工资使用人民币，其他币种须另行核定换算规则");
        if (!Set.of("APPROVED", "POSTED", "PAID").contains(source.commissionStatus())
                && !(source.originalAllocationId() != null && "READY".equals(source.commissionStatus())))
            throw new CrmBusinessException("到账提成尚未核定");
        String operation = periodId == null ? "RECOVERY" : "POST";
        if (periodId == null && source.originalAllocationId() == null) throw new CrmBusinessException("原到账提成必须选择工资周期");
        String fingerprint = CommissionEvents.fingerprint(source);
        for (OutboxEvent stored : events.selectList(new LambdaQueryWrapper<OutboxEvent>()
                .eq(OutboxEvent::getTenantId, source.tenantId()).eq(OutboxEvent::getAggregateType, CommissionEvents.CRM)
                .eq(OutboxEvent::getAggregateId, allocationId).eq(OutboxEvent::getEventType, CommissionEvents.REQUEST))) {
            Request prior = CommissionEvents.request(stored, source.tenantId(), json);
            if (!fingerprint.equals(prior.factDigest())) throw new CrmBusinessException("原提成通知与冻结分配不一致");
            if (!operation.equals(prior.operation())) continue;
            if (!Objects.equals(periodId, prior.payrollPeriodId()) || !Objects.equals(componentId, prior.salaryComponentId()))
                throw new CrmBusinessException("该提成已选定工资周期和项目，请按原选择恢复传送");
            return prior.eventId();
        }
        Request request = new Request(1, source.tenantId(), allocationId, operation, periodId, componentId,
                UserContext.getUserId(), fingerprint, LocalDateTime.now().withNano(0));
        publisher.publishOnceAt(CommissionEvents.encode(request, json), null);
        return request.eventId();
    }

    public void recovery(Long allocationId) {
        Fact source = sources.source(CrmRecordSupport.tenantId(), allocationId);
        if (source == null || source.originalAllocationId() == null || source.commissionAmount() == null || !"CNY".equals(source.currency())) return;
        Fact original = sources.source(source.tenantId(), source.originalAllocationId());
        if (original == null || !Set.of("APPROVED", "POSTED", "PAID").contains(original.commissionStatus())) return;
        request(allocationId, null, null);
    }
}
