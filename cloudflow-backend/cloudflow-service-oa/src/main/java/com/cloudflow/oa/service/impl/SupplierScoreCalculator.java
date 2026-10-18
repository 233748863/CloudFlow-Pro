package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.OaSupplierScoreCriteria;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class SupplierScoreCalculator {
    private SupplierScoreCalculator() { }

    public static BigDecimal calculate(List<OaSupplierScoreCriteria> criteria) {
        if (criteria == null || criteria.isEmpty()) throw new IllegalArgumentException("评分维度不能为空");
        BigDecimal totalWeight = BigDecimal.ZERO, availableWeight = BigDecimal.ZERO, points = BigDecimal.ZERO;
        Set<String> codes = new HashSet<>();
        for (OaSupplierScoreCriteria item : criteria) {
            item.setCriteriaCode(OaRecordSupport.text(item.getCriteriaCode(), 50, "维度编码"));
            if (!codes.add(item.getCriteriaCode())) throw new IllegalArgumentException("评分维度编码重复");
            BigDecimal weight = OaRecordSupport.decimal(item.getWeight(), 6, 4, false, "维度权重");
            if (weight.compareTo(BigDecimal.ONE) > 0) throw new IllegalArgumentException("权重不能超过1");
            totalWeight = totalWeight.add(weight);
            BigDecimal maximum = OaRecordSupport.decimal(item.getMaxScore(), 5, 2, false, "满分");
            if (maximum.signum() == 0) throw new IllegalArgumentException("维度满分必须大于0");
            if (item.getScore() == null && "AUTO".equals(item.getDataSource())) continue;
            BigDecimal score = OaRecordSupport.decimal(item.getScore(), 5, 2, false, "维度得分");
            if (score.compareTo(maximum) > 0) throw new IllegalArgumentException("得分不能超过满分");
            points = points.add(score.multiply(weight).divide(maximum, 12, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100)));
            availableWeight = availableWeight.add(weight);
        }
        if (totalWeight.compareTo(BigDecimal.ONE) != 0) throw new IllegalArgumentException("评分权重之和必须为1");
        return availableWeight.signum() == 0 ? null : points.divide(availableWeight, 2, RoundingMode.HALF_UP);
    }
}
