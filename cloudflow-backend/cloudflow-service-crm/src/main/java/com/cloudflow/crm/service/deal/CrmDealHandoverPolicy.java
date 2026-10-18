package com.cloudflow.crm.service.deal;

import com.cloudflow.crm.domain.CrmDealTeam;
import com.cloudflow.crm.exception.CrmBusinessException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;

public final class CrmDealHandoverPolicy {
    private CrmDealHandoverPolicy() { }

    public static List<CrmDealMemberResolver.Assignment> transfer(List<CrmDealTeam> current, Long fromUserId, Long toUserId) {
        if (fromUserId == null || fromUserId <= 0 || toUserId == null || toUserId <= 0 || Objects.equals(fromUserId, toUserId))
            throw new CrmBusinessException("交接双方须为不同的有效用户");
        if (current == null) throw new CrmBusinessException("交接团队不能为空");
        if (current.isEmpty()) return List.of(new CrmDealMemberResolver.Assignment(toUserId, "OWNER", BigDecimal.ONE, null));
        if (current.size() > 200) throw new CrmBusinessException("交接团队最多200名成员");
        HashSet<Long> users = new HashSet<Long>();
        BigDecimal total = BigDecimal.ZERO;
        for (CrmDealTeam row : current) {
            if (row == null || row.getSalesUserId() == null || row.getSalesUserId() <= 0 || !users.add(row.getSalesUserId()))
                throw new CrmBusinessException("交接团队成员须为有效用户且不可重复");
            total = total.add(CrmDealPolicy.ratio(row.getAllocatedPercentage()));
        }
        if (total.compareTo(BigDecimal.ONE) != 0) throw new CrmBusinessException("交接前团队分配比例合计必须为100%");
        List<CrmDealTeam> owners = current.stream().filter(member -> "OWNER".equals(member.getRoleType())).toList();
        if (owners.size() != 1 || !Objects.equals(owners.get(0).getSalesUserId(), fromUserId))
            throw new CrmBusinessException("交接原负责人与团队唯一主责不一致");
        BigDecimal transferred = CrmDealPolicy.ratio(owners.get(0).getAllocatedPercentage());
        List<CrmDealMemberResolver.Assignment> result = new ArrayList<>();
        boolean merged = false;
        for (CrmDealTeam row : current) {
            if (Objects.equals(row.getSalesUserId(), fromUserId)) continue;
            if (Objects.equals(row.getSalesUserId(), toUserId)) {
                if (merged) throw new CrmBusinessException("交接团队成员重复");
                result.add(new CrmDealMemberResolver.Assignment(toUserId, "OWNER", CrmDealPolicy.ratio(row.getAllocatedPercentage()).add(transferred), null));
                merged = true;
            } else result.add(new CrmDealMemberResolver.Assignment(row.getSalesUserId(), row.getRoleType(), row.getAllocatedPercentage(), row.getCommissionRate()));
        }
        if (!merged) result.add(new CrmDealMemberResolver.Assignment(toUserId, "OWNER", transferred, null));
        return List.copyOf(result);
    }
}
