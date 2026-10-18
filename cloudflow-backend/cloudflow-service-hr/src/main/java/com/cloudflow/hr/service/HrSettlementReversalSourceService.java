package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.domain.entity.HrFinalSettlementItem;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.domain.entity.HrTrainingRecovery;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementItemMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.mapper.HrTrainingRecoveryMapper;
import com.cloudflow.hr.service.impl.HrEssServiceImpl;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

/** Internal source restoration. The caller separately verifies independent approval and both actual money facts. */
@Service
@RequiredArgsConstructor
public class HrSettlementReversalSourceService {
    private static final Set<String> RESERVED_TYPES = Set.of("HR_SALARY_SLIP", "HR_ADVANCE", "HR_LEAVE_QUOTA", "HR_TRAINING_RECOVERY");
    private final HrFinalSettlementMapper settlements;
    private final HrFinalSettlementItemMapper items;
    private final HrSalarySlipMapper salaries;
    private final HrEmployeeAdvanceMapper advances;
    private final HrTrainingRecoveryMapper training;
    private final HrAdvanceLedgerService ledger;
    private final HrAdvancePayrollService payroll;
    private final HrLeaveBusinessService leave;
    private final HrSettlementTrainingSource trainingSource;
    private final HrEssServiceImpl salaryIntegrity;
    private final HrRuleSupport support;
    private final ObjectMapper json;

    record Sources(HrFinalSettlement original, List<HrFinalSettlementItem> reverseItems, ObjectNode reservation) { }

    /** Employee and all source locks are held by the enclosing reservation transaction. */
    Sources verifyLocked(HrFinalSettlement reverse) {
        if (!TransactionSynchronizationManager.isActualTransactionActive() || reverse == null || !Objects.equals(tenantId(), reverse.getTenantId())
                || !"REVERSAL".equals(reverse.getSettlementKind()) || !Integer.valueOf(0).equals(reverse.getSupersededFlag())
                || reverse.getSettlementId() == null || reverse.getReversalOfId() == null || reverse.getSettlementId().equals(reverse.getReversalOfId())
                || settlements.lock(tenantId(), reverse.getReversalOfId()) == null) throw changed();
        HrFinalSettlement original = settlements.selectById(reverse.getReversalOfId());
        if (original == null || !Objects.equals(tenantId(), original.getTenantId())) throw changed();
        List<HrFinalSettlementItem> originals = details(original.getSettlementId());
        HrSettlementReversalPlan.Plan plan = HrSettlementReversalPlan.create(original, originals, reverse.getRemark(), json);
        JsonNode expected = json.valueToTree(plan.settlement()), current = json.valueToTree(reverse);
        for (String field : List.of("tenantId", "employeeId", "lifecycleApplicationId", "settlementKind", "reversalOfId", "supersededFlag",
                "joinDate", "relievingDate", "workYears", "ruleId", "totalPayable", "totalReceivable", "severanceAmount", "assetRecoveryCost", "netAmount", "remark")) {
            if (!same(expected.path(field), current.path(field))) throw changed();
        }
        JsonNode calculation = reverse.getCalculationSnapshot();
        if (calculation == null || !calculation.path("calculated").asBoolean(false) || !calculation.path("missingRequirements").isArray()
                || !calculation.path("missingRequirements").isEmpty()) throw changed();
        JsonNode reversal = calculation.path("reversal"), frozenOriginal = reversal.path("original");
        if (!original.getSettlementId().toString().equals(reversal.path("originalSettlementId").asText())
                || "CLOSED".equals(frozenOriginal.path("status").asText()) && !"CLOSED".equals(original.getStatus())
                || !original.getSettlementNo().equals(reversal.path("originalSettlementNo").asText()) || !reverse.getRemark().equals(reversal.path("reason").asText())
                || !reversal.path("originalVersion").isIntegralNumber() || reversal.path("originalVersion").intValue() < 0
                || reversal.path("originalVersion").intValue() > original.getVersion()
                || !reversal.path("originalVersion").equals(frozenOriginal.path("version"))
                || !same(stableOriginal(frozenOriginal), stableOriginal(json.valueToTree(original)))) throw changed();
        List<HrFinalSettlementItem> active = originals.stream().filter(item -> item.getSourceSnapshot().path("active").asBoolean(false)).toList();
        if (!same(reversal.path("items"), json.valueToTree(active))) throw changed();
        for (String field : List.of("sampling", "compensation", "rounding")) {
            if (!same(calculation.path(field), original.getCalculationSnapshot().path(field))) throw changed();
        }
        List<HrFinalSettlementItem> reverseItems = details(reverse.getSettlementId());
        if (reverseItems.size() != plan.items().size()) throw changed();
        Map<String, HrFinalSettlementItem> bySource = new LinkedHashMap<>();
        for (HrFinalSettlementItem item : reverseItems) {
            if (!Integer.valueOf(0).equals(item.getSourcePostedFlag()) || bySource.putIfAbsent(key(item), item) != null) throw changed();
        }
        for (HrFinalSettlementItem expectedItem : plan.items()) {
            HrFinalSettlementItem actual = bySource.get(key(expectedItem));
            if (actual == null) throw changed();
            JsonNode wanted = json.valueToTree(expectedItem), found = json.valueToTree(actual);
            for (String field : List.of("tenantId", "itemType", "itemName", "sourceBizType", "sourceBizId", "sourceSnapshot", "amount", "confirmedFlag")) {
                if (!same(wanted.path(field), found.path(field))) throw changed();
            }
        }
        ObjectNode reservation = object(original.getCalculationSnapshot().path("reservation"));
        Set<String> reserved = new HashSet<>();
        for (HrFinalSettlementItem item : active) if (RESERVED_TYPES.contains(item.getSourceBizType())) {
            reserved.add(key(item)); JsonNode source = reservation.path("sources").path(key(item));
            if (!item.getSourceBizType().equals(source.path("type").asText()) || !item.getSourceBizId().equals(source.path("id").asText())
                    || !item.getItemType().equals(source.path("itemType").asText()) || !source.path("evidence").isObject()
                    || source.has("amount") && item.getAmount().compareTo(money(source.path("amount"))) != 0) throw changed();
        }
        if (reserved.size() != reservation.path("sources").size()) throw changed();
        return new Sources(original, List.copyOf(reverseItems), reservation);
    }

