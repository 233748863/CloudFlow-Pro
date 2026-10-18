package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.audit.HighRiskAuditVerifier;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.BizPurchaseItem;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.OaPurchaseRfq;
import com.cloudflow.oa.domain.OaPurchaseRfqItem;
import com.cloudflow.oa.domain.OaSupplierQuotation;
import com.cloudflow.oa.domain.OaSupplierQuotationItem;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.domain.dto.QuotationSaveDTO;
import com.cloudflow.oa.domain.dto.RfqAwardDTO;
import com.cloudflow.oa.domain.dto.RfqInviteDTO;
import com.cloudflow.oa.domain.dto.RfqSaveDTO;
import com.cloudflow.oa.mapper.OaPurchaseRfqMapper;
import com.cloudflow.oa.mapper.SysConsumableMapper;
import com.cloudflow.oa.mapper.SysSupplierMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.context.support.StaticApplicationContext;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

public final class OaRfqPersistenceDatabaseChecks {
    private static int assertions;
    private static boolean startupAuditVerified;
    private static boolean sourcePurchaseConversionVerified;
    private static final List<Map<String, Object>> outcomes = new ArrayList<>();

    @FunctionalInterface
    private interface Scenario {
        void run(OaOperationsDatabaseChecks fixture) throws Exception;
    }

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2) throw new IllegalArgumentException("An isolated JDBC URL and result path are required");
        StpLogic previous = StpUtil.getStpLogic();
        try {
            OaOperationsChecks.identity(100000L, 1L);
            OaOperationsDatabaseChecks fixture = new OaOperationsDatabaseChecks(arguments[0], false);
            scenario(fixture, "existing-rfq-confidentiality-award-and-purchase", OaRfqPersistenceDatabaseChecks::startupAndExistingRfq);
            scenario(fixture, "draft-item-removal-is-persisted", OaRfqPersistenceDatabaseChecks::draftRemoval);
            scenario(fixture, "quotation-item-removal-and-identity-preserving-restore", OaRfqPersistenceDatabaseChecks::quotationRestore);
            scenario(fixture, "rfq-save-and-invitation-audit-rollback", OaRfqPersistenceDatabaseChecks::invitationAudit);
            scenario(fixture, "quotation-save-submit-withdraw-audit-rollback", OaRfqPersistenceDatabaseChecks::quotationAudit);
            scenario(fixture, "award-request-decision-and-conversion-audit-rollback", OaRfqPersistenceDatabaseChecks::awardAudit);
            scenario(fixture, "award-admission-rejection-audit-rollback-and-resubmission", OaRfqPersistenceDatabaseChecks::awardAdmission);
            scenario(fixture, "source-purchase-conversion-identity-idempotency-and-audit-rollback", OaRfqPersistenceDatabaseChecks::sourcePurchaseConversion);
            scenario(fixture, "termination-and-restart-preserve-original-evidence", OaRfqPersistenceDatabaseChecks::termination);
            boolean passed = outcomes.stream().allMatch(value -> Boolean.TRUE.equals(value.get("passed")));
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("passed", passed);
            result.put("assertions", assertions + OaOperationsChecks.checks.get());
            result.put("scenarios", outcomes);
            result.put("actualDatabase", true);
            result.put("productionTenantPlugins", true);
            result.put("startupAuditVerifier", startupAuditVerified);
            result.put("sourcePurchaseConversionVerified", sourcePurchaseConversionVerified);
            result.put("actualApplicationHttp", false);
            result.put("actualWorkflowExecution", false);
            result.put("actualEmailDelivery", false);
            result.put("allF5AcceptanceComplete", false);
            Files.writeString(Path.of(arguments[1]), fixture.json.writerWithDefaultPrettyPrinter().writeValueAsString(result));
            System.out.println("F5_RFQ_DATABASE: passed=" + passed + "; assertions=" + result.get("assertions") + "; scenarios=" + outcomes.size());
            if (!passed) throw new AssertionError("RFQ database cases failed; original per-case evidence retained");
        } finally {
            StpUtil.setStpLogic(previous);
            OaOperationsChecks.identity(100000L, 1L);
        }
    }

    private static void startupAndExistingRfq(OaOperationsDatabaseChecks fixture) throws Exception {
        try (StaticApplicationContext context = new StaticApplicationContext()) {
            for (Class<?> serviceType : List.of(OaRfqService.class, OaQuotationService.class, OaRfqAwardService.class,
                    OaRfqInvitationService.class, OaRfqAuditService.class, OaSupplierGovernanceService.class)) {
                context.getBeanFactory().registerSingleton(serviceType.getSimpleName(), fixture.bean(serviceType));
            }
            new HighRiskAuditVerifier(context).afterSingletonsInstantiated();
            startupAuditVerified = true;
            require(startupAuditVerified, "The actual startup audit verifier must accept all RFQ services and supplier admission");
        }
        OaRfqDatabaseChecks.run(fixture);
    }

    private static void scenario(OaOperationsDatabaseChecks fixture, String name, Scenario operation) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("name", name);
        int before = assertions + OaOperationsChecks.checks.get();
        try {
            OaOperationsChecks.identity(100000L, 1L);
            operation.run(fixture);
            result.put("passed", true);
        } catch (Exception | AssertionError failure) {
            result.put("passed", false);
            result.put("failureType", failure.getClass().getName());
            result.put("failure", failure.getMessage());
            result.put("failureStack", Arrays.stream(failure.getStackTrace()).map(StackTraceElement::toString).toList());
        } finally {
            result.put("assertions", assertions + OaOperationsChecks.checks.get() - before);
            outcomes.add(result);
            OaOperationsChecks.identity(100000L, 1L);
            System.out.println("F5_CASE: " + name + "; passed=" + result.get("passed"));
        }
    }

    private static void draftRemoval(OaOperationsDatabaseChecks fixture) throws Exception {
        OaRfqService service = fixture.bean(OaRfqService.class);
        RfqSaveDTO draft = rfq(fixture, "draft-remove");
        Long rfqId = draft.getRfq().getRfqId();
        Long removedId = draft.getItems().get(1).getItemId();
        draft.setItems(List.of(draft.getItems().get(0)));
        service.save(draft);
        require(service.items(rfqId).size() == 1 && fixture.count("SELECT deleted FROM oa_purchase_rfq_item WHERE tenant_id=100000 AND item_id=?", removedId) == 1,
                "Removing a draft requirement must update its actual logical deletion and exclude it from future invitations");
        Audit saved = audit(fixture, "RFQ_SAVED", rfqId);
        require(saved.before().at("/state/items").size() == 2 && saved.after().at("/state/items").size() == 1,
                "The save audit must retain independently captured original and edited requirements");
        RfqSaveDTO current = service.detail(rfqId);
        current.getRfq().setTitle("audit rollback title");
        String original = state(fixture, rfqId);
        rejectAudit(fixture, "RFQ_SAVED", () -> service.save(current));
        require(original.equals(state(fixture, rfqId)), "A failed RFQ save audit must roll back its title, version and all requirements");
    }

    private static void quotationRestore(OaOperationsDatabaseChecks fixture) throws Exception {
        RfqSaveDTO draft = rfq(fixture, "restore-items");
        Long rfqId = draft.getRfq().getRfqId();
        SysSupplier supplier = supplier(fixture, "restore");
        invite(fixture, rfqId, supplier);
        OaQuotationService service = fixture.bean(OaQuotationService.class);
        Long quotationId = service.save(quote(fixture, rfqId, supplier));
        QuotationSaveDTO saved = service.detail(quotationId);
        OaSupplierQuotationItem removed = saved.getItems().get(1);
        Long itemId = removed.getItemId();
        saved.setItems(List.of(saved.getItems().get(0)));
        service.save(saved);
        require(service.detail(quotationId).getItems().size() == 1 && fixture.count(
                "SELECT deleted FROM oa_supplier_quotation_item WHERE tenant_id=100000 AND item_id=?", itemId) == 1,
                "Removing a quoted requirement must release the active line without changing its permanent identity");
        QuotationSaveDTO restore = service.detail(quotationId);
        List<OaSupplierQuotationItem> restoredLines = new ArrayList<>(restore.getItems());
        removed.setUnitPrice(new BigDecimal("23.45"));
        removed.setItemId(null);
        restoredLines.add(removed);
        restore.setItems(restoredLines);
        service.save(restore);
        QuotationSaveDTO restored = service.detail(quotationId);
        OaSupplierQuotationItem persisted = restored.getItems().stream().filter(line -> line.getRfqItemId().equals(removed.getRfqItemId())).findFirst().orElseThrow();
        require(persisted.getItemId().equals(itemId) && persisted.getUnitPrice().compareTo(new BigDecimal("23.45")) == 0
                        && fixture.count("SELECT COUNT(*) FROM oa_supplier_quotation_item WHERE tenant_id=100000 AND quotation_id=?", quotationId) == 2,
                "Re-adding a removed quotation line must revive its original row and new values without violating source uniqueness");
        String original = state(fixture, rfqId);
        restored.getItems().get(0).setItemId(itemId);
        rejects(() -> service.save(restored));
        require(original.equals(state(fixture, rfqId)), "A mismatched quotation-line identity must preserve the entire previous draft");
        require(audit(fixture, "QUOTATION_SAVED", rfqId).after().at("/state/items").size() == 2,
                "The restored quotation audit must retain both actual active items");
    }

    private static void invitationAudit(OaOperationsDatabaseChecks fixture) throws Exception {
        RfqSaveDTO draft = rfq(fixture, "invite-audit");
        Long rfqId = draft.getRfq().getRfqId();
        SysSupplier supplier = supplier(fixture, "invite");
        String original = state(fixture, rfqId);
        rejectAudit(fixture, "SUPPLIERS_INVITED", () -> invite(fixture, rfqId, supplier));
        require(original.equals(state(fixture, rfqId)) && auditCount(fixture, "SUPPLIERS_INVITED", rfqId) == 0,
                "An invitation audit failure must roll back supplier invitations, counts and RFQ state");
        invite(fixture, rfqId, supplier);
        Audit invited = audit(fixture, "SUPPLIERS_INVITED", rfqId);
        require(invited.before().at("/state/invitations").size() == 0 && invited.after().at("/state/invitations").size() == 1
                        && "OFFLINE".equals(invited.after().at("/details/channel").asText()),
                "Invitation audit must record original and current recipients and actual channel");
        require(invited.after().path("operatorId").asLong() == 1L
                        && draft.getRfq().getRfqNo().equals(invited.after().path("businessNo").asText()),
                "Invitation audit must retain the actual operator and RFQ business number");
        invite(fixture, rfqId, supplier);
        require(auditCount(fixture, "SUPPLIERS_INVITED", rfqId) == 1
                        && fixture.count("SELECT COUNT(*) FROM oa_purchase_rfq_supplier WHERE tenant_id=100000 AND rfq_id=?", rfqId) == 1,
                "Repeated invitation must not create another invitation or successful invitation audit");
    }

    private static void quotationAudit(OaOperationsDatabaseChecks fixture) throws Exception {
        RfqSaveDTO draft = rfq(fixture, "quote-audit");
        Long rfqId = draft.getRfq().getRfqId();
        SysSupplier supplier = supplier(fixture, "quotation");
        invite(fixture, rfqId, supplier);
        OaQuotationService service = fixture.bean(OaQuotationService.class);
        QuotationSaveDTO proposed = quote(fixture, rfqId, supplier);
        String beforeSave = state(fixture, rfqId);
        rejectAudit(fixture, "QUOTATION_SAVED", () -> service.save(proposed));
        require(beforeSave.equals(state(fixture, rfqId)), "A quotation audit failure must roll back the new quote and all quoted lines");
        Long quotationId = service.save(quote(fixture, rfqId, supplier));
        String beforeSubmit = state(fixture, rfqId);
        rejectAudit(fixture, "QUOTATION_SUBMITTED", () -> service.submit(quotationId));
        require(beforeSubmit.equals(state(fixture, rfqId)), "A failed submission audit must roll back quote state, response timestamp and RFQ response count");
        service.submit(quotationId);
        Audit submitted = audit(fixture, "QUOTATION_SUBMITTED", rfqId);
        require("DRAFT".equals(submitted.before().at("/state/quotation/status").asText())
                        && "SUBMITTED".equals(submitted.after().at("/state/quotation/status").asText()),
                "Quotation submission audit must retain the original and submitted states");
        service.submit(quotationId);
        require(auditCount(fixture, "QUOTATION_SUBMITTED", rfqId) == 1, "A repeated quote submission must keep a single successful audit");
        String beforeWithdraw = state(fixture, rfqId);
        rejectAudit(fixture, "QUOTATION_WITHDRAWN", () -> service.withdraw(quotationId));
        require(beforeWithdraw.equals(state(fixture, rfqId)), "A failed withdrawal audit must preserve the previously submitted quote and its response facts");
        service.withdraw(quotationId);
        require("WITHDRAWN".equals(service.detail(quotationId).getQuotation().getStatus())
                        && fixture.count("SELECT COUNT(*) FROM oa_purchase_rfq_supplier WHERE tenant_id=100000 AND rfq_id=? AND respond_time IS NULL AND quote_status='INVITED'", rfqId) == 1,
                "Actual withdrawal must release the response time and reopen its invitation");
        Audit withdrawn = audit(fixture, "QUOTATION_WITHDRAWN", rfqId);
        require("SUBMITTED".equals(withdrawn.before().at("/state/quotation/status").asText())
                        && "WITHDRAWN".equals(withdrawn.after().at("/state/quotation/status").asText()),
                "Withdrawal audit must preserve separate state snapshots");
    }

    private static void awardAudit(OaOperationsDatabaseChecks fixture) throws Exception {
        RfqSaveDTO draft = rfq(fixture, "award-audit");
        Long rfqId = draft.getRfq().getRfqId();
        SysSupplier supplier = supplier(fixture, "award");
        invite(fixture, rfqId, supplier);
        OaQuotationService quotations = fixture.bean(OaQuotationService.class);
        Long quotationId = quotations.save(quote(fixture, rfqId, supplier));
        quotations.submit(quotationId);
        fixture.jdbc.update("UPDATE oa_purchase_rfq SET quote_deadline=? WHERE tenant_id=100000 AND rfq_id=?", LocalDate.now().minusDays(1), rfqId);
        OaRfqAwardService awards = fixture.bean(OaRfqAwardService.class);
        RfqAwardDTO request = new RfqAwardDTO();
        request.setQuotationId(quotationId);
        request.setReason("含税报价完整且采购内容满足要求");
        String beforeRequest = state(fixture, rfqId);
        long approvalBefore = approvalEvents(fixture, rfqId);
        rejectAudit(fixture, "AWARD_REQUESTED", () -> awards.award(rfqId, request));
        require(beforeRequest.equals(state(fixture, rfqId)) && approvalEvents(fixture, rfqId) == approvalBefore,
                "A failed award proposal audit must roll back RFQ state and the approval outbox");
        require("APPROVING".equals(awards.award(rfqId, request)), "The configured award must require actual approval execution later in HTTP acceptance");
        String reservation = fixture.mapper(OaPurchaseRfqMapper.class).selectById(rfqId).getInstanceId();
        ApprovalResultDTO approved = fixture.bind(awards, rfqId, reservation);
        approved.setApprovalResult("APPROVED");
        approved.setApproverId(2L);
        approved.setApproverName("采购定标复核人");
        approved.setApprovalTime(System.currentTimeMillis());
        String pending = state(fixture, rfqId);
        rejectAudit(fixture, "RFQ_AWARDED", () -> awards.handleApproved(approved));
        require(pending.equals(state(fixture, rfqId)), "An award callback audit failure must preserve the complete pending RFQ");
        awards.handleApproved(approved);
        awards.handleApproved(approved);
        Audit awarded = audit(fixture, "RFQ_AWARDED", rfqId);
        require("COMPARING".equals(awarded.before().at("/state/status").asText())
                        && "AWARDED".equals(awarded.after().at("/state/status").asText()) && auditCount(fixture, "RFQ_AWARDED", rfqId) == 1,
                "Repeated approval callbacks must retain a single actual before/after award audit");
        require(awarded.after().path("operatorId").asLong() == 2L && awarded.after().path("executorId").asLong() == 1L
                        && "采购定标复核人".equals(awarded.after().path("operatorName").asText())
                        && approved.getProcessInstanceId().equals(awarded.after().at("/approval/instanceId").asText()),
                "Award audit must distinguish the actual approver from the callback executor and keep its process instance");
        String beforePurchase = state(fixture, rfqId);
        rejectAudit(fixture, "PURCHASE_CREATED", () -> awards.createPurchase(rfqId));
        require(beforePurchase.equals(state(fixture, rfqId))
                        && fixture.count("SELECT COUNT(*) FROM biz_purchase_request WHERE tenant_id=100000 AND rfq_id=?", rfqId) == 0,
                "A purchase conversion audit failure must roll back the generated purchase and its RFQ source link");
        BizPurchaseRequest purchase = awards.createPurchase(rfqId);
        require(purchase.getId().equals(awards.createPurchase(rfqId).getId()) && auditCount(fixture, "PURCHASE_CREATED", rfqId) == 1,
                "Repeated purchase conversion must return the original purchase without duplicating the audit");
        Audit converted = audit(fixture, "PURCHASE_CREATED", rfqId);
        require(converted.before().at("/state/purchase").isMissingNode()
                        && converted.after().at("/state/purchase/id").asLong() == purchase.getId(),
                "Conversion audit must preserve the absent purchase before and the actual purchase afterwards");
    }

    private static void sourcePurchaseConversion(OaOperationsDatabaseChecks fixture) throws Exception {
        PurchaseRequestServiceImpl purchases = fixture.bean(PurchaseRequestServiceImpl.class);
        OaRfqService rfqs = fixture.bean(OaRfqService.class);
        OaQuotationService quotations = fixture.bean(OaQuotationService.class);
        OaRfqAwardService awards = fixture.bean(OaRfqAwardService.class);
        List<Long> consumableIds = fixture.jdbc.queryForList(
                "SELECT consumable_id FROM oa_consumable WHERE tenant_id=100000 AND deleted=0 ORDER BY consumable_id LIMIT 2", Long.class);
        require(consumableIds.size() == 2, "Source purchase conversion requires two actual consumables");
        for (String condition : List.of("direct", "audit-rollback")) {
            SysSupplier originalSupplier = supplier(fixture, "source-original-" + condition);
            SysSupplier winner = supplier(fixture, "source-winner-" + condition);
            BizPurchaseRequest request = new BizPurchaseRequest();
            request.setSupplierId(originalSupplier.getSupplierId());
            request.setReason(fixture.marker + "-source-purchase-" + condition);
            request.setExpectedDate(LocalDate.now().plusDays(30).atStartOfDay());
            List<BizPurchaseItem> requestedItems = new ArrayList<>();
            for (int index = 0; index < consumableIds.size(); index++) {
                BizPurchaseItem item = new BizPurchaseItem();
                item.setConsumableId(consumableIds.get(index));
                item.setQuantity(index + 2);
                item.setUnitPrice(new BigDecimal("100.00"));
                requestedItems.add(item);
            }
            request.setItems(requestedItems);
            require(purchases.createPurchase(request), "The source draft must be created through the actual purchase service");
            BizPurchaseRequest original = purchases.getRequestWithItems(request.getId());
            require(original.getRfqId() == null && original.getTotalAmount().compareTo(new BigDecimal("500.00")) == 0,
                    "The original purchase must retain its independent source and 500.00 amount before inquiry");
            Long rfqId = rfqs.createFromPurchase(original.getId(), LocalDate.now().plusDays(7));
            require(original.getId().equals(rfqs.detail(rfqId).getRfq().getPurchaseRequestId()),
                    "Creating an inquiry from the draft must retain its original purchase identity");
            invite(fixture, rfqId, winner);
            Long quotationId = quotations.save(quote(fixture, rfqId, winner));
            quotations.submit(quotationId);
            fixture.jdbc.update("UPDATE oa_purchase_rfq SET quote_deadline=? WHERE tenant_id=100000 AND rfq_id=?",
                    LocalDate.now().minusDays(1), rfqId);
            RfqAwardDTO proposal = new RfqAwardDTO();
            proposal.setQuotationId(quotationId);
            proposal.setReason("来源采购完整报价经过审批后回写原草稿");
            require("APPROVING".equals(awards.award(rfqId, proposal)), "Source purchase award must enter configured approval");
            ApprovalResultDTO approved = fixture.bind(awards, rfqId,
                    fixture.mapper(OaPurchaseRfqMapper.class).selectById(rfqId).getInstanceId());
            approved.setApprovalResult("APPROVED");
            approved.setApproverId(2L);
            approved.setApproverName("来源采购定标复核人");
            approved.setApprovalTime(System.currentTimeMillis());
            awards.handleApproved(approved);
            String before = sourcePurchaseState(fixture, rfqId, original.getId());
            if ("audit-rollback".equals(condition)) {
                rejectAudit(fixture, "PURCHASE_CREATED", () -> awards.createPurchase(rfqId));
                require(before.equals(sourcePurchaseState(fixture, rfqId, original.getId()))
                                && auditCount(fixture, "PURCHASE_CREATED", rfqId) == 0,
                        "A conversion audit insertion failure must roll back the original draft, all items and both source links");
            }
            BizPurchaseRequest converted;
            try {
                converted = awards.createPurchase(rfqId);
            } catch (RuntimeException failure) {
                require(before.equals(sourcePurchaseState(fixture, rfqId, original.getId())),
                        "A failed source purchase conversion must preserve all original database values");
                throw failure;
            }
            require(original.getId().equals(converted.getId()) && original.getPurchaseNo().equals(converted.getPurchaseNo())
                            && original.getUserId().equals(converted.getUserId()) && original.getCreateTime().equals(converted.getCreateTime())
                            && converted.getVersion() == original.getVersion() + 1 && "DRAFT".equals(converted.getStatus()),
                    "Conversion must update the original draft once while retaining its number, owner and creation time");
            require(rfqId.equals(converted.getRfqId()) && winner.getSupplierId().equals(converted.getSupplierId())
                            && converted.getTotalAmount().compareTo(new BigDecimal("101.65")) == 0 && converted.getItems().size() == 2
                            && converted.getItems().stream().allMatch(item -> item.getRfqItemId() != null
                            && item.getUnitPrice().compareTo(new BigDecimal("19.99")) == 0
                            && item.getAmount().compareTo(new BigDecimal(item.getQuantity() == 2 ? "40.66" : "60.99")) == 0),
                    "The original draft must receive the winner and all discounted tax-inclusive amounts totaling 101.65");
            Audit convertedAudit = audit(fixture, "PURCHASE_CREATED", rfqId);
            require(convertedAudit.before().at("/state/purchase/id").asLong() == original.getId()
                            && convertedAudit.before().at("/state/purchase/rfqId").isNull()
                            && convertedAudit.before().at("/state/purchase/totalAmount").decimalValue().compareTo(new BigDecimal("500.00")) == 0
                            && convertedAudit.after().at("/state/purchase/id").asLong() == original.getId()
                            && convertedAudit.after().at("/state/purchase/rfqId").asLong() == rfqId
                            && convertedAudit.after().at("/state/purchase/totalAmount").decimalValue().compareTo(new BigDecimal("101.65")) == 0,
                    "The conversion audit must retain independent snapshots of the original and updated purchase");
            String once = sourcePurchaseState(fixture, rfqId, original.getId());
            require(original.getId().equals(awards.createPurchase(rfqId).getId())
                            && once.equals(sourcePurchaseState(fixture, rfqId, original.getId()))
                            && auditCount(fixture, "PURCHASE_CREATED", rfqId) == 1
                            && fixture.count("SELECT COUNT(*) FROM biz_purchase_request WHERE tenant_id=100000 AND rfq_id=? AND deleted=0", rfqId) == 1,
                    "Repeated source conversion must retain one purchase, unchanged items and one successful conversion audit");
        }
        sourcePurchaseConversionVerified = true;
    }

    private static String sourcePurchaseState(OaOperationsDatabaseChecks fixture, Long rfqId, Long purchaseId) throws Exception {
        return fixture.json.writeValueAsString(Map.of(
                "rfq", state(fixture, rfqId),
                "purchase", fixture.jdbc.queryForList("SELECT * FROM biz_purchase_request WHERE tenant_id=100000 AND id=?", purchaseId),
                "items", fixture.jdbc.queryForList("SELECT * FROM biz_purchase_item WHERE tenant_id=100000 AND purchase_id=? ORDER BY id", purchaseId)));
    }

    private static void awardAdmission(OaOperationsDatabaseChecks fixture) throws Exception {
        for (String condition : List.of("PURCHASE_PROHIBITED", "BLACKLISTED", "DISABLED", "DELETED")) {
            awardAdmission(fixture, condition);
        }
    }

    private static void awardAdmission(OaOperationsDatabaseChecks fixture, String condition) throws Exception {
        RfqSaveDTO draft = rfq(fixture, "award-admission-" + condition);
        Long rfqId = draft.getRfq().getRfqId();
        SysSupplier supplier = supplier(fixture, "adm-" + condition);
        invite(fixture, rfqId, supplier);
        OaQuotationService quotations = fixture.bean(OaQuotationService.class);
        Long quotationId = quotations.save(quote(fixture, rfqId, supplier));
        quotations.submit(quotationId);
        fixture.jdbc.update("UPDATE oa_purchase_rfq SET quote_deadline=? WHERE tenant_id=100000 AND rfq_id=?", LocalDate.now().minusDays(1), rfqId);
        OaRfqAwardService awards = fixture.bean(OaRfqAwardService.class);
        RfqAwardDTO request = new RfqAwardDTO();
        request.setQuotationId(quotationId);
        request.setReason("当前有效完整报价满足采购要求");
        require("APPROVING".equals(awards.award(rfqId, request)), "Admission revalidation must start from a pending award proposal");
        OaPurchaseRfqMapper rfqs = fixture.mapper(OaPurchaseRfqMapper.class);
        String reservation = rfqs.selectById(rfqId).getInstanceId();
        ApprovalResultDTO approved = fixture.bind(awards, rfqId, reservation);
        approved.setApprovalResult("APPROVED");
        approved.setApproverId(2L);
        approved.setApproverName("采购准入复核人");
        approved.setApprovalTime(System.currentTimeMillis());
        SysSupplierMapper suppliers = fixture.mapper(SysSupplierMapper.class);
        SysSupplier blocked = suppliers.selectById(supplier.getSupplierId());
        String expectedReason;
        if ("DELETED".equals(condition)) {
            require(fixture.jdbc.update("UPDATE oa_supplier SET deleted=1 WHERE tenant_id=100000 AND supplier_id=?", supplier.getSupplierId()) == 1,
                    "The supplier removal must be persisted before the approval callback");
            expectedReason = "记录不存在";
        } else {
            expectedReason = switch (condition) {
                case "PURCHASE_PROHIBITED" -> { blocked.setPreventPurchaseFlag(1); yield "禁止"; }
                case "BLACKLISTED" -> { blocked.setBlacklistFlag(1); yield "黑名单"; }
                case "DISABLED" -> { blocked.setStatus("DISABLED"); yield "停用"; }
                default -> throw new IllegalArgumentException("Unexpected supplier admission condition");
            };
            OaRecordSupport.touch(blocked);
            require(suppliers.updateById(blocked) == 1, "The supplier restriction must be persisted before the approval callback");
        }
        String pending = state(fixture, rfqId);
        if (!"DELETED".equals(condition)) {
            rejectAudit(fixture, "ADMISSION_BLOCKED", () -> awards.handleApproved(approved));
            require(pending.equals(state(fixture, rfqId)) && auditCount(fixture, "AWARD_REJECTED", rfqId) == 0,
                    "Supplier admission audit storage failures must preserve the pending award instead of becoming a business refusal");
        }
        rejectAudit(fixture, "AWARD_REJECTED", () -> awards.handleApproved(approved));
        require(pending.equals(state(fixture, rfqId)) && auditCount(fixture, "AWARD_REJECTED", rfqId) == 0,
                "An audit failure while recording admission rejection must preserve the complete pending proposal");
        awards.handleApproved(approved);
        OaPurchaseRfq refused = rfqs.selectById(rfqId);
        require("COMPARING".equals(refused.getStatus()) && refused.getInstanceId() == null
                        && refused.getAwardedSupplierId() == null && refused.getAwardedAmount() == null,
                "A business admission refusal must finish the pending instance without creating award facts");
        Audit rejection = audit(fixture, "AWARD_REJECTED", rfqId);
        require(rejection.after().at("/details/reason").asText().contains(expectedReason)
                        && rejection.after().path("operatorId").asLong() == 2L
                        && approved.getProcessInstanceId().equals(rejection.after().at("/approval/instanceId").asText()),
                "The rejected award audit must preserve the actual prohibition, approver and bound instance");
        String rejected = state(fixture, rfqId);
        awards.handleApproved(approved);
        require(rejected.equals(state(fixture, rfqId)) && auditCount(fixture, "AWARD_REJECTED", rfqId) == 1,
                "A repeated old approval callback must not apply the refused award or duplicate its audit");
        if ("DELETED".equals(condition)) {
            require(fixture.jdbc.update("UPDATE oa_supplier SET deleted=0 WHERE tenant_id=100000 AND supplier_id=?", supplier.getSupplierId()) == 1,
                    "The supplier must be restored before a new proposal");
        } else {
            SysSupplier restored = suppliers.selectById(supplier.getSupplierId());
            restored.setPreventPurchaseFlag(0);
            restored.setBlacklistFlag(0);
            restored.setStatus("ACTIVE");
            OaRecordSupport.touch(restored);
            require(suppliers.updateById(restored) == 1, "The supplier admission settings must be restored before a new proposal");
        }
        require("APPROVING".equals(awards.award(rfqId, request)), "Restored admission must permit a new award proposal");
        String nextReservation = rfqs.selectById(rfqId).getInstanceId();
        ApprovalResultDTO retried = fixture.bind(awards, rfqId, nextReservation);
        retried.setApprovalResult("APPROVED");
        retried.setApproverId(2L);
        retried.setApproverName("采购准入复核人");
        retried.setApprovalTime(System.currentTimeMillis());
        awards.handleApproved(retried);
        require(!approved.getProcessInstanceId().equals(retried.getProcessInstanceId())
                        && "AWARDED".equals(rfqs.selectById(rfqId).getStatus())
                        && auditCount(fixture, "RFQ_AWARDED", rfqId) == 1 && auditCount(fixture, "AWARD_REJECTED", rfqId) == 1,
                "A newly approved proposal must apply exactly once and retain the previous refusal evidence");
    }

    private static void termination(OaOperationsDatabaseChecks fixture) throws Exception {
        RfqSaveDTO draft = rfq(fixture, "termination");
        Long rfqId = draft.getRfq().getRfqId();
        OaRfqService service = fixture.bean(OaRfqService.class);
        invite(fixture, rfqId, supplier(fixture, "termination"));
        String original = state(fixture, rfqId);
        rejectAudit(fixture, "RFQ_TERMINATED", () -> service.terminate(rfqId, true, "缺少符合要求的完整报价"));
        require(original.equals(state(fixture, rfqId)), "Failed termination audit must preserve the original RFQ and invitation history");
        service.terminate(rfqId, true, "缺少符合要求的完整报价");
        Audit ended = audit(fixture, "RFQ_TERMINATED", rfqId);
        require("FAILED".equals(ended.after().at("/state/status").asText()) && ended.after().at("/details/failed").asBoolean(),
                "Failed procurement audit must retain its exact resulting status and reason");
        String failed = state(fixture, rfqId);
        Long restartedId = service.restart(rfqId, LocalDate.now().plusDays(7));
        RfqSaveDTO restarted = service.detail(restartedId);
        require(!restartedId.equals(rfqId) && !restarted.getRfq().getRfqNo().equals(draft.getRfq().getRfqNo())
                        && restarted.getItems().size() == 2 && service.invitations(restartedId).isEmpty()
                        && failed.equals(state(fixture, rfqId)),
                "Restarting must create a fresh RFQ with copied requirements and preserve all original failed evidence");
    }

    private static RfqSaveDTO rfq(OaOperationsDatabaseChecks fixture, String suffix) {
        List<Long> consumableIds = fixture.jdbc.queryForList(
                "SELECT consumable_id FROM oa_consumable WHERE tenant_id=100000 AND deleted=0 ORDER BY consumable_id LIMIT 2", Long.class);
        if (consumableIds.size() != 2) throw new IllegalStateException("Two actual seeded consumables are required");
        OaPurchaseRfq rfq = new OaPurchaseRfq();
        rfq.setTitle(fixture.marker + "-" + suffix);
        rfq.setQuoteDeadline(LocalDate.now().plusDays(7));
        rfq.setExpectedDeliveryDate(LocalDate.now().plusDays(30));
        List<OaPurchaseRfqItem> requirements = new ArrayList<>();
        for (int index = 0; index < 2; index++) {
            Long consumableId = consumableIds.get(index);
            String unit = fixture.mapper(SysConsumableMapper.class).selectById(consumableId).getUnit();
            OaPurchaseRfqItem item = new OaPurchaseRfqItem();
            item.setItemName("验收物料" + index);
            item.setConsumableId(consumableId);
            item.setQuantity(index + 2);
            item.setUnit(unit);
            item.setSortNo(index);
            item.setExpectedPrice(BigDecimal.valueOf(100));
            requirements.add(item);
        }
        RfqSaveDTO request = new RfqSaveDTO();
        request.setRfq(rfq);
        request.setItems(requirements);
        OaRfqService service = fixture.bean(OaRfqService.class);
        return service.detail(service.save(request));
    }

    private static SysSupplier supplier(OaOperationsDatabaseChecks fixture, String suffix) {
        return OaAssetSupplierDatabaseChecks.supplier(fixture, "-f5-" + suffix);
    }

    private static void invite(OaOperationsDatabaseChecks fixture, Long rfqId, SysSupplier supplier) {
        Integer version = fixture.mapper(OaPurchaseRfqMapper.class).selectById(rfqId).getVersion();
        fixture.bean(OaRfqService.class).invite(rfqId, new RfqInviteDTO(version, "OFFLINE", List.of(supplier.getSupplierId())));
    }

    private static QuotationSaveDTO quote(OaOperationsDatabaseChecks fixture, Long rfqId, SysSupplier supplier) {
        OaSupplierQuotation quotation = new OaSupplierQuotation();
        quotation.setRfqId(rfqId);
        quotation.setSupplierId(supplier.getSupplierId());
        quotation.setQuoteDate(LocalDate.now());
        quotation.setValidUntil(LocalDate.now().plusDays(30));
        quotation.setCurrency("CNY");
        quotation.setDeliveryDays(7);
        quotation.setAttachmentUrl(OaProjectContractDatabaseChecks.upload(fixture, OaPrivateFileStorageService.Kind.RFQ_QUOTATION));
        List<OaSupplierQuotationItem> lines = new ArrayList<>();
        for (OaPurchaseRfqItem requirement : fixture.bean(OaRfqService.class).items(rfqId)) {
            OaSupplierQuotationItem line = new OaSupplierQuotationItem();
            line.setRfqItemId(requirement.getItemId());
            line.setQuantity(requirement.getQuantity());
            line.setUnitPrice(new BigDecimal("19.99"));
            line.setDiscountRate(new BigDecimal("0.90"));
            line.setTaxRate(new BigDecimal("0.13"));
            lines.add(line);
        }
        QuotationSaveDTO request = new QuotationSaveDTO();
        request.setQuotation(quotation);
        request.setItems(lines);
        return request;
    }

    private record Audit(JsonNode before, JsonNode after) { }

    private static Audit audit(OaOperationsDatabaseChecks fixture, String action, Long rfqId) throws Exception {
        Map<String, Object> row = fixture.jdbc.queryForMap("SELECT before_json,after_json FROM sys_audit_log "
                + "WHERE tenant_id=100000 AND audit_field=? AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.businessId'))=? "
                + "ORDER BY audit_id DESC LIMIT 1", action, rfqId.toString());
        return new Audit(fixture.json.readTree(row.get("before_json").toString()), fixture.json.readTree(row.get("after_json").toString()));
    }

    private static long auditCount(OaOperationsDatabaseChecks fixture, String action, Long rfqId) {
        return fixture.count("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_field=? "
                + "AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.businessId'))=?", action, rfqId.toString());
    }

    private static long approvalEvents(OaOperationsDatabaseChecks fixture, Long rfqId) {
        return fixture.count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND aggregate_id=? "
                + "AND event_type='OA_F_APPROVAL_SUBMITTED'", rfqId);
    }

    private static String state(OaOperationsDatabaseChecks fixture, Long rfqId) throws Exception {
        return fixture.json.writeValueAsString(Map.of(
                "rfq", fixture.jdbc.queryForList("SELECT * FROM oa_purchase_rfq WHERE tenant_id=100000 AND rfq_id=?", rfqId),
                "items", fixture.jdbc.queryForList("SELECT * FROM oa_purchase_rfq_item WHERE tenant_id=100000 AND rfq_id=? ORDER BY item_id", rfqId),
                "invitations", fixture.jdbc.queryForList("SELECT * FROM oa_purchase_rfq_supplier WHERE tenant_id=100000 AND rfq_id=? ORDER BY rfq_supplier_id", rfqId),
                "quotations", fixture.jdbc.queryForList("SELECT * FROM oa_supplier_quotation WHERE tenant_id=100000 AND rfq_id=? ORDER BY quotation_id", rfqId),
                "quotedItems", fixture.jdbc.queryForList("SELECT item.* FROM oa_supplier_quotation_item item JOIN oa_supplier_quotation quotation "
                        + "ON quotation.quotation_id=item.quotation_id AND quotation.tenant_id=item.tenant_id "
                        + "WHERE quotation.tenant_id=100000 AND quotation.rfq_id=? ORDER BY item.item_id", rfqId)));
    }

    private static void rejectAudit(OaOperationsDatabaseChecks fixture, String action, Runnable operation) {
        String trigger = "f5_audit_" + UUID.randomUUID().toString().replace("-", "");
        String validatedAction = "ADMISSION_BLOCKED".equals(action) ? OaSupplierAuditService.Action.valueOf(action).name()
                : OaRfqAuditService.Action.valueOf(action).name();
        fixture.jdbc.execute("CREATE TRIGGER " + trigger + " BEFORE INSERT ON sys_audit_log FOR EACH ROW BEGIN "
                + "IF NEW.tenant_id=100000 AND NEW.audit_field='" + validatedAction + "' THEN "
                + "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='F5_EXPECTED_AUDIT_FAILURE'; END IF; END");
        RuntimeException actual = null;
        try {
            operation.run();
        } catch (RuntimeException failure) {
            actual = failure;
        } finally {
            fixture.jdbc.execute("DROP TRIGGER " + trigger);
        }
        boolean expected = false;
        for (Throwable cause = actual; cause != null; cause = cause.getCause()) {
            if (cause.getMessage() != null && cause.getMessage().contains("F5_EXPECTED_AUDIT_FAILURE")) expected = true;
        }
        require(expected, "The real audit database insertion must fail at the deliberate storage fault");
    }

    private static void rejects(Runnable operation) {
        try {
            operation.run();
            throw new AssertionError("Invalid RFQ mutation was accepted");
        } catch (IllegalArgumentException expected) {
            assertions++;
        }
    }

    private static void require(boolean passed, String message) {
        assertions++;
        if (!passed) throw new AssertionError(message);
    }
}
