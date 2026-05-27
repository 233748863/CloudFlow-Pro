package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;

/** 退款审批回调：审批通过后从已到账金额扣减退款。 */
@Slf4j
@Component
public class CrmRefundApprovalHandler extends AbstractCrmApprovalHandler implements ApprovalResultHandler {

    private final CrmReceivableMapper receivableMapper;
    private final ICrmCustomerService crmCustomerService;

    public CrmRefundApprovalHandler(CrmApprovalMapper approvalMapper,
                                    ObjectMapper objectMapper,
                                    CrmReceivableMapper receivableMapper,
                                    ICrmCustomerService crmCustomerService) {
        super(approvalMapper, objectMapper);
        this.receivableMapper = receivableMapper;
        this.crmCustomerService = crmCustomerService;
    }

    @Override
    public String getSupportedBusinessType() {
        return CrmBusinessTypes.CRM_REFUND;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApproved(ApprovalResultDTO dto) {
        CrmApproval approval = loadApproval(dto);
        updateApprovalStatus(approval, dto, true);
        Map<String, Object> payload = parsePayload(approval);
        Long receivableId = toLong(payload.get("receivableId"));
        BigDecimal refundAmount = toDecimal(payload.get("refundAmount"));
        if (receivableId == null || refundAmount == null || refundAmount.signum() <= 0) {
            return;
        }
        CrmReceivable receivable = receivableMapper.selectById(receivableId);
        if (receivable == null || !CrmConstants.DelFlag.NORMAL.equals(receivable.getDeleted())) {
            return;
        }
        BigDecimal received = receivable.getReceivedAmount() == null ? BigDecimal.ZERO : receivable.getReceivedAmount();
        BigDecimal planned = receivable.getPlannedAmount() == null ? BigDecimal.ZERO : receivable.getPlannedAmount();
        BigDecimal newReceived = received.subtract(refundAmount);
        if (newReceived.signum() < 0) {
            newReceived = BigDecimal.ZERO;
        }
        BigDecimal newOutstanding = planned.subtract(newReceived);
        if (newOutstanding.signum() < 0) {
            newOutstanding = BigDecimal.ZERO;
        }
        String newStatus = newOutstanding.signum() == 0 && newReceived.signum() > 0
                ? CrmConstants.ReceivableStatus.RECEIVED
                : (newReceived.signum() > 0
                ? CrmConstants.ReceivableStatus.PARTIAL_RECEIVED
                : CrmConstants.ReceivableStatus.PLANNED);
        String existingRemark = text(receivable.getRemark());
        String newRemark = "退款 " + refundAmount + "，审批 #" + approval.getApprovalNo()
                + (existingRemark.isEmpty() ? "" : "；原:" + existingRemark);
        LambdaUpdateWrapper<CrmReceivable> wrapper = new LambdaUpdateWrapper<CrmReceivable>()
                .eq(CrmReceivable::getReceivableId, receivableId)
                .set(CrmReceivable::getReceivedAmount, newReceived)
                .set(CrmReceivable::getOutstandingAmount, newOutstanding)
                .set(CrmReceivable::getStatus, newStatus)
                .set(CrmReceivable::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(CrmReceivable::getUpdateTime, LocalDateTime.now())
                .set(CrmReceivable::getRemark, newRemark);
        receivableMapper.update(null, wrapper);
        if (receivable.getCustomerId() != null) {
            crmCustomerService.refreshHealth(receivable.getCustomerId());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleRejected(ApprovalResultDTO dto) {
        updateApprovalStatus(loadApproval(dto), dto, false);
    }
}
