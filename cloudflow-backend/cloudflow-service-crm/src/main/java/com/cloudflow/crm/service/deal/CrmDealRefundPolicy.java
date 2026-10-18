package com.cloudflow.crm.service.deal;

import com.cloudflow.crm.domain.CrmDealAllocation;
import com.cloudflow.crm.exception.CrmBusinessException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class CrmDealRefundPolicy {
    private CrmDealRefundPolicy() { }

    public record Portion(CrmDealAllocation original, BigDecimal amount, BigDecimal commissionAmount) { }

    public static List<Portion> allocate(BigDecimal originalAmount, BigDecimal requestedAmount,
            List<CrmDealAllocation> original, List<CrmDealAllocation> previous) {
        BigDecimal total = CrmDealPolicy.money(originalAmount);
        BigDecimal requested = CrmDealPolicy.money(requestedAmount);
        if (total.signum() <= 0 || requested.signum() <= 0) throw invalid("原收款和本次退款金额必须大于0");
        if (original == null || original.isEmpty() || original.size() > 200 || previous == null)
            throw invalid("原收款分配或已退款记录不完整");
        Map<Long, CrmDealAllocation> sources = new HashMap<>();
        HashSet<Long> users = new HashSet<Long>();
        BigDecimal originalSum = BigDecimal.ZERO;
        int owners = 0;
        for (CrmDealAllocation source : original) {
            if (source == null || source.getAllocationId() == null || source.getReversalOfId() != null
                    || sources.putIfAbsent(source.getAllocationId(), source) != null || source.getSalesUserId() == null
                    || !users.add(source.getSalesUserId())) throw invalid("原收款分配来源无效");
            BigDecimal amount = CrmDealPolicy.money(source.getAllocatedAmount());
            originalSum = originalSum.add(amount);
            if ("OWNER".equals(source.getRoleType())) owners++;
            if (source.getCommissionAmount() != null && (CrmDealPolicy.money(source.getCommissionAmount()).compareTo(amount) > 0
                    || amount.signum() == 0 && source.getCommissionAmount().signum() != 0)) throw invalid("原收款提成金额无效");
        }
        if (owners != 1 || originalSum.compareTo(total) != 0) throw invalid("原收款分配合计或主责不一致");
        Map<Long, BigDecimal> refunded = new HashMap<>();
        Map<Long, BigDecimal> reversedCommission = new HashMap<>();
        HashSet<Long> priorIds = new HashSet<Long>();
        for (CrmDealAllocation prior : previous) {
            CrmDealAllocation source = prior == null ? null : sources.get(prior.getReversalOfId());
            if (source == null || prior.getAllocationId() == null || !priorIds.add(prior.getAllocationId())
                    || !Objects.equals(source.getTenantId(), prior.getTenantId())
                    || !Objects.equals(source.getEmployeeId(), prior.getEmployeeId())
                    || !Objects.equals(source.getSalesUserId(), prior.getSalesUserId())
                    || !Objects.equals(source.getDeptId(), prior.getDeptId())
                    || !Objects.equals(source.getRoleType(), prior.getRoleType())
                    || prior.getAllocatedAmount() == null || prior.getAllocatedAmount().signum() > 0)
                throw invalid("已退款分配与原收款不一致");
            refunded.merge(source.getAllocationId(), CrmDealPolicy.money(prior.getAllocatedAmount().negate()), BigDecimal::add);
            if (prior.getCommissionAmount() != null) {
                if (source.getCommissionAmount() == null || prior.getCommissionAmount().signum() > 0)
                    throw invalid("已冲减提成与原收款不一致");
                reversedCommission.merge(source.getAllocationId(), CrmDealPolicy.money(prior.getCommissionAmount().negate()), BigDecimal::add);
            }
        }
        List<BigDecimal> available = new ArrayList<>();
        List<BigDecimal> proposed = new ArrayList<>();
        BigDecimal remaining = BigDecimal.ZERO;
        for (CrmDealAllocation source : original) {
            BigDecimal balance = source.getAllocatedAmount().subtract(refunded.getOrDefault(source.getAllocationId(), BigDecimal.ZERO));
            if (balance.signum() < 0) throw invalid("原收款已有超额退款分配");
            BigDecimal commission = source.getCommissionAmount();
            if (commission != null && commission.compareTo(reversedCommission.getOrDefault(source.getAllocationId(), BigDecimal.ZERO)) < 0)
                throw invalid("原收款已有超额提成冲减");
            available.add(balance);
            remaining = remaining.add(balance);
            proposed.add(requested.multiply(source.getAllocatedAmount()).divide(total, 2, RoundingMode.HALF_UP).min(balance));
        }
        if (requested.compareTo(remaining) > 0) throw invalid("退款金额超过所选原收款记录的剩余可退金额");
        BigDecimal difference = requested.subtract(proposed.stream().reduce(BigDecimal.ZERO, BigDecimal::add));
        List<Integer> order = new ArrayList<>();
        for (int index = 0; index < original.size(); index++) order.add(index);
        order.sort(Comparator.comparing((Integer index) -> !"OWNER".equals(original.get(index).getRoleType()))
                .thenComparing(index -> original.get(index).getSalesUserId()));
        for (int index : order) {
            if (difference.signum() == 0) break;
            BigDecimal adjustment = difference.signum() > 0 ? difference.min(available.get(index).subtract(proposed.get(index)))
                    : difference.abs().min(proposed.get(index)).negate();
            proposed.set(index, proposed.get(index).add(adjustment));
            difference = difference.subtract(adjustment);
        }
        if (difference.signum() != 0) throw invalid("退款分配无法与所选收款余额核对");
        List<Portion> result = new ArrayList<>();
        for (int index = 0; index < original.size(); index++) {
            CrmDealAllocation source = original.get(index);
            BigDecimal amount = proposed.get(index);
            BigDecimal commission = null;
            if (source.getCommissionAmount() != null) {
                BigDecimal commissionRemaining = source.getCommissionAmount().subtract(reversedCommission.getOrDefault(source.getAllocationId(), BigDecimal.ZERO));
                commission = amount.compareTo(available.get(index)) == 0 ? commissionRemaining
                        : source.getAllocatedAmount().signum() == 0 ? BigDecimal.ZERO
                        : amount.multiply(source.getCommissionAmount()).divide(source.getAllocatedAmount(), 2, RoundingMode.HALF_UP).min(commissionRemaining);
            }
            result.add(new Portion(source, amount.setScale(2), commission == null ? null : commission.setScale(2)));
        }
        return List.copyOf(result);
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
