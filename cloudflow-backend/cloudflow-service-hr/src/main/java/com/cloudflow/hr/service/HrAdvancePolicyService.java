package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.HrAdvanceRuleClient;
import com.cloudflow.hr.domain.entity.HrCompStructure;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.domain.entity.HrEmployeeComp;
import com.cloudflow.hr.mapper.HrAdvanceApplicationMapper;
import com.cloudflow.hr.mapper.HrCompStructureMapper;
import com.cloudflow.hr.mapper.HrEmployeeCompMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrAdvancePolicyService {
    private final HrAdvanceRuleClient rules;
    private final HrEmployeeCompMapper compensations;
    private final HrCompStructureMapper structures;
    private final HrAdvanceApplicationMapper applications;
    private final HrHSupport access;
    private final HrHCipherService cipher;

    /** Read before acquiring application locks; the returned version is frozen on submission. */
    public HrAdvanceApplicationRules.Policy published(boolean payrollDeduction) {
        R<List<HrAdvanceApplicationRules.PublishedRule>> response;
        try { response = rules.policy(payrollDeduction); }
        catch (RuntimeException failure) { throw conflict("ADVANCE_RULE_UNAVAILABLE", "借款规则暂时无法核实，草稿已保留"); }
        if (response == null || !response.isSuccess()) throw conflict("ADVANCE_RULE_UNAVAILABLE", "借款规则暂时无法核实，草稿已保留");
        return HrAdvanceApplicationRules.policy(tenantId(), response.getData(), payrollDeduction);
    }

    /** Caller holds the employee lock shared by applications, repayment and payroll. */
    public ObjectNode freeze(HrEmployeeAdvance advance, HrAdvanceApplicationRules.Policy policy, LocalDate date) {
        List<HrEmployeeComp> current = compensations.selectPage(new Page<>(1, 2, false), new LambdaQueryWrapper<HrEmployeeComp>()
                .eq(HrEmployeeComp::getTenantId, tenantId()).eq(HrEmployeeComp::getEmployeeId, advance.getEmployeeId())
                .eq(HrEmployeeComp::getDeleted, 0).eq(HrEmployeeComp::getStatus, "ACTIVE")
                .le(HrEmployeeComp::getEffectiveDate, date).orderByDesc(HrEmployeeComp::getEffectiveDate).orderByDesc(HrEmployeeComp::getId)).getRecords();
        if (current.isEmpty() || current.size() > 1 && Objects.equals(current.get(0).getEffectiveDate(), current.get(1).getEffectiveDate())) {
            throw conflict("ADVANCE_SALARY_MISSING", "员工须有唯一最近生效的固定月薪记录");
        }
        HrEmployeeComp compensation = current.get(0);
        HrCompStructure structure = compensation.getStructureId() == null ? null : structures.selectById(compensation.getStructureId());
        if (structure == null || !Objects.equals(structure.getTenantId(), tenantId()) || !Integer.valueOf(1).equals(structure.getStatus())
                || compensation.getVersion() == null || structure.getVersion() == null || structure.getComponentConfig() == null
                || !"MONTHLY".equals(structure.getComponentConfig().path("payrollBasis").path("salaryBasis").asText())) {
            throw conflict("ADVANCE_MONTHLY_BASIS_REQUIRED", "借款须使用已启用且明确按固定月薪计薪的薪资结构");
        }
        HrAdvanceApplicationRules.Capacity capacity = HrAdvanceApplicationRules.capacity(policy, compensation.getTotalSalary(),
                applications.occupiedAmount(tenantId(), advance.getEmployeeId(), advance.getAdvanceId()));
        HrAdvanceApplicationRules.requireAvailable(capacity, advance.getAdvanceAmount());
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("ruleId", policy.multiplier().ruleId()); snapshot.put("ruleVersion", policy.multiplier().ruleVersion());
        snapshot.put("limitRule", policy.multiplier()); snapshot.put("salaryBasis", "EFFECTIVE_FIXED_MONTHLY");
        snapshot.put("compensationId", compensation.getId()); snapshot.put("compensationVersion", compensation.getVersion());
        snapshot.put("structureId", structure.getId()); snapshot.put("structureVersion", structure.getVersion());
        snapshot.put("effectiveDate", compensation.getEffectiveDate().toString()); snapshot.put("calculatedDate", date.toString());
        snapshot.put("fixedMonthlySalaryCipher", cipher.seal(compensation.getTotalSalary().toPlainString()));
        snapshot.put("maximumAmountCipher", cipher.seal(capacity.maximumAmount().toPlainString()));
        snapshot.put("occupiedAmount", capacity.occupiedAmount().toPlainString());
        snapshot.put("availableAmountCipher", cipher.seal(capacity.availableAmount().toPlainString()));
        snapshot.put("termsDigest", access.digest(List.of(advance.getAdvanceId(), advance.getEmployeeId(), advance.getAdvanceAmount().toPlainString(),
                advance.getPurpose(), advance.getRepayMode(), Objects.toString(advance.getRepayStartMonth(), ""),
                Objects.toString(advance.getRepayMonths(), ""), Objects.toString(advance.getMonthlyDeductAmount(), ""))));
        if ("SALARY_DEDUCT".equals(advance.getRepayMode())) snapshot.put("payrollDeduction", HrAdvanceApplicationRules.payrollSnapshot(policy));
        return access.tree(access.json(snapshot));
    }
}
