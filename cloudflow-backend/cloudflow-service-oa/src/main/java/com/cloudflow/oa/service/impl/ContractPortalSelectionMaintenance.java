package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.mapper.OaContractPortalMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ContractPortalSelectionMaintenance {
    public enum Kind { TERM, MILESTONE, PAYMENT }

    private final OaContractPortalMapper contracts;

    @Transactional(propagation = Propagation.MANDATORY)
    public OaContract lockContract(Long contractId) { return requireContract(contractId, true); }

    @Audit(name = "撤回删除项目的合同公开选择", spel = "@contractPortalSelectionMaintenance.auditState(#contractId)", diff = true, highRisk = true)
    @Transactional(propagation = Propagation.MANDATORY)
    public void forget(Long contractId, Kind kind, Long itemId) {
        OaContract contract = requireContract(contractId, true);
        String stored = switch (kind) {
            case TERM -> contract.getPortalTermIds();
            case MILESTONE -> contract.getPortalMilestoneIds();
            case PAYMENT -> contract.getPortalPaymentScheduleIds();
        };
        List<Long> selected = ContractPortalSelectionRules.fromStored(stored);
        if (!selected.contains(itemId)) return;
        String retained = ContractPortalSelectionRules.encode(selected.stream().filter(id -> !Objects.equals(id, itemId)).toList());
        switch (kind) {
            case TERM -> contract.setPortalTermIds(retained);
            case MILESTONE -> contract.setPortalMilestoneIds(retained);
            case PAYMENT -> contract.setPortalPaymentScheduleIds(retained);
        }
        contract.setUpdateBy(UserContext.getUserName()); contract.setUpdateTime(LocalDateTime.now());
        if (contract.getVersion() == null || contract.getVersion() == Integer.MAX_VALUE || contracts.save(contract) != 1) {
            throw new ServiceException("合同已变化，请核对公开范围后重试", 409);
        }
    }

    public ContractPortalPublicationService.Selection auditState(Long contractId) {
        OaContract contract = requireContract(contractId, false);
        return new ContractPortalPublicationService.Selection(contractId.toString(), contract.getVersion(),
                selected(contract.getPortalTermIds()), selected(contract.getPortalMilestoneIds()), selected(contract.getPortalPaymentScheduleIds()));
    }

    private OaContract requireContract(Long contractId, boolean lock) {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null || tenantId <= 0 || UserContext.getUserId() == null || contractId == null || contractId <= 0) {
            throw new ServiceException("合同不存在或无权访问", 404);
        }
        OaContract contract = contracts.contract(tenantId, contractId, lock, DataScopeUtils.listScope("dept_id", "owner_id"));
        if (contract == null || !Objects.equals(contract.getTenantId(), tenantId)) throw new ServiceException("合同不存在或无权访问", 404);
        return contract;
    }

    private static List<String> selected(String value) { return ContractPortalSelectionRules.fromStored(value).stream().map(String::valueOf).toList(); }
}
