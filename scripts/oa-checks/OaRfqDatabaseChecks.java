package com.cloudflow.oa.service.impl;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.*;
import com.cloudflow.oa.mapper.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

public final class OaRfqDatabaseChecks {
    static void run(OaOperationsDatabaseChecks fixture) throws Exception {
        identity(100000L, 1L); OaRfqService rfqs = fixture.bean(OaRfqService.class); OaQuotationService quotations = fixture.bean(OaQuotationService.class);
        OaRfqComparisonService comparisons = fixture.bean(OaRfqComparisonService.class); OaRfqAwardService awards = fixture.bean(OaRfqAwardService.class);
        SysSupplier first = OaAssetSupplierDatabaseChecks.supplier(fixture, "-rfq-first"), second = OaAssetSupplierDatabaseChecks.supplier(fixture, "-rfq-second");
        Long consumable = fixture.jdbc.queryForObject("SELECT MIN(consumable_id) FROM oa_consumable WHERE tenant_id=100000 AND deleted=0", Long.class);
        OaPurchaseRfq rfq = new OaPurchaseRfq(); rfq.setTitle(fixture.marker + "-RFQ"); rfq.setQuoteDeadline(LocalDate.now().plusDays(7)); rfq.setExpectedDeliveryDate(LocalDate.now().plusDays(30));
        OaPurchaseRfqItem item = new OaPurchaseRfqItem(); item.setItemName("办公物料"); item.setQuantity(5); item.setUnit(fixture.mapper(SysConsumableMapper.class).selectById(consumable).getUnit()); item.setExpectedPrice(number("100")); item.setConsumableId(consumable);
        RfqSaveDTO draft = new RfqSaveDTO(); draft.setRfq(rfq); draft.setItems(List.of(item)); Long id = rfqs.save(draft);
        Integer version = fixture.mapper(OaPurchaseRfqMapper.class).selectById(id).getVersion();
        fails(IllegalArgumentException.class, () -> rfqs.invite(id, new RfqInviteDTO(version, "OFFLINE", Arrays.asList(first.getSupplierId(), null))), "null supplier rejected before invitation persists");
        rfqs.invite(id, new RfqInviteDTO(version, "OFFLINE", List.of(first.getSupplierId(), second.getSupplierId())));
        equal(2L, fixture.count("SELECT COUNT(*) FROM oa_purchase_rfq_supplier WHERE rfq_id=? AND invite_channel='OFFLINE'", id), "offline invitation channel persisted");
        item = rfqs.items(id).get(0); Long firstQuote = quote(fixture, id, item, first, "100");
        Long otherUser = fixture.jdbc.queryForObject("SELECT MIN(user_id) FROM sys_user WHERE tenant_id=100000 AND user_id<>1 AND status='0' AND deleted=0", Long.class);
        identity(100000L, otherUser); Long secondQuote = quote(fixture, id, item, second, "90");
        equal(1, quotations.list(id).size(), "recorder sees only own quotation before deadline"); fails(IllegalArgumentException.class, () -> quotations.detail(firstQuote), "other recorder cannot read quotation");
        fails(IllegalArgumentException.class, () -> quotations.download(firstQuote), "other recorder cannot read private original");
        identity(100000L, 1L); equal(1, quotations.list(id).size(), "purchaser cannot bypass sealed quotation period"); fails(IllegalArgumentException.class, () -> comparisons.comparison(id), "comparison sealed before deadline");
        fixture.jdbc.update("UPDATE oa_purchase_rfq SET quote_deadline=? WHERE rfq_id=?", LocalDate.now().minusDays(1), id);
        equal(2, comparisons.comparison(id).suppliers().size(), "purchaser comparison opens after deadline");
        equal(true, !comparisons.export(id).isEmpty(), "comparison export shares authorization");
        RfqAwardDTO decision = new RfqAwardDTO(); decision.setQuotationId(secondQuote); decision.setReason("报价完整且含税总额最低"); equal("APPROVING", awards.award(id, decision), "award queues configured approval");
        String reservation = fixture.mapper(OaPurchaseRfqMapper.class).selectById(id).getInstanceId(); ApprovalResultDTO result = fixture.bind(awards, id, reservation);
        result.setVariables(Map.of("quotationId", firstQuote)); awards.handleApproved(result); awards.handleApproved(result);
        OaPurchaseRfq awarded = fixture.mapper(OaPurchaseRfqMapper.class).selectById(id); equal(second.getSupplierId(), awarded.getAwardedSupplierId(), "award callback uses immutable winning proposal");
        decimal("508.50", awarded.getAwardedAmount(), "award uses rounded tax-inclusive amount");
        fixture.jdbc.update("UPDATE oa_supplier_quotation SET currency='USD' WHERE quotation_id=?", secondQuote);
        fails(IllegalArgumentException.class, () -> awards.createPurchase(id), "foreign currency cannot enter currency-free purchase ledger");
        fixture.jdbc.update("UPDATE oa_supplier_quotation SET currency='CNY' WHERE quotation_id=?", secondQuote);
        BizPurchaseRequest purchase = awards.createPurchase(id); decimal("508.50", purchase.getTotalAmount(), "converted purchase retains winning gross amount");
        equal(purchase.getId(), awards.createPurchase(id).getId(), "purchase conversion idempotent");
        equal(1L, fixture.count("SELECT COUNT(*) FROM biz_purchase_request WHERE tenant_id=100000 AND rfq_id=? AND deleted=0", id), "only one purchase source record");
        identity(100000L, otherUser); fails(IllegalArgumentException.class, () -> comparisons.comparison(id), "unrelated recorder cannot compare after deadline");
        identity(100001L, 1L); fails(IllegalArgumentException.class, () -> quotations.detail(firstQuote), "quotation tenant isolation"); identity(100000L, 1L);
    }

    static Long quote(OaOperationsDatabaseChecks fixture, Long rfqId, OaPurchaseRfqItem requirement, SysSupplier supplier, String price) {
        OaSupplierQuotation quotation = new OaSupplierQuotation(); quotation.setRfqId(rfqId); quotation.setSupplierId(supplier.getSupplierId()); quotation.setQuoteDate(LocalDate.now()); quotation.setValidUntil(LocalDate.now().plusDays(30)); quotation.setCurrency("CNY");
        quotation.setAttachmentUrl(OaProjectContractDatabaseChecks.upload(fixture, OaPrivateFileStorageService.Kind.RFQ_QUOTATION));
        OaSupplierQuotationItem line = new OaSupplierQuotationItem(); line.setRfqItemId(requirement.getItemId()); line.setQuantity(requirement.getQuantity()); line.setUnitPrice(number(price)); line.setDiscountRate(BigDecimal.ONE); line.setTaxRate(number("0.13"));
        QuotationSaveDTO request = new QuotationSaveDTO(); request.setQuotation(quotation); request.setItems(List.of(line)); Long id = fixture.bean(OaQuotationService.class).save(request); fixture.bean(OaQuotationService.class).submit(id); return id;
    }
}