    void verifyReadyLocked(HrFinalSettlement reverse, boolean approved) {
        if (reverse == null || !"DRAFT".equals(reverse.getStatus()) || reverse.getConfirmedTime() != null || reverse.getConfirmedBy() != null
                || reverse.getPaidTime() != null || reverse.getPaymentRequestId() != null || reverse.getSettlementProofFileId() != null
                || !(approved ? "APPROVED".equals(reverse.getApprovalStatus()) : Set.of("DRAFT", "REJECTED", "CANCELLED").contains(String.valueOf(reverse.getApprovalStatus())))) throw changed();
        verifyRestorableLocked(reverse);
    }

    /** Read-only validation using the same source rules as posting, before initiating reverse money. */
    void verifyRestorableLocked(HrFinalSettlement reverse) {
        restoreSources(verifyLocked(reverse), reverse, HrHSupport.today(), false);
    }

    void freezeLocked(HrFinalSettlement reverse) {
        verifyReadyLocked(reverse, false);
        ObjectNode calculation = object(reverse.getCalculationSnapshot()); JsonNode previous = calculation.path("reservation");
        if (!previous.isMissingNode() && !"RELEASED".equals(previous.path("state").asText())) throw changed();
        if (!previous.isMissingNode()) {
            com.fasterxml.jackson.databind.node.ArrayNode history = calculation.path("reservationHistory") instanceof com.fasterxml.jackson.databind.node.ArrayNode values
                    ? values.deepCopy() : json.createArrayNode();
            history.add(previous.deepCopy()); calculation.set("reservationHistory", history);
        }
        ObjectNode reservation = calculation.putObject("reservation");
        reservation.put("state", "FROZEN").put("revision", reverse.getVersion()).put("originalSettlementId", reverse.getReversalOfId().toString())
                .put("frozenTime", HrHSupport.now().toString()); reservation.putObject("sources");
        reverse.setCalculationSnapshot(calculation);
        support.audit("HR_SETTLEMENT", reverse.getSettlementId(), "REVERSAL_HELD", Map.of("originalSettlementId", reverse.getReversalOfId()));
    }

    void verifyFrozenLocked(HrFinalSettlement reverse) {
        verifyLocked(reverse);
        JsonNode reservation = reverse.getCalculationSnapshot().path("reservation");
        if (!"FROZEN".equals(reservation.path("state").asText()) || !reverse.getReversalOfId().toString().equals(reservation.path("originalSettlementId").asText())
                || !reservation.path("sources").isObject() || !reservation.path("sources").isEmpty()) throw changed();
    }

