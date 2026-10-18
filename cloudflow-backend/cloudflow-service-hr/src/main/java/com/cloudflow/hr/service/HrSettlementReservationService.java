package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.domain.entity.HrFinalSettlementItem;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementItemMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import com.cloudflow.hr.mapper.HrSettlementSourceMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

/** Internal transaction component. Application entry points own authorization, state changes and persistence. */
@Service
@RequiredArgsConstructor
public class HrSettlementReservationService {
    private static final Set<String> RESERVED_TYPES = Set.of("HR_SALARY_SLIP", "HR_ADVANCE", "HR_LEAVE_QUOTA", "HR_TRAINING_RECOVERY");
    private final HrFinalSettlementMapper settlements;
    private final HrFinalSettlementItemMapper items;
    private final HrEmployeeAdvanceMapper advances;
    private final HrSettlementSourceMapper sources;
    private final HrSettlementAdvanceSource advanceSource;
    private final HrSettlementLeaveSource leaveSource;
    private final HrSettlementTrainingSource trainingSource;
    private final HrAdvanceLedgerService advanceLedger;
    private final HrLeaveBusinessService leaveLedger;
    private final HrSettlementReversalSourceService reversals;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final ObjectMapper json;

    <T> T locked(Long id, Function<HrFinalSettlement, T> action) {
        HrFinalSettlement initial = find(id);
        return support.transaction(() -> {
            if (advances.lockEmployee(tenantId(), initial.getEmployeeId()) == null) throw changed();
            if (settlements.lock(tenantId(), id) == null) throw changed();
            HrFinalSettlement current = find(id);
            if (!Objects.equals(initial.getEmployeeId(), current.getEmployeeId())) throw changed();
            for (Long salaryId : sources.salaryIds(tenantId(), current.getEmployeeId())) {
                HrEmployeeAdvanceMapper.SalarySource salary = advances.lockSalary(tenantId(), salaryId);
                if (salary == null || !Objects.equals(salary.employeeId(), current.getEmployeeId())) throw changed();
            }
            for (Long advanceId : sources.advanceIds(tenantId(), current.getEmployeeId())) advance(current, advanceId);
            List<Long> types = sources.leaveTypes(tenantId(), current.getEmployeeId());
            if (types.stream().anyMatch(Objects::isNull)) throw changed();
            return access.locked(types.stream().map(type -> "leave:" + current.getEmployeeId() + ":" + type).toList(), () -> {
                for (Long type : types) if (sources.lockLeaveType(tenantId(), type) == null) throw changed();
                for (Long period : sources.leavePeriodIds(tenantId(), current.getEmployeeId())) if (sources.lockLeavePeriod(tenantId(), period) == null) throw changed();
                for (Long training : sources.trainingIds(tenantId(), current.getEmployeeId())) if (sources.lockTraining(tenantId(), current.getEmployeeId(), training) == null) throw changed();
                return action.apply(current);
            });
        });
    }

