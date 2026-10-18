package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.domain.CrmActivity;
import com.cloudflow.crm.domain.CrmActivityParticipant;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.dto.CrmActivityRequest;
import com.cloudflow.crm.domain.vo.CrmActivityDetailVO;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmActivityParticipantsDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmActivityService activities;

    private CrmActivityParticipantsDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture;
        this.activities = fixture.bean(CrmActivityService.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        CrmActivityParticipantsDatabaseChecks checks = new CrmActivityParticipantsDatabaseChecks(fixture);
        checks.internalReplies();
        checks.externalReplies();
        checks.staleTransaction();
    }

    private void internalReplies() {
        CrmCustomer customer = fixture.customer("participant-replies");
        CrmActivityDetailVO created = activities.save(draft(customer.getCustomerId(), List.of(member("USER", 2L, "ACCEPTED"))));
        Long id = created.getActivity().getActivityId();
        equal("NONE", only(created).getAcceptanceStatus(), "new colleague cannot be marked accepted by organizer");
        equal(null, only(created).getResponseTime(), "new colleague has no response time");
        for (String state : List.of("TENTATIVE", "ACCEPTED", "DECLINED", "NONE")) {
            identity(100000L, 2L, 4);
            try { activities.respond(id, state); } finally { identity(); }
            CrmActivityDetailVO replied = activities.detail(id);
            CrmActivityParticipant response = only(replied);
            equal(state, response.getAcceptanceStatus(), "internal user records own " + state);
            equal("NONE".equals(state), response.getResponseTime() == null, "internal response time matches " + state);
            LocalDateTime responseTime = response.getResponseTime();
            CrmActivityRequest overwrite = edit(replied);
            overwrite.getParticipants().get(0).setAcceptanceStatus("ACCEPTED".equals(state) ? "DECLINED" : "ACCEPTED");
            overwrite.getParticipants().get(0).setResponseTime(LocalDateTime.of(2000, 1, 1, 0, 0));
            CrmActivityParticipant saved = only(activities.save(overwrite));
            equal(state, saved.getAcceptanceStatus(), "organizer save retains colleague " + state);
            equal(responseTime, saved.getResponseTime(), "organizer cannot change colleague response time " + state);
        }
        identity(100000L, 2L, 4);
        try { activities.respond(id, "ACCEPTED"); } finally { identity(); }
        CrmActivityRequest remove = edit(activities.detail(id)); remove.setParticipants(List.of());
        CrmActivityDetailVO removed = activities.save(remove);
        equal(0, removed.getParticipants().size(), "removed colleague is no longer active");
        String inactiveBefore = fixture.jdbc.queryForObject("SELECT acceptance_status FROM crm_activity_participant WHERE activity_id=? AND participant_ref_id=2 AND deleted=1", String.class, id);
        identity(100000L, 2L, 0);
        try { fails(IllegalArgumentException.class, () -> activities.respond(id, "DECLINED"), "removed colleague cannot respond even with activity read scope"); }
        finally { identity(); }
        equal(inactiveBefore, fixture.jdbc.queryForObject("SELECT acceptance_status FROM crm_activity_participant WHERE activity_id=? AND participant_ref_id=2 AND deleted=1", String.class, id), "removed reply remains unchanged");
        CrmActivityRequest restore = edit(removed); restore.setParticipants(List.of(member("USER", 2L, "ACCEPTED")));
        CrmActivityParticipant rejoined = only(activities.save(restore));
        equal("NONE", rejoined.getAcceptanceStatus(), "reinvited colleague starts unresponded");
        equal(null, rejoined.getResponseTime(), "reinvited colleague has no old response time");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_activity_participant WHERE activity_id=? AND deleted=0", id), "reinvitation has exactly one active participant");
    }

    private void externalReplies() {
        CrmCustomer customer = fixture.customer("external-replies");
        CrmContact contact = new CrmContact(); contact.setCustomerId(customer.getCustomerId()); contact.setContactName("客户回复验收联系人");
        fixture.bean(CrmContactServiceImpl.class).createContact(contact);
        CrmLead lead = new CrmLead(); lead.setLeadName("线索回复验收"); lead.setCompanyName("线索回复验收公司"); lead.setContactName("线索回复验收联系人");
        fixture.bean(CrmLeadServiceImpl.class).createLead(lead);
        CrmActivityDetailVO detail = activities.save(draft(customer.getCustomerId(), List.of(member("CONTACT", contact.getContactId(), "NONE"), member("LEAD", lead.getLeadId(), "NONE"), member("USER", 1L, "NONE"))));
        for (String state : List.of("TENTATIVE", "ACCEPTED", "DECLINED", "NONE")) {
            CrmActivityRequest update = edit(detail);
            for (CrmActivityParticipant participant : update.getParticipants()) participant.setAcceptanceStatus(state);
            detail = activities.save(update);
            equal(3, detail.getParticipants().size(), "contact, lead and self are retained for " + state);
            for (CrmActivityParticipant participant : detail.getParticipants()) {
                equal(state, participant.getAcceptanceStatus(), "owner records " + participant.getParticipantType() + " " + state);
                equal("NONE".equals(state), participant.getResponseTime() == null, "response timestamp for " + participant.getParticipantType() + " " + state);
            }
            CrmActivityDetailVO repeated = activities.save(edit(detail));
            for (int index = 0; index < detail.getParticipants().size(); index++) equal(detail.getParticipants().get(index).getResponseTime(), repeated.getParticipants().get(index).getResponseTime(), "unchanged external/self reply retains timestamp");
            detail = repeated;
        }
        equal(contact.getContactName(), detail.getParticipants().get(0).getParticipantName(), "customer contact name resolves from real record");
        equal(lead.getContactName(), detail.getParticipants().get(1).getParticipantName(), "lead contact name resolves from real record");
    }

    private void staleTransaction() throws Exception {
        CrmCustomer customer = fixture.customer("concurrent-participant-reply");
        CrmActivityDetailVO created = activities.save(draft(customer.getCustomerId(), List.of(member("USER", 2L, "NONE"))));
        Long id = created.getActivity().getActivityId();
        CountDownLatch snapshotReady = new CountDownLatch(1);
        CountDownLatch responseCommitted = new CountDownLatch(1);
        int[] completed = fixture.parallel(() -> {
            TransactionTemplate transaction = new TransactionTemplate(fixture.manager);
            transaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
            return transaction.execute(status -> {
                CrmActivityDetailVO stale = activities.detail(id);
                equal("NONE", only(stale).getAcceptanceStatus(), "owner form establishes old repeatable-read snapshot");
                snapshotReady.countDown(); await(responseCommitted);
                CrmActivityRequest update = edit(stale); update.getActivity().setDescription("保留同事最新回复的普通编辑");
                CrmActivityDetailVO returned = activities.save(update);
                equal("DECLINED", only(returned).getAcceptanceStatus(), "stale transaction returns the retained current reply");
                return 1;
            });
        }, () -> {
            await(snapshotReady); identity(100000L, 2L, 4);
            try { activities.respond(id, "DECLINED"); } finally { responseCommitted.countDown(); }
            return 1;
        });
        equal(2, completed[0] + completed[1], "actual concurrent reply and stale form both finish");
        CrmActivityDetailVO saved = activities.detail(id);
        equal("DECLINED", only(saved).getAcceptanceStatus(), "old transaction cannot overwrite freshly committed colleague reply");
        check(only(saved).getResponseTime() != null, "concurrent response timestamp retained");
        equal("保留同事最新回复的普通编辑", saved.getActivity().getDescription(), "ordinary edit persists alongside concurrent reply");
    }

    private static CrmActivityParticipant member(String type, Long id, String state) {
        CrmActivityParticipant member = new CrmActivityParticipant(); member.setParticipantType(type); member.setParticipantRefId(id); member.setAcceptanceStatus(state); return member;
    }

    private static CrmActivityParticipant only(CrmActivityDetailVO detail) { return detail.getParticipants().get(0); }

    private static CrmActivityRequest edit(CrmActivityDetailVO detail) {
        CrmActivityRequest request = new CrmActivityRequest(); request.setActivity(detail.getActivity()); request.setParticipants(detail.getParticipants()); request.setReminders(List.of()); return request;
    }

    private static CrmActivityRequest draft(Long customerId, List<CrmActivityParticipant> members) {
        CrmActivity activity = new CrmActivity(); activity.setSubject("参与人回复验收"); activity.setActivityType("MEETING"); activity.setBizType("CUSTOMER"); activity.setBizId(customerId);
        activity.setStartTime(LocalDateTime.now().plusDays(60)); activity.setEndTime(activity.getStartTime().plusHours(1));
        CrmActivityRequest request = new CrmActivityRequest(); request.setActivity(activity); request.setParticipants(members); request.setReminders(List.of()); return request;
    }

    private static void await(CountDownLatch latch) {
        try { if (!latch.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Participant verification timed out"); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
    }
}
