package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.mapper.MeetingRoomMapper;
import com.cloudflow.oa.service.IMeetingRoomService;
import com.cloudflow.common.audit.annotation.Audit;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class MeetingRoomServiceImpl extends ServiceImpl<MeetingRoomMapper, MeetingRoom> implements IMeetingRoomService {
    private final OaMeetingMapper meetings;

    @Override
    @Transactional
    @Audit(name = "新增会议室")
    public boolean createRoom(MeetingRoom input) {
        OaRecordSupport.require(input, "会议室不能为空");
        MeetingRoom room = new MeetingRoom();
        baseFields(room, input);
        room.setEquipmentTags(input.getEquipmentTags()); room.setOpenTime(input.getOpenTime()); room.setCloseTime(input.getCloseTime());
        room.setBookableWeekdays(input.getBookableWeekdays()); room.setHolidayCalendarId(input.getHolidayCalendarId());
        room.setHolidayBookableFlag(input.getHolidayBookableFlag() == null ? 1 : input.getHolidayBookableFlag());
        room.setMinBookingMinutes(input.getMinBookingMinutes() == null ? 1 : input.getMinBookingMinutes());
        room.setMaxBookingMinutes(input.getMaxBookingMinutes()); room.setAdvanceBookingDays(input.getAdvanceBookingDays());
        room.setNeedApprovalFlag(input.getNeedApprovalFlag() == null ? 0 : input.getNeedApprovalFlag()); room.setApproverId(input.getApproverId());
        room.setBufferMinutes(input.getBufferMinutes() == null ? 0 : input.getBufferMinutes());
        OaMeetingRules.room(room);
        if (room.getHolidayCalendarId() != null) OaMeetingRules.require(meetings.calendarAllowed(OaRecordSupport.tenantId(), room.getHolidayCalendarId()) == 1,
                "ROOM_CALENDAR_UNAVAILABLE", "须选择本租户启用的节假日日历");
        if (Integer.valueOf(1).equals(room.getNeedApprovalFlag())) OaMeetingRules.require(meetings.approverAllowed(OaRecordSupport.tenantId(), room.getApproverId()) > 0,
                "MEETING_APPROVER_UNAVAILABLE", "审批人不存在、未启用或没有流程办理权限");
        OaRecordSupport.create(room, "roomId");
        OaRecordSupport.saved(baseMapper.insert(room));
        return true;
    }

    @Override
    @Transactional
    @Audit(name = "修改会议室基本信息", highRisk = true)
    public boolean updateRoom(MeetingRoom input) {
        OaRecordSupport.require(input, "会议室不能为空");
        MeetingRoom room = locked(input.getRoomId()); OaMeetingAccess.version(input.getVersion(), room.getVersion());
        baseFields(room, input);
        OaMeetingRules.room(room);
        for (SysScheduleEvent booking : meetings.futureForRoom(OaRecordSupport.tenantId(), room.getRoomId(), LocalDateTime.now())) {
            OaMeetingRules.require("1".equals(room.getStatus()) && (room.getCapacity() == null || booking.getExpectedAttendees() <= room.getCapacity()),
                    "ROOM_EXISTING_BOOKINGS", "会议室有尚未结束的预约，不能停用或将容量降至预约人数以下");
        }
        OaRecordSupport.touch(room);
        int changed = baseMapper.update(null, new LambdaUpdateWrapper<MeetingRoom>().eq(MeetingRoom::getRoomId, room.getRoomId())
                .eq(MeetingRoom::getTenantId, OaRecordSupport.tenantId()).eq(MeetingRoom::getVersion, room.getVersion())
                .set(MeetingRoom::getName, room.getName()).set(MeetingRoom::getCapacity, room.getCapacity()).set(MeetingRoom::getLocation, room.getLocation())
                .set(MeetingRoom::getEquipment, room.getEquipment()).set(MeetingRoom::getStatus, room.getStatus())
                .set(MeetingRoom::getUpdateBy, room.getUpdateBy()).set(MeetingRoom::getUpdateTime, room.getUpdateTime()).set(MeetingRoom::getVersion, room.getVersion() + 1));
        OaRecordSupport.saved(changed);
        return true;
    }

    @Override
    @Transactional
    @Audit(name = "删除未被预约占用的会议室", highRisk = true)
    public boolean removeRoom(Long id, Integer version) {
        MeetingRoom room = locked(id); OaMeetingAccess.version(version, room.getVersion());
        OaMeetingRules.require(meetings.futureForRoom(OaRecordSupport.tenantId(), id, LocalDateTime.now()).isEmpty(),
                "ROOM_EXISTING_BOOKINGS", "会议室有尚未结束的预约，不能删除");
        OaRecordSupport.saved(baseMapper.deleteById(id));
        return true;
    }

    private MeetingRoom locked(Long id) {
        MeetingRoom room = id == null ? null : meetings.lockRoom(OaRecordSupport.tenantId(), id);
        if (room == null || !Objects.equals(room.getTenantId(), OaRecordSupport.tenantId())) throw OaMeetingRules.error("ROOM_UNAVAILABLE", "会议室不存在或无权访问");
        return room;
    }

    private void baseFields(MeetingRoom target, MeetingRoom input) {
        target.setName(OaRecordSupport.text(input.getName(), 64, "会议室名称")); target.setCapacity(input.getCapacity());
        OaMeetingRules.require(input.getLocation() == null || input.getLocation().length() <= 255, "ROOM_RULE_INVALID", "位置不能超过255字");
        OaMeetingRules.require(input.getEquipment() == null || input.getEquipment().length() <= 500, "ROOM_RULE_INVALID", "设备说明不能超过500字");
        target.setLocation(input.getLocation()); target.setEquipment(input.getEquipment());
        target.setStatus(OaRecordSupport.code(input.getStatus(), "1", java.util.Set.of("1", "0")));
    }
}