    /** Must run after complete policy, compensation and asset validation in the same locked submission. */
    void freezeLocked(HrFinalSettlement record) {
        if ("REVERSAL".equals(record.getSettlementKind())) { reversals.freezeLocked(record); return; }
        requireTransaction(record);
        ObjectNode calculation = calculation(record);
        ObjectNode previous = reservation(calculation);
        if (previous != null && "FROZEN".equals(previous.path("state").asText())) { verifyFrozenLocked(record); return; }
        if (!"DRAFT".equals(record.getStatus()) || !Set.of("DRAFT", "REJECTED", "CANCELLED").contains(String.valueOf(record.getApprovalStatus()))
                || !calculation.path("calculated").asBoolean(false) || !calculation.path("missingRequirements").isArray()
                || !calculation.path("missingRequirements").isEmpty() || previous != null && !"RELEASED".equals(previous.path("state").asText())) throw conflict("SETTLEMENT_NOT_READY", "结算须完成全部核定及重算后提交");
        List<HrFinalSettlementItem> details = activeItems(record);
        if (details.isEmpty() || details.stream().anyMatch(item -> !Integer.valueOf(1).equals(item.getConfirmedFlag()) || !Integer.valueOf(0).equals(item.getSourcePostedFlag()))) throw conflict("SETTLEMENT_NOT_READY", "结算仍有未核定或已入账明细");
        Map<String, Source> current = inspect(record);
        Map<String, HrFinalSettlementItem> expected = new LinkedHashMap<>();
        for (HrFinalSettlementItem item : details) if (RESERVED_TYPES.contains(item.getSourceBizType())) {
            if (expected.putIfAbsent(key(item.getSourceBizType(), item.getSourceBizId()), item) != null) throw changed();
        }
        if (!expected.keySet().equals(current.keySet())) throw changed();
        for (Map.Entry<String, Source> entry : current.entrySet()) {
            HrFinalSettlementItem item = expected.get(entry.getKey()); Source actual = entry.getValue();
            ObjectNode evidence = object(item.getSourceSnapshot()); evidence.remove(List.of("active", "valuation"));
            if (!Objects.equals(item.getItemType(), actual.itemType()) || item.getAmount() == null
                    || actual.amount() != null && item.getAmount().compareTo(actual.amount()) != 0 || !sameEvidence(evidence, actual.evidence())) throw changed();
        }
        int revision = record.getVersion();
        if (previous != null && previous.path("revision").asInt(Integer.MAX_VALUE) >= revision) throw changed();
        for (Source source : current.values()) {
            switch (source.type()) {
                case "HR_SALARY_SLIP" -> {
                    if (source.evidence().hasNonNull("reservedSettlementId") || sources.reserveSalary(tenantId(), record.getEmployeeId(), source.id(), record.getSettlementId(), source.evidence().path("version").intValue()) != 1) throw changed();
                }
                case "HR_ADVANCE" -> advanceLedger.reserveSettlementLocked(advance(record, source.id()), record.getSettlementId(), source.amount());
                case "HR_LEAVE_QUOTA" -> leaveLedger.freezeSettlementLocked(record.getSettlementId(), revision, record.getEmployeeId(),
                        identifier(source.evidence(), "leaveTypeId"), identifier(source.evidence(), "periodId"), quantity(source.evidence()), source.evidence().path("unit").asText(), record.getRelievingDate());
                case "HR_TRAINING_RECOVERY" -> {
                    if (source.evidence().hasNonNull("settlementId") || sources.reserveTraining(tenantId(), record.getEmployeeId(), source.id(), record.getSettlementId(), source.evidence().path("version").intValue()) != 1) throw changed();
                }
                default -> throw changed();
            }
        }
        Map<String, Source> frozen = inspect(record);
        if (!current.keySet().equals(frozen.keySet())) throw changed();
        ObjectNode next = json.createObjectNode().put("state", "FROZEN").put("revision", revision).put("frozenTime", HrHSupport.now().toString());
        next.set("sources", evidence(frozen));
        if (previous != null) {
            ArrayNode history = calculation.path("reservationHistory") instanceof ArrayNode value ? value.deepCopy() : json.createArrayNode();
            history.add(previous); calculation.set("reservationHistory", history);
        }
        calculation.set("reservation", next); record.setCalculationSnapshot(calculation);
        support.audit("HR_FINAL_SETTLEMENT", record.getSettlementId(), "SOURCES_FROZEN", Map.of("revision", revision, "sources", frozen.size()));
    }

    void verifyFrozenLocked(HrFinalSettlement record) {
        if ("REVERSAL".equals(record.getSettlementKind())) { reversals.verifyFrozenLocked(record); return; }
        requireTransaction(record);
        ObjectNode reservation = reservation(calculation(record));
        if (reservation == null || !"FROZEN".equals(reservation.path("state").asText()) || !reservation.path("sources").isObject()
                || !sameEvidence(reservation.path("sources"), evidence(inspect(record)))) throw changed();
    }

