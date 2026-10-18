package com.cloudflow.crm.service.impl;

import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmInvoiceReceiptMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.receivable.CrmReceivableAccessService;
import com.cloudflow.crm.service.receivable.CrmReceivableAmounts;
import com.cloudflow.crm.service.receivable.CrmRefundService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Objects;

/** 退款审批回调：审批通过后从已到账金额扣减退款。 */
@Slf4j
@Component
public class CrmRefundApprovalHandler extends AbstractCrmApprovalHandler implements ApprovalResultHandler {

    private final CrmReceivableMapper receivableMapper;
    private final ICrmCustomerService crmCustomerService;
    private final CrmReceivableAccessService receivableAccess;
    private final CrmAuditTrail auditTrail;
    private final CrmRefundService refunds;
    private final CrmInvoiceReceiptMapper invoices;

    public CrmRefundApprovalHandler(CrmApprovalMapper approvalMapper,
                                    ObjectMapper objectMapper,
                                    CrmReceivableMapper receivableMapper,
                                    ICrmCustomerService crmCustomerService,
                                    CrmReceivableAccessService receivableAccess,
                                    CrmAuditTrail auditTrail,
                                    CrmRefundService refunds,
                                    CrmInvoiceReceiptMapper invoices) {
        super(approvalMapper, objectMapper);
        this.receivableMapper = receivableMapper;
        this.crmCustomerService = crmCustomerService;
        this.receivableAccess = receivableAccess;
        this.auditTrail = auditTrail;
        this.refunds = refunds;
        this.invoices = invoices;
    }

    @Override
    public String getSupportedBusinessType() {
        return CrmBusinessTypes.CRM_REFUND;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApproved(ApprovalResultDTO dto) {
        CrmApproval approval = locked(dto);
        if (!"PENDING".equals(approval.getStatus()) || !updateApprovalStatus(approval, dto, true)) {
            return;
        }
        refunds.verifyApproval(approval, dto, true);
        Map<String, Object> payload = parsePayload(approval);
        Long receivableId = toLong(payload.get("receivableId"));
        BigDecimal refundAmount = CrmReceivableAmounts.positive(toDecimal(payload.get("refundAmount")), "退款金额");
        if (!Objects.equals(receivableId, approval.getBusinessRefId())) throw new IllegalArgumentException("退款审批对象不一致");
        CrmReceivable receivable = receivableAccess.lockInternal(receivableId);
        CrmReceivableAmounts.active(receivable);
        CrmReceivableAmounts.version(receivable, receivable.getVersion());
        if (!Objects.equals(receivable.getCustomerId(), toLong(payload.get("customerId")))
                || !Objects.equals(receivable.getContractId(), toLong(payload.get("contractId"))))
            throw new IllegalArgumentException("退款审批的客户或合同已改变");
        BigDecimal received = CrmReceivableAmounts.received(receivable);
        if (refundAmount.compareTo(received) > 0) throw new IllegalArgumentException("当前已到账金额不足，退款未执行");
        CrmDealEvent reversal = refunds.applyRefund(receivable, approval, refundAmount);
        CrmReceivableAmounts.apply(receivable, received.subtract(refundAmount), receivable.getReceivedDate());
        if (receivable.getInvoiceId() != null) {
            CrmInvoiceReceiptMapper.Invoice invoice = CrmRecordSupport.require(invoices.readInvoice(receivable.getInvoiceId(), receivable.getTenantId()), "退款计划的绑定发票无法核实");
            receivable.setInvoiceStatus("VOID".equals(invoice.getStatus()) ? "VOID" : receivable.getReceivedAmount().signum() == 0 ? "BOUND"
                    : receivable.getReceivedAmount().compareTo(invoice.getGrossAmount()) >= 0 ? "WRITEOFF_FULL" : "WRITEOFF_PARTIAL");
        }
        receivable.setUpdateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        receivable.setUpdateTime(LocalDateTime.now());
        CrmRecordSupport.saved(receivableMapper.writeSettlement(receivable, receivable.getVersion()));
        auditTrail.record("CRM_RECEIVABLE_REFUND", "CRM_RECEIVABLE:" + receivableId,
                "退款=" + refundAmount.toPlainString() + ",审批=" + approval.getApprovalId() + ",原收款=" + reversal.getReversalOfId()
                        + ",冲减事实=" + reversal.getEventId() + ",原版本=" + receivable.getVersion(), true);
        crmCustomerService.refreshHealth(receivable.getCustomerId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleRejected(ApprovalResultDTO dto) {
        CrmApproval approval = locked(dto);
        if ("PENDING".equals(approval.getStatus()) && updateApprovalStatus(approval, dto, false)) refunds.verifyApproval(approval, dto, false);
    }

    private CrmApproval locked(ApprovalResultDTO dto) {
        CrmRecordSupport.require(dto, "退款审批回调不能为空");
        CrmApproval approval = CrmRecordSupport.require(approvalMapper.lockById(dto.getBusinessId()), "退款审批不存在");
        if (!Objects.equals(CrmRecordSupport.tenantId(), approval.getTenantId()) || !getSupportedBusinessType().equals(approval.getBusinessType())
                || !"CRM_RECEIVABLE".equals(approval.getBusinessRefType())) throw new IllegalArgumentException("退款审批业务类型不匹配");
        return approval;
    }
}
