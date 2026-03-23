package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.AttendanceMonthly;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 考勤月报Mapper接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Mapper
public interface AttendanceMonthlyMapper extends BaseMapper<AttendanceMonthly> {

    /**
     * 查询异常考勤记录
     * 
     * @param tenantId 租户ID
     * @param employeeId 员工ID（可选）
     * @param deptId 部门ID（可选）
     * @param anomalyType 异常类型（可选）
     * @param startDate 开始日期（可选）
     * @param endDate 结束日期（可选）
     * @return 异常考勤记录列表
     */
    List<Map<String, Object>> listAttendanceAnomalies(@Param("tenantId") Long tenantId,
                                                       @Param("employeeId") Long employeeId,
                                                       @Param("deptId") Long deptId,
                                                       @Param("anomalyType") String anomalyType,
                                                       @Param("startDate") String startDate,
                                                       @Param("endDate") String endDate);

    /**
     * 统计部门出勤率
     * 
     * @param tenantId 租户ID
     * @param deptId 部门ID
     * @param year 年份
     * @param month 月份
     * @return 出勤率统计数据
     */
    Map<String, Object> getAttendanceRate(@Param("tenantId") Long tenantId,
                                           @Param("deptId") Long deptId,
                                           @Param("year") Integer year,
                                           @Param("month") Integer month);
}
