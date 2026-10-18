package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.config.properties.OaProperties;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.domain.vo.MeetingViews;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.cloudflow.oa.mapper.SysScheduleEventMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class OaMeetingBookingService {
    public static final String BUSINESS_TYPE = "OA_MEETING_BOOKING";
    private final OaMeetingAccess access;
    private final OaMeetingMapper meetings;
    private final SysScheduleEventMapper events;
    private final OaMeetingInvitationService invitations;
    private final OaMeetingParticipantService participants;
    private final OaMeetingReminderService reminders;
    private final OaMeetingCalendarService calendars;
    private final OaIdentityReferenceMapper identities;
    private final OaApprovalOutboxService approvals;
    private final OaMeetingWorkflowService meetingWorkflow;
    private final IOaTraceEventService trace;
    private final PlatformTransactionManager transactions;
    private final OaProperties properties;
    private final ObjectMapper json;

    @Audit(name = "创建本人会议预约")
    public SysScheduleEvent create(MeetingCommands.Booking command) {
        return create(command, "MEETING", false);
    }

    @Audit(name = "通过原日程入口创建本人预约")
    public SysScheduleEvent createLegacy(SysScheduleEvent input) {
        OaRecordSupport.require(input, "日程不能为空");
        if (input.getCreatorId() != null && !Objects.equals(input.getCreatorId(), OaMeetingAccess.userId())) throw new ServiceException("MEETING_OWNER_REQUIRED: 不可伪造日程创建人", 403);
        return create(fromLegacy(input), input.getRoomId() == null ? input.getType() : "MEETING", Boolean.TRUE.equals(input.getIsAllDay()));
    }

    private SysScheduleEvent create(MeetingCommands.Booking command, String type, boolean allDay) {
        OaMeetingRules.require(command != null && command.getRecurrenceRule() == null, "MEETING_SERIES_REQUIRED", "周期预约须使用周期会议入口");
        SysScheduleEvent event = prepared(command, type, allDay);
        MeetingViews.ParticipantConflicts conflicts = command.isDraft() ? OaMeetingParticipantService.empty() : participants.check(event, null);
        return execute(() -> {
            Map<Long, MeetingRoom> rooms = access.lockRooms(Arrays.asList(command.getRoomId()));
            MeetingRoom room = rooms.get(event.getRoomId());
            validate(event, room, null, command.isDraft());
            participants.confirm(conflicts, command.isConfirmParticipantConflicts());
            initialize(event);
            event.setApprovalStatus(command.isDraft() ? "DRAFT" : "NOT_REQUIRED");
            OaRecordSupport.saved(events.insert(event));
            if (!command.isDraft()) activate(event, room);
            record(event, "MEETING_CREATED", command.isDraft() ? "保存草稿" : "创建预约");
            return event;
        });
    }

    @Audit(name = "修改本人会议预约", highRisk = true)
    public SysScheduleEvent update(Long id, MeetingCommands.Booking command) {
        OaRecordSupport.require(command, "预约参数不能为空");
        SysScheduleEvent observed = access.get(id); access.own(observed);
        OaMeetingRules.require(command.getRecurrenceRule() == null, "MEETING_SERIES_REQUIRED", "周期主记录须使用周期会议入口");
        SysScheduleEvent changed = prepared(command, observed.getType(), Boolean.TRUE.equals(observed.getIsAllDay()));
        MeetingViews.ParticipantConflicts conflicts = command.isDraft() ? OaMeetingParticipantService.empty() : participants.check(changed, id);
        return execute(() -> {
            Map<Long, MeetingRoom> rooms = access.lockRooms(Arrays.asList(observed.getRoomId(), command.getRoomId()));
            SysScheduleEvent current = access.lock(observed); access.own(current); OaMeetingAccess.version(command.getVersion(), current.getVersion());
            editable(current);
            MeetingRoom room = rooms.get(changed.getRoomId());
            validate(changed, room, current.getEventId(), command.isDraft());
            participants.confirm(conflicts, command.isConfirmParticipantConflicts());
            changed.setEventId(current.getEventId()); changed.setTenantId(current.getTenantId()); changed.setCreatorId(current.getCreatorId());
            changed.setCreateTime(current.getCreateTime()); changed.setDeleted(0); changed.setVersion(current.getVersion());
            changed.setStatus(current.getStatus()); changed.setRecurrenceRole(current.getRecurrenceRole()); changed.setParentEventId(current.getParentEventId());
            changed.setOriginalStartTime(current.getOriginalStartTime()); changed.setSourceSeriesVersion(current.getSourceSeriesVersion());
            changed.setRecurrenceExceptionFlag("INSTANCE".equals(current.getRecurrenceRole()) ? 1 : 0);
            changed.setScheduleVersion(Math.addExact(current.getScheduleVersion(), 1));
            changed.setApprovalStatus(command.isDraft() ? "DRAFT" : "NOT_REQUIRED");
            meetingWorkflow.withdraw(current, "会议修改，作废旧版本审批");
            access.save(changed);
            if (!command.isDraft()) activate(changed, room);
            else reminders.close(changed);
            record(changed, "MEETING_UPDATED", "修改会议，旧邀请版本失效");
            return changed;
        });
    }

    @Audit(name = "通过原日程入口修改本人预约", highRisk = true)
    public SysScheduleEvent updateLegacy(SysScheduleEvent input) {
        OaRecordSupport.require(input, "日程不能为空");
        return update(OaRecordSupport.require(input.getEventId(), "日程ID不能为空"), fromLegacy(input));
    }

    @Audit(name = "提交本人会议预约审批")
    public SysScheduleEvent submit(Long id, Integer version) {
        return submit(id, version, false);
    }

    @Audit(name = "确认参与者提示并提交本人会议预约审批")
    public SysScheduleEvent submit(Long id, Integer version, boolean confirmed) {
        SysScheduleEvent observed = access.get(id); access.own(observed);
        MeetingViews.ParticipantConflicts conflicts = participants.check(observed, id);
        return execute(() -> {
            Map<Long, MeetingRoom> rooms = access.lockRooms(Arrays.asList(observed.getRoomId()));
            SysScheduleEvent event = access.lock(observed); access.own(event); OaMeetingAccess.version(version, event.getVersion()); editable(event);
            OaMeetingRules.require("DRAFT".equals(event.getApprovalStatus()), "MEETING_SUBMIT_INVALID", "仅预约草稿可以提交");
            MeetingRoom room = rooms.get(event.getRoomId());
            validate(event, room, event.getEventId(), false);
            participants.confirm(conflicts, confirmed);
            event.setApprovalStatus("NOT_REQUIRED");
            activate(event, room);
            record(event, "MEETING_SUBMITTED", "提交预约并占位");
            return event;
        });
    }

    @Audit(name = "取消本人会议预约", highRisk = true)
    public SysScheduleEvent cancel(Long id, MeetingCommands.Change command) {
        return change(id, command, "CANCELLED", false);
    }

    @Audit(name = "流转会议状态", highRisk = true)
    public SysScheduleEvent state(Long id, MeetingCommands.Change command) {
        OaRecordSupport.require(command, "状态参数不能为空");
        return change(id, command, command.targetStatus(), true);
    }

    private SysScheduleEvent change(Long id, MeetingCommands.Change command, String target, boolean managementAllowed) {
        OaRecordSupport.require(command, "状态参数不能为空");
        SysScheduleEvent observed = access.get(id);
        boolean manager = managementAllowed && access.manageable(observed);
        if (!manager) access.own(observed);
        return execute(() -> {
            access.lockRooms(Arrays.asList(observed.getRoomId()));
            SysScheduleEvent event = access.lock(observed); if (!manager) access.own(event);
            OaMeetingAccess.version(command.version(), event.getVersion());
            OaMeetingRules.transition(event, target, manager, command.reason(), LocalDateTime.now());
            boolean previouslyStarted = "IN_PROGRESS".equals(event.getStatus());
            event.setStatus(target);
            if (Set.of("CANCELLED", "NOT_HELD").contains(target)) {
                meetingWorkflow.withdraw(event, command.reason());
                event.setScheduleVersion(Math.addExact(event.getScheduleVersion(), 1));
                if (!previouslyStarted) event.setApprovalStatus("CANCELLED");
                if ("INSTANCE".equals(event.getRecurrenceRole())) event.setRecurrenceExceptionFlag(1);
            }
            access.save(event);
            if (Set.of("COMPLETED", "CANCELLED", "NOT_HELD").contains(target)) reminders.close(event);
            record(event, "MEETING_STATE_CHANGED", target + (command.reason() == null ? "" : "：" + command.reason().trim()));
            return event;
        });
    }

    @Audit(name = "回应本人受邀会议")
    public OaMeetingAttendance respond(Long id, MeetingCommands.Response command) {
        SysScheduleEvent observed = access.get(id);
        return execute(() -> {
            access.lockRooms(Arrays.asList(observed.getRoomId()));
            SysScheduleEvent event = access.lock(observed);
            OaMeetingAttendance result = invitations.respond(event, command);
            record(event, "MEETING_INVITATION_RESPONDED", command.acceptanceStatus());
            return result;
        });
    }

    SysScheduleEvent prepared(MeetingCommands.Booking command, String type, boolean allDay) {
        OaMeetingRules.interval(command.getStartTime(), command.getEndTime());
        OaMeetingRules.require("Asia/Shanghai".equals(command.getTimezoneId()), "MEETING_TIMEZONE_INVALID", "当前部署的预约时间使用Asia/Shanghai时区");
        OaMeetingRules.require(command.getDescription() == null || command.getDescription().length() <= 16000, "MEETING_DESCRIPTION_INVALID", "会议说明不能超过16000字");
        List<Long> people = new ArrayList<>(command.getAttendeeIds() == null ? List.of() : command.getAttendeeIds());
        OaMeetingRules.require(people.stream().allMatch(userId -> userId != null && userId > 0) && people.stream().distinct().count() == people.size(),
                "MEETING_ATTENDEES_INVALID", "参会人须为互异的有效用户标识");
        if (!people.contains(OaMeetingAccess.userId())) people.add(OaMeetingAccess.userId());
        people.sort(Long::compareTo);
        String encodedPeople = write(people);
        OaMeetingRules.require(encodedPeople.length() <= 1000, "MEETING_ATTENDEES_LIMIT", "参会人标识数组超过1000字符");
        for (Long userId : people) OaRecordSupport.require(identities.user(userId, OaRecordSupport.tenantId()), "参会人不存在或已停用");
        int expected = command.getExpectedAttendees() == null ? people.size() : command.getExpectedAttendees();
        OaMeetingRules.require(expected >= people.size(), "MEETING_ATTENDEES_INVALID", "预计人数不能少于发起人与受邀人员总数");
        SysScheduleEvent event = new SysScheduleEvent();
        event.setTitle(OaRecordSupport.text(command.getTitle(), 255, "会议标题")); event.setDescription(command.getDescription());
        event.setStartTime(command.getStartTime()); event.setEndTime(command.getEndTime()); event.setRoomId(command.getRoomId());
        event.setCreatorId(OaMeetingAccess.userId()); event.setTenantId(OaRecordSupport.tenantId()); event.setExpectedAttendees(expected); event.setAttendees(encodedPeople);
        event.setIsAllDay(allDay); event.setType(OaRecordSupport.code(type, "PERSONAL", Set.of("MEETING", "WORK", "PERSONAL")));
        if (event.getRoomId() != null) event.setType("MEETING");
        event.setJoinUrl(OaMeetingRules.joinUrl(command.getJoinUrl()));
        event.setMeetingPlatform(command.getMeetingPlatform() == null || command.getMeetingPlatform().isBlank() ? null : OaRecordSupport.text(command.getMeetingPlatform(), 30, "会议平台"));
        event.setReminders(write(OaMeetingRules.reminders(command.getReminders()))); event.setTimezoneId(command.getTimezoneId());
        return event;
    }

    void initialize(SysScheduleEvent event) {
        event.setEventId(null); event.setCreateTime(LocalDateTime.now()); event.setUpdateTime(event.getCreateTime()); event.setDeleted(0);
        event.setVersion(0); event.setScheduleVersion(1); event.setRecurrenceRole("SINGLE"); event.setRecurrenceExceptionFlag(0); event.setStatus("PLANNED");
    }

    private void validate(SysScheduleEvent event, MeetingRoom room, Long excludeId, boolean draft) {
        validateAgainst(event, room, excludeId == null ? Set.of() : Set.of(excludeId), draft);
    }

    void validateAgainst(SysScheduleEvent event, MeetingRoom room, Set<Long> excludedIds, boolean draft) {
        if (room != null) {
            OaMeetingRules.booking(room, event.getStartTime(), event.getEndTime(), event.getExpectedAttendees(), LocalDateTime.now(),
                    Math.multiplyExact(properties.getMeetingRoom().getMaxBookingHours(), 60), calendars::verified);
            event.setBufferMinutesSnapshot(OaMeetingRules.buffer(room));
            if (!draft) {
                for (SysScheduleEvent occupied : meetings.occupied(OaRecordSupport.tenantId(), room.getRoomId(), event.getStartTime(),
                        event.getEndTime().plusMinutes(event.getBufferMinutesSnapshot()))) {
                    if (!excludedIds.contains(occupied.getEventId()) && OaMeetingRules.overlaps(event.getStartTime(), event.getEndTime(), event.getBufferMinutesSnapshot(), occupied)) {
                        throw new ServiceException("MEETING_ROOM_CONFLICT: " + event.getStartTime().toLocalDate() + "的会议室时段或会后间隔已被占用", 409);
                    }
                }
                if (Integer.valueOf(1).equals(room.getNeedApprovalFlag())) checkApprover(room.getApproverId(), event.getCreatorId());
            }
        } else {
            OaMeetingRules.require(event.getRoomId() == null, "ROOM_UNAVAILABLE", "会议室不可核实");
            OaMeetingRules.require(!event.getStartTime().isBefore(LocalDateTime.now().minusMinutes(1)), "MEETING_IN_PAST", "不能新增过去的日程");
            event.setBufferMinutesSnapshot(0);
        }
    }

    void activate(SysScheduleEvent event, MeetingRoom room) {
        if (room != null && Integer.valueOf(1).equals(room.getNeedApprovalFlag())) {
            checkApprover(room.getApproverId(), event.getCreatorId());
            Map<String, Object> values = new LinkedHashMap<>();
            values.put("applicantId", event.getCreatorId().toString()); values.put("approverIds", List.of(room.getApproverId().toString()));
            values.put("_hExcludedUserIds", List.of(event.getCreatorId().toString())); values.put("roomId", room.getRoomId().toString());
            values.put("meetingTitle", event.getTitle()); values.put("startTime", event.getStartTime().toString()); values.put("endTime", event.getEndTime().toString());
            values.put("scheduleVersion", event.getScheduleVersion());
            event.setInstanceId(approvals.queue(BUSINESS_TYPE, event.getEventId(), "MEETING-" + event.getEventId(), "oa_meeting_booking", values));
            event.setApprovalStatus("PENDING");
        }
        invitations.synchronize(event, invitations.userIds(event.getAttendees()));
        access.save(event);
        if ("MEETING".equals(event.getType())) reminders.synchronize(event);
    }

    public void checkApprover(Long approverId, Long applicantId) {
        OaMeetingRules.require(approverId != null && !Objects.equals(approverId, applicantId), "MEETING_SELF_APPROVAL_FORBIDDEN", "会议室审批人不能是预约发起人，请管理员配置合法替代审批人");
        OaMeetingRules.require(meetings.approverAllowed(OaRecordSupport.tenantId(), approverId) > 0, "MEETING_APPROVER_UNAVAILABLE", "会议室审批人未启用或没有流程办理权限");
    }

    private void editable(SysScheduleEvent event) {
        OaMeetingRules.require("PLANNED".equals(event.getStatus()) && !"SERIES".equals(event.getRecurrenceRole()) && event.getStartTime().isAfter(LocalDateTime.now()),
                "MEETING_EDIT_CLOSED", "仅尚未开始的计划会议可以修改或提交");
    }

    public void record(SysScheduleEvent event, String action, String message) {
        trace.record(event.getTenantId(), BUSINESS_TYPE, event.getEventId(), "MEETING", event.getEventId(), action,
                message, String.valueOf(event.getScheduleVersion()), com.cloudflow.common.core.context.UserContext.getUserId(), OaRecordSupport.userName(), write(event));
    }

    private MeetingCommands.Booking fromLegacy(SysScheduleEvent input) {
        MeetingCommands.Booking command = new MeetingCommands.Booking();
        command.setVersion(input.getVersion()); command.setTitle(input.getTitle()); command.setDescription(input.getDescription());
        command.setRoomId(input.getRoomId()); command.setStartTime(input.getStartTime()); command.setEndTime(input.getEndTime());
        command.setAttendeeIds(invitations.userIds(input.getAttendees())); command.setExpectedAttendees(input.getExpectedAttendees());
        command.setJoinUrl(input.getJoinUrl()); command.setMeetingPlatform(input.getMeetingPlatform());
        command.setConfirmParticipantConflicts(input.isConfirmParticipantConflicts());
        if (input.getReminders() != null) {
            try { command.setReminders(json.readValue(input.getReminders(), new com.fasterxml.jackson.core.type.TypeReference<List<MeetingCommands.Reminder>>() { })); }
            catch (Exception failure) { throw OaMeetingRules.error("MEETING_REMINDER_INVALID", "提醒设置格式无效"); }
        }
        return command;
    }

    private String write(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception failure) { throw new IllegalArgumentException("会议数据格式无效", failure); }
    }

    private <Value> Value execute(Supplier<Value> work) { return new TransactionTemplate(transactions).execute(status -> work.get()); }
}