    /** Cancelling reversal approval never releases sources owned by the already paid original settlement. */
    void releaseLocked(HrFinalSettlement reverse) {
        if (!TransactionSynchronizationManager.isActualTransactionActive() || reverse == null || !Objects.equals(tenantId(), reverse.getTenantId())
                || !"REVERSAL".equals(reverse.getSettlementKind()) || !"DRAFT".equals(reverse.getStatus())
                || reverse.getReversalOfId() == null || reverse.getPaidTime() != null || reverse.getConfirmedTime() != null) throw changed();
        ObjectNode calculation = object(reverse.getCalculationSnapshot()); ObjectNode reservation = object(calculation.path("reservation"));
        if (!reverse.getReversalOfId().toString().equals(reservation.path("originalSettlementId").asText())
                || !reservation.path("sources").isObject() || !reservation.path("sources").isEmpty()) throw changed();
        if ("RELEASED".equals(reservation.path("state").asText())) return;
        if (!"FROZEN".equals(reservation.path("state").asText())) throw changed();
        reservation.put("state", "RELEASED").put("releasedTime", HrHSupport.now().toString()); calculation.set("reservation", reservation);
        reverse.setCalculationSnapshot(calculation);
        support.audit("HR_SETTLEMENT", reverse.getSettlementId(), "REVERSAL_RELEASED", Map.of("originalSettlementId", reverse.getReversalOfId(), "originalSourcesRetained", true));
    }

    static String submissionPermission(HrFinalSettlement record) {
        return switch (String.valueOf(record.getSettlementKind())) {
            case "NORMAL" -> "hr:settlement:submit";
            case "REVERSAL" -> "hr:settlement:reverse";
            default -> throw changed();
        };
    }

    /** Called after real reverse payment/receipt/netting is verified; everything, including superseding, commits together. */
    void postLocked(HrFinalSettlement reverse, LocalDateTime recognizedTime, LocalDate fundsDate, String fundsEvent) {
        if (reverse == null || !"CONFIRMED".equals(reverse.getStatus()) || !"APPROVED".equals(reverse.getApprovalStatus())
                || reverse.getConfirmedTime() == null || reverse.getConfirmedBy() == null || reverse.getPaidTime() != null
                || recognizedTime == null || recognizedTime.isAfter(HrHSupport.now()) || recognizedTime.isBefore(reverse.getConfirmedTime())
                || fundsDate == null || fundsDate.isAfter(HrHSupport.today()) || fundsDate.isBefore(reverse.getConfirmedTime().toLocalDate())
                || fundsEvent == null || fundsEvent.isBlank()) throw changed();
        Sources source = verifyLocked(reverse); HrFinalSettlement original = source.original();
        if (recognizedTime.isBefore(original.getPaidTime()) || fundsDate.isBefore(original.getPaidTime().toLocalDate())) throw changed();
        ObjectNode calculation = object(reverse.getCalculationSnapshot()); ObjectNode reserved = object(calculation.path("reservation"));
        if (!"FROZEN".equals(reserved.path("state").asText()) || !original.getSettlementId().toString().equals(reserved.path("originalSettlementId").asText())) throw changed();
        restoreSources(source, reverse, fundsDate, true);
        original.setSupersededFlag(1); original.setUpdateBy(HrRuleSupport.userName()); original.setUpdateTime(HrHSupport.now());
        if (settlements.updateById(original) != 1) throw changed();
        reserved.put("state", "POSTED").put("postedTime", recognizedTime.toString()).put("fundsEvent", fundsEvent);
        calculation.set("reservation", reserved); reverse.setCalculationSnapshot(calculation); reverse.setPaidTime(recognizedTime); reverse.setStatus("PAID");
        support.audit("HR_SETTLEMENT", reverse.getSettlementId(), "SOURCES_REVERSED", Map.of("originalSettlementId", original.getSettlementId(),
                "items", source.reverseItems().size(), "fundsEvent", fundsEvent, "recognizedTime", recognizedTime.toString()));
        support.audit("HR_SETTLEMENT", original.getSettlementId(), "SUPERSEDED", Map.of("reversalSettlementId", reverse.getSettlementId(), "fundsEvent", fundsEvent));
    }

