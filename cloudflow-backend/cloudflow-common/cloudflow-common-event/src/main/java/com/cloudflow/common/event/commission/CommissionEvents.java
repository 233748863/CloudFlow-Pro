package com.cloudflow.common.event.commission;

import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventEnvelopeCodec;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

public final class CommissionEvents {
    public static final String SOURCE = "CRM_COMMISSION";
    public static final String REQUEST = "CRM_COMMISSION_REQUEST";
    public static final String PROGRESS = "HR_COMMISSION_PROGRESS";
    public static final String CRM = "cloudflow-service-crm";
    public static final String HR = "cloudflow-service-hr";

    private CommissionEvents() { }

    public record Reference(String eventId) { }
    public record Selection(List<Long> allocationIds, Long payrollPeriodId, Long salaryComponentId) { }
    public record Fact(Long tenantId, Long allocationId, Long eventId, Long originalAllocationId, Long originalEventId,
            Long employeeId, Long salesUserId, Long deptId, String eventType, String bizType, Long bizId, String currency,
            LocalDateTime occurredTime, BigDecimal allocatedAmount, BigDecimal commissionRate, BigDecimal commissionAmount,
            Integer baselineFlag, String commissionStatus, Long compChangeId) { }
    public record Request(Integer schemaVersion, Long tenantId, Long allocationId, String operation,
            Long payrollPeriodId, Long salaryComponentId, Long operatorId, String factDigest,
            @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime occurredTime) {
        public String eventId() { return identifier(tenantId + ":" + REQUEST + ":" + allocationId + ":" + operation
                + ":" + payrollPeriodId + ":" + salaryComponentId); }
    }
    public record Progress(Integer schemaVersion, Long tenantId, Long allocationId, Long compChangeId, Long revision,
            String state, String requestEventId, Long payrollPeriodId, Long salaryComponentId, Long salarySlipId,
            Long settlementId, Long reversalSettlementId, String previousEventId,
            @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime occurredTime) {
        public String eventId() { return identifier(tenantId + ":" + PROGRESS + ":" + compChangeId + ":" + revision); }
    }

    public static String fingerprint(Fact source) {
        validateFact(source);
        return digest(String.join("|", String.valueOf(source.tenantId()), String.valueOf(source.allocationId()),
                String.valueOf(source.eventId()), String.valueOf(source.originalAllocationId()), String.valueOf(source.originalEventId()),
                String.valueOf(source.employeeId()), String.valueOf(source.salesUserId()), String.valueOf(source.deptId()),
                source.eventType(), source.bizType(), source.bizId().toString(), source.currency(), source.occurredTime().toString(),
                decimal(source.allocatedAmount()), decimal(source.commissionRate()), decimal(source.commissionAmount())));
    }

    public static void validateFact(Fact source) {
        if (source == null || !positive(source.tenantId()) || !positive(source.allocationId()) || !positive(source.eventId())
                || !positive(source.employeeId()) || !positive(source.salesUserId()) || !positive(source.deptId()) || !positive(source.bizId())
                || !"RECEIPT".equals(source.eventType()) || !"RECEIVABLE".equals(source.bizType())
                || !Integer.valueOf(0).equals(source.baselineFlag()) || source.currency() == null || !source.currency().matches("[A-Z]{3}")
                || source.occurredTime() == null || source.occurredTime().isAfter(LocalDateTime.now().plusSeconds(5))
                || source.commissionRate() == null || source.commissionRate().signum() < 0 || source.commissionRate().compareTo(BigDecimal.ONE) > 0
                || source.commissionRate().stripTrailingZeros().scale() > 4
                || !money(source.allocatedAmount()) || !money(source.commissionAmount())
                || (source.originalAllocationId() == null) != (source.originalEventId() == null)
                || source.originalAllocationId() != null && (!positive(source.originalAllocationId()) || !positive(source.originalEventId())
                    || source.originalAllocationId().equals(source.allocationId()) || source.originalEventId().equals(source.eventId()))
                || source.originalAllocationId() == null && (source.allocatedAmount().signum() < 0 || source.commissionAmount().signum() < 0)
                || source.originalAllocationId() != null && (source.allocatedAmount().signum() > 0 || source.commissionAmount().signum() > 0))
            throw invalid("提成必须来自可核验的真实到账及原款退款分配");
    }

    public static BusinessEventEnvelope encode(Request request, ObjectMapper json) {
        validate(request, request == null ? null : request.tenantId());
        return envelope(request, request.eventId(), REQUEST, CRM, request.allocationId(), request.tenantId(), request.occurredTime(), json);
    }

    public static BusinessEventEnvelope encode(Progress progress, ObjectMapper json) {
        validate(progress, progress == null ? null : progress.tenantId());
        return envelope(progress, progress.eventId(), PROGRESS, HR, progress.compChangeId(), progress.tenantId(), progress.occurredTime(), json);
    }

    public static Request request(OutboxEvent stored, Long tenantId, ObjectMapper json) {
        BusinessEventEnvelope envelope = decode(stored, tenantId, REQUEST, CRM, json);
        try {
            Request request = json.readValue(envelope.getPayload(), Request.class);
            validate(request, tenantId);
            if (!request.eventId().equals(envelope.getEventId()) || !request.allocationId().equals(envelope.getSourceId())
                    || !request.occurredTime().equals(envelope.getOccurredAt())) throw invalid("提成传送来源身份不一致");
            return request;
        } catch (JsonProcessingException failure) { throw invalid("提成传送来源格式无效"); }
    }

