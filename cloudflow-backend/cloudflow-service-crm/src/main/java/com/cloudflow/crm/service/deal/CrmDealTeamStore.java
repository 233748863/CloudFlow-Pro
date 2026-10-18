package com.cloudflow.crm.service.deal;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.crm.domain.CrmDealTeam;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmDealTeamMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmDealTeamStore {
    private final CrmDealTeamMapper teams;
    private final CrmDealMemberResolver members;

    public record Snapshot(int version, CrmDealMemberResolver.Resolved resolved, List<CrmDealTeam> rows) { }
    public record Current(int version, List<CrmDealTeam> rows) { }

    public List<CrmDealTeam> rows(String type, Long id, Integer version) {
        LambdaQueryWrapper<CrmDealTeam> query = new LambdaQueryWrapper<CrmDealTeam>().eq(CrmDealTeam::getBizType, CrmDealPolicy.business(type)).eq(CrmDealTeam::getBizId, id);
        if (version == null) query.eq(CrmDealTeam::getCurrentFlag, 1);
        else query.eq(CrmDealTeam::getTeamVersion, version);
        return teams.selectList(query.orderByAsc(CrmDealTeam::getSalesUserId));
    }

    public List<Integer> versions(String type, Long id) { return teams.versions(CrmDealPolicy.business(type), id); }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public Current inspect(String type, Long id) {
        List<CrmDealTeam> current = teams.lockCurrent(CrmDealPolicy.business(type), id);
        return new Current(version(current), List.copyOf(current));
    }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public Snapshot lock(String type, Long id, Long ownerId, Integer expectedVersion) {
        Current existing = inspect(type, id);
        List<CrmDealTeam> current = existing.rows();
        int version = existing.version();
        if (expectedVersion != null && !Objects.equals(expectedVersion, version)) throw invalid("业务团队版本与成员记录不一致");
        List<CrmDealMemberResolver.Assignment> assignments = current.isEmpty()
                ? List.of(new CrmDealMemberResolver.Assignment(ownerId, "OWNER", BigDecimal.ONE, null))
                : current.stream().map(member -> new CrmDealMemberResolver.Assignment(member.getSalesUserId(), member.getRoleType(),
                        member.getAllocatedPercentage(), member.getCommissionRate())).toList();
        CrmDealMemberResolver.Resolved resolved = members.resolve(assignments);
        if (!Objects.equals(resolved.owner().userId(), ownerId)) throw invalid("团队主责与业务负责人不一致");
        return new Snapshot(version, resolved, List.copyOf(current));
    }

    @Audit(name = "保存团队整组新版本")
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public int replace(String type, Long id, int expectedVersion, List<CrmDealPolicy.Member> members, BigDecimal amount, String remark) {
        CrmDealPolicy.business(type);
        requireCrmOwner(type);
        CrmRecordSupport.require(id, "团队业务ID缺失");
        if (remark != null && remark.length() > 500) throw invalid("团队调整说明最多500字符");
        List<CrmDealPolicy.Allocation> split = CrmDealPolicy.allocate(amount, members, true);
        List<CrmDealTeam> current = teams.lockCurrent(type, id);
        if (version(current) != expectedVersion) throw invalid("团队已被修改，请刷新后重试");
        if (expectedVersion == Integer.MAX_VALUE) throw invalid("团队版本已达到上限");
        int nextVersion = expectedVersion + 1;
        if (!current.isEmpty() && teams.retireCurrent(type, id, expectedVersion, CrmRecordSupport.userName(), LocalDateTime.now()) != current.size())
            throw invalid("团队已被修改，请刷新后重试");
        for (CrmDealPolicy.Allocation allocation : split) {
            CrmDealPolicy.Member member = allocation.member();
            CrmDealTeam row = new CrmDealTeam();
            row.setTenantId(CrmRecordSupport.tenantId()); row.setBizType(type); row.setBizId(id);
            row.setTeamVersion(nextVersion); row.setCurrentFlag(1); row.setSalesUserId(member.userId());
            row.setSalesUserName(member.name()); row.setDeptId(member.deptId()); row.setRoleType(member.role());
            row.setAllocatedPercentage(member.percentage()); row.setAllocatedAmount(allocation.amount());
            row.setCommissionRate(member.commissionRate()); row.setCommissionAmount(allocation.commissionAmount() == null ? BigDecimal.ZERO : allocation.commissionAmount());
            row.setRemark(remark == null ? null : remark.trim()); CrmRecordSupport.create(row, "teamId");
            CrmRecordSupport.saved(teams.insert(row));
        }
        return nextVersion;
    }

    @Audit(name = "更新当前团队金额预览")
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void refreshPreview(String type, Long id, Snapshot snapshot, BigDecimal amount) {
        requireCrmOwner(type);
        List<CrmDealPolicy.Allocation> split = CrmDealPolicy.allocate(amount, snapshot.resolved().members(), true);
        for (CrmDealPolicy.Allocation allocation : split) {
            CrmRecordSupport.saved(teams.updatePreview(type, id, snapshot.version(), allocation.member().userId(), allocation.amount(),
                    allocation.commissionAmount() == null ? BigDecimal.ZERO : allocation.commissionAmount(), CrmRecordSupport.userName(), LocalDateTime.now()));
        }
    }

    private int version(List<CrmDealTeam> current) {
        if (current.isEmpty()) return 0;
        Integer version = current.get(0).getTeamVersion();
        if (version == null || version <= 0 || current.stream().anyMatch(member -> !Objects.equals(version, member.getTeamVersion())
                || !Objects.equals(CrmRecordSupport.tenantId(), member.getTenantId()) || !Integer.valueOf(1).equals(member.getCurrentFlag())))
            throw invalid("当前团队须为本租户完整的同一版本");
        return version;
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }

    private static void requireCrmOwner(String type) {
        if ("CONTRACT".equals(type)) throw invalid("合同团队必须由合同服务与合同记录同事务保存");
    }
}
