package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaContractTeam;
import com.cloudflow.oa.domain.dto.OaContractTeamRequest;
import com.cloudflow.oa.domain.vo.OaContractTeamView;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.mapper.OaContractTeamMapper;
import com.cloudflow.oa.service.remote.RemoteContractTeamDirectory;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OaContractTeamService {
    private final OaContractMapper contracts;
    private final OaContractTeamMapper teams;
    private final RemoteContractTeamDirectory directory;
    private final OaContractPerformanceService performance;

    private record Resolved(List<OaContractTeam> rows, Map<Long, RemoteContractTeamDirectory.Employee> employees) { }
    public record Initial(Long existingContractId, int sourceVersion, List<OaContractTeam> rows) { }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public Initial prepareCreate(OaContract contract) {
        if ("CRM_OPPORTUNITY".equals(contract.getSourceType())) {
            if (contract.getSourceId() == null || contract.getSourceId() <= 0 || UserContext.getUserId() == null)
                throw invalid("商机来源和当前用户不能为空");
            OaContractTeamMapper.OpportunitySource source = teams.lockOpportunitySource(contract.getSourceId(), OaRecordSupport.tenantId(), DataScopeUtils.listScope("scope_dept_id", "scope_owner_id"));
            if (source == null || !Objects.equals(source.tenantId(), OaRecordSupport.tenantId()) || !Objects.equals(source.customerId(), contract.getCustomerId()))
                throw invalid("来源商机不存在、无权访问或不属于同一客户");
            if (!"WON".equals(source.stage()) || !"CLOSED".equals(source.status()) || contract.getSourceVersion() == null
                    || !Objects.equals(contract.getSourceVersion(), source.version())) throw invalid("来源商机已改变或已恢复，不能沿用原赢单请求创建合同");
            return null;
        }
        if (!"CRM_QUOTE".equals(contract.getSourceType())) return null;
        if (contract.getSourceId() == null || contract.getSourceId() <= 0 || UserContext.getUserId() == null)
            throw invalid("报价来源和当前用户不能为空");
        OaContractTeamMapper.QuoteSource source = teams.lockQuoteSource(contract.getSourceId(), OaRecordSupport.tenantId(), DataScopeUtils.listScope("scope_dept_id", "scope_owner_id"));
        if (source == null || !Objects.equals(source.tenantId(), OaRecordSupport.tenantId())
                || !Objects.equals(source.customerId(), contract.getCustomerId())) throw invalid("来源报价不存在、无权访问或不属于同一客户");
        if (contract.getOpportunityVersion() != null) {
            OaContractTeamMapper.OpportunitySource opportunity = teams.quoteOpportunity(source.quoteId(), source.tenantId());
            if (opportunity == null || !"WON".equals(opportunity.stage()) || !"CLOSED".equals(opportunity.status())
                    || !Objects.equals(contract.getOpportunityVersion(), opportunity.version())) throw invalid("报价来源商机已改变或已恢复，不能沿用原赢单请求创建合同");
        }
        List<OaContract> existing = teams.quoteContracts(source.quoteId(), source.tenantId());
        if (existing.size() > 1) throw invalid("报价存在多份来源合同，请先核对关联记录");
        if (!existing.isEmpty()) {
            OaContract previous = existing.get(0);
            if (!Integer.valueOf(0).equals(previous.getDeleted()) || !Objects.equals(previous.getCustomerId(), source.customerId())
                    || !Objects.equals(previous.getCurrency(), source.currency())) throw invalid("报价来源合同已变更，请先核对关联记录");
            return new Initial(previous.getContractId(), 0, List.of());
        }
        if (contract.getSourceVersion() == null || !Objects.equals(contract.getSourceVersion(), source.version()))
            throw invalid("来源报价已被修改，请刷新后生成合同");
        String currency = OaContractTeamPolicy.currency(source.currency());
        if (contract.getCurrency() != null && !contract.getCurrency().isBlank() && !Objects.equals(contract.getCurrency(), currency))
            throw invalid("来源报价与新合同币种必须一致");
        List<OaContractTeam> current = teams.lockQuoteTeam(source.quoteId(), source.tenantId());
        List<Integer> versions = teams.quoteVersions(source.quoteId(), source.tenantId());
        int version = versions.isEmpty() ? 0 : versions.get(0);
        if (current.isEmpty() && version != 0 || !current.isEmpty() && (version <= 0 || current.stream().anyMatch(row ->
                !Objects.equals(row.getTeamVersion(), version) || !Objects.equals(row.getTenantId(), source.tenantId())
                    || !Objects.equals(row.getBizId(), source.quoteId()) || !"QUOTE".equals(row.getBizType()) || !Integer.valueOf(1).equals(row.getCurrentFlag()))))
            throw invalid("来源报价当前团队版本不完整");
        List<OaContractTeamRequest.Member> assignments = current.isEmpty()
                ? List.of(new OaContractTeamRequest.Member(source.ownerId(), "OWNER", BigDecimal.ONE))
                : current.stream().map(row -> new OaContractTeamRequest.Member(row.getSalesUserId(), row.getRoleType(), row.getAllocatedPercentage())).toList();
        Resolved resolved = resolve(assignments, current);
        OaContractTeam owner = owner(resolved.rows());
        if (!Objects.equals(owner.getSalesUserId(), source.ownerId())) throw invalid("来源报价团队主责与负责人不一致");
        RemoteContractTeamDirectory.Employee employee = resolved.employees().get(owner.getSalesUserId());
        contract.setOwnerId(employee.userId()); contract.setOwnerName(employee.employeeName());
        contract.setDeptId(employee.deptId()); contract.setDeptName(employee.deptName());
        contract.setCustomerName(source.customerName()); contract.setCurrency(currency);
        return new Initial(null, version, List.copyOf(resolved.rows()));
    }

    @Audit(name = "创建合同并复制来源报价团队")
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void initialize(OaContract contract, Initial initial) {
        if (initial == null) return;
        if (initial.existingContractId() != null) throw invalid("重复来源合同不能再次初始化团队");
        replace(contract, 0, List.of(), initial.rows(), "创建合同时复制来源报价团队版本 " + initial.sourceVersion());
    }

    public boolean hasHistory(Long id) {
        return teams.hasHistory(id, OaRecordSupport.tenantId());
    }

    public boolean hasCurrencyHistory(Long id) {
        return teams.hasCurrencyHistory(id, OaRecordSupport.tenantId());
    }

    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public OaContractTeamView read(Long id, Integer requestedVersion) {
        return view(lock(id), requestedVersion);
    }

    @Audit(name = "维护合同团队与主责")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public OaContractTeamView save(Long id, OaContractTeamRequest request) {
        OaRecordSupport.require(request, "团队不能为空");
        OaContract contract = lock(id);
        if (request.businessVersion() == null || !Objects.equals(request.businessVersion(), contract.getVersion()))
            throw invalid("合同已被修改，请刷新后重试");
        List<OaContractTeam> current = teams.lockCurrent(id, OaRecordSupport.tenantId());
        int currentVersion = currentVersion(id, current);
        if (!Objects.equals(request.teamVersion(), currentVersion)) throw invalid("团队已被修改，请刷新后重试");
        if (!current.isEmpty() && !Objects.equals(owner(current).getSalesUserId(), contract.getOwnerId()))
            throw invalid("团队主责与合同负责人不一致");
        Resolved resolved = resolve(request.members(), current);
        OaContractTeam owner = owner(resolved.rows());
        if (!Objects.equals(owner.getSalesUserId(), contract.getOwnerId()) && terminal(contract))
            throw invalid("已取消、到期或终止的合同不能直接更换负责人");
        OaContractTeamPolicy.currency(contract.getCurrency());
        performance.synchronize(id);
        replace(contract, currentVersion, current, resolved.rows(), request.remark());
        RemoteContractTeamDirectory.Employee employee = resolved.employees().get(owner.getSalesUserId());
        contract.setOwnerId(employee.userId()); contract.setOwnerName(employee.employeeName());
        contract.setDeptId(employee.deptId()); contract.setDeptName(employee.deptName()); OaRecordSupport.touch(contract);
        OaRecordSupport.saved(contracts.writeTeamOwner(contract, request.businessVersion()));
        contract.setVersion(request.businessVersion() + 1);
        return view(contract, null);
    }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void validateEdit(OaContract proposed, OaContract previous) {
        if (proposed.getVersion() == null || !Objects.equals(proposed.getVersion(), previous.getVersion()))
            throw invalid("合同已被修改，请刷新核对后重试");
        if (proposed.getCurrency() == null || proposed.getCurrency().isBlank()) proposed.setCurrency(previous.getCurrency());
        OaContractTeamPolicy.currency(proposed.getCurrency());
        boolean linked = Set.of("CRM_QUOTE", "CRM_OPPORTUNITY").contains(previous.getSourceType() == null ? "" : previous.getSourceType());
        boolean requestedLink = Set.of("CRM_QUOTE", "CRM_OPPORTUNITY").contains(proposed.getSourceType() == null ? "" : proposed.getSourceType());
        if (linked || requestedLink) {
            if (proposed.getSourceType() != null && !Objects.equals(proposed.getSourceType(), previous.getSourceType())
                    || proposed.getSourceId() != null && !Objects.equals(proposed.getSourceId(), previous.getSourceId())
                    || proposed.getCustomerId() != null && !Objects.equals(proposed.getCustomerId(), previous.getCustomerId()))
                throw invalid("报价或商机来源及客户须由原业务入口建立，不能直接修改");
            proposed.setSourceType(previous.getSourceType()); proposed.setSourceId(previous.getSourceId());
            proposed.setCustomerId(previous.getCustomerId()); proposed.setCustomerName(previous.getCustomerName());
        }
        if (!hasCurrencyHistory(previous.getContractId())) return;
        if (!Objects.equals(proposed.getCurrency(), previous.getCurrency()))
            throw invalid("合同已有历史分成记录，币种已锁定；换币种请另建合同");
        if (proposed.getCustomerId() != null && !Objects.equals(proposed.getCustomerId(), previous.getCustomerId())
                || proposed.getSourceId() != null && !Objects.equals(proposed.getSourceId(), previous.getSourceId())
                || proposed.getSourceType() != null && !Objects.equals(proposed.getSourceType(), previous.getSourceType()))
            throw invalid("合同已有历史分成记录，不能更换客户或业务来源");
        proposed.setCustomerId(previous.getCustomerId()); proposed.setCustomerName(previous.getCustomerName());
        proposed.setSourceType(previous.getSourceType()); proposed.setSourceId(previous.getSourceId());
    }

    @Audit(name = "同步合同团队及金额预览")
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void synchronize(OaContract proposed, OaContract previous) {
        List<OaContractTeam> current = teams.lockCurrent(previous.getContractId(), OaRecordSupport.tenantId());
        int version = currentVersion(previous.getContractId(), current);
        if (current.isEmpty()) return;
        if (!Objects.equals(owner(current).getSalesUserId(), previous.getOwnerId())) throw invalid("团队主责与合同负责人不一致");
        if (!Objects.equals(proposed.getOwnerId(), previous.getOwnerId())) {
            if (terminal(previous)) throw invalid("已取消、到期或终止的合同不能直接更换负责人");
            if (current.size() != 1) throw invalid("多人团队更换负责人须在团队维护中明确主责及比例");
            Resolved next = resolve(List.of(new OaContractTeamRequest.Member(proposed.getOwnerId(), "OWNER", BigDecimal.ONE)), List.of());
            replace(proposed, version, current, next.rows(), "同步合同负责人变更");
            RemoteContractTeamDirectory.Employee employee = next.employees().get(proposed.getOwnerId());
            proposed.setOwnerName(employee.employeeName()); proposed.setDeptId(employee.deptId()); proposed.setDeptName(employee.deptName());
        } else {
            OaContractTeamPolicy.allocate(proposed.getAmount(), current);
            for (OaContractTeam member : current) {
                OaRecordSupport.touch(member);
                OaRecordSupport.saved(teams.updatePreview(member));
            }
            proposed.setOwnerName(previous.getOwnerName()); proposed.setDeptId(previous.getDeptId()); proposed.setDeptName(previous.getDeptName());
        }
    }

    private OaContract lock(Long id) {
        if (id == null || id <= 0 || UserContext.getUserId() == null) throw invalid("读取合同团队需要有效合同及用户身份");
        return OaRecordSupport.active(contracts.selectTeamForUpdate(id, OaRecordSupport.tenantId(), DataScopeUtils.listScope("dept_id", "owner_id")));
    }

    private OaContractTeamView view(OaContract contract, Integer requestedVersion) {
        List<Integer> versions = teams.versions(contract.getContractId(), OaRecordSupport.tenantId());
        int currentVersion = versions.isEmpty() ? 0 : versions.get(0);
        int version = requestedVersion == null ? currentVersion : requestedVersion;
        if (version < 0 || version == 0 && currentVersion != 0 || version > 0 && !versions.contains(version))
            throw invalid("团队历史版本不存在");
        List<OaContractTeam> rows = teams.rows(contract.getContractId(), OaRecordSupport.tenantId(), version);
        if (rows.isEmpty() && version > 0) throw invalid("团队成员版本不完整");
        if (version == 0) {
            rows = resolve(List.of(new OaContractTeamRequest.Member(contract.getOwnerId(), "OWNER", BigDecimal.ONE)), List.of()).rows();
            OaContractTeamPolicy.allocate(contract.getAmount(), rows);
        } else if (version == currentVersion && (rows.stream().anyMatch(member -> !Integer.valueOf(1).equals(member.getCurrentFlag()))
                || !Objects.equals(owner(rows).getSalesUserId(), contract.getOwnerId()))) {
            throw invalid("当前团队或主责版本不完整");
        }
        boolean salaryVisible = StpUtil.hasPermission("crm:commission:manage");
        List<OaContractTeamView.Member> result = rows.stream().map(member -> new OaContractTeamView.Member(member.getSalesUserId(),
                member.getSalesUserName(), member.getDeptId(), member.getRoleType(), member.getAllocatedPercentage(), member.getAllocatedAmount(),
                salaryVisible ? member.getCommissionRate() : null, salaryVisible && member.getCommissionRate() != null ? member.getCommissionAmount() : null,
                version == 0 ? "未配置团队，按负责人100%分配" : member.getRemark(), member.getCreateTime())).toList();
        return new OaContractTeamView("CONTRACT", contract.getContractId(), contract.getVersion(), version, currentVersion,
                owner(rows).getSalesUserId(), rows.stream().map(OaContractTeam::getAllocatedAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                OaContractTeamPolicy.currency(contract.getCurrency()), version != currentVersion, result, versions.isEmpty() ? List.of(0) : versions);
    }

    private Resolved resolve(List<OaContractTeamRequest.Member> requested, List<OaContractTeam> previous) {
        if (requested == null || requested.isEmpty() || requested.size() > 200) throw invalid("团队须包含1至200名成员");
        Set<Long> users = new HashSet<>();
        for (OaContractTeamRequest.Member member : requested) {
            if (member == null || member.salesUserId() == null || member.salesUserId() <= 0 || !users.add(member.salesUserId()))
                throw invalid("团队成员须为有效用户且不可重复");
        }
        com.cloudflow.common.core.domain.R<List<RemoteContractTeamDirectory.Employee>> response;
        try { response = directory.employees(users.stream().sorted().toList()); }
        catch (RuntimeException unavailable) { throw invalid("员工服务暂不可用，团队变更未保存"); }
        if (response == null || !response.isSuccess() || response.getData() == null) throw invalid("员工服务暂不可用，团队变更未保存");
        Map<Long, RemoteContractTeamDirectory.Employee> employees = new HashMap<>();
        Set<Long> employeeIds = new HashSet<>();
        for (RemoteContractTeamDirectory.Employee employee : response.getData()) {
            if (employee == null || !users.contains(employee.userId()) || !Objects.equals(employee.tenantId(), OaRecordSupport.tenantId())
                    || employee.employeeId() == null || employee.employeeId() <= 0 || !employeeIds.add(employee.employeeId())
                    || !employee.active() || !employee.userEnabled() || !employee.departmentEnabled()
                    || employee.deptId() == null || employee.deptId() <= 0 || employees.putIfAbsent(employee.userId(), employee) != null)
                throw invalid("团队成员须为本租户唯一在职员工，且账号和部门均已启用");
        }
        if (employees.size() != users.size()) throw invalid("部分团队成员不存在或员工服务暂不可用");
        List<OaContractTeam> rows = new ArrayList<>();
        for (OaContractTeamRequest.Member member : requested) {
            RemoteContractTeamDirectory.Employee employee = employees.get(member.salesUserId());
            OaContractTeam row = new OaContractTeam();
            row.setSalesUserId(employee.userId()); row.setSalesUserName(employee.employeeName()); row.setDeptId(employee.deptId());
            row.setRoleType(member.roleType()); row.setAllocatedPercentage(member.allocatedPercentage());
            row.setCommissionRate(previous.stream().filter(old -> Objects.equals(old.getSalesUserId(), member.salesUserId())
                    && Objects.equals(old.getRoleType(), member.roleType()) && member.allocatedPercentage() != null
                    && old.getAllocatedPercentage().compareTo(member.allocatedPercentage()) == 0)
                    .map(OaContractTeam::getCommissionRate).filter(Objects::nonNull).findFirst().orElse(null));
            rows.add(row);
        }
        OaContractTeamPolicy.allocate(BigDecimal.ZERO, rows);
        rows.sort(Comparator.comparing(OaContractTeam::getSalesUserId));
        return new Resolved(rows, Map.copyOf(employees));
    }

    private void replace(OaContract contract, int version, List<OaContractTeam> previous, List<OaContractTeam> next, String remark) {
        if (remark != null && remark.length() > 500) throw invalid("团队调整说明最多500字符");
        if (version == Integer.MAX_VALUE || Integer.valueOf(Integer.MAX_VALUE).equals(contract.getVersion())) throw invalid("合同或团队版本已达到上限");
        OaContractTeamPolicy.allocate(contract.getAmount(), next);
        if (!previous.isEmpty() && teams.retireCurrent(contract.getContractId(), OaRecordSupport.tenantId(), version,
                OaRecordSupport.userName(), LocalDateTime.now()) != previous.size()) throw invalid("团队已被修改，请刷新后重试");
        for (OaContractTeam member : next) {
            OaRecordSupport.create(member, "teamId"); member.setBizType("CONTRACT"); member.setBizId(contract.getContractId());
            member.setTeamVersion(version + 1); member.setCurrentFlag(1); member.setRemark(remark == null ? null : remark.trim());
            OaRecordSupport.saved(teams.insert(member));
        }
    }

    private int currentVersion(Long id, List<OaContractTeam> current) {
        if (current.isEmpty()) {
            if (hasHistory(id)) throw invalid("当前团队版本不完整");
            return 0;
        }
        Integer version = current.get(0).getTeamVersion();
        if (version == null || version <= 0 || current.stream().anyMatch(member -> !Objects.equals(member.getTeamVersion(), version)
                || !Objects.equals(member.getTenantId(), OaRecordSupport.tenantId()) || !"CONTRACT".equals(member.getBizType())))
            throw invalid("当前团队须为本租户完整的同一版本");
        return version;
    }

    private OaContractTeam owner(List<OaContractTeam> rows) {
        List<OaContractTeam> owners = rows.stream().filter(member -> "OWNER".equals(member.getRoleType())).toList();
        if (owners.size() != 1) throw invalid("团队必须有且仅有一名主责");
        return owners.get(0);
    }

    private boolean terminal(OaContract contract) { return Set.of("CANCELLED", "EXPIRED", "TERMINATED").contains(contract.getStatus()); }
    private static IllegalArgumentException invalid(String message) { return new IllegalArgumentException(message); }
}
