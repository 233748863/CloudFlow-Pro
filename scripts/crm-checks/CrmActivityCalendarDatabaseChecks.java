package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmActivity;
import com.cloudflow.crm.domain.CrmActivityParticipant;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.dto.CrmActivityQuery;
import com.cloudflow.crm.domain.dto.CrmActivityRequest;
import com.cloudflow.crm.domain.vo.CrmActivityDetailVO;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmActivityCalendarDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmActivityService activities;
    private final Long customerId;

    private CrmActivityCalendarDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture;
        this.activities = fixture.bean(CrmActivityService.class);
        CrmCustomer customer = fixture.customer("calendar-current-overdue");
        this.customerId = customer.getCustomerId();
    }

    static void run(CrmOperationsDatabaseChecks fixture) {
        new CrmActivityCalendarDatabaseChecks(fixture).currentOverdue();
    }

    private void currentOverdue() {
        LocalDateTime past = LocalDateTime.now().minusDays(2).withNano(0);
        LocalDateTime future = LocalDateTime.now().plusDays(2).withNano(0);
        CrmActivityDetailVO planned = create("TASK", "PLANNED", past, 0);
        CrmActivityDetailVO progress = create("TASK", "IN_PROGRESS", past.plusHours(2), 0);
        CrmActivityDetailVO upcoming = create("TASK", "PLANNED", future, 1);
        CrmActivityDetailVO meeting = create("MEETING", "PLANNED", past, 1);
        CrmActivityDetailVO call = create("CALL", "IN_PROGRESS", past, 1);
        CrmActivityDetailVO completed = create("TASK", "COMPLETED", past, 1);
        CrmActivityDetailVO cancelled = create("TASK", "CANCELLED", past, 1);
        CrmActivityDetailVO notHeld = create("TASK", "NOT_HELD", past, 1);
        Set<Long> expected = Set.of(planned.getActivity().getActivityId(), progress.getActivity().getActivityId());
        List<Map<String, Object>> before = fixture.jdbc.queryForList("SELECT * FROM crm_activity WHERE customer_id=? ORDER BY activity_id", customerId);
        PageResult<CrmActivity> all = page(null, null, 1, 20);
        equal(8L, all.getTotal(), "calendar retains all states in the unfiltered list");
        for (CrmActivity activity : all.getRows()) {
            int flag = expected.contains(activity.getActivityId()) ? 1 : 0;
            equal(flag, activity.getOverdueFlag(), "calendar list derives current overdue independently of old stored flag");
            equal(flag, activities.detail(activity.getActivityId()).getActivity().getOverdueFlag(), "activity detail agrees with current calendar overdue flag");
        }
        PageResult<CrmActivity> overdue = page("OVERDUE", null, 1, 20);
        equal(expected, new HashSet<>(overdue.getRows().stream().map(CrmActivity::getActivityId).toList()), "overdue view includes newly elapsed deadlines and excludes terminal or non-task rows");
        equal(2L, overdue.getTotal(), "overdue count uses current deadlines before pagination");
        equal(6L, page(null, 0, 1, 20).getTotal(), "non-overdue filter excludes elapsed tasks despite their old zero flag");
        equal(2L, page(null, 1, 1, 20).getTotal(), "explicit overdue filter agrees with personal view");
        ArrayList<Long> paged = new ArrayList<>();
        for (int number = 1; number <= 2; number++) {
            PageResult<CrmActivity> part = page("OVERDUE", null, number, 1);
            equal(2L, part.getTotal(), "overdue pagination retains accurate total");
            equal(1, part.getRows().size(), "overdue pagination returns one current matching activity");
            paged.add(part.getRows().get(0).getActivityId());
        }
        equal(expected, new HashSet<>(paged), "overdue pagination has no omissions or duplicates");
        equal(0, page("OVERDUE", null, 3, 1).getRows().size(), "overdue pagination ends after matching rows");
        equal(before, fixture.jdbc.queryForList("SELECT * FROM crm_activity WHERE customer_id=? ORDER BY activity_id", customerId), "calendar and detail reads do not update stored flags, audit timestamps or versions");

        CrmActivityParticipant member = new CrmActivityParticipant(); member.setParticipantType("USER"); member.setParticipantRefId(2L);
        CrmActivityRequest invitation = new CrmActivityRequest(); invitation.setActivity(activities.detail(planned.getActivity().getActivityId()).getActivity());
        invitation.setParticipants(List.of(member)); activities.save(invitation);
        identity(100000L, 2L, 4);
        equal(List.of(planned.getActivity().getActivityId()), page("OVERDUE", null, 1, 20).getRows().stream().map(CrmActivity::getActivityId).toList(), "participant current overdue view includes only its shared activity");
        equal(1, activities.detail(planned.getActivity().getActivityId()).getActivity().getOverdueFlag(), "participant detail displays current overdue status");
        identity(100000L, 3L, 4);
        equal(0L, page(null, 1, 1, 20).getTotal(), "unrelated user cannot enumerate overdue activities");
        identity(100001L, 1L, 0);
        equal(0L, page(null, 1, 1, 20).getTotal(), "foreign tenant cannot enumerate overdue activities");
        identity();
        for (CrmActivityDetailVO value : List.of(planned, progress, upcoming, meeting, call, completed, cancelled, notHeld)) activities.delete(value.getActivity().getActivityId());
    }

    private CrmActivityDetailVO create(String type, String status, LocalDateTime start, int storedFlag) {
        CrmActivity activity = new CrmActivity(); activity.setSubject("calendar current overdue " + type + " " + status);
        activity.setActivityType(type); activity.setStatus(status); activity.setBizType("CUSTOMER"); activity.setBizId(customerId);
        activity.setStartTime(start); activity.setEndTime(start.plusHours(1));
        CrmActivityRequest request = new CrmActivityRequest(); request.setActivity(activity); request.setReminders(List.of());
        CrmActivityDetailVO saved = activities.save(request);
        fixture.jdbc.update("UPDATE crm_activity SET overdue_flag=? WHERE activity_id=?", storedFlag, saved.getActivity().getActivityId());
        return saved;
    }

    private PageResult<CrmActivity> page(String view, Integer overdueFlag, int number, int size) {
        CrmActivityQuery query = new CrmActivityQuery(); query.setCustomerId(customerId); query.setView(view); query.setOverdueFlag(overdueFlag);
        PageQuery paging = new PageQuery(); paging.setPageNum(number); paging.setPageSize(size);
        return activities.page(query, paging);
    }
}
