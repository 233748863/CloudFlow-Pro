package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.domain.entity.HrFinalSettlementItem;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.domain.entity.HrTrainingRecovery;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementItemMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.mapper.HrTrainingRecoveryMapper;
import com.cloudflow.hr.service.impl.HrEssServiceImpl;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

/** The caller verifies real money evidence and retains employee, settlement and source locks through commit. */
@Service
@RequiredArgsConstructor
public class HrSettlementPostingService {
    private final HrFinalSettlementItemMapper items;
    private final HrSalarySlipMapper salaries;
    private final HrTrainingRecoveryMapper training;
    private final HrEmployeeAdvanceMapper advances;
    private final HrAdvanceLedgerService advanceLedger;
    private final HrAdvancePayrollService payroll;
    private final HrLeaveBusinessService leave;
    private final HrEssServiceImpl salaryIntegrity;
    private final HrRuleSupport support;
    private final ObjectMapper json;

    void postLocked(HrFinalSettlement record, LocalDateTime paidTime, java.time.LocalDate fundsDate, String fundsEvent) {
        if (!TransactionSynchronizationManager.isActualTransactionActive() || !Objects.equals(tenantId(), record.getTenantId())
                || !"NORMAL".equals(record.getSettlementKind()) || !"CONFIRMED".equals(record.getStatus())
                || !"APPROVED".equals(record.getApprovalStatus()) || record.getConfirmedTime() == null || record.getPaidTime() != null
                || paidTime == null || paidTime.isAfter(HrHSupport.now()) || paidTime.isBefore(record.getConfirmedTime())
                || fundsDate == null || fundsDate.isAfter(HrHSupport.today()) || fundsDate.isBefore(record.getConfirmedTime().toLocalDate())
                || fundsEvent == null || fundsEvent.isBlank()) throw changed();
        ObjectNode calculation = object(record.getCalculationSnapshot()); ObjectNode reservation = object(calculation.path("reservation"));
        if (!"FROZEN".equals(reservation.path("state").asText()) || !reservation.path("sources").isObject()) throw changed();
        List<HrFinalSettlementItem> active = items.selectList(new LambdaQueryWrapper<HrFinalSettlementItem>()
                .eq(HrFinalSettlementItem::getTenantId, tenantId()).eq(HrFinalSettlementItem::getSettlementId, record.getSettlementId())
                .orderByAsc(HrFinalSettlementItem::getItemId)).stream().filter(item -> item.getSourceSnapshot() != null && item.getSourceSnapshot().path("active").asBoolean(false)).toList();
        if (active.isEmpty() || active.stream().anyMatch(item -> !Integer.valueOf(1).equals(item.getConfirmedFlag()) || !Integer.valueOf(0).equals(item.getSourcePostedFlag()))) throw changed();
        Set<String> matched = new HashSet<>();
        // Payroll deductions were excluded from the settlement loan amount; post those first, then the remaining loan reservation.
        for (HrFinalSettlementItem item : active) if ("HR_SALARY_SLIP".equals(item.getSourceBizType())) {
            JsonNode facts = reserved(reservation, item, matched);
            HrSalarySlip salary = salaries.selectById(id(item.getSourceBizId()));
            if (salary == null || !Objects.equals(salary.getTenantId(), tenantId()) || !Objects.equals(salary.getEmployeeId(), record.getEmployeeId())
                    || !Objects.equals(salary.getReservedSettlementId(), record.getSettlementId()) || !Objects.equals(salary.getVersion(), facts.path("version").intValue())
                    || !Objects.equals(salary.getDigestSha256(), facts.path("digestSha256").asText())
                    || salary.getNetTotal().compareTo(money(facts.path("netTotal"))) != 0 || !same(json.valueToTree(salary.getComponents()), facts.path("components"))) throw changed();
            salaryIntegrity.verifySalarySlip(salary); payroll.paySettlementLocked(salary, record.getSettlementId(), fundsDate);
        }
        for (HrFinalSettlementItem item : active) {
            switch (item.getSourceBizType()) {
                case "HR_SALARY_SLIP", "HR_SEVERANCE", "OA_ASSET" -> { }
                case "HR_ADVANCE" -> {
                    reserved(reservation, item, matched);
                    HrEmployeeAdvance advance = advances.lockAdvance(tenantId(), id(item.getSourceBizId()));
                    if (advance == null || !Objects.equals(record.getEmployeeId(), advance.getEmployeeId())) throw changed();
                    advanceLedger.postSettlementLocked(advance, record.getSettlementId(), item.getAmount(), fundsDate);
                }
                case "HR_LEAVE_QUOTA" -> {
                    JsonNode facts = reserved(reservation, item, matched);
                    leave.postSettlementLocked(record.getSettlementId(), reservation.path("revision").intValue(), record.getEmployeeId(),
                            id(facts.path("leaveTypeId").asText()), id(facts.path("periodId").asText()), money(facts.path("available")), facts.path("unit").asText());
                }
                case "HR_TRAINING_RECOVERY" -> {
                    JsonNode facts = reserved(reservation, item, matched);
                    HrTrainingRecovery recovery = training.selectById(id(item.getSourceBizId()));
                    if (recovery == null || !Objects.equals(tenantId(), recovery.getTenantId()) || !Objects.equals(record.getEmployeeId(), recovery.getEmployeeId())
                            || !Objects.equals(record.getSettlementId(), recovery.getSettlementId()) || !Objects.equals(recovery.getVersion(), facts.path("version").intValue())
                            || !"CONFIRMED".equals(recovery.getStatus()) || recovery.getCollectedAmount().compareTo(money(facts.path("collectedAmount"))) != 0
                            || recovery.getAssessedAmount().compareTo(money(facts.path("assessedAmount"))) != 0
                            || recovery.getAssessedAmount().subtract(recovery.getCollectedAmount()).compareTo(item.getAmount()) != 0) throw changed();
                    recovery.setCollectedAmount(recovery.getAssessedAmount()); recovery.setStatus("CLEARED"); recovery.setUpdateBy(HrRuleSupport.userName()); recovery.setUpdateTime(HrHSupport.now());
                    if (training.updateById(recovery) != 1) throw changed();
                }
                default -> throw changed();
            }
            item.setSourcePostedFlag(1); item.setUpdateBy(HrRuleSupport.userName()); item.setUpdateTime(HrHSupport.now());
            if (items.updateById(item) != 1) throw changed();
        }
        if (matched.size() != reservation.path("sources").size()) throw changed();
        reservation.put("state", "POSTED").put("postedTime", paidTime.toString()).put("fundsEvent", fundsEvent);
        calculation.set("reservation", reservation); record.setCalculationSnapshot(calculation); record.setPaidTime(paidTime); record.setStatus("PAID");
        support.audit("HR_SETTLEMENT", record.getSettlementId(), "SOURCES_POSTED", Map.of("fundsEvent", fundsEvent, "items", active.size(), "paidTime", paidTime.toString()));
    }

