package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.SchedulePlan;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

/**
 * 排班计划Mapper接口
 * 提供排班计划的数据库操作
 */
@Mapper
public interface SchedulePlanMapper extends BaseMapper<SchedulePlan> {
    
    /**
     * 查询指定日期范围内的排班计划
     * @param tenantId 租户ID
     * @param targetType 目标类型
     * @param targetId 目标ID
     * @param startDate 开始日期
     * @param endDate 结束日期
     * @return 排班计划列表
     */
    List<SchedulePlan> selectByDateRange(@Param("tenantId") Long tenantId,
                                         @Param("targetType") String targetType,
                                         @Param("targetId") Long targetId,
                                         @Param("startDate") LocalDate startDate,
                                         @Param("endDate") LocalDate endDate);
    
    /**
     * 查询指定员工在指定日期的排班计划
     * @param tenantId 租户ID
     * @param employeeId 员工ID
     * @param scheduleDate 排班日期
     * @return 排班计划
     */
    SchedulePlan selectByEmployeeAndDate(@Param("tenantId") Long tenantId,
                                         @Param("employeeId") Long employeeId,
                                         @Param("scheduleDate") LocalDate scheduleDate);
    
    /**
     * 批量插入排班计划
     * @param plans 排班计划列表
     * @return 插入的记录数
     */
    int batchInsert(@Param("plans") List<SchedulePlan> plans);
}
