package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.CrmSalesStageRequest;
import com.cloudflow.crm.mapper.*;
import com.cloudflow.crm.service.opportunity.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmStageReportingDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private CrmStageReportingDatabaseChecks(CrmOperationsDatabaseChecks fixture) { this.fixture = fixture; }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount();
        CrmStageReportingDatabaseChecks checks = new CrmStageReportingDatabaseChecks(fixture); checks.analysis(); checks.reminders();
        System.out.println("H3_STAGE_REPORTING_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; cohort_distinct=true; loop_intervals_separate=true; real_outbox=true; obsolete_notice_rejected=true; production_modified=false");
    }

    private void analysis() throws Exception {
        LocalDate day = LocalDate.now();
        CrmCustomer customer = fixture.customer("h3-analysis"); customer.setOwnerId(97001L); fixture.mapper(CrmCustomerMapper.class).updateById(customer);
        CrmOpportunity loop = opportunity(customer, "QUALIFIED", "100", "30", day.minusDays(1).atTime(8, 0), 97001L);
        CrmOpportunity waiting = opportunity(customer, "LEAD", "200", "10", day.minusDays(4).atTime(9, 0), 97001L);
        CrmOpportunity lost = opportunity(customer, "LOST", "300", "0", day.minusDays(2).atTime(10, 0), 97001L);
        opportunity(customer, "LEAD", "50", "10", day.minusDays(3).atTime(9, 0), 97001L);
        history(loop, null, "LEAD", day.minusDays(4).atTime(8, 0), day.minusDays(4).atTime(8, 0), "CREATE");
        history(loop, "LEAD", "QUALIFIED", day.minusDays(4).atTime(8, 0), day.minusDays(3).atTime(8, 0), "FORWARD");
        history(loop, "QUALIFIED", "LEAD", day.minusDays(3).atTime(8, 0), day.minusDays(2).atTime(8, 0), "BACKWARD");
        history(loop, "LEAD", "QUALIFIED", day.minusDays(2).atTime(8, 0), day.minusDays(1).atTime(8, 0), "FORWARD");
        history(waiting, null, "LEAD", waiting.getStageChangedTime(), waiting.getStageChangedTime(), "CREATE");
        history(lost, null, "LEAD", day.minusDays(4).atTime(10, 0), day.minusDays(4).atTime(10, 0), "CREATE");
        history(lost, "LEAD", "LOST", day.minusDays(4).atTime(10, 0), lost.getStageChangedTime(), "LOST");
        CrmCustomer hidden = fixture.customer("h3-analysis-hidden");
        CrmOpportunity other = opportunity(hidden, "LEAD", "999999", "100", day.minusDays(4).atStartOfDay(), 1L);
        history(other, null, "LEAD", other.getStageChangedTime(), other.getStageChangedTime(), "CREATE");
        identity(100000L, 97001L, 4);
        CrmStageAnalysisService analysis = fixture.bean(CrmStageAnalysisService.class);
        CrmStageAnalysisService.Report report = analysis.report(day.minusDays(5), day, "CNY", null);
        CrmStageAnalysisService.Stage lead = stage(report, "LEAD"); CrmStageAnalysisService.Stage qualified = stage(report, "QUALIFIED");
        equal(3L, lead.cohortCount(), "returning opportunity is counted once in entry cohort");
        equal(1L, lead.convertedCount(), "multiple forward exits do not multiply converted opportunities");
        decimal("33.33", lead.conversionRate(), "conversion numerator and denominator produce exact percent");
        equal(0L, lead.wonCount(), "loss is not merged with won count"); equal(1L, lead.lostCount(), "later loss is counted separately in entry cohort");
        equal(3L, lead.completedCount(), "loop exits count separate completed intervals"); equal(345600L, lead.completedSeconds(), "completed intervals sum actual seconds");
        decimal("115200", lead.averageCompletedSeconds(), "averages use interval sum divided by complete intervals");
        equal(2L, lead.currentCount(), "current snapshot includes both open lead opportunities");
        decimal("25", lead.weightedForecast(), "forecast includes only visible current open opportunities");
        decimal("30", qualified.weightedForecast(), "next-stage forecast uses current percentage");
        equal(1L, lead.untrackedCount(), "unrecorded opening balance is explicitly identified");
        equal(2L, lead.incompleteCount(), "current intervals are not silently treated as completed");
        long incomplete = ChronoUnit.SECONDS.between(waiting.getStageChangedTime(), report.asOf())
                + ChronoUnit.SECONDS.between(day.minusDays(3).atTime(9, 0), report.asOf());
        equal(incomplete, lead.incompleteSeconds(), "ongoing intervals use report as-of time");
        equal(null, stage(report, "LOST").conversionRate(), "terminal stage has no synthetic conversion denominator");
        CrmStageAnalysisService.Report earlier = analysis.report(day.minusDays(10), day.minusDays(6), "CNY", null);
        equal(0L, stage(earlier, "LEAD").cohortCount(), "date range controls entry cohort independently of current snapshot");
        equal(null, stage(earlier, "LEAD").averageCompletedSeconds(), "empty completed sample has no fake zero average");
        equal(0L, analysis.report(day.minusDays(5), day, "CNY", 1L).stages().stream().mapToLong(CrmStageAnalysisService.Stage::currentCount).sum(), "owner filter cannot broaden data scope");
        fails(IllegalArgumentException.class, () -> analysis.report(day.minusDays(1), day, "USD", null), "forecast refuses unapproved currency conversion");
        fails(IllegalArgumentException.class, () -> analysis.report(day.minusDays(366), day, "CNY", null), "report range bounded to 366 inclusive days");
        fails(IllegalArgumentException.class, () -> analysis.report(day, day.plusDays(1), "CNY", null), "future observation range rejected");
        identity(100001L, 97001L, 4);
        equal(0L, analysis.report(day.minusDays(5), day, "CNY", null).stages().stream().mapToLong(CrmStageAnalysisService.Stage::cohortCount).sum(), "cohort and duration SQL cannot cross tenant");
        identity();
    }

    private void reminders() throws Exception {
        CrmSalesStage rule = rule("LEAD"); setThreshold(rule, 2);
        CrmCustomer customer = fixture.customer("h3-reminder");
        CrmOpportunity opportunity = opportunity(customer, "LEAD", "100", "10", LocalDateTime.now().withNano(0).minusDays(4), 1L);
        history(opportunity, null, "LEAD", opportunity.getStageChangedTime(), opportunity.getStageChangedTime(), "CREATE");
        CrmOpportunityReminderService reminders = fixture.bean(CrmOpportunityReminderService.class);
        int queued = reminders.dispatch(); check(queued >= 1, "due stage reminder writes reliable message event");
        List<OutboxEvent> events = events(opportunity.getOpportunityId()); equal(1, events.size(), "one outbox message for opportunity interval and threshold");
        BusinessEventEnvelope envelope = fixture.json.readValue(events.get(0).getPayloadJson(), BusinessEventEnvelope.class);
        MessageSendRequest request = fixture.json.readValue(envelope.getPayload(), MessageSendRequest.class);
        MessageSourceCheck check = new MessageSourceCheck(envelope.getEventId(), 98765L, request);
        equal(true, reminders.verify(check).allowed(), "unchanged stage source can be delivered");
        equal(envelope.getEventId(), request.getTraceId(), "trace identity is frozen before message dispatch fills its default");
        MessageReceiver expanded = MessageReceiver.ofUser(1L); expanded.setReceiverName("真实接收者名称");
        MessageSendRequest dispatched = request.toBuilder().receivers(List.of(expanded)).build();
        if (dispatched.getTraceId() == null || dispatched.getTraceId().isBlank()) dispatched.setTraceId(envelope.getEventId());
        equal(true, reminders.verify(new MessageSourceCheck(envelope.getEventId(), 98765L, dispatched)).allowed(), "auth trace default and resolved receiver name preserve frozen source");
        equal(false, reminders.verify(new MessageSourceCheck(envelope.getEventId(), 98765L, request.toBuilder().traceId("forged-trace").build())).allowed(), "unexpected trace identity cannot bypass frozen source");
        equal(false, reminders.verify(new MessageSourceCheck(envelope.getEventId(), 98765L, request.toBuilder().receivers(List.of(MessageReceiver.ofUser(2L))).build())).allowed(), "resolved display name does not permit replacing the recipient");
        reminders.dispatch(); equal(1, events(opportunity.getOpportunityId()).size(), "daily rerun does not enqueue duplicates");
        equal(4, fixture.mapper(CrmOpportunityMapper.class).selectById(opportunity.getOpportunityId()).getStageDurationDays(), "daily job refreshes complete-day cache");
        MessageSendRequest tampered = request.toBuilder().content("tampered body").build();
        equal(false, reminders.verify(new MessageSourceCheck(envelope.getEventId(), 98765L, tampered)).allowed(), "source guard validates frozen message digest");
        equal(false, reminders.verify(new MessageSourceCheck(UUID.randomUUID().toString(), 98765L, request)).allowed(), "unknown source event cannot fabricate reminder");
        fixture.jdbc.update("UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=1");
        try { equal(false, reminders.verify(check).allowed(), "disabled receiver invalidates queued notice"); }
        finally { fixture.jdbc.update("UPDATE sys_user SET status='0' WHERE tenant_id=100000 AND user_id=1"); }
        setThreshold(rule("LEAD"), null); equal(false, reminders.verify(check).allowed(), "cleared stage threshold invalidates pending notice");
        setThreshold(rule("LEAD"), 3); reminders.dispatch(); equal(2, events(opportunity.getOpportunityId()).size(), "changed threshold creates distinct canonical source");
        equal(false, reminders.verify(check).allowed(), "old threshold cannot be sent after configuration changes");
        OutboxEvent latest = events(opportunity.getOpportunityId()).get(1);
        BusinessEventEnvelope latestEnvelope = fixture.json.readValue(latest.getPayloadJson(), BusinessEventEnvelope.class);
        MessageSendRequest latestRequest = fixture.json.readValue(latestEnvelope.getPayload(), MessageSendRequest.class);
        MessageSourceCheck latestCheck = new MessageSourceCheck(latestEnvelope.getEventId(), 98766L, latestRequest);
        equal(true, reminders.verify(latestCheck).allowed(), "new threshold source matches active rule");
        CrmOpportunity current = fixture.mapper(CrmOpportunityMapper.class).selectById(opportunity.getOpportunityId());
        fixture.bean(CrmOpportunityServiceImpl.class).updateStage(current.getOpportunityId(), "QUALIFIED", current.getVersion());
        equal(false, reminders.verify(latestCheck).allowed(), "stage advance invalidates old queued reminder before transport");
        identity(100001L, 1L, 0);
        equal(false, reminders.verify(latestCheck).allowed(), "notice source rejects foreign tenant"); identity();
        setThreshold(rule("LEAD"), rule.getOverdueDays());
        PageResult<CrmOpportunityStageHistory> history = fixture.bean(CrmOpportunityStageService.class).history(opportunity.getOpportunityId(), new PageQuery());
        check(history.getRows().stream().anyMatch(row -> "QUALIFIED".equals(row.getToStage())), "authorized paged history returns committed advance");
    }

    private CrmOpportunity opportunity(CrmCustomer customer, String stage, String amount, String rate, LocalDateTime entered, Long ownerId) {
        CrmOpportunity opportunity = fixture.opportunity(customer, null, stage);
        opportunity.setOwnerId(ownerId); opportunity.setExpectedAmount(new BigDecimal(amount)); opportunity.setWinRate(new BigDecimal(rate));
        opportunity.setWeightedAmount(CrmSalesAmounts.weighted(opportunity.getExpectedAmount(), opportunity.getWinRate()));
        opportunity.setStageChangedTime(entered); opportunity.setStatus(List.of("WON", "LOST").contains(stage) ? "CLOSED" : "OPEN");
        fixture.mapper(CrmOpportunityMapper.class).updateById(opportunity); return opportunity;
    }

    private void history(CrmOpportunity opportunity, String from, String to, LocalDateTime entered, LocalDateTime changed, String direction) throws Exception {
        CrmOpportunityStageHistory history = new CrmOpportunityStageHistory(); history.setTenantId(opportunity.getTenantId()); history.setOpportunityId(opportunity.getOpportunityId());
        history.setFromStage(from); history.setToStage(to); history.setEnteredTime(entered); history.setChangedTime(changed);
        history.setDurationSeconds(ChronoUnit.SECONDS.between(entered, changed)); history.setOperationKey("H3_ANALYSIS_FIXTURE:" + UUID.randomUUID());
        history.setSnapshot(fixture.json.writeValueAsString(Map.of("direction", direction, "fixture", true)));
        history.setOperatorId(1L); history.setCreateBy("batch-e-check"); history.setCreateTime(changed);
        fixture.mapper(CrmOpportunityStageHistoryMapper.class).insert(history);
    }

    private CrmStageAnalysisService.Stage stage(CrmStageAnalysisService.Report report, String code) { return report.stages().stream().filter(stage -> code.equals(stage.stage())).findFirst().orElseThrow(); }
    private CrmSalesStage rule(String code) { return fixture.bean(CrmSalesStageService.class).list().stream().filter(stage -> code.equals(stage.getStageCode())).findFirst().orElseThrow(); }
    private void setThreshold(CrmSalesStage stage, Integer days) {
        fixture.bean(CrmSalesStageService.class).save(new CrmSalesStageRequest(stage.getStageId(), stage.getVersion(), stage.getStageCode(), stage.getStageName(), stage.getSortNo(), stage.getDefaultWinRate(), stage.getAllowSkipFlag(), stage.getRequiredFields(), stage.getRequiredActivityFlag(), days, stage.getIsWonFlag(), stage.getIsLostFlag(), stage.getStatus()));
    }
    private List<OutboxEvent> events(Long id) {
        return fixture.mapper(OutboxEventMapper.class).selectList(new LambdaQueryWrapper<OutboxEvent>().eq(OutboxEvent::getTenantId, 100000L)
                .eq(OutboxEvent::getAggregateType, "cloudflow-service-crm").eq(OutboxEvent::getAggregateId, id)
                .eq(OutboxEvent::getEventType, "MESSAGE_SEND").orderByAsc(OutboxEvent::getId));
    }
}
