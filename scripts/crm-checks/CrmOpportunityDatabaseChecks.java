package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.CrmOpportunityItemsRequest;
import com.cloudflow.crm.domain.dto.CrmOpportunityLossDTO;
import com.cloudflow.crm.domain.dto.CrmSalesStageRequest;
import com.cloudflow.crm.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.crm.mapper.*;
import com.cloudflow.crm.service.opportunity.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.BeanUtils;
import org.springframework.transaction.support.TransactionTemplate;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmOpportunityDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmOpportunityServiceImpl service;
    private final CrmOpportunityWriteService writes;
    private final CrmOpportunityItemService items;
    private final CrmSalesStageService catalog;

    private CrmOpportunityDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; service = fixture.bean(CrmOpportunityServiceImpl.class); writes = fixture.bean(CrmOpportunityWriteService.class);
        items = fixture.bean(CrmOpportunityItemService.class); catalog = fixture.bean(CrmSalesStageService.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount();
        CrmOpportunityDatabaseChecks checks = new CrmOpportunityDatabaseChecks(fixture);
        checks.writes(); checks.products(); checks.rulesAndApproval(); checks.workflowRetryBinding(); checks.concurrency();
        System.out.println("H3_OPPORTUNITY_DATABASE_CHECKS: assertions=" + (assertionCount() - before) + "; failed=0; mysql=true; tenant_scope_sql=true; transactions=true; locking_read_verified=true; interface_doubles=HR_OA_WORKFLOW; production_modified=false");
    }

    private CrmOpportunity create(CrmCustomer customer) {
        CrmOpportunity input = input(customer); service.createOpportunity(input); return input;
    }

    private void workflowRetryBinding() {
        CrmApproval approval = new CrmApproval(); approval.setApprovalNo("H3-RETRY-" + java.util.UUID.randomUUID());
        approval.setBusinessType(com.cloudflow.crm.constant.CrmBusinessTypes.CRM_OPPORTUNITY_DOWNGRADE);
        approval.setBusinessRefId(create(fixture.customer("h3-retry-binding")).getOpportunityId());
        approval.setBusinessRefType("CRM_OPPORTUNITY"); approval.setApplicantId(1L); approval.setApplicantName("batch-e-check");
        approval.setStatus("PENDING"); CrmRecordSupport.create(approval, "approvalId"); fixture.mapper(CrmApprovalMapper.class).insert(approval);
        CrmApprovalInstanceBinder binder = fixture.bean(CrmApprovalInstanceBinder.class);
        InternalWorkflowStartDTO request = new InternalWorkflowStartDTO(); request.setTenantId(100000L);
        request.setBusinessKey(approval.getBusinessType() + ":" + approval.getApprovalId()); request.setProcessDefKey("opportunity_downgrade_review");
        request.setStartUserId(1L);
        request.setVariables(new java.util.HashMap<>(java.util.Map.of("approvalId", approval.getApprovalId(), "businessId", approval.getApprovalId(),
                "businessType", approval.getBusinessType(), "businessRefId", approval.getBusinessRefId())));
        request.setTenantId(100001L);
        fails(IllegalStateException.class, () -> binder.bindOpportunityRetry(request, "h3-retry-instance"), "retry binding rejects foreign tenant");
        request.setTenantId(100000L); request.setProcessDefKey("unrelated_definition");
        fails(IllegalStateException.class, () -> binder.bindOpportunityRetry(request, "h3-retry-instance"), "retry binding rejects wrong workflow definition");
        request.setProcessDefKey("opportunity_downgrade_review"); request.setStartUserId(2L);
        fails(IllegalStateException.class, () -> binder.bindOpportunityRetry(request, "h3-retry-instance"), "retry binding rejects wrong initiator");
        request.setStartUserId(1L); request.getVariables().put("businessRefId", approval.getBusinessRefId() + 1);
        fails(IllegalStateException.class, () -> binder.bindOpportunityRetry(request, "h3-retry-instance"), "retry binding rejects different opportunity");
        request.getVariables().put("businessRefId", approval.getBusinessRefId());
        fails(IllegalStateException.class, () -> binder.bindOpportunityRetry(request, java.util.Map.of("accepted", true)), "retry binding cannot substitute accepted for an actual instance");
        equal(null, fixture.mapper(CrmApprovalMapper.class).selectById(approval.getApprovalId()).getInstanceId(), "invalid retries have not bound an instance");
        binder.bindOpportunityRetry(request, java.util.Map.of("processInstanceId", "h3-retry-instance"));
        equal("h3-retry-instance", fixture.mapper(CrmApprovalMapper.class).selectById(approval.getApprovalId()).getInstanceId(), "successful retry persists workflow binding");
        binder.bindOpportunityRetry(request, java.util.Map.of("instanceId", "h3-retry-instance"));
        equal("h3-retry-instance", fixture.mapper(CrmApprovalMapper.class).selectById(approval.getApprovalId()).getInstanceId(), "same retry binding is idempotent");
        fails(IllegalStateException.class, () -> binder.bindOpportunityRetry(request, "different-instance"), "retry cannot replace existing bound instance");
    }

    private CrmOpportunity input(CrmCustomer customer) {
        CrmOpportunity input = new CrmOpportunity(); input.setCustomerId(customer.getCustomerId()); input.setOpportunityName("H3阶段验收商机");
        input.setExpectedAmount(new BigDecimal("420000")); input.setOwnerId(1L); input.setExpectedSignDate(LocalDate.now().plusDays(10));
        return input;
    }

    private CrmOpportunity read(Long id) { return fixture.mapper(CrmOpportunityMapper.class).selectById(id); }
    private long historyCount(Long id) { return fixture.scalar("SELECT COUNT(*) FROM crm_opportunity_stage_history WHERE tenant_id=100000 AND opportunity_id=?", id); }

    private void writes() {
        CrmCustomer customer = fixture.customer("h3-write");
        CrmOpportunity forged = input(customer); forged.setStage("WON");
        long originalCount = fixture.scalar("SELECT COUNT(*) FROM crm_opportunity WHERE customer_id=?", customer.getCustomerId());
        fails(IllegalArgumentException.class, () -> service.createOpportunity(forged), "H3 creation cannot skip into won");
        equal(originalCount, fixture.scalar("SELECT COUNT(*) FROM crm_opportunity WHERE customer_id=?", customer.getCustomerId()), "invalid creation rolls back row");
        CrmOpportunity opportunity = input(customer);
        opportunity.setOpportunityId(1L); opportunity.setTenantId(100001L); opportunity.setDeleted(1); opportunity.setVersion(999);
        opportunity.setCreateBy("forged-actor"); opportunity.setCreateTime(LocalDateTime.now().minusYears(10));
        opportunity.setCustomerName("forged-customer"); opportunity.setOwnerName("forged-owner"); opportunity.setDeptId(99999L);
        opportunity.setLastStage("WON"); opportunity.setStageChangedTime(LocalDateTime.now().minusYears(1));
        opportunity.setWeightedAmount(BigDecimal.ONE); opportunity.setTeamVersion(99); service.createOpportunity(opportunity);
        check(opportunity.getOpportunityId() != 1L, "server allocates creation id"); equal(100000L, opportunity.getTenantId(), "client cannot select creation tenant");
        equal(0, opportunity.getVersion(), "creation version server-owned"); equal(0, opportunity.getDeleted(), "creation deletion flag server-owned");
        equal("batch-e-check", opportunity.getCreateBy(), "creation actor is trusted context");
        equal(customer.getCustomerName(), opportunity.getCustomerName(), "customer name comes from authorized customer");
        equal("CRM user 1", opportunity.getOwnerName(), "owner name comes from HR lookup"); equal(100L, opportunity.getDeptId(), "department comes from HR lookup");
        equal("LEAD", opportunity.getStage(), "server chooses initial stage"); equal(null, opportunity.getLastStage(), "creation ignores previous stage injection");
        equal(1, opportunity.getTeamVersion(), "creation ignores team version injection and creates default owner team"); decimal("42000", opportunity.getWeightedAmount(), "creation calculates percentage-based amount");
        equal(1L, historyCount(opportunity.getOpportunityId()), "creation and initial history both committed");
        CrmOpportunity update = read(opportunity.getOpportunityId()); update.setStage("QUALIFIED"); update.setWinRate(new BigDecimal("99"));
        update.setDeleted(1); update.setCreateBy("forged-update"); update.setTeamVersion(99); update.setTenantId(100001L);
        service.updateOpportunity(update);
        CrmOpportunity actual = read(opportunity.getOpportunityId());
        equal("QUALIFIED", actual.getStage(), "generic update uses stage transition service"); equal("LEAD", actual.getLastStage(), "generic update records previous stage");
        decimal("30", actual.getWinRate(), "generic stage update applies stage rate"); decimal("126000", actual.getWeightedAmount(), "generic stage update persists new forecast");
        equal(0, actual.getDeleted(), "update cannot inject deletion"); equal("batch-e-check", actual.getCreateBy(), "update cannot rewrite creation audit");
        equal(1, actual.getTeamVersion(), "generic update cannot inject team version"); equal(2L, historyCount(actual.getOpportunityId()), "one history per committed stage change");
        fails(IllegalArgumentException.class, () -> service.updateOpportunity(update), "old update version is rejected");
        fails(IllegalArgumentException.class, () -> service.updateStage(actual.getOpportunityId(), "WON", actual.getVersion()), "edit permission cannot call win through stage route");
        fails(IllegalArgumentException.class, () -> service.updateStage(actual.getOpportunityId(), "LEAD", actual.getVersion()), "independent stage route cannot downgrade");
        actual.setSource(null); actual.setRemark(null); actual.setExpectedSignDate(null); actual.setCampaignId(null); actual.setCompetitorId(null);
        actual.setWinRate(new BigDecimal("65")); service.updateOpportunity(actual);
        CrmOpportunity cleared = read(actual.getOpportunityId()); equal(null, cleared.getExpectedSignDate(), "explicit null clears optional date in real SQL");
        decimal("273000", cleared.getWeightedAmount(), "same-stage custom percent forecast persists"); equal(2L, historyCount(actual.getOpportunityId()), "same-stage edit creates no fake interval");
        identity(100001L, 1L, 0);
        fails(IllegalArgumentException.class, () -> service.getAccessibleOpportunity(opportunity.getOpportunityId()), "opportunity detail blocks foreign tenant");
        fails(IllegalArgumentException.class, () -> items.list(opportunity.getOpportunityId()), "products block foreign tenant"); identity();
        identity(100000L, 99999L, 4);
        fails(IllegalArgumentException.class, () -> service.updateStage(opportunity.getOpportunityId(), "PROPOSAL", cleared.getVersion()), "locking query applies restricted customer data scope"); identity();
        identity(100000L, 99999L, 0);
        fails(ServiceException.class, () -> service.updateStage(opportunity.getOpportunityId(), "PROPOSAL", cleared.getVersion()), "all-data reading does not bypass opportunity ownership"); identity();
    }

    private void products() throws Exception {
        CrmOpportunity opportunity = create(fixture.customer("h3-products")); Long id = opportunity.getOpportunityId();
        CrmOpportunityItemsRequest first = new CrmOpportunityItemsRequest(opportunity.getVersion(), List.of(line("1.2345", "12.3456", "87.6543", "6.1250")));
        CrmOpportunityItemService.View saved = items.save(id, first);
        decimal("13.36", saved.subtotal(), "actual SQL product subtotal matches quotation rounding"); decimal("0.82", saved.taxAmount(), "actual SQL product tax matches quotation rounding");
        decimal("14.18", saved.totalAmount(), "UI total includes tax separately"); decimal("13.36", saved.expectedAmount(), "forecast uses untaxed quote total convention");
        decimal("1.34", saved.weightedAmount(), "product change recomputes forecast"); equal(1, saved.version(), "whole product save advances opportunity version");
        decimal("1.2345", items.list(id).items().get(0).getQuantity(), "quantity keeps four decimals in real storage");
        fails(IllegalArgumentException.class, () -> items.save(id, first), "stale product group cannot overwrite current lines");
        CrmOpportunity request = read(id); request.setExpectedAmount(new BigDecimal("999999")); service.updateOpportunity(request);
        decimal("13.36", read(id).getExpectedAmount(), "generic update cannot replace server product subtotal");
        int version = read(id).getVersion();
        fails(IllegalArgumentException.class, () -> items.save(id, new CrmOpportunityItemsRequest(version, List.of(line("1", "1000000000000", "100", "0")))), "overflow rejects complete product update");
        equal(version, read(id).getVersion(), "failed product change rolls back parent version"); equal(1, items.list(id).items().size(), "failed product change preserves original lines");
        CrmProduct foreign = new CrmProduct(); foreign.setProductNo("H3-FOREIGN"); foreign.setProductName("Foreign product"); foreign.setCurrency("CNY"); foreign.setStatus("ACTIVE");
        identity(100001L, 1L, 0); CrmRecordSupport.create(foreign, "productId"); fixture.mapper(CrmProductMapper.class).insert(foreign); identity();
        CrmOpportunityItemsRequest.Item stolen = new CrmOpportunityItemsRequest.Item(foreign.getProductId(), null, "forged-name", null, null, BigDecimal.ONE, BigDecimal.TEN, null, null, null);
        fails(IllegalArgumentException.class, () -> items.save(id, new CrmOpportunityItemsRequest(version, List.of(stolen))), "catalogue product cannot cross tenant");
        Callable<Integer> firstSave = () -> saveCompeting(id, version, "2"); Callable<Integer> secondSave = () -> saveCompeting(id, version, "3");
        int[] winners = fixture.parallel(firstSave, secondSave); equal(1, winners[0] + winners[1], "concurrent product replacement has exactly one winner");
        equal(1, items.list(id).items().size(), "concurrent replacement leaves one current group");
        CrmOpportunityItemService.View current = items.list(id); decimal(current.items().get(0).getLineAmount().toPlainString(), read(id).getExpectedAmount(), "committed total belongs to the winning group");
        CrmOpportunityItemService.View empty = items.save(id, new CrmOpportunityItemsRequest(current.version(), List.of())); equal(0, empty.items().size(), "empty replacement removes current product group");
        CrmOpportunity manual = read(id); manual.setExpectedAmount(new BigDecimal("100.01")); service.updateOpportunity(manual); decimal("100.01", read(id).getExpectedAmount(), "without items manual forecast is editable");
        CrmOpportunity won = writes.win(id, null, read(id).getVersion());
        fails(IllegalArgumentException.class, () -> items.save(id, new CrmOpportunityItemsRequest(won.getVersion(), List.of(line("1", "1", "100", "0")))), "terminal product amount cannot be rewritten");
        won.setExpectedAmount(BigDecimal.ONE);
        fails(IllegalArgumentException.class, () -> service.updateOpportunity(won), "terminal generic edit cannot rewrite financial basis");
    }

    private int saveCompeting(Long id, int version, String quantity) {
        try { items.save(id, new CrmOpportunityItemsRequest(version, List.of(line(quantity, "10", "100", "0")))); return 1; }
        catch (IllegalArgumentException conflict) { return 0; }
    }

    static CrmOpportunityItemsRequest.Item line(String quantity, String price, String discount, String tax) {
        return new CrmOpportunityItemsRequest.Item(null, "H3-PRODUCT", "商机产品验收", "标准规格", "套", new BigDecimal(quantity), new BigDecimal(price), new BigDecimal(discount), new BigDecimal(tax), null);
    }

    private void rulesAndApproval() {
        CrmCustomer customer = fixture.customer("h3-requirements"); CrmOpportunity opportunity = create(customer); Long id = opportunity.getOpportunityId();
        CrmSalesStage qualification = stage("QUALIFIED");
        CrmSalesStage required = copy(qualification); required.setRequiredFields(List.of("contactId", "expectedSignDate")); required.setRequiredActivityFlag(1);
        save(required);
        fails(IllegalArgumentException.class, () -> service.updateStage(id, "QUALIFIED", opportunity.getVersion()), "real advance enforces target required fields");
        CrmContact contact = new CrmContact(); contact.setCustomerId(customer.getCustomerId()); contact.setContactName("阶段联系人"); contact.setStatus("ACTIVE");
        CrmRecordSupport.create(contact, "contactId"); fixture.mapper(CrmContactMapper.class).insert(contact);
        CrmOpportunity update = read(id); update.setContactId(contact.getContactId()); service.updateOpportunity(update);
        fails(IllegalArgumentException.class, () -> service.updateStage(id, "QUALIFIED", read(id).getVersion()), "real advance requires valid opportunity activity");
        CrmFollowUp follow = new CrmFollowUp(); follow.setCustomerId(customer.getCustomerId()); follow.setOpportunityId(id); follow.setContent("有效需求确认记录");
        follow.setFollowUpTime(LocalDateTime.now().minusMinutes(1)); follow.setOwnerId(1L); follow.setFollowUpType("CALL");
        CrmRecordSupport.create(follow, "followUpId"); fixture.mapper(CrmFollowUpMapper.class).insert(follow);
        contact.setStatus("DISABLED"); fixture.mapper(CrmContactMapper.class).updateById(contact);
        fails(IllegalArgumentException.class, () -> service.updateStage(id, "QUALIFIED", read(id).getVersion()), "advance rechecks contact activation after original save");
        fails(IllegalArgumentException.class, () -> writes.win(id, null, read(id).getVersion()), "win rechecks contact activation after original save");
        contact.setStatus("ACTIVE"); contact.setCustomerId(fixture.customer("h3-moved-contact").getCustomerId()); fixture.mapper(CrmContactMapper.class).updateById(contact);
        fails(IllegalArgumentException.class, () -> service.updateStage(id, "QUALIFIED", read(id).getVersion()), "advance rejects a contact subsequently moved to another customer");
        fails(IllegalArgumentException.class, () -> writes.win(id, null, read(id).getVersion()), "win rejects a contact subsequently moved to another customer");
        equal("LEAD", read(id).getStage(), "invalid contact leaves stage unchanged");
        equal(1L, historyCount(id), "invalid contact creates no stage history");
        contact.setCustomerId(customer.getCustomerId()); fixture.mapper(CrmContactMapper.class).updateById(contact);
        service.updateStage(id, "QUALIFIED", read(id).getVersion()); equal("QUALIFIED", read(id).getStage(), "valid contact and actual follow-up permit entry");
        CrmOpportunity clear = read(id); clear.setContactId(null); service.updateOpportunity(clear); equal(null, read(id).getContactId(), "optional contact clears real storage");
        CrmSalesStage referenced = stage("QUALIFIED"); referenced.setStageCode("RENAMED");
        fails(IllegalArgumentException.class, () -> save(referenced), "referenced stage code cannot be renamed");
        CrmSalesStage restore = copy(qualification); restore.setVersion(stage("QUALIFIED").getVersion()); save(restore);
        CrmSalesStage overdue = stage("QUALIFIED"); overdue.setOverdueDays(5); save(overdue);
        CrmSalesStage clearThreshold = stage("QUALIFIED"); clearThreshold.setOverdueDays(null); save(clearThreshold);
        equal(null, stage("QUALIFIED").getOverdueDays(), "clearing overdue threshold writes SQL NULL");
        CrmOpportunityLossDTO.Reason primary = new CrmOpportunityLossDTO.Reason(); primary.setReasonId(1550L); primary.setIsPrimary(true);
        CrmApprovalServiceImpl approvals = fixture.bean(CrmApprovalServiceImpl.class);
        fails(IllegalArgumentException.class, () -> approvals.submitOpportunityDowngrade(id, "DOWNGRADE", "PROPOSAL", "invalid direction", null, read(id).getVersion()), "approval route cannot advance under downgrade action");
        fails(IllegalArgumentException.class, () -> approvals.submitOpportunityDowngrade(id, "DOWNGRADE", "LEAD", " ", null, read(id).getVersion()), "real downgrade requires meaningful reason");
        Long approvalId = approvals.submitOpportunityDowngrade(id, "CLOSE", null, null, List.of(primary), read(id).getVersion());
        CrmApproval approval = fixture.mapper(CrmApprovalMapper.class).selectById(approvalId);
        long beforeHistory = historyCount(id);
        CrmOpportunity newer = read(id); newer.setRemark("审批期间发生编辑"); service.updateOpportunity(newer);
        fails(IllegalArgumentException.class, () -> fixture.bean(CrmOpportunityDowngradeApprovalHandler.class).handleApproved(callback(approval)), "approved old version cannot overwrite intervening edit");
        equal("PENDING", fixture.mapper(CrmApprovalMapper.class).selectById(approvalId).getStatus(), "stale callback rolls back approval completion");
        equal(beforeHistory, historyCount(id), "stale callback rolls back stage history");
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_opportunity_lost_detail WHERE opportunity_id=?", id), "stale callback adds no loss details");
        fixture.bean(CrmOpportunityDowngradeApprovalHandler.class).handleRejected(callback(approval));
        Long validId = approvals.submitOpportunityDowngrade(id, "CLOSE", null, null, List.of(primary), read(id).getVersion());
        CrmApproval valid = fixture.mapper(CrmApprovalMapper.class).selectById(validId);
        fixture.bean(CrmOpportunityDowngradeApprovalHandler.class).handleApproved(callback(valid));
        fixture.bean(CrmOpportunityDowngradeApprovalHandler.class).handleApproved(callback(valid));
        equal("LOST", read(id).getStage(), "structured reasons permit legitimate close without optional free-text comment");
        decimal("0", read(id).getWeightedAmount(), "approved loss clears forecast using shared rules");
        equal(beforeHistory + 1, historyCount(id), "duplicate approved callback creates only one loss interval");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_opportunity_stage_history WHERE opportunity_id=? AND operator_id=1 AND operation_key=?", id, "CRM_APPROVAL:" + validId), "approval history records actual applicant and unique source");
    }

    private void concurrency() throws Exception {
        CrmOpportunity opportunity = create(fixture.customer("h3-lock")); Long id = opportunity.getOpportunityId();
        CountDownLatch locked = new CountDownLatch(1); CountDownLatch updateStarted = new CountDownLatch(1); AtomicBoolean updated = new AtomicBoolean();
        Callable<Integer> holder = () -> {
            identity(100000L, 1L, 4);
            return new TransactionTemplate(fixture.manager).execute(status -> {
                fixture.bean(CrmOpportunityAccessService.class).lock(id); locked.countDown();
                try {
                    check(updateStarted.await(5, TimeUnit.SECONDS), "competing SQL update started");
                    long waiting = 0;
                    for (int attempt = 0; attempt < 40 && waiting == 0 && !updated.get(); attempt++) {
                        waiting = fixture.scalar("SELECT COUNT(*) FROM performance_schema.data_lock_waits");
                        if (waiting == 0) Thread.sleep(50);
                    }
                    check(waiting > 0, "data-scope wrapped locking read holds an actual InnoDB row lock");
                    equal(false, updated.get(), "competing update waits until transaction commits");
                    return 1;
                } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
            });
        };
        Callable<Integer> contender = () -> {
            check(locked.await(5, TimeUnit.SECONDS), "locking read reached"); updateStarted.countDown();
            fixture.jdbc.update("UPDATE crm_opportunity SET remark='lock-probe' WHERE opportunity_id=?", id); updated.set(true); return 1;
        };
        int[] lockedResult = fixture.parallel(holder, contender); equal(2, lockedResult[0] + lockedResult[1], "lock is released after successful transaction");
        int version = read(id).getVersion();
        Callable<Integer> advance = () -> {
            try { service.updateStage(id, "QUALIFIED", version); return 1; }
            catch (IllegalArgumentException conflict) { return 0; }
        };
        int[] result = fixture.parallel(advance, advance); equal(1, result[0] + result[1], "concurrent same-version transitions have one winner");
        equal(2L, historyCount(id), "concurrent transitions produce one entry and one exit only");
    }

    static ApprovalResultDTO callback(CrmApproval approval) {
        ApprovalResultDTO result = new ApprovalResultDTO(); result.setBusinessId(approval.getApprovalId()); result.setTenantId(100000L);
        result.setBusinessType(approval.getBusinessType()); result.setProcessInstanceId(approval.getInstanceId()); result.setApprovalResult("APPROVED"); return result;
    }

    private CrmSalesStage stage(String code) { return catalog.list().stream().filter(stage -> code.equals(stage.getStageCode())).findFirst().orElseThrow(); }
    private CrmSalesStage copy(CrmSalesStage original) { CrmSalesStage copied = new CrmSalesStage(); BeanUtils.copyProperties(original, copied); return copied; }
    private void save(CrmSalesStage stage) { catalog.save(new CrmSalesStageRequest(stage.getStageId(), stage.getVersion(), stage.getStageCode(), stage.getStageName(), stage.getSortNo(), stage.getDefaultWinRate(), stage.getAllowSkipFlag(), stage.getRequiredFields(), stage.getRequiredActivityFlag(), stage.getOverdueDays(), stage.getIsWonFlag(), stage.getIsLostFlag(), stage.getStatus())); }
}
