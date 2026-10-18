package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.entity.HrAdvanceRepayment;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** Reads actual funded principal and reconciles both sides of unpaid payroll reservations. */
@Service
@RequiredArgsConstructor
public class HrSettlementAdvanceSource {
    private final HrEmployeeAdvanceMapper advances;
    private final HrAdvanceLedgerService ledger;
    private final HrSettlementPayrollSource payroll;
    private final HrHSupport access;
    private final ObjectMapper json;

    public record Issue(String sourceType, Long sourceId, String code, String message) { }
    public record Loan(Long advanceId, Integer version, String amount, String payrollReserved, JsonNode evidence) { }
    public record Inspection(HrSettlementPayrollSource.Inspection payroll, List<Loan> loans, List<Issue> issues) {
        public Inspection { loans = List.copyOf(loans); issues = List.copyOf(issues); }
    }
    private record Deduction(Long salaryId, String periodMonth, BigDecimal amount) { }

    public Inspection inspect(Long employeeId, LocalDate relievingDate, Long settlementId) {
        access.permission("hr:settlement:calculate"); access.scope(employeeId);
        if (settlementId != null && settlementId <= 0) throw HrHException.invalid("结算单编号无效");
        HrSettlementPayrollSource.Inspection wages = payroll.inspect(employeeId, relievingDate, settlementId);
        List<Issue> issues = new ArrayList<>(); List<Loan> loans = new ArrayList<>();
        for (HrSettlementPayrollSource.Issue issue : wages.issues()) {
            issues.add(new Issue("SALARY", issue.salarySlipId(), issue.code(), issue.message()));
        }
        Map<Long, Map<Long, Deduction>> deductions = payrollDeductions(wages, issues);
        List<HrEmployeeAdvance> rows = advances.selectList(new LambdaQueryWrapper<HrEmployeeAdvance>()
                .eq(HrEmployeeAdvance::getTenantId, HrRuleSupport.tenantId()).eq(HrEmployeeAdvance::getEmployeeId, employeeId)
                .orderByAsc(HrEmployeeAdvance::getPaidTime).orderByAsc(HrEmployeeAdvance::getAdvanceId));
        Set<Long> inspected = new HashSet<>();
        for (HrEmployeeAdvance advance : rows) {
            Map<Long, Deduction> expected = deductions.getOrDefault(advance.getAdvanceId(), Map.of());
            if (unfunded(advance) && expected.isEmpty()) continue;
            inspected.add(advance.getAdvanceId());
            try {
                HrAdvanceLedgerService.LedgerSnapshot snapshot = ledger.verifiedLedger(advance);
                if (advance.getVersion() == null || advance.getVersion() < 0 || advance.getPaidTime().getYear() < 1000
                        || advance.getPaidTime().toLocalDate().isAfter(relievingDate)
                        || advance.getPaidTime().toLocalDate().isAfter(HrHSupport.today())) {
                    throw conflict("SETTLEMENT_ADVANCE_EVIDENCE_INVALID", "借款版本或实际放款日期与离职来源不一致");
                }
                BigDecimal salaryReserved = BigDecimal.ZERO; BigDecimal ownReserved = BigDecimal.ZERO;
                Set<Long> matched = new HashSet<>(); int ownReservations = 0;
                ArrayNode reservations = json.createArrayNode();
                for (HrAdvanceRepayment entry : snapshot.entries()) {
                    if (!"RESERVED".equals(entry.getStatus())) continue;
                    if ("SALARY".equals(entry.getRepayType())) {
                        Deduction deduction = expected.get(entry.getSalarySlipId());
                        if (deduction == null) throw conflict("SETTLEMENT_ADVANCE_SALARY_EXCLUDED", "借款已被未纳入本结算的工资占用，请先核实该工资来源");
                        if (!matched.add(entry.getSalarySlipId()) || entry.getSettlementId() != null || entry.getReversalOfId() != null
                                || !Objects.equals(entry.getRepayMonth(), deduction.periodMonth())
                                || entry.getRepayAmount().compareTo(deduction.amount()) != 0
                                || !Objects.equals(entry.getRepaymentId(), HrAdvanceSalaryReservationChain.current(HrRuleSupport.tenantId(), advance.getAdvanceId(), deduction.salaryId(), deduction.periodMonth(), snapshot.entries()).getRepaymentId())) {
                            throw conflict("SETTLEMENT_ADVANCE_SALARY_MISMATCH", "工资预扣金额或来源与借款预约记录不一致");
                        }
                        salaryReserved = salaryReserved.add(entry.getRepayAmount());
                    } else if ("SETTLEMENT".equals(entry.getRepayType())) {
                        if (settlementId == null || !Objects.equals(entry.getSettlementId(), settlementId)) {
                            throw conflict("SETTLEMENT_ADVANCE_RESERVED", "借款本金已被其他结算占用");
                        }
                        if (++ownReservations > 1 || entry.getSalarySlipId() != null || entry.getReversalOfId() != null
                                || !("SETTLEMENT:" + settlementId + ":ADVANCE:" + advance.getAdvanceId()).equals(entry.getSourceEventKey())) {
                            throw conflict("SETTLEMENT_ADVANCE_RESERVATION_INVALID", "本结算借款预约的业务来源不一致");
                        }
                        ownReserved = ownReserved.add(entry.getRepayAmount());
                    } else throw conflict("SETTLEMENT_ADVANCE_RESERVATION_INVALID", "借款存在无法核实来源的扣款预约");
                    reservations.add(entryEvidence(entry));
                }
                if (matched.size() != expected.size()) throw conflict("SETTLEMENT_ADVANCE_RESERVATION_MISSING", "工资预扣借款缺少对应的有效预约，请先核实工资");
                BigDecimal due = snapshot.balance().outstanding().subtract(salaryReserved);
                HrAdvanceAmounts.nonnegative(due);
                if (ownReservations > 0 && ownReserved.compareTo(due) != 0) {
                    throw conflict("SETTLEMENT_ADVANCE_RESERVATION_CHANGED", "本结算已预约的借款金额与当前剩余本金不一致，请重新计算");
                }
                if (snapshot.balance().outstanding().signum() == 0) continue;
                ObjectNode evidence = json.createObjectNode();
                evidence.put("advanceId", advance.getAdvanceId().toString()); evidence.put("version", advance.getVersion());
                evidence.put("employeeId", employeeId.toString()); evidence.put("advanceNo", advance.getAdvanceNo());
                evidence.put("paymentRequestId", advance.getPaymentRequestId().toString()); evidence.put("paidTime", advance.getPaidTime().toString());
                evidence.put("funded", snapshot.balance().funded().toPlainString()); evidence.put("repaid", snapshot.balance().repaid().toPlainString());
                evidence.put("writtenOff", snapshot.balance().writtenOff().toPlainString()); evidence.put("outstanding", snapshot.balance().outstanding().toPlainString());
                evidence.put("payrollReserved", salaryReserved.setScale(2).toPlainString()); evidence.put("settlementReceivable", due.toPlainString());
                evidence.put("settlementReserved", ownReserved.setScale(2).toPlainString()); evidence.set("reservations", reservations);
                loans.add(new Loan(advance.getAdvanceId(), advance.getVersion(), due.toPlainString(), salaryReserved.setScale(2).toPlainString(), evidence));
            } catch (HrHException invalid) {
                issues.add(new Issue("ADVANCE", advance.getAdvanceId(), invalid.getCode(), invalid.getMessage()));
            } catch (IllegalArgumentException invalid) {
                issues.add(new Issue("ADVANCE", advance.getAdvanceId(), "SETTLEMENT_ADVANCE_AMOUNT_INVALID", "借款余额缺失、超出容量或与已入账金额不一致"));
            }
        }
        for (Long advanceId : deductions.keySet()) {
            if (!inspected.contains(advanceId)) issues.add(new Issue("ADVANCE", advanceId,
                    "SETTLEMENT_ADVANCE_SOURCE_MISSING", "工资预扣借款未找到本租户该员工的实际借款来源"));
        }
        return new Inspection(wages, loans, issues);
    }

