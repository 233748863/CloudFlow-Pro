package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.holiday.domain.DayTypeInfo;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.cloudflow.oa.domain.OaMeetingReminder;
import com.cloudflow.oa.domain.SysScheduleEvent;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaMeetingMapper {
    MeetingRoom lockRoom(@Param("tenantId") Long tenantId, @Param("id") Long id);
    SysScheduleEvent lockEvent(@Param("tenantId") Long tenantId, @Param("id") Long id);
    SysScheduleEvent visibleToManager(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("dataScope") DataScope dataScope);
    List<SysScheduleEvent> occupied(@Param("tenantId") Long tenantId, @Param("roomId") Long roomId,
                                    @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
    List<SysScheduleEvent> futureForRoom(@Param("tenantId") Long tenantId, @Param("roomId") Long roomId, @Param("now") LocalDateTime now);
    List<SysScheduleEvent> readOccupied(@Param("tenantId") Long tenantId, @Param("roomId") Long roomId,
                                        @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
    Page<MeetingRoom> rooms(Page<MeetingRoom> page, @Param("tenantId") Long tenantId,
                            @Param("capacity") Integer capacity, @Param("tags") List<String> tags);
    List<OaMeetingReminder> reminders(@Param("tenantId") Long tenantId, @Param("id") Long id);
    Long minutesId(@Param("tenantId") Long tenantId, @Param("id") Long id);
    int photoAllowed(@Param("tenantId") Long tenantId, @Param("roomId") Long roomId, @Param("fileId") Long fileId);
    int calendarAllowed(@Param("tenantId") Long tenantId, @Param("calendarId") Long calendarId);
    Page<com.cloudflow.oa.domain.vo.MeetingViews.CalendarOption> calendars(Page<com.cloudflow.oa.domain.vo.MeetingViews.CalendarOption> page, @Param("tenantId") Long tenantId);
    List<SysScheduleEvent> series(@Param("tenantId") Long tenantId, @Param("id") Long id);
    List<SysScheduleEvent> participantBusy(@Param("tenantId") Long tenantId, @Param("userIds") List<Long> userIds,
                                          @Param("start") LocalDateTime start, @Param("end") LocalDateTime end,
                                          @Param("excludeId") Long excludeId);
    Page<SysScheduleEvent> mine(Page<SysScheduleEvent> page, @Param("tenantId") Long tenantId, @Param("userId") Long userId,
                                @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
    List<OaMeetingAttendance> attendees(@Param("tenantId") Long tenantId, @Param("id") Long id);
    int saveEvent(@Param("event") SysScheduleEvent event);
    int saveRoomRule(@Param("room") MeetingRoom room);
    int saveInvitation(@Param("invitation") OaMeetingAttendance invitation);
    int approverAllowed(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    DayTypeInfo calendarFact(@Param("tenantId") Long tenantId, @Param("calendarId") Long calendarId, @Param("date") LocalDate date);
    List<Long> expiredPending(@Param("tenantId") Long tenantId, @Param("now") LocalDateTime now, @Param("afterId") Long afterId);
}
