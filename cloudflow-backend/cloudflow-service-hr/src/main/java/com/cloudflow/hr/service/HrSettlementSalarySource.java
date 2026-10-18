package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrPayrollCorrection;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrPayrollCorrectionMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.service.HrSettlementCalculation.Fraction;
import com.cloudflow.hr.service.HrSettlementCalculation.SalarySample;
import com.cloudflow.hr.service.HrSettlementCalculation.SamplingSelection;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** Read-only sampling of sealed payroll. No calendar lookup and no historical snapshot repair. */
@Service
@RequiredArgsConstructor
public class HrSettlementSalarySource {
    private final HrSalarySlipMapper salaries;
    private final HrPayrollCorrectionMapper corrections;
    private final IHrEssService payroll;
    private final HrHSupport access;
    private final ObjectMapper json;
    private final HrCommissionService commissions;

    public record Issue(Long salarySlipId, String month, String code, String message) { }
    public record Inspection(List<SalarySample> samples, List<Issue> issues, JsonNode evidence) {
        public Inspection { samples = List.copyOf(samples); issues = List.copyOf(issues); }
    }
    private record Range(LocalDate from, LocalDate to) { }
    private record Portion(Range range, Fraction selected, JsonNode evidence) { }

    /** componentIds must come from the selected confirmed policy, never from an average-wage input. */
    public Inspection inspect(Long employeeId, LocalDate relievingDate, SamplingSelection selection, Set<Long> componentIds) {
        access.permission("hr:settlement:calculate"); access.scope(employeeId);
        HrEmployee employee = access.employee(employeeId);
        if (relievingDate == null || employee.getHireDate() == null || relievingDate.isBefore(employee.getHireDate())
                || relievingDate.getYear() > 9999 || employee.getHireDate().getYear() < 1000) throw HrHException.invalid("入职或离职日期无效");
        if (selection == null || componentIds == null || componentIds.isEmpty() || componentIds.size() > 100
                || componentIds.stream().anyMatch(id -> id == null || id <= 0)) throw HrHException.invalid("缺少本单取样核定或政策工资项目");
        for (YearMonth month : selection.months()) {
            if (month.isBefore(YearMonth.from(employee.getHireDate())) || month.isAfter(YearMonth.from(relievingDate))) throw HrHException.invalid("取样月份须位于本次在职期间");
        }
        List<HrSalarySlip> rows = salaries.selectList(new LambdaQueryWrapper<HrSalarySlip>()
                .eq(HrSalarySlip::getTenantId, HrRuleSupport.tenantId()).eq(HrSalarySlip::getEmployeeId, employeeId)
                .eq(HrSalarySlip::getDeleted, 0).orderByAsc(HrSalarySlip::getId));
        Map<Long, HrSalarySlip> byId = new HashMap<>(); rows.forEach(row -> byId.put(row.getId(), row));
        Map<Long, List<HrPayrollCorrection>> correctionBySlip = new HashMap<>();
        if (!byId.isEmpty()) {
            for (HrPayrollCorrection row : corrections.selectList(new LambdaQueryWrapper<HrPayrollCorrection>()
                    .eq(HrPayrollCorrection::getTenantId, HrRuleSupport.tenantId()).eq(HrPayrollCorrection::getDeleted, 0)
                    .and(query -> query.in(HrPayrollCorrection::getOriginalSlipId, byId.keySet()).or().in(HrPayrollCorrection::getCorrectionSlipId, byId.keySet())))) {
                correctionBySlip.computeIfAbsent(row.getCorrectionSlipId(), ignored -> new ArrayList<>()).add(row);
            }
        }
        List<Issue> issues = new ArrayList<>(); List<JsonNode> wages = new ArrayList<>();
        Map<YearMonth, List<Portion>> portions = new LinkedHashMap<>();
        selection.months().forEach(month -> portions.put(month, new ArrayList<>()));
        for (HrSalarySlip row : rows) {
            if ("CANCELLED".equals(row.getStatus())) continue;
            try {
                JsonNode components = json.valueToTree(row.getComponents());
                JsonNode tax = unique(components, "type", "TAX_SNAPSHOT");
                Range period = range(tax, "periodStart", "periodEnd");
                require(YearMonth.from(period.to()).toString().equals(row.getPeriodMonth()), "工资期间与封存月份不一致");
                require(tax.path("correction").isBoolean(), "工资缺少明确的原单或补正标记");
                List<HrPayrollCorrection> links = correctionBySlip.getOrDefault(row.getId(), List.of());
                boolean correction = tax.path("correction").asBoolean(false) || !links.isEmpty();
                if (correction) {
                    require(links.size() == 1 && tax.path("correction").isBoolean() && tax.path("correction").booleanValue(), "工资补正缺少唯一真实来源");
                    HrPayrollCorrection link = links.get(0);
                    require(Objects.equals(link.getOriginalSlipId(), identifier(tax.path("originalSlipId"))), "补正原工资与封存记录不一致");
                    HrSalarySlip original = byId.get(link.getOriginalSlipId());
                    require(original != null, "补正原工资缺失或不属于本员工");
                    Range originalPeriod = range(unique(json.valueToTree(original.getComponents()), "type", "TAX_SNAPSHOT"), "periodStart", "periodEnd");
                    if (!selected(originalPeriod, selection) && !selected(period, selection)) continue;
                    sealed(original); require("PAID".equals(original.getStatus()), "补正原工资尚未实际发放");
                    sealed(row); require("APPLIED".equals(link.getStatus()), "工资补正尚未完成核定");
                    require(link.getVersion() != null && link.getVersion() >= 0 && link.getReason() != null && !link.getReason().isBlank(), "工资补正缺少版本或核定原因");
                    require(decimal(row.getGrossTotal()).signum() == 0, "工资补正缺少项目及原月份归属，请先核实补偿工资来源");
                    for (JsonNode component : components) {
                        if ("EARNING".equals(component.path("type").asText())) require(decimal(component.path("amount")).signum() == 0, "补正收入缺少可核对的项目归属");
                    }
                    ObjectNode evidence = wageEvidence(row); evidence.put("correctionId", link.getCorrectionId().toString());
                    evidence.put("correctionVersion", link.getVersion()); evidence.put("originalSlipId", original.getId().toString());
                    evidence.put("incomeEffect", "ZERO_VERIFIED"); wages.add(evidence); continue;
                }
                if (!selected(period, selection)) continue;
                Set<Long> verifiedCommissions = sealed(row);
                require(!period.to().isAfter(relievingDate), "所选工资周期晚于离职日期，请先核定离职期间工资");
                List<Portion> extracted = extract(components, period, employee.getHireDate(), componentIds, row.getGrossTotal(), verifiedCommissions);
                for (Portion portion : extracted) {
                    List<Portion> month = portions.get(YearMonth.from(portion.range().from()));
                    if (month != null) month.add(portion);
                }
                ObjectNode evidence = wageEvidence(row); evidence.set("monthlyAttribution", json.valueToTree(extracted.stream().map(Portion::evidence).toList())); wages.add(evidence);
            } catch (IllegalArgumentException | HrBusinessException failure) {
                // A broken period may conceal a selected month; do not silently classify it from its display label.
                issues.add(new Issue(row.getId(), null, "SETTLEMENT_SAMPLE_SOURCE_INVALID", failure.getMessage()));
            }
        }
        for (Map.Entry<Long, List<HrPayrollCorrection>> entry : correctionBySlip.entrySet()) {
            if (!byId.containsKey(entry.getKey())) {
                for (HrPayrollCorrection link : entry.getValue()) {
                    HrSalarySlip original = byId.get(link.getOriginalSlipId());
                    if (original == null) continue;
                    try {
                        if (selected(range(unique(json.valueToTree(original.getComponents()), "type", "TAX_SNAPSHOT"), "periodStart", "periodEnd"), selection)
                                && !List.of("REJECTED", "CANCELLED").contains(String.valueOf(link.getStatus()))) {
                            issues.add(new Issue(original.getId(), null, "SETTLEMENT_SAMPLE_CORRECTION_MISSING", "取样工资有关联补正但补正工资缺失，请核实来源"));
                        }
                    } catch (IllegalArgumentException failure) { issues.add(new Issue(original.getId(), null, "SETTLEMENT_SAMPLE_CORRECTION_MISSING", "补正原工资期间无法核对")); }
                }
            }
        }
        List<SalarySample> samples = new ArrayList<>();
        for (Map.Entry<YearMonth, List<Portion>> entry : portions.entrySet()) {
            YearMonth month = entry.getKey(); LocalDate from = later(month.atDay(1), employee.getHireDate()); LocalDate to = earlier(month.atEndOfMonth(), relievingDate);
            LocalDate next = from; Fraction sum = Fraction.of(0); boolean complete = true;
            for (Portion portion : entry.getValue().stream().sorted(Comparator.comparing(value -> value.range().from())).toList()) {
                if (!portion.range().from().equals(next) || portion.range().to().isAfter(to)) { complete = false; break; }
                next = portion.range().to().plusDays(1); sum = sum.add(portion.selected());
            }
            if (!complete || !next.equals(to.plusDays(1))) issues.add(new Issue(null, month.toString(), "SETTLEMENT_SAMPLE_COVERAGE_MISSING", "取样月份工资存在缺期或重叠，不能按零工资计算"));
            else {
                try { samples.add(new SalarySample(month, sum.numerator(), sum.denominator())); }
                catch (IllegalArgumentException failure) { issues.add(new Issue(null, month.toString(), "SETTLEMENT_SAMPLE_AMOUNT_INVALID", failure.getMessage())); }
            }
        }
        ObjectNode evidence = json.createObjectNode(); evidence.put("version", 1);
        evidence.set("months", json.valueToTree(selection.months().stream().map(YearMonth::toString).toList()));
        evidence.put("averagingMonths", selection.averagingMonths().toPlainString()); evidence.put("reason", selection.reason());
        evidence.set("salaryComponentIds", json.valueToTree(componentIds.stream().sorted().map(String::valueOf).toList()));
        evidence.set("wages", json.valueToTree(wages));
        evidence.set("samples", json.valueToTree(samples.stream().map(sample -> Map.of("month", sample.month().toString(),
                "amountNumerator", sample.amountNumerator().toString(), "amountDenominator", sample.amountDenominator().toString())).toList()));
        return new Inspection(issues.isEmpty() ? samples : List.of(), issues, evidence);
    }

