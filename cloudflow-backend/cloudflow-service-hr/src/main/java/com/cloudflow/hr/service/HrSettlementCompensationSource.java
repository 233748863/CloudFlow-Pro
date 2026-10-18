package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.service.HrSettlementCalculation.SamplingSelection;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** Collects policy and real wage evidence; the settlement transaction persists reviewer identity and the result. */
@Service
@RequiredArgsConstructor
public class HrSettlementCompensationSource {
    private final HrSeveranceRuleService rules;
    private final HrSettlementSalarySource salaries;
    private final HrHSupport access;
    private final ObjectMapper json;

    public record Inspection(HrSettlementCalculation.Result result, List<String> issues, JsonNode evidence,
                             HrSeveranceRuleService.SettlementPolicy policy, HrSettlementSalarySource.Inspection salary,
                             SamplingSelection selection, LocalDate relievingDate) {
        public Inspection { issues = List.copyOf(issues); }
        public BigDecimal leaveCash(String unit, BigDecimal quantity) {
            if (!issues.isEmpty() || result == null || policy == null || salary == null) throw HrHException.conflict("SETTLEMENT_COMPENSATION_INCOMPLETE", "工资取样或补偿政策尚未核实");
            return HrSettlementCalculation.leaveCash(policy.policy(), relievingDate, salary.samples(), selection, unit, quantity);
        }
    }

    public Inspection inspect(Long employeeId, LocalDate relievingDate, Long ruleId, SamplingSelection selection) {
        access.permission("hr:settlement:calculate"); access.scope(employeeId);
        HrEmployee employee = access.employee(employeeId);
        ObjectNode evidence = json.createObjectNode(); evidence.set("rounding", json.valueToTree(HrSettlementCalculation.roundingSnapshot()));
        if (ruleId == null || selection == null) return new Inspection(null, List.of("请选择已核定补偿政策，并逐单核定取样月份、平均月份数和原因"), evidence, null, null, selection, relievingDate);
        HrSeveranceRuleService.SettlementPolicy policy;
        try { policy = rules.forSettlement(ruleId, relievingDate); }
        catch (HrHException failure) {
            if (failure.getStatus() == 403) throw failure;
            return new Inspection(null, List.of(failure.getMessage()), evidence, null, null, selection, relievingDate);
        }
        evidence.set("policy", policy.evidence());
        HrSettlementSalarySource.Inspection salary = salaries.inspect(employeeId, relievingDate, selection, policy.componentIds());
        evidence.set("salarySampling", salary.evidence());
        if (!salary.issues().isEmpty()) return new Inspection(null, salary.issues().stream().map(issue ->
                (issue.month() == null ? "" : issue.month() + "：") + issue.message()).toList(), evidence, policy, salary, selection, relievingDate);
        try {
            HrSettlementCalculation.Result result = HrSettlementCalculation.severance(policy.policy(), employee.getHireDate(), relievingDate, salary.samples(), selection);
            evidence.set("calculation", json.valueToTree(result));
            return new Inspection(result, List.of(), evidence, policy, salary, selection, relievingDate);
        } catch (IllegalArgumentException failure) { return new Inspection(null, List.of(failure.getMessage()), evidence, policy, salary, selection, relievingDate); }
    }
}
