package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.domain.vo.OaTimesheetReversalTotals;
import com.cloudflow.oa.mapper.*;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

public final class OaAccessAndApprovalChecks {
    static void run() throws Exception { ratesAndHistoricalSnapshots(); quotationPrivacy(); purchaseAmounts(); approvalReplay(); OaApprovalIdentityChecks.run(); privateFiles(); }

    static OaPurchaseRfq rfq() {
        OaPurchaseRfq rfq = new OaPurchaseRfq(); rfq.setRfqId(7L); rfq.setTenantId(100000L); rfq.setDeleted(0); rfq.setVersion(0); rfq.setOwnerId(1L); rfq.setStatus("COMPARING"); rfq.setQuoteDeadline(LocalDate.now().minusDays(1)); return rfq;
    }
    static OaSupplierQuotation quote(Long entryBy) {
        OaSupplierQuotation quote = new OaSupplierQuotation(); quote.setQuotationId(20L); quote.setRfqId(7L); quote.setSupplierId(2L); quote.setSupplierName("fixture supplier"); quote.setTenantId(100000L); quote.setDeleted(0); quote.setVersion(0);
        quote.setStatus("SUBMITTED"); quote.setEntryBy(entryBy); quote.setTotalAmount(number("60.99")); quote.setCurrency("CNY"); quote.setAttachmentUrl("oa-file:RFQ_QUOTATION:1"); return quote;
    }
    static OaBusinessRuleService rules() { return new OaBusinessRuleService(null) { @Override public void evaluateWarn(String code, String type, Long id, BigDecimal actual, boolean below, String message) { } }; }
    static SysConfigHelper configuration() { return new SysConfigHelper() { @Override public String getConfigValue(String key, String fallback) { return fallback; } }; }

