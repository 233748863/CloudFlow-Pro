package com.cloudflow.crm.service.impl;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.controller.CrmOpportunityDetailController;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCampaign;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmDealAllocation;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.dto.CrmOpportunityLossDTO;
import com.cloudflow.crm.domain.dto.CrmOpportunityReopenRequest;
import com.cloudflow.crm.mapper.CrmCampaignMapper;
import com.cloudflow.crm.mapper.CrmDealAllocationMapper;
import com.cloudflow.crm.mapper.CrmDealEventMapper;
import com.cloudflow.crm.mapper.CrmLeadMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.service.deal.CrmOpportunityTeamService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityReopenService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityWriteService;
import com.cloudflow.crm.service.opportunity.CrmStageAnalysisService;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.springframework.transaction.support.TransactionTemplate;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmOpportunityReopenDatabaseChecks {
    final CrmOperationsDatabaseChecks fixture;
    final CrmOpportunityReopenService reopening;
    final CrmOpportunityWriteService writes;

    CrmOpportunityReopenDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; reopening = fixture.bean(CrmOpportunityReopenService.class); writes = fixture.bean(CrmOpportunityWriteService.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount(); identity();
        CrmOpportunityReopenDatabaseChecks checks = new CrmOpportunityReopenDatabaseChecks(fixture);
        checks.requestBoundary(); checks.winning(); checks.lost(); checks.scopeAndVersions(); checks.corruptSources(); checks.campaignRollback(); checks.competition();
        System.out.println("H3_OPPORTUNITY_REOPEN_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; concurrency_groups=4; mysql=true; actual_row_locks=true; original_allocations_preserved=true; interface_doubles=HR_OA_WORKFLOW; real_http=false; production_modified=false");
    }

    CrmOpportunity create(CrmCustomer customer, CrmCampaign campaign) {
        CrmOpportunity input = new CrmOpportunity(); input.setCustomerId(customer.getCustomerId()); input.setOpportunityName("终态恢复 " + UUID.randomUUID());
        input.setOwnerId(1L); input.setExpectedAmount(new BigDecimal("100.01")); input.setExpectedSignDate(LocalDate.now().plusDays(7));
        input.setCampaignId(campaign == null ? null : campaign.getCampaignId());
        fixture.bean(CrmOpportunityServiceImpl.class).createOpportunity(input); return read(input.getOpportunityId());
    }

    CrmOpportunity won(String name) { return win(create(fixture.customer(name), null)); }
    CrmOpportunity win(CrmOpportunity opportunity) { return writes.win(opportunity.getOpportunityId(), null, read(opportunity.getOpportunityId()).getVersion()); }
    CrmOpportunity read(Long id) { return fixture.mapper(CrmOpportunityMapper.class).selectById(id); }
    CrmOpportunityReopenRequest request(CrmOpportunity opportunity) { return new CrmOpportunityReopenRequest(read(opportunity.getOpportunityId()).getVersion(), "QUALIFIED", "客户重新确认需求，继续推进"); }
    long histories(Long id) { return fixture.scalar("SELECT COUNT(*) FROM crm_opportunity_stage_history WHERE tenant_id=100000 AND opportunity_id=?", id); }
    BigDecimal balance(Long id) { return fixture.jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=?", BigDecimal.class, id); }
    List<CrmDealAllocation> allocations(Long id) { return fixture.mapper(CrmDealAllocationMapper.class).selectList(new LambdaQueryWrapper<CrmDealAllocation>().eq(CrmDealAllocation::getEventId, id).orderByAsc(CrmDealAllocation::getSalesUserId)); }

    private void requestBoundary() throws Exception {
        CrmOpportunityReopenRequest input = fixture.json.readValue("{\"version\":2,\"targetStage\":\"QUALIFIED\",\"reason\":\"重新评估\"}", CrmOpportunityReopenRequest.class);
        equal(2, input.version(), "Jackson accepts the three-field restore request");
        for (String field : List.of("ownerId", "tenantId", "status", "financialProof", "reversalEventId", "originalEventId", "amount")) {
            fails(IllegalArgumentException.class, () -> {
                try { fixture.json.readValue("{\"version\":2,\"targetStage\":\"QUALIFIED\",\"reason\":\"重新评估\",\"" + field + "\":1}", CrmOpportunityReopenRequest.class); }
                catch (com.fasterxml.jackson.core.JsonProcessingException rejected) { throw new IllegalArgumentException(rejected); }
            }, "Jackson rejects forged restore property " + field);
        }
        equal(List.of("crm:opportunity:stage-reopen"), List.of(CrmOpportunityDetailController.class.getMethod("inspectReopen", Long.class).getAnnotation(SaCheckPermission.class).value()), "inspection requires exact restore permission");
        equal(List.of("crm:opportunity:stage-reopen"), List.of(CrmOpportunityDetailController.class.getMethod("restore", Long.class, CrmOpportunityReopenRequest.class).getAnnotation(SaCheckPermission.class).value()), "mutation requires exact restore permission");
    }

    private void team(CrmOpportunity opportunity, String ownerShare) {
        CrmOpportunity current = read(opportunity.getOpportunityId());
        fixture.bean(CrmOpportunityTeamService.class).save(current.getOpportunityId(), new CrmDealTeamRequest(current.getTeamVersion(), current.getVersion(),
                List.of(new CrmDealTeamRequest.Member(1L, "OWNER", new BigDecimal(ownerShare)),
                        new CrmDealTeamRequest.Member(2L, "CO_SELLER", BigDecimal.ONE.subtract(new BigDecimal(ownerShare)))), "调整现有团队，不覆盖原赢单"));
    }

    private void winning() throws Exception {
        CrmOpportunity opportunity = create(fixture.customer("reopen frozen team"), null); team(opportunity, "0.6000"); opportunity = win(opportunity);
        Long id = opportunity.getOpportunityId(); CrmOpportunityReopenService.View before = reopening.inspect(id);
        check(before.allowed(), "valid won source is restorable"); equal(2, before.shares().size(), "inspect shows frozen members");
        decimal("60.01", before.shares().get(0).amount(), "owner has original cent remainder");
        CrmDealEvent original = fixture.mapper(CrmDealEventMapper.class).selectById(before.winningEventId());
        String originalEvent = fixture.json.writeValueAsString(original); String originalShares = fixture.json.writeValueAsString(allocations(original.getEventId()));
        team(opportunity, "0.2000"); CrmOpportunity current = read(id); CrmOpportunityReopenService.View changed = reopening.inspect(id);
        equal(before.winningEventId(), changed.winningEventId(), "team edit does not change identity of winning source");
        equal(before.teamVersion(), changed.teamVersion(), "inspect preserves original winning team version");
        decimal("60.01", changed.shares().get(0).amount(), "restore preview ignores latest team percentages");
        String exposed = fixture.json.writeValueAsString(changed);
        check(!exposed.contains("commission") && !exposed.contains("sourceSnapshot") && !exposed.contains("employeeId"), "restore preview excludes salary and internal sources");
        long oldHistory = histories(id); long contracts = fixture.scalar("SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND source_type='CRM_OPPORTUNITY' AND source_id=?", id);
        long wonBefore = stageCount("wonCount"); CrmOpportunityReopenRequest input = request(current);
        identity(100000L, 8L, 0);
        CrmOpportunityReopenService.Receipt receipt;
        try { receipt = reopening.restore(id, input); } finally { identity(); }
        equal(8L, receipt.operatorId(), "in-scope manager can restore without owning the opportunity");
        equal(input.version(), receipt.originalVersion(), "receipt preserves original business version"); equal(input.version() + 1, receipt.version(), "restore increments business version once");
        equal("OPEN", read(id).getStatus(), "restored opportunity is open"); equal("QUALIFIED", read(id).getStage(), "restore enters selected active stage");
        equal("WON", read(id).getLastStage(), "previous terminal stage remains visible"); decimal("30", read(id).getWinRate(), "restore applies target default win percentage");
        decimal("30.00", read(id).getWeightedAmount(), "restore recomputes weighted forecast"); equal(current.getTeamVersion(), read(id).getTeamVersion(), "current team remains unchanged");
        equal(oldHistory + 1, histories(id), "restore appends exactly one history"); equal(receipt, reopening.inspect(id).lastReopen(), "read-only recovery returns exact committed receipt");
        decimal("0", balance(id), "restored winning amount is fully reversed");
        equal(wonBefore - 1, stageCount("wonCount"), "cohort won count removes a reopened terminal opportunity");
        List<CrmDealAllocation> reversed = allocations(receipt.reversalEventId()); decimal("-60.01", reversed.get(0).getAllocatedAmount(), "reversal uses original 60.01 rather than current 20 percent");
        decimal("-40.00", reversed.get(1).getAllocatedAmount(), "reversal preserves original collaborator cents");
        equal(allocations(original.getEventId()).get(0).getAllocationId(), reversed.get(0).getReversalOfId(), "allocation reversal references its original row");
        equal(originalEvent, fixture.json.writeValueAsString(fixture.mapper(CrmDealEventMapper.class).selectById(original.getEventId())), "original winning event remains byte-equivalent");
        equal(originalShares, fixture.json.writeValueAsString(allocations(original.getEventId())), "original allocations remain byte-equivalent");
        equal(contracts, fixture.scalar("SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND source_type='CRM_OPPORTUNITY' AND source_id=?", id), "restore creates no contract");
        fails(IllegalArgumentException.class, () -> reopening.restore(id, input), "same-version resubmission cannot restore twice");
        win(read(id)); CrmOpportunityReopenService.View again = reopening.inspect(id); check(again.allowed(), "second real win can be restored independently");
        check(!again.winningEventId().equals(original.getEventId()), "second win has a different source"); decimal("20.00", again.shares().get(0).amount(), "second win uses newly frozen current percentages");
        equal(wonBefore, stageCount("wonCount"), "winning again counts once, not the two historic wins");
        reopening.restore(id, request(read(id))); decimal("0", balance(id), "two independent restore cycles net to zero");
        equal(wonBefore - 1, stageCount("wonCount"), "second restore removes current win again");
    }

    private long stageCount(String metric) {
        CrmStageAnalysisService.Stage lead = fixture.bean(CrmStageAnalysisService.class).report(LocalDate.now().minusDays(1), LocalDate.now(), "CNY", null).stages().stream()
                .filter(stage -> "LEAD".equals(stage.stage())).findFirst().orElseThrow();
        return "wonCount".equals(metric) ? lead.wonCount() : lead.lostCount();
    }

    private void lost() throws Exception {
        CrmOpportunity opportunity = create(fixture.customer("reopen loss reasons"), null);
        CrmOpportunityLossDTO.Reason reason = new CrmOpportunityLossDTO.Reason(); reason.setReasonId(fixture.scalar("SELECT MIN(reason_id) FROM crm_lost_reason WHERE tenant_id=100000 AND deleted=0 AND status='ACTIVE'"));
        reason.setIsPrimary(true); reason.setAmountLost(opportunity.getExpectedAmount()); reason.setRemark("原丢单事实保留");
        CrmApproval approval = new CrmApproval(); approval.setApprovalId(880001L); approval.setTenantId(100000L); approval.setApplicantId(1L);
        approval.setBusinessType(CrmBusinessTypes.CRM_OPPORTUNITY_DOWNGRADE); approval.setBusinessRefId(opportunity.getOpportunityId()); approval.setStatus("APPROVED");
        CrmOpportunity lost = writes.applyApproved(approval, opportunity.getVersion(), opportunity.getStage(), "LOST", "原丢单说明", List.of(reason));
        long lostBefore = stageCount("lostCount"); CrmOpportunityReopenService.Receipt receipt = reopening.restore(lost.getOpportunityId(), request(lost));
        equal(null, receipt.originalEventId(), "lost restore invents no winning source"); equal(null, receipt.reversalEventId(), "lost restore invents no reversal");
        equal(null, read(lost.getOpportunityId()).getLostReason(), "current lost explanation clears on restore");
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_opportunity_lost_detail WHERE opportunity_id=? AND tenant_id=100000", lost.getOpportunityId()), "current lost detail clears atomically");
        JsonNode snapshot = fixture.json.readTree(fixture.jdbc.queryForObject("SELECT snapshot FROM crm_opportunity_stage_history WHERE history_id=?", String.class, receipt.historyId())).path("reopen");
        equal("原丢单说明", snapshot.path("originalLostReason").asText(), "original explanation is preserved in history");
        equal(1, snapshot.path("originalLostDetails").size(), "original structured reasons are preserved in history");
        equal(reason.getReasonId().longValue(), snapshot.path("originalLostDetails").get(0).path("lostReasonId").asLong(), "history identifies original lost reason");
        equal(lostBefore - 1, stageCount("lostCount"), "cohort lost count removes reopened loss");
    }

    private void scopeAndVersions() {
        CrmOpportunity opportunity = won("restore validation"); Long id = opportunity.getOpportunityId(); CrmOpportunityReopenRequest valid = request(opportunity);
        for (CrmOpportunityReopenRequest invalid : List.of(new CrmOpportunityReopenRequest(null, "QUALIFIED", "原因"), new CrmOpportunityReopenRequest(-1, "QUALIFIED", "原因"),
                new CrmOpportunityReopenRequest(valid.version() - 1, "QUALIFIED", "原因"), new CrmOpportunityReopenRequest(valid.version(), "QUALIFIED", " "),
                new CrmOpportunityReopenRequest(valid.version(), "QUALIFIED", "长".repeat(1001)), new CrmOpportunityReopenRequest(valid.version(), "WON", "原因"),
                new CrmOpportunityReopenRequest(valid.version(), "LOST", "原因"), new CrmOpportunityReopenRequest(valid.version(), "NONEXISTENT", "原因")))
            fails(IllegalArgumentException.class, () -> reopening.restore(id, invalid), "invalid restore request cannot mutate facts");
        long history = histories(id); decimal("100.01", balance(id), "invalid requests leave winning balance untouched");
        identity(100001L, 1L, 0);
        try { fails(IllegalArgumentException.class, () -> reopening.inspect(id), "foreign tenant cannot inspect restore evidence"); fails(IllegalArgumentException.class, () -> reopening.restore(id, valid), "foreign tenant cannot restore"); }
        finally { identity(); }
        identity(100000L, 880099L, 4);
        try { fails(IllegalArgumentException.class, () -> reopening.inspect(id), "restricted user cannot inspect another customer's evidence"); fails(IllegalArgumentException.class, () -> reopening.restore(id, valid), "restricted user cannot restore another customer's opportunity"); }
        finally { identity(); }
        fixture.jdbc.update("UPDATE crm_sales_stage SET required_fields=JSON_ARRAY('remark') WHERE tenant_id=100000 AND stage_code='QUALIFIED'");
        try { fails(IllegalArgumentException.class, () -> reopening.restore(id, valid), "restore enforces target required fields"); }
        finally { fixture.jdbc.update("UPDATE crm_sales_stage SET required_fields=JSON_ARRAY() WHERE tenant_id=100000 AND stage_code='QUALIFIED'"); }
        fixture.jdbc.update("UPDATE crm_sales_stage SET required_activity_flag=1 WHERE tenant_id=100000 AND stage_code='QUALIFIED'");
        try { fails(IllegalArgumentException.class, () -> reopening.restore(id, valid), "restore enforces target activity requirements"); }
        finally { fixture.jdbc.update("UPDATE crm_sales_stage SET required_activity_flag=0 WHERE tenant_id=100000 AND stage_code='QUALIFIED'"); }
        fixture.jdbc.update("UPDATE crm_sales_stage SET status='DISABLED' WHERE tenant_id=100000 AND stage_code='QUALIFIED'");
        try { fails(IllegalArgumentException.class, () -> reopening.restore(id, valid), "restore rejects a disabled target"); }
        finally { fixture.jdbc.update("UPDATE crm_sales_stage SET status='ACTIVE' WHERE tenant_id=100000 AND stage_code='QUALIFIED'"); }
        equal(history, histories(id), "rejected requests create no history");
        fixture.jdbc.update("UPDATE crm_opportunity SET version=? WHERE opportunity_id=?", Integer.MAX_VALUE, id);
        fails(IllegalArgumentException.class, () -> reopening.restore(id, new CrmOpportunityReopenRequest(Integer.MAX_VALUE, "QUALIFIED", "原因")), "version overflow is refused");
    }

    private void corruptSources() {
        CrmOpportunity legacy = fixture.opportunity(fixture.customer("missing winning source"), null, "WON");
        fixture.jdbc.update("UPDATE crm_opportunity SET status='CLOSED' WHERE opportunity_id=?", legacy.getOpportunityId());
        check(!reopening.inspect(legacy.getOpportunityId()).allowed(), "legacy won state without frozen source is explicitly blocked");
        CrmOpportunity damaged = won("damaged frozen allocations"); CrmOpportunityReopenService.View view = reopening.inspect(damaged.getOpportunityId());
        fixture.jdbc.update("UPDATE crm_deal_allocation SET allocated_amount=allocated_amount-0.01 WHERE event_id=?", view.winningEventId());
        check(!reopening.inspect(damaged.getOpportunityId()).allowed(), "damaged original cent allocation is blocked");
        fails(IllegalArgumentException.class, () -> reopening.restore(damaged.getOpportunityId(), request(damaged)), "damaged allocation cannot produce a new reversal");
        CrmOpportunity forged = won("damaged winning evidence"); CrmOpportunityReopenService.View original = reopening.inspect(forged.getOpportunityId());
        fixture.jdbc.update("UPDATE crm_deal_event SET source_snapshot=JSON_SET(source_snapshot,'$.sourceVersion',999999) WHERE event_id=?", original.winningEventId());
        check(!reopening.inspect(forged.getOpportunityId()).allowed(), "source version must match actual winning history");
    }

    CrmOpportunity attributed(CrmCampaign campaign, String label) {
        CrmCustomer customer = fixture.customer(label);
        CrmLead lead = new CrmLead(); lead.setLeadNo("REOPEN-" + UUID.randomUUID()); lead.setLeadName(label); lead.setStatus("CONVERTED");
        lead.setCampaignId(campaign.getCampaignId()); lead.setConvertedCustomerId(customer.getCustomerId()); lead.setOwnerId(1L); lead.setDeptId(100L);
        CrmRecordSupport.create(lead, "leadId"); fixture.mapper(CrmLeadMapper.class).insert(lead);
        return create(customer, campaign);
    }

    private void campaignRollback() {
        CrmCampaign campaign = fixture.campaign("reopen rollback"); CrmOpportunity opportunity = win(attributed(campaign, "reopen rollback")); Long id = opportunity.getOpportunityId();
        equal(1, fixture.mapper(CrmCampaignMapper.class).selectById(campaign.getCampaignId()).getWonOpportunityCount(), "win updates campaign count in the same transaction");
        long history = histories(id); CrmOpportunityReopenRequest input = request(opportunity);
        fixture.jdbc.update("UPDATE crm_campaign SET end_date=NULL WHERE campaign_id=?", campaign.getCampaignId());
        try { fails(IllegalArgumentException.class, () -> reopening.restore(id, input), "late campaign validation fails after attempted stage and ledger writes"); }
        finally { fixture.jdbc.update("UPDATE crm_campaign SET end_date=? WHERE campaign_id=?", campaign.getEndDate(), campaign.getCampaignId()); }
        equal("WON", read(id).getStage(), "late failure rolls back business stage"); equal(input.version(), read(id).getVersion(), "late failure rolls back business version");
        decimal("100.01", balance(id), "late failure rolls back reversal facts"); equal(history, histories(id), "late failure rolls back stage history");
        equal(null, reopening.inspect(id).lastReopen(), "failed transaction publishes no recovery receipt");
        reopening.restore(id, input); equal(0, fixture.mapper(CrmCampaignMapper.class).selectById(campaign.getCampaignId()).getWonOpportunityCount(), "successful restore removes campaign win immediately");
        fixture.bean(CrmCampaignRevenueService.class).recalculate(campaign.getCampaignId());
        equal(0, fixture.mapper(CrmCampaignMapper.class).selectById(campaign.getCampaignId()).getWonOpportunityCount(), "later attribution recalculation preserves restored count");
    }

    private void competition() throws Exception {
        CrmOpportunity opportunity = won("duplicate restore"); CrmOpportunityReopenRequest input = request(opportunity);
        Callable<Integer> restore = () -> { try { reopening.restore(opportunity.getOpportunityId(), input); return 1; } catch (IllegalArgumentException conflict) { return 0; } };
        int[] result = fixture.parallel(restore, restore); equal(1, result[0] + result[1], "same-version concurrent restores have one winner");
        decimal("0", balance(opportunity.getOpportunityId()), "competing restore reverses only once"); equal(3L, histories(opportunity.getOpportunityId()), "competing restore writes one additional history");
        CrmCampaign campaign = fixture.campaign("two simultaneous restores"); CrmOpportunity first = win(attributed(campaign, "first")); CrmOpportunity second = win(attributed(campaign, "second"));
        int[] restored = fixture.parallel(() -> { reopening.restore(first.getOpportunityId(), request(first)); return 1; }, () -> { reopening.restore(second.getOpportunityId(), request(second)); return 1; });
        equal(2, restored[0] + restored[1], "same-campaign restores both commit"); equal(0, fixture.mapper(CrmCampaignMapper.class).selectById(campaign.getCampaignId()).getWonOpportunityCount(), "serialized campaign count loses no decrement");
        CrmOpportunity terminal = win(attributed(campaign, "restore while win")); CrmOpportunity open = attributed(campaign, "win while restore");
        int[] opposite = fixture.parallel(() -> { reopening.restore(terminal.getOpportunityId(), request(terminal)); return 1; }, () -> { win(open); return 1; });
        equal(2, opposite[0] + opposite[1], "one win and another restore can both commit"); equal(1, fixture.mapper(CrmCampaignMapper.class).selectById(campaign.getCampaignId()).getWonOpportunityCount(), "opposite changes preserve exact current count");
        CountDownLatch locked = new CountDownLatch(1); CountDownLatch attempted = new CountDownLatch(1); CrmOpportunity blocked = won("customer association guard");
        TransactionTemplate transaction = new TransactionTemplate(fixture.manager);
        Callable<Integer> holder = () -> transaction.execute(status -> {
            reopening.inspect(blocked.getOpportunityId()); locked.countDown();
            try {
                check(attempted.await(5, TimeUnit.SECONDS), "customer association writer starts");
                long waiting = 0;
                for (int attempt = 0; attempt < 60 && waiting == 0; attempt++) { waiting = fixture.scalar("SELECT COUNT(*) FROM performance_schema.data_lock_waits"); if (waiting == 0) Thread.sleep(50); }
                check(waiting > 0, "actual customer row is locked while inspecting linked financial facts"); return 1;
            } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
        });
        Callable<Integer> contender = () -> { check(locked.await(5, TimeUnit.SECONDS), "inspection owns opportunity and customer"); attempted.countDown(); fixture.jdbc.update("UPDATE crm_customer SET remark='association-lock-probe' WHERE customer_id=?", blocked.getCustomerId()); return 1; };
        int[] lockProbe = fixture.parallel(holder, contender); equal(2, lockProbe[0] + lockProbe[1], "customer association writer resumes only after inspection releases row locks");
    }
}
