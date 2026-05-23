package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.domain.dto.HrCompensationSimulateRequest;
import com.cloudflow.hr.service.HrCompensationSimulationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
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
 *   <li>应发合计 = Σ component_overrides，未显式给出的项目按 grade 的 mid_value 或 0 兜底</li>
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

    private final JdbcTemplate jdbcTemplate;

    @Override
    public Map<String, Object> simulate(HrCompensationSimulateRequest request) {
        if (request == null || request.getStructureId() == null) {
            throw new IllegalArgumentException("structureId 不能为空");
        }
        // 1) 查询结构关联的薪酬项
        List<Map<String, Object>> components = jdbcTemplate.queryForList(
                "SELECT c.id, c.component_code, c.component_name, c.component_type, c.category, c.taxable "
                        + "FROM hr_comp_component c WHERE c.tenant_id=? AND c.deleted=0 AND c.status=1 ORDER BY c.sort_order, c.id",
                TENANT_ID);
        // 2) 查询 grade 中位值
        BigDecimal gradeMid = BigDecimal.ZERO;
        if (request.getGradeId() != null) {
            BigDecimal val = jdbcTemplate.query(
                    "SELECT mid_value FROM hr_comp_grade WHERE id=? AND tenant_id=? AND deleted=0",
                    rs -> rs.next() ? rs.getBigDecimal("mid_value") : null,
                    request.getGradeId(), TENANT_ID);
            gradeMid = val == null ? BigDecimal.ZERO : val;
        }

        Map<String, BigDecimal> overrides = request.getComponentOverrides() == null
                ? new LinkedHashMap<>() : request.getComponentOverrides();

        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal taxableGross = BigDecimal.ZERO;
        List<Map<String, Object>> breakdown = new ArrayList<>();
        for (Map<String, Object> comp : components) {
            String code = String.valueOf(comp.get("component_code"));
            String type = String.valueOf(comp.get("component_type"));
            Integer taxable = comp.get("taxable") == null ? 1 : ((Number) comp.get("taxable")).intValue();
            BigDecimal amount = overrides.getOrDefault(code, BigDecimal.ZERO);
            if (amount.signum() == 0 && "BASE".equalsIgnoreCase(type) && gradeMid.signum() > 0) {
                amount = gradeMid;
            }
            if (amount.signum() == 0) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("componentId", comp.get("id"));
            item.put("componentCode", code);
            item.put("componentName", comp.get("component_name"));
            item.put("componentType", type);
            item.put("amount", amount);
            item.put("taxable", taxable);
            breakdown.add(item);
            // ALLOWANCE/BONUS 视作正项；DEDUCTION 视作减项
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

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("employeeId", request.getEmployeeId());
        result.put("structureId", request.getStructureId());
        result.put("gradeId", request.getGradeId());
        result.put("city", request.getCity());
        result.put("gross", gross.setScale(2, RoundingMode.HALF_UP));
        result.put("taxableGross", taxableGross.setScale(2, RoundingMode.HALF_UP));
        result.put("socialBase", socialBase.setScale(2, RoundingMode.HALF_UP));
        result.put("socialPersonalRate", socialRate);
        result.put("socialPersonal", socialPersonal);
        result.put("specialDeductions", specialDeductions);
        result.put("threshold", MONTHLY_THRESHOLD);
        result.put("taxableIncome", taxableIncome.setScale(2, RoundingMode.HALF_UP));
        result.put("personalTax", personalTax);
        result.put("netSalary", netSalary);
        result.put("breakdown", breakdown);
        return result;
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
