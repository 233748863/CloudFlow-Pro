package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventEnvelopeCodec;
import com.cloudflow.hr.client.HrAdvancePaymentClient;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.mapper.HrAdvanceApplicationMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrAdvancePaymentService {
    public static final String PAID_EVENT = "HR_ADVANCE_PAYMENT_PAID";
    private final HrAdvancePaymentClient client;
    private final HrEmployeeAdvanceMapper advances;
    private final HrAdvanceApplicationMapper sources;
    private final HrAdvanceLedgerService ledger;
    private final HrRuleSupport support;
    private final ObjectMapper json;

    public void create(Long advanceId) {
        HrEmployeeAdvance initial = advances.selectById(advanceId);
        if (initial == null || !Objects.equals(initial.getTenantId(), tenantId()) || !"APPROVED".equals(initial.getApprovalStatus())) throw forbidden();
        if (initial.getPaymentRequestId() != null) return;
        if (!"APPROVED".equals(initial.getStatus()) || initial.getPaidTime() != null) throw conflict("ADVANCE_PAYMENT_STATE", "借款当前不能建立付款单");
        R<Long> response = client.create(new HrAdvancePaymentClient.Source("HR_ADVANCE", advanceId));
        if (response == null || !response.isSuccess() || response.getData() == null || response.getData() <= 0) {
            throw conflict("ADVANCE_PAYMENT_PENDING", "付款申请等待恢复，已保存的通知将重试");
        }
        Long paymentId = response.getData();
        ledger.withAdvanceLock(advanceId, advance -> {
            matchingPayment(advance, paymentId);
            if (advance.getPaymentRequestId() != null) {
                if (!paymentId.equals(advance.getPaymentRequestId())) throw conflict("ADVANCE_PAYMENT_CONFLICT", "借款已有不同付款单");
                return null;
            }
            if (!"APPROVED".equals(advance.getStatus()) || !"APPROVED".equals(advance.getApprovalStatus()) || advance.getPaidTime() != null) throw conflict("ADVANCE_PAYMENT_STATE", "借款当前不能绑定付款单");
            advance.setPaymentRequestId(paymentId); save(advance);
            support.audit("HR_ADVANCE", advanceId, "PAYMENT_CREATED", Map.of("paymentId", paymentId)); return null;
        });
    }

    public void paid(Paid input) {
        if (input == null || !Objects.equals(input.tenantId(), tenantId()) || input.advanceId() == null || input.paymentId() == null
                || input.amount() == null || input.paidTime() == null || input.paidTime().isAfter(HrHSupport.now())
                || !UUID.nameUUIDFromBytes((tenantId() + ":" + PAID_EVENT + ":" + input.paymentId()).getBytes(StandardCharsets.UTF_8)).toString().equals(input.eventId())) throw forbidden();
        ledger.withAdvanceLock(input.advanceId(), advance -> {
            matchingPayment(advance, input.paymentId());
            if (!Objects.equals(advance.getPaymentRequestId(), input.paymentId()) || advance.getAdvanceAmount().compareTo(input.amount()) != 0) throw conflict("ADVANCE_PAYMENT_CONFLICT", "放款金额或付款来源不一致");
            HrAdvanceApplicationMapper.PaymentSource payment = sources.paymentSource(tenantId(), input.paymentId());
            if (!"PAID".equals(payment.status())) throw conflict("ADVANCE_NOT_PAID", "OA尚未确认实际付款");
            Map<String, Object> previous = support.auditDetail("HR_ADVANCE", advance.getAdvanceId(), "FUNDED");
            if (advance.getPaidTime() != null) {
                if (!input.paidTime().equals(advance.getPaidTime()) || !Objects.equals(input.eventId(), previous.get("eventId"))) throw conflict("ADVANCE_PAYMENT_CONFLICT", "放款事件与原入账事实不一致");
                return null;
            }
            verifyPaidEvent(input);
            if (!"APPROVED".equals(advance.getStatus()) || !"APPROVED".equals(advance.getApprovalStatus())
                    || advance.getOutstandingAmount().signum() != 0 || advance.getReservedAmount().signum() != 0
                    || advance.getRepaidAmount().signum() != 0 || advance.getWrittenOffAmount().signum() != 0
                    || input.paidTime().toLocalDate().isBefore(advance.getApplyDate())) throw conflict("ADVANCE_PAYMENT_STATE", "借款缺少可入账的审批状态或已存在本金事实");
            advance.setPaidTime(input.paidTime()); advance.setOutstandingAmount(advance.getAdvanceAmount()); advance.setStatus("PAID"); save(advance);
            support.audit("HR_ADVANCE", advance.getAdvanceId(), "FUNDED", Map.of("paymentId", input.paymentId(), "eventId", input.eventId(),
                    "amount", input.amount().toPlainString(), "paidTime", input.paidTime().toString())); return null;
        });
    }

    private void verifyPaidEvent(Paid input) {
        String persisted = sources.paymentEvent(tenantId(), input.eventId(), input.paymentId());
        if (persisted == null) throw conflict("ADVANCE_PAYMENT_EVIDENCE_MISSING", "缺少OA实际付款时保存的原始事件");
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelopeCodec.read(persisted, json);
            Paid recorded = json.readValue(envelope.getPayload(), Paid.class);
            if (!Objects.equals(envelope.getTenantId(), tenantId()) || !Objects.equals(envelope.getSourceId(), input.paymentId())
                    || !PAID_EVENT.equals(envelope.getEventType()) || !"cloudflow-oa".equals(envelope.getSourceModule())
                    || !Objects.equals(envelope.getEventId(), input.eventId()) || !json.valueToTree(recorded).equals(json.valueToTree(input))) throw forbidden();
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw conflict("ADVANCE_PAYMENT_EVIDENCE_INVALID", "实际付款事件无法核实"); }
    }

    private void matchingPayment(HrEmployeeAdvance advance, Long paymentId) {
        HrAdvanceApplicationMapper.PaymentSource source = sources.paymentSource(tenantId(), paymentId);
        String applicant = advance.getRuleSnapshot() == null ? "" : advance.getRuleSnapshot().path("workflow").path("applicantUserId").asText();
        if (source == null || !Integer.valueOf(0).equals(source.deleted()) || !"HR_ADVANCE".equals(source.sourceBizType())
                || !advance.getAdvanceId().toString().equals(source.sourceBizId()) || !Objects.equals(source.userId(), HrHSupport.number(applicant))
                || source.amount() == null || advance.getAdvanceAmount().compareTo(source.amount()) != 0 || !List.of("APPROVED", "PAID").contains(source.status())) throw conflict("ADVANCE_PAYMENT_CONFLICT", "无法核对同租户真实借款付款单");
    }

    private void save(HrEmployeeAdvance advance) {
        advance.setUpdateBy("system"); advance.setUpdateTime(HrHSupport.now());
        if (advances.updateById(advance) != 1) throw conflict("VERSION_CONFLICT", "借款付款状态已变化");
    }

    public record Paid(Long tenantId, Long advanceId, Long paymentId, BigDecimal amount,
                       @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm[:ss]") LocalDateTime paidTime, String eventId) { }
}
