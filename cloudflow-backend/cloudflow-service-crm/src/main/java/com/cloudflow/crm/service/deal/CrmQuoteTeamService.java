package com.cloudflow.crm.service.deal;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.crm.domain.CrmDealTeam;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.vo.CrmDealTeamView;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmDealTeamMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.opportunity.CrmOpportunityAccessService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmQuoteTeamService {
    private static final String BUSINESS = "QUOTE";
    private final CrmQuoteAccessService access;
    private final CrmQuoteMapper quotes;
    private final CrmDealTeamMapper records;
    private final CrmDealTeamStore teams;
    private final CrmDealMemberResolver members;
    private final CrmOpportunityAccessService opportunities;

    public record Initial(CrmDealMemberResolver.Resolved resolved, Integer sourceVersion) { }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public Initial prepareCreate(CrmQuote quote) {
        quote.setCurrency(CrmDealPolicy.currency(quote.getCurrency()));
        CrmDealPolicy.money(quote.getTotalAmount());
        CrmDealMemberResolver.Resolved resolved;
        Integer sourceVersion = null;
        if (quote.getOpportunityId() == null) {
            resolved = owner(quote.getOwnerId());
        } else {
            CrmOpportunity source = opportunities.lockInScope(quote.getOpportunityId());
            if (!Objects.equals(source.getCustomerId(), quote.getCustomerId())) throw invalid("报价与来源商机必须属于同一客户");
            CrmDealTeamStore.Snapshot snapshot = teams.lock("OPPORTUNITY", source.getOpportunityId(), source.getOwnerId(), source.getTeamVersion());
            resolved = snapshot.resolved();
            sourceVersion = snapshot.version();
            quote.setOpportunityName(source.getOpportunityName());
        }
        quote.setOwnerId(resolved.owner().userId());
        quote.setOwnerName(resolved.owner().name());
        return new Initial(resolved, sourceVersion);
    }

    @Audit(name = "创建报价并复制来源商机团队")
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void initialize(CrmQuote quote, Initial initial) {
        if (initial.sourceVersion() == null) return;
        teams.replace(BUSINESS, quote.getQuoteId(), 0, initial.resolved().members(), quote.getTotalAmount(),
                "创建报价时复制来源商机团队版本 " + initial.sourceVersion());
    }

    @Transactional(readOnly = true)
    public CrmDealTeamView read(Long id, Integer requestedVersion) {
        CrmQuote quote = access.read(id);
        List<Integer> versions = teams.versions(BUSINESS, id);
        int currentVersion = versions.isEmpty() ? 0 : versions.get(0);
        int version = requestedVersion == null ? currentVersion : requestedVersion;
        if (version < 0 || version == 0 && currentVersion != 0 || version > 0 && !versions.contains(version)) throw invalid("团队历史版本不存在");
        List<CrmDealTeam> rows = teams.rows(BUSINESS, id, version);
        if (rows.isEmpty() && version > 0) throw invalid("团队成员版本不完整");
        List<CrmDealTeamView.Member> view = new ArrayList<>();
        boolean salaryVisible = StpUtil.hasPermission("crm:commission:manage");
        if (rows.isEmpty()) {
            CrmDealPolicy.Member owner = owner(quote.getOwnerId()).owner();
            view.add(new CrmDealTeamView.Member(owner.userId(), owner.name(), owner.deptId(), owner.role(), BigDecimal.ONE,
                    CrmDealPolicy.money(quote.getTotalAmount()), null, null, "未配置团队，按负责人100%分配", null));
        } else {
            for (CrmDealTeam row : rows) {
                if (version == currentVersion && !Integer.valueOf(1).equals(row.getCurrentFlag())) throw invalid("当前团队版本不完整");
                view.add(new CrmDealTeamView.Member(row.getSalesUserId(), row.getSalesUserName(), row.getDeptId(), row.getRoleType(),
                        row.getAllocatedPercentage(), row.getAllocatedAmount(), salaryVisible ? row.getCommissionRate() : null,
                        salaryVisible && row.getCommissionRate() != null ? row.getCommissionAmount() : null, row.getRemark(), row.getCreateTime()));
            }
        }
        Long ownerId = view.stream().filter(member -> "OWNER".equals(member.roleType())).map(CrmDealTeamView.Member::salesUserId).findFirst().orElseThrow();
        BigDecimal amount = view.stream().map(CrmDealTeamView.Member::allocatedAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new CrmDealTeamView(BUSINESS, id, quote.getVersion(), version, currentVersion, ownerId, amount,
                CrmDealPolicy.currency(quote.getCurrency()), version != currentVersion, List.copyOf(view), currentVersion == 0 ? List.of(0) : versions);
    }

    @Audit(name = "维护报价团队与主责")
    @Transactional(rollbackFor = Exception.class)
    public CrmDealTeamView save(Long id, CrmDealTeamRequest request) {
        CrmRecordSupport.require(request, "团队不能为空");
        CrmQuote quote = access.lockInScope(id);
        if (request.businessVersion() == null || !Objects.equals(request.businessVersion(), quote.getVersion())) throw invalid("报价已被修改，请刷新后重试");
        CrmDealTeamStore.Current previous = teams.inspect(BUSINESS, id);
        if (!Objects.equals(request.teamVersion(), previous.version())) throw invalid("团队已被修改，请刷新后重试");
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
        if (!Objects.equals(resolved.owner().userId(), quote.getOwnerId()) && terminal(quote)) throw invalid("已接受或已过期报价不能直接更换负责人");
        CrmDealPolicy.currency(quote.getCurrency());
        teams.replace(BUSINESS, id, previous.version(), resolved.members(), quote.getTotalAmount(), request.remark());
        quote.setOwnerId(resolved.owner().userId()); quote.setOwnerName(resolved.owner().name()); CrmRecordSupport.touch(quote);
        CrmRecordSupport.saved(quotes.writeOwner(quote, request.businessVersion()));
        return read(id, null);
    }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void validateCurrency(CrmQuote persisted, CrmQuote requested) {
        if (requested.getCurrency() == null || requested.getCurrency().isBlank()) requested.setCurrency(persisted.getCurrency());
        String currency = CrmDealPolicy.currency(requested.getCurrency());
        boolean converted = !quotes.lockConvertedContracts(persisted.getQuoteId(), persisted.getTenantId()).isEmpty();
        if (!Objects.equals(currency, persisted.getCurrency()) && (converted || !records.lockVersions(BUSINESS, persisted.getQuoteId()).isEmpty()))
            throw invalid("报价已有历史分成记录，币种已锁定；换币种请另建报价");
        if (requested.getContractId() != null && !Objects.equals(requested.getContractId(), persisted.getContractId())
                || requested.getContractNo() != null && !requested.getContractNo().isBlank() && !Objects.equals(requested.getContractNo(), persisted.getContractNo()))
            throw invalid("合同关联须通过报价生成合同入口建立，不能直接修改");
        requested.setContractId(persisted.getContractId()); requested.setContractNo(persisted.getContractNo());
        if (converted || persisted.getContractId() != null) {
            if (requested.getCustomerId() != null && !Objects.equals(requested.getCustomerId(), persisted.getCustomerId())
                    || requested.getOpportunityId() != null && !Objects.equals(requested.getOpportunityId(), persisted.getOpportunityId()))
                throw invalid("报价已关联合同，不能更换客户或来源商机");
            requested.setCustomerId(persisted.getCustomerId()); requested.setCustomerName(persisted.getCustomerName());
            requested.setOpportunityId(persisted.getOpportunityId()); requested.setOpportunityName(persisted.getOpportunityName());
        }
    }

    @Audit(name = "同步报价当前团队及金额预览")
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void synchronize(CrmQuote quote, CrmQuote persisted) {
        if (!Objects.equals(quote.getOwnerId(), persisted.getOwnerId()) && terminal(persisted))
            throw invalid("已接受或已过期报价不能直接更换负责人");
        CrmDealTeamStore.Current current = teams.inspect(BUSINESS, quote.getQuoteId());
        if (current.rows().isEmpty()) {
            quote.setOwnerName(owner(quote.getOwnerId()).owner().name());
            return;
        }
        Long previousOwner = current.rows().stream().filter(member -> "OWNER".equals(member.getRoleType())).map(CrmDealTeam::getSalesUserId).findFirst().orElseThrow();
        if (!Objects.equals(previousOwner, persisted.getOwnerId())) throw invalid("团队主责与报价负责人不一致");
        if (!Objects.equals(previousOwner, quote.getOwnerId())) {
            if (terminal(persisted)) throw invalid("已接受或已过期报价不能直接更换负责人");
            if (current.rows().size() != 1) throw invalid("多人团队更换负责人须在团队维护中明确主责及比例");
            CrmDealMemberResolver.Resolved resolved = owner(quote.getOwnerId());
            teams.replace(BUSINESS, quote.getQuoteId(), current.version(), resolved.members(), quote.getTotalAmount(), "同步负责人变更");
            quote.setOwnerName(resolved.owner().name());
        } else {
            CrmDealTeamStore.Snapshot snapshot = teams.lock(BUSINESS, quote.getQuoteId(), quote.getOwnerId(), current.version());
            teams.refreshPreview(BUSINESS, quote.getQuoteId(), snapshot, quote.getTotalAmount());
            quote.setOwnerName(snapshot.resolved().owner().name());
        }
    }

    private CrmDealMemberResolver.Resolved owner(Long userId) {
        return members.resolve(List.of(new CrmDealMemberResolver.Assignment(userId, "OWNER", BigDecimal.ONE, null)));
    }

    private boolean terminal(CrmQuote quote) { return "ACCEPTED".equals(quote.getStatus()) || "EXPIRED".equals(quote.getStatus()); }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
