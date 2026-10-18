package com.cloudflow.common.holiday.config;

import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.AutoConfiguration;

/**
 * 节假日日历自动配置。
 */
@AutoConfiguration
@MapperScan(basePackageClasses = HolidayCalendarMapper.class)
public class HolidayAutoConfiguration {
}
