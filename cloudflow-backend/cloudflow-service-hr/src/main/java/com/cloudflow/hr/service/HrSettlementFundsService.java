package com.cloudflow.hr.service;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventEnvelopeCodec;
import com.cloudflow.hr.client.HrAdvancePaymentClient;
import com.cloudflow.hr.domain.dto.HrSettlementRequests;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import com.cloudflow.hr.mapper.HrSettlementFundsMapper;
import com.cloudflow.hr.mapper.HrSettlementFundsMapper.Payment;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrSettlementFundsService {
    public static final String PAID_EVENT = "HR_SETTLEMENT_PAYMENT_PAID";
    private final HrFinalSettlementMapper settlements;
    private final HrSettlementFundsMapper funds;
    private final HrSettlementReservationService reservations;
    private final HrSettlementWorkflowService workflow;
    private final HrSettlementPostingService posting;
    private final HrSettlementReversalSourceService reversals;
    private final HrAdvancePaymentClient client;
    private final HrSettlementProofService proofs;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final ObjectMapper json;

    public void processConfirmed(Long id) {
        HrFinalSettlement initial = find(id);
        if (initial.getNetAmount().signum() < 0) throw conflict("SETTLEMENT_RECEIPT_REQUIRED", "负净额须由财务核对实际收款凭据");
        if (initial.getNetAmount().signum() == 0) {
            reservations.locked(id, record -> {
                String key = "NETTING:" + tenantId() + ":" + id;
                if (posted(record, key)) return null;
                ready(record); LocalDateTime now = HrHSupport.now().withNano(0);
                ObjectNode evidence = json.createObjectNode().put("kind", "NETTING").put("eventId", key).put("amount", "0.00")
                        .put("confirmedBy", record.getConfirmedBy().toString()).put("recognizedTime", now.toString());
                finish(record, evidence, now, now.toLocalDate(), key); return null;
            });
            return;
        }
        if (initial.getPaymentRequestId() != null) { matchingPayment(initial, initial.getPaymentRequestId()); return; }
        if (!"CONFIRMED".equals(initial.getStatus()) || !"APPROVED".equals(initial.getApprovalStatus()) || initial.getPaidTime() != null) throw conflict("SETTLEMENT_PAYMENT_STATE", "结算尚未确认，不能建立付款申请");
        reservations.locked(id, record -> { ready(record); return null; });
        // OA takes the same source locks in its own transaction; never retain HR locks during this remote call.
        R<Long> response = client.create(new HrAdvancePaymentClient.Source("HR_SETTLEMENT", id));
        if (response == null || !response.isSuccess() || response.getData() == null || response.getData() <= 0) throw conflict("SETTLEMENT_PAYMENT_PENDING", "付款申请等待恢复，已保存的通知将重试");
        Long paymentId = response.getData();
        reservations.locked(id, record -> {
            matchingPayment(record, paymentId);
            if (record.getPaymentRequestId() != null) {
                if (!paymentId.equals(record.getPaymentRequestId())) throw conflict("SETTLEMENT_PAYMENT_CONFLICT", "结算已有不同付款申请"); return null;
            }
            ready(record); record.setPaymentRequestId(paymentId); save(record);
            support.audit("HR_SETTLEMENT", id, "PAYMENT_CREATED", Map.of("paymentId", paymentId)); return null;
        });
    }

    public void paid(Paid input) {
        if (input == null || !Objects.equals(input.tenantId(), tenantId()) || input.settlementId() == null || input.paymentId() == null
                || input.amount() == null || input.amount().signum() <= 0 || input.paidTime() == null || input.paidTime().isAfter(HrHSupport.now())
                || !UUID.nameUUIDFromBytes((tenantId() + ":" + PAID_EVENT + ":" + input.paymentId()).getBytes(StandardCharsets.UTF_8)).toString().equals(input.eventId())) throw forbidden();
        reservations.locked(input.settlementId(), record -> {
            Payment payment = matchingPayment(record, input.paymentId());
            if (!"PAID".equals(payment.status()) || !Objects.equals(record.getPaymentRequestId(), input.paymentId())
                    || record.getNetAmount().compareTo(input.amount()) != 0) throw conflict("SETTLEMENT_NOT_PAID", "未能核实OA实际付款、绑定来源或金额");
            verifyPaidEvent(input);
            if (posted(record, input.eventId())) {
                if (!input.paidTime().equals(record.getPaidTime())) throw conflict("SETTLEMENT_PAYMENT_CONFLICT", "实际付款时间与原入账事实不一致"); return null;
            }
            ready(record);
            ObjectNode evidence = json.createObjectNode().put("kind", "PAYMENT").put("eventId", input.eventId())
                    .put("paymentId", input.paymentId().toString()).put("amount", input.amount().toPlainString()).put("paidTime", input.paidTime().toString());
            finish(record, evidence, input.paidTime(), input.paidTime().toLocalDate(), input.eventId()); return null;
        });
    }

    public HrSettlementProofService.Proof uploadProof(Long id, MultipartFile file) {
        access.permission("hr:settlement:receipt");
        return reservations.locked(id, record -> {
            access.operator(record.getEmployeeId(), "hr:settlement:receipt");
            if (record.getNetAmount().signum() >= 0) throw conflict("SETTLEMENT_RECEIPT_STATE", "只有待收款结算可以上传收款凭据");
            ready(record); return proofs.save(id, file);
        });
    }

    @Audit(name = "财务确认离职结算实际收款", spel = "#id", highRisk = true)
    public void receipt(Long id, HrSettlementRequests.Receipt input) {
        access.permission("hr:settlement:receipt"); access.validate(input);
        reservations.locked(id, record -> {
            access.operator(record.getEmployeeId(), "hr:settlement:receipt");
            if (record.getNetAmount().signum() >= 0) throw conflict("SETTLEMENT_RECEIPT_STATE", "仅负净额结算需要登记实际收款");
            proofs.requireOwned(id, input.getProofFileId());
            String key = "RECEIPT:" + tenantId() + ":" + id;
            if (posted(record, key)) {
                JsonNode original = record.getCalculationSnapshot().path("funds");
                if (!Objects.equals(record.getSettlementProofFileId(), input.getProofFileId()) || !input.getActualDate().toString().equals(original.path("actualDate").asText())) throw conflict("SETTLEMENT_RECEIPT_CONFLICT", "已收款结算不能改写原日期或凭据"); return null;
            }
            HrHSupport.version(input.getVersion(), record.getVersion()); ready(record);
            if (input.getActualDate().isBefore(record.getConfirmedTime().toLocalDate()) || input.getActualDate().isAfter(HrHSupport.today())) throw HrHException.invalid("实际收款日期须在结算确认日期至今日之间");
            LocalDateTime now = HrHSupport.now().withNano(0); record.setSettlementProofFileId(input.getProofFileId());
            ObjectNode evidence = json.createObjectNode().put("kind", "RECEIPT").put("eventId", key).put("proofFileId", input.getProofFileId().toString())
                    .put("amount", record.getNetAmount().negate().toPlainString()).put("actualDate", input.getActualDate().toString())
                    .put("confirmedBy", access.user().toString()).put("recognizedTime", now.toString());
            finish(record, evidence, now, input.getActualDate(), key); return null;
        });
    }

    public ResponseEntity<byte[]> downloadProof(Long id, Long fileId) {
        access.permission("hr:settlement:list");
        return reservations.locked(id, record -> { access.operator(record.getEmployeeId(), "hr:settlement:list"); return proofs.download(id, fileId, record.getSettlementProofFileId()); });
    }

    public void authorizeProofDownload(Long id, Long fileId) {
        access.permission("hr:settlement:list");
        reservations.locked(id, record -> {
            access.operator(record.getEmployeeId(), "hr:settlement:list");
            proofs.authorizeDownload(id, fileId, record.getSettlementProofFileId());
            return null;
        });
    }

    /** Reversal starts from independently approved, actually recognized original money, never a copied status. */
    void verifyRecognizedLocked(HrFinalSettlement record) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()
                || !Objects.equals(tenantId(), record.getTenantId())) throw forbidden();
        HrSettlementReversalPlan.requireOriginal(record);
        workflow.verifyPostedLocked(record);
        JsonNode evidence = record.getCalculationSnapshot().path("funds");
        String key = evidence.path("eventId").asText();
        if (!posted(record, key)) throw conflict("SETTLEMENT_NOT_PAID", "原结算尚未实际收付");
        Map<String, Object> audit = support.auditDetail("HR_SETTLEMENT", record.getSettlementId(), "FUNDS_RECOGNIZED");
        if (!key.equals(audit.get("eventId")) || !evidence.path("kind").asText().equals(audit.get("direction"))
                || !evidence.path("amount").asText().equals(audit.get("amount"))) throw conflict("SETTLEMENT_PAYMENT_EVIDENCE_MISSING", "原结算缺少一致的实际收付审计");
        if (record.getNetAmount().signum() > 0) {
            Payment payment = matchingPayment(record, record.getPaymentRequestId());
            if (!"PAID".equals(payment.status()) || !record.getPaidTime().toString().equals(evidence.path("paidTime").asText())) throw conflict("SETTLEMENT_NOT_PAID", "无法核实原OA实际付款");
            verifyPaidEvent(new Paid(tenantId(), record.getSettlementId(), record.getPaymentRequestId(), record.getNetAmount(), record.getPaidTime(), key));
        } else if (record.getNetAmount().signum() < 0) {
            if (!("RECEIPT:" + tenantId() + ":" + record.getSettlementId()).equals(key)
                    || !record.getPaidTime().toString().equals(evidence.path("recognizedTime").asText())) throw conflict("SETTLEMENT_RECEIPT_CONFLICT", "原结算收款事件或确认时间不一致");
            proofs.verifyPosted(record.getSettlementId(), record.getSettlementProofFileId(), HrHSupport.number(evidence.path("confirmedBy").asText()));
        } else if (!("NETTING:" + tenantId() + ":" + record.getSettlementId()).equals(key)
                || !record.getPaidTime().toString().equals(evidence.path("recognizedTime").asText())
                || !record.getConfirmedBy().toString().equals(evidence.path("confirmedBy").asText())) throw conflict("SETTLEMENT_FUNDS_CONFLICT", "原结算抵销事实不一致");
    }

    private void ready(HrFinalSettlement record) {
        if (!List.of("NORMAL", "REVERSAL").contains(String.valueOf(record.getSettlementKind())) || !Integer.valueOf(0).equals(record.getSupersededFlag())
                || !"CONFIRMED".equals(record.getStatus()) || !"APPROVED".equals(record.getApprovalStatus())
                || record.getConfirmedTime() == null || record.getConfirmedBy() == null || record.getPaidTime() != null
                || !"FROZEN".equals(record.getCalculationSnapshot().path("reservation").path("state").asText())) throw conflict("SETTLEMENT_FUNDS_STATE", "结算尚未确认或已经入账，须核对原记录");
        JsonNode confirmed = record.getCalculationSnapshot().path("confirmation");
        if (!record.getConfirmedBy().toString().equals(confirmed.path("by").asText())
                || !record.getConfirmedTime().toString().equals(confirmed.path("time").asText())
                || record.getNetAmount().compareTo(confirmedAmount(confirmed)) != 0) throw conflict("SETTLEMENT_CONFIRMATION_CHANGED", "结算确认依据已变化");
        workflow.verifyApprovedLocked(record);
        if ("REVERSAL".equals(record.getSettlementKind())) {
            reversals.verifyFrozenLocked(record);
            reversals.verifyRestorableLocked(record);
            verifyRecognizedLocked(reversals.verifyLocked(record).original());
        }
    }

    private static BigDecimal confirmedAmount(JsonNode confirmed) {
        try { return HrSettlementCalculation.signedMoney(new BigDecimal(confirmed.path("netAmount").asText())); }
        catch (IllegalArgumentException invalid) { throw conflict("SETTLEMENT_CONFIRMATION_CHANGED", "结算确认金额依据无效，请核对原记录"); }
    }

    private boolean posted(HrFinalSettlement record, String eventId) {
        if (record.getPaidTime() == null) return false;
        if (!List.of("PAID", "CLOSED").contains(record.getStatus()) || !eventId.equals(record.getCalculationSnapshot().path("funds").path("eventId").asText())
                || !"POSTED".equals(record.getCalculationSnapshot().path("reservation").path("state").asText())) throw conflict("SETTLEMENT_FUNDS_CONFLICT", "结算已有不同收付事实");
        return true;
    }
    private void finish(HrFinalSettlement record, ObjectNode evidence, LocalDateTime time, java.time.LocalDate actualDate, String key) {
        ObjectNode calculation = ((ObjectNode) record.getCalculationSnapshot()).deepCopy(); calculation.set("funds", evidence); record.setCalculationSnapshot(calculation);
        if ("REVERSAL".equals(record.getSettlementKind())) reversals.postLocked(record, time, actualDate, key);
        else posting.postLocked(record, time, actualDate, key);
        save(record);
        support.audit("HR_SETTLEMENT", record.getSettlementId(), "FUNDS_RECOGNIZED", Map.of("eventId", key, "direction", evidence.path("kind").asText(), "amount", evidence.path("amount").asText()));
    }
    private Payment matchingPayment(HrFinalSettlement record, Long paymentId) {
        Payment source = funds.payment(tenantId(), paymentId); JsonNode confirmed = record.getCalculationSnapshot().path("confirmation");
        if (source == null || !Integer.valueOf(0).equals(source.deleted()) || !"HR_SETTLEMENT".equals(source.sourceBizType())
                || !record.getSettlementId().toString().equals(source.sourceBizId()) || !Objects.equals(source.userId(), HrHSupport.number(confirmed.path("employeeUserId").asText()))
                || !Objects.equals(source.payeeName(), confirmed.path("employeeName").asText()) || source.amount() == null
                || record.getNetAmount().compareTo(source.amount()) != 0 || !List.of("APPROVED", "PAID").contains(source.status())) throw conflict("SETTLEMENT_PAYMENT_CONFLICT", "无法核对同租户真实结算付款申请"); return source;
    }
    private void verifyPaidEvent(Paid input) {
        String persisted = funds.paymentEvent(tenantId(), input.eventId(), input.paymentId());
        if (persisted == null) throw conflict("SETTLEMENT_PAYMENT_EVIDENCE_MISSING", "缺少OA实际付款时保存的原始事件");
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelopeCodec.read(persisted, json); Paid original = json.readValue(envelope.getPayload(), Paid.class);
            if (!Objects.equals(envelope.getTenantId(), tenantId()) || !Objects.equals(envelope.getSourceId(), input.paymentId())
                    || !PAID_EVENT.equals(envelope.getEventType()) || !"cloudflow-oa".equals(envelope.getSourceModule())
                    || !Objects.equals(envelope.getEventId(), input.eventId()) || !json.valueToTree(original).equals(json.valueToTree(input))) throw forbidden();
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw conflict("SETTLEMENT_PAYMENT_EVIDENCE_INVALID", "实际付款事件无法核实"); }
    }
    private HrFinalSettlement find(Long id) { HrFinalSettlement record = id == null ? null : settlements.selectById(id); if (record == null || !Objects.equals(tenantId(), record.getTenantId())) throw forbidden(); return record; }
    private void save(HrFinalSettlement record) {
        int version = record.getVersion(); record.setUpdateBy(HrRuleSupport.userName()); record.setUpdateTime(HrHSupport.now());
        if (version == Integer.MAX_VALUE || funds.saveFunds(record, version) != 1) throw conflict("VERSION_CONFLICT", "结算收付状态已变化，请读取原单核对"); record.setVersion(version + 1);
    }
    public record Paid(Long tenantId, Long settlementId, Long paymentId, BigDecimal amount,
            @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime paidTime, String eventId) { }
}
