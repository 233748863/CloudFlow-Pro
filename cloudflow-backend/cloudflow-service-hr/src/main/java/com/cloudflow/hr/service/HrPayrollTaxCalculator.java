package com.cloudflow.hr.service;

import com.cloudflow.hr.exception.HrBusinessException;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;

import static com.cloudflow.hr.service.HrRuleSupport.amount;

public final class HrPayrollTaxCalculator {
    // 正式居民工资税表由种子提供，适用税表仍须经管理员或财务启用。
    public static final String PENDING_RATE_MESSAGE = "请先配置完整税率档位并由管理员或财务启用适用税率表";

    private HrPayrollTaxCalculator() {}

    public static TaxResult calculate(BigDecimal previousRawIncome, BigDecimal previousDeduction,
            BigDecimal previousPaid, BigDecimal currentRawIncome, BigDecimal currentDeduction, List<Bracket> brackets) {
        List<Bracket> ordered = validate(brackets);
        BigDecimal taxable = amount(previousRawIncome.add(currentRawIncome).max(BigDecimal.ZERO));
        Bracket bracket = ordered.stream().filter(item -> taxable.compareTo(item.from()) >= 0
                && (item.to() == null || taxable.compareTo(item.to()) <= 0)).findFirst()
                .orElseThrow(() -> new HrBusinessException("TAX_BRACKET_MISSING", "累计应税所得未匹配到税率档"));
        BigDecimal payable = amount(taxable.multiply(bracket.rate()).subtract(bracket.quickDeduction()).max(BigDecimal.ZERO));
        // 已定决策：本期税额为负按0处理，不退税，年度汇算清缴另行处理，需财务复核。
        BigDecimal currentTax = amount(payable.subtract(previousPaid).max(BigDecimal.ZERO));
        return new TaxResult(taxable, amount(previousDeduction.add(currentDeduction)), payable, amount(previousPaid), currentTax, bracket);
    }

    public static List<Bracket> validate(List<Bracket> brackets) {
        if (brackets == null || brackets.isEmpty()) throw new HrBusinessException("TAX_TABLE_PENDING", PENDING_RATE_MESSAGE);
        if (brackets.stream().anyMatch(item -> item == null || item.from() == null || item.rate() == null || item.quickDeduction() == null)) {
            throw new HrBusinessException("INVALID_TAX_TABLE", "税率档下限、税率及速算扣除数不能为空");
        }
        List<Bracket> ordered = brackets.stream().sorted(Comparator.comparing(Bracket::from)).toList();
        BigDecimal expectedFrom = BigDecimal.ZERO;
        for (int index = 0; index < ordered.size(); index++) {
            Bracket bracket = ordered.get(index);
            if (expectedFrom == null || expectedFrom.compareTo(bracket.from()) != 0 || bracket.rate().signum() < 0
                    || bracket.rate().compareTo(BigDecimal.ONE) > 0 || bracket.quickDeduction().signum() < 0
                    || bracket.to() != null && bracket.to().compareTo(bracket.from()) <= 0) {
                throw new HrBusinessException("INVALID_TAX_TABLE", "税率档须从0连续覆盖，税率须在0至1之间，速算扣除数不可为负");
            }
            expectedFrom = bracket.to();
        }
        if (expectedFrom != null) throw new HrBusinessException("INVALID_TAX_TABLE", "末档税率不可设置收入上限");
        return ordered;
    }

    public record Bracket(BigDecimal from, BigDecimal to, BigDecimal rate, BigDecimal quickDeduction) {}
    public record TaxResult(BigDecimal cumulativeTaxableIncome, BigDecimal cumulativeDeduction,
            BigDecimal cumulativeTaxPayable, BigDecimal cumulativeTaxPaid, BigDecimal currentTax, Bracket bracket) {}
}
