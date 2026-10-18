package com.cloudflow.crm.service.deal;

import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.opportunity.CrmSalesAmounts;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class CrmDealPolicy {
    private static final Set<String> ROLES = Set.of("OWNER", "CO_SELLER", "PRE_SALES", "SUPPORT", "MANAGER");
    private static final Set<String> BUSINESSES = Set.of("OPPORTUNITY", "QUOTE", "CONTRACT", "RECEIVABLE");
    private CrmDealPolicy() { }

    public record Member(Long userId, Long employeeId, String name, Long deptId, String role,
            BigDecimal percentage, BigDecimal commissionRate) { }
    public record Allocation(Member member, BigDecimal amount, BigDecimal commissionAmount, String commissionStatus) { }

    public static String business(String value) {
        return CrmRecordSupport.code(value, null, BUSINESSES, "团队业务类型");
    }

    public static String currency(String value) {
        if (value == null || !value.matches("[A-Z]{3}")) throw invalid("币种须为三个大写字母且不可省略");
        return value;
    }

    public static BigDecimal money(BigDecimal value) {
        return CrmSalesAmounts.decimal(value, 12, 2, "业绩或回款金额");
    }

    public static BigDecimal ratio(BigDecimal value) {
        BigDecimal normalized = CrmSalesAmounts.decimal(value, 1, 4, "分配或提成比例");
        if (normalized.compareTo(BigDecimal.ONE) > 0) throw invalid("分配或提成比例须在0至1之间");
        return normalized;
    }

    public static List<Member> team(List<Member> members) {
        if (members == null || members.isEmpty() || members.size() > 200) throw invalid("团队须包含1至200名成员");
        List<Member> normalized = new ArrayList<>();
        Set<Long> users = new HashSet<>();
        Set<Long> employees = new HashSet<>();
        BigDecimal total = BigDecimal.ZERO;
        int owners = 0;
        for (Member member : members) {
            if (member == null || member.userId() == null || member.userId() <= 0 || !users.add(member.userId())) throw invalid("团队成员须为有效用户且不可重复");
            if (member.employeeId() == null || member.employeeId() <= 0 || !employees.add(member.employeeId())) throw invalid("团队成员须关联不同的有效员工");
            if (member.deptId() == null || member.deptId() <= 0) throw invalid("团队成员所属部门无效");
            String name = CrmRecordSupport.text(member.name(), 100, "团队成员姓名");
            String role = CrmRecordSupport.code(member.role(), null, ROLES, "团队角色");
            BigDecimal percentage = ratio(member.percentage());
            BigDecimal commissionRate = member.commissionRate() == null ? null : ratio(member.commissionRate());
            if ("OWNER".equals(role)) owners++;
            total = total.add(percentage);
            normalized.add(new Member(member.userId(), member.employeeId(), name, member.deptId(), role, percentage, commissionRate));
        }
        if (owners != 1) throw invalid("团队必须有且仅有一名主责");
        if (total.compareTo(BigDecimal.ONE) != 0) throw invalid("团队分配比例合计必须为100%");
        normalized.sort(Comparator.comparing(Member::userId));
        return List.copyOf(normalized);
    }

    public static List<Allocation> allocate(BigDecimal requestedAmount, List<Member> members, boolean receipt) {
        BigDecimal amount = money(requestedAmount);
        List<Member> normalized = team(members);
        List<BigDecimal> amounts = normalized.stream().map(member -> amount.multiply(member.percentage()).setScale(2, RoundingMode.HALF_UP)).toList();
        BigDecimal remainder = amount.subtract(amounts.stream().reduce(BigDecimal.ZERO, BigDecimal::add));
        List<Allocation> result = new ArrayList<>();
        for (int index = 0; index < normalized.size(); index++) {
            Member member = normalized.get(index);
            BigDecimal allocated = amounts.get(index).add("OWNER".equals(member.role()) ? remainder : BigDecimal.ZERO);
            if (allocated.signum() < 0) throw invalid("按分舍入后的主责金额为负，请核对原金额和分配比例");
            BigDecimal commission = receipt && member.commissionRate() != null ? allocated.multiply(member.commissionRate()).setScale(2, RoundingMode.HALF_UP) : null;
            result.add(new Allocation(member, allocated, commission, !receipt ? "NOT_APPLICABLE" : commission == null ? "UNCONFIRMED" : "READY"));
        }
        if (result.stream().map(Allocation::amount).reduce(BigDecimal.ZERO, BigDecimal::add).compareTo(amount) != 0) throw new IllegalStateException("成员分配合计与原事实不一致");
        return List.copyOf(result);
    }

    public static void eventType(String eventType, String bizType) {
        boolean valid = "WON".equals(eventType) && "OPPORTUNITY".equals(bizType)
                || "CONTRACT".equals(eventType) && "CONTRACT".equals(bizType)
                || "RECEIPT".equals(eventType) && "RECEIVABLE".equals(bizType);
        if (!valid) throw invalid("业绩事实类型与来源业务不一致");
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