    static void ratesAndHistoricalSnapshots() {
        OaActivityType type = new OaActivityType(); type.setTypeId(1L); type.setTenantId(100000L); type.setDeleted(0); type.setStatus("ACTIVE"); type.setBillableDefaultFlag(1);
        OaIdentityReference employee = new OaIdentityReference(); employee.setId(9L); employee.setUserId(1L); employee.setJobLevelId(3L);
        List<OaActivityCost> rates = new ArrayList<>();
        for (int index = 0; index < 3; index++) {
            OaActivityCost rate = new OaActivityCost(); rate.setEmployeeId(index == 2 ? 9L : 0L); rate.setJobLevelId(index == 1 ? 3L : 0L); rate.setCostingRate(number(index == 2 ? "100" : index == 1 ? "80" : "60")); rate.setBillingRate(number("150"));
            rate.setStatus("ACTIVE"); rate.setEffectiveStart(LocalDate.now().minusDays(30)); rates.add(rate);
        }
        OaActivityCatalogService catalog = new OaActivityCatalogService(proxy(OaActivityTypeMapper.class, (name, args) -> type), proxy(OaActivityCostMapper.class, (name, args) -> rates), null, null);
        decimal("100", catalog.resolve(1L, employee, LocalDate.now(), true).getCostingRate(), "employee rate has priority");
        employee.setId(10L); decimal("80", catalog.resolve(1L, employee, LocalDate.now(), true).getCostingRate(), "job-level rate fallback");
        employee.setJobLevelId(4L); decimal("60", catalog.resolve(1L, employee, LocalDate.now(), true).getCostingRate(), "default rate fallback"); employee.setId(9L); employee.setJobLevelId(3L);
        fails(IllegalArgumentException.class, () -> catalog.resolve(1L, employee, LocalDate.now().minusDays(31), true), "missing historical rate rejected");
        OaProject project = new OaProject(); project.setProjectId(1L); project.setTenantId(100000L); project.setDeleted(0); project.setProjectName("fixture project"); project.setStatus("IN_PROGRESS");
        OaTimesheet sheet = new OaTimesheet(); sheet.setTimesheetId(45L); sheet.setTenantId(100000L); sheet.setDeleted(0); sheet.setEmployeeId(9L); sheet.setStartDate(LocalDate.now()); sheet.setEndDate(LocalDate.now());
        OaTimesheetDetail detail = new OaTimesheetDetail(); detail.setDetailId(99L); detail.setTenantId(100000L); detail.setDeleted(0); detail.setTimesheetId(45L); detail.setProjectId(1L); detail.setActivityTypeId(1L); detail.setWorkDate(LocalDate.now()); detail.setDescription("fixture effort"); detail.setHours(number("2.50"));
        OaTimesheetQueryMapper query = proxy(OaTimesheetQueryMapper.class, (name, args) -> switch (name) { case "availableProjects", "availableProjectsForPeriod" -> List.of(project); case "dailyHours" -> List.of(); case "reversalTotals" -> new OaTimesheetReversalTotals(); default -> null; });
        OaTimesheetCalculationService calculator = new OaTimesheetCalculationService(catalog, proxy(OaProjectMapper.class, (name, args) -> project), null,
                proxy(OaTimesheetMapper.class, (name, args) -> sheet), proxy(OaTimesheetDetailMapper.class, (name, args) -> detail), query, configuration(), rules());
        calculator.prepare(sheet, List.of(detail), employee, true); decimal("250", detail.getCostingAmount(), "independent costing snapshot"); decimal("375", detail.getBillingAmount(), "independent billing snapshot");
        rates.get(2).setCostingRate(number("200")); rates.get(2).setBillingRate(number("300")); decimal("100", detail.getCostingRate(), "rate change preserves historical snapshot");
        sheet.setStatus("APPROVED"); OaTimesheet correction = new OaTimesheet(); correction.setTimesheetId(46L); correction.setStartDate(LocalDate.now()); correction.setEndDate(LocalDate.now());
        OaTimesheetDetail reversal = new OaTimesheetDetail(); reversal.setReversalOfDetailId(99L); reversal.setProjectId(1L); reversal.setActivityTypeId(1L); reversal.setWorkDate(LocalDate.now()); reversal.setHours(number("-1")); reversal.setDescription("correct original effort");
        calculator.prepare(correction, List.of(reversal), employee, true); decimal("-100", reversal.getCostingAmount(), "reversal uses original costing rate"); decimal("-150", reversal.getBillingAmount(), "reversal uses original billing rate");
        reversal.setHours(number("-3")); fails(IllegalArgumentException.class, () -> calculator.prepare(correction, List.of(reversal), employee, true), "over reversal fails at service boundary");
    }

    static void quotationPrivacy() {
        OaPurchaseRfq rfq = rfq(); OaSupplierQuotation quote = quote(2L);
        OaRfqAccessService access = new OaRfqAccessService(null, null, null) { @Override public boolean canCompare(OaPurchaseRfq target) { return Objects.equals(UserContext.getUserId(), target.getOwnerId()) || Objects.equals(UserContext.getUserId(), 3L); } };
        OaSupplierQuotationMapper mapper = proxy(OaSupplierQuotationMapper.class, (name, args) -> {
            if (name.equals("selectList")) {
                LambdaQueryWrapper<?> filter = (LambdaQueryWrapper<?>) args[0];
                return filter.getSqlSegment().contains("entry_by") && !Objects.equals(UserContext.getUserId(), quote.getEntryBy()) ? List.of() : List.of(quote);
            }
            return quote;
        });
        AtomicInteger downloads = new AtomicInteger();
        OaQuotationFileService files = new OaQuotationFileService(null) { @Override public org.springframework.http.ResponseEntity<byte[]> download(String reference) { downloads.incrementAndGet(); return org.springframework.http.ResponseEntity.ok(new byte[0]); } };
        OaQuotationService service = new OaQuotationService(proxy(OaPurchaseRfqMapper.class, (name, args) -> rfq), null, null, mapper,
                proxy(OaSupplierQuotationItemMapper.class, (name, args) -> List.of()), access, files, null, null);
        rfq.setQuoteDeadline(LocalDate.now()); equal(0, service.list(7L).size(), "deadline-day list filtered by entry user");
        fails(IllegalArgumentException.class, () -> service.detail(20L), "owner cannot inspect another quote before cutoff");
        fails(IllegalArgumentException.class, () -> service.download(20L), "attachment cannot bypass quote secrecy"); equal(0, downloads.get(), "denied attachment never reaches storage");
        fails(IllegalArgumentException.class, () -> access.assertComparison(rfq), "deadline-day comparison remains locked");
        identity(100000L, 2L); equal(20L, service.detail(20L).getQuotation().getQuotationId(), "entry user may read own quote");
        rfq.setQuoteDeadline(LocalDate.now().minusDays(1)); fails(IllegalArgumentException.class, () -> access.assertComparison(rfq), "entry user without comparison role denied");
        identity(100000L, 1L); access.assertComparison(rfq); equal(1, service.list(7L).size(), "authorized comparison after cutoff"); service.download(20L); equal(1, downloads.get(), "authorized file download");
        identity(100001L, 1L); fails(IllegalArgumentException.class, () -> service.detail(20L), "cross-tenant quote denied"); identity(100000L, 1L);
    }

