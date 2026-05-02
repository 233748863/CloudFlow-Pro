package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.*;
import com.cloudflow.hr.domain.vo.ScheduleCalendarVO;
import com.cloudflow.hr.domain.vo.SchedulePlanVO;
import com.cloudflow.hr.domain.vo.ScheduleRuleAssignmentVO;
import com.cloudflow.hr.domain.vo.ScheduleRuleVO;
import com.cloudflow.hr.domain.vo.ShiftVO;
import com.cloudflow.hr.service.ScheduleService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;
import java.util.List;

/**
 * 排班管理控制器
 * 提供班次管理、排班规则管理和排班计划管理接口
 * 
 * @author CloudFlow
 */
@Slf4j
@RestController
@RequestMapping("/schedule")
@RequiredArgsConstructor
public class ScheduleController {
    
    private final ScheduleService scheduleService;
    
    // ==================== 班次管理接口 ====================
    
    /**
     * 创建班次
     * 
     * @param dto 班次创建DTO
     * @return 班次ID
     */
    @PostMapping("/shift")
    public R<Long> createShift(@Validated @RequestBody ShiftCreateDTO dto) {
        log.info("接收创建班次请求，shiftCode: {}", dto.getShiftCode());
        Long id = scheduleService.createShift(dto);
        return R.ok(id);
    }
    
    /**
     * 更新班次
     * 
     * @param id 班次ID
     * @param dto 班次更新DTO
     * @return 操作结果
     */
    @PutMapping("/shift/{id}")
    public R<Void> updateShift(@PathVariable Long id, 
                                @Validated @RequestBody ShiftUpdateDTO dto) {
        log.info("接收更新班次请求，ID: {}", id);
        scheduleService.updateShift(id, dto);
        return R.ok();
    }
    
    /**
     * 获取班次详情
     * 
     * @param id 班次ID
     * @return 班次VO
     */
    @GetMapping("/shift/{id}")
    public R<ShiftVO> getShift(@PathVariable Long id) {
        log.info("接收获取班次详情请求，ID: {}", id);
        ShiftVO vo = scheduleService.getShift(id);
        return R.ok(vo);
    }
    
    /**
     * 获取班次列表
     * 
     * @return 班次列表
     */
    @GetMapping("/shift/list")
    public R<List<ShiftVO>> listShifts() {
        log.info("接收获取班次列表请求");
        List<ShiftVO> list = scheduleService.listShifts();
        return R.ok(list);
    }
    
    /**
     * 删除班次
     * 
     * @param id 班次ID
     * @return 操作结果
     */
    @DeleteMapping("/shift/{id}")
    public R<Void> deleteShift(@PathVariable Long id) {
        log.info("接收删除班次请求，ID: {}", id);
        scheduleService.deleteShift(id);
        return R.ok();
    }
    
    // ==================== 排班规则管理接口 ====================
    
    /**
     * 创建排班规则
     * 
     * @param dto 排班规则创建DTO
     * @return 规则ID
     */
    @PostMapping("/rule")
    public R<Long> createScheduleRule(@Validated @RequestBody ScheduleRuleCreateDTO dto) {
        log.info("接收创建排班规则请求，ruleName: {}", dto.getRuleName());
        Long id = scheduleService.createScheduleRule(dto);
        return R.ok(id);
    }
    
    /**
     * 更新排班规则
     * 
     * @param id 规则ID
     * @param dto 排班规则更新DTO
     * @return 操作结果
     */
    @PutMapping("/rule/{id}")
    public R<Void> updateScheduleRule(@PathVariable Long id, 
                                       @Validated @RequestBody ScheduleRuleUpdateDTO dto) {
        log.info("接收更新排班规则请求，ID: {}", id);
        scheduleService.updateScheduleRule(id, dto);
        return R.ok();
    }
    
    /**
     * 获取排班规则详情
     * 
     * @param id 规则ID
     * @return 排班规则VO
     */
    @GetMapping("/rule/{id}")
    public R<ScheduleRuleVO> getScheduleRule(@PathVariable Long id) {
        log.info("接收获取排班规则详情请求，ID: {}", id);
        ScheduleRuleVO vo = scheduleService.getScheduleRule(id);
        return R.ok(vo);
    }
    
    /**
     * 获取排班规则列表
     * 
     * @return 排班规则列表
     */
    @GetMapping("/rule/list")
    public R<List<ScheduleRuleVO>> listScheduleRules() {
        log.info("接收获取排班规则列表请求");
        List<ScheduleRuleVO> list = scheduleService.listScheduleRules();
        return R.ok(list);
    }

    @GetMapping("/rule")
    public R<List<ScheduleRuleVO>> listScheduleRulesAlias() {
        log.info("接收获取排班规则列表请求");
        return R.ok(scheduleService.listScheduleRules());
    }
    
