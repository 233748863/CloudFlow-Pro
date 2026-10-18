package com.cloudflow.oa.service.impl;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class ConsumableCostCalculator {
    public static final BigDecimal ZERO = new BigDecimal("0.00");
    public static final BigDecimal MAX_MONEY = new BigDecimal("99999999.99");

    private ConsumableCostCalculator() { }

    public record Balance(int quantity, BigDecimal amount, BigDecimal average) { }

    public static BigDecimal money(BigDecimal value) {
        if (value == null || value.abs().compareTo(MAX_MONEY) > 0 || value.stripTrailingZeros().scale() > 2) {
            throw new IllegalArgumentException("AMOUNT_OUT_OF_RANGE: 金额超出DECIMAL(10,2)范围");
        }
        return value.setScale(2, RoundingMode.UNNECESSARY);
    }

    public static BigDecimal price(BigDecimal value) {
        BigDecimal result = money(value);
        if (result.signum() < 0) throw new IllegalArgumentException("单价不得为负数");
        return result;
    }

    public static int positive(Integer value) {
        if (value == null || value <= 0) throw new IllegalArgumentException("数量必须为1至2147483647的整数");
        return value;
    }

    public static BigDecimal average(int quantity, BigDecimal amount) {
        return quantity == 0 ? ZERO : money(amount.divide(BigDecimal.valueOf(quantity), 2, RoundingMode.HALF_UP));
    }

    public static Balance apply(int quantity, BigDecimal amount, int movement, BigDecimal cost) {
        if (quantity < 0 || amount == null || amount.signum() < 0 || movement == 0) {
            throw new IllegalArgumentException("LEDGER_INCONSISTENT: 库存或流水无效");
        }
        long nextQuantity = (long) quantity + movement;
        if (nextQuantity < 0) throw new IllegalArgumentException("STOCK_NOT_ENOUGH: 库存不足");
        if (nextQuantity > Integer.MAX_VALUE) throw new IllegalArgumentException("QUANTITY_OUT_OF_RANGE: 库存数量溢出");
        if (cost.signum() != 0 && Integer.signum(movement) != cost.signum()) {
            throw new IllegalArgumentException("LEDGER_INCONSISTENT: 数量与金额方向不一致");
        }
        BigDecimal nextAmount = money(money(amount).add(money(cost)));
        if (nextAmount.signum() < 0 || nextQuantity == 0 && nextAmount.signum() != 0) {
            throw new IllegalArgumentException("LEDGER_INCONSISTENT: 库存成本不得为负，出尽后必须归零");
        }
        return new Balance((int) nextQuantity, nextAmount, average((int) nextQuantity, nextAmount));
    }

    public static BigDecimal outbound(int quantity, BigDecimal amount, int requested) {
        positive(requested);
        if (requested > quantity) throw new IllegalArgumentException("STOCK_NOT_ENOUGH: 库存不足");
        price(amount);
        return requested == quantity ? money(amount)
                : money(amount.multiply(BigDecimal.valueOf(requested)).divide(BigDecimal.valueOf(quantity), 2, RoundingMode.HALF_UP));
    }

    public static BigDecimal allocate(BigDecimal total, int ordered, int cumulative, BigDecimal previouslyPosted) {
        positive(ordered);
        if (cumulative < 0 || cumulative > ordered) throw new IllegalArgumentException("累计数量超过来源数量");
        price(total);
        price(previouslyPosted);
        BigDecimal target = total.multiply(BigDecimal.valueOf(cumulative)).divide(BigDecimal.valueOf(ordered), 2, RoundingMode.HALF_UP);
        return price(target.subtract(previouslyPosted));
    }

    public static int cumulative(int current, int change) {
        long next = (long) current + change;
        if (next < 0 || next > Integer.MAX_VALUE) throw new IllegalArgumentException("QUANTITY_OUT_OF_RANGE: 累计数量超出范围");
        return (int) next;
    }
}
