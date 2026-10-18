package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** Read-only source inspection. Reservation and posting belong to the settlement transaction. */
@Service
@RequiredArgsConstructor
public class HrSettlementPayrollSource {
    private final HrSalarySlipMapper salaries;
    private final IHrEssService payroll;
    private final HrHSupport access;
    private final ObjectMapper json;

    public record Issue(Long salarySlipId, String code, String message) { }
    public record Wage(Long salarySlipId, Integer version, String itemType, String amount,
                       LocalDate periodStart, LocalDate periodEnd, JsonNode evidence) { }
    public record Inspection(List<Wage> unpaid, List<Issue> issues) {
        public Inspection { unpaid = List.copyOf(unpaid); issues = List.copyOf(issues); }
    }

    public Inspection inspect(Long employeeId, LocalDate relievingDate, Long settlementId) {
        access.permission("hr:settlement:calculate"); access.scope(employeeId);
        if (relievingDate == null || relievingDate.getYear() < 1000 || relievingDate.getYear() > 9999) throw HrHException.invalid("离职生效日期无效");
        List<Wage> unpaid = new ArrayList<>(); List<Issue> issues = new ArrayList<>();
        List<HrSalarySlip> rows = salaries.selectList(new LambdaQueryWrapper<HrSalarySlip>()
                .eq(HrSalarySlip::getTenantId, HrRuleSupport.tenantId()).eq(HrSalarySlip::getEmployeeId, employeeId)
                .eq(HrSalarySlip::getDeleted, 0).ne(HrSalarySlip::getStatus, "CANCELLED")
                .orderByAsc(HrSalarySlip::getPeriodMonth).orderByAsc(HrSalarySlip::getId));
        for (HrSalarySlip row : rows) {
            if ("PAID".equals(row.getStatus())) continue;
            if (!List.of("SUBMITTED", "CONFIRMED").contains(String.valueOf(row.getStatus()))) {
                issues.add(issue(row, "SETTLEMENT_SALARY_PENDING", "存在尚未核定的工资，请先完成或撤销该工资单")); continue;
            }
            if (row.getReservedSettlementId() != null && !Objects.equals(row.getReservedSettlementId(), settlementId)) {
                issues.add(issue(row, "SETTLEMENT_SALARY_RESERVED", "工资已被其他结算占用")); continue;
            }
            if (row.getVersion() == null || row.getVersion() < 0 || row.getDigestSha256() == null || !row.getDigestSha256().matches("[a-fA-F0-9]{64}")) {
                issues.add(issue(row, "SETTLEMENT_SALARY_EVIDENCE_MISSING", "工资缺少已封存版本或防篡改摘要，请先核实工资来源")); continue;
            }
            try { payroll.verifySalarySlip(row); }
            catch (HrBusinessException invalid) {
                issues.add(issue(row, "SETTLEMENT_SALARY_TAMPERED", "工资封存摘要校验失败，请先核实工资来源")); continue;
            }
            LocalDate from; LocalDate to;
            try {
                List<Map<String, Object>> snapshots = row.getComponents() == null ? List.of() : row.getComponents().stream()
                        .filter(component -> component != null && "TAX_SNAPSHOT".equals(component.get("type"))).toList();
                if (snapshots.size() != 1) throw new IllegalArgumentException();
                from = LocalDate.parse(String.valueOf(snapshots.get(0).get("periodStart")));
                to = LocalDate.parse(String.valueOf(snapshots.get(0).get("periodEnd")));
                if (from.isAfter(to) || from.getYear() < 1000 || to.getYear() > 9999
                        || !YearMonth.from(to).toString().equals(row.getPeriodMonth())) throw new IllegalArgumentException();
            } catch (RuntimeException invalid) {
                issues.add(issue(row, "SETTLEMENT_SALARY_PERIOD_MISSING", "工资缺少一致的已封存计薪起止日期")); continue;
            }
            if (to.isAfter(relievingDate)) {
                issues.add(issue(row, "SETTLEMENT_SALARY_AFTER_EXIT", "工资周期晚于离职生效日期，请先核定离职期间工资")); continue;
            }
            BigDecimal net;
            try {
                net = HrSettlementCalculation.signedMoney(row.getNetTotal());
                if (row.getGrossTotal() == null || row.getDeductionTotal() == null
                        || row.getGrossTotal().subtract(row.getDeductionTotal()).compareTo(net) != 0) throw new IllegalArgumentException();
            } catch (IllegalArgumentException invalid) {
                issues.add(issue(row, "SETTLEMENT_SALARY_AMOUNT_INVALID", "工资净额与应发、扣款不一致或超出结算金额容量")); continue;
            }
            ObjectNode evidence = json.createObjectNode();
            evidence.put("salarySlipId", row.getId().toString()); evidence.put("version", row.getVersion());
            evidence.put("employeeId", employeeId.toString()); evidence.put("status", row.getStatus());
            evidence.put("digestSha256", row.getDigestSha256()); evidence.put("periodStart", from.toString()); evidence.put("periodEnd", to.toString());
            evidence.put("grossTotal", row.getGrossTotal().toPlainString()); evidence.put("deductionTotal", row.getDeductionTotal().toPlainString());
            evidence.put("netTotal", net.toPlainString()); evidence.set("components", json.valueToTree(row.getComponents()));
            if (row.getBatchId() != null) evidence.put("batchId", row.getBatchId().toString());
            if (row.getReservedSettlementId() != null) evidence.put("reservedSettlementId", row.getReservedSettlementId().toString());
            unpaid.add(new Wage(row.getId(), row.getVersion(), net.signum() < 0 ? "RECEIVABLE" : "PAYABLE", net.abs().toPlainString(), from, to, evidence));
        }
        return new Inspection(unpaid, issues);
    }

    private static Issue issue(HrSalarySlip row, String code, String message) { return new Issue(row.getId(), code, message); }
}
