package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmActivity;
import com.cloudflow.crm.domain.CrmActivityParticipant;
import com.cloudflow.crm.domain.dto.CrmActivityQuery;
import com.cloudflow.crm.domain.dto.CrmActivityRequest;
import com.cloudflow.crm.domain.vo.CrmActivityDetailVO;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmActivityScopeDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmActivityService activities;
    private final LocalDateTime start = LocalDateTime.now().plusYears(4).withHour(10).withMinute(0).withSecond(0).withNano(0);

    private CrmActivityScopeDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture;
        this.activities = fixture.bean(CrmActivityService.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) {
        new CrmActivityScopeDatabaseChecks(fixture).departmentAndInvitationScopes();
    }

    private void departmentAndInvitationScopes() {
        CrmActivityDetailVO own = create(100000L, 1L, 9101L, "own");
        CrmActivityDetailVO sameDepartment = create(100000L, 3L, 9101L, "same-department");
        CrmActivityDetailVO childDepartment = create(100000L, 4L, 9102L, "child-department");
        CrmActivityDetailVO invited = create(100000L, 2L, 9103L, "invited-outside", 1L);
        CrmActivityDetailVO unrelated = create(100000L, 3L, 9103L, "unrelated-outside");
        CrmActivityDetailVO foreign = create(100001L, 1L, 9101L, "foreign-tenant");
        Long ownId = own.getActivity().getActivityId();
        Long sameId = sameDepartment.getActivity().getActivityId();
        Long childId = childDepartment.getActivity().getActivityId();
        Long invitedId = invited.getActivity().getActivityId();
        Long unrelatedId = unrelated.getActivity().getActivityId();
        Long foreignId = foreign.getActivity().getActivityId();
        List<Map<String, Object>> before = fixture.jdbc.queryForList("SELECT * FROM crm_activity WHERE subject LIKE ? ORDER BY activity_id", "activity-scope-%");
        List<Set<Long>> expectedScopes = List.of(Set.of(ownId, childId, invitedId), Set.of(ownId, sameId, childId, invitedId), Set.of(ownId, sameId, invitedId));
        List<List<Long>> departmentScopes = List.of(List.of(9102L), List.of(9101L, 9102L), List.of(9101L));
        for (int scopeType = 1; scopeType <= 3; scopeType++) {
            scope(scopeType, departmentScopes.get(scopeType - 1));
            Set<Long> expected = expectedScopes.get(scopeType - 1);
            equal(expected, ids(page(null, 1, 20)), "department scope retains own and invited activities outside permitted departments: " + scopeType);
            equal((long) expected.size(), page(null, 1, 20).getTotal(), "department scope calendar count is accurate: " + scopeType);
            equal(Set.of(ownId, invitedId), ids(page(1L, 1, 20)), "personal calendar includes invitations under department scope: " + scopeType);
            equal(invitedId, activities.detail(invitedId).getActivity().getActivityId(), "department manager can open invited activity: " + scopeType);
            fails(IllegalArgumentException.class, () -> activities.detail(unrelatedId), "department manager cannot read unrelated outside activity: " + scopeType);
            fails(IllegalArgumentException.class, () -> activities.detail(foreignId), "department scope cannot cross tenant boundary: " + scopeType);
            fails(IllegalArgumentException.class, () -> activities.changeStatus(invitedId, "COMPLETED", invited.getActivity().getVersion(), null, null, false), "invitation does not grant owner write permission: " + scopeType);
            Set<Long> paged = new HashSet<>();
            for (int pageNumber = 1; pageNumber <= expected.size(); pageNumber++) {
                PageResult<CrmActivity> result = page(null, pageNumber, 1);
                equal((long) expected.size(), result.getTotal(), "department pagination retains union count");
                equal(1, result.getRows().size(), "department pagination returns one matching activity");
                check(paged.add(result.getRows().get(0).getActivityId()), "department pagination does not duplicate own or invited rows");
            }
            equal(expected, paged, "department pagination retains all allowed activities");
            equal(0, page(null, expected.size() + 1, 1).getRows().size(), "department pagination ends after allowed activities");
        }
        for (int scopeType : List.of(1, 2, 3, 4, 99)) {
            scope(scopeType, List.of());
            equal(Set.of(ownId, invitedId), ids(page(null, 1, 20)), "empty or unknown scope retains only owned and invited activities: " + scopeType);
        }
        scope(0, List.of());
        equal(Set.of(ownId, sameId, childId, invitedId, unrelatedId), ids(page(null, 1, 20)), "all-data scope remains complete within the current tenant");
        equal(before, fixture.jdbc.queryForList("SELECT * FROM crm_activity WHERE subject LIKE ? ORDER BY activity_id", "activity-scope-%"), "scope reads and denied writes retain original activity rows");
        scope(3, List.of(9101L));
        activities.respond(invitedId, "DECLINED");
        equal(invitedId, activities.detail(invitedId).getActivity().getActivityId(), "declined participant retains invitation details");
        check(ids(page(null, 1, 20)).contains(invitedId), "declined participant retains calendar access");
        identity(100000L, 2L, 0);
        CrmActivityRequest removal = new CrmActivityRequest(); removal.setActivity(activities.detail(invitedId).getActivity()); removal.setParticipants(List.of());
        UserContext.setDeptId(9103L); activities.save(removal);
        scope(3, List.of(9101L));
        equal(Set.of(ownId, sameId), ids(page(null, 1, 20)), "removed outside participant loses calendar visibility");
        fails(IllegalArgumentException.class, () -> activities.detail(invitedId), "removed outside participant loses detail visibility");
        identity();
    }

    private CrmActivityDetailVO create(Long tenantId, Long ownerId, Long departmentId, String suffix, Long... participants) {
        identity(tenantId, ownerId, 0); UserContext.setDeptId(departmentId);
        CrmActivity activity = new CrmActivity();
        activity.setSubject("activity-scope-" + suffix); activity.setActivityType("MEETING"); activity.setStatus("PLANNED");
        activity.setBizType("NONE"); activity.setStartTime(start); activity.setEndTime(start.plusHours(1));
        CrmActivityRequest request = new CrmActivityRequest(); request.setActivity(activity);
        request.setParticipants(Arrays.stream(participants).map(participantId -> {
            CrmActivityParticipant participant = new CrmActivityParticipant();
            participant.setParticipantType("USER"); participant.setParticipantRefId(participantId); return participant;
        }).toList());
        request.setReminders(List.of()); return activities.save(request);
    }

    private void scope(int scopeType, List<Long> departments) {
        identity(100000L, 1L, scopeType); UserContext.setDeptId(9101L); UserContext.setDsDeptIds(departments);
    }

    private PageResult<CrmActivity> page(Long ownerId, int number, int size) {
        CrmActivityQuery query = new CrmActivityQuery(); query.setSubject("activity-scope-");
        query.setStart(start); query.setEnd(start.plusDays(1)); query.setOwnerId(ownerId);
        PageQuery page = new PageQuery(); page.setPageNum(number); page.setPageSize(size);
        return activities.page(query, page);
    }

    private Set<Long> ids(PageResult<CrmActivity> result) {
        return new HashSet<>(result.getRows().stream().map(CrmActivity::getActivityId).toList());
    }
}
