package com.cloudflow.crm.service.deal;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.domain.CrmDealTeam;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.vo.CrmDealTeamView;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmDealTeamMapper;
import com.cloudflow.crm.mapper.CrmReceiptMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.receivable.CrmReceivableAccessService;
import com.cloudflow.crm.service.receivable.CrmReceivableAmounts;
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
public class CrmReceivableTeamService {
    private static final String BUSINESS = "RECEIVABLE";
    private final CrmReceivableAccessService access;
    private final CrmReceivableMapper receivables;
    private final CrmReceiptMapper receipts;
    private final CrmDealTeamMapper teamRecords;
    private final CrmDealTeamStore teams;
    private final CrmDealMemberResolver members;

    public record Initial(CrmDealMemberResolver.Resolved resolved, Integer sourceVersion) { }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public Initial prepareCreate(CrmReceivable record) {
        CrmDealMemberResolver.Resolved resolved;
        Integer sourceVersion = null;
        if (record.getContractId() == null) {
            resolved = owner(record.getOwnerId() == null ? UserContext.getUserId() : record.getOwnerId());
        } else {
            CrmReceiptMapper.ContractSource contract = receipts.lockContractSource(record.getContractId(), CrmRecordSupport.tenantId());
            if (contract == null || !Objects.equals(contract.tenantId(), CrmRecordSupport.tenantId())
                    || !Objects.equals(contract.contractId(), record.getContractId()) || !Objects.equals(contract.customerId(), record.getCustomerId()))
                throw invalid("来源合同不存在或与回款计划不属于同一客户");
            CrmDealPolicy.currency(contract.currency());
            CrmDealTeamStore.Current current = teams.inspect("CONTRACT", contract.contractId());
            requireCurrent("CONTRACT", contract.contractId(), current);
            CrmDealTeamStore.Snapshot snapshot = teams.lock("CONTRACT", contract.contractId(), contract.ownerId(), current.version());
            resolved = snapshot.resolved(); sourceVersion = snapshot.version();
            record.setContractNo(CrmRecordSupport.text(contract.contractNo(), 50, "合同编号"));
        }
        record.setOwnerId(resolved.owner().userId());
        record.setOwnerName(CrmRecordSupport.text(resolved.owner().name(), 64, "负责人姓名"));
        return new Initial(resolved, sourceVersion);
    }

    @Audit(name = "创建回款团队并复制合同分成版本")
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void initialize(CrmReceivable record, Initial initial) {
        if (initial.sourceVersion() == null) return;
        teams.replace(BUSINESS, record.getReceivableId(), 0, initial.resolved().members(), record.getPlannedAmount(),
                "关联合同时复制合同团队版本 " + initial.sourceVersion());
    }

