package com.cloudflow.crm.service.deal;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.math.BigDecimal;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmDealHandoverService {
    private final CrmOpportunityMapper opportunities;
    private final CrmQuoteMapper quotes;
    private final CrmReceivableMapper receivables;
    private final CrmDealTeamStore teams;
    private final CrmDealMemberResolver members;

    private record Transfer(int version, CrmDealMemberResolver.Resolved resolved) { }

    @Audit(name = "交接销售业务主责及分成团队")
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public int transfer(String business, Long id, Long fromUserId, Long toUserId) {
        if (Objects.equals(fromUserId, toUserId)) throw new CrmBusinessException("接任人不能与原负责人相同");
        return switch (business) {
            case "OPPORTUNITY" -> opportunity(id, fromUserId, toUserId);
            case "QUOTE" -> quote(id, fromUserId, toUserId);
            case "RECEIVABLE" -> receivable(id, fromUserId, toUserId);
            default -> throw new CrmBusinessException("此类业务尚未接入销售交接");
        };
    }

    private int opportunity(Long id, Long fromUserId, Long toUserId) {
        CrmOpportunity record = opportunities.lockById(id);
        if (record == null || !matches(record.getTenantId(), record.getOwnerId(), fromUserId)
                || !"OPEN".equals(record.getStatus()) || "WON".equals(record.getStage()) || "LOST".equals(record.getStage())) return 0;
        CrmDealHandoverService.Transfer next = team("OPPORTUNITY", id, fromUserId, toUserId, record.getExpectedAmount(), record.getTeamVersion());
        CrmDealPolicy.Member owner = next.resolved().owner();
        record.setOwnerId(owner.userId()); record.setOwnerName(owner.name()); record.setDeptId(owner.deptId());
        record.setDeptName(next.resolved().directory().get(owner.userId()).getDeptName()); record.setTeamVersion(next.version());
        CrmRecordSupport.touch(record);
        CrmRecordSupport.saved(opportunities.writeTeam(record, record.getVersion()));
        return 1;
    }

    private int quote(Long id, Long fromUserId, Long toUserId) {
        CrmQuote record = quotes.lockById(id);
        if (record == null || !matches(record.getTenantId(), record.getOwnerId(), fromUserId)
                || "ACCEPTED".equals(record.getStatus()) || "EXPIRED".equals(record.getStatus())) return 0;
        CrmDealPolicy.currency(record.getCurrency());
        CrmDealHandoverService.Transfer next = team("QUOTE", id, fromUserId, toUserId, record.getTotalAmount(), null);
        record.setOwnerId(next.resolved().owner().userId()); record.setOwnerName(next.resolved().owner().name());
        CrmRecordSupport.touch(record);
        CrmRecordSupport.saved(quotes.writeOwner(record, record.getVersion()));
        return 1;
    }

    private int receivable(Long id, Long fromUserId, Long toUserId) {
        CrmReceivable record = receivables.lockById(id);
        if (record == null || !matches(record.getTenantId(), record.getOwnerId(), fromUserId) || "RECEIVED".equals(record.getStatus())) return 0;
        CrmDealHandoverService.Transfer next = team("RECEIVABLE", id, fromUserId, toUserId, record.getPlannedAmount(), null);
        record.setOwnerId(next.resolved().owner().userId()); record.setOwnerName(next.resolved().owner().name());
        CrmRecordSupport.touch(record);
        CrmRecordSupport.saved(receivables.writeOwner(record, record.getVersion()));
        return 1;
    }

    private Transfer team(String business, Long id, Long fromUserId, Long toUserId, BigDecimal amount, Integer expectedVersion) {
        CrmDealTeamStore.Current current = teams.inspect(business, id);
        if (expectedVersion != null && expectedVersion != current.version()) throw new CrmBusinessException("业务团队版本与成员记录不一致");
        CrmDealMemberResolver.Resolved resolved = members.resolve(CrmDealHandoverPolicy.transfer(current.rows(), fromUserId, toUserId));
        int version = teams.replace(business, id, current.version(), resolved.members(), amount, "交接主责，合并接任人比例；历史分配保持不变");
        return new Transfer(version, resolved);
    }

    private boolean matches(Long tenantId, Long ownerId, Long fromUserId) {
        return Objects.equals(CrmRecordSupport.tenantId(), tenantId) && Objects.equals(ownerId, fromUserId);
    }
}
