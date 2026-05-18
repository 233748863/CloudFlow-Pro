package com.cloudflow.oa.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.MeetingRoomBookingCreateDTO;
import com.cloudflow.oa.domain.vo.MeetingRoomBookingVO;
import com.cloudflow.oa.service.IMeetingRoomService;
import com.cloudflow.oa.service.ISysScheduleService;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * OA内部日程接口
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/inner/oa/schedule")
public class InnerScheduleController {

    private final ISysScheduleService scheduleService;
    private final IMeetingRoomService meetingRoomService;

    @Inner(allowedServices = "cloudflow-service-hr")
    @PostMapping("/meeting-room-booking")
    public R<MeetingRoomBookingVO> createMeetingRoomBooking(@RequestBody MeetingRoomBookingCreateDTO dto) {
        String message = validate(dto);
        if (message != null) {
            return R.fail(message);
        }

        MeetingRoom room = meetingRoomService.getById(dto.getRoomId());
        Long tenantId = UserContext.getTenantId();
        if (room == null || (tenantId != null && !tenantId.equals(room.getTenantId()))) {
            return R.fail("会议室不存在");
        }
        if (!"1".equals(room.getStatus())) {
            return R.fail("会议室不可用");
        }

        SysScheduleEvent event = new SysScheduleEvent();
        event.setTenantId(tenantId);
        event.setTitle(dto.getTitle());
        event.setDescription(dto.getDescription());
        event.setStartTime(dto.getStartTime());
        event.setEndTime(dto.getEndTime());
        event.setIsAllDay(false);
        event.setType("MEETING");
        event.setRoomId(dto.getRoomId());
        event.setCreatorId(dto.getCreatorId() != null ? dto.getCreatorId() : UserContext.getUserId());
        event.setAttendees(dto.getAttendees());
        event.setDeleted(0);

        try {
            boolean saved = scheduleService.createEvent(event);
            if (!saved) {
                return R.fail("会议室预订失败");
            }
        } catch (RuntimeException e) {
            return R.fail(e.getMessage());
        }

        MeetingRoomBookingVO vo = new MeetingRoomBookingVO();
        vo.setEventId(event.getEventId());
        vo.setRoomId(room.getRoomId());
        vo.setRoomName(room.getName());
        vo.setRoomLocation(room.getLocation());
        vo.setLocationSnapshot(buildLocationSnapshot(room));
        return R.ok(vo);
    }

    private String validate(MeetingRoomBookingCreateDTO dto) {
        if (dto == null) {
            return "会议室预订参数不能为空";
        }
        if (dto.getRoomId() == null) {
            return "会议室ID不能为空";
        }
        if (!StringUtils.hasText(dto.getTitle())) {
            return "日程标题不能为空";
        }
        if (dto.getStartTime() == null) {
            return "开始时间不能为空";
        }
        if (dto.getEndTime() == null) {
            return "结束时间不能为空";
        }
        if (!dto.getEndTime().isAfter(dto.getStartTime())) {
            return "结束时间必须晚于开始时间";
        }
        return null;
    }

    private String buildLocationSnapshot(MeetingRoom room) {
        if (StringUtils.hasText(room.getLocation())) {
            return room.getName() + " / " + room.getLocation();
        }
        return room.getName();
    }
}