    private Map<Long, Map<Long, Deduction>> payrollDeductions(HrSettlementPayrollSource.Inspection wages, List<Issue> issues) {
        Map<Long, Map<Long, Deduction>> result = new LinkedHashMap<>();
        for (HrSettlementPayrollSource.Wage wage : wages.unpaid()) {
            for (JsonNode component : wage.evidence().path("components")) {
                String source = component.path("sourceBizType").asText();
                if ("HR_ADVANCE_REVERSAL".equals(source)) {
                    issues.add(new Issue("SALARY", wage.salarySlipId(), "SETTLEMENT_ADVANCE_CORRECTION_PENDING",
                            "该工资含尚未实际支付的借款退回，请先完成工资补正后再核定结算本金"));
                    continue;
                }
                if (!"HR_ADVANCE".equals(source)) continue;
                try {
                    String identifier = component.path("advanceId").asText();
                    if (!identifier.matches("[1-9][0-9]{0,18}") || !"DEDUCTION".equals(component.path("type").asText())) throw new IllegalArgumentException();
                    Long advanceId = Long.valueOf(identifier);
                    BigDecimal amount = HrAdvanceAmounts.positive(new BigDecimal(component.path("amount").asText()));
                    Map<Long, Deduction> loan = result.computeIfAbsent(advanceId, ignored -> new LinkedHashMap<>());
                    if (loan.putIfAbsent(wage.salarySlipId(), new Deduction(wage.salarySlipId(), YearMonth.from(wage.periodEnd()).toString(), amount)) != null) {
                        throw new IllegalArgumentException();
                    }
                } catch (IllegalArgumentException invalid) {
                    issues.add(new Issue("SALARY", wage.salarySlipId(), "SETTLEMENT_ADVANCE_COMPONENT_INVALID", "工资预扣借款的编号、金额、类型或重复明细无效"));
                }
            }
        }
        return result;
    }

    private ObjectNode entryEvidence(HrAdvanceRepayment entry) {
        ObjectNode node = json.createObjectNode();
        node.put("repaymentId", entry.getRepaymentId().toString()); node.put("type", entry.getRepayType());
        node.put("sourceEventKey", entry.getSourceEventKey()); node.put("amount", entry.getRepayAmount().toPlainString());
        node.put("status", entry.getStatus());
        if (entry.getSalarySlipId() != null) node.put("salarySlipId", entry.getSalarySlipId().toString());
        if (entry.getSettlementId() != null) node.put("settlementId", entry.getSettlementId().toString());
        return node;
    }

    private static boolean unfunded(HrEmployeeAdvance advance) {
        return List.of("APPLYING", "APPROVED").contains(String.valueOf(advance.getStatus())) && advance.getPaidTime() == null
                && zero(advance.getOutstandingAmount()) && zero(advance.getReservedAmount())
                && zero(advance.getRepaidAmount()) && zero(advance.getWrittenOffAmount());
    }

    private static boolean zero(BigDecimal amount) { return amount != null && amount.signum() == 0; }
    private static HrHException conflict(String code, String message) { return HrHException.conflict(code, message); }
}