    public static Progress progress(OutboxEvent stored, Long tenantId, ObjectMapper json) {
        BusinessEventEnvelope envelope = decode(stored, tenantId, PROGRESS, HR, json);
        try {
            Progress progress = json.readValue(envelope.getPayload(), Progress.class);
            validate(progress, tenantId);
            if (!progress.eventId().equals(envelope.getEventId()) || !progress.compChangeId().equals(envelope.getSourceId())
                    || !progress.occurredTime().equals(envelope.getOccurredAt())) throw invalid("提成发薪回执身份不一致");
            return progress;
        } catch (JsonProcessingException failure) { throw invalid("提成发薪回执格式无效"); }
    }

    public static void matchingEnvelope(OutboxEvent stored, BusinessEventEnvelope received, ObjectMapper json) {
        if (received == null || stored == null) throw invalid("提成消息来源不存在");
        try {
            if (!json.valueToTree(BusinessEventEnvelopeCodec.read(stored.getPayloadJson(), json)).equals(json.valueToTree(received)))
                throw invalid("提成消息与持久来源不一致");
        } catch (JsonProcessingException failure) { throw invalid("提成消息来源格式无效"); }
    }

    private static BusinessEventEnvelope envelope(Object payload, String eventId, String type, String service, Long sourceId,
            Long tenantId, LocalDateTime occurredTime, ObjectMapper json) {
        try {
            String encoded = json.writeValueAsString(payload);
            return BusinessEventEnvelope.builder().eventId(eventId).eventType(type).sourceModule(service).sourceId(sourceId)
                    .tenantId(tenantId).occurredAt(occurredTime).payload(encoded).payloadDigest(digest(encoded)).build();
        } catch (JsonProcessingException failure) { throw invalid("提成来源保存失败"); }
    }

    private static BusinessEventEnvelope decode(OutboxEvent stored, Long tenantId, String type, String service, ObjectMapper json) {
        if (stored == null || !positive(tenantId) || !tenantId.equals(stored.getTenantId())
                || !type.equals(stored.getEventType()) || !service.equals(stored.getAggregateType())) throw invalid("提成持久来源不存在或不可访问");
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelopeCodec.read(stored.getPayloadJson(), json);
            if (envelope == null || envelope.getPayload() == null || !tenantId.equals(envelope.getTenantId())
                    || !type.equals(envelope.getEventType()) || !service.equals(envelope.getSourceModule())
                    || !Objects.equals(stored.getEventId(), envelope.getEventId()) || !Objects.equals(stored.getAggregateId(), envelope.getSourceId())
                    || !digest(envelope.getPayload()).equals(envelope.getPayloadDigest())) throw invalid("提成持久来源摘要无法核验");
            return envelope;
        } catch (JsonProcessingException failure) { throw invalid("提成持久来源格式无效"); }
    }

    private static void validate(Request request, Long tenantId) {
        if (request == null || !Integer.valueOf(1).equals(request.schemaVersion()) || !positive(tenantId)
                || !tenantId.equals(request.tenantId()) || !positive(request.allocationId())
                || !Set.of("POST", "RECOVERY").contains(String.valueOf(request.operation()))
                || !hash(request.factDigest()) || !time(request.occurredTime())) throw invalid("提成传送依据无效");
        if ("POST".equals(request.operation()) ? !positive(request.payrollPeriodId()) || !positive(request.salaryComponentId()) || !positive(request.operatorId())
                : request.payrollPeriodId() != null || request.salaryComponentId() != null) throw invalid("提成传送周期、项目或操作者无效");
    }

    private static void validate(Progress progress, Long tenantId) {
        if (progress == null || !Integer.valueOf(1).equals(progress.schemaVersion()) || !positive(tenantId)
                || !tenantId.equals(progress.tenantId()) || !positive(progress.allocationId()) || !positive(progress.compChangeId())
                || !positive(progress.revision()) || !Set.of("PENDING", "POSTED", "PAID").contains(String.valueOf(progress.state()))
                || !uuid(progress.requestEventId()) || !time(progress.occurredTime())
                || (progress.revision() == 1) != (progress.previousEventId() == null)
                || progress.previousEventId() != null && !uuid(progress.previousEventId())
                || "PENDING".equals(progress.state()) && (progress.payrollPeriodId() != null || progress.salaryComponentId() != null || progress.salarySlipId() != null)
                || !"PENDING".equals(progress.state()) && (!positive(progress.payrollPeriodId()) || !positive(progress.salaryComponentId()))
                || "PAID".equals(progress.state()) && (!positive(progress.salarySlipId()) || progress.reversalSettlementId() != null)
                || progress.settlementId() != null && !positive(progress.settlementId())
                || progress.reversalSettlementId() != null && (!positive(progress.reversalSettlementId()) || !positive(progress.settlementId())
                    || progress.reversalSettlementId().equals(progress.settlementId()) || !positive(progress.salarySlipId())))
            throw invalid("提成工资状态依据无效");
    }

    public static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException failure) { throw new IllegalStateException("SHA-256不可用", failure); }
    }

    private static String identifier(String value) { return UUID.nameUUIDFromBytes(value.getBytes(StandardCharsets.UTF_8)).toString(); }
    private static boolean positive(Long value) { return value != null && value > 0; }
    private static boolean time(LocalDateTime value) { return value != null && value.getNano() == 0 && !value.isAfter(LocalDateTime.now().plusSeconds(5)); }
    private static boolean hash(String value) { return value != null && value.matches("[0-9a-f]{64}"); }
    private static boolean uuid(String value) { return value != null && value.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"); }
    private static boolean money(BigDecimal value) { return value != null && value.stripTrailingZeros().scale() <= 2 && value.abs().compareTo(new BigDecimal("999999999999.99")) <= 0; }
    private static String decimal(BigDecimal value) { return value.stripTrailingZeros().toPlainString(); }
    private static IllegalArgumentException invalid(String message) { return new IllegalArgumentException(message); }
}
