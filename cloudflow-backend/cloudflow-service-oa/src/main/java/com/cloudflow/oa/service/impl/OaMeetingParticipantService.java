package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.ParticipantBusy;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.vo.MeetingViews;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.cloudflow.oa.service.remote.RemoteCrmParticipantBusyService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@org.springframework.transaction.annotation.Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
public class OaMeetingParticipantService {
    private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private final OaMeetingMapper meetings;
    private final OaMeetingAccess access;
    private final OaMeetingInvitationService invitations;
    private final OaIdentityReferenceMapper identities;
    private final RemoteCrmParticipantBusyService crm;

    public MeetingViews.ParticipantConflicts query(List<Long> people, LocalDateTime start, LocalDateTime end, Long excludeId) {
        OaMeetingQueryService.window(start, end);
        if (excludeId != null) access.own(access.get(excludeId));
        return check(people, List.of(new OaMeetingRecurrence.Occurrence(start, end)), excludeId == null ? Set.of() : Set.of(excludeId));
    }

    public MeetingViews.ParticipantConflicts check(SysScheduleEvent event, Long excludeId) {
        if (!"MEETING".equals(event.getType())) return empty();
        return check(invitations.userIds(event.getAttendees()), List.of(new OaMeetingRecurrence.Occurrence(event.getStartTime(), event.getEndTime())),
                excludeId == null ? Set.of() : Set.of(excludeId));
    }

    public MeetingViews.ParticipantConflicts check(SysScheduleEvent event, List<OaMeetingRecurrence.Occurrence> windows, Set<Long> excluded) {
        return check(invitations.userIds(event.getAttendees()), windows, excluded);
    }

    MeetingViews.ParticipantConflicts check(List<Long> people, List<OaMeetingRecurrence.Occurrence> windows, Set<Long> excluded) {
        OaMeetingRules.require(people != null && !people.isEmpty() && people.size() <= 500
                && people.stream().allMatch(userId -> userId != null && userId > 0), "MEETING_ATTENDEES_INVALID", "参会人范围无效");
        List<Long> requested = people.stream().distinct().sorted().toList();
        for (Long userId : requested) OaRecordSupport.require(identities.user(userId, OaRecordSupport.tenantId()), "参会人不存在或已停用");
        if (windows.isEmpty()) return empty();
        List<ParticipantBusy> result = new ArrayList<>();
        boolean verified = true;
        LocalDateTime first = windows.stream().map(OaMeetingRecurrence.Occurrence::startTime).min(LocalDateTime::compareTo).orElseThrow();
        LocalDateTime last = windows.stream().map(OaMeetingRecurrence.Occurrence::endTime).max(LocalDateTime::compareTo).orElseThrow();
        for (LocalDateTime cursor = first; cursor.isBefore(last); cursor = cursor.plusDays(31)) {
            LocalDateTime end = cursor.plusDays(31).isBefore(last) ? cursor.plusDays(31) : last;
            LocalDateTime start = cursor;
            if (windows.stream().noneMatch(window -> window.startTime().isBefore(end) && window.endTime().isAfter(start))) continue;
            for (SysScheduleEvent event : meetings.participantBusy(OaRecordSupport.tenantId(), requested, start, end, null)) {
                if (excluded.contains(event.getEventId()) || !overlaps(event.getStartTime(), event.getEndTime(), windows)) continue;
                Set<Long> busyUsers = meetings.attendees(event.getTenantId(), event.getEventId()).stream()
                        .filter(invitation -> Integer.valueOf(0).equals(invitation.getDeleted()) && !"DECLINED".equals(invitation.getAcceptanceStatus()))
                        .map(com.cloudflow.oa.domain.OaMeetingAttendance::getUserId).collect(Collectors.toSet());
                busyUsers.add(event.getCreatorId());
                boolean visible = access.visible(event);
                for (Long userId : requested) {
                    if (!busyUsers.contains(userId)) continue;
                    ParticipantBusy busy = new ParticipantBusy(); busy.setUserId(userId); busy.setModule("OA");
                    busy.setBusinessId(visible ? event.getEventId() : null); busy.setTitle(visible ? event.getTitle() : "忙碌时段");
                    busy.setDetailsVisible(visible); busy.setStartTime(event.getStartTime()); busy.setEndTime(event.getEndTime()); result.add(busy);
                }
            }
            try {
                R<List<ParticipantBusy>> response = crm.query(requested, start.format(FORMAT), end.format(FORMAT));
                if (response == null || !response.isSuccess() || response.getData() == null) verified = false;
                else for (ParticipantBusy busy : response.getData()) {
                    if (busy == null || !requested.contains(busy.getUserId()) || !"CRM".equals(busy.getModule())
                            || busy.getStartTime() == null || busy.getEndTime() == null) { verified = false; continue; }
                    if (!busy.isDetailsVisible()) { busy.setBusinessId(null); busy.setTitle("忙碌时段"); }
                    if (overlaps(busy.getStartTime(), busy.getEndTime(), windows)) result.add(busy);
                }
            } catch (RuntimeException failure) { verified = false; }
        }
        return new MeetingViews.ParticipantConflicts(result.stream().distinct().toList(), verified, verified ? null : "客户活动冲突未核实，确认后可继续预约");
    }

    static MeetingViews.ParticipantConflicts empty() { return new MeetingViews.ParticipantConflicts(List.of(), true, null); }

    void confirm(MeetingViews.ParticipantConflicts conflicts, boolean confirmed) {
        if (conflicts.confirmationRequired() && !confirmed) throw new ServiceException("MEETING_PARTICIPANT_CONFIRMATION_REQUIRED: "
                + (conflicts.crmVerified() ? "存在参与者忙碌时段，请查看提示并确认继续预约" : conflicts.warning()), 409);
    }

    private boolean overlaps(LocalDateTime start, LocalDateTime end, List<OaMeetingRecurrence.Occurrence> windows) {
        return windows.stream().anyMatch(window -> start.isBefore(window.endTime()) && end.isAfter(window.startTime()));
    }
}
