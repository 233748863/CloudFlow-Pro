package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PortalContractVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.dto.ContractPortalSelectionRequest;
import com.cloudflow.oa.domain.vo.ContractPortalPublicationVO;
import com.cloudflow.oa.mapper.OaContractPortalMapper;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ContractPortalPublicationService {
    private final OaContractPortalMapper contracts;

    public record Selection(String contractId, Integer version, List<String> termIds, List<String> milestoneIds,
            List<String> paymentScheduleIds) { }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ContractPortalPublicationVO read(Long contractId) { return view(requireContract(contractId, false)); }

    @Audit(name = "维护客户合同公开范围", spel = "@contractPortalPublicationService.auditState(#contractId)", diff = true, highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public ContractPortalPublicationVO save(Long contractId, ContractPortalSelectionRequest request) {
        OaContract contract = requireContract(contractId, true);
        if (request == null || request.getVersion() == null || request.getVersion() < 0) {
            throw new ServiceException("当前合同版本不能为空且须为非负整数", 400);
        }
        if (!Objects.equals(contract.getVersion(), request.getVersion()) || contract.getVersion() == Integer.MAX_VALUE) throw conflict();
        List<Long> termIds = ContractPortalSelectionRules.fromRequest(request.getTermIds());
        List<Long> milestoneIds = ContractPortalSelectionRules.fromRequest(request.getMilestoneIds());
        List<Long> paymentIds = ContractPortalSelectionRules.fromRequest(request.getPaymentScheduleIds());
        requireMembers(termIds, termIds.isEmpty() ? List.of() : contracts.lockTerms(contract.getTenantId(), contractId, termIds));
        requireMembers(milestoneIds, milestoneIds.isEmpty() ? List.of() : contracts.lockMilestones(contract.getTenantId(), contractId, milestoneIds));
        requireMembers(paymentIds, paymentIds.isEmpty() ? List.of() : contracts.lockPayments(contract.getTenantId(), contractId, paymentIds));
        contract.setPortalTermIds(ContractPortalSelectionRules.encode(termIds));
        contract.setPortalMilestoneIds(ContractPortalSelectionRules.encode(milestoneIds));
        contract.setPortalPaymentScheduleIds(ContractPortalSelectionRules.encode(paymentIds));
        contract.setUpdateBy(UserContext.getUserName()); contract.setUpdateTime(LocalDateTime.now());
        if (contracts.save(contract) != 1) throw conflict();
        contract.setVersion(contract.getVersion() + 1);
        return view(contract);
    }

    public Selection auditState(Long contractId) {
        OaContract contract = requireContract(contractId, false);
        return new Selection(contractId.toString(), contract.getVersion(), selected(contract.getPortalTermIds()),
                selected(contract.getPortalMilestoneIds()), selected(contract.getPortalPaymentScheduleIds()));
    }

    private OaContract requireContract(Long contractId, boolean lock) {
        Long tenantId = UserContext.getTenantId();
        Set<String> permissions = UserContext.getPermissions();
        if (UserContext.getUserId() == null || tenantId == null || tenantId <= 0 || permissions == null
                || !(permissions.contains("*:*:*") || permissions.contains("oa:contract:edit"))) {
            throw new ServiceException("无权维护合同公开范围", 403);
        }
        OaContract contract = contractId == null || contractId <= 0 ? null : contracts.contract(tenantId, contractId, lock,
                DataScopeUtils.listScope("dept_id", "owner_id"));
        if (contract == null || !Objects.equals(contract.getTenantId(), tenantId)) {
            throw new ServiceException("合同不存在或无权访问", 404);
        }
        return contract;
    }

    private ContractPortalPublicationVO view(OaContract contract) {
        LocalDateTime now = LocalDateTime.now();
        Long tenantId = contract.getTenantId();
        Long contractId = contract.getContractId();
        List<PortalContractVO.Term> terms = contracts.terms(tenantId, contractId, now);
        List<PortalContractVO.Milestone> milestones = contracts.milestones(tenantId, contractId);
        List<PortalContractVO.PaymentSchedule> payments = contracts.payments(tenantId, contractId);
        return new ContractPortalPublicationVO(contractId.toString(), contract.getContractNo(), contract.getVersion(),
                contracts.ready(tenantId, contractId, now), currentSelection(contract.getPortalTermIds(), terms, PortalContractVO.Term::getTermId),
                currentSelection(contract.getPortalMilestoneIds(), milestones, PortalContractVO.Milestone::getId),
                currentSelection(contract.getPortalPaymentScheduleIds(), payments, PortalContractVO.PaymentSchedule::getId), terms, milestones, payments);
    }

    private static <Item> List<String> currentSelection(String value, List<Item> candidates, Function<Item, String> identifier) {
        Set<String> allowed = new HashSet<>();
        candidates.forEach(candidate -> allowed.add(identifier.apply(candidate)));
        return selected(value).stream().filter(allowed::contains).toList();
    }

    private static List<String> selected(String value) {
        return ContractPortalSelectionRules.fromStored(value).stream().map(String::valueOf).toList();
    }

    private static void requireMembers(List<Long> requested, List<Long> actual) {
        if (!requested.equals(actual.stream().sorted().toList())) throw new ServiceException("所选项目已删除、已变更或不属于当前合同，请核对后重试", 409);
    }

    private static ServiceException conflict() { return new ServiceException("合同已变化，请核对最新公开范围后重试", 409); }
}
