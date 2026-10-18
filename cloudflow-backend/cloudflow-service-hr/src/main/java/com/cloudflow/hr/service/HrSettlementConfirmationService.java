package com.cloudflow.hr.service;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrSettlementConfirmationService {
    public static final String FUNDS_REQUEST = "HR_SETTLEMENT_FUNDS_REQUEST";
    private final HrSettlementReservationService reservations;
    private final HrSettlementDraftService drafts;
    private final HrSettlementWorkflowService workflow;
    private final HrFinalSettlementMapper settlements;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final OutboxPublisher publisher;

    @Audit(name = "确认已审批离职结算", spel = "#id", highRisk = true)
    public void confirm(Long id, HrHRequests.VersionDTO input) {
        access.permission("hr:settlement:confirm"); access.validate(input);
        reservations.locked(id, record -> {
            access.operator(record.getEmployeeId(), "hr:settlement:confirm");
            HrHSupport.version(input.getVersion(), record.getVersion());
            workflow.verifyApprovedLocked(record);
            reservations.verifyFrozenLocked(record);
            drafts.verifyConfirmationLocked(record);
            int version = record.getVersion();
            if (version == Integer.MAX_VALUE) throw conflict("VERSION_CONFLICT", "结算版本已达到容量");
            ObjectNode calculation = ((ObjectNode) record.getCalculationSnapshot()).deepCopy();
            ObjectNode confirmation = calculation.putObject("confirmation");
            record.setConfirmedBy(access.user()); record.setConfirmedTime(HrHSupport.now().withNano(0));
            confirmation.put("by", access.user().toString()).put("time", record.getConfirmedTime().toString())
                    .put("approvedRevision", calculation.path("workflow").path("revision").intValue())
                    .put("netAmount", record.getNetAmount().toPlainString())
                    .put("direction", record.getNetAmount().signum() > 0 ? "PAYMENT" : record.getNetAmount().signum() < 0 ? "RECEIPT" : "NETTING");
            com.cloudflow.hr.domain.entity.HrEmployee employee = access.employee(record.getEmployeeId());
            confirmation.put("employeeUserId", employee.getUserId().toString()).put("employeeName", employee.getName()).put("deptId", employee.getDeptId().toString());
            record.setCalculationSnapshot(calculation); record.setStatus("CONFIRMED");
            record.setUpdateBy(HrRuleSupport.userName()); record.setUpdateTime(record.getConfirmedTime());
            if (settlements.confirm(record, version) != 1) throw conflict("VERSION_CONFLICT", "结算已变化，请读取原单核对");
            if (record.getNetAmount().signum() >= 0) {
                Command command = new Command(tenantId(), id);
                publisher.publish(BusinessEventEnvelope.builder().eventType(FUNDS_REQUEST).sourceModule("cloudflow-hr").sourceId(id)
                        .eventId(UUID.nameUUIDFromBytes((tenantId() + ":" + FUNDS_REQUEST + ":" + id).getBytes(StandardCharsets.UTF_8)).toString())
                        .tenantId(tenantId()).occurredAt(record.getConfirmedTime()).payload(access.json(command)).build());
            }
            support.audit("HR_SETTLEMENT", id, "CONFIRMED", Map.of("approvedRevision", confirmation.path("approvedRevision").intValue(),
                    "netAmount", record.getNetAmount().toPlainString(), "direction", confirmation.path("direction").asText()));
            return null;
        });
    }

    public record Command(Long tenantId, Long settlementId) { }
}
