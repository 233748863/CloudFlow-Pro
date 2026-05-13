package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.service.ICrmCrossModuleDraftService;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * 统一收口 CRM 调 OA 的跨模块草稿 / 绑定 / 作废 / 回款确认。
 *
 * <p>历史上这些逻辑散落在 {@link CrmCustomerServiceImpl}（1080 行），
 * 本身属于集成层而非客户域，拆出这里便于后续接入审批、事件发布与观测。
 */
@Service
@RequiredArgsConstructor
public class CrmCrossModuleDraftServiceImpl implements ICrmCrossModuleDraftService {

    private final CrmCustomerMapper customerMapper;
    private final CrmReceivableMapper receivableMapper;
    private final ICrmCustomerService customerService;
    private final RemoteOaService remoteOaService;
    private final CrmEventPublisher crmEventPublisher;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createContractDraft(Long customerId, RemoteOaService.ContractDraftRequest request) {
        CrmCustomer customer = requireCustomer(customerId);
        RemoteOaService.ContractDraftRequest payload = request == null ? new RemoteOaService.ContractDraftRequest() : request;
        payload.setCustomerId(customerId);
        payload.setCustomerName(customer.getCustomerName());
        if (!StringUtils.hasText(payload.getCounterpartyName())) {
            payload.setCounterpartyName(customer.getCustomerName());
        }
        if (!StringUtils.hasText(payload.getContractName())) {
            payload.setContractName(customer.getCustomerName() + "合同草稿");
        }
        if (!StringUtils.hasText(payload.getContractType())) {
            payload.setContractType("SALES");
        }
        if (payload.getAmount() == null) {
            payload.setAmount(BigDecimal.ZERO);
        }
        R<Long> response = remoteOaService.createContract("true", CrmConstants.SERVICE_NAME, payload);
        if (response == null || !response.isSuccess() || response.getData() == null) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "生成合同草稿失败");
        }
        return response.getData();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createProjectDraft(Long customerId, RemoteOaService.ProjectDraftRequest request) {
        CrmCustomer customer = requireCustomer(customerId);
        RemoteOaService.ProjectDraftRequest payload = request == null ? new RemoteOaService.ProjectDraftRequest() : request;
        payload.setCustomerId(customerId);
        payload.setCustomerName(customer.getCustomerName());
        if (!StringUtils.hasText(payload.getProjectName())) {
            payload.setProjectName(customer.getCustomerName() + "交付项目");
        }
        if (!StringUtils.hasText(payload.getProjectType())) {
            payload.setProjectType("DELIVERY");
        }
        if (!StringUtils.hasText(payload.getStatus())) {
            payload.setStatus("DRAFT");
        }
        if (!StringUtils.hasText(payload.getPriority())) {
            payload.setPriority("MEDIUM");
        }
        if (!StringUtils.hasText(payload.getRiskLevel())) {
            payload.setRiskLevel(CrmConstants.RiskLevel.LOW);
        }
        if (!StringUtils.hasText(payload.getSourceType())) {
            payload.setSourceType("CRM_CUSTOMER");
        }
        if (payload.getSourceId() == null) {
            payload.setSourceId(customerId);
        }
        if (!StringUtils.hasText(payload.getSourceName())) {
            payload.setSourceName(customer.getCustomerName());
        }
        if (payload.getBudgetAmount() == null) {
            payload.setBudgetAmount(BigDecimal.ZERO);
        }
        R<Long> response = remoteOaService.createProject("true", CrmConstants.SERVICE_NAME, payload);
        if (response == null || !response.isSuccess() || response.getData() == null) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "生成项目草稿失败");
        }
        return response.getData();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createBudgetDraft(Long customerId, RemoteOaService.BudgetDraftRequest request) {
        CrmCustomer customer = requireCustomer(customerId);
        RemoteOaService.BudgetDraftRequest payload = request == null ? new RemoteOaService.BudgetDraftRequest() : request;
        if (!StringUtils.hasText(payload.getBudgetName())) {
            payload.setBudgetName(customer.getCustomerName() + "预算草稿");
        }
        if (payload.getFiscalYear() == null) {
            payload.setFiscalYear(LocalDate.now().getYear());
        }
        if (!StringUtils.hasText(payload.getPeriodType())) {
            payload.setPeriodType("ANNUAL");
        }
        if (!StringUtils.hasText(payload.getTargetType())) {
            payload.setTargetType(payload.getProjectId() != null ? "PROJECT" : "DEPT");
        }
        if (!StringUtils.hasText(payload.getTargetName())) {
            payload.setTargetName(StringUtils.hasText(payload.getProjectName())
                    ? payload.getProjectName() : customer.getDeptName());
        }
        if (payload.getTargetId() == null) {
            payload.setTargetId("PROJECT".equals(payload.getTargetType())
                    ? payload.getProjectId() : customer.getDeptId());
        }
        if (payload.getTotalAmount() == null) {
            payload.setTotalAmount(BigDecimal.ZERO);
        }
        if (payload.getLines() == null || payload.getLines().isEmpty()) {
            throw new IllegalArgumentException("预算明细不能为空");
        }
        R<Void> response = remoteOaService.createBudget("true", CrmConstants.SERVICE_NAME, payload);
        if (response == null || !response.isSuccess()) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "生成预算草稿失败");
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createInvoiceDraft(Long customerId, RemoteOaService.InvoiceDraftRequest request) {
        CrmCustomer customer = requireCustomer(customerId);
        RemoteOaService.InvoiceDraftRequest payload = request == null ? new RemoteOaService.InvoiceDraftRequest() : request;
        payload.setCustomerId(customerId);
        payload.setCustomerName(customer.getCustomerName());
        if (!StringUtils.hasText(payload.getInvoiceDirection())) {
            payload.setInvoiceDirection("OUTPUT");
        }
        if (!StringUtils.hasText(payload.getBuyerName())) {
            payload.setBuyerName(customer.getCustomerName());
        }
        if (payload.getGrossAmount() == null) {
            payload.setGrossAmount(BigDecimal.ZERO);
        }
        if (payload.getTaxAmount() == null) {
            payload.setTaxAmount(BigDecimal.ZERO);
        }
        R<Void> response = remoteOaService.createInvoice("true", CrmConstants.SERVICE_NAME, payload);
        if (response == null || !response.isSuccess()) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "生成发票草稿失败");
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean bindInvoice(Long customerId, Long invoiceId, RemoteOaService.InvoiceBindRequest request) {
        CrmCustomer customer = requireCustomer(customerId);
        RemoteOaService.InvoiceBindRequest payload = request == null ? new RemoteOaService.InvoiceBindRequest() : request;
        payload.setCustomerId(customerId);
        payload.setCustomerName(customer.getCustomerName());
        R<Void> response = remoteOaService.bindInvoice(invoiceId, payload);
        if (response == null || !response.isSuccess()) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "绑定发票失败");
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean voidInvoice(Long customerId, Long invoiceId, String remark) {
        requireCustomer(customerId);
        RemoteOaService.InvoiceVoidRequest request = new RemoteOaService.InvoiceVoidRequest();
        request.setRemark(remark);
        R<Void> response = remoteOaService.voidInvoice(invoiceId, request);
        if (response == null || !response.isSuccess()) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "作废发票失败");
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmReceivable(Long customerId, Long receivableId) {
        CrmCustomer customer = requireCustomer(customerId);
        CrmReceivable receivable = receivableMapper.selectById(receivableId);
        if (receivable == null || !CrmConstants.DelFlag.NORMAL.equals(receivable.getDelFlag())) {
            throw new IllegalArgumentException("回款计划不存在");
        }
        if (!Objects.equals(receivable.getCustomerId(), customerId)) {
            throw new IllegalArgumentException("回款计划不属于当前客户");
        }
        receivable.setReceivedAmount(receivable.getPlannedAmount());
        receivable.setOutstandingAmount(BigDecimal.ZERO);
        receivable.setReceivedDate(receivable.getReceivedDate() == null ? LocalDate.now() : receivable.getReceivedDate());
        receivable.setStatus(CrmConstants.ReceivableStatus.RECEIVED);
        receivable.setUpdateTime(LocalDateTime.now());
        boolean updated = receivableMapper.updateById(receivable) > 0;
        if (updated) {
            customerService.refreshHealth(customer.getCustomerId());
            publishReceivableConfirmed(customer, receivable);
        }
        return updated;
    }

    private void publishReceivableConfirmed(CrmCustomer customer, CrmReceivable receivable) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("receivableId", receivable.getReceivableId());
        fields.put("receivableNo", receivable.getReceivableNo());
        fields.put("receivableName", receivable.getReceivableName());
        fields.put("customerId", receivable.getCustomerId());
        fields.put("customerName", customer.getCustomerName());
        fields.put("contractId", receivable.getContractId());
        fields.put("contractNo", receivable.getContractNo());
        fields.put("invoiceId", receivable.getInvoiceId());
        fields.put("plannedAmount", receivable.getPlannedAmount());
        fields.put("receivedAmount", receivable.getReceivedAmount());
        fields.put("receivedDate", receivable.getReceivedDate());
        crmEventPublisher.publish(CrmEventStreamConstants.EVENT_RECEIVABLE_CONFIRMED,
                customer.getTenantId(), fields);
    }

    private CrmCustomer requireCustomer(Long customerId) {
        if (customerId == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        CrmCustomer customer = customerMapper.selectById(customerId);
        if (customer == null || !CrmConstants.DelFlag.NORMAL.equals(customer.getDelFlag())) {
            throw new IllegalArgumentException("客户不存在");
        }
        return customer;
    }
}
