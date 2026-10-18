package com.cloudflow.common.event.contract;

import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventEnvelopeCodec;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public final class ContractPerformanceSourceCodec {
    private static final Set<String> APPROVED = Set.of("APPROVED", "SEALING", "SEALED", "ACTIVE");
    private static final Set<String> ROLES = Set.of("OWNER", "CO_SELLER", "PRE_SALES", "SUPPORT", "MANAGER");
    private ContractPerformanceSourceCodec() { }

    public record Decoded(BusinessEventEnvelope envelope, ContractPerformanceSource source) { }

    public static BusinessEventEnvelope encode(ContractPerformanceSource source, ObjectMapper json) {
        validate(source, source == null ? null : source.getTenantId());
        try {
            String payload = json.writeValueAsString(source);
            return BusinessEventEnvelope.builder().eventId(source.eventId()).eventType(ContractPerformanceSource.EVENT)
                    .sourceModule(ContractPerformanceSource.SERVICE).sourceId(source.getContractId()).tenantId(source.getTenantId())
                    .occurredAt(source.getOccurredTime()).payload(payload).payloadDigest(ContractPerformanceSource.digest(payload)).build();
        } catch (JsonProcessingException failure) { throw invalid("合同来源序列化失败"); }
    }

    public static Decoded decode(OutboxEvent stored, Long tenantId, ObjectMapper json) {
        if (stored == null || !Objects.equals(stored.getTenantId(), tenantId)
                || !ContractPerformanceSource.SERVICE.equals(stored.getAggregateType())
                || !ContractPerformanceSource.EVENT.equals(stored.getEventType())) throw invalid("合同持久来源不存在或不可访问");
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelopeCodec.read(stored.getPayloadJson(), json);
            if (envelope == null || envelope.getPayload() == null || !Objects.equals(stored.getEventId(), envelope.getEventId())
                    || !Objects.equals(stored.getAggregateId(), envelope.getSourceId()) || !Objects.equals(tenantId, envelope.getTenantId())
                    || !ContractPerformanceSource.SERVICE.equals(envelope.getSourceModule())
                    || !ContractPerformanceSource.EVENT.equals(envelope.getEventType())
                    || !Objects.equals(ContractPerformanceSource.digest(envelope.getPayload()), envelope.getPayloadDigest()))
                throw invalid("合同持久来源摘要无法核验");
            ContractPerformanceSource source = json.readValue(envelope.getPayload(), ContractPerformanceSource.class);
            validate(source, tenantId);
            if (!Objects.equals(source.eventId(), envelope.getEventId()) || !Objects.equals(source.getContractId(), envelope.getSourceId())
                    || !Objects.equals(source.getOccurredTime(), envelope.getOccurredAt())) throw invalid("合同来源身份或时间不一致");
            return new Decoded(envelope, source);
        } catch (JsonProcessingException failure) { throw invalid("合同持久来源格式无效"); }
    }

    public static void transition(Decoded previous, Decoded next, ObjectMapper json) {
        ContractPerformanceSource prior = previous.source(), current = next.source();
        if (!Objects.equals(current.getPreviousEventId(), previous.envelope().getEventId())
                || !Objects.equals(current.getPreviousDigest(), previous.envelope().getPayloadDigest())
                || prior.getRevision() == Integer.MAX_VALUE || current.getRevision() != prior.getRevision() + 1
                || current.getContractVersion() <= prior.getContractVersion() || current.getOccurredTime().isBefore(prior.getOccurredTime())
                || !Objects.equals(current.getTenantId(), prior.getTenantId()) || !Objects.equals(current.getContractId(), prior.getContractId())
                || !Objects.equals(current.getCustomerId(), prior.getCustomerId()) || !Objects.equals(current.getCurrency(), prior.getCurrency())
                || !Objects.equals(current.getContractType(), prior.getContractType()) || !Objects.equals(current.getStartDate(), prior.getStartDate())
                || !Objects.equals(current.getEndDate(), prior.getEndDate()) || !Objects.equals(current.getApprovalInstanceId(), prior.getApprovalInstanceId())
                || !Objects.equals(current.getApprovedTime(), prior.getApprovedTime()) || !Objects.equals(current.getOurSigneeId(), prior.getOurSigneeId())
                || !Objects.equals(current.getOurSignTime(), prior.getOurSignTime()) || !Objects.equals(current.getCounterpartySignTime(), prior.getCounterpartySignTime())
                || !Objects.equals(current.getSignedEvidenceDigest(), prior.getSignedEvidenceDigest())
                || !Objects.equals(current.getTeamVersion(), prior.getTeamVersion())
                || !json.valueToTree(current.getMembers()).equals(json.valueToTree(prior.getMembers()))
                || "REVERSE".equals(prior.getOperation()) || "CONFIRM".equals(current.getOperation()))
            throw invalid("合同来源链、版本或原冻结依据不一致");
        if ("CORRECT".equals(current.getOperation()) == (current.getAmount().compareTo(prior.getAmount()) == 0))
            throw invalid("合同更正或冲正金额与原事实不一致");
    }

    private static void validate(ContractPerformanceSource source, Long tenantId) {
        if (source == null || !Integer.valueOf(1).equals(source.getSchemaVersion()) || !positive(tenantId)
                || !Objects.equals(source.getTenantId(), tenantId) || !positive(source.getContractId()) || !positive(source.getCustomerId())
                || source.getContractVersion() == null || source.getContractVersion() < 0 || source.getRevision() == null || source.getRevision() <= 0
                || !Set.of("CONFIRM", "CORRECT", "REVERSE").contains(safe(source.getOperation()))
                || !Set.of("SALES", "SERVICE", "OTHER").contains(safe(source.getContractType()))
                || source.getCurrency() == null || !source.getCurrency().matches("[A-Z]{3}")) throw invalid("合同来源身份、类型或版本无效");
        boolean initial = source.getRevision() == 1;
        if (initial != "CONFIRM".equals(source.getOperation())
                || initial && (source.getPreviousEventId() != null || source.getPreviousDigest() != null)
                || !initial && (source.getPreviousEventId() == null || !source.getPreviousEventId().matches("[0-9a-f-]{36}")
                    || !digest(source.getPreviousDigest()))) throw invalid("合同来源前序凭证无效");
        if (source.getAmount() == null || source.getAmount().signum() < 0 || source.getAmount().stripTrailingZeros().scale() > 2
                || source.getAmount().compareTo(new BigDecimal("999999999999.99")) > 0) throw invalid("合同来源金额无效");
        if (source.getApprovalInstanceId() == null || source.getApprovalInstanceId().isBlank() || source.getApprovalInstanceId().length() > 64
                || source.getOccurredTime() == null || source.getOccurredTime().getNano() != 0 || source.getOccurredTime().isAfter(LocalDateTime.now().plusSeconds(5))
                || source.getApprovedTime() == null || source.getApprovedTime().isAfter(source.getOccurredTime())
                || source.getStartDate() == null || source.getStartDate().isAfter(source.getOccurredTime().toLocalDate())
                || source.getEndDate() != null && source.getEndDate().isBefore(source.getStartDate())
                || !positive(source.getOurSigneeId()) || source.getOurSignTime() == null || source.getOurSignTime().isAfter(source.getOccurredTime())
                || source.getCounterpartySignTime() == null || source.getCounterpartySignTime().isAfter(source.getOccurredTime())
                || !digest(source.getSignedEvidenceDigest())) throw invalid("合同缺少已审批、双方签署或已到开始日期的依据");
        if ("REVERSE".equals(source.getOperation()) ? !Set.of("CANCELLED", "TERMINATED").contains(safe(source.getContractStatus()))
                : !APPROVED.contains(safe(source.getContractStatus()))) throw invalid("合同状态与业绩操作不一致");
        if (source.getTeamVersion() == null || source.getTeamVersion() < 0 || source.getMembers() == null
                || source.getMembers().isEmpty() || source.getMembers().size() > 200) throw invalid("合同冻结团队版本无效");
        Set<Long> users = new HashSet<>(), employees = new HashSet<>();
        BigDecimal total = BigDecimal.ZERO;
        int owners = 0;
        for (ContractPerformanceSource.Member member : source.getMembers()) {
            if (member == null || !positive(member.userId()) || !users.add(member.userId()) || !positive(member.employeeId())
                    || !employees.add(member.employeeId()) || !positive(member.deptId()) || member.name() == null || member.name().isBlank()
                    || member.name().length() > 100 || !ROLES.contains(safe(member.role())) || member.percentage() == null
                    || member.percentage().signum() < 0 || member.percentage().compareTo(BigDecimal.ONE) > 0
                    || member.percentage().stripTrailingZeros().scale() > 4) throw invalid("合同冻结成员身份或比例无效");
            total = total.add(member.percentage());
            if ("OWNER".equals(member.role())) owners++;
        }
        if (owners != 1 || total.compareTo(BigDecimal.ONE) != 0) throw invalid("合同冻结团队须唯一主责且比例合计100%");
    }

    private static String safe(String value) { return value == null ? "" : value; }
    private static boolean positive(Long value) { return value != null && value > 0; }
    private static boolean digest(String value) { return value != null && value.matches("[0-9a-f]{64}"); }
    private static IllegalArgumentException invalid(String message) { return new IllegalArgumentException(message); }
}