    private List<Portion> extract(JsonNode components, Range period, LocalDate hireDate, Set<Long> selectedIds, BigDecimal gross) {
        return extract(components, period, hireDate, selectedIds, gross, Set.of());
    }

    private List<Portion> extract(JsonNode components, Range period, LocalDate hireDate, Set<Long> selectedIds, BigDecimal gross, Set<Long> verifiedCommissions) {
        JsonNode basis = unique(components, "type", "PAYROLL_BASIS");
        require(basis.path("evidenceVersion").isIntegralNumber() && basis.path("evidenceVersion").canConvertToInt() && basis.path("evidenceVersion").intValue() == 2
                && "PROPORTIONAL_POSTED_FIXED_GROSS".equals(basis.path("componentAllocation").asText()), "工资缺少可核对的逐月分摊证据");
        require(range(basis, "periodStart", "periodEnd").equals(period), "计薪与税务封存期间不一致");
        LocalDate eligible = date(basis.path("eligibleStart"));
        require(eligible.equals(later(period.from(), hireDate)), "计薪资格起日与入职日期不一致，请核实历史人员资料");
        BigDecimal configured = nonnegative(basis.path("configuredSalary")); BigDecimal posted = nonnegative(basis.path("postedFixedGross"));
        BigDecimal totalFixed = BigDecimal.ZERO; BigDecimal selectedFixed = BigDecimal.ZERO; BigDecimal variable = BigDecimal.ZERO; BigDecimal earnings = BigDecimal.ZERO;
        Map<YearMonth, BigDecimal> selectedVariable = new HashMap<>(); Set<Long> fixedIds = new HashSet<>(); Set<Long> changeIds = new HashSet<>();
        int adjustments = 0; int fixedRows = 0;
        for (JsonNode component : components) {
            if (!"EARNING".equals(component.path("type").asText())) continue;
            BigDecimal amount = decimal(component.path("amount")); earnings = earnings.add(amount);
            String source = component.path("sourceType").asText();
            if ("PAYROLL_PRORATION_ADJUSTMENT".equals(source)) {
                adjustments++; require(amount.compareTo(posted.subtract(configured)) == 0, "分摊差额与已封存固定工资不一致"); continue;
            }
            boolean verifiedCommission = "COMPENSATION_CHANGE".equals(source) && "CRM_COMMISSION".equals(component.path("sourceBizType").asText())
                    && verifiedCommissions.contains(identifier(component.path("changeId")));
            require(amount.signum() >= 0 || verifiedCommission, "工资收入为负且缺少项目化补正依据");
            Long componentId = identifier(component.path("salaryComponentId"));
            if ("EMPLOYEE_COMPENSATION".equals(source)) {
                fixedRows++;
                require("VERIFIED".equals(component.path("salaryComponentIdentity").asText()) && fixedIds.add(componentId)
                        && Set.of("FIXED", "VARIABLE", "EARNING").contains(component.path("salaryComponentType").asText()), "固定工资项目未核实、重复或不是收入项目");
                identifier(component.path("employeeCompId")); nonnegativeInteger(component.path("employeeCompVersion"));
                nonnegativeInteger(component.path("salaryComponentVersion"));
                totalFixed = totalFixed.add(amount); if (selectedIds.contains(componentId)) selectedFixed = selectedFixed.add(amount);
            } else if ("COMPENSATION_CHANGE".equals(source)) {
                require(changeIds.add(identifier(component.path("changeId"))), "工资变动来源重复"); nonnegativeInteger(component.path("changeVersion"));
                require(Set.of("HR_REFERRAL", "HR_OVERTIME").contains(component.path("sourceBizType").asText()) || verifiedCommission, "工资变动项目缺少已核实业务来源");
                LocalDate effective = date(component.path("effectiveDate"));
                require(!effective.isBefore(eligible) && !effective.isAfter(period.to()), "变动工资生效日期不在本期在职范围内");
                variable = variable.add(amount);
                if (selectedIds.contains(componentId)) selectedVariable.merge(YearMonth.from(effective), amount, BigDecimal::add);
            } else throw new IllegalArgumentException("收入工资项目缺少明确来源，不能按名称猜测或忽略");
        }
        require(fixedRows > 0 && adjustments == 1 && totalFixed.compareTo(configured) == 0, "固定项目合计与配置工资或分摊记录不一致");
        require(decimal(gross).compareTo(posted.add(variable)) == 0 && earnings.compareTo(gross) == 0, "工资收入明细与实际应发不一致");
        JsonNode monthly = basis.path("monthlyPortions");
        require(monthly.isArray() && monthly.size() > 0 && monthly.size() <= 120, "逐月工资分摊记录缺失或过多");
        String salaryBasis = basis.path("salaryBasis").asText(); String prorationBasis = basis.path("prorationBasis").asText();
        require(Set.of("MONTHLY", "PER_PERIOD").contains(salaryBasis) && Set.of("WORKDAYS", "CALENDAR_DAYS").contains(prorationBasis), "计薪分摊方式无效");
        require(basis.path("fullMonth").isBoolean(), "缺少完整月计薪标记");
        boolean full = basis.path("fullMonth").booleanValue();
        require(full == (period.from().equals(YearMonth.from(period.to()).atDay(1)) && period.to().equals(YearMonth.from(period.to()).atEndOfMonth()) && eligible.equals(period.from())), "完整月计薪标记不一致");
        LocalDate next = eligible; long previousPeriod = 0; Long denominator = null; BigDecimal totalPosted = BigDecimal.ZERO;
        List<Portion> result = new ArrayList<>();
        for (JsonNode part : monthly) {
            Range range = range(part, "from", "to"); YearMonth month = YearMonth.from(range.from());
            require(range.from().equals(next) && range.to().equals(earlier(month.atEndOfMonth(), period.to())) && month.toString().equals(part.path("month").asText()), "逐月分摊期间存在空洞或重叠");
            long previous = nonnegativeInteger(part.path("previousUnits")); long current = nonnegativeInteger(part.path("currentUnits")); long total = nonnegativeInteger(part.path("totalUnits"));
            require(total > 0 && total <= 366000 && previous <= total && current <= total - previous, "工资分摊计薪数量无效");
            if (full) require(previous == 0 && current == 1 && total == 1, "整月工资分摊依据不一致");
            else {
                require(current <= ChronoUnit.DAYS.between(range.from(), range.to()) + 1, "计薪数量超过实际日期数量");
                long totalDays = "MONTHLY".equals(salaryBasis) ? month.lengthOfMonth() : ChronoUnit.DAYS.between(period.from(), period.to()) + 1;
                require(total <= totalDays, "分摊分母超过实际期间");
                long previousDays = "PER_PERIOD".equals(salaryBasis) ? ChronoUnit.DAYS.between(eligible, range.from())
                        : ChronoUnit.DAYS.between(later(hireDate, month.atDay(1)), range.from());
                require(previous <= previousDays, "之前计薪数量超过已发生日期数量");
                if ("PER_PERIOD".equals(salaryBasis)) {
                    require(previous == previousPeriod && (denominator == null || total == denominator), "跨月分期累计数量或分母不一致");
                    previousPeriod += current; denominator = total;
                }
                if ("CALENDAR_DAYS".equals(prorationBasis)) {
                    long expectedPrevious = "PER_PERIOD".equals(salaryBasis) ? ChronoUnit.DAYS.between(eligible, range.from())
                            : ChronoUnit.DAYS.between(later(hireDate, month.atDay(1)), range.from());
                    require(total == totalDays && previous == expectedPrevious && current == ChronoUnit.DAYS.between(range.from(), range.to()) + 1, "自然日分摊数量与封存日期不一致");
                }
            }
            BigDecimal paid = nonnegative(part.path("postedGross"));
            require(HrPayrollProration.portion(configured, previous, current, total).compareTo(paid) == 0, "逐月固定工资与封存分摊计算不一致");
            Fraction selected = configured.signum() == 0 ? Fraction.of(0)
                    : Fraction.of(paid).multiply(Fraction.of(selectedFixed)).divide(Fraction.of(configured));
            selected = selected.add(Fraction.of(selectedVariable.getOrDefault(month, BigDecimal.ZERO)));
            ObjectNode attribution = part.deepCopy(); attribution.put("selectedNumerator", selected.numerator().toString()); attribution.put("selectedDenominator", selected.denominator().toString());
            result.add(new Portion(range, selected, attribution)); next = range.to().plusDays(1); totalPosted = totalPosted.add(paid);
        }
        require(next.equals(period.to().plusDays(1)) && totalPosted.compareTo(posted) == 0, "逐月归集合计与已封存实际工资不一致");
        return result;
    }

