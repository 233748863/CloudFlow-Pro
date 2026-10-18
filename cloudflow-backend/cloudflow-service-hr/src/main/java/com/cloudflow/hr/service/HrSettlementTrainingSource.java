package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.domain.entity.HrFinalSettlementItem;
import com.cloudflow.hr.domain.entity.HrTrainingRecovery;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrFinalSettlementItemMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import com.cloudflow.hr.mapper.HrTrainingRecoveryMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** Read-only reconciliation of assessed agreements and actually posted settlement collections. */
@Service
@RequiredArgsConstructor
public class HrSettlementTrainingSource {
    private static final String SOURCE = "HR_TRAINING_RECOVERY";
    private final HrTrainingRecoveryMapper recoveries;
    private final HrFinalSettlementMapper settlements;
    private final HrFinalSettlementItemMapper items;
    private final HrFileStorage storage;
    private final HrHSupport access;
    private final ObjectMapper json;

    public record Issue(Long recoveryId, String code, String message) { }
    public record Recovery(Long recoveryId, Integer version, String amount, JsonNode evidence) { }
    public record Inspection(List<Recovery> recoveries, List<Issue> issues) {
        public Inspection { recoveries = List.copyOf(recoveries); issues = List.copyOf(issues); }
    }

    public Inspection inspect(Long employeeId, Long settlementId) {
        access.permission("hr:settlement:calculate"); access.scope(employeeId);
        if (settlementId != null && settlementId <= 0) throw HrHException.invalid("结算单编号无效");
        List<Recovery> sources = new ArrayList<>(); List<Issue> issues = new ArrayList<>();
        List<HrTrainingRecovery> rows = recoveries.selectList(new LambdaQueryWrapper<HrTrainingRecovery>()
                .eq(HrTrainingRecovery::getTenantId, HrRuleSupport.tenantId()).eq(HrTrainingRecovery::getEmployeeId, employeeId)
                .orderByAsc(HrTrainingRecovery::getRecoveryId));
        for (HrTrainingRecovery row : rows) {
            try {
                BigDecimal assessed = HrAdvanceAmounts.nonnegative(row.getAssessedAmount());
                BigDecimal collected = HrAdvanceAmounts.nonnegative(row.getCollectedAmount());
                if (collected.compareTo(assessed) > 0) throw new IllegalArgumentException();
                ArrayNode postings = collections(row, collected);
                if ("VOID".equals(row.getStatus()) && collected.signum() == 0 && row.getSettlementId() == null) continue;
                if (!List.of("CONFIRMED", "CLEARED").contains(String.valueOf(row.getStatus()))
                        || row.getConfirmedBy() == null || row.getConfirmedBy() <= 0 || row.getConfirmedTime() == null
                        || row.getConfirmedTime().isAfter(HrHSupport.now()) || row.getVersion() == null || row.getVersion() < 0
                        || row.getAssessmentReason() == null || row.getAssessmentReason().isBlank()) {
                    throw conflict("SETTLEMENT_TRAINING_UNCONFIRMED", "培训追偿缺少有效核定记录，请先完成核定或作废");
                }
                BigDecimal due = assessed.subtract(collected);
                if ("CLEARED".equals(row.getStatus())) {
                    if (due.signum() != 0) throw conflict("SETTLEMENT_TRAINING_BALANCE_INVALID", "已结清培训追偿仍有未收金额，请先核对入账记录");
                    continue;
                }
                if (row.getSettlementId() != null && !Objects.equals(row.getSettlementId(), settlementId)) {
                    throw conflict("SETTLEMENT_TRAINING_RESERVED", "培训追偿已被其他结算占用");
                }
                HrTrainingRecoveryMapper.Source enrollment = recoveries.source(HrRuleSupport.tenantId(), row.getEnrollmentId());
                if (enrollment == null || !"APPROVED".equals(enrollment.status()) || !Objects.equals(enrollment.employeeId(), employeeId)
                        || enrollment.version() == null || enrollment.version() < 0) {
                    throw conflict("SETTLEMENT_TRAINING_SOURCE_INVALID", "培训报名来源已失效或所属员工不一致");
                }
                HrTrainingRecoveryMapper.AgreementFile agreement = recoveries.readAgreement(HrRuleSupport.tenantId(), row.getAgreementFileId());
                if (agreement == null || !SOURCE.equals(agreement.bizType()) || !Objects.equals(agreement.bizId(), row.getRecoveryId())
                        || agreement.fileSize() == null || agreement.fileSize() <= 0 || agreement.fileSize() > 10L * 1024 * 1024
                        || agreement.fileHash() == null || !agreement.fileHash().matches("[a-f0-9]{64}")) {
                    throw conflict("SETTLEMENT_TRAINING_AGREEMENT_INVALID", "培训追偿缺少有效且正确绑定的私有协议");
                }
                byte[] bytes = storage.loadPrivate(agreement.fileId(), "HR_TRAINING_AGREEMENT");
                if (bytes.length != agreement.fileSize() || !hash(bytes).equals(agreement.fileHash())) {
                    throw conflict("SETTLEMENT_TRAINING_AGREEMENT_CHANGED", "培训协议内容已变化，请重新核实核定依据");
                }
                ObjectNode evidence = json.createObjectNode();
                evidence.put("recoveryId", row.getRecoveryId().toString()); evidence.put("version", row.getVersion());
                evidence.put("employeeId", employeeId.toString()); evidence.put("enrollmentId", row.getEnrollmentId().toString());
                evidence.put("enrollmentVersion", enrollment.version()); evidence.put("sessionId", enrollment.sessionId().toString());
                evidence.put("agreementFileId", agreement.fileId().toString()); evidence.put("agreementHash", agreement.fileHash());
                evidence.put("agreementSize", agreement.fileSize()); evidence.put("assessedAmount", assessed.toPlainString());
                evidence.put("collectedAmount", collected.toPlainString()); evidence.put("receivableAmount", due.toPlainString());
                evidence.put("assessmentReason", row.getAssessmentReason()); evidence.put("confirmedBy", row.getConfirmedBy().toString());
                evidence.put("confirmedTime", row.getConfirmedTime().toString()); evidence.set("collectionPostings", postings);
                if (row.getSettlementId() != null) evidence.put("settlementId", row.getSettlementId().toString());
                sources.add(new Recovery(row.getRecoveryId(), row.getVersion(), due.toPlainString(), evidence));
            } catch (HrHException invalid) {
                issues.add(new Issue(row.getRecoveryId(), invalid.getCode(), invalid.getMessage()));
            } catch (HrBusinessException invalid) {
                issues.add(new Issue(row.getRecoveryId(), "SETTLEMENT_TRAINING_FILE_UNAVAILABLE", "培训协议暂不可读取，请核实文件后重算"));
            } catch (IllegalArgumentException invalid) {
                issues.add(new Issue(row.getRecoveryId(), "SETTLEMENT_TRAINING_AMOUNT_INVALID", "培训核定或已收金额缺失、超出容量或不一致"));
            }
        }
        return new Inspection(sources, issues);
    }

