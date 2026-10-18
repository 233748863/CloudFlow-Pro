package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.*;
import com.cloudflow.crm.service.remote.RemoteHrService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Objects;

@Service
@RequiredArgsConstructor
public class CrmReferenceService {
    private final CrmCustomerMapper customerMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmLeadMapper leadMapper;
    private final CrmServiceTicketMapper ticketMapper;
    private final CrmQuoteMapper quoteMapper;
    private final CrmContactMapper contactMapper;
    private final RemoteOaService remoteOaService;
    private final RemoteHrService remoteHrService;

    public CrmCustomer customer(Long id) {
        CrmRecordSupport.require(id, "客户ID不能为空");
        return CrmRecordSupport.require(customerMapper.selectByIdWithDataScope(id,
                DataScopeUtils.listScope("dept_id", "owner_id")), "客户不存在或无权访问");
    }

    public PageResult<ContractChoice> contractChoices(Long customerId, PageQuery page) {
        customer(customerId);
        int pageNum = page.getPageNum() == null || page.getPageNum() < 1 ? 1 : page.getPageNum();
        int pageSize = (int) page.build().getSize();
        R<PageResult<RemoteOaService.ContractInfo>> response = remoteOaService.listContracts(pageNum, pageSize, customerId, null);
        if (response == null || !response.isSuccess() || response.getData() == null || response.getData().getRows() == null) {
            throw new ServiceException("合同查询暂不可用，请稍后重试", 503);
        }
        List<CrmReferenceService.ContractChoice> rows = response.getData().getRows().stream().map(contract -> {
            if (contract == null || !Objects.equals(customerId, contract.getCustomerId())) {
                throw new ServiceException("合同查询结果校验失败，请稍后重试", 503);
            }
            return new ContractChoice(contract.getContractId(), contract.getContractNo(), contract.getContractName(), customerId);
        }).toList();
        return new PageResult<>(rows, response.getData().getTotal(), pageNum, pageSize);
    }

    public record ContractChoice(Long contractId, String contractNo, String contractName, Long customerId) { }

    public CrmOpportunity opportunity(Long id) {
        CrmRecordSupport.require(id, "商机ID不能为空");
        return CrmRecordSupport.require(opportunityMapper.selectByIdWithDataScope(id,
                DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")), "商机不存在或无权访问");
    }

    public CrmLead lead(Long id) {
        CrmRecordSupport.require(id, "线索ID不能为空");
        return CrmRecordSupport.require(leadMapper.selectByIdWithDataScope(id,
                DataScopeUtils.listScope("dept_id", "owner_id")), "线索不存在或无权访问");
    }

    public CrmServiceTicket ticket(Long id) {
        CrmRecordSupport.require(id, "工单ID不能为空");
        return CrmRecordSupport.require(ticketMapper.selectByIdWithDataScope(id,
                DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")), "工单不存在或无权访问");
    }

    public CrmQuote quote(Long id) {
        CrmRecordSupport.require(id, "报价ID不能为空");
        return CrmRecordSupport.require(quoteMapper.selectByIdWithDataScope(id,
                DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")), "报价不存在或无权访问");
    }

    public CrmContact contact(Long id) {
        CrmContact contact = CrmRecordSupport.require(contactMapper.selectById(id), "联系人不存在");
        customer(contact.getCustomerId());
        return contact;
    }

    public HrEmployeeSummaryVO user(Long id) {
        R<HrEmployeeSummaryVO> response = remoteHrService.getEmployeeByUserId(id);
        if (response == null || !response.isSuccess() || response.getData() == null || !response.getData().isActive()) {
            throw new CrmBusinessException("内部参与人或负责人不存在、已停用或人员服务暂不可用");
        }
        return response.getData();
    }

    public Long businessCustomer(String type, Long id) {
        if ("NONE".equals(type)) {
            if (id != null) throw new CrmBusinessException("无挂载对象时业务ID必须为空");
            return null;
        }
        CrmRecordSupport.require(id, "挂载对象ID不能为空");
        return switch (type) {
            case "CUSTOMER" -> customer(id).getCustomerId();
            case "OPPORTUNITY" -> opportunity(id).getCustomerId();
            case "LEAD" -> lead(id).getConvertedCustomerId();
            case "TICKET" -> ticket(id).getCustomerId();
            case "QUOTE" -> quote(id).getCustomerId();
            case "CONTRACT" -> {
                R<RemoteOaService.ContractInfo> response = remoteOaService.getContract(id);
                if (response == null || !response.isSuccess() || response.getData() == null
                        || !Objects.equals(id, response.getData().getContractId())) {
                    throw new CrmBusinessException("合同不存在或无权访问");
                }
                Long customerId = response.getData().getCustomerId();
                if (customerId != null) customer(customerId);
                yield customerId;
            }
            default -> throw new CrmBusinessException("不支持的挂载类型");
        };
    }
}