    /** Does not require healthy remote/read-only sources to return resources on a rejected approval. */
    void releaseLocked(HrFinalSettlement record) {
        if ("REVERSAL".equals(record.getSettlementKind())) { reversals.releaseLocked(record); return; }
        requireTransaction(record);
        ObjectNode calculation = calculation(record); ObjectNode reservation = reservation(calculation);
        if (reservation == null) throw conflict("SETTLEMENT_RESERVATION_MISSING", "结算缺少来源预约依据");
        if ("RELEASED".equals(reservation.path("state").asText())) return;
        if (!"FROZEN".equals(reservation.path("state").asText()) || !reservation.path("sources").isObject()
                || !reservation.path("revision").isIntegralNumber() || reservation.path("revision").intValue() < 0
                || !"DRAFT".equals(record.getStatus()) || record.getConfirmedTime() != null || record.getPaymentRequestId() != null
                || activeItems(record).stream().anyMatch(item -> Integer.valueOf(1).equals(item.getSourcePostedFlag()))) throw conflict("SETTLEMENT_RELEASE_STATE", "已确认或入账结算不能直接释放来源");
        int revision = reservation.path("revision").intValue();
        for (JsonNode source : reservation.path("sources")) {
            String type = source.path("type").asText(); Long id = identifier(source, "id"); JsonNode facts = source.path("evidence");
            switch (type) {
                case "HR_SALARY_SLIP" -> { if (sources.releaseSalary(tenantId(), record.getEmployeeId(), id, record.getSettlementId()) != 1) throw changed(); }
                case "HR_ADVANCE" -> advanceLedger.releaseSettlementLocked(advance(record, id), record.getSettlementId(), new BigDecimal(source.path("amount").asText()));
                case "HR_LEAVE_QUOTA" -> leaveLedger.releaseSettlementLocked(record.getSettlementId(), revision, record.getEmployeeId(),
                        identifier(facts, "leaveTypeId"), identifier(facts, "periodId"), quantity(facts), facts.path("unit").asText());
                case "HR_TRAINING_RECOVERY" -> { if (sources.releaseTraining(tenantId(), record.getEmployeeId(), id, record.getSettlementId()) != 1) throw changed(); }
                default -> throw changed();
            }
        }
        reservation.put("state", "RELEASED"); reservation.put("releasedTime", HrHSupport.now().toString()); calculation.set("reservation", reservation);
        calculation.put("calculated", false); calculation.set("missingRequirements", json.valueToTree(List.of("审批来源预约已释放，请重新核定来源并计算后提交")));
        record.setCalculationSnapshot(calculation);
        support.audit("HR_FINAL_SETTLEMENT", record.getSettlementId(), "SOURCES_RELEASED", Map.of("revision", revision));
    }

    private Map<String, Source> inspect(HrFinalSettlement record) {
        HrSettlementAdvanceSource.Inspection loans = advanceSource.inspect(record.getEmployeeId(), record.getRelievingDate(), record.getSettlementId());
        HrSettlementLeaveSource.Inspection leave = leaveSource.inspect(record.getEmployeeId(), record.getRelievingDate(), record.getSettlementId());
        HrSettlementTrainingSource.Inspection training = trainingSource.inspect(record.getEmployeeId(), record.getSettlementId());
        if (!loans.issues().isEmpty() || !leave.issues().isEmpty() || !training.issues().isEmpty()) throw changed();
        Map<String, Source> result = new LinkedHashMap<>();
        for (HrSettlementPayrollSource.Wage value : loans.payroll().unpaid()) put(result, new Source("HR_SALARY_SLIP", value.salarySlipId(), value.itemType(), new BigDecimal(value.amount()), value.evidence()));
        for (HrSettlementAdvanceSource.Loan value : loans.loans()) put(result, new Source("HR_ADVANCE", value.advanceId(), "RECEIVABLE", new BigDecimal(value.amount()), value.evidence()));
        for (HrSettlementLeaveSource.Leave value : leave.leaves()) put(result, new Source("HR_LEAVE_QUOTA", value.quotaId(), "PAYABLE", null, value.evidence()));
        for (HrSettlementTrainingSource.Recovery value : training.recoveries()) put(result, new Source("HR_TRAINING_RECOVERY", value.recoveryId(), "RECEIVABLE", new BigDecimal(value.amount()), value.evidence()));
        return result;
    }

