package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.*;
import com.cloudflow.crm.domain.vo.CrmActivityDetailVO;
import com.cloudflow.crm.domain.vo.CrmTimelineItemVO;
import com.cloudflow.crm.mapper.*;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmActivitiesDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;

    private CrmActivitiesDatabaseChecks(CrmOperationsDatabaseChecks fixture) { this.fixture = fixture; }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        CrmActivitiesDatabaseChecks checks = new CrmActivitiesDatabaseChecks(fixture);
        checks.activities(); CrmActivityParticipantsDatabaseChecks.run(fixture); CrmActivityCalendarDatabaseChecks.run(fixture); CrmActivityConflictDatabaseChecks.run(fixture); CrmActivityScopeDatabaseChecks.run(fixture); checks.nextActivityDefaults(); checks.activityMessageSources(); checks.slaPersistence(); checks.territoriesAndLeads(); checks.targetLists(); checks.timeline(); checks.outboxConcurrency();
    }

    private void activities() throws Exception {
        CrmActivityService activities = fixture.bean(CrmActivityService.class); CrmActivityReminderService reminders = fixture.bean(CrmActivityReminderService.class);
        CrmCustomer customer = fixture.customer("activity");
        CrmActivityRequest request = activity(customer.getCustomerId(), LocalDateTime.now().plusDays(2));
        CrmActivityParticipant participant = new CrmActivityParticipant(); participant.setParticipantType("USER"); participant.setParticipantRefId(2L);
        request.setParticipants(List.of(participant));
        CrmActivityDetailVO created = activities.save(request); Long id = created.getActivity().getActivityId();
        equal("PLANNED", created.getActivity().getStatus(), "new activity uses shared status");
        equal("NONE", created.getParticipants().get(0).getAcceptanceStatus(), "new participant uses shared invitation status");
        Long oldReminderId = created.getReminders().get(0).getReminderId();
        CrmActivity edited = created.getActivity(); edited.setStartTime(LocalDateTime.now().plusDays(3)); edited.setEndTime(edited.getStartTime().plusHours(1));
        CrmActivityRequest change = new CrmActivityRequest(); change.setActivity(edited);
        CrmActivityDetailVO rescheduled = activities.save(change);
        equal(1, rescheduled.getReminders().size(), "reschedule retains configured reminder");
        check(!oldReminderId.equals(rescheduled.getReminders().get(0).getReminderId()), "reschedule cancels old pending reminder");
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_activity_reminder WHERE reminder_id=?", oldReminderId), "old reminder physically removed");
        identity(100000L, 2L, 4);
        equal(id, activities.detail(id).getActivity().getActivityId(), "internal participant can read activity through data scope");
        activities.respond(id, "ACCEPTED");
        equal("ACCEPTED", activities.detail(id).getParticipants().get(0).getAcceptanceStatus(), "participant can respond");
        fails(IllegalArgumentException.class, () -> activities.save(change), "participant cannot edit owner activity");
        identity(100000L, 3L, 4); fails(IllegalArgumentException.class, () -> activities.detail(id), "unrelated user cannot read activity");
        identity(100001L, 1L, 0); fails(IllegalArgumentException.class, () -> activities.detail(id), "tenant filter blocks foreign activity"); identity();
        CrmActivityDetailVO cancelled = activities.changeStatus(id, "CANCELLED", rescheduled.getActivity().getVersion(), null, null, false);
        equal(0, cancelled.getReminders().size(), "cancel clears pending reminders");
        equal(0, reminders.dispatch(), "cancelled and future activities do not send");
        CrmActivityDetailVO due = activities.save(activity(customer.getCustomerId(), LocalDateTime.now().minusMinutes(1)));
        int[] sent = fixture.parallel(() -> reminders.dispatch(), () -> reminders.dispatch());
        equal(1, sent[0] + sent[1], "concurrent reminder dispatch sends once");
        equal(1, activities.detail(due.getActivity().getActivityId()).getReminders().get(0).getSentFlag(), "sent flag persisted atomically");
        equal(0, reminders.dispatch(), "repeated dispatch does not duplicate");
        CrmActivityDetailVO completed = activities.changeStatus(due.getActivity().getActivityId(), "COMPLETED", due.getActivity().getVersion(), "已确认客户需求", null, true);
        check(completed.getActivity().getFollowUpId() != null, "completion generates follow-up");
        activities.changeStatus(completed.getActivity().getActivityId(), "COMPLETED", completed.getActivity().getVersion(), null, null, true);
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_follow_up WHERE customer_id=? AND deleted=0", customer.getCustomerId()), "completion follow-up is idempotent");
        CrmActivityRequest next = activity(customer.getCustomerId(), LocalDateTime.now().plusDays(1)); next.getActivity().setSubject("再次确认实施安排");
        equal("再次确认实施安排", activities.next(id, next).getActivity().getSubject(), "next activity accepts its supplied subject");
    }

    private void nextActivityDefaults() {
        CrmActivityService activities = fixture.bean(CrmActivityService.class);
        CrmCustomer customer = fixture.customer("next-activity-defaults");
        CrmActivityRequest input = activity(customer.getCustomerId(), LocalDateTime.now().plusDays(20));
        input.getActivity().setNextAction("确认实施排期并发送会议纪要");
        CrmActivityDetailVO source = activities.save(input);
        Long sourceId = source.getActivity().getActivityId();
        CrmActivityRequest draft = nextActivityDraft(customer.getCustomerId());
        draft.getActivity().setBizType("NONE"); draft.getActivity().setBizId(null); draft.getActivity().setOwnerId(3L);
        CrmActivity first = activities.next(sourceId, draft).getActivity();
        equal(source.getActivity().getNextAction(), first.getSubject(), "next action becomes the default short subject");
        equal(source.getActivity().getNextAction(), first.getDescription(), "next action is retained in the new activity description");
        equal(source.getActivity().getBizType(), first.getBizType(), "next activity inherits source business type");
        equal(source.getActivity().getBizId(), first.getBizId(), "next activity inherits source business ID");
        equal(source.getActivity().getCustomerId(), first.getCustomerId(), "next activity inherits source customer");
        equal(source.getActivity().getOwnerId(), first.getOwnerId(), "next activity inherits source owner");
        equal("PLANNED", first.getStatus(), "next activity starts planned");

        CrmActivityRequest update = new CrmActivityRequest(); update.setActivity(source.getActivity());
        String limitSubject = "界".repeat(200);
        update.getActivity().setNextAction(limitSubject); source = activities.save(update);
        CrmActivity boundary = activities.next(sourceId, nextActivityDraft(customer.getCustomerId())).getActivity();
        equal(limitSubject, boundary.getSubject(), "200-character next action fits the subject exactly");
        equal(limitSubject, boundary.getDescription(), "200-character next action remains complete in description");

        String fullAction = "续".repeat(500);
        String sourceSubject = "原".repeat(200);
        update = new CrmActivityRequest(); update.setActivity(source.getActivity());
        update.getActivity().setSubject(sourceSubject); update.getActivity().setNextAction(fullAction); source = activities.save(update);
        CrmActivity longAction = activities.next(sourceId, nextActivityDraft(customer.getCustomerId())).getActivity();
        equal(sourceSubject, longAction.getSubject(), "long next action uses the complete original subject");
        equal(fullAction, longAction.getDescription(), "all 500 next-action characters are retained");
        equal(fullAction, activities.detail(sourceId).getActivity().getNextAction(), "creating next activity does not consume the original action");
        CrmActivityRequest explicit = nextActivityDraft(customer.getCustomerId());
        explicit.getActivity().setSubject("自行填写的主题"); explicit.getActivity().setDescription("自行补充的说明");
        CrmActivity customized = activities.next(sourceId, explicit).getActivity();
        equal("自行填写的主题", customized.getSubject(), "explicit next activity subject is retained");
        equal("自行补充的说明", customized.getDescription(), "explicit next activity description is retained");
        CrmActivityRequest cleared = nextActivityDraft(customer.getCustomerId()); cleared.getActivity().setDescription("");
        CrmActivity withoutDescription = activities.next(sourceId, cleared).getActivity();
        check(withoutDescription.getDescription() == null || withoutDescription.getDescription().isEmpty(), "explicitly cleared description is not replaced by old action");

        CrmActivityRequest noActionSource = activity(customer.getCustomerId(), LocalDateTime.now().plusDays(20));
        noActionSource.getActivity().setSubject(sourceSubject); noActionSource.getActivity().setNextAction(null);
        CrmActivityDetailVO blankSource = activities.save(noActionSource);
        CrmActivity noAction = activities.next(blankSource.getActivity().getActivityId(), nextActivityDraft(customer.getCustomerId())).getActivity();
        equal(sourceSubject, noAction.getSubject(), "empty next action retains the original subject without adding an overlength prefix");
        check(noAction.getDescription() == null || noAction.getDescription().isEmpty(), "empty next action does not invent a description");
    }

    private CrmActivityRequest nextActivityDraft(Long customerId) {
        CrmActivityRequest draft = activity(customerId, LocalDateTime.now().plusDays(21));
        draft.getActivity().setSubject(null); draft.getActivity().setDescription(null);
        draft.setReminders(List.of());
        return draft;
    }

    private void activityMessageSources() throws Exception {
        CrmActivityService activities = fixture.bean(CrmActivityService.class);
        CrmActivityReminderService reminders = fixture.bean(CrmActivityReminderService.class);
        CrmActivityMessageSourceService sources = fixture.bean(CrmActivityMessageSourceService.class);
        CrmCustomer customer = fixture.customer("activity-source");
        CrmActivityRequest input = activity(customer.getCustomerId(), LocalDateTime.now().minusMinutes(1));
        CrmActivityParticipant participant = new CrmActivityParticipant(); participant.setParticipantType("USER"); participant.setParticipantRefId(2L);
        input.setParticipants(List.of(participant));
        CrmActivityDetailVO created = activities.save(input);
        equal(1, reminders.dispatch(), "activity source fixture queues one multi-recipient reminder");
        Long id = created.getActivity().getActivityId();
        CrmActivityDetailVO queued = activities.detail(id);
        Long reminderId = queued.getReminders().get(0).getReminderId();
        MessageSourceCheck owner = activitySource(id, reminderId, 1L);
        MessageSourceCheck member = activitySource(id, reminderId, 2L);
        equal(true, sources.verify(owner).allowed(), "activity owner source matches immutable event");
        equal(true, sources.verify(member).allowed(), "multi-recipient activity event allows its actual participant");
        equal(false, sources.verify(new MessageSourceCheck(owner.eventId(), 98765L, owner.request().toBuilder().title("forged").build())).allowed(), "activity source rejects forged content");
        equal(false, sources.verify(new MessageSourceCheck(owner.eventId(), 98765L, owner.request().toBuilder().forceSend(true).build())).allowed(), "activity source rejects forced delivery");
        equal(false, sources.verify(new MessageSourceCheck(UUID.randomUUID().toString(), 98765L, owner.request())).allowed(), "activity source requires original persistent event");
        equal(false, sources.verify(new MessageSourceCheck(owner.eventId(), 98765L, owner.request().toBuilder().receivers(List.of(MessageReceiver.ofUser(3L))).build())).allowed(), "activity source rejects substituted recipient");
        identity(100001L, 1L, 0); equal(false, sources.verify(owner).allowed(), "activity source rejects foreign tenant"); identity();
        identity(100000L, 2L, 4); activities.respond(id, "DECLINED"); identity();
        equal(false, sources.verify(member).allowed(), "participant rejection invalidates queued reminder");
        equal(true, sources.verify(owner).allowed(), "participant rejection retains owner notification");
        CrmActivityRequest edit = new CrmActivityRequest(); edit.setActivity(queued.getActivity()); edit.setReminders(queued.getReminders()); edit.setParticipants(queued.getParticipants());
        edit.getActivity().setDescription("ordinary edit");
        CrmActivityDetailVO edited = activities.save(edit);
        equal(reminderId, edited.getReminders().get(0).getReminderId(), "ordinary edit preserves queued reminder identity");
        equal(true, sources.verify(owner).allowed(), "ordinary edit keeps queued notification valid");
        equal(false, sources.verify(member).allowed(), "stale full form does not restore a declined participant notification");
        equal(0, reminders.dispatch(), "ordinary edit does not requeue submitted reminder");
        CrmActivityRequest postponed = new CrmActivityRequest(); postponed.setActivity(edited.getActivity());
        postponed.getActivity().setStartTime(LocalDateTime.now().plusDays(1)); postponed.getActivity().setEndTime(postponed.getActivity().getStartTime().plusHours(1));
        CrmActivityDetailVO later = activities.save(postponed);
        equal(false, sources.verify(owner).allowed(), "postponing activity invalidates already queued old reminder");
        check(!reminderId.equals(later.getReminders().get(0).getReminderId()), "postponing creates new reminder identity");
        equal(0, reminders.dispatch(), "postponed reminder does not send early");
        CrmActivityRequest earlier = new CrmActivityRequest(); earlier.setActivity(later.getActivity());
        earlier.getActivity().setStartTime(LocalDateTime.now().minusMinutes(1)); earlier.getActivity().setEndTime(LocalDateTime.now().plusHours(1));
        CrmActivityDetailVO due = activities.save(earlier);
        equal(1, reminders.dispatch(), "new activity schedule queues its new reminder once");
        MessageSourceCheck newOwner = activitySource(id, due.getReminders().get(0).getReminderId(), 1L);
        equal(true, sources.verify(newOwner).allowed(), "new activity schedule source can send");
        activities.changeStatus(id, "CANCELLED", due.getActivity().getVersion(), null, null, false);
        equal(false, sources.verify(newOwner).allowed(), "cancellation invalidates already queued activity reminder");
        CrmActivityDetailVO removed = activities.save(activity(customer.getCustomerId(), LocalDateTime.now().minusMinutes(1)));
        equal(1, reminders.dispatch(), "deleted source fixture queues once");
        MessageSourceCheck removal = activitySource(removed.getActivity().getActivityId(), removed.getReminders().get(0).getReminderId(), 1L);
        activities.delete(removed.getActivity().getActivityId());
        equal(false, sources.verify(removal).allowed(), "deleted activity cannot deliver queued reminder");
    }

    private MessageSourceCheck activitySource(Long activityId, Long reminderId, Long userId) throws Exception {
        String eventId = messageId("activity:" + activityId + ":reminder:" + reminderId);
        String stored = fixture.jdbc.queryForObject("SELECT payload_json FROM outbox_event WHERE event_id=?", String.class, eventId);
        BusinessEventEnvelope envelope = fixture.json.readValue(stored, BusinessEventEnvelope.class);
        MessageSendRequest request = fixture.json.readValue(envelope.getPayload(), MessageSendRequest.class);
        MessageSendRequest expanded = request.toBuilder().receivers(List.of(MessageReceiver.ofUser(userId))).traceId(eventId).build();
        return new MessageSourceCheck(eventId, 98765L, expanded);
    }

    private void slaPersistence() {
        CrmCustomer customer = fixture.customer("sla"); CrmServiceTicket ticket = fixture.ticket(customer, LocalDateTime.of(2026, 1, 9, 17, 0));
        ticket.setSeverity("P1"); fixture.bean(CrmSlaService.class).initialize(ticket); fixture.mapper(CrmServiceTicketMapper.class).insert(ticket);
        equal(LocalDateTime.of(2026, 1, 12, 12, 0), fixture.mapper(CrmServiceTicketMapper.class).selectById(ticket.getTicketId()).getResolutionDue(), "SLA deadline uses seeded A4 calendar in MySQL");
        fixture.bean(CrmSlaService.class).scanBreaches();
        CrmServiceTicket persisted = fixture.mapper(CrmServiceTicketMapper.class).selectById(ticket.getTicketId());
        equal(1, persisted.getResponseBreachedFlag(), "response breach persisted"); equal(1, persisted.getResolutionBreachedFlag(), "resolution breach persisted");
        long notices = fixture.scalar("SELECT COUNT(*) FROM outbox_event WHERE event_id IN (?, ?)", messageId("sla:" + ticket.getTicketId() + ":RESPONSE_BREACHED"), messageId("sla:" + ticket.getTicketId() + ":RESOLUTION_BREACHED"));
        equal(2L, notices, "one event per SLA breach type"); fixture.bean(CrmSlaService.class).scanBreaches();
        equal(notices, fixture.scalar("SELECT COUNT(*) FROM outbox_event WHERE event_id IN (?, ?)", messageId("sla:" + ticket.getTicketId() + ":RESPONSE_BREACHED"), messageId("sla:" + ticket.getTicketId() + ":RESOLUTION_BREACHED")), "restarted breach scan does not resend");
    }

    private void territoriesAndLeads() {
        CrmTerritoryService territories = fixture.bean(CrmTerritoryService.class);
        CrmTerritory root = territory("root", 0L); CrmTerritory branch = territory("branch", root.getTerritoryId());
        CrmTerritory leaf = territory("leaf", branch.getTerritoryId()); CrmTerritory destination = territory("destination", 0L);
        root.setParentId(leaf.getTerritoryId()); fails(IllegalArgumentException.class, () -> territories.save(root), "territory cycle rejected");
        root.setParentId(destination.getTerritoryId()); territories.save(root);
        check(fixture.mapper(CrmTerritoryMapper.class).selectById(leaf.getTerritoryId()).getLevelPath().startsWith(destination.getLevelPath()), "moving territory updates all descendant paths");
        CrmLead lead = new CrmLead(); lead.setLeadName("CRM qualification check"); lead.setCompanyName("CRM conversion company");
        lead.setContactName("CRM contact"); lead.setEmail("convert@example.com"); lead.setMobile("13812345678"); lead.setJobTitle("采购负责人");
        lead.setTerritoryId(leaf.getTerritoryId()); lead.setMarketSegment("ENTERPRISE"); lead.setEmployeeScale("51-200"); lead.setAnnualRevenue(new BigDecimal("1000000"));
        lead.setIndustry("IT"); lead.setSource("CAMPAIGN"); lead.setUnsubscribeFlag(1);
        CrmCampaign campaign = fixture.campaign("conversion"); lead.setCampaignId(campaign.getCampaignId());
        fixture.bean(CrmLeadServiceImpl.class).createLead(lead);
        fails(IllegalArgumentException.class, () -> territories.delete(leaf.getTerritoryId()), "referenced territory cannot be deleted");
        CrmLeadConvertDTO convert = new CrmLeadConvertDTO(); convert.setLeadId(lead.getLeadId()); convert.setCreateOpportunity(true); convert.setExpectedAmount(BigDecimal.TEN);
        fails(IllegalArgumentException.class, () -> fixture.bean(CrmLeadServiceImpl.class).convertLead(convert), "unqualified lead conversion blocked by rule");
        CrmLead qualified = fixture.bean(CrmLeadQualificationService.class).qualify(lead.getLeadId(), "QUALIFIED", "资质齐全", lead.getVersion());
        fixture.bean(CrmLeadScoreService.class).recalculate(lead.getLeadId());
        equal("QUALIFIED", fixture.mapper(CrmLeadMapper.class).selectById(lead.getLeadId()).getQualificationStatus(), "database scoring preserves qualification");
        Long customerId = fixture.bean(CrmLeadServiceImpl.class).convertLead(convert);
        equal(customerId, fixture.bean(CrmLeadServiceImpl.class).convertLead(convert), "lead conversion idempotent");
        CrmCustomer converted = fixture.mapper(CrmCustomerMapper.class).selectById(customerId);
        equal(qualified.getTerritoryId(), converted.getTerritoryId(), "converted customer retains territory");
        equal(qualified.getCampaignId(), converted.getCampaignId(), "converted customer retains campaign");
        equal(1, converted.getUnsubscribeFlag(), "converted customer retains opt-out");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_contact WHERE customer_id=? AND position=?", customerId, "采购负责人"), "conversion creates one contact with role");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_opportunity WHERE customer_id=? AND campaign_id=?", customerId, campaign.getCampaignId()), "conversion creates optional opportunity with campaign");
        List<Long> batch = List.of(lead.getLeadId()); String eventId = fixture.bean(CrmLeadScoreService.class).submitBatch(batch);
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM outbox_event WHERE event_id=? AND event_type='CRM_LEAD_SCORE_RECALC'", eventId), "batch scoring enters outbox");
        fixture.bean(CrmLeadScoreService.class).runBatch(batch); equal("QUALIFIED", fixture.mapper(CrmLeadMapper.class).selectById(lead.getLeadId()).getQualificationStatus(), "asynchronous batch scoring preserves manual qualification");
    }

    private void targetLists() {
        CrmCustomer customer = fixture.customer("audience"); customer.setEmail("first@example.com"); customer.setCustomerName("=1+1"); fixture.mapper(CrmCustomerMapper.class).updateById(customer);
        CrmTargetList list = new CrmTargetList(); list.setListName("CRM audience check"); list.setSourceType("MANUAL");
        CrmTargetListRequest request = new CrmTargetListRequest(); request.setList(list); request.setMembers(List.of(member("CUSTOMER", customer.getCustomerId(), "forged@example.com", 0)));
        CrmTargetListService lists = fixture.bean(CrmTargetListService.class); CrmTargetList saved = lists.save(request);
        equal("first@example.com", lists.currentMembers(saved, fixture.bean(CrmAudienceService.class).candidates()).get(0).getEmail(), "manual list resolves current authoritative contact");
        customer.setEmail("updated@example.com"); fixture.mapper(CrmCustomerMapper.class).updateById(customer);
        equal("updated@example.com", lists.currentMembers(saved, fixture.bean(CrmAudienceService.class).candidates()).get(0).getEmail(), "list refreshes changed contact details");
        String csv = new String(lists.export(saved.getListId()), StandardCharsets.UTF_8);
        check(csv.contains("u***@example.com") && !csv.contains("updated@example.com") && !csv.contains("first@example.com"), "authorized CSV masks current authoritative email"); check(csv.contains("\"'=1+1\""), "CSV formula injection neutralized");
        identity(100001L, 1L, 0); fails(IllegalArgumentException.class, () -> lists.export(saved.getListId()), "foreign-tenant audience export denied"); identity();
        CrmAudienceCondition invalid = new CrmAudienceCondition(); invalid.setScoreMin(100); invalid.setScoreMax(1);
        fails(IllegalArgumentException.class, () -> fixture.bean(CrmAudienceService.class).query(invalid, List.of()), "reversed audience score range rejected");
    }

    private void timeline() {
        CrmCustomer customer = fixture.customer("timeline"); LocalDateTime start = LocalDateTime.now().minusDays(10);
        fixture.bean(CrmActivityService.class).save(activity(customer.getCustomerId(), start));
        for (int index = 0; index < 495; index++) fixture.jdbc.update("INSERT INTO crm_follow_up (tenant_id,customer_id,follow_up_type,content,follow_up_time,owner_id,deleted) VALUES (100000,?,'PHONE','timeline check',?,1,0)", customer.getCustomerId(), start.plusMinutes(index));
        CrmOpportunity opportunity = fixture.opportunity(customer, null, "LEAD"); fixture.quote(customer, opportunity.getOpportunityId(), null);
        fixture.receivable(customer, null, "10", "0", LocalDate.now().plusDays(1)); fixture.mapper(CrmServiceTicketMapper.class).insert(fixture.ticket(customer, start));
        PageQuery page = new PageQuery(); page.setPageSize(500); page.setPageNum(1);
        long began = System.nanoTime(); PageResult<CrmTimelineItemVO> timeline = fixture.bean(CrmActivityService.class).timeline(customer.getCustomerId(), null, page);
        long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - began);
        equal(500L, timeline.getTotal(), "six-table timeline returns all 500 events without per-table truncation");
        ArrayList<CrmTimelineItemVO> allRows = new ArrayList<>(timeline.getRows());
        for (int pageNum = 2; allRows.size() < timeline.getTotal(); pageNum++) {
            page.setPageNum(pageNum);
            PageResult<CrmTimelineItemVO> nextPage = fixture.bean(CrmActivityService.class).timeline(customer.getCustomerId(), null, page);
            check(!nextPage.getRows().isEmpty(), "all timeline pages remain reachable"); allRows.addAll(nextPage.getRows());
        }
        equal(500, allRows.size(), "timeline respects common page-size cap without dropping events");
        equal(6L, allRows.stream().map(item -> item.getType()).distinct().count(), "all six business sources included");
        for (int index = 1; index < allRows.size(); index++) {
            LocalDateTime previous = allRows.get(index - 1).getEventTime(); LocalDateTime current = allRows.get(index).getEventTime();
            if (previous != null && current != null) check(!current.isAfter(previous), "timeline descending order");
        }
        check(elapsed < 5000, "500-event timeline completes within five-second local acceptance limit");
        System.out.println("PASS: 500-event six-table timeline " + elapsed + " ms");
        page.setPageSize(20); page.setPageNum(2); equal(20, fixture.bean(CrmActivityService.class).timeline(customer.getCustomerId(), null, page).getRows().size(), "timeline paging returns second page");
    }

    private void outboxConcurrency() throws Exception {
        String eventId = UUID.randomUUID().toString(); CyclicBarrier barrier = new CyclicBarrier(2);
        Callable<Integer> publish = () -> {
            TransactionTemplate transaction = new TransactionTemplate(fixture.manager); transaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
            return transaction.execute(status -> {
                equal(0L, fixture.scalar("SELECT COUNT(*) FROM outbox_event WHERE event_id=?", eventId), "concurrent publisher starts with old repeatable-read snapshot");
                try { barrier.await(15, TimeUnit.SECONDS); } catch (Exception failure) { throw new IllegalStateException(failure); }
                fixture.bean(OutboxPublisher.class).publishOnceAt(BusinessEventEnvelope.builder().eventId(eventId).tenantId(100000L).eventType("CRM_CHECK").sourceModule("crm-check").sourceId(1L).payload("{}").build(), null);
                return 1;
            });
        };
        int[] completed = fixture.parallel(publish, publish); equal(2, completed[0] + completed[1], "both duplicate publishers finish successfully");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM outbox_event WHERE event_id=?", eventId), "repeatable-read duplicate uses current locking read and remains unique");
    }

    private CrmTerritory territory(String name, Long parentId) {
        CrmTerritory territory = new CrmTerritory(); territory.setTerritoryCode("CHECK-" + UUID.randomUUID()); territory.setTerritoryName(name); territory.setParentId(parentId);
        return fixture.bean(CrmTerritoryService.class).save(territory);
    }

    private CrmActivityRequest activity(Long customerId, LocalDateTime start) {
        CrmActivity activity = new CrmActivity(); activity.setSubject("CRM activity check"); activity.setActivityType("MEETING");
        activity.setBizType("CUSTOMER"); activity.setBizId(customerId); activity.setStartTime(start); activity.setEndTime(start.plusHours(1));
        CrmActivityReminder reminder = new CrmActivityReminder(); reminder.setRemindMinutesBefore(0); reminder.setChannelType("INTERNAL");
        CrmActivityRequest request = new CrmActivityRequest(); request.setActivity(activity); request.setReminders(List.of(reminder)); return request;
    }

    private String messageId(String key) { return UUID.nameUUIDFromBytes(("cloudflow-service-crm:100000:" + key).getBytes(StandardCharsets.UTF_8)).toString(); }
}
