package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaPurchaseRfq;
import com.cloudflow.oa.domain.OaSupplierQuotation;
import com.cloudflow.oa.domain.OaSupplierQuotationItem;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class OaRfqAuditService {
    private final SysAuditLogMapper mapper;
    private final ObjectMapper json;

    public enum Action {
        RFQ_SAVED("保存采购询价"),
        SUPPLIERS_INVITED("登记供应商询价邀请"),
        QUOTATION_SAVED("录入供应商报价"),
        QUOTATION_SUBMITTED("提交供应商报价"),
        QUOTATION_WITHDRAWN("撤回供应商报价"),
        AWARD_REQUESTED("提交采购定标审批"),
        RFQ_AWARDED("采购询价定标完成"),
        AWARD_REJECTED("采购定标审批未生效"),
        PURCHASE_CREATED("中标结果生成采购申请"),
        RFQ_TERMINATED("取消或流标采购询价");

        private final String title;

        Action(String title) {
            this.title = title;
        }
    }

    public record Snapshot(Long tenantId, Long rfqId, String rfqNo, JsonNode values) { }

    private record QuoteState(OaPurchaseRfq rfq, OaSupplierQuotation quotation, List<OaSupplierQuotationItem> items) { }

    private record Approval(String instanceId, String result, Long approverId, String approverName, Long approvalTime) { }

    private record Entry(String action, String businessType, Long businessId, String businessNo,
                         Long operatorId, String operatorName, Long executorId, Approval approval,
                         JsonNode state, Map<String, ?> details) { }

    public Snapshot absent() {
        return new Snapshot(OaRecordSupport.tenantId(), null, null, json.getNodeFactory().nullNode());
    }

    public Snapshot snapshot(OaPurchaseRfq rfq, Object values) {
        OaRecordSupport.same(OaRecordSupport.tenantId(), rfq.getTenantId(), "询价审计归属不一致");
        return new Snapshot(rfq.getTenantId(), rfq.getRfqId(), rfq.getRfqNo(), json.valueToTree(values));
    }

    public Snapshot quotation(OaPurchaseRfq rfq, OaSupplierQuotation quotation, List<OaSupplierQuotationItem> items) {
        return snapshot(rfq, new QuoteState(rfq, quotation, items));
    }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void record(Action action, Snapshot before, Snapshot after, Map<String, ?> details, ApprovalResultDTO decision) {
        Long tenantId = OaRecordSupport.tenantId();
        OaRecordSupport.same(tenantId, before.tenantId(), "询价审计归属不一致");
        OaRecordSupport.same(tenantId, after.tenantId(), "询价审计归属不一致");
        if (before.rfqId() != null) OaRecordSupport.same(before.rfqId(), after.rfqId(), "询价审计编号不一致");
        if (before.rfqNo() != null) OaRecordSupport.same(before.rfqNo(), after.rfqNo(), "询价审计单号不一致");
        if (decision != null) {
            OaRecordSupport.same(tenantId, decision.getTenantId(), "定标审批审计归属不一致");
            if (!Objects.equals(String.valueOf(after.rfqId()), String.valueOf(decision.getBusinessId()))) {
                throw new IllegalArgumentException("定标审批审计编号不一致");
            }
        }
        boolean hasApprover = decision != null && decision.getApproverId() != null;
        Long operatorId = hasApprover ? decision.getApproverId() : UserContext.getUserId();
        if (decision == null && (operatorId == null || operatorId <= 0)) throw new IllegalArgumentException("询价审计需要实际操作者");
        String operatorName = hasApprover ? decision.getApproverName() : OaRecordSupport.userName();
        if (operatorName == null || operatorName.isBlank()) operatorName = operatorId == null ? "system" : operatorId.toString();
        Approval approval = decision == null ? null : new Approval(decision.getProcessInstanceId(), decision.getApprovalResult(),
                decision.getApproverId(), decision.getApproverName(), decision.getApprovalTime());
        SysAuditLogEntity audit = new SysAuditLogEntity();
        audit.setTenantId(tenantId);
        audit.setBizModule("oa");
        audit.setAuditName(action.title);
        audit.setAuditField(action.name());
        audit.setHighRisk(1);
        audit.setRiskLevel("HIGH");
        audit.setCreateBy(operatorName.length() <= 64 ? operatorName : String.valueOf(operatorId));
        audit.setCreateTime(LocalDateTime.now());
        try {
            audit.setBeforeJson(json.writeValueAsString(new Entry(action.name(), "OA_RFQ", after.rfqId(), after.rfqNo(),
                    operatorId, operatorName, UserContext.getUserId(), approval, before.values(), details)));
            audit.setAfterJson(json.writeValueAsString(new Entry(action.name(), "OA_RFQ", after.rfqId(), after.rfqNo(),
                    operatorId, operatorName, UserContext.getUserId(), approval, after.values(), details)));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("询价审计快照保存失败", exception);
        }
        OaRecordSupport.saved(mapper.insert(audit));
    }
}
