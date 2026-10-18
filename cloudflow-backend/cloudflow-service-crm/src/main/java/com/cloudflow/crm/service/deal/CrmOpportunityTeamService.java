package com.cloudflow.crm.service.deal;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.crm.domain.CrmDealTeam;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.vo.CrmDealTeamView;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.opportunity.CrmOpportunityAccessService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityStagePolicy;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmOpportunityTeamService {
    private static final String BUSINESS = "OPPORTUNITY";
    private final CrmOpportunityAccessService access;
    private final CrmOpportunityMapper opportunities;
    private final CrmDealTeamStore teams;
    private final CrmDealMemberResolver members;
    private final CrmDealLedgerService ledger;
    private final ObjectMapper json;

    /** Validate the initial owner without creating a team or any business rows. */
    public void validateDefaultOwner(Long userId) {
        owner(userId);
    }

    @Transactional(readOnly = true)
    public CrmDealTeamView read(Long id, Integer requestedVersion) {
        CrmOpportunity opportunity = access.read(id);
        int currentVersion = teamVersion(opportunity);
        int version = requestedVersion == null ? currentVersion : requestedVersion;
        if (version < 0 || version > currentVersion || version == 0 && currentVersion != 0) throw invalid("团队历史版本不存在");
        List<CrmDealTeam> rows = teams.rows(BUSINESS, id, version);
        if (rows.isEmpty() && version > 0) throw invalid("团队成员版本不完整");
        List<CrmDealTeamView.Member> view = new ArrayList<>();
        boolean salaryVisible = StpUtil.hasPermission("crm:commission:manage");
        if (rows.isEmpty()) {
            CrmDealPolicy.Member owner = owner(opportunity.getOwnerId()).owner();
            view.add(new CrmDealTeamView.Member(owner.userId(), owner.name(), owner.deptId(), owner.role(), BigDecimal.ONE,
                    CrmDealPolicy.money(opportunity.getExpectedAmount()), null, null, "未配置团队，按负责人100%分配", null));
        } else {
            for (CrmDealTeam row : rows) {
                view.add(new CrmDealTeamView.Member(row.getSalesUserId(), row.getSalesUserName(), row.getDeptId(), row.getRoleType(),
                        row.getAllocatedPercentage(), row.getAllocatedAmount(), salaryVisible ? row.getCommissionRate() : null,
                        salaryVisible && row.getCommissionRate() != null ? row.getCommissionAmount() : null, row.getRemark(), row.getCreateTime()));
            }
        }
        Long ownerId = view.stream().filter(member -> "OWNER".equals(member.roleType())).map(CrmDealTeamView.Member::salesUserId).findFirst().orElseThrow();
        BigDecimal amount = view.stream().map(CrmDealTeamView.Member::allocatedAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new CrmDealTeamView(BUSINESS, id, opportunity.getVersion(), version, currentVersion, ownerId, amount, "CNY",
                version != currentVersion, List.copyOf(view), currentVersion == 0 ? List.of(0) : teams.versions(BUSINESS, id));
    }

    @Audit(name = "维护商机团队与主责")
    @Transactional(rollbackFor = Exception.class)
    public CrmDealTeamView save(Long id, CrmDealTeamRequest request) {
        CrmRecordSupport.require(request, "团队不能为空");
        CrmOpportunity opportunity = access.lockInScope(id);
        CrmOpportunityStagePolicy.version(request.businessVersion(), opportunity);
        CrmDealTeamStore.Current previous = teams.inspect(BUSINESS, id);
        if (!Objects.equals(request.teamVersion(), previous.version()) || teamVersion(opportunity) != previous.version())
            throw invalid("团队已被修改，请刷新后重试");
        if (request.members() == null || request.members().isEmpty() || request.members().size() > 200) throw invalid("团队须包含1至200名成员");
        List<CrmDealMemberResolver.Assignment> assignments = new ArrayList<>();
        for (CrmDealTeamRequest.Member member : request.members()) {
            CrmRecordSupport.require(member, "团队成员不能为空");
            BigDecimal rate = previous.rows().stream().filter(row -> Objects.equals(row.getSalesUserId(), member.salesUserId())
                    && Objects.equals(row.getRoleType(), member.roleType()) && member.allocatedPercentage() != null
                    && row.getAllocatedPercentage().compareTo(member.allocatedPercentage()) == 0).map(CrmDealTeam::getCommissionRate)
                    .filter(Objects::nonNull).findFirst().orElse(null);
            assignments.add(new CrmDealMemberResolver.Assignment(member.salesUserId(), member.roleType(), member.allocatedPercentage(), rate));
        }
        CrmDealMemberResolver.Resolved resolved = members.resolve(assignments);
        CrmDealPolicy.Member nextOwner = resolved.owner();
        if (!Objects.equals(nextOwner.userId(), opportunity.getOwnerId()) && (!"OPEN".equals(opportunity.getStatus())
                || "WON".equals(opportunity.getStage()) || "LOST".equals(opportunity.getStage()))) throw invalid("已结案商机不能直接更换负责人");
        int nextVersion = teams.replace(BUSINESS, id, previous.version(), resolved.members(), opportunity.getExpectedAmount(), request.remark());
        opportunity.setOwnerId(nextOwner.userId()); opportunity.setOwnerName(nextOwner.name()); opportunity.setDeptId(nextOwner.deptId());
        opportunity.setDeptName(resolved.directory().get(nextOwner.userId()).getDeptName()); opportunity.setTeamVersion(nextVersion);
        CrmRecordSupport.touch(opportunity);
        CrmRecordSupport.saved(opportunities.writeTeam(opportunity, request.businessVersion()));
        opportunity.setVersion(Math.addExact(request.businessVersion(), 1));
        return read(id, null);
    }

    @Audit(name = "同步商机当前团队及金额预览")
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void synchronize(CrmOpportunity opportunity) {
        verifyBusiness(opportunity);
        CrmDealTeamStore.Current current = teams.inspect(BUSINESS, opportunity.getOpportunityId());
        if (teamVersion(opportunity) != current.version()) throw invalid("业务团队版本与成员记录不一致");
        if (current.rows().isEmpty()) {
            opportunity.setTeamVersion(teams.replace(BUSINESS, opportunity.getOpportunityId(), 0, owner(opportunity.getOwnerId()).members(),
                    opportunity.getExpectedAmount(), "创建负责人默认团队"));
            return;
        }
        Long previousOwner = current.rows().stream().filter(member -> "OWNER".equals(member.getRoleType())).map(CrmDealTeam::getSalesUserId).findFirst().orElseThrow();
        if (!Objects.equals(previousOwner, opportunity.getOwnerId())) {
            if (current.rows().size() != 1) throw invalid("多人团队更换负责人须在团队维护中明确主责及比例");
            opportunity.setTeamVersion(teams.replace(BUSINESS, opportunity.getOpportunityId(), current.version(), owner(opportunity.getOwnerId()).members(),
                    opportunity.getExpectedAmount(), "同步负责人变更"));
            return;
        }
        CrmDealTeamStore.Snapshot snapshot = teams.lock(BUSINESS, opportunity.getOpportunityId(), opportunity.getOwnerId(), current.version());
        teams.refreshPreview(BUSINESS, opportunity.getOpportunityId(), snapshot, opportunity.getExpectedAmount());
    }

    @Audit(name = "冻结赢单团队业绩")
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void recordWin(CrmOpportunity opportunity) {
        verifyBusiness(opportunity);
        if (!"WON".equals(opportunity.getStage())) throw invalid("只有实际赢单才能登记赢单业绩");
        CrmDealTeamStore.Snapshot snapshot = teams.lock(BUSINESS, opportunity.getOpportunityId(), opportunity.getOwnerId(), teamVersion(opportunity));
        ObjectNode evidence = json.createObjectNode().put("opportunityId", opportunity.getOpportunityId()).put("customerId", opportunity.getCustomerId())
                .put("ownerId", opportunity.getOwnerId()).put("stage", opportunity.getStage()).put("status", opportunity.getStatus());
        ledger.append(new CrmDealLedgerService.Fact("CRM_WON:" + opportunity.getOpportunityId() + ":V:" + opportunity.getVersion(),
                "WON", BUSINESS, opportunity.getOpportunityId(), opportunity.getCustomerId(), opportunity.getExpectedAmount(), "CNY",
                opportunity.getStageChangedTime(), snapshot.version(), "cloudflow-service-crm", opportunity.getVersion(), evidence, false), snapshot.resolved().members());
    }

    private CrmDealMemberResolver.Resolved owner(Long userId) {
        return members.resolve(List.of(new CrmDealMemberResolver.Assignment(userId, "OWNER", BigDecimal.ONE.setScale(4, RoundingMode.UNNECESSARY), null)));
    }

    private int teamVersion(CrmOpportunity opportunity) { return opportunity.getTeamVersion() == null ? 0 : opportunity.getTeamVersion(); }

    private void verifyBusiness(CrmOpportunity opportunity) {
        if (opportunity == null || opportunity.getOpportunityId() == null || !Objects.equals(CrmRecordSupport.tenantId(), opportunity.getTenantId()))
            throw invalid("商机团队来源无效");
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
