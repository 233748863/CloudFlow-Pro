package com.cloudflow.auth.mapper;

import com.cloudflow.common.holiday.domain.HolidayDate;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface HolidayDateWriteMapper {
    Long lockTenant(@Param("tenantId") Long tenantId);

    List<HolidayCalendar> lockDefaultCalendars(@Param("tenantId") Long tenantId, @Param("exceptId") Long exceptId);

    Long lockCalendar(@Param("calendarId") Long calendarId, @Param("tenantId") Long tenantId);

    int saveDate(@Param("row") HolidayDate row);
}
