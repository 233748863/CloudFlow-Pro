package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.*;

@Service
@RequiredArgsConstructor
public class OaRfqPurchaseSourceService {
    private final OaPurchaseRfqMapper rfqs;
    private final OaPurchaseRfqItemMapper rfqItems;
    private final OaSupplierQuotationMapper quotations;
    private final OaSupplierQuotationItemMapper quotationItems;
    private final BizPurchaseRequestMapper purchases;
    private final BizPurchaseReceiptMapper receipts;

    public void lockForCreate(BizPurchaseRequest purchase) {
        OaRecordSupport.require(purchase, "采购申请不能为空");
        if (purchase.getId() != null) throw new IllegalArgumentException("新采购申请不能指定已有单据ID");
        if (purchase.getRfqId() != null) {
            OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(purchase.getRfqId(), OaRecordSupport.tenantId()));
            DataScopeUtils.assertOwnership(rfq, OaPurchaseRfq::getOwnerId, "询价单");
            if (rfq.getPurchaseRequestId() != null) throw new IllegalArgumentException("该询价已经关联采购申请，请更新原草稿");
        }
    }

    public BizPurchaseRequest lockForWrite(Long purchaseId, Long requestedRfqId) {
        BizPurchaseRequest reference = OaRecordSupport.active(purchases.selectById(purchaseId));
        List<OaPurchaseRfq> sources = activeSources(purchaseId);
        if (sources.size() > 1) throw new IllegalStateException("采购申请关联多张有效询价，请先核对原单据");
        Long rfqId = reference.getRfqId() != null ? reference.getRfqId() : sources.isEmpty() ? requestedRfqId : sources.get(0).getRfqId();
        if (rfqId != null) OaRecordSupport.active(rfqs.selectForUpdate(rfqId, OaRecordSupport.tenantId()));
        BizPurchaseRequest purchase = OaRecordSupport.active(purchases.selectForUpdate(purchaseId, OaRecordSupport.tenantId()));
        DataScopeUtils.assertOwnership(purchase, BizPurchaseRequest::getUserId, "采购申请");
        OaRecordSupport.same(reference.getRfqId(), purchase.getRfqId(), "采购来源已改变，请刷新重试");
        List<OaPurchaseRfq> latest = activeSources(purchaseId);
        if (latest.size() > 1 || !latest.isEmpty() && !Objects.equals(rfqId, latest.get(0).getRfqId())) throw new IllegalArgumentException("采购来源已改变，请刷新重试");
        if (purchase.getRfqId() != null) OaRecordSupport.same(purchase.getRfqId(), requestedRfqId, "询价来源不可移除或更换");
        if (requestedRfqId != null && !Objects.equals(rfqId, requestedRfqId)) throw new IllegalArgumentException("采购已关联另一张询价");
        return purchase;
    }

    public void assertWritable(BizPurchaseRequest purchase) {
        if (!"DRAFT".equals(purchase.getStatus()) || purchase.getPaymentRequestId() != null || purchase.getPaymentStatus() != null && !"NONE".equals(purchase.getPaymentStatus())
                || receipts.selectCount(new LambdaQueryWrapper<BizPurchaseReceipt>().eq(BizPurchaseReceipt::getTenantId, OaRecordSupport.tenantId()).eq(BizPurchaseReceipt::getPurchaseId, purchase.getId())) > 0) {
            throw new IllegalArgumentException("仅未收货、未付款的草稿采购可以编辑，审批中的申请须先撤回");
        }
    }

    public void validateAndFill(BizPurchaseRequest purchase) {
        if (purchase.getRfqId() == null) {
            if (purchase.getItems().stream().anyMatch(item -> item.getRfqItemId() != null)) throw new IllegalArgumentException("询价物料必须关联已定标询价单");
            if (purchase.getId() != null && !activeSources(purchase.getId()).isEmpty()) throw new IllegalArgumentException("该采购已发起询价，请先完成定标并转换采购");
            return;
        }
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectById(purchase.getRfqId()));
        DataScopeUtils.assertOwnership(rfq, OaPurchaseRfq::getOwnerId, "询价单");
        if (!"AWARDED".equals(rfq.getStatus())) throw new IllegalArgumentException("采购来源必须是已定标询价");
        if (rfq.getPurchaseRequestId() != null && !rfq.getPurchaseRequestId().equals(purchase.getId())) throw new IllegalArgumentException("询价已生成其他采购申请");
        OaRecordSupport.same(rfq.getAwardedSupplierId(), purchase.getSupplierId(), "采购供应商必须为中标供应商");
        OaSupplierQuotation quote = OaRecordSupport.active(quotations.selectById(rfq.getAwardedQuotationId()));
        OaRecordSupport.same(rfq.getRfqId(), quote.getRfqId(), "中标报价来源无效");
        if (!"SUBMITTED".equals(quote.getStatus()) || !"CNY".equals(quote.getCurrency())) throw new IllegalArgumentException("现有采购台账仅支持人民币已提交报价，不能直接合计其他币种");
        List<OaSupplierQuotationItem> awarded = awardedLines(quote.getQuotationId());
        if (purchase.getItems().size() != awarded.size() || awarded.isEmpty()) throw new IllegalArgumentException("采购物料须完整保留中标报价明细");
        Set<Long> seen = new HashSet<>(); BigDecimal total = BigDecimal.ZERO;
        for (BizPurchaseItem item : purchase.getItems()) {
            if (!seen.add(item.getRfqItemId())) throw new IllegalArgumentException("询价采购物料不能重复");
            OaSupplierQuotationItem line = awarded.stream().filter(candidate -> candidate.getRfqItemId().equals(item.getRfqItemId())).findFirst().orElseThrow(() -> new IllegalArgumentException("采购物料不属于中标报价"));
            OaPurchaseRfqItem requirement = OaRecordSupport.active(rfqItems.selectById(line.getRfqItemId()));
            OaRecordSupport.same(rfq.getRfqId(), requirement.getRfqId(), "询价物料来源无效");
            OaRecordSupport.same(OaRecordSupport.require(requirement.getConsumableId(), "请逐项关联采购耗材"), item.getConsumableId(), "采购耗材必须与询价关联一致");
            OaRecordSupport.same(line.getQuantity(), item.getQuantity(), "中标采购数量不能改变");
            if (requirement.getUnit() != null && !requirement.getUnit().isBlank()) OaRecordSupport.same(requirement.getUnit(), item.getUnit(), "耗材单位已改变，不能直接生成采购");
            OaRfqQuoteCalculator.Amounts amount = OaRfqQuoteCalculator.calculate(line);
            item.setUnitPrice(line.getUnitPrice()); item.setAmount(amount.gross()); item.setReceivedQuantity(0); total = total.add(amount.gross());
        }
        total = OaRfqQuoteCalculator.money(total);
        if (total.compareTo(rfq.getAwardedAmount()) != 0 || total.compareTo(quote.getTotalAmount()) != 0) throw new IllegalStateException("中标总额与成交明细不一致，已阻止采购保存");
        purchase.setTotalAmount(total); purchase.setProjectId(rfq.getProjectId()); purchase.setProjectName(rfq.getProjectName());
    }

    public void bind(BizPurchaseRequest purchase) {
        if (purchase.getRfqId() == null) return;
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectById(purchase.getRfqId()));
        if (rfq.getPurchaseRequestId() != null && !rfq.getPurchaseRequestId().equals(purchase.getId())) throw new IllegalArgumentException("询价已生成采购申请");
        if (Objects.equals(rfq.getPurchaseRequestId(), purchase.getId())) return;
        rfq.setPurchaseRequestId(purchase.getId()); OaRecordSupport.touch(rfq); OaRecordSupport.saved(rfqs.updateById(rfq));
    }

    public List<OaPurchaseRfq> activeSources(Long purchaseId) {
        return rfqs.selectList(new LambdaQueryWrapper<OaPurchaseRfq>().eq(OaPurchaseRfq::getTenantId, OaRecordSupport.tenantId()).eq(OaPurchaseRfq::getPurchaseRequestId, purchaseId)
                .eq(OaPurchaseRfq::getDeleted, 0).notIn(OaPurchaseRfq::getStatus, "FAILED", "CANCELLED"));
    }

    public List<OaSupplierQuotationItem> awardedLines(Long quotationId) {
        return quotationItems.selectList(new LambdaQueryWrapper<OaSupplierQuotationItem>().eq(OaSupplierQuotationItem::getTenantId, OaRecordSupport.tenantId()).eq(OaSupplierQuotationItem::getQuotationId, quotationId)
                .eq(OaSupplierQuotationItem::getDeleted, 0).orderByAsc(OaSupplierQuotationItem::getSortNo, OaSupplierQuotationItem::getItemId));
    }
}