    @Transactional(readOnly = true)
    public CrmDealTeamView read(Long id, Integer requestedVersion) {
        CrmReceivable record = access.read(id);
        List<Integer> versions = teams.versions(BUSINESS, id);
        int currentVersion = versions.isEmpty() ? 0 : versions.get(0);
        int version = requestedVersion == null ? currentVersion : requestedVersion;
        if (version < 0 || version == 0 && currentVersion != 0 || version > 0 && !versions.contains(version))
            throw invalid("团队历史版本不存在");
        List<CrmDealTeam> rows = teams.rows(BUSINESS, id, version);
        if (rows.isEmpty() && version > 0) throw invalid("团队成员版本不完整");
        List<CrmDealTeamView.Member> view = new ArrayList<>();
        boolean salaryVisible = StpUtil.hasPermission("crm:commission:manage");
        if (rows.isEmpty()) {
            CrmDealPolicy.Member owner = owner(record.getOwnerId()).owner();
            view.add(new CrmDealTeamView.Member(owner.userId(), owner.name(), owner.deptId(), owner.role(), BigDecimal.ONE,
                    CrmDealPolicy.money(record.getPlannedAmount()), null, null, "未配置团队，按负责人100%分配", null));
        } else {
            for (CrmDealTeam row : rows) {
                if (version == currentVersion && !Integer.valueOf(1).equals(row.getCurrentFlag())) throw invalid("当前团队版本不完整");
                view.add(new CrmDealTeamView.Member(row.getSalesUserId(), row.getSalesUserName(), row.getDeptId(), row.getRoleType(),
                        row.getAllocatedPercentage(), row.getAllocatedAmount(), salaryVisible ? row.getCommissionRate() : null,
                        salaryVisible && row.getCommissionRate() != null ? row.getCommissionAmount() : null, row.getRemark(), row.getCreateTime()));
            }
        }
        List<CrmDealTeamView.Member> owners = view.stream().filter(member -> "OWNER".equals(member.roleType())).toList();
        if (owners.size() != 1 || version == currentVersion && !Objects.equals(owners.get(0).salesUserId(), record.getOwnerId()))
            throw invalid("团队主责与回款计划负责人不一致");
        BigDecimal amount = view.stream().map(CrmDealTeamView.Member::allocatedAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new CrmDealTeamView(BUSINESS, id, record.getVersion(), version, currentVersion, owners.get(0).salesUserId(), amount,
                currency(record, false), version != currentVersion, List.copyOf(view), currentVersion == 0 ? List.of(0) : versions);
    }

    @Audit(name = "维护回款团队与主责")
    @Transactional(rollbackFor = Exception.class)
    public CrmDealTeamView save(Long id, CrmDealTeamRequest request) {
        CrmRecordSupport.require(request, "团队不能为空");
        CrmReceivable record = access.lockInScope(id);
        CrmReceivableAmounts.version(record, request.businessVersion());
        CrmReceivableAmounts.active(record);
        currency(record, true);
        CrmDealTeamStore.Current current = teams.inspect(BUSINESS, id);
        requireCurrent(BUSINESS, id, current);
        if (!Objects.equals(request.teamVersion(), current.version())) throw invalid("团队已被修改，请刷新后重试");
        if (!current.rows().isEmpty()) {
            List<CrmDealTeam> owners = current.rows().stream().filter(member -> "OWNER".equals(member.getRoleType())).toList();
            if (owners.size() != 1 || !Objects.equals(owners.get(0).getSalesUserId(), record.getOwnerId()))
                throw invalid("团队主责与回款计划负责人不一致");
        }
        if (request.members() == null || request.members().isEmpty() || request.members().size() > 200)
            throw invalid("团队须包含1至200名成员");
        List<CrmDealMemberResolver.Assignment> assignments = new ArrayList<>();
        for (CrmDealTeamRequest.Member member : request.members()) {
            CrmRecordSupport.require(member, "团队成员不能为空");
            BigDecimal rate = current.rows().stream().filter(row -> Objects.equals(row.getSalesUserId(), member.salesUserId())
                    && Objects.equals(row.getRoleType(), member.roleType()) && member.allocatedPercentage() != null
                    && row.getAllocatedPercentage().compareTo(member.allocatedPercentage()) == 0)
                    .map(CrmDealTeam::getCommissionRate).filter(Objects::nonNull).findFirst().orElse(null);
            assignments.add(new CrmDealMemberResolver.Assignment(member.salesUserId(), member.roleType(), member.allocatedPercentage(), rate));
        }
        CrmDealMemberResolver.Resolved resolved = members.resolve(assignments);
        teams.replace(BUSINESS, id, current.version(), resolved.members(), record.getPlannedAmount(), request.remark());
        record.setOwnerId(resolved.owner().userId());
        record.setOwnerName(CrmRecordSupport.text(resolved.owner().name(), 64, "负责人姓名"));
        CrmRecordSupport.touch(record);
        CrmRecordSupport.saved(receivables.writeOwner(record, request.businessVersion()));
        return read(id, null);
    }

    private void requireCurrent(String type, Long id, CrmDealTeamStore.Current current) {
        if (current.rows().isEmpty() && !teamRecords.lockVersions(type, id).isEmpty()) throw invalid("当前团队版本不完整，不能用默认负责人覆盖历史");
    }

    private String currency(CrmReceivable record, boolean lock) {
        return CrmDealPolicy.currency(record.getContractId() == null ? "CNY"
                : lock ? receipts.lockCurrency(record.getContractId(), record.getTenantId()) : receipts.readCurrency(record.getContractId(), record.getTenantId()));
    }

    private CrmDealMemberResolver.Resolved owner(Long userId) {
        return members.resolve(List.of(new CrmDealMemberResolver.Assignment(userId, "OWNER", BigDecimal.ONE, null)));
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