    private ArrayNode collections(HrTrainingRecovery row, BigDecimal collected) {
        List<HrFinalSettlementItem> posted = items.selectList(new LambdaQueryWrapper<HrFinalSettlementItem>()
                .eq(HrFinalSettlementItem::getTenantId, HrRuleSupport.tenantId()).eq(HrFinalSettlementItem::getSourceBizType, SOURCE)
                .eq(HrFinalSettlementItem::getSourceBizId, row.getRecoveryId().toString()).eq(HrFinalSettlementItem::getSourcePostedFlag, 1)
                .orderByAsc(HrFinalSettlementItem::getItemId));
        Map<Long, HrFinalSettlementItem> bySettlement = new LinkedHashMap<>();
        Map<Long, HrFinalSettlement> parents = new LinkedHashMap<>();
        for (HrFinalSettlementItem item : posted) {
            HrFinalSettlement parent = settlements.selectOne(new LambdaQueryWrapper<HrFinalSettlement>()
                    .eq(HrFinalSettlement::getTenantId, HrRuleSupport.tenantId()).eq(HrFinalSettlement::getSettlementId, item.getSettlementId()));
            if (parent == null || !Objects.equals(parent.getEmployeeId(), row.getEmployeeId())
                    || !List.of("PAID", "CLOSED").contains(String.valueOf(parent.getStatus())) || !"APPROVED".equals(parent.getApprovalStatus())
                    || parent.getPaidTime() == null || parent.getPaidTime().isAfter(HrHSupport.now())
                    || parent.getConfirmedBy() == null || parent.getConfirmedTime() == null
                    || !Integer.valueOf(1).equals(item.getConfirmedFlag()) || !"RECEIVABLE".equals(item.getItemType())
                    || bySettlement.putIfAbsent(parent.getSettlementId(), item) != null) {
                throw conflict("SETTLEMENT_TRAINING_COLLECTION_INVALID", "培训已收金额缺少同员工实际入账的结算明细");
            }
            parents.put(parent.getSettlementId(), parent);
        }
        BigDecimal sum = BigDecimal.ZERO; ArrayNode evidence = json.createArrayNode();
        for (HrFinalSettlementItem item : posted) {
            HrFinalSettlement parent = parents.get(item.getSettlementId());
            BigDecimal amount = HrSettlementCalculation.signedMoney(item.getAmount());
            if ("NORMAL".equals(parent.getSettlementKind())) {
                if (parent.getReversalOfId() != null || amount.signum() < 0) throw invalidCollection();
                long reversals = parents.values().stream().filter(candidate -> "REVERSAL".equals(candidate.getSettlementKind())
                        && Objects.equals(candidate.getReversalOfId(), parent.getSettlementId())).count();
                if (!(Integer.valueOf(0).equals(parent.getSupersededFlag()) && reversals == 0)
                        && !(Integer.valueOf(1).equals(parent.getSupersededFlag()) && reversals == 1)) throw invalidCollection();
            } else if ("REVERSAL".equals(parent.getSettlementKind())) {
                HrFinalSettlementItem original = bySettlement.get(parent.getReversalOfId());
                HrFinalSettlement originalParent = parents.get(parent.getReversalOfId());
                if (original == null || originalParent == null || !"NORMAL".equals(originalParent.getSettlementKind())
                        || !Integer.valueOf(1).equals(originalParent.getSupersededFlag())
                        || parent.getPaidTime().isBefore(originalParent.getPaidTime()) || amount.compareTo(original.getAmount().negate()) != 0) throw invalidCollection();
            } else throw invalidCollection();
            sum = sum.add(amount);
            ObjectNode entry = evidence.addObject(); entry.put("itemId", item.getItemId().toString());
            entry.put("settlementId", parent.getSettlementId().toString()); entry.put("kind", parent.getSettlementKind());
            entry.put("amount", amount.toPlainString()); entry.put("paidTime", parent.getPaidTime().toString());
            if (parent.getReversalOfId() != null) entry.put("reversalOfId", parent.getReversalOfId().toString());
        }
        if (sum.compareTo(collected) != 0) throw conflict("SETTLEMENT_TRAINING_COLLECTION_MISMATCH", "培训已收金额与实际结算入账明细不一致");
        return evidence;
    }

    void verifyCollectionsLocked(HrTrainingRecovery row) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()
                || row == null || !Objects.equals(HrRuleSupport.tenantId(), row.getTenantId())) throw invalidCollection();
        collections(row, HrAdvanceAmounts.nonnegative(row.getCollectedAmount()));
    }

    private static HrHException invalidCollection() { return conflict("SETTLEMENT_TRAINING_COLLECTION_INVALID", "培训追偿收款或冲正来源不一致"); }
    private static HrHException conflict(String code, String message) { return HrHException.conflict(code, message); }
    private static String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException("SHA-256 unavailable", impossible); }
    }
}