    private void restoreSources(Sources source, HrFinalSettlement reverse, LocalDate fundsDate, boolean apply) {
        HrFinalSettlement original = source.original();
        for (HrFinalSettlementItem item : source.reverseItems()) if ("HR_SALARY_SLIP".equals(item.getSourceBizType())) {
            JsonNode facts = facts(source, item); HrSalarySlip salary = salaries.selectById(id(item.getSourceBizId()));
            if (salary == null || !Objects.equals(tenantId(), salary.getTenantId()) || !Objects.equals(original.getEmployeeId(), salary.getEmployeeId())
                    || !Objects.equals(original.getSettlementId(), salary.getReservedSettlementId()) || !"PAID".equals(salary.getStatus())
                    || !nextVersion(facts.path("version"), salary.getVersion()) || !Objects.equals(salary.getDigestSha256(), facts.path("digestSha256").asText())
                    || salary.getGrossTotal().compareTo(money(facts.path("grossTotal"))) != 0 || salary.getDeductionTotal().compareTo(money(facts.path("deductionTotal"))) != 0
                    || salary.getNetTotal().compareTo(money(facts.path("netTotal"))) != 0 || !same(json.valueToTree(salary.getComponents()), facts.path("components"))) throw changed();
            salaryIntegrity.verifySalarySlip(salary);
            payroll.restoreSettlementLocked(salary, original.getSettlementId(), reverse.getSettlementId(), facts.path("status").asText(),
                    originalRepayments(source.reservation(), salary.getId()), fundsDate, apply);
        }
        for (HrFinalSettlementItem item : source.reverseItems()) {
            switch (item.getSourceBizType()) {
                case "HR_SALARY_SLIP", "HR_SEVERANCE", "OA_ASSET" -> { }
                case "HR_ADVANCE" -> {
                    HrEmployeeAdvance advance = advances.lockAdvance(tenantId(), id(item.getSourceBizId()));
                    if (advance == null || !Objects.equals(original.getEmployeeId(), advance.getEmployeeId())) throw changed();
                    ledger.reverseSettlementLocked(advance, original.getSettlementId(), reverse.getSettlementId(), item.getAmount().negate(), fundsDate, apply);
                }
                case "HR_LEAVE_QUOTA" -> {
                    JsonNode facts = facts(source, item);
                    leave.reverseSettlementLocked(original.getSettlementId(), source.reservation().path("revision").intValue(), reverse.getSettlementId(),
                            original.getEmployeeId(), id(facts.path("leaveTypeId").asText()), id(facts.path("periodId").asText()), money(facts.path("available")), facts.path("unit").asText(), apply);
                }
                case "HR_TRAINING_RECOVERY" -> restoreTraining(source, reverse, item, apply);
                default -> throw changed();
            }
            if (!apply) continue;
            item.setSourcePostedFlag(1); item.setUpdateBy(HrRuleSupport.userName()); item.setUpdateTime(HrHSupport.now());
            if (items.updateById(item) != 1) throw changed();
        }
    }

