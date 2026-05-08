package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.config.WorkflowCallbackStreamConstants;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmQuoteService;
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
public class CrmQuoteServiceImpl extends CrmServiceSupport<CrmQuoteMapper, CrmQuote>
        implements ICrmQuoteService {

    private final RemoteWorkflowService remoteWorkflowService;
    private final ICrmCustomerService customerService;
    private final RemoteOaService remoteOaService;

    @Override
    public PageResult<CrmQuote> queryPage(CrmQuote query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmQuote> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmQuote::getDelFlag, "0").orderByDesc(CrmQuote::getUpdateTime);
        eqIfPresent(wrapper, CrmQuote::getCustomerId, query.getCustomerId());
        eqIfPresent(wrapper, CrmQuote::getOpportunityId, query.getOpportunityId());
        likeIfPresent(wrapper, CrmQuote::getQuoteName, query.getQuoteName());
        eqIfPresent(wrapper, CrmQuote::getStatus, query.getStatus());
        return pageResult(pageQuery, wrapper);
    }

    @Override
    public boolean createQuote(CrmQuote quote) {
        fillCustomerSnapshot(quote);
        validate(quote);
        if (!StringUtils.hasText(quote.getQuoteNo())) {
            quote.setQuoteNo(Localize.nextNo("BJ"));
        }
        if (quote.getOwnerId() == null) {
            quote.setOwnerId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(quote.getOwnerName())) {
            quote.setOwnerName(currentUserName());
        }
        Localize.fillCommonAudit(quote, currentTenantId(), currentUserName(), now());
        return save(quote);
    }

    @Override
    public boolean updateQuote(CrmQuote quote) {
        if (quote == null || quote.getQuoteId() == null) {
            throw new IllegalArgumentException("报价ID不能为空");
        }
        fillCustomerSnapshot(quote);
        validate(quote);
        CrmQuote persisted = requireById(quote.getQuoteId(), "报价不存在");
        quote.setTenantId(persisted.getTenantId());
        if (!StringUtils.hasText(quote.getQuoteNo())) {
            quote.setQuoteNo(persisted.getQuoteNo());
        }
        if (quote.getOwnerId() == null) {
            quote.setOwnerId(persisted.getOwnerId());
        }
        if (!StringUtils.hasText(quote.getOwnerName())) {
            quote.setOwnerName(persisted.getOwnerName());
        }
        quote.setInstanceId(persisted.getInstanceId());
        quote.setUpdateBy(currentUserName());
        quote.setUpdateTime(now());
        return updateById(quote);
    }

    @Override
    public boolean submitQuote(Long quoteId) {
        CrmQuote quote = requireById(quoteId, "报价不存在");
        if (!"0".equals(quote.getDelFlag())) {
            throw new IllegalArgumentException("报价不存在");
        }
        if (!"DRAFT".equals(quote.getStatus()) && !"REJECTED".equals(quote.getStatus())) {
            throw new IllegalArgumentException("只有草稿或已驳回报价可以提交审批");
        }

        quote.setStatus("PENDING");
        quote.setUpdateBy(currentUserName());
        quote.setUpdateTime(now());

        WorkflowProcessStartDTO dto = new WorkflowProcessStartDTO();
        dto.setProcessDefKey("quote_approval");
        dto.setBusinessKey("CRM_QUOTE:" + quoteId);
        Map<String, Object> variables = new HashMap<>();
        variables.put("quoteId", quoteId);
        variables.put("quoteNo", quote.getQuoteNo());
        variables.put("quoteName", quote.getQuoteName());
        variables.put("customerId", quote.getCustomerId());
        variables.put("customerName", quote.getCustomerName());
        variables.put("totalAmount", quote.getTotalAmount());
        WorkflowCallbackStreamConstants.applyCallbackMetadata(
                variables,
                WorkflowCallbackStreamConstants.BUSINESS_TYPE_CRM_QUOTE,
                quoteId,
                quote.getQuoteNo()
        );
        dto.setVariables(variables);

        try {
            R<?> result = remoteWorkflowService.startProcess(dto);
            if (result != null && result.isSuccess() && result.getData() != null) {
                quote.setInstanceId(extractInstanceId(result.getData()));
            }
        } catch (Exception ignored) {
        }

        return updateById(quote);
    }

    @Override
    public boolean sendQuote(Long quoteId) {
        CrmQuote quote = requireById(quoteId, "报价不存在");
        if (!"APPROVED".equals(quote.getStatus()) && !"REJECTED".equals(quote.getStatus()) && !"DRAFT".equals(quote.getStatus())) {
            throw new IllegalArgumentException("当前报价状态不允许发送");
        }
        quote.setStatus("SENT");
        quote.setUpdateBy(currentUserName());
        quote.setUpdateTime(now());
        boolean updated = updateById(quote);
        if (updated) {
            customerService.refreshHealth(quote.getCustomerId());
        }
        return updated;
    }

    @Override
    public boolean acceptQuote(Long quoteId) {
        CrmQuote quote = requireById(quoteId, "报价不存在");
        if (!"APPROVED".equals(quote.getStatus()) && !"SENT".equals(quote.getStatus())) {
            throw new IllegalArgumentException("当前报价状态不允许接受");
        }
        if (quote.getContractId() == null) {
            createContractDraft(quoteId);
        }
        quote.setStatus("ACCEPTED");
        quote.setUpdateBy(currentUserName());
        quote.setUpdateTime(now());
        boolean updated = updateById(quote);
        if (updated) {
            customerService.refreshHealth(quote.getCustomerId());
        }
        return updated;
    }

    @Override
    public Long createContractDraft(Long quoteId) {
        CrmQuote quote = requireById(quoteId, "报价不存在");
        if (quote.getContractId() != null) {
            return quote.getContractId();
        }

        RemoteOaService.ContractDraftRequest request = new RemoteOaService.ContractDraftRequest();
        request.setContractName(StringUtils.hasText(quote.getQuoteName()) ? quote.getQuoteName() : "CRM报价转合同");
        request.setCounterpartyName(quote.getCustomerName());
        request.setContractType("SALES");
        request.setAmount(quote.getTotalAmount());
        request.setCurrency(quote.getCurrency());
        request.setOwnerId(quote.getOwnerId());
        request.setOwnerName(quote.getOwnerName());
        request.setCustomerId(quote.getCustomerId());
        request.setCustomerName(quote.getCustomerName());
        request.setRemark("由CRM报价 " + quote.getQuoteNo() + " 生成");

        R<Long> response = remoteOaService.createContract("true", "cloudflow-service-crm", request);
        if (response == null || !response.isSuccess()) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "生成合同草稿失败");
        }
        Long contractId = response.getData();
        if (contractId == null) {
            throw new IllegalArgumentException("OA 合同草稿返回ID为空");
        }
        quote.setContractId(contractId);
        try {
            RemoteOaService.ContractInfo contractInfo = remoteOaService.getContract(contractId).getData();
            if (contractInfo != null) {
                quote.setContractNo(contractInfo.getContractNo());
            }
        } catch (Exception ignored) {
        }
        quote.setUpdateBy(currentUserName());
        quote.setUpdateTime(now());
        updateById(quote);
        return contractId;
    }

    @Override
    public boolean expireQuote(Long quoteId) {
        CrmQuote quote = requireById(quoteId, "报价不存在");
        if ("ACCEPTED".equals(quote.getStatus())) {
            throw new IllegalArgumentException("已接受报价不能设为过期");
        }
        quote.setStatus("EXPIRED");
        quote.setUpdateBy(currentUserName());
        quote.setUpdateTime(now());
        boolean updated = updateById(quote);
        if (updated) {
            customerService.refreshHealth(quote.getCustomerId());
        }
        return updated;
    }

    private void validate(CrmQuote quote) {
        if (quote == null) {
            throw new IllegalArgumentException("报价不能为空");
        }
        if (quote.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        if (!StringUtils.hasText(quote.getQuoteName())) {
            throw new IllegalArgumentException("报价名称不能为空");
        }
        if (quote.getTotalAmount() == null) {
            throw new IllegalArgumentException("报价金额不能为空");
        }
        if (quote.getTaxAmount() == null) {
            quote.setTaxAmount(BigDecimal.ZERO);
        }
        if (!StringUtils.hasText(quote.getCurrency())) {
            quote.setCurrency("CNY");
        }
        if (!StringUtils.hasText(quote.getStatus())) {
            quote.setStatus("DRAFT");
        }
    }

    private void fillCustomerSnapshot(CrmQuote quote) {
        if (quote == null || quote.getCustomerId() == null) {
            return;
        }
        CrmCustomer customer = customerService.getById(quote.getCustomerId());
        if (customer != null && "0".equals(customer.getDelFlag())) {
            quote.setCustomerName(customer.getCustomerName());
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
