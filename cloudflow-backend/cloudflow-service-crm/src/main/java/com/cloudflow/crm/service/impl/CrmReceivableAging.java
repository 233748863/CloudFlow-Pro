package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.report.ReportValidation;
import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.vo.CrmReceivableAgingBucketVO;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 一次读取并校验账龄规则，建桶、汇总和报表共用同一套编号。 */
public final class CrmReceivableAging {
    private static final List<Tier> DEFAULT_TIERS = List.of(
            new Tier(30, "DUE_TIER_1", "逾期1-30天"),
            new Tier(60, "DUE_TIER_2", "逾期31-60天"),
            new Tier(90, "DUE_TIER_3", "逾期61-90天"),
            new Tier(Long.MAX_VALUE, "DUE_TIER_4", "逾期90天以上"));

    private CrmReceivableAging() { }

    public static List<Tier> loadTiers(SysDictHelper dictionaries) {
        List<SysDictHelper.DictItem> items = dictionaries.getDictData("crm_receivable_overdue_tier");
        if (items.isEmpty()) {
            return DEFAULT_TIERS;
        }
        List<Tier> tiers = new ArrayList<>(items.size());
        Set<Integer> sorts = new HashSet<>();
        for (SysDictHelper.DictItem item : items) {
            BigDecimal threshold = item.getValueAsDecimal();
            Integer sort = item.getSort();
            if (threshold == null || threshold.signum() <= 0 || threshold.stripTrailingZeros().scale() > 0
                    || threshold.compareTo(BigDecimal.valueOf(Long.MAX_VALUE)) > 0
                    || sort == null || sort <= 0 || !sorts.add(sort)) {
                throw ReportValidation.invalid("源业务账龄档位配置无效：天数须为正整数，排序号须为不重复的正整数");
            }
            String code = "DUE_TIER_" + sort;
            tiers.add(new Tier(threshold.longValueExact(), code, item.getLabel() == null ? code : item.getLabel()));
        }
        tiers.sort(Comparator.comparingLong(Tier::days));
        return List.copyOf(tiers);
    }

    static String bucket(LocalDate dueDate, LocalDate today, List<Tier> tiers) {
        if (dueDate == null || !dueDate.isBefore(today)) {
            return "CURRENT";
        }
        long days = ChronoUnit.DAYS.between(dueDate, today);
        for (Tier tier : tiers) {
            if (days <= tier.days()) {
                return tier.code();
            }
        }
        return tiers.get(tiers.size() - 1).code();
    }

    static List<CrmReceivableAgingBucketVO> summarize(List<CrmReceivable> receivables,
                                                     List<Tier> tiers, LocalDate today) {
        Map<String, CrmReceivableAgingBucketVO> buckets = new LinkedHashMap<>();
        buckets.put("CURRENT", createBucket("CURRENT", "未逾期"));
        for (Tier tier : tiers) {
            buckets.put(tier.code(), createBucket(tier.code(), tier.name()));
        }
        Map<String, Set<Long>> customers = new LinkedHashMap<>();
        for (String code : buckets.keySet()) {
            customers.put(code, new HashSet<>());
        }
        for (CrmReceivable receivable : receivables) {
            BigDecimal outstanding = receivable.getOutstandingAmount();
            if (outstanding == null || outstanding.signum() <= 0) {
                continue;
            }
            String code = bucket(receivable.getDueDate(), today, tiers);
            CrmReceivableAgingBucketVO value = buckets.get(code);
            value.setReceivableCount(value.getReceivableCount() + 1);
            value.setOutstandingAmount(value.getOutstandingAmount().add(outstanding));
            if (receivable.getCustomerId() != null) {
                customers.get(code).add(receivable.getCustomerId());
            }
        }
        buckets.forEach((code, value) -> value.setCustomerCount(customers.get(code).size()));
        return new ArrayList<>(buckets.values());
    }

    private static CrmReceivableAgingBucketVO createBucket(String code, String name) {
        CrmReceivableAgingBucketVO bucket = new CrmReceivableAgingBucketVO();
        bucket.setBucketCode(code);
        bucket.setBucketName(name);
        bucket.setCustomerCount(0);
        bucket.setReceivableCount(0);
        bucket.setOutstandingAmount(BigDecimal.ZERO);
        return bucket;
    }

    public record Tier(long days, String code, String name) { }
}
