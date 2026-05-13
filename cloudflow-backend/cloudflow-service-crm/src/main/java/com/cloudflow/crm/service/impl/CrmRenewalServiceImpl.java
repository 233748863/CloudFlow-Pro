package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.config.WorkflowCallbackStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmRenewalService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import com.cloudflow.crm.service.remote.RemoteWorkflowService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CrmRenewalServiceImpl extends CrmServiceSupport<CrmRenewalMapper, CrmRenewal>
        implements ICrmRenewalService {

    private final RemoteWorkflowService remoteWorkflowService;
    private final ICrmCustomerService customerService;
    private final RemoteOaService remoteOaService;

    @Override
    public PageResult<CrmRenewal> queryPage(CrmRenewal query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmRenewal> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmRenewal::getDelFlag, "0").orderByDesc(CrmRenewal::getUpdateTime);
        eqIfPresent(wrapper, CrmRenewal::getCustomerId, query.getCustomerId());
        eqIfPresent(wrapper, CrmRenewal::getContractId, query.getContractId());
        likeIfPresent(wrapper, CrmRenewal::getRenewalName, query.getRenewalName());
        eqIfPresent(wrapper, CrmRenewal::getStatus, query.getStatus());
        PageResult<CrmRenewal> result = pageResult(pageQuery, wrapper);
        if (result.getRows() != null) {
            result.getRows().forEach(CrmRenewalRiskEvaluator::enrich);
        }
        return result;
    }

    @Override
    public CrmRenewal getRenewalInfo(Long renewalId) {
        CrmRenewal renewal = getById(renewalId);
        if (renewal != null) {
            CrmRenewalRiskEvaluator.enrich(renewal);
        }
        return renewal;
    }

    @Override
    public boolean createRenewal(CrmRenewal renewal) {
        fillBindingSnapshot(renewal);
        validate(renewal);
        if (!StringUtils.hasText(renewal.getRenewalNo())) {
            renewal.setRenewalNo(Localize.nextNo(CrmConstants.NoPrefix.RENEWAL));
        }
        if (renewal.getOwnerId() == null) {
            renewal.setOwnerId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(renewal.getOwnerName())) {
            renewal.setOwnerName(currentUserName());
        }
        Localize.fillCommonAudit(renewal, currentTenantId(), currentUserName(), now());
        boolean saved = save(renewal);
        if (saved) {
            customerService.refreshHealth(renewal.getCustomerId());
        }
        return saved;
    }

    @Override
    public boolean updateRenewal(CrmRenewal renewal) {
        if (renewal == null || renewal.getRenewalId() == null) {
            throw new IllegalArgumentException("续约ID不能为空");
        }
        fillBindingSnapshot(renewal);
        validate(renewal);
        CrmRenewal persisted = requireById(renewal.getRenewalId(), "续约记录不存在");
        renewal.setTenantId(persisted.getTenantId());
        if (!StringUtils.hasText(renewal.getRenewalNo())) {
            renewal.setRenewalNo(persisted.getRenewalNo());
        }
        if (renewal.getOwnerId() == null) {
            renewal.setOwnerId(persisted.getOwnerId());
        }
        if (!StringUtils.hasText(renewal.getOwnerName())) {
            renewal.setOwnerName(persisted.getOwnerName());
        }
        renewal.setInstanceId(persisted.getInstanceId());
        renewal.setUpdateBy(currentUserName());
        renewal.setUpdateTime(now());
        boolean updated = updateById(renewal);
        if (updated) {
            customerService.refreshHealth(renewal.getCustomerId());
        }
        return updated;
    }

    @Override
    public boolean submitRenewal(Long renewalId) {
        CrmRenewal renewal = requireById(renewalId, "续约记录不存在");
        if (!"0".equals(renewal.getDelFlag())) {
            throw new IllegalArgumentException("续约记录不存在");
        }
        if (!CrmConstants.RenewalStatus.PLANNED.equals(renewal.getStatus())
                && !CrmConstants.RenewalStatus.NEGOTIATING.equals(renewal.getStatus())) {
            throw new IllegalArgumentException("只有计划中或洽谈中续约可以提交审批");
        }

        renewal.setStatus(CrmConstants.RenewalStatus.PENDING);
        renewal.setUpdateBy(currentUserName());
        renewal.setUpdateTime(now());

        WorkflowProcessStartDTO dto = new WorkflowProcessStartDTO();
        dto.setProcessDefKey("customer_renewal_review");
        dto.setBusinessKey("CRM_RENEWAL:" + renewalId);
        Map<String, Object> variables = new HashMap<>();
        variables.put("renewalId", renewalId);
        variables.put("renewalNo", renewal.getRenewalNo());
        variables.put("renewalName", renewal.getRenewalName());
        variables.put("customerId", renewal.getCustomerId());
        variables.put("customerName", renewal.getCustomerName());
        variables.put("renewalAmount", renewal.getRenewalAmount());
        variables.put("currentExpireDate", renewal.getCurrentExpireDate());
        WorkflowCallbackStreamConstants.applyCallbackMetadata(
                variables,
                WorkflowCallbackStreamConstants.BUSINESS_TYPE_CRM_RENEWAL,
                renewalId,
                renewal.getRenewalNo()
        );
        dto.setVariables(variables);

        try {
            R<?> result = remoteWorkflowService.startProcess(dto);
            if (result != null && result.isSuccess() && result.getData() != null) {
                renewal.setInstanceId(extractInstanceId(result.getData()));
            }
        } catch (Exception ignored) {
        }

        boolean updated = updateById(renewal);
        if (updated) {
            customerService.refreshHealth(renewal.getCustomerId());
        }
        return updated;
    }

    private void validate(CrmRenewal renewal) {
        if (renewal == null) {
            throw new IllegalArgumentException("续约不能为空");
        }
        if (renewal.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        if (!StringUtils.hasText(renewal.getRenewalName())) {
            throw new IllegalArgumentException("续约名称不能为空");
        }
        if (renewal.getRenewalAmount() == null) {
            renewal.setRenewalAmount(BigDecimal.ZERO);
        }
        if (!StringUtils.hasText(renewal.getStatus())) {
            renewal.setStatus(CrmConstants.RenewalStatus.PLANNED);
        }
    }

    private void fillBindingSnapshot(CrmRenewal renewal) {
        if (renewal == null) {
            return;
        }
        if (renewal.getContractId() != null) {
            try {
                R<RemoteOaService.ContractInfo> result = remoteOaService.getContract(renewal.getContractId());
                if (result != null && result.isSuccess() && result.getData() != null) {
                    RemoteOaService.ContractInfo contract = result.getData();
                    if (StringUtils.hasText(contract.getContractNo())) {
                        renewal.setContractNo(contract.getContractNo());
                    }
                    if (contract.getCustomerId() != null) {
                        renewal.setCustomerId(contract.getCustomerId());
                    }
                    if (StringUtils.hasText(contract.getCustomerName())) {
                        renewal.setCustomerName(contract.getCustomerName());
                    }
                }
            } catch (Exception ignored) {
            }
        }
        if (renewal.getCustomerId() != null && !StringUtils.hasText(renewal.getCustomerName())) {
            CrmCustomer customer = customerService.getById(renewal.getCustomerId());
            if (customer != null && "0".equals(customer.getDelFlag())) {
                renewal.setCustomerName(customer.getCustomerName());
            }
        }
    }

    private String extractInstanceId(Object data) {
        if (data instanceof Map<?, ?> dataMap) {
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        return data != null ? String.valueOf(data) : null;
    }
}