    private Set<Long> sealed(HrSalarySlip row) {
        require(Set.of("SUBMITTED", "CONFIRMED", "PAID").contains(String.valueOf(row.getStatus())), "取样工资尚未核定");
        require(row.getVersion() != null && row.getVersion() >= 0 && row.getDigestSha256() != null && row.getDigestSha256().matches("[a-fA-F0-9]{64}"), "取样工资缺少封存版本或摘要");
        payroll.verifySalarySlip(row);
        require(decimal(row.getGrossTotal()).subtract(decimal(row.getDeductionTotal())).compareTo(decimal(row.getNetTotal())) == 0, "取样工资应发扣款与净额不一致");
        return commissions.verifiedSalarySources(row);
    }
    private ObjectNode wageEvidence(HrSalarySlip row) {
        ObjectNode node = json.createObjectNode(); node.put("salarySlipId", row.getId().toString()); node.put("version", row.getVersion());
        node.put("digestSha256", row.getDigestSha256()); node.put("status", row.getStatus()); node.set("components", json.valueToTree(row.getComponents())); return node;
    }
    private static JsonNode unique(JsonNode rows, String key, String value) {
        require(rows != null && rows.isArray(), "工资明细缺失"); JsonNode result = null;
        for (JsonNode row : rows) if (value.equals(row.path(key).asText())) { require(result == null, "工资依据重复"); result = row; }
        require(result != null, "工资缺少" + value + "封存依据"); return result;
    }
    private static boolean selected(Range range, SamplingSelection selection) { return selection.months().stream().anyMatch(month -> !range.to().isBefore(month.atDay(1)) && !range.from().isAfter(month.atEndOfMonth())); }
    private static Range range(JsonNode node, String start, String end) { LocalDate from = date(node.path(start)); LocalDate to = date(node.path(end)); require(!from.isAfter(to), "工资期间无效"); return new Range(from, to); }
    private static LocalDate date(JsonNode node) { try { LocalDate value = LocalDate.parse(node.asText()); require(value.getYear() >= 1000 && value.getYear() <= 9999, "日期无效"); return value; } catch (java.time.DateTimeException failure) { throw new IllegalArgumentException("工资封存日期无效"); } }
    private static Long identifier(JsonNode node) { require(node.isIntegralNumber() || node.isTextual() && node.textValue().matches("[1-9][0-9]{0,18}"), "工资项目或来源标识缺失"); try { long id = new BigDecimal(node.asText()).longValueExact(); require(id > 0, "工资来源标识无效"); return id; } catch (ArithmeticException failure) { throw new IllegalArgumentException("工资来源标识无效"); } }
    private static long nonnegativeInteger(JsonNode node) { require(node.isIntegralNumber() && node.canConvertToLong() && node.longValue() >= 0, "工资来源版本或计薪数量缺失"); return node.longValue(); }
    private static BigDecimal decimal(JsonNode node) { require(node.isNumber() || node.isTextual(), "工资金额缺失"); try { return HrSettlementCalculation.signedMoney(new BigDecimal(node.asText())); } catch (NumberFormatException failure) { throw new IllegalArgumentException("工资金额无效"); } }
    private static BigDecimal decimal(BigDecimal amount) { return HrSettlementCalculation.signedMoney(amount); }
    private static BigDecimal nonnegative(JsonNode node) { BigDecimal value = decimal(node); require(value.signum() >= 0, "固定工资金额为负"); return value; }
    private static LocalDate later(LocalDate left, LocalDate right) { return left.isAfter(right) ? left : right; }
    private static LocalDate earlier(LocalDate left, LocalDate right) { return left.isBefore(right) ? left : right; }
    private static void require(boolean condition, String message) { if (!condition) throw new IllegalArgumentException(message); }
}
