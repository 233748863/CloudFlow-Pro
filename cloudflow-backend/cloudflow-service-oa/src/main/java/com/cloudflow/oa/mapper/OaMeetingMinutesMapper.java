package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaMeetingMinutes;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaMeetingMinutesMapper extends BaseMapper<OaMeetingMinutes> {
    Page<OaMeetingMinutes> visiblePage(Page<OaMeetingMinutes> page, @Param("tenantId") Long tenantId,
            @Param("keyword") String keyword, @Param("status") String status, @Param("meetingId") Long meetingId,
            @Param("userId") Long userId, @Param("managerAll") boolean managerAll,
            @Param("managerUser") Long managerUser, @Param("managerDepartments") List<Long> managerDepartments);
    OaMeetingMinutes lock(@Param("tenantId") Long tenantId, @Param("id") Long id);
    List<Long> forEvent(@Param("tenantId") Long tenantId, @Param("eventId") Long eventId);
    OaMeetingAttendance eventAttendance(@Param("tenantId") Long tenantId, @Param("eventId") Long eventId, @Param("userId") Long userId);
    OaMeetingAttendance minutesAttendance(@Param("tenantId") Long tenantId, @Param("minutesId") Long minutesId, @Param("userId") Long userId);
    OaMeetingAttendance lockAttendance(@Param("tenantId") Long tenantId, @Param("id") Long id);
    int bindAttendance(@Param("tenantId") Long tenantId, @Param("eventId") Long eventId, @Param("minutesId") Long minutesId);
    int unlinkAttendance(@Param("tenantId") Long tenantId, @Param("minutesId") Long minutesId);
    int saveAttendance(@Param("row") OaMeetingAttendance row);
}