    private void restoreTraining(Sources source, HrFinalSettlement reverse, HrFinalSettlementItem item, boolean apply) {
        JsonNode facts = facts(source, item); HrTrainingRecovery recovery = training.selectById(id(item.getSourceBizId()));
        if (recovery == null || !Objects.equals(tenantId(), recovery.getTenantId()) || !Objects.equals(source.original().getEmployeeId(), recovery.getEmployeeId())
                || !Objects.equals(source.original().getSettlementId(), recovery.getSettlementId()) || !"CLEARED".equals(recovery.getStatus())
                || !nextVersion(facts.path("version"), recovery.getVersion()) || !recovery.getEnrollmentId().toString().equals(facts.path("enrollmentId").asText())
                || !recovery.getAgreementFileId().toString().equals(facts.path("agreementFileId").asText())
                || !Objects.equals(recovery.getAssessmentReason(), facts.path("assessmentReason").asText())
                || !recovery.getConfirmedBy().toString().equals(facts.path("confirmedBy").asText()) || !recovery.getConfirmedTime().toString().equals(facts.path("confirmedTime").asText())
                || recovery.getAssessedAmount().compareTo(money(facts.path("assessedAmount"))) != 0
                || recovery.getCollectedAmount().compareTo(recovery.getAssessedAmount()) != 0
                || recovery.getCollectedAmount().add(item.getAmount()).compareTo(money(facts.path("collectedAmount"))) != 0) throw changed();
        trainingSource.verifyCollectionsLocked(recovery);
        BigDecimal restored = HrAdvanceAmounts.nonnegative(money(facts.path("collectedAmount")));
        if (!apply) return;
        if (training.update(null, new LambdaUpdateWrapper<HrTrainingRecovery>().eq(HrTrainingRecovery::getTenantId, tenantId())
                .eq(HrTrainingRecovery::getRecoveryId, recovery.getRecoveryId()).eq(HrTrainingRecovery::getEmployeeId, recovery.getEmployeeId())
                .eq(HrTrainingRecovery::getSettlementId, source.original().getSettlementId()).eq(HrTrainingRecovery::getStatus, "CLEARED")
                .eq(HrTrainingRecovery::getVersion, recovery.getVersion()).set(HrTrainingRecovery::getCollectedAmount, restored)
                .set(HrTrainingRecovery::getStatus, "CONFIRMED").set(HrTrainingRecovery::getSettlementId, null)
                .set(HrTrainingRecovery::getUpdateBy, HrRuleSupport.userName()).set(HrTrainingRecovery::getUpdateTime, HrHSupport.now()).setSql("version = version + 1")) != 1) throw changed();
        support.audit("HR_SETTLEMENT", reverse.getSettlementId(), "TRAINING_RETURNED", Map.of("originalSettlementId", source.original().getSettlementId(),
                "recoveryId", recovery.getRecoveryId(), "amount", item.getAmount().toPlainString(), "collected", restored.toPlainString()));
    }

    private Map<Long, Long> originalRepayments(ObjectNode reservation, Long salaryId) {
        Map<Long, Long> result = new LinkedHashMap<>();
        for (JsonNode source : reservation.path("sources")) if ("HR_ADVANCE".equals(source.path("type").asText())) {
            for (JsonNode entry : source.path("evidence").path("reservations")) if ("SALARY".equals(entry.path("type").asText())
                    && salaryId.toString().equals(entry.path("salarySlipId").asText())) {
                if (!"RESERVED".equals(entry.path("status").asText()) || result.putIfAbsent(id(source.path("id").asText()), id(entry.path("repaymentId").asText())) != null) throw changed();
            }
        }
        return result;
    }

    private List<HrFinalSettlementItem> details(Long settlementId) {
        return items.selectList(new LambdaQueryWrapper<HrFinalSettlementItem>().eq(HrFinalSettlementItem::getTenantId, tenantId())
                .eq(HrFinalSettlementItem::getSettlementId, settlementId).orderByAsc(HrFinalSettlementItem::getItemId));
    }
    private static JsonNode facts(Sources source, HrFinalSettlementItem item) { return source.reservation().path("sources").path(key(item)).path("evidence"); }
    private static String key(HrFinalSettlementItem item) { return item.getSourceBizType() + ":" + item.getSourceBizId(); }
    private static ObjectNode stableOriginal(JsonNode value) {
        ObjectNode result = object(value); result.remove(List.of("status", "version", "updateBy", "updateTime"));
        ObjectNode calculation = object(result.path("calculationSnapshot")); calculation.remove("closure"); result.set("calculationSnapshot", calculation); return result;
    }
    private static boolean nextVersion(JsonNode frozen, Integer actual) { return frozen.isIntegralNumber() && frozen.canConvertToInt() && frozen.intValue() >= 0 && frozen.intValue() < Integer.MAX_VALUE && Objects.equals(actual, frozen.intValue() + 1); }
    private static ObjectNode object(JsonNode value) { if (!(value instanceof ObjectNode node)) throw changed(); return node.deepCopy(); }
    private static boolean same(JsonNode first, JsonNode second) { return first.equals((left, right) -> left.isNumber() && right.isNumber() ? left.decimalValue().compareTo(right.decimalValue()) : left.equals(right) ? 0 : 1, second); }
    private static Long id(String value) { try { if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw changed(); return Long.valueOf(value); } catch (NumberFormatException failure) { throw changed(); } }
    private static BigDecimal money(JsonNode value) { try { return HrSettlementCalculation.signedMoney(new BigDecimal(value.asText())); } catch (IllegalArgumentException failure) { throw changed(); } }
    private static HrHException changed() { return conflict("SETTLEMENT_REVERSAL_SOURCES_CHANGED", "冲正明细、原收付或原来源恢复依据不一致"); }
}
