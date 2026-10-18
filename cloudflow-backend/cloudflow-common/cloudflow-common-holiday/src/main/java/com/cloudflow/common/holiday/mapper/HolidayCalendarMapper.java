package com.cloudflow.common.holiday.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface HolidayCalendarMapper extends BaseMapper<HolidayCalendar> {
    HolidayCalendar selectEnabledById(@Param("tenantId") Long tenantId, @Param("calendarId") Long calendarId);

    HolidayCalendar selectDefaultEnabled(@Param("tenantId") Long tenantId);
}
