package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.OaSupplierQuotationItem;
import java.math.BigDecimal;
import java.math.RoundingMode;

public final class OaRfqQuoteCalculator {
    private OaRfqQuoteCalculator() { }

    public record Amounts(BigDecimal net, BigDecimal tax, BigDecimal gross) { }

    public static Amounts calculate(OaSupplierQuotationItem item) {
        if (item.getQuantity() == null || item.getQuantity() <= 0) throw new IllegalArgumentException("报价数量必须为正整数");
        BigDecimal unitPrice = OaRecordSupport.decimal(item.getUnitPrice(), 10, 2, false, "未税报价单价");
        BigDecimal discount = ratio(item.getDiscountRate() == null ? BigDecimal.ONE : item.getDiscountRate(), "折扣比例");
        BigDecimal taxRate = ratio(item.getTaxRate() == null ? BigDecimal.ZERO : item.getTaxRate(), "税率");
        BigDecimal net = unitPrice.multiply(BigDecimal.valueOf(item.getQuantity())).multiply(discount).setScale(2, RoundingMode.HALF_UP);
        BigDecimal tax = net.multiply(taxRate).setScale(2, RoundingMode.HALF_UP);
        item.setUnitPrice(unitPrice); item.setDiscountRate(discount); item.setTaxRate(taxRate); item.setLineAmount(money(net));
        return new Amounts(net, money(tax), money(net.add(tax)));
    }

    public static BigDecimal money(BigDecimal value) { return OaRecordSupport.decimal(value, 10, 2, false, "询价采购金额"); }

    private static BigDecimal ratio(BigDecimal value, String label) {
        BigDecimal result = OaRecordSupport.decimal(value, 6, 4, false, label);
        if (result.compareTo(BigDecimal.ONE) > 0) throw new IllegalArgumentException(label + "必须在0至1之间");
        return result;
    }
}
