package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaPurchaseRfq;
import com.cloudflow.oa.domain.OaSupplierQuotation;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class OaRfqAccessService {
    private final SysConfigHelper config;
    private final OaIdentityReferenceMapper identities;
    private final OaApprovalOutboxService approvals;

    public void assertOwner(OaPurchaseRfq rfq) {
        OaRecordSupport.active(rfq); DataScopeUtils.assertOwnership(rfq, OaPurchaseRfq::getOwnerId, "询价单");
    }

    public Long approver() {
        Long userId = config.getConfigLong("sys.oa.rfq.approverUserId", 1L);
        return OaRecordSupport.require(identities.user(userId, OaRecordSupport.tenantId()), "定标审批人未正确配置").getId();
    }

    public boolean canCompare(OaPurchaseRfq rfq) {
        if (!StpUtil.hasPermission("oa:rfq:comparison")) return false;
        Long userId = UserContext.getUserId();
        if (Objects.equals(userId, rfq.getOwnerId())) return true;
        Long configured = config.getConfigLong("sys.oa.rfq.approverUserId", 1L);
        if (Objects.equals(userId, configured) && identities.user(configured, OaRecordSupport.tenantId()) != null) return true;
        if (rfq.getInstanceId() == null || rfq.getInstanceId().startsWith("F:")) return false;
        ApprovalResultDTO result = new ApprovalResultDTO(); result.setBusinessType("OA_RFQ_AWARD"); result.setBusinessId(rfq.getRfqId()); result.setTenantId(OaRecordSupport.tenantId()); result.setProcessInstanceId(rfq.getInstanceId());
        Object values = approvals.snapshot(result).getVariables().get("approverIds");
        return values instanceof List<?> ids && ids.stream().anyMatch(id -> Objects.equals(String.valueOf(id), String.valueOf(userId)));
    }

    public boolean canReadQuote(OaPurchaseRfq rfq, OaSupplierQuotation quotation) {
        return Objects.equals(UserContext.getUserId(), quotation.getEntryBy()) || LocalDate.now().isAfter(rfq.getQuoteDeadline()) && canCompare(rfq);
    }

    public void assertQuote(OaPurchaseRfq rfq, OaSupplierQuotation quotation) {
        OaRecordSupport.active(quotation); OaRecordSupport.same(rfq.getRfqId(), quotation.getRfqId(), "报价不属于当前询价");
        if (!canReadQuote(rfq, quotation)) throw new IllegalArgumentException("无权读取该供应商报价及附件");
    }

    public void assertComparison(OaPurchaseRfq rfq) {
        if (!LocalDate.now().isAfter(rfq.getQuoteDeadline())) throw new IllegalArgumentException("报价截止前不能查看各家比价");
        if (!canCompare(rfq)) throw new IllegalArgumentException("仅采购负责人或定标审批人可查看比价");
    }
}
