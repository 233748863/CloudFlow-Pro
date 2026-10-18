package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaMeetingReminder;
import com.cloudflow.oa.domain.OaTraceEvent;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaMeetingReminderMapper extends BaseMapper<OaMeetingReminder> {
    OaMeetingReminder lock(@Param("tenantId") Long tenantId, @Param("id") Long id);
    List<OaMeetingReminder> forEvent(@Param("tenantId") Long tenantId, @Param("eventId") Long eventId);
    List<OaMeetingReminder> due(@Param("tenantId") Long tenantId, @Param("now") LocalDateTime now, @Param("afterId") Long afterId);
    List<OaTraceEvent> history(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("eventType") String eventType);
    int saveState(@Param("reminder") OaMeetingReminder reminder);
}
