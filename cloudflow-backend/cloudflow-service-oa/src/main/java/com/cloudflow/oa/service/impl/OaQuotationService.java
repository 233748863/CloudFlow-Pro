package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.QuotationSaveDTO;
import com.cloudflow.oa.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class OaQuotationService {
    private final OaPurchaseRfqMapper rfqs;
    private final OaPurchaseRfqItemMapper rfqItems;
    private final OaPurchaseRfqSupplierMapper invitations;
    private final OaSupplierQuotationMapper quotations;
    private final OaSupplierQuotationItemMapper quotationItems;
    private final OaRfqAccessService access;
    private final OaQuotationFileService files;
    private final OaSupplierGovernanceService governance;
    private final OaRfqAuditService audit;

    public List<OaSupplierQuotation> list(Long rfqId) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectById(rfqId));
        boolean comparison = LocalDate.now().isAfter(rfq.getQuoteDeadline()) && access.canCompare(rfq);
        return quotations.selectList(query(rfqId).eq(!comparison, OaSupplierQuotation::getEntryBy, UserContext.getUserId()).orderByAsc(OaSupplierQuotation::getQuotationId));
    }

    public QuotationSaveDTO detail(Long id) {
        OaSupplierQuotation quotation = OaRecordSupport.active(quotations.selectById(id));
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectById(quotation.getRfqId())); access.assertQuote(rfq, quotation);
        QuotationSaveDTO result = new QuotationSaveDTO(); result.setQuotation(quotation); result.setItems(lines(id)); return result;
    }

    public ResponseEntity<byte[]> download(Long id) {
        return files.download(detail(id).getQuotation().getAttachmentUrl());
    }

    @Transactional(rollbackFor = Exception.class)
    public Long save(QuotationSaveDTO request) {
        OaSupplierQuotation proposed = OaRecordSupport.require(request.getQuotation(), "报价不能为空");
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(proposed.getRfqId(), OaRecordSupport.tenantId())); assertOpen(rfq);
        Long userId = OaRecordSupport.require(UserContext.getUserId(), "报价录入人未登录");
        OaSupplierQuotation previous = proposed.getQuotationId() == null ? null : OaRecordSupport.active(quotations.selectForUpdate(proposed.getQuotationId(), OaRecordSupport.tenantId()));
        OaRfqAuditService.Snapshot before = audit.quotation(rfq, previous, previous == null ? List.of() : lines(previous.getQuotationId()));
        if (previous == null) {
            if (quotations.selectCount(query(rfq.getRfqId()).eq(OaSupplierQuotation::getSupplierId, proposed.getSupplierId())) > 0) throw new IllegalArgumentException("该供应商本轮已有报价，请由原录入人编辑原单据");
            OaRecordSupport.create(proposed, "quotationId"); proposed.setQuotationNo("BJ" + UUID.randomUUID().toString().replace("-", ""));
            proposed.setEntryBy(userId); proposed.setEntryTime(LocalDateTime.now());
        } else {
            assertEditor(rfq, previous); OaRecordSupport.same(previous.getSupplierId(), proposed.getSupplierId(), "报价供应商不能更换");
            OaRecordSupport.update(proposed, previous); proposed.setQuotationNo(previous.getQuotationNo()); proposed.setEntryBy(previous.getEntryBy()); proposed.setEntryTime(previous.getEntryTime());
        }
        OaPurchaseRfqSupplier invitation = invitation(rfq.getRfqId(), proposed.getSupplierId());
        if (!OaRfqInvitationService.reached(invitation)) throw new IllegalArgumentException("邮件尚未被接纳，不能作为已邀请供应商登记报价");
        if (Set.of("DECLINED", "NO_RESPONSE").contains(invitation.getQuoteStatus())) throw new IllegalArgumentException("当前供应商邀请已结束，请发起新询价轮次");
        governance.assertSupplierAllowed(proposed.getSupplierId(), "RFQ"); proposed.setSupplierName(invitation.getSupplierName());
        proposed.setRfqId(rfq.getRfqId()); proposed.setStatus("DRAFT");
        proposed.setQuoteDate(proposed.getQuoteDate() == null ? LocalDate.now() : proposed.getQuoteDate());
        if (proposed.getQuoteDate().isAfter(LocalDate.now())) throw new IllegalArgumentException("报价日期不能晚于今天");
        if (proposed.getValidUntil() != null && proposed.getValidUntil().isBefore(LocalDate.now())) throw new IllegalArgumentException("报价有效期已过");
        String currency = proposed.getCurrency() == null ? "CNY" : proposed.getCurrency().trim().toUpperCase(Locale.ROOT);
        try { Currency.getInstance(currency); } catch (IllegalArgumentException exception) { throw new IllegalArgumentException("报价币种无效"); }
        proposed.setCurrency(currency); nonnegative(proposed.getDeliveryDays(), "交付天数"); nonnegative(proposed.getWarrantyMonths(), "质保月数");
        proposed.setPaymentTerms(optional(proposed.getPaymentTerms(), 50, "付款条件")); proposed.setRemark(optional(proposed.getRemark(), 500, "报价备注"));
        if (proposed.getAttachmentUrl() != null && !proposed.getAttachmentUrl().isBlank()) files.assertOwned(proposed.getAttachmentUrl(), userId); else proposed.setAttachmentUrl(null);
        List<OaSupplierQuotationItem> inputs = OaRecordSupport.require(request.getItems(), "报价明细不能为空");
        List<OaPurchaseRfqItem> requirements = requirements(rfq.getRfqId());
        if (inputs.isEmpty() || inputs.size() > requirements.size()) throw new IllegalArgumentException("报价明细数量无效");
        Set<Long> retained = new HashSet<>(); BigDecimal total = BigDecimal.ZERO, tax = BigDecimal.ZERO;
        for (OaSupplierQuotationItem line : inputs) {
            OaRecordSupport.require(line, "报价明细不能为空");
            if (!retained.add(line.getRfqItemId())) throw new IllegalArgumentException("同一询价物料不能重复报价");
            OaPurchaseRfqItem requirement = requirements.stream().filter(item -> item.getItemId().equals(line.getRfqItemId())).findFirst().orElseThrow(() -> new IllegalArgumentException("报价物料不属于当前询价"));
            OaRecordSupport.same(requirement.getQuantity(), line.getQuantity(), "报价数量必须与询价物料一致");
            line.setItemName(requirement.getItemName()); line.setSpec(requirement.getSpec()); line.setUnit(requirement.getUnit()); line.setSortNo(requirement.getSortNo());
            line.setBrand(optional(line.getBrand(), 100, "品牌")); line.setModel(optional(line.getModel(), 100, "型号")); line.setRemark(optional(line.getRemark(), 500, "明细备注")); nonnegative(line.getDeliveryDays(), "明细交付天数");
            OaRfqQuoteCalculator.Amounts amount = OaRfqQuoteCalculator.calculate(line); total = total.add(amount.gross()); tax = tax.add(amount.tax());
        }
        proposed.setTotalAmount(OaRfqQuoteCalculator.money(total)); proposed.setTaxAmount(OaRfqQuoteCalculator.money(tax));
        if (previous == null) OaRecordSupport.saved(quotations.insert(proposed)); else OaRecordSupport.saved(quotations.updateById(proposed));
        List<OaSupplierQuotationItem> existing = quotationItems.selectAllForQuotation(proposed.getQuotationId(), OaRecordSupport.tenantId());
        for (OaSupplierQuotationItem line : inputs) {
            OaSupplierQuotationItem old = existing.stream().filter(item -> item.getRfqItemId().equals(line.getRfqItemId())).findFirst().orElse(null);
            if (line.getItemId() != null && (old == null || !line.getItemId().equals(old.getItemId()))) throw new IllegalArgumentException("报价明细标识与来源不一致");
            if (old == null) { OaRecordSupport.create(line, "itemId"); line.setQuotationId(proposed.getQuotationId()); OaRecordSupport.saved(quotationItems.insert(line)); }
            else {
                line.setItemId(old.getItemId()); line.setTenantId(old.getTenantId()); line.setQuotationId(proposed.getQuotationId()); line.setDeleted(0);
                line.setCreateBy(old.getCreateBy()); line.setCreateTime(old.getCreateTime()); OaRecordSupport.touch(line);
                OaRecordSupport.saved(Integer.valueOf(1).equals(old.getDeleted()) ? quotationItems.restoreItem(line) : quotationItems.updateById(line));
            }
        }
        for (OaSupplierQuotationItem old : existing) if (!retained.contains(old.getRfqItemId()) && Integer.valueOf(0).equals(old.getDeleted())) {
            OaRecordSupport.touch(old);
            OaRecordSupport.saved(quotationItems.update(null, new LambdaUpdateWrapper<OaSupplierQuotationItem>()
                    .eq(OaSupplierQuotationItem::getItemId, old.getItemId()).eq(OaSupplierQuotationItem::getTenantId, OaRecordSupport.tenantId())
                    .eq(OaSupplierQuotationItem::getQuotationId, proposed.getQuotationId()).eq(OaSupplierQuotationItem::getDeleted, 0)
                    .set(OaSupplierQuotationItem::getDeleted, 1).set(OaSupplierQuotationItem::getUpdateBy, old.getUpdateBy())
                    .set(OaSupplierQuotationItem::getUpdateTime, old.getUpdateTime())));
        }
        audit.record(OaRfqAuditService.Action.QUOTATION_SAVED, before,
                audit.quotation(rfq, quotations.selectById(proposed.getQuotationId()), lines(proposed.getQuotationId())),
                Map.of("quotationId", proposed.getQuotationId()), null);
        return proposed.getQuotationId();
    }

    @Transactional(rollbackFor = Exception.class)
    public void submit(Long id) {
        OaSupplierQuotation reference = OaRecordSupport.active(quotations.selectById(id));
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(reference.getRfqId(), OaRecordSupport.tenantId())); assertOpen(rfq);
        OaSupplierQuotation quotation = OaRecordSupport.active(quotations.selectForUpdate(id, OaRecordSupport.tenantId()));
        if ("SUBMITTED".equals(quotation.getStatus())) { assertEntry(quotation); return; }
        assertEditor(rfq, quotation); governance.assertSupplierAllowed(quotation.getSupplierId(), "RFQ");
        if (quotation.getValidUntil() != null && quotation.getValidUntil().isBefore(LocalDate.now())) throw new IllegalArgumentException("报价已过有效期");
        files.assertOwned(quotation.getAttachmentUrl(), quotation.getEntryBy());
        List<OaSupplierQuotationItem> lines = lines(id); List<OaPurchaseRfqItem> required = requirements(rfq.getRfqId());
        Set<Long> quotedIds = new HashSet<>(); lines.forEach(line -> quotedIds.add(line.getRfqItemId()));
        if (lines.size() != required.size() || required.stream().anyMatch(item -> !quotedIds.contains(item.getItemId()))) throw new IllegalArgumentException("提交报价须覆盖全部询价物料");
        OaRfqAuditService.Snapshot before = audit.quotation(rfq, quotation, lines);
        quotation.setStatus("SUBMITTED"); OaRecordSupport.touch(quotation); OaRecordSupport.saved(quotations.updateById(quotation));
        OaPurchaseRfqSupplier invitation = invitation(rfq.getRfqId(), quotation.getSupplierId());
        if (!"INVITED".equals(invitation.getQuoteStatus())) throw new IllegalArgumentException("供应商邀请状态已改变");
        invitation.setQuoteStatus("RESPONDED"); invitation.setRespondTime(LocalDateTime.now()); OaRecordSupport.touch(invitation); OaRecordSupport.saved(invitations.updateById(invitation));
        refreshResponseCount(rfq);
        audit.record(OaRfqAuditService.Action.QUOTATION_SUBMITTED, before, audit.quotation(rfq, quotation, lines),
                Map.of("quotationId", id), null);
    }

    @Transactional(rollbackFor = Exception.class)
    public void withdraw(Long id) {
        OaSupplierQuotation reference = OaRecordSupport.active(quotations.selectById(id));
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(reference.getRfqId(), OaRecordSupport.tenantId())); assertOpen(rfq);
        OaSupplierQuotation quotation = OaRecordSupport.active(quotations.selectForUpdate(id, OaRecordSupport.tenantId())); assertEntry(quotation);
        if ("WITHDRAWN".equals(quotation.getStatus())) return;
        if (!"SUBMITTED".equals(quotation.getStatus())) throw new IllegalArgumentException("仅已提交报价可以撤回");
        OaRfqAuditService.Snapshot before = audit.quotation(rfq, quotation, lines(id));
        quotation.setStatus("WITHDRAWN"); OaRecordSupport.touch(quotation); OaRecordSupport.saved(quotations.updateById(quotation));
        OaPurchaseRfqSupplier invitation = invitation(rfq.getRfqId(), quotation.getSupplierId()); invitation.setQuoteStatus("INVITED"); invitation.setRespondTime(null);
        OaRecordSupport.touch(invitation); OaRecordSupport.saved(invitations.updateById(invitation)); refreshResponseCount(rfq);
        audit.record(OaRfqAuditService.Action.QUOTATION_WITHDRAWN, before, audit.quotation(rfq, quotation, lines(id)),
                Map.of("quotationId", id), null);
    }

    List<OaSupplierQuotation> submitted(Long rfqId) { return quotations.selectList(query(rfqId).eq(OaSupplierQuotation::getStatus, "SUBMITTED").orderByAsc(OaSupplierQuotation::getQuotationId)); }

    List<OaSupplierQuotationItem> lines(Long quotationId) {
        return quotationItems.selectList(new LambdaQueryWrapper<OaSupplierQuotationItem>().eq(OaSupplierQuotationItem::getTenantId, OaRecordSupport.tenantId()).eq(OaSupplierQuotationItem::getQuotationId, quotationId)
                .eq(OaSupplierQuotationItem::getDeleted, 0).orderByAsc(OaSupplierQuotationItem::getSortNo, OaSupplierQuotationItem::getItemId));
    }

    List<OaPurchaseRfqItem> requirements(Long rfqId) {
        return rfqItems.selectList(new LambdaQueryWrapper<OaPurchaseRfqItem>().eq(OaPurchaseRfqItem::getTenantId, OaRecordSupport.tenantId()).eq(OaPurchaseRfqItem::getRfqId, rfqId)
                .eq(OaPurchaseRfqItem::getDeleted, 0).orderByAsc(OaPurchaseRfqItem::getSortNo, OaPurchaseRfqItem::getItemId));
    }

    private LambdaQueryWrapper<OaSupplierQuotation> query(Long rfqId) {
        return new LambdaQueryWrapper<OaSupplierQuotation>().eq(OaSupplierQuotation::getTenantId, OaRecordSupport.tenantId()).eq(OaSupplierQuotation::getRfqId, rfqId).eq(OaSupplierQuotation::getDeleted, 0);
    }

    private OaPurchaseRfqSupplier invitation(Long rfqId, Long supplierId) {
        return OaRecordSupport.active(invitations.selectOne(new LambdaQueryWrapper<OaPurchaseRfqSupplier>().eq(OaPurchaseRfqSupplier::getTenantId, OaRecordSupport.tenantId()).eq(OaPurchaseRfqSupplier::getRfqId, rfqId).eq(OaPurchaseRfqSupplier::getSupplierId, supplierId)));
    }

    private void assertOpen(OaPurchaseRfq rfq) {
        if (!Set.of("SENT", "QUOTING").contains(rfq.getStatus()) || rfq.getQuoteDeadline().isBefore(LocalDate.now()) || rfq.getInstanceId() != null) throw new IllegalArgumentException("仅截止日期内的报价中询价可以录入或撤回报价");
    }

    private void assertEditor(OaPurchaseRfq rfq, OaSupplierQuotation quotation) {
        OaRecordSupport.same(rfq.getRfqId(), quotation.getRfqId(), "报价不属于当前询价"); assertEntry(quotation);
        if (!Set.of("DRAFT", "WITHDRAWN").contains(quotation.getStatus())) throw new IllegalArgumentException("请先撤回已提交报价再编辑");
    }

    private void assertEntry(OaSupplierQuotation quotation) { OaRecordSupport.same(UserContext.getUserId(), quotation.getEntryBy(), "仅原录入人可以修改报价"); }

    private void refreshResponseCount(OaPurchaseRfq rfq) {
        rfq.setRespondedCount(Math.toIntExact(quotations.selectCount(query(rfq.getRfqId()).eq(OaSupplierQuotation::getStatus, "SUBMITTED"))));
        rfq.setStatus("QUOTING"); OaRecordSupport.touch(rfq); OaRecordSupport.saved(rfqs.updateById(rfq));
    }

    private static void nonnegative(Integer value, String label) { if (value != null && value < 0) throw new IllegalArgumentException(label + "不能为负数"); }
    private static String optional(String value, int length, String label) { return value == null || value.isBlank() ? null : OaRecordSupport.text(value, length, label); }
}
