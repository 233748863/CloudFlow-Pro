package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.OaContractTeam;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class OaContractTeamPolicy {
    private static final Set<String> ROLES = Set.of("OWNER", "CO_SELLER", "PRE_SALES", "SUPPORT", "MANAGER");
    private OaContractTeamPolicy() { }

    public static BigDecimal money(BigDecimal amount) {
        return OaRecordSupport.decimal(amount, 14, 2, false, "合同分配金额");
    }

    public static BigDecimal ratio(BigDecimal value) {
        BigDecimal result = OaRecordSupport.decimal(value, 5, 4, false, "团队分配比例");
        if (result.compareTo(BigDecimal.ONE) > 0) throw new IllegalArgumentException("团队分配比例须在0至1之间");
        return result;
    }

    public static String currency(String value) {
        if (value == null || !value.matches("[A-Z]{3}")) throw new IllegalArgumentException("币种须为三个大写字母且不可省略");
        return value;
    }

    public static void allocate(BigDecimal amount, List<OaContractTeam> members) {
        BigDecimal totalAmount = money(amount);
        if (members == null || members.isEmpty() || members.size() > 200) throw new IllegalArgumentException("团队须包含1至200名成员");
        Set<Long> users = new HashSet<>();
        BigDecimal percentage = BigDecimal.ZERO;
        BigDecimal allocated = BigDecimal.ZERO;
        OaContractTeam owner = null;
        for (OaContractTeam member : members) {
            if (member == null || member.getSalesUserId() == null || member.getSalesUserId() <= 0 || !users.add(member.getSalesUserId()))
                throw new IllegalArgumentException("团队成员须为有效用户且不可重复");
            if (member.getDeptId() == null || member.getDeptId() <= 0) throw new IllegalArgumentException("团队成员所属部门无效");
            member.setSalesUserName(OaRecordSupport.text(member.getSalesUserName(), 100, "团队成员姓名"));
            OaRecordSupport.code(member.getRoleType(), null, ROLES);
            if ("OWNER".equals(member.getRoleType())) {
                if (owner != null) throw new IllegalArgumentException("团队必须有且仅有一名主责");
                owner = member;
            }
            member.setAllocatedPercentage(ratio(member.getAllocatedPercentage()));
            percentage = percentage.add(member.getAllocatedPercentage());
            member.setAllocatedAmount(totalAmount.multiply(member.getAllocatedPercentage()).setScale(2, RoundingMode.HALF_UP));
            allocated = allocated.add(member.getAllocatedAmount());
            if (member.getCommissionRate() != null) member.setCommissionRate(ratio(member.getCommissionRate()));
        }
        if (owner == null) throw new IllegalArgumentException("团队必须有且仅有一名主责");
        if (percentage.compareTo(BigDecimal.ONE) != 0) throw new IllegalArgumentException("团队分配比例合计必须为100%");
        owner.setAllocatedAmount(owner.getAllocatedAmount().add(totalAmount.subtract(allocated)));
        if (owner.getAllocatedAmount().signum() < 0) throw new IllegalArgumentException("按分舍入后的主责金额为负，请核对原金额和分配比例");
        for (OaContractTeam member : members) {
            member.setCommissionAmount(member.getCommissionRate() == null ? BigDecimal.ZERO
                    : member.getAllocatedAmount().multiply(member.getCommissionRate()).setScale(2, RoundingMode.HALF_UP));
        }
    }
}
