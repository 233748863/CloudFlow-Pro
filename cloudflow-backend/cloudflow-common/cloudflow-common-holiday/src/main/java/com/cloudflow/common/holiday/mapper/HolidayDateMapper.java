package com.cloudflow.common.holiday.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.holiday.domain.HolidayDate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface HolidayDateMapper extends BaseMapper<HolidayDate> {
    List<HolidayDate> selectCalendarYear(@Param("tenantId") Long tenantId, @Param("calendarId") Long calendarId,
                                        @Param("year") int year);
}
