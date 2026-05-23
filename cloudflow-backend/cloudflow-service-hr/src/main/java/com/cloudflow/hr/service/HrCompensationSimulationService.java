package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HrCompensationSimulateRequest;

import java.util.Map;

/**
 * HR-P1-2 薪酬模拟服务（不持久化）。
 *
 * <p>按假设的薪酬等级/项目，依据现有 hr_comp_structure / hr_comp_component / hr_comp_grade 配置，
 * 模拟计算应发、个税、社保、实发。
 */
public interface HrCompensationSimulationService {

    /**
     * 模拟计算薪酬。
     *
     * @return gross/socialPersonal/taxableIncome/personalTax/netSalary + breakdown.
     */
    Map<String, Object> simulate(HrCompensationSimulateRequest request);
}
