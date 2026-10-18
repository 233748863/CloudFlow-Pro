package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.domain.vo.MeetingViews;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OaMeetingRoomRuleService {
    private final OaMeetingMapper meetings;
    private final OaMeetingCalendarService calendars;
    private final OaMeetingQueryService queries;
    private final IOaTraceEventService trace;
    private final ObjectMapper json;

    public com.cloudflow.common.core.domain.PageResult<MeetingViews.CalendarOption> calendars(int pageNum, int pageSize) {
        OaMeetingRules.require(pageNum > 0 && pageSize > 0 && pageSize <= 50, "MEETING_PAGE_INVALID", "页码须大于0，每页最多50条");
        return com.cloudflow.common.core.domain.PageResult.build(meetings.calendars(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(pageNum, pageSize), OaRecordSupport.tenantId()));
    }

    @Transactional
    public MeetingViews.RulePreview preview(Long id, MeetingCommands.Rule command) {
        MeetingRoom original = locked(id, command);
        return analyze(original, prepared(original, command));
    }

    @Transactional
    @Audit(name = "配置会议室预约规则", highRisk = true)
    public MeetingRoom save(Long id, MeetingCommands.Rule command) {
        MeetingRoom original = locked(id, command);
        MeetingRoom changed = prepared(original, command);
        MeetingViews.RulePreview preview = analyze(original, changed);
        if (!preview.affected().isEmpty()) {
            OaMeetingRules.require(command.isConfirmExistingConflicts() && Objects.equals(command.getImpactDigest(), preview.impactDigest()),
                    "ROOM_RULE_CONFIRMATION_REQUIRED", "请先查看存量预约影响清单，再确认仅对新预约使用新规则");
        }
        OaRecordSupport.touch(changed); OaRecordSupport.saved(meetings.saveRoomRule(changed));
        changed.setVersion(Math.addExact(changed.getVersion(), 1));
        trace.record(changed.getTenantId(), "MEETING_ROOM", id, "MEETING_ROOM", id, "MEETING_ROOM_RULE_CHANGED",
                "保存预约规则，存量预约保持原缓冲快照", preview.impactDigest(), UserContext.getUserId(), OaRecordSupport.userName(), write(changed));
        return changed;
    }

    private MeetingRoom locked(Long id, MeetingCommands.Rule command) {
        OaRecordSupport.require(command, "会议室规则不能为空");
        MeetingRoom room = meetings.lockRoom(OaRecordSupport.tenantId(), OaRecordSupport.require(id, "会议室ID不能为空"));
        if (room == null || !Objects.equals(room.getTenantId(), OaRecordSupport.tenantId())) throw OaMeetingRules.error("ROOM_UNAVAILABLE", "会议室不存在或不可核实");
        OaMeetingAccess.version(command.getVersion(), room.getVersion());
        return room;
    }

    private MeetingRoom prepared(MeetingRoom original, MeetingCommands.Rule command) {
        MeetingRoom changed = new MeetingRoom(); BeanUtils.copyProperties(original, changed);
        changed.setEquipmentTags(command.getEquipmentTags() == null ? null : write(command.getEquipmentTags()));
        changed.setBookableWeekdays(command.getBookableWeekdays() == null ? null : write(command.getBookableWeekdays()));
        changed.setOpenTime(command.getOpenTime()); changed.setCloseTime(command.getCloseTime());
        changed.setHolidayCalendarId(command.getHolidayCalendarId()); changed.setHolidayBookableFlag(command.getHolidayBookableFlag() == null ? 1 : command.getHolidayBookableFlag());
        changed.setMinBookingMinutes(command.getMinBookingMinutes() == null ? 1 : command.getMinBookingMinutes()); changed.setMaxBookingMinutes(command.getMaxBookingMinutes());
        changed.setAdvanceBookingDays(command.getAdvanceBookingDays()); changed.setNeedApprovalFlag(command.getNeedApprovalFlag() == null ? 0 : command.getNeedApprovalFlag());
        changed.setApproverId(command.getApproverId()); changed.setBufferMinutes(command.getBufferMinutes() == null ? 0 : command.getBufferMinutes());
        changed.setPhotoFileId(command.getPhotoFileId()); OaMeetingRules.room(changed);
        if (changed.getHolidayCalendarId() != null) OaMeetingRules.require(meetings.calendarAllowed(changed.getTenantId(), changed.getHolidayCalendarId()) == 1,
                "ROOM_CALENDAR_UNAVAILABLE", "须选择本租户启用的节假日日历");
        if (changed.getPhotoFileId() != null) OaMeetingRules.require(meetings.photoAllowed(changed.getTenantId(), changed.getRoomId(), changed.getPhotoFileId()) == 1,
                "ROOM_PHOTO_INVALID", "须从本会议室照片入口选择有效图片");
        if (Integer.valueOf(1).equals(changed.getNeedApprovalFlag())) OaMeetingRules.require(meetings.approverAllowed(changed.getTenantId(), changed.getApproverId()) > 0,
                "MEETING_APPROVER_UNAVAILABLE", "审批人不存在、未启用或没有流程办理权限");
        return changed;
    }

    private MeetingViews.RulePreview analyze(MeetingRoom original, MeetingRoom changed) {
        List<MeetingViews.RuleImpact> affected = new ArrayList<>();
        List<SysScheduleEvent> events = meetings.futureForRoom(original.getTenantId(), original.getRoomId(), LocalDateTime.now());
        for (SysScheduleEvent event : events) {
            String reason = null;
            try {
                OaMeetingRules.booking(changed, event.getStartTime(), event.getEndTime(), event.getExpectedAttendees(), null, queries.maximumMinutes(), calendars::verified);
                if (changed.getAdvanceBookingDays() != null && event.getStartTime().toLocalDate().isAfter(java.time.LocalDate.now().plusDays(changed.getAdvanceBookingDays()))) reason = "预约日期超过新提前天数限制";
            } catch (ServiceException failure) { reason = failure.getMessage(); }
            if (reason == null && OaMeetingRules.buffer(changed) > event.getBufferMinutesSnapshot()) reason = "会后缓冲扩大；本预约仍保留原" + event.getBufferMinutesSnapshot() + "分钟快照";
            if (reason == null && !Objects.equals(original.getNeedApprovalFlag(), changed.getNeedApprovalFlag())) reason = "新审批规则仅适用于后续提交；本预约保留原审批状态";
            if (reason != null) affected.add(new MeetingViews.RuleImpact(event.getEventId(), event.getTitle(), event.getStartTime(), reason));
        }
        String digest = MessagePayloadCodec.digest(json.valueToTree(Map.of("room", changed, "events", events)), json);
        return new MeetingViews.RulePreview(List.copyOf(affected), digest, "已有预约、邀请及缓冲快照保持原值；确认后新规则只用于后续创建、改期和提交");
    }

    private String write(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception failure) { throw new IllegalArgumentException("会议室规则格式无效", failure); }
    }
}