    /**
     * 删除排班规则
     * 
     * @param id 规则ID
     * @return 操作结果
     */
    @DeleteMapping("/rule/{id}")
    public R<Void> deleteScheduleRule(@PathVariable Long id) {
        log.info("接收删除排班规则请求，ID: {}", id);
        scheduleService.deleteScheduleRule(id);
        return R.ok();
    }

    @PostMapping("/rule/{id}/assignments")
    public R<Long> createScheduleRuleAssignment(@PathVariable Long id,
                                                @Validated @RequestBody ScheduleRuleAssignmentDTO dto) {
        log.info("接收创建排班规则适用范围请求，ruleId: {}, targetType: {}, targetId: {}", id, dto.getTargetType(), dto.getTargetId());
        return R.ok(scheduleService.createScheduleRuleAssignment(id, dto));
    }

    @GetMapping("/rule/{id}/assignments")
    public R<List<ScheduleRuleAssignmentVO>> listScheduleRuleAssignments(@PathVariable Long id) {
        log.info("接收查询排班规则适用范围请求，ruleId: {}", id);
        return R.ok(scheduleService.listScheduleRuleAssignments(id));
    }

    @DeleteMapping("/rule/assignments/{assignmentId}")
    public R<Void> deleteScheduleRuleAssignment(@PathVariable Long assignmentId) {
        log.info("接收删除排班规则适用范围请求，assignmentId: {}", assignmentId);
        scheduleService.deleteScheduleRuleAssignment(assignmentId);
        return R.ok();
    }

    @DeleteMapping("/rule/{id}/assignments")
    public R<Void> deleteScheduleRuleAssignments(@PathVariable Long id) {
        log.info("接收删除排班规则全部适用范围请求，ruleId: {}", id);
        scheduleService.deleteScheduleRuleAssignments(id);
        return R.ok();
    }
    
    // ==================== 排班计划管理接口 ====================
    
    /**
     * 创建排班计划
     * 
     * @param dto 排班计划创建DTO
     * @return 操作结果
     */
    @PostMapping("/plan")
    public R<Void> createSchedulePlan(@Validated @RequestBody SchedulePlanCreateDTO dto) {
        log.info("接收创建排班计划请求，targetType: {}, targetId: {}", dto.getTargetType(), dto.getTargetId());
        scheduleService.createSchedulePlan(dto);
        return R.ok();
    }
    
    /**
     * 批量创建排班计划
     * 
     * @param dto 批量排班计划创建DTO
     * @return 操作结果
     */
    @PostMapping("/plan/batch")
    public R<Void> batchCreateSchedulePlan(@Validated @RequestBody BatchSchedulePlanCreateDTO dto) {
        log.info("接收批量创建排班计划请求，targetType: {}, targetIds: {}", dto.getTargetType(), dto.getTargetIds());
        scheduleService.batchCreateSchedulePlan(dto);
        return R.ok();
    }
    
    /**
     * 发布排班计划
     * 
     * @param planIds 排班计划ID列表
     * @return 操作结果
     */
    @PostMapping("/plan/publish")
    public R<Void> publishSchedulePlan(@RequestBody List<Long> planIds) {
        log.info("接收发布排班计划请求，planIds: {}", planIds);
        scheduleService.publishSchedulePlan(planIds);
        return R.ok();
    }
    
    /**
     * 取消排班计划
     * 
     * @param planId 排班计划ID
     * @return 操作结果
     */
    @PostMapping("/plan/{planId}/cancel")
    public R<Void> cancelSchedulePlan(@PathVariable Long planId) {
        log.info("接收取消排班计划请求，planId: {}", planId);
        scheduleService.cancelSchedulePlan(planId);
        return R.ok();
    }
    
    /**
     * 查询排班计划列表
     * 
     * @param query 查询条件
     * @return 排班计划列表
     */
    @GetMapping("/plan/list")
    public R<List<SchedulePlanVO>> listSchedulePlans(SchedulePlanQueryDTO query) {
        log.info("接收查询排班计划列表请求，query: {}", query);
        List<SchedulePlanVO> list = scheduleService.listSchedulePlans(query);
        return R.ok(list);
    }
    
    /**
     * 获取员工排班日历
     * 
     * @param employeeId 员工ID
     * @param yearMonth 年月（格式：yyyy-MM）
     * @return 排班日历VO
     */
    @GetMapping("/plan/calendar/{employeeId}")
    public R<ScheduleCalendarVO> getScheduleCalendar(@PathVariable Long employeeId,
                                                      @RequestParam String yearMonth) {
        log.info("接收获取员工排班日历请求，employeeId: {}, yearMonth: {}", employeeId, yearMonth);
        YearMonth ym = YearMonth.parse(yearMonth);
        ScheduleCalendarVO vo = scheduleService.getScheduleCalendar(employeeId, ym);
        return R.ok(vo);
    }
}