    private ObjectNode evidence(Map<String, Source> sources) {
        ObjectNode result = json.createObjectNode();
        sources.forEach((key, source) -> {
            ObjectNode value = result.putObject(key).put("type", source.type()).put("id", source.id().toString()).put("itemType", source.itemType());
            if (source.amount() != null) value.put("amount", source.amount().toPlainString());
            value.set("evidence", source.evidence());
        });
        return result;
    }

    private void put(Map<String, Source> target, Source value) { if (target.putIfAbsent(key(value.type(), value.id().toString()), value) != null) throw changed(); }
    private HrEmployeeAdvance advance(HrFinalSettlement record, Long id) {
        HrEmployeeAdvance value = advances.lockAdvance(tenantId(), id);
        if (value == null || !Objects.equals(value.getEmployeeId(), record.getEmployeeId())) throw changed();
        return value;
    }
    private List<HrFinalSettlementItem> activeItems(HrFinalSettlement record) {
        return items.selectList(new LambdaQueryWrapper<HrFinalSettlementItem>().eq(HrFinalSettlementItem::getTenantId, tenantId())
                .eq(HrFinalSettlementItem::getSettlementId, record.getSettlementId()).orderByAsc(HrFinalSettlementItem::getItemId)).stream()
                .filter(item -> item.getSourceSnapshot() != null && item.getSourceSnapshot().path("active").asBoolean(false)).toList();
    }
    private HrFinalSettlement find(Long id) {
        HrFinalSettlement record = id == null ? null : settlements.selectById(id);
        if (record == null || !Objects.equals(tenantId(), record.getTenantId())) throw new HrHException("SETTLEMENT_NOT_FOUND", "结算单不存在或不可见", 404);
        return record;
    }
    private static void requireTransaction(HrFinalSettlement record) {
        if (!TransactionSynchronizationManager.isActualTransactionActive() || record == null || !Objects.equals(record.getTenantId(), tenantId())
                || !"NORMAL".equals(record.getSettlementKind()) || !Integer.valueOf(0).equals(record.getSupersededFlag())
                || record.getVersion() == null || record.getVersion() < 0) throw conflict("SETTLEMENT_TRANSACTION_REQUIRED", "须在已锁定结算来源的事务内处理");
    }
    private static ObjectNode object(JsonNode value) { if (!(value instanceof ObjectNode node)) throw changed(); return node.deepCopy(); }
    private static ObjectNode calculation(HrFinalSettlement record) { return object(record.getCalculationSnapshot()); }
    private static ObjectNode reservation(ObjectNode calculation) { return calculation.hasNonNull("reservation") ? object(calculation.get("reservation")) : null; }
    private static Long identifier(JsonNode value, String field) {
        if (!value.path(field).asText().matches("[1-9][0-9]{0,18}")) throw changed();
        try { return Long.valueOf(value.path(field).asText()); } catch (NumberFormatException invalid) { throw changed(); }
    }
    private static BigDecimal quantity(JsonNode facts) { try { return new BigDecimal(facts.path("available").asText()); } catch (NumberFormatException invalid) { throw changed(); } }
    private static String key(String type, String id) { return type + ":" + id; }
    /** JSON storage may deserialize a small long as an int; compare numeric values exactly, preserving every key and array order. */
    private static boolean sameEvidence(JsonNode first, JsonNode second) {
        return first.equals((left, right) -> left.isNumber() && right.isNumber()
                ? left.decimalValue().compareTo(right.decimalValue()) : left.equals(right) ? 0 : 1, second);
    }
    private static HrHException changed() { return conflict("SETTLEMENT_SOURCE_CHANGED", "结算来源、金额或预约已变化，请核对后重新计算"); }
    private record Source(String type, Long id, String itemType, BigDecimal amount, JsonNode evidence) { }
}
