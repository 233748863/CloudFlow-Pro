package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.*;
import com.cloudflow.hr.domain.vo.ScheduleCalendarVO;
import com.cloudflow.hr.domain.vo.SchedulePlanVO;
import com.cloudflow.hr.domain.vo.ScheduleRuleAssignmentVO;
import com.cloudflow.hr.domain.vo.ScheduleRuleVO;
import com.cloudflow.hr.domain.vo.ShiftVO;

import java.time.YearMonth;
import java.util.List;

/**
 * 排班管理服务接口
 * 提供班次管理、排班规则管理和排班计划管理功能
 */
public interface ScheduleService {
    
    // ==================== 班次管理 ====================
    
    /**
     * 创建班次
     * @param dto 班次创建DTO
     * @return 班次ID
     */
    Long createShift(ShiftCreateDTO dto);
    
    /**
     * 更新班次
     * @param id 班次ID
     * @param dto 班次更新DTO
     */
    void updateShift(Long id, ShiftUpdateDTO dto);
    
    /**
     * 获取班次详情
     * @param id 班次ID
     * @return 班次视图对象
     */
    ShiftVO getShift(Long id);
    
    /**
     * 查询所有班次列表
     * @return 班次列表
     */
    List<ShiftVO> listShifts();
    
    /**
     * 删除班次
     * @param id 班次ID
     */
    void deleteShift(Long id);
    
    // ==================== 排班规则管理 ====================
    
    /**
     * 创建排班规则
     * @param dto 排班规则创建DTO
     * @return 规则ID
     */
    Long createScheduleRule(ScheduleRuleCreateDTO dto);
    
    /**
     * 更新排班规则
     * @param id 规则ID
     * @param dto 排班规则更新DTO
     */
    void updateScheduleRule(Long id, ScheduleRuleUpdateDTO dto);
    
    /**
     * 获取排班规则详情
     * @param id 规则ID
     * @return 排班规则视图对象
     */
    ScheduleRuleVO getScheduleRule(Long id);
    
    /**
     * 查询所有排班规则列表
     * @return 排班规则列表
     */
    List<ScheduleRuleVO> listScheduleRules();
    
    /**
     * 删除排班规则
     * @param id 规则ID
     */
    void deleteScheduleRule(Long id);

    /**
     * 创建排班规则适用范围。
     */
    Long createScheduleRuleAssignment(Long ruleId, ScheduleRuleAssignmentDTO dto);

    /**
     * 查询排班规则适用范围。
     */
    List<ScheduleRuleAssignmentVO> listScheduleRuleAssignments(Long ruleId);

    /**
     * 删除排班规则适用范围。
     */
    void deleteScheduleRuleAssignment(Long assignmentId);

    /**
     * 删除某条排班规则的全部适用范围。
     */
    void deleteScheduleRuleAssignments(Long ruleId);
    
    // ==================== 排班计划管理 ====================
    
    /**
     * 创建排班计划
     * @param dto 排班计划创建DTO
     */
    void createSchedulePlan(SchedulePlanCreateDTO dto);
    
    /**
     * 批量创建排班计划
     * @param dto 批量排班计划创建DTO
     */
    void batchCreateSchedulePlan(BatchSchedulePlanCreateDTO dto);
    
    /**
     * 发布排班计划
     * @param planIds 排班计划ID列表
     */
    void publishSchedulePlan(List<Long> planIds);
    
    /**
     * 取消排班计划
     * @param planId 排班计划ID
     */
    void cancelSchedulePlan(Long planId);
    
    /**
     * 查询排班计划列表
     * @param query 查询条件
     * @return 排班计划列表
     */
    List<SchedulePlanVO> listSchedulePlans(SchedulePlanQueryDTO query);
    
    /**
     * 获取员工排班日历
     * @param employeeId 员工ID
     * @param yearMonth 年月
     * @return 排班日历视图对象
     */
    ScheduleCalendarVO getScheduleCalendar(Long employeeId, YearMonth yearMonth);
}
