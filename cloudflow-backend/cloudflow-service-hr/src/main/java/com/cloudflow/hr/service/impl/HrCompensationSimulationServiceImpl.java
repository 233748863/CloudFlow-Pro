package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.dto.HrCompensationSimulateRequest;
import com.cloudflow.hr.domain.entity.HrCompComponent;
import com.cloudflow.hr.domain.entity.HrCompGrade;
import com.cloudflow.hr.domain.entity.HrCompStructure;
import com.cloudflow.hr.domain.entity.HrEmployeeComp;
import com.cloudflow.hr.domain.vo.compensation.HrCompensationSimulateBreakdownItemVO;
import com.cloudflow.hr.domain.vo.compensation.HrCompensationSimulateVO;
import com.cloudflow.hr.mapper.HrCompComponentMapper;
import com.cloudflow.hr.mapper.HrCompGradeMapper;
import com.cloudflow.hr.mapper.HrCompStructureMapper;
import com.cloudflow.hr.service.IHrCompensationSimulationService;
import com.cloudflow.hr.service.HrPayrollCalculationService;
import com.cloudflow.hr.service.HrRuleSupport;
import com.cloudflow.hr.exception.HrBusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.HashSet;
import java.util.Set;

import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

/**
 * HR-P1-2 薪酬模拟实现。
 *
 * <p>计算规则（既有月度估算参数；不代表2026正式税率或累计发薪结果）：
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
public class HrCompensationSimulationServiceImpl implements IHrCompensationSimulationService {

    private static final BigDecimal MAX_MONEY = new BigDecimal("9999999999999999.99");

    /** 兜底默认值：月度个税起征点（实际值从 sys.hr.compensation.monthlyTaxThreshold 读取） */
    private static final BigDecimal DEFAULT_MONTHLY_THRESHOLD = BigDecimal.valueOf(5000);

    /** 兜底默认值：个人合计社保费率（实际值从 sys.hr.compensation.socialPersonalRate 读取） */
    private static final BigDecimal DEFAULT_SOCIAL_PERSONAL_RATE = new BigDecimal("0.105");

    /** 兜底默认月度税率（按累计预扣预缴月度近似，下限/上限/税率/速算扣除）。实际从字典 hr_personal_income_tax 加载。 */
    private static final BigDecimal[][] DEFAULT_TAX_BRACKETS = new BigDecimal[][]{
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
    private final HrCompStructureMapper structureMapper;
    private final HrPayrollCalculationService payrollCalculation;
    private final HrRuleSupport support;
    private final com.cloudflow.common.redis.core.SysConfigHelper sysConfigHelper;
    private final com.cloudflow.common.redis.core.SysDictHelper sysDictHelper;

    private BigDecimal monthlyThreshold() {
        return money(decimal(sysConfigHelper.getConfigValue(
                "sys.hr.compensation.monthlyTaxThreshold",
                DEFAULT_MONTHLY_THRESHOLD.toPlainString()), "月度起征额"), "月度起征额");
    }

    private BigDecimal defaultSocialPersonalRate() {
        return rate(decimal(sysConfigHelper.getConfigValue(
                "sys.hr.compensation.socialPersonalRate",
                DEFAULT_SOCIAL_PERSONAL_RATE.toPlainString()), "个人缴费比例"));
    }

    /**
     * 从字典 {@code hr_personal_income_tax} 加载税率档。
     * <p><b>字典约定：</b>
     * <ul>
     *   <li>dict_value = 本档应税所得 <b>上限</b>（按月度），单位元</li>
     *   <li>list_class = 税率，取值 0~1（如 0.10 表示 10%）</li>
     *   <li>css_class = 速算扣除数，单位元</li>
     *   <li>末档 dict_value &gt;= 99999999 视为不封顶（自动转为 null）</li>
     *   <li>按 dict_value 升序排序后逐档判断 taxableIncome 是否落入 (prevHigh, currHigh] 区间</li>
     * </ul>
     * 字典为空时使用既有估算参数；存在但无效的配置明确拒绝。
     */
    private BigDecimal[][] taxBrackets() {
        java.util.List<com.cloudflow.common.redis.core.SysDictHelper.DictItem> items =
                sysDictHelper.getDictData("hr_personal_income_tax");
        if (items == null || items.isEmpty()) {
            return DEFAULT_TAX_BRACKETS;
        }
        java.util.List<com.cloudflow.common.redis.core.SysDictHelper.DictItem> sorted = new ArrayList<>(items);
        if (sorted.size() != 7) throw invalid("模拟税率须配置完整7档");
        sorted.sort(java.util.Comparator.comparing(d -> {
            BigDecimal v = d.getValueAsDecimal();
            return v == null ? BigDecimal.valueOf(Long.MAX_VALUE) : v;
        }));
        BigDecimal[][] brackets = new BigDecimal[sorted.size()][4];
        BigDecimal prevHigh = BigDecimal.ZERO;
        for (int i = 0; i < sorted.size(); i++) {
            com.cloudflow.common.redis.core.SysDictHelper.DictItem item = sorted.get(i);
            BigDecimal high = item.getValueAsDecimal();
            if (high == null || high.compareTo(prevHigh) <= 0) throw invalid("模拟税率档位上限须递增");
            BigDecimal rate = rate(decimal(item.getListClass(), "模拟税率"));
            BigDecimal quick = money(decimal(item.getCssClass(), "模拟速算扣除"), "模拟速算扣除");
            // 末档 dict_value 通常是大数（如 99999999），视为不封顶
            BigDecimal effectiveHigh = (i == sorted.size() - 1 && high != null
                    && high.compareTo(new BigDecimal("99999999")) >= 0) ? null : high;
            if (i == sorted.size() - 1 && effectiveHigh != null) throw invalid("模拟税率末档须不封顶");
            BigDecimal previousTax = i == 0 ? BigDecimal.ZERO
                    : prevHigh.multiply(brackets[i - 1][2]).subtract(brackets[i - 1][3]);
            if (prevHigh.multiply(rate).subtract(quick).compareTo(previousTax) != 0) throw invalid("模拟税率与速算扣除须连续衔接");
            brackets[i][0] = prevHigh;
            brackets[i][1] = effectiveHigh;
            brackets[i][2] = rate;
            brackets[i][3] = quick;
            if (high != null) {
                prevHigh = high;
            }
        }
        return brackets;
    }

    @Override
    public HrCompensationSimulateVO simulate(HrCompensationSimulateRequest request) {
        if (request == null) throw invalid("请填写模拟条件");
        if (request.getCity() != null && !request.getCity().isBlank()) throw invalid("模拟器暂不支持地区自动计费，请明确填写个人缴费基数、比例及专项扣除");
        HrEmployeeComp baseline = null;
        if (request.getEmployeeId() != null) {
            support.assertEmployeeScope(request.getEmployeeId());
            baseline = payrollCalculation.compensation(request.getEmployeeId(), LocalDate.now());
        }
        Long structureId = request.getStructureId() != null ? request.getStructureId() : baseline == null ? null : baseline.getStructureId();
        HrCompStructure structure = structureId == null ? null : structureMapper.selectById(structureId);
        if (structure == null || !Objects.equals(structure.getTenantId(), tenantId()) || !Integer.valueOf(1).equals(structure.getStatus())) throw invalid("请选择本租户已启用的薪资结构");
        List<HrCompComponent> components = structureComponents(structure);
        Map<String, BigDecimal> values = baselineValues(baseline, components);
        BigDecimal gradeMid = null;
        if (request.getGradeId() != null) {
            HrCompGrade grade = compGradeMapper.selectOne(
                    new LambdaQueryWrapper<HrCompGrade>()
                            .eq(HrCompGrade::getId, request.getGradeId())
                            .eq(HrCompGrade::getTenantId, tenantId()).eq(HrCompGrade::getStatus, 1));
            if (grade == null || !"CNY".equals(grade.getCurrency())) throw invalid("请选择本租户已启用的人民币薪级");
            gradeMid = money(grade.getMidSalary(), "薪级中位工资");
        }

        Map<String, BigDecimal> overrides = request.getComponentOverrides() == null
                ? new LinkedHashMap<>() : request.getComponentOverrides();
        for (Map.Entry<String, BigDecimal> entry : overrides.entrySet()) {
            if (components.stream().noneMatch(component -> Objects.equals(component.getComponentCode(), entry.getKey()))) throw invalid("覆盖项目须属于所选薪资结构");
            values.put(entry.getKey(), money(entry.getValue(), "项目覆盖金额"));
        }
        if (gradeMid != null) {
            HrCompComponent base = uniqueBase(components);
            values.putIfAbsent(base.getComponentCode(), gradeMid);
        }

        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal taxableGross = BigDecimal.ZERO;
        List<HrCompensationSimulateBreakdownItemVO> breakdown = new ArrayList<>();
        for (HrCompComponent comp : components) {
            String code = comp.getComponentCode();
            String type = comp.getComponentType();
            Integer taxable = comp.getTaxable() == null ? 1 : comp.getTaxable();
            BigDecimal amount = values.getOrDefault(code, BigDecimal.ZERO);
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
            } else if (!"COMPANY".equals(type)) {
                gross = gross.add(amount);
                if (taxable == 1) {
                    taxableGross = taxableGross.add(amount);
                }
            }
        }

        BigDecimal socialBase = money(request.getSocialBase() == null ? gross.max(BigDecimal.ZERO) : request.getSocialBase(), "个人缴费基数");
        BigDecimal socialRate = request.getSocialPersonalRate() == null
                ? defaultSocialPersonalRate() : rate(request.getSocialPersonalRate());
        BigDecimal socialPersonal = socialBase.multiply(socialRate).setScale(2, RoundingMode.HALF_UP);

        BigDecimal specialDeductions = request.getSpecialDeductions() == null
                ? BigDecimal.ZERO : money(request.getSpecialDeductions(), "专项扣除");

        BigDecimal monthlyThreshold = monthlyThreshold();
        BigDecimal taxableIncome = taxableGross
                .subtract(socialPersonal)
                .subtract(monthlyThreshold)
                .subtract(specialDeductions);
        if (taxableIncome.signum() < 0) {
            taxableIncome = BigDecimal.ZERO;
        }

        BigDecimal personalTax = calculateMonthlyTax(taxableIncome);
        BigDecimal netSalary = gross.subtract(socialPersonal).subtract(personalTax).setScale(2, RoundingMode.HALF_UP);

        HrCompensationSimulateVO vo = new HrCompensationSimulateVO();
        vo.setEmployeeId(request.getEmployeeId());
        vo.setStructureId(structureId);
        vo.setGradeId(request.getGradeId());
        vo.setCity(request.getCity());
        vo.setGross(gross.setScale(2, RoundingMode.HALF_UP));
        vo.setTaxableGross(taxableGross.setScale(2, RoundingMode.HALF_UP));
        vo.setSocialBase(socialBase.setScale(2, RoundingMode.HALF_UP));
        vo.setSocialPersonalRate(socialRate);
        vo.setSocialPersonal(socialPersonal);
        vo.setSpecialDeductions(specialDeductions);
        vo.setThreshold(monthlyThreshold);
        vo.setTaxableIncome(taxableIncome.setScale(2, RoundingMode.HALF_UP));
        vo.setPersonalTax(personalTax);
        vo.setNetSalary(netSalary);
        vo.setBreakdown(breakdown);
        return vo;
    }

    private List<HrCompComponent> structureComponents(HrCompStructure structure) {
        JsonNode configured = structure.getComponentConfig() == null ? null : structure.getComponentConfig().get("itemIds");
        if (configured == null || !configured.isArray() || configured.isEmpty()) throw invalid("请先为薪资结构配置项目");
        Set<Long> ids = new HashSet<>();
        for (JsonNode id : configured) {
            if (!id.isIntegralNumber() || !id.canConvertToLong() || id.longValue() <= 0 || !ids.add(id.longValue())) throw invalid("薪资结构项目编号无效或重复");
        }
        List<HrCompComponent> components = compComponentMapper.selectList(new LambdaQueryWrapper<HrCompComponent>()
                .eq(HrCompComponent::getTenantId, tenantId()).eq(HrCompComponent::getStatus, 1).in(HrCompComponent::getId, ids)
                .orderByAsc(HrCompComponent::getSortOrder).orderByAsc(HrCompComponent::getId));
        if (components.size() != ids.size()) throw invalid("薪资结构含停用、缺失或其他租户的项目");
        Set<String> codes = new HashSet<>();
        for (HrCompComponent component : components) {
            if (component.getComponentCode() == null || component.getComponentCode().isBlank() || !codes.add(component.getComponentCode())
                    || component.getComponentType() == null || !List.of("FIXED", "VARIABLE", "EARNING", "DEDUCTION", "COMPANY").contains(component.getComponentType())
                    || component.getTaxable() != null && !List.of(0, 1).contains(component.getTaxable())) throw invalid("薪资项目类型、计税标记或编码无效");
        }
        return components;
    }

    private Map<String, BigDecimal> baselineValues(HrEmployeeComp baseline, List<HrCompComponent> components) {
        Map<String, BigDecimal> values = new LinkedHashMap<>();
        if (baseline == null) return values;
        Map<String, Object> saved = baseline.getComponentValues();
        if (saved == null || saved.isEmpty()) {
            values.put(uniqueBase(components).getComponentCode(), money(baseline.getTotalSalary(), "员工已生效工资"));
            return values;
        }
        for (Map.Entry<String, Object> entry : saved.entrySet()) {
            List<HrCompComponent> matches = components.stream().filter(component -> Objects.equals(component.getComponentCode(), entry.getKey())
                    || component.getId().toString().equals(entry.getKey())).toList();
            if (matches.size() != 1) throw invalid("员工薪资组成无法对应所选结构，请使用一致的结构或取消基准员工后逐项填写");
            String code = matches.get(0).getComponentCode();
            if (values.putIfAbsent(code, money(decimal(entry.getValue(), "员工薪资项目"), "员工薪资项目")) != null) throw invalid("员工薪资组成重复引用同一项目");
        }
        return values;
    }

    private HrCompComponent uniqueBase(List<HrCompComponent> components) {
        List<HrCompComponent> bases = components.stream().filter(component -> "BASE".equals(component.getCategory())
                && List.of("FIXED", "VARIABLE", "EARNING").contains(component.getComponentType())).toList();
        if (bases.size() != 1) throw invalid("以总额或薪级填入基本工资时，结构须有唯一的基本工资项目");
        return bases.get(0);
    }

    private static BigDecimal decimal(Object value, String label) {
        if (value == null) throw invalid(label + "不能为空");
        try { return new BigDecimal(value.toString()); }
        catch (NumberFormatException failure) { throw invalid(label + "须为有效金额或比例"); }
    }

    private static BigDecimal money(BigDecimal value, String label) {
        if (value == null || value.signum() < 0 || value.compareTo(MAX_MONEY) > 0 || value.stripTrailingZeros().scale() > 2) throw invalid(label + "须在0至9999999999999999.99元之间，最多两位小数");
        return value.setScale(2);
    }

    private static BigDecimal rate(BigDecimal value) {
        if (value == null || value.signum() < 0 || value.compareTo(BigDecimal.ONE) > 0) throw invalid("比例须在0至1之间");
        return value;
    }

    private static HrBusinessException invalid(String message) {
        return new HrBusinessException("SIMULATION_INVALID", message);
    }

    private BigDecimal calculateMonthlyTax(BigDecimal taxableIncome) {
        if (taxableIncome.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        for (BigDecimal[] bracket : taxBrackets()) {
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
