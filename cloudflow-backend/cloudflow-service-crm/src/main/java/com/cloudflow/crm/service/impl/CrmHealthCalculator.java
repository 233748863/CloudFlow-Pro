package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * 健康度相关的无状态计算。
 * 抽出以便 {@link CrmCustomerServiceImpl} 与 {@link CrmCustomerWorkspaceServiceImpl} 共享。
 */
final class CrmHealthCalculator {

    /** 应收逾期档位字典类型，由 {@link SysDictHelper} 加载，缺失时回退到 30/60/90 内置档 */
    private static final String OVERDUE_DICT_TYPE = "crm_receivable_overdue_tier";

    private CrmHealthCalculator() {
    }

    static LocalDate resolveRenewalWindowDate(CrmRenewalMapper renewalMapper, Long customerId) {
        return renewalMapper.selectList(new LambdaQueryWrapper<CrmRenewal>()
                        .eq(CrmRenewal::getCustomerId, customerId)
                        .eq(CrmRenewal::getDeleted, CrmConstants.DelFlag.NORMAL))
                .stream()
                .filter(item -> !CrmConstants.RenewalStatus.LOST.equalsIgnoreCase(item.getStatus()))
                .map(CrmHealthCalculator::resolveRenewalDate)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(null);
    }

    static LocalDate resolveRenewalDate(CrmRenewal renewal) {
        if (renewal == null) {
            return null;
        }
        if (CrmConstants.RenewalStatus.WON.equalsIgnoreCase(renewal.getStatus())
                || CrmConstants.RenewalStatus.CLOSED.equalsIgnoreCase(renewal.getStatus())) {
            if (renewal.getNextExpireDate() != null) {
                return renewal.getNextExpireDate();
            }
        }
        if (renewal.getCurrentExpireDate() != null) {
            return renewal.getCurrentExpireDate();
        }
        if (renewal.getNextExpireDate() != null) {
            return renewal.getNextExpireDate();
        }
        return renewal.getExpectedSignDate();
    }

    static int resolveMaxOverdueDays(CrmReceivableMapper receivableMapper, Long customerId, LocalDate today) {
        List<CrmReceivable> receivables = receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                .eq(CrmReceivable::getCustomerId, customerId)
                .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL));
        return (int) receivables.stream()
                .filter(item -> item.getDueDate() != null)
                .filter(item -> item.getOutstandingAmount() != null && item.getOutstandingAmount().signum() > 0)
                .filter(item -> item.getDueDate().isBefore(today))
                .mapToLong(item -> ChronoUnit.DAYS.between(item.getDueDate(), today))
                .max()
                .orElse(0L);
    }

    static boolean hasHighSeverityOpenTicket(CrmServiceTicketMapper mapper, Long customerId) {
        return mapper.selectCount(new LambdaQueryWrapper<CrmServiceTicket>()
                .eq(CrmServiceTicket::getCustomerId, customerId)
                .eq(CrmServiceTicket::getDeleted, CrmConstants.DelFlag.NORMAL)
                .in(CrmServiceTicket::getSeverity,
                        CrmConstants.TicketSeverity.HIGH,
                        CrmConstants.TicketSeverity.CRITICAL)
                .notIn(CrmServiceTicket::getStatus,
                        CrmConstants.TicketStatus.RESOLVED,
                        CrmConstants.TicketStatus.CLOSED)) > 0;
    }

    static boolean hasOverdueOpenTicket(CrmServiceTicketMapper mapper, Long customerId, LocalDateTime now) {
        return mapper.selectCount(new LambdaQueryWrapper<CrmServiceTicket>()
                .eq(CrmServiceTicket::getCustomerId, customerId)
                .eq(CrmServiceTicket::getDeleted, CrmConstants.DelFlag.NORMAL)
                .isNotNull(CrmServiceTicket::getDueTime)
                .lt(CrmServiceTicket::getDueTime, now)
                .notIn(CrmServiceTicket::getStatus,
                        CrmConstants.TicketStatus.RESOLVED,
                        CrmConstants.TicketStatus.CLOSED)) > 0;
    }

    /**
     * 根据应收账款到期日和今日，按 {@code crm_receivable_overdue_tier} 字典阈值返回逾期分桶 code。
     * <p>
     * <b>字典约定</b>：dict_value = 本档天数 <b>上限</b>（含），按 dict_value 升序匹配第一个 overdueDays &lt;= value 的档。
     * 字典末档建议保留 99999 作为不限兜底，避免运维误删后逾期超出最大档时落入 fallback。
     * <p>
     * <b>桶名约定（A6 治理后）</b>：桶名为 {@code DUE_TIER_${dict_sort}}，与字典 dict_sort 等长。
     * 新增/删档字典即可，无需改 Java；前端通过 bucketName（dict_label，如"30天内"）显示。
     * 字典缺失时回退到 4 档兼容方案 DUE_30 / DUE_60 / DUE_90 / DUE_90_PLUS。
     */
    static String resolveAgingBucket(LocalDate dueDate, LocalDate today, SysDictHelper sysDictHelper) {
        if (dueDate == null || !dueDate.isBefore(today)) {
            return "CURRENT";
        }
        long overdueDays = ChronoUnit.DAYS.between(dueDate, today);
        List<SysDictHelper.DictItem> tiers = sysDictHelper != null
                ? sysDictHelper.getDictData(OVERDUE_DICT_TYPE)
                : null;
        if (tiers != null && !tiers.isEmpty()) {
            // 按阈值升序遍历，命中第一个 overdueDays <= value 的档；返回 DUE_TIER_${sort}
            List<SysDictHelper.DictItem> sorted = sortedTiers(tiers);
            for (SysDictHelper.DictItem item : sorted) {
                BigDecimal threshold = item.getValueAsDecimal();
                if (threshold != null && overdueDays <= threshold.longValue()) {
                    return tierCodeOf(item, sorted);
                }
            }
            // 超出最大档，归到末档
            return tierCodeOf(sorted.get(sorted.size() - 1), sorted);
        }
        if (overdueDays <= 30) {
            return "DUE_30";
        }
        if (overdueDays <= 60) {
            return "DUE_60";
        }
        if (overdueDays <= 90) {
            return "DUE_90";
        }
        return "DUE_90_PLUS";
    }

    /**
     * 字典项升序排序（按 dict_value 数值升序）。
     */
    static List<SysDictHelper.DictItem> sortedTiers(List<SysDictHelper.DictItem> tiers) {
        List<SysDictHelper.DictItem> sorted = new ArrayList<>(tiers);
        sorted.sort(Comparator.comparing(d -> {
            BigDecimal v = d.getValueAsDecimal();
            return v == null ? BigDecimal.valueOf(Long.MAX_VALUE) : v;
        }));
        return sorted;
    }

    /**
     * 生成档位 code：优先用 dict_sort，dict_sort 缺失时回退到 sorted 列表中的 1-based 索引。
     */
    static String tierCodeOf(SysDictHelper.DictItem item, List<SysDictHelper.DictItem> sorted) {
        Integer sort = item.getSort();
        if (sort != null && sort > 0) {
            return "DUE_TIER_" + sort;
        }
        return "DUE_TIER_" + (sorted.indexOf(item) + 1);
    }
}
