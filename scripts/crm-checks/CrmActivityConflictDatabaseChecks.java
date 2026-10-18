package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.domain.CrmActivity;
import com.cloudflow.crm.domain.CrmActivityParticipant;
import com.cloudflow.crm.domain.dto.CrmActivityRequest;
import com.cloudflow.crm.domain.vo.CrmActivityDetailVO;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmActivityConflictDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmActivityService activities;
    private final LocalDateTime start = LocalDateTime.now().plusYears(3).withHour(10).withMinute(0).withSecond(0).withNano(0);

    private CrmActivityConflictDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture;
        this.activities = fixture.bean(CrmActivityService.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) {
        int before = assertionCount();
        CrmActivityConflictDatabaseChecks checks = new CrmActivityConflictDatabaseChecks(fixture);
        try {
            checks.sharedParticipants();
            checks.timeAndStateBoundaries();
            checks.historyDoesNotHideOpenConflicts();
            checks.tenantAndLongDuration();
        } finally { identity(); }
        System.out.println("E1_ACTIVITY_CONFLICT_DATABASE: assertions=" + (assertionCount() - before)
                + "; real_mysql=true; permission_identity=controlled_fixture; real_http=false");
    }

    private void sharedParticipants() {
        CrmActivityDetailVO other = create("private-other", 3L, start, start.plusHours(1), "PLANNED", 2L);
        CrmActivityDetailVO source = create("source", 1L, start, start.plusHours(1), "PLANNED", 2L);
        Long sourceId = source.getActivity().getActivityId();
        Long otherId = other.getActivity().getActivityId();
        equal(Set.of(otherId), ids(source), "shared internal participant causes an activity conflict");

        identity(100000L, 1L, 4);
        CrmActivityDetailVO privateView = activities.detail(sourceId);
        equal(1, privateView.getConflicts().size(), "private participant commitment still reports a busy period");
        CrmActivity busy = privateView.getConflicts().get(0);
        equal("忙碌时段", busy.getSubject(), "unreadable conflict title is masked");
        equal(start, busy.getStartTime(), "private busy period retains its start");
        equal(start.plusHours(1), busy.getEndTime(), "private busy period retains its end");
        equal(null, busy.getActivityId(), "private busy period hides its activity identifier");
        equal(null, busy.getOwnerId(), "private busy period hides its owner identifier");
        equal(null, busy.getOwnerName(), "private busy period hides its owner name");
        equal(null, busy.getActivityNo(), "private busy period hides its business number");
        equal(null, busy.getDescription(), "private busy period hides its description");
        equal(null, busy.getBizId(), "private busy period hides its linked business");
        equal(null, busy.getCustomerId(), "private busy period hides its customer");
        fails(IllegalArgumentException.class, () -> activities.detail(otherId), "busy notice does not grant private activity detail access");

        identity(100000L, 2L, 4);
        equal(Set.of(otherId), ids(activities.detail(sourceId)), "participant with access to both activities sees the conflicting activity");
        equal(other.getActivity().getSubject(), activities.detail(sourceId).getConflicts().get(0).getSubject(), "authorized participant sees the actual conflict title");
        activities.respond(sourceId, "DECLINED");
        identity();
        equal(0, activities.detail(sourceId).getConflicts().size(), "source declined participant no longer creates a conflict");
        identity(100000L, 2L, 4);
        activities.respond(sourceId, "NONE");
        activities.respond(otherId, "DECLINED");
        identity();
        equal(0, activities.detail(sourceId).getConflicts().size(), "other declined participant no longer creates a conflict");
        identity(100000L, 2L, 4); activities.respond(otherId, "TENTATIVE"); identity();
        equal(Set.of(otherId), ids(activities.detail(sourceId)), "tentative participant still reserves a busy period");

        members(sourceId, 1L, 2L, 4L);
        members(otherId, 3L, 2L, 4L);
        identity();
        equal(Set.of(otherId), ids(activities.detail(sourceId)), "multiple shared participants identify the same conflict");
        equal(1, activities.detail(sourceId).getConflicts().size(), "multiple shared participants do not duplicate a conflict");
        members(sourceId, 1L);
        identity(); equal(0, activities.detail(sourceId).getConflicts().size(), "removed participants no longer cause conflicts");
        members(otherId, 3L, 1L);
        identity(); equal(Set.of(otherId), ids(activities.detail(sourceId)), "activity owner also conflicts with another activity where they participate");
        identity(100000L, 4L, 4);
        fails(IllegalArgumentException.class, () -> activities.detail(sourceId), "unrelated user cannot obtain conflict information through private source activity");
        identity();
    }

    private void timeAndStateBoundaries() {
        LocalDateTime begin = start.plusDays(10);
        CrmActivityDetailVO source = create("boundary-source", 1L, begin, begin.plusHours(1), "PLANNED");
        create("ends-at-start", 1L, begin.minusHours(1), begin, "PLANNED");
        create("starts-at-end", 1L, begin.plusHours(1), begin.plusHours(2), "PLANNED");
        for (String state : List.of("COMPLETED", "CANCELLED", "NOT_HELD")) {
            create("terminal-" + state, 1L, begin, begin.plusHours(1), state);
        }
        identity();
        equal(0, activities.detail(source.getActivity().getActivityId()).getConflicts().size(), "touching endpoints and terminal activities do not conflict");
        CrmActivityDetailVO progress = create("in-progress", 1L, begin.plusMinutes(30), begin.plusMinutes(45), "IN_PROGRESS");
        equal(Set.of(source.getActivity().getActivityId()), ids(progress), "in-progress overlap is reported and save remains allowed");
        List<Map<String, Object>> before = fixture.jdbc.queryForList("SELECT * FROM crm_activity WHERE activity_id IN (?,?) ORDER BY activity_id", source.getActivity().getActivityId(), progress.getActivity().getActivityId());
        activities.detail(source.getActivity().getActivityId());
        equal(before, fixture.jdbc.queryForList("SELECT * FROM crm_activity WHERE activity_id IN (?,?) ORDER BY activity_id", source.getActivity().getActivityId(), progress.getActivity().getActivityId()), "conflict reads do not update activity rows");
        activities.delete(progress.getActivity().getActivityId());
        equal(0, activities.detail(source.getActivity().getActivityId()).getConflicts().size(), "deleted activities are excluded from conflicts");
        CrmActivityDetailVO active = create("terminal-source-other", 1L, begin, begin.plusHours(1), "PLANNED");
        CrmActivityDetailVO completed = activities.changeStatus(source.getActivity().getActivityId(), "COMPLETED", source.getActivity().getVersion(), null, null, false);
        equal(0, completed.getConflicts().size(), "completed source no longer reports scheduling conflicts");
        equal(0, activities.detail(active.getActivity().getActivityId()).getConflicts().size(), "new activity ignores completed source");
    }

    private void historyDoesNotHideOpenConflicts() {
        LocalDateTime begin = start.plusDays(20);
        for (int index = 0; index < 101; index++) {
            create("historical-" + index, 1L, begin, begin.plusHours(1), "CANCELLED");
        }
        CrmActivityDetailVO first = create("after-history-first", 1L, begin, begin.plusHours(1), "PLANNED");
        CrmActivityDetailVO second = create("after-history-second", 1L, begin, begin.plusHours(1), "PLANNED");
        equal(Set.of(first.getActivity().getActivityId()), ids(second), "101 historical rows cannot hide a new open conflict");
        equal(Set.of(second.getActivity().getActivityId()), ids(activities.detail(first.getActivity().getActivityId())), "conflict lookup excludes history before finding both active rows");
    }

    private void tenantAndLongDuration() {
        LocalDateTime begin = start.plusDays(50);
        CrmActivityDetailVO source = create("tenant-source", 1L, begin, begin.plusHours(1), "PLANNED");
        identity(100001L, 1L, 0);
        CrmActivityDetailVO foreign = activities.save(draft("foreign", begin, begin.plusHours(1), "PLANNED"));
        equal(0, foreign.getConflicts().size(), "foreign tenant cannot learn a same-user-number conflict");
        identity();
        equal(0, activities.detail(source.getActivity().getActivityId()).getConflicts().size(), "local conflict lookup excludes foreign tenant activities");
        LocalDateTime longBegin = start.plusDays(90);
        CrmActivityDetailVO other = create("long-other", 3L, longBegin.plusDays(35), longBegin.plusDays(36), "PLANNED", 2L);
        CrmActivityDetailVO longActivity = create("long-source", 1L, longBegin, longBegin.plusDays(40), "PLANNED", 2L);
        equal(Set.of(other.getActivity().getActivityId()), ids(longActivity), "valid activities longer than 31 days still report participant conflicts");
    }

    private CrmActivityDetailVO create(String suffix, Long owner, LocalDateTime begin, LocalDateTime end, String status, Long... users) {
        identity(100000L, owner, 0);
        return activities.save(draft(suffix, begin, end, status, users));
    }

    private CrmActivityRequest draft(String suffix, LocalDateTime begin, LocalDateTime end, String status, Long... users) {
        CrmActivity activity = new CrmActivity();
        activity.setSubject("activity-conflict-" + suffix); activity.setActivityType("MEETING"); activity.setStatus(status);
        activity.setBizType("NONE"); activity.setStartTime(begin); activity.setEndTime(end);
        activity.setDescription("private conflict description");
        CrmActivityRequest request = new CrmActivityRequest(); request.setActivity(activity);
        request.setParticipants(participants(users)); request.setReminders(List.of());
        return request;
    }

    private void members(Long id, Long owner, Long... users) {
        identity(100000L, owner, 0);
        CrmActivityRequest request = new CrmActivityRequest(); request.setActivity(activities.detail(id).getActivity());
        request.setParticipants(participants(users)); activities.save(request);
    }

    private List<CrmActivityParticipant> participants(Long... users) {
        return Arrays.stream(users).map(user -> {
            CrmActivityParticipant participant = new CrmActivityParticipant();
            participant.setParticipantType("USER"); participant.setParticipantRefId(user); return participant;
        }).toList();
    }

    private Set<Long> ids(CrmActivityDetailVO detail) {
        return detail.getConflicts().stream().map(CrmActivity::getActivityId).collect(Collectors.toSet());
    }
}