    static void purchaseAmounts() {
        OaPurchaseRfq rfq = rfq(); rfq.setStatus("AWARDED"); rfq.setPurchaseRequestId(10L); rfq.setAwardedSupplierId(2L); rfq.setAwardedQuotationId(20L); rfq.setAwardedAmount(number("60.99"));
        OaSupplierQuotation quote = quote(1L); OaSupplierQuotationItem line = quoteItem(3, "19.99", "0.9", "0.13"); line.setRfqItemId(33L);
        OaPurchaseRfqItem requirement = new OaPurchaseRfqItem(); requirement.setItemId(33L); requirement.setRfqId(7L); requirement.setTenantId(100000L); requirement.setDeleted(0); requirement.setConsumableId(44L); requirement.setUnit("件");
        OaRfqPurchaseSourceService source = new OaRfqPurchaseSourceService(proxy(OaPurchaseRfqMapper.class, (name, args) -> rfq), proxy(OaPurchaseRfqItemMapper.class, (name, args) -> requirement),
                proxy(OaSupplierQuotationMapper.class, (name, args) -> quote), proxy(OaSupplierQuotationItemMapper.class, (name, args) -> List.of(line)), null, null);
        BizPurchaseItem item = new BizPurchaseItem(); item.setRfqItemId(33L); item.setConsumableId(44L); item.setUnit("件"); item.setQuantity(3); item.setUnitPrice(BigDecimal.ZERO); item.setAmount(BigDecimal.ZERO);
        BizPurchaseRequest purchase = new BizPurchaseRequest(); purchase.setId(10L); purchase.setRfqId(7L); purchase.setSupplierId(2L); purchase.setItems(List.of(item));
        source.validateAndFill(purchase); decimal("60.99", purchase.getTotalAmount(), "purchase retains discount and tax"); decimal("19.99", item.getUnitPrice(), "client cannot overwrite quoted price");
        item.setQuantity(4); fails(IllegalArgumentException.class, () -> source.validateAndFill(purchase), "quantity tampering rejected"); item.setQuantity(3);
        purchase.setRfqId(null); fails(IllegalArgumentException.class, () -> source.validateAndFill(purchase), "removing RFQ link rejected"); purchase.setRfqId(7L);
        quote.setCurrency("USD"); fails(IllegalArgumentException.class, () -> source.validateAndFill(purchase), "foreign currency cannot silently enter CNY purchase ledger"); quote.setCurrency("CNY");
        identity(100000L, 2L); fails(ServiceException.class, () -> source.validateAndFill(purchase), "another user cannot consume award"); identity(100000L, 1L);
    }

