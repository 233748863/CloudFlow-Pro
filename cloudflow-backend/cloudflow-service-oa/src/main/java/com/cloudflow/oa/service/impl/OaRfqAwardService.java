package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.domain.dto.RfqAwardDTO;
import com.cloudflow.oa.mapper.*;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.IPurchaseRequestService;
import com.cloudflow.oa.service.OaApprovalParticipant;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class OaRfqAwardService implements OaApprovalParticipant {
    private final OaPurchaseRfqMapper rfqs;
    private final OaPurchaseRfqItemMapper rfqItems;
    private final OaSupplierQuotationMapper quotations;
    private final BizPurchaseRequestMapper purchases;
    private final OaQuotationService quotationService;
    private final OaRfqPurchaseSourceService source;
    private final IPurchaseRequestService purchaseService;
    private final OaRfqAccessService access;
    private final OaSupplierGovernanceService governance;
    private final OaBusinessRuleService rules;
    private final OaApprovalOutboxService approvals;
    private final IOaTraceEventService trace;
    private final SysConfigHelper config;
    private final OaRfqAuditService audit;

    @Transactional(rollbackFor = Exception.class)
    public String award(Long id, RfqAwardDTO request) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(id, OaRecordSupport.tenantId())); access.assertOwner(rfq); access.assertComparison(rfq);
        if (!Set.of("SENT", "QUOTING", "COMPARING").contains(rfq.getStatus()) || rfq.getInstanceId() != null) throw new IllegalArgumentException("询价已结束或正在定标审批");
        String reason = OaRecordSupport.text(request.getReason(), 500, "定标理由");
        OaSupplierQuotation winner = validWinner(rfq, request.getQuotationId());
        BigDecimal lowest = quotationService.submitted(id).stream().filter(quote -> winner.getCurrency().equals(quote.getCurrency()))
                .map(OaSupplierQuotation::getTotalAmount).min(BigDecimal::compareTo).orElseThrow();
        if (winner.getTotalAmount().compareTo(lowest) > 0) {
            if (reason.codePointCount(0, reason.length()) < 20) throw new IllegalArgumentException("非最低价定标需填写不少于20字的详细理由");
            rules.evaluateWarn("oa.rfq.non-lowest.award", "RFQ", id, BigDecimal.ONE, false, "本次选择并非同币种最低报价，已记录定标理由供合规复核");
        }
        BigDecimal threshold;
        try { threshold = OaRfqQuoteCalculator.money(new BigDecimal(config.getConfigValue("sys.oa.rfq.awardApprovalThreshold", "0"))); }
        catch (RuntimeException exception) { throw new IllegalStateException("定标审批金额阈值配置无效", exception); }
        OaRfqAuditService.Snapshot before = audit.snapshot(rfq, rfq);
        rfq.setStatus("COMPARING");
        if (!"CNY".equals(winner.getCurrency()) || winner.getTotalAmount().compareTo(threshold) > 0) {
            Map<String, Object> proposal = Map.of("quotationId", winner.getQuotationId(), "amount", winner.getTotalAmount().toPlainString(), "currency", winner.getCurrency(), "reason", reason,
                    "approverIds", List.of(access.approver().toString()), "title", rfq.getTitle());
            rfq.setInstanceId(approvals.queue(getSupportedBusinessType(), id, rfq.getRfqNo(), "oa_rfq_award", proposal));
            OaRecordSupport.touch(rfq); OaRecordSupport.saved(rfqs.updateById(rfq));
            audit.record(OaRfqAuditService.Action.AWARD_REQUESTED, before, audit.snapshot(rfq, rfq),
                    Map.of("quotationId", winner.getQuotationId(), "reason", reason), null);
            return "APPROVING";
        }
        applyAward(rfq, winner, reason, UserContext.getUserId());
        audit.record(OaRfqAuditService.Action.RFQ_AWARDED, before, audit.snapshot(rfq, rfq),
                Map.of("quotationId", winner.getQuotationId()), null);
        return "AWARDED";
    }

    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public BizPurchaseRequest createPurchase(Long id) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(id, OaRecordSupport.tenantId())); access.assertOwner(rfq);
        if (!"AWARDED".equals(rfq.getStatus())) throw new IllegalArgumentException("询价定标完成后才能生成采购申请");
        BizPurchaseRequest purchase = new BizPurchaseRequest();
        if (rfq.getPurchaseRequestId() != null) {
            BizPurchaseRequest original = OaRecordSupport.active(purchases.selectForUpdate(rfq.getPurchaseRequestId(), OaRecordSupport.tenantId()));
            DataScopeUtils.assertOwnership(original, BizPurchaseRequest::getUserId, "采购申请");
            if (Objects.equals(original.getRfqId(), id)) return purchaseService.getRequestWithItems(original.getId());
            source.assertWritable(original);
            if (original.getRfqId() != null) throw new IllegalArgumentException("采购申请已关联其他询价");
            BeanUtils.copyProperties(original, purchase);
        }
        OaRfqAuditService.Snapshot before = audit.snapshot(rfq, purchase.getId() == null ? Map.of("rfq", rfq)
                : Map.of("rfq", rfq, "purchase", purchaseService.getRequestWithItems(purchase.getId())));
        purchase.setRfqId(id); purchase.setSupplierId(rfq.getAwardedSupplierId()); purchase.setReason("询价定标采购：" + rfq.getTitle());
        purchase.setProjectId(rfq.getProjectId()); purchase.setProjectName(rfq.getProjectName());
        purchase.setExpectedDate(rfq.getExpectedDeliveryDate() == null ? null : rfq.getExpectedDeliveryDate().atStartOfDay());
        List<BizPurchaseItem> lines = new ArrayList<>();
        for (OaSupplierQuotationItem quoted : source.awardedLines(rfq.getAwardedQuotationId())) {
            OaPurchaseRfqItem item = OaRecordSupport.active(rfqItems.selectById(quoted.getRfqItemId()));
            BizPurchaseItem line = new BizPurchaseItem(); line.setConsumableId(OaRecordSupport.require(item.getConsumableId(), "物料“" + item.getItemName() + "”尚未关联耗材"));
            line.setRfqItemId(item.getItemId()); line.setQuantity(quoted.getQuantity()); line.setUnitPrice(quoted.getUnitPrice()); lines.add(line);
        }
        purchase.setItems(lines);
        boolean saved = purchase.getId() == null ? purchaseService.createPurchase(purchase) : purchaseService.updatePurchase(purchase);
        if (!saved) throw new IllegalStateException("采购申请保存失败，定标转换已回滚");
        BizPurchaseRequest persisted = purchaseService.getRequestWithItems(purchase.getId());
        OaPurchaseRfq linked = OaRecordSupport.active(rfqs.selectById(id));
        audit.record(OaRfqAuditService.Action.PURCHASE_CREATED, before,
                audit.snapshot(linked, Map.of("rfq", linked, "purchase", persisted)), Map.of("purchaseId", persisted.getId()), null);
        return persisted;
    }

    @Override
    public String getSupportedBusinessType() { return "OA_RFQ_AWARD"; }

    @Override
    public String currentInstance(Long id) { return OaRecordSupport.active(rfqs.selectById(id)).getInstanceId(); }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void bindInstance(OaApprovalRequest request, String instanceId) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(request.getBusinessId(), OaRecordSupport.tenantId()));
        if (!request.getReservation().equals(rfq.getInstanceId())) return;
        rfq.setInstanceId(instanceId); OaRecordSupport.touch(rfq); OaRecordSupport.saved(rfqs.updateById(rfq)); approvals.recordBinding(request, instanceId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApproved(ApprovalResultDTO result) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(result.getBusinessId(), OaRecordSupport.tenantId()));
        if (!OaApprovalOutboxService.matches(rfq.getInstanceId(), result) || !"COMPARING".equals(rfq.getStatus())) return;
        OaRfqAuditService.Snapshot before = audit.snapshot(rfq, rfq);
        OaApprovalRequest proposal = approvals.snapshot(result); Map<String, Object> values = proposal.getVariables();
        Long quotationId = new BigDecimal(String.valueOf(values.get("quotationId"))).longValueExact();
        OaSupplierQuotation winner;
        try { winner = validWinner(rfq, quotationId); }
        catch (RuntimeException exception) {
            boolean businessRejection = exception instanceof IllegalArgumentException
                    || exception instanceof ServiceException serviceException && Integer.valueOf(400).equals(serviceException.getCode());
            if (!businessRejection) throw exception;
            finishWithoutAward(rfq, "定标审批结束，当前条件未满足：" + exception.getMessage(), proposal.getStartUserId());
            audit.record(OaRfqAuditService.Action.AWARD_REJECTED, before, audit.snapshot(rfq, rfq),
                    Map.of("reason", exception.getMessage()), result);
            return;
        }
        if (winner.getTotalAmount().compareTo(new BigDecimal(String.valueOf(values.get("amount")))) != 0 || !Objects.equals(winner.getCurrency(), values.get("currency"))) throw new IllegalStateException("报价与原始审批提案不一致");
        applyAward(rfq, winner, OaRecordSupport.text(String.valueOf(values.get("reason")), 500, "定标理由"), proposal.getStartUserId());
        audit.record(OaRfqAuditService.Action.RFQ_AWARDED, before, audit.snapshot(rfq, rfq),
                Map.of("quotationId", winner.getQuotationId()), result);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleRejected(ApprovalResultDTO result) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(result.getBusinessId(), OaRecordSupport.tenantId()));
        if (!OaApprovalOutboxService.matches(rfq.getInstanceId(), result) || !"COMPARING".equals(rfq.getStatus())) return;
        OaRfqAuditService.Snapshot before = audit.snapshot(rfq, rfq);
        OaApprovalRequest proposal = approvals.snapshot(result); finishWithoutAward(rfq, result.getApprovalComment(), proposal.getStartUserId());
        audit.record(OaRfqAuditService.Action.AWARD_REJECTED, before, audit.snapshot(rfq, rfq),
                Map.of("reason", Objects.toString(result.getApprovalComment(), "")), result);
    }

    private OaSupplierQuotation validWinner(OaPurchaseRfq rfq, Long quotationId) {
        OaSupplierQuotation winner = OaRecordSupport.active(quotations.selectForUpdate(OaRecordSupport.require(quotationId, "请选择中标报价"), OaRecordSupport.tenantId()));
        OaRecordSupport.same(rfq.getRfqId(), winner.getRfqId(), "中标报价不属于当前询价");
        if (!"SUBMITTED".equals(winner.getStatus()) || winner.getValidUntil() != null && winner.getValidUntil().isBefore(LocalDate.now())) throw new IllegalArgumentException("中标报价须已提交且在有效期内");
        OaSupplierGovernanceService.SupplierAdmission admission = governance.evaluateSupplierAdmission(winner.getSupplierId(), "PURCHASE");
        if (!admission.allowed()) throw new ServiceException(admission.reason(), 400);
        return winner;
    }

    private void applyAward(OaPurchaseRfq rfq, OaSupplierQuotation winner, String reason, Long userId) {
        rfq.setStatus("AWARDED"); rfq.setAwardedSupplierId(winner.getSupplierId()); rfq.setAwardedSupplierName(winner.getSupplierName()); rfq.setAwardedQuotationId(winner.getQuotationId()); rfq.setAwardedAmount(winner.getTotalAmount());
        rfq.setAwardReason(reason); rfq.setAwardBy(userId); rfq.setAwardTime(LocalDateTime.now()); OaRecordSupport.touch(rfq); OaRecordSupport.saved(rfqs.updateById(rfq));
        trace.record(OaRecordSupport.tenantId(), "RFQ", rfq.getRfqId(), "QUOTATION", winner.getQuotationId(), "RFQ_AWARDED", "询价定标完成", reason, userId, OaRecordSupport.userName(), null);
    }

    private void finishWithoutAward(OaPurchaseRfq rfq, String reason, Long userId) {
        rfq.setInstanceId(null); rfq.setStatus("COMPARING"); OaRecordSupport.touch(rfq); OaRecordSupport.saved(rfqs.updateById(rfq));
        trace.record(OaRecordSupport.tenantId(), "RFQ", rfq.getRfqId(), null, null, "RFQ_AWARD_NOT_APPLIED", "询价定标未生效", reason, userId, OaRecordSupport.userName(), null);
    }
}
