package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.OvertimeApplication;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.Map;

/**
 * 加班申请Mapper接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Mapper
public interface OvertimeApplicationMapper extends BaseMapper<OvertimeApplication> {

    /**
     * 统计员工月度加班时长
     * 
     * @param tenantId 租户ID
     * @param employeeId 员工ID
     * @param year 年份
     * @param month 月份
     * @return 加班统计数据
     */
    Map<String, Object> getOvertimeStatistics(@Param("tenantId") Long tenantId,
                                               @Param("employeeId") Long employeeId,
                                               @Param("year") Integer year,
                                               @Param("month") Integer month);
}