    static void approvalReplay() throws Exception {
        OaPurchaseRfq rfq = rfq(); rfq.setInstanceId("approval-1"); OaSupplierQuotation quote = quote(2L); AtomicInteger writes = new AtomicInteger(); AtomicInteger traces = new AtomicInteger();
        SysSupplier supplier = new SysSupplier(); supplier.setSupplierId(2L); supplier.setTenantId(100000L); supplier.setDeleted(0); supplier.setStatus("ACTIVE"); supplier.setStanding("QUALIFIED"); supplier.setBypassFlag(0); supplier.setBlacklistFlag(0);
        List<SysAuditLogEntity> auditRows = new ArrayList<>();
        ObjectMapper auditJson = new ObjectMapper().findAndRegisterModules();
        OaSupplierAuditService audit = new OaSupplierAuditService(proxy(SysAuditLogMapper.class, (method, arguments) -> {
            if (!"insert".equals(method)) throw new IllegalStateException("Unexpected audit call " + method);
            auditRows.add((SysAuditLogEntity) arguments[0]);
            return 1;
        }), auditJson);
        SysSupplierMapper supplierMapper = proxy(SysSupplierMapper.class, (name, args) -> { if (name.equals("update")) { supplier.setInstanceId(null); return 1; } return name.startsWith("select") ? supplier : 1; });
        OaSupplierGovernanceService governance = construct(OaSupplierGovernanceService.class, Map.of(SysSupplierMapper.class, supplierMapper, OaSupplierQualificationMapper.class, proxy(OaSupplierQualificationMapper.class, (name, args) -> List.of()), OaSupplierAuditService.class, audit));
        OaApprovalRequest proposal = new OaApprovalRequest(); proposal.setTenantId(100000L); proposal.setStartUserId(1L); proposal.setStartUserName("buyer"); proposal.setVariables(new HashMap<>(Map.of("quotationId", 20L, "amount", "60.99", "currency", "CNY", "reason", "Approved procurement justification")));
        OaApprovalOutboxService approvals = new OaApprovalOutboxService(null, null, null, null) { @Override public OaApprovalRequest snapshot(ApprovalResultDTO result) { return proposal; } };
        IOaTraceEventService trace = proxy(IOaTraceEventService.class, (name, args) -> { traces.incrementAndGet(); return null; });
        List<SysAuditLogEntity> rfqAuditRows = new ArrayList<>();
        OaRfqAuditService rfqAudit = new OaRfqAuditService(proxy(SysAuditLogMapper.class, (method, arguments) -> {
            rfqAuditRows.add((SysAuditLogEntity) arguments[0]);
            return 1;
        }), auditJson);
        OaRfqAwardService service = construct(OaRfqAwardService.class, Map.of(OaPurchaseRfqMapper.class, proxy(OaPurchaseRfqMapper.class, (name, args) -> { if (name.equals("updateById")) { writes.incrementAndGet(); return 1; } return rfq; }),
                OaSupplierQuotationMapper.class, proxy(OaSupplierQuotationMapper.class, (name, args) -> quote), OaSupplierGovernanceService.class, governance, OaApprovalOutboxService.class, approvals, IOaTraceEventService.class, trace, OaRfqAuditService.class, rfqAudit));
        ApprovalResultDTO result = new ApprovalResultDTO(); result.setTenantId(100000L); result.setBusinessType("OA_RFQ_AWARD"); result.setBusinessId(7L); result.setProcessInstanceId("approval-1"); result.setVariables(Map.of("quotationId", 999L, "amount", "1"));
        service.handleApproved(result); equal("AWARDED", rfq.getStatus(), "award approval applied"); equal(20L, rfq.getAwardedQuotationId(), "approval uses immutable submission instead of callback variables"); decimal("60.99", rfq.getAwardedAmount(), "approval amount cannot be rewritten in callback");
        service.handleApproved(result); equal(1, writes.get(), "duplicate approval callback is idempotent"); equal(1, traces.get(), "duplicate approval does not duplicate trace");
        equal(1, rfqAuditRows.size(), "duplicate award callback retains one audit record");
        equal("COMPARING", auditJson.readTree(rfqAuditRows.get(0).getBeforeJson()).at("/state/status").asText(), "award audit preserves prior state");
        equal("AWARDED", auditJson.readTree(rfqAuditRows.get(0).getAfterJson()).at("/state/status").asText(), "award audit records actual awarded state");
        rfq.setStatus("COMPARING"); rfq.setInstanceId("approval-2"); result.setProcessInstanceId("approval-2"); quote.setValidUntil(LocalDate.now().minusDays(1)); service.handleApproved(result);
        equal("COMPARING", rfq.getStatus(), "expired quotation not awarded after delayed approval"); equal(null, rfq.getInstanceId(), "expired approval safely ends");
        equal(2, rfqAuditRows.size(), "expired quotation completion adds its own award decision record");
        supplier.setInstanceId("approval-3"); result.setProcessInstanceId("approval-3"); result.setBusinessId(2L); result.setBusinessType("OA_SUPPLIER_GOVERNANCE"); proposal.setVariables(Map.of("action", "BYPASS", "reason", "temporary access", "expireDate", LocalDate.now().minusDays(1).toString()));
        OaSupplierDecisionService decisions = construct(OaSupplierDecisionService.class, Map.of(SysSupplierMapper.class, supplierMapper, OaApprovalOutboxService.class, approvals, IOaTraceEventService.class, trace, OaSupplierAuditService.class, audit));
        decisions.handleApproved(result); equal(0, supplier.getBypassFlag(), "expired supplier bypass not granted"); equal(null, supplier.getInstanceId(), "expired supplier approval releases pending state");
        equal(1, auditRows.size(), "completed supplier decision records its audit snapshot");
        equal("approval-3", auditJson.readTree(auditRows.get(0).getBeforeJson()).at("/state/supplier/instanceId").asText(), "audit retains the prior pending instance");
        check(auditJson.readTree(auditRows.get(0).getAfterJson()).at("/state/supplier/instanceId").isNull(), "audit records the released approval instance");
        decisions.handleApproved(result);
        equal(1, auditRows.size(), "repeated decision does not add another audit record");
    }

