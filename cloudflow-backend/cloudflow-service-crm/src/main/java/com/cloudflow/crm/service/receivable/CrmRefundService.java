package com.cloudflow.crm.service.receivable;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.vo.CrmRefundSourcesVO;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmDealEventMapper;
import com.cloudflow.crm.mapper.CrmReceiptMapper;
import com.cloudflow.crm.service.deal.CrmDealLedgerService;
import com.cloudflow.crm.service.deal.CrmDealPolicy;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmRefundService {
    private final CrmReceivableAccessService access;
    private final CrmReceiptMapper receipts;
    private final CrmDealEventMapper events;
    private final CrmDealLedgerService ledger;
    private final ObjectMapper json;
    private final CrmRefundWorkflowService workflow;

    @Transactional(readOnly = true)
    public CrmRefundSourcesVO sources(Long id, PageQuery page) {
        return sources(id, page, null);
    }

    @Transactional(readOnly = true)
    public CrmRefundSourcesVO sources(Long id, PageQuery page, Long receiptEventId) {
        if (page == null || page.getPageNum() == null || page.getPageNum() < 1) throw invalid("收款记录页码无效");
        if (receiptEventId != null && receiptEventId <= 0) throw invalid("原收款记录ID无效");
        CrmReceivable record = access.read(id);
        String currency = CrmDealPolicy.currency(record.getContractId() == null ? "CNY" : receipts.readCurrency(record.getContractId(), record.getTenantId()));
        BigDecimal received = CrmReceivableAmounts.received(record);
        BigDecimal untracked = received.subtract(receipts.netReceived(id, record.getTenantId(), currency));
        if (untracked.signum() < 0) throw invalid("到账明细与累计不一致，请先核对原记录");
        CrmRefundWorkflowService.Availability availability = workflow.availability(record);
        return new CrmRefundSourcesVO(id, record.getVersion(), currency, received, untracked,
                receipts.pendingRefund(id, record.getTenantId()), availability.configured(), availability.message(),
                availability.businessOwnerName(), availability.financeReviewerCount(),
                PageResult.build(receipts.refundSources(page.build(), id, record.getTenantId(), receiptEventId)));
    }

    public ObjectNode prepareWorkflow(CrmReceivable record) { return workflow.prepare(record); }

    public java.util.Map<String, Object> workflowVariables(CrmApproval approval) { return workflow.variables(approval); }

    public void verifyApproval(CrmApproval approval, com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO result, boolean approved) {
        workflow.verifyResult(approval, result, approved);
    }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public CrmDealEvent select(CrmReceivable record, Long receiptEventId, BigDecimal amount) {
        if (receiptEventId == null || receiptEventId <= 0) throw invalid("请选择原收款记录");
        String currency = CrmDealPolicy.currency(record.getContractId() == null ? "CNY" : receipts.lockCurrency(record.getContractId(), record.getTenantId()));
        CrmDealEvent source = events.lockById(receiptEventId);
        if (source == null || !Objects.equals(source.getTenantId(), record.getTenantId())
                || !Objects.equals(source.getBizId(), record.getReceivableId()) || !Objects.equals(source.getCustomerId(), record.getCustomerId())
                || !"RECEIVABLE".equals(source.getBizType()) || !"RECEIPT".equals(source.getEventType())
                || source.getReversalOfId() != null || !Integer.valueOf(0).equals(source.getBaselineFlag()) || !Objects.equals(currency, source.getCurrency()))
            throw invalid("所选原收款记录不存在或不属于当前回款计划");
        BigDecimal remaining = CrmDealPolicy.money(source.getAmount());
        for (CrmDealEvent reversal : events.lockReversals(receiptEventId)) {
            if (!Objects.equals(reversal.getTenantId(), source.getTenantId()) || !Objects.equals(reversal.getBizId(), source.getBizId())
                    || !Objects.equals(reversal.getCurrency(), source.getCurrency()) || reversal.getAmount() == null || reversal.getAmount().signum() > 0)
                throw invalid("所选原收款记录的退款来源不一致");
            remaining = remaining.add(reversal.getAmount());
        }
        if (CrmReceivableAmounts.positive(amount, "退款金额").compareTo(remaining) > 0)
            throw invalid("退款金额超过所选原收款记录的剩余可退金额");
        return source;
    }

    @Audit(name = "按批准来源冲减原收款分配", highRisk = true)
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public CrmDealEvent applyRefund(CrmReceivable record, CrmApproval approval, BigDecimal amount) {
        ObjectNode evidence;
        try {
            JsonNode payload = json.readTree(approval.getPayloadJson());
            if (payload == null || !payload.isObject()) throw invalid("退款审批来源缺失");
            evidence = (ObjectNode) payload;
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw invalid("退款审批来源无法解析"); }
        if (!evidence.path("receiptEventId").canConvertToLong() || !evidence.path("originalVersion").canConvertToInt())
            throw invalid("退款审批缺少财务选定的原收款记录");
        CrmDealEvent source = select(record, evidence.path("receiptEventId").longValue(), amount);
        if (!Objects.equals(source.getEventKey(), evidence.path("receiptEventKey").asText())
                || !Objects.equals(source.getCurrency(), evidence.path("currency").asText())
                || source.getAmount().compareTo(evidence.path("originalReceiptAmount").decimalValue()) != 0
                || evidence.path("refundAmount").decimalValue().compareTo(amount) != 0)
            throw invalid("退款审批与所选原收款记录不一致");
        evidence.put("approvalId", approval.getApprovalId());
        evidence.put("instanceId", approval.getInstanceId());
        String reason = approval.getRemark() == null || approval.getRemark().isBlank() ? "批准退款" : approval.getRemark();
        return ledger.refund(new CrmDealLedgerService.Refund(source.getEventId(), "CRM_RECEIVABLE_REFUND:" + approval.getApprovalId(),
                amount, approval.getUpdateTime(), evidence.path("originalVersion").intValue(), reason, evidence));
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
