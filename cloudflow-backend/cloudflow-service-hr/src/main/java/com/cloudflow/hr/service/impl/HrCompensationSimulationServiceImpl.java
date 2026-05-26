package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.dto.HrCompensationSimulateRequest;
import com.cloudflow.hr.domain.entity.HrCompComponent;
import com.cloudflow.hr.domain.entity.HrCompGrade;
import com.cloudflow.hr.domain.vo.compensation.HrCompensationSimulateBreakdownItemVO;
import com.cloudflow.hr.domain.vo.compensation.HrCompensationSimulateVO;
import com.cloudflow.hr.mapper.HrCompComponentMapper;
import com.cloudflow.hr.mapper.HrCompGradeMapper;
import com.cloudflow.hr.service.HrCompensationSimulationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * HR-P1-2 薪酬模拟实现。
 *
 * <p>计算规则（月度模拟，简化版 2026 中国个税月度累计扣缴近似）：
 * <ol>
 *   <li>应发合计 = Σ component_overrides，未显式给出的项目按 grade 的 mid_salary 或 0 兜底</li>
 *   <li>个人社保 = socialBase × socialPersonalRate（默认 10.5% 五险一金合计估算）</li>
 *   <li>应纳税所得额 = 应发 − 个人社保 − 起征点 5000 − 专项附加扣除</li>
 *   <li>个税 = 应纳税所得额 × 月度税率 − 速算扣除数（按 7 档税率表）</li>
 *   <li>实发 = 应发 − 个人社保 − 个税</li>
 * </ol>
 *
 * <p>不持久化任何记录，仅返回明细给前端展示。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrCompensationSimulationServiceImpl implements HrCompensationSimulationService {

    private static final long TENANT_ID = 100000L;
    private static final BigDecimal MONTHLY_THRESHOLD = BigDecimal.valueOf(5000);
    private static final BigDecimal DEFAULT_SOCIAL_PERSONAL_RATE = new BigDecimal("0.105");

    /** 月度税率（按累计预扣预缴月度近似，下限/上限/税率/速算扣除）。 */
    private static final BigDecimal[][] TAX_BRACKETS = new BigDecimal[][]{
            {BigDecimal.ZERO,            new BigDecimal("3000"),    new BigDecimal("0.03"), BigDecimal.ZERO},
            {new BigDecimal("3000"),     new BigDecimal("12000"),   new BigDecimal("0.10"), new BigDecimal("210")},
            {new BigDecimal("12000"),    new BigDecimal("25000"),   new BigDecimal("0.20"), new BigDecimal("1410")},
            {new BigDecimal("25000"),    new BigDecimal("35000"),   new BigDecimal("0.25"), new BigDecimal("2660")},
            {new BigDecimal("35000"),    new BigDecimal("55000"),   new BigDecimal("0.30"), new BigDecimal("4410")},
            {new BigDecimal("55000"),    new BigDecimal("80000"),   new BigDecimal("0.35"), new BigDecimal("7160")},
            {new BigDecimal("80000"),    null,                      new BigDecimal("0.45"), new BigDecimal("15160")},
    };

    private final HrCompComponentMapper compComponentMapper;
    private final HrCompGradeMapper compGradeMapper;

    @Override
    public HrCompensationSimulateVO simulate(HrCompensationSimulateRequest request) {
        if (request == null || request.getStructureId() == null) {
            throw new IllegalArgumentException("structureId 不能为空");
        }
        List<HrCompComponent> components = compComponentMapper.selectList(
                new LambdaQueryWrapper<HrCompComponent>()
                        .eq(HrCompComponent::getTenantId, TENANT_ID)
                        .eq(HrCompComponent::getStatus, 1)
                        .orderByAsc(HrCompComponent::getSortOrder)
                        .orderByAsc(HrCompComponent::getId));
        BigDecimal gradeMid = BigDecimal.ZERO;
        if (request.getGradeId() != null) {
            HrCompGrade grade = compGradeMapper.selectOne(
                    new LambdaQueryWrapper<HrCompGrade>()
                            .eq(HrCompGrade::getId, request.getGradeId())
                            .eq(HrCompGrade::getTenantId, TENANT_ID));
            if (grade != null && grade.getMidSalary() != null) {
                gradeMid = grade.getMidSalary();
            }
        }

        Map<String, BigDecimal> overrides = request.getComponentOverrides() == null
                ? new LinkedHashMap<>() : request.getComponentOverrides();

        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal taxableGross = BigDecimal.ZERO;
        List<HrCompensationSimulateBreakdownItemVO> breakdown = new ArrayList<>();
        for (HrCompComponent comp : components) {
            String code = comp.getComponentCode();
            String type = comp.getComponentType();
            Integer taxable = comp.getTaxable() == null ? 1 : comp.getTaxable();
            BigDecimal amount = overrides.getOrDefault(code, BigDecimal.ZERO);
            if (amount.signum() == 0 && "BASE".equalsIgnoreCase(type) && gradeMid.signum() > 0) {
                amount = gradeMid;
            }
            if (amount.signum() == 0) {
                continue;
            }
            HrCompensationSimulateBreakdownItemVO item = new HrCompensationSimulateBreakdownItemVO();
            item.setComponentId(comp.getId());
            item.setComponentCode(code);
            item.setComponentName(comp.getComponentName());
            item.setComponentType(type);
            item.setAmount(amount);
            item.setTaxable(taxable);
            breakdown.add(item);
            if ("DEDUCTION".equalsIgnoreCase(type)) {
                gross = gross.subtract(amount);
                if (taxable == 1) {
                    taxableGross = taxableGross.subtract(amount);
                }
            } else {
                gross = gross.add(amount);
                if (taxable == 1) {
                    taxableGross = taxableGross.add(amount);
                }
            }
        }

        BigDecimal socialBase = request.getSocialBase() == null ? gross : request.getSocialBase();
        BigDecimal socialRate = request.getSocialPersonalRate() == null
                ? DEFAULT_SOCIAL_PERSONAL_RATE : request.getSocialPersonalRate();
        BigDecimal socialPersonal = socialBase.multiply(socialRate).setScale(2, RoundingMode.HALF_UP);

        BigDecimal specialDeductions = request.getSpecialDeductions() == null
                ? BigDecimal.ZERO : request.getSpecialDeductions();

        BigDecimal taxableIncome = taxableGross
                .subtract(socialPersonal)
                .subtract(MONTHLY_THRESHOLD)
                .subtract(specialDeductions);
        if (taxableIncome.signum() < 0) {
            taxableIncome = BigDecimal.ZERO;
        }

        BigDecimal personalTax = calculateMonthlyTax(taxableIncome);
        BigDecimal netSalary = gross.subtract(socialPersonal).subtract(personalTax).setScale(2, RoundingMode.HALF_UP);

        HrCompensationSimulateVO vo = new HrCompensationSimulateVO();
        vo.setEmployeeId(request.getEmployeeId());
        vo.setStructureId(request.getStructureId());
        vo.setGradeId(request.getGradeId());
        vo.setCity(request.getCity());
        vo.setGross(gross.setScale(2, RoundingMode.HALF_UP));
        vo.setTaxableGross(taxableGross.setScale(2, RoundingMode.HALF_UP));
        vo.setSocialBase(socialBase.setScale(2, RoundingMode.HALF_UP));
        vo.setSocialPersonalRate(socialRate);
        vo.setSocialPersonal(socialPersonal);
        vo.setSpecialDeductions(specialDeductions);
        vo.setThreshold(MONTHLY_THRESHOLD);
        vo.setTaxableIncome(taxableIncome.setScale(2, RoundingMode.HALF_UP));
        vo.setPersonalTax(personalTax);
        vo.setNetSalary(netSalary);
        vo.setBreakdown(breakdown);
        return vo;
    }

    private BigDecimal calculateMonthlyTax(BigDecimal taxableIncome) {
        if (taxableIncome.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        for (BigDecimal[] bracket : TAX_BRACKETS) {
            BigDecimal low = bracket[0];
            BigDecimal high = bracket[1];
            BigDecimal rate = bracket[2];
            BigDecimal quick = bracket[3];
            if (taxableIncome.compareTo(low) > 0 && (high == null || taxableIncome.compareTo(high) <= 0)) {
                return taxableIncome.multiply(rate).subtract(quick).setScale(2, RoundingMode.HALF_UP);
            }
        }
        return BigDecimal.ZERO;
    }
}