    static void privateFiles() {
        OaPrivateFile file = new OaPrivateFile(); file.setFileId(1L); file.setTenantId(100000L); file.setDeleted(0); file.setStorageType("LOCAL"); file.setFileType("OA_CONTRACT_EVIDENCE"); file.setCreateBy("1");
        OaPrivateFileStorageService service = new OaPrivateFileStorageService(proxy(OaPrivateFileMapper.class, (name, args) -> file), null);
        service.assertOwned(OaPrivateFileStorageService.Kind.CONTRACT_EVIDENCE, "oa-file:CONTRACT_EVIDENCE:1", 1L); check(true, "dedicated evidence reference accepted");
        fails(IllegalArgumentException.class, () -> service.assertOwned(OaPrivateFileStorageService.Kind.RFQ_QUOTATION, "oa-file:RFQ_QUOTATION:1", 1L), "attachment purpose cannot be relabeled");
        fails(IllegalArgumentException.class, () -> service.assertOwned(OaPrivateFileStorageService.Kind.CONTRACT_EVIDENCE, "oa-file:CONTRACT_EVIDENCE:1", 2L), "another uploader file rejected");
        fails(IllegalArgumentException.class, () -> service.assertOwned(OaPrivateFileStorageService.Kind.CONTRACT_EVIDENCE, "https://public.example/file.pdf", 1L), "public URL cannot bypass evidence authorization");
        identity(100001L, 1L); fails(IllegalArgumentException.class, () -> service.assertOwned(OaPrivateFileStorageService.Kind.CONTRACT_EVIDENCE, "oa-file:CONTRACT_EVIDENCE:1", 1L), "cross-tenant evidence rejected"); identity(100000L, 1L);
    }
}