    private static JsonNode reserved(ObjectNode reservation, HrFinalSettlementItem item, Set<String> matched) {
        String key = item.getSourceBizType() + ":" + item.getSourceBizId(); JsonNode source = reservation.path("sources").path(key);
        if (!matched.add(key) || !source.isObject() || !item.getSourceBizType().equals(source.path("type").asText())
                || !item.getSourceBizId().equals(source.path("id").asText()) || !item.getItemType().equals(source.path("itemType").asText())
                || !source.path("evidence").isObject() || source.has("amount") && item.getAmount().compareTo(money(source.path("amount"))) != 0) throw changed();
        return source.path("evidence");
    }
    private static Long id(String value) { try { if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw changed(); return Long.valueOf(value); } catch (NumberFormatException failure) { throw changed(); } }
    private static BigDecimal money(JsonNode value) { try { return new BigDecimal(value.asText()); } catch (NumberFormatException failure) { throw changed(); } }
    private static ObjectNode object(JsonNode value) { if (!(value instanceof ObjectNode node)) throw changed(); return node.deepCopy(); }
    private static boolean same(JsonNode first, JsonNode second) { return first.equals((left, right) -> left.isNumber() && right.isNumber() ? left.decimalValue().compareTo(right.decimalValue()) : left.equals(right) ? 0 : 1, second); }
    private static HrHException changed() { return conflict("SETTLEMENT_POSTING_SOURCE_CHANGED", "结算原预约、入账状态或实际收付依据不一致，请核对原记录"); }
}
