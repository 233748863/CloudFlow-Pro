package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.domain.dto.*;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.SchedulePlan;
import com.cloudflow.hr.domain.entity.ScheduleRule;
import com.cloudflow.hr.domain.entity.ScheduleRuleAssignment;
import com.cloudflow.hr.domain.entity.Shift;
import com.cloudflow.hr.domain.vo.ScheduleCalendarVO;
import com.cloudflow.hr.domain.vo.SchedulePlanVO;
import com.cloudflow.hr.domain.vo.ScheduleRuleAssignmentVO;
import com.cloudflow.hr.domain.vo.ScheduleRuleVO;
import com.cloudflow.hr.domain.vo.ShiftVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.SchedulePlanMapper;
import com.cloudflow.hr.mapper.ScheduleRuleAssignmentMapper;
import com.cloudflow.hr.mapper.ScheduleRuleMapper;
import com.cloudflow.hr.mapper.ShiftMapper;
import com.cloudflow.hr.service.DeptPostSyncService;
import com.cloudflow.hr.service.ScheduleService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 排班管理服务实现类
 * 提供班次管理和排班规则管理功能
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ScheduleServiceImpl implements ScheduleService {

    private static final int DEFAULT_BREAK_MINUTES = 0;
    private static final int DEFAULT_THRESHOLD_MINUTES = 15;
    private static final String DEFAULT_SHIFT_COLOR = "#1890ff";
    private static final String TARGET_EMPLOYEE = "EMPLOYEE";
    private static final String TARGET_POST = "POST";
    private static final String TARGET_DEPT = "DEPT";

    private final ShiftMapper shiftMapper;
    private final ScheduleRuleMapper scheduleRuleMapper;
    private final ScheduleRuleAssignmentMapper scheduleRuleAssignmentMapper;
    private final SchedulePlanMapper schedulePlanMapper;
    private final EmployeeMapper employeeMapper;
    private final DeptPostSyncService deptPostSyncService;
    
    // ==================== 班次管理 ====================
    
    /**
     * 创建班次
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createShift(ShiftCreateDTO dto) {
        log.info("创建班次，shiftCode: {}, shiftName: {}", dto.getShiftCode(), dto.getShiftName());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查班次编码是否已存在
        LambdaQueryWrapper<Shift> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(Shift::getTenantId, tenantId)
                    .eq(Shift::getShiftCode, dto.getShiftCode());
        
        if (shiftMapper.selectCount(queryWrapper) > 0) {
            throw new HrBusinessException("班次编码已存在：" + dto.getShiftCode());
        }
        
        // 创建班次实体
        Shift shift = new Shift();
        BeanUtils.copyProperties(dto, shift);
        shift.setTenantId(tenantId);

        applyShiftDefaults(shift);
        shift.setStatus(1); // 默认启用
        shift.setWorkMinutes(validateAndCalculateWorkMinutes(
                shift.getStartTime(),
                shift.getEndTime(),
                shift.getBreakMinutes(),
                shift.getLateThreshold(),
                shift.getEarlyThreshold()));
        
        // 保存到数据库
        shiftMapper.insert(shift);
        
        log.info("班次创建成功，ID: {}, 工作时长: {}分钟", shift.getId(), shift.getWorkMinutes());
        return shift.getId();
    }
    
    /**
     * 更新班次
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateShift(Long id, ShiftUpdateDTO dto) {
        log.info("更新班次，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查班次是否存在
        Shift existingShift = shiftMapper.selectById(id);
        if (existingShift == null || !existingShift.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("班次不存在或无权限访问");
        }
        
        // 更新班次信息
        Shift shift = new Shift();
        BeanUtils.copyProperties(dto, shift);
        shift.setId(id);
        shift.setTenantId(tenantId);

        applyShiftDefaults(shift);
        shift.setWorkMinutes(validateAndCalculateWorkMinutes(
                shift.getStartTime(),
                shift.getEndTime(),
                shift.getBreakMinutes(),
                shift.getLateThreshold(),
                shift.getEarlyThreshold()));
        
        shiftMapper.updateById(shift);
        
        log.info("班次更新成功，ID: {}, 工作时长: {}分钟", id, shift.getWorkMinutes());
    }
    
    /**
     * 获取班次详情
     */
    @Override
    public ShiftVO getShift(Long id) {
        log.info("获取班次详情，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询班次
        Shift shift = shiftMapper.selectById(id);
        if (shift == null || !shift.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("班次不存在或无权限访问");
        }
        
        // 转换为VO
        return convertToShiftVO(shift);
    }
    
    /**
     * 查询所有班次列表
     */
    @Override
    public List<ShiftVO> listShifts() {
        log.info("获取班次列表");
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 构建查询条件
        LambdaQueryWrapper<Shift> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(Shift::getTenantId, tenantId)
                    .orderByAsc(Shift::getStartTime); // 按上班时间排序
        
        List<Shift> shifts = shiftMapper.selectList(queryWrapper);
        
        // 转换为VO列表
        return shifts.stream()
                .map(this::convertToShiftVO)
                .collect(Collectors.toList());
    }
    
    /**
     * 删除班次
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteShift(Long id) {
        log.info("删除班次，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查班次是否存在
        Shift existingShift = shiftMapper.selectById(id);
        if (existingShift == null || !existingShift.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("班次不存在或无权限访问");
        }
        
        LambdaQueryWrapper<SchedulePlan> planWrapper = new LambdaQueryWrapper<>();
        planWrapper.eq(SchedulePlan::getTenantId, tenantId)
                .eq(SchedulePlan::getShiftId, id)
                .ne(SchedulePlan::getStatus, "CANCELLED");
        if (schedulePlanMapper.selectCount(planWrapper) > 0) {
            throw new HrBusinessException("SHIFT_IN_USE", "该班次已被排班计划引用，无法删除");
        }

        // 删除班次
        shiftMapper.deleteById(id);
        
        log.info("班次删除成功，ID: {}", id);
    }
    
    // ==================== 排班规则管理 ====================
    
    /**
     * 创建排班规则
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createScheduleRule(ScheduleRuleCreateDTO dto) {
        log.info("创建排班规则，ruleName: {}, ruleType: {}", dto.getRuleName(), dto.getRuleType());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 验证规则类型
        validateRuleType(dto.getRuleType());
        
        // 创建排班规则实体
        ScheduleRule rule = new ScheduleRule();
        BeanUtils.copyProperties(dto, rule);
        rule.setTenantId(tenantId);
        rule.setStatus(1); // 默认启用
        
        // 保存到数据库
        scheduleRuleMapper.insert(rule);
        
        log.info("排班规则创建成功，ID: {}", rule.getId());
        return rule.getId();
    }
    
    /**
     * 更新排班规则
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateScheduleRule(Long id, ScheduleRuleUpdateDTO dto) {
        log.info("更新排班规则，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查规则是否存在
        ScheduleRule existingRule = scheduleRuleMapper.selectById(id);
        if (existingRule == null || !existingRule.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("排班规则不存在或无权限访问");
        }
        
        // 验证规则类型
        validateRuleType(dto.getRuleType());
        
        // 更新规则信息
        ScheduleRule rule = new ScheduleRule();
        BeanUtils.copyProperties(dto, rule);
        rule.setId(id);
        rule.setTenantId(tenantId);
        
        scheduleRuleMapper.updateById(rule);
        
        log.info("排班规则更新成功，ID: {}", id);
    }
    
    /**
     * 获取排班规则详情
     */
    @Override
    public ScheduleRuleVO getScheduleRule(Long id) {
        log.info("获取排班规则详情，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询规则
        ScheduleRule rule = scheduleRuleMapper.selectById(id);
        if (rule == null || !rule.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("排班规则不存在或无权限访问");
        }
        
        // 转换为VO
        return convertToScheduleRuleVO(rule);
    }
    
    /**
     * 查询所有排班规则列表
     */
    @Override
    public List<ScheduleRuleVO> listScheduleRules() {
        log.info("获取排班规则列表");
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 构建查询条件
        LambdaQueryWrapper<ScheduleRule> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(ScheduleRule::getTenantId, tenantId)
                    .orderByDesc(ScheduleRule::getCreateTime);
        
        List<ScheduleRule> rules = scheduleRuleMapper.selectList(queryWrapper);
        
        // 转换为VO列表
        return rules.stream()
                .map(this::convertToScheduleRuleVO)
                .collect(Collectors.toList());
    }
    
    /**
     * 删除排班规则
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteScheduleRule(Long id) {
        log.info("删除排班规则，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查规则是否存在
        ScheduleRule existingRule = scheduleRuleMapper.selectById(id);
        if (existingRule == null || !existingRule.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("排班规则不存在或无权限访问");
        }
        
        // TODO: 检查是否有排班计划使用此规则，如有则不允许删除
        
        // 删除规则
        scheduleRuleMapper.deleteById(id);
        
        log.info("排班规则删除成功，ID: {}", id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createScheduleRuleAssignment(Long ruleId, ScheduleRuleAssignmentDTO dto) {
        Long tenantId = SecurityUtils.getTenantId();
        ScheduleRule rule = scheduleRuleMapper.selectById(ruleId);
        if (rule == null || !tenantId.equals(rule.getTenantId())) {
            throw new HrBusinessException("排班规则不存在或无权限访问");
        }
        validateTargetType(dto.getTargetType());
        validateTarget(dto.getTargetType(), dto.getTargetId(), tenantId);
        if (dto.getEffectiveEnd() != null && dto.getEffectiveEnd().isBefore(dto.getEffectiveStart())) {
            throw new HrBusinessException("生效结束日期不能早于开始日期");
        }

        ScheduleRuleAssignment assignment = new ScheduleRuleAssignment();
        BeanUtils.copyProperties(dto, assignment);
        assignment.setTenantId(tenantId);
        assignment.setRuleId(ruleId);
        assignment.setStatus(dto.getStatus() == null ? 1 : dto.getStatus());
        scheduleRuleAssignmentMapper.insert(assignment);
        return assignment.getId();
    }

    @Override
    public List<ScheduleRuleAssignmentVO> listScheduleRuleAssignments(Long ruleId) {
        Long tenantId = SecurityUtils.getTenantId();
        ScheduleRule rule = scheduleRuleMapper.selectById(ruleId);
        if (rule == null || !tenantId.equals(rule.getTenantId())) {
            throw new HrBusinessException("排班规则不存在或无权限访问");
        }
        LambdaQueryWrapper<ScheduleRuleAssignment> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ScheduleRuleAssignment::getTenantId, tenantId)
                .eq(ScheduleRuleAssignment::getRuleId, ruleId)
                .orderByAsc(ScheduleRuleAssignment::getTargetType)
                .orderByDesc(ScheduleRuleAssignment::getEffectiveStart);
        return scheduleRuleAssignmentMapper.selectList(wrapper).stream()
                .map(this::convertToScheduleRuleAssignmentVO)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteScheduleRuleAssignment(Long assignmentId) {
        Long tenantId = SecurityUtils.getTenantId();
        ScheduleRuleAssignment assignment = scheduleRuleAssignmentMapper.selectById(assignmentId);
        if (assignment == null || !tenantId.equals(assignment.getTenantId())) {
            throw new HrBusinessException("排班规则适用范围不存在");
        }
        scheduleRuleAssignmentMapper.deleteById(assignmentId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteScheduleRuleAssignments(Long ruleId) {
        Long tenantId = SecurityUtils.getTenantId();
        ScheduleRule rule = scheduleRuleMapper.selectById(ruleId);
        if (rule == null || !tenantId.equals(rule.getTenantId())) {
            throw new HrBusinessException("排班规则不存在或无权限访问");
        }
        LambdaQueryWrapper<ScheduleRuleAssignment> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ScheduleRuleAssignment::getTenantId, tenantId)
                .eq(ScheduleRuleAssignment::getRuleId, ruleId);
        scheduleRuleAssignmentMapper.delete(wrapper);
    }
    
    // ==================== 私有辅助方法 ====================
    
    /**
     * 统一补齐班次默认值，避免空配置直接落库。
     */
    private void applyShiftDefaults(Shift shift) {
        if (shift.getBreakMinutes() == null) {
            shift.setBreakMinutes(DEFAULT_BREAK_MINUTES);
        }
        if (shift.getLateThreshold() == null) {
            shift.setLateThreshold(DEFAULT_THRESHOLD_MINUTES);
        }
        if (shift.getEarlyThreshold() == null) {
            shift.setEarlyThreshold(DEFAULT_THRESHOLD_MINUTES);
        }
        if (shift.getColor() == null) {
            shift.setColor(DEFAULT_SHIFT_COLOR);
        }
    }

    /**
     * 校验班次配置并重新计算工作时长。
     */
    private int validateAndCalculateWorkMinutes(LocalTime startTime,
                                                LocalTime endTime,
                                                Integer breakMinutes,
                                                Integer lateThreshold,
                                                Integer earlyThreshold) {
        validateNonNegative("休息时长", breakMinutes);
        validateNonNegative("迟到阈值", lateThreshold);
        validateNonNegative("早退阈值", earlyThreshold);

        long totalMinutes = Duration.between(startTime, endTime).toMinutes();
        if (totalMinutes < 0) {
            totalMinutes += 24 * 60;
        }
        if (totalMinutes <= 0) {
            throw new HrBusinessException("INVALID_SHIFT_DURATION", "班次开始时间和结束时间不能相同");
        }
        if (breakMinutes >= totalMinutes) {
            throw new HrBusinessException("INVALID_BREAK_MINUTES", "休息时长不能大于或等于班次总时长");
        }
        return (int) (totalMinutes - breakMinutes);
    }

    private void validateNonNegative(String fieldName, Integer value) {
        if (value != null && value < 0) {
            throw new HrBusinessException("INVALID_SHIFT_CONFIG", fieldName + "不能小于 0");
        }
    }
    
    /**
     * 验证规则类型
     * @param ruleType 规则类型
     */
    private void validateRuleType(String ruleType) {
        if (ruleType == null) {
            throw new HrBusinessException("规则类型不能为空");
        }
        
        // 验证规则类型是否合法
        switch (ruleType) {
            case "FIXED":
            case "ROTATION":
            case "FLEXIBLE":
            case "COMPREHENSIVE":
                break;
            default:
                throw new HrBusinessException("不支持的规则类型：" + ruleType);
        }
    }
    
    /**
     * 转换为班次VO
     * @param shift 班次实体
     * @return 班次VO
     */
    private ShiftVO convertToShiftVO(Shift shift) {
        ShiftVO vo = new ShiftVO();
        BeanUtils.copyProperties(shift, vo);
        
        // 设置状态描述
        vo.setStatusDesc(shift.getStatus() == 1 ? "启用" : "禁用");
        
        return vo;
    }
    
    /**
     * 转换为排班规则VO
     * @param rule 排班规则实体
     * @return 排班规则VO
     */
    private ScheduleRuleVO convertToScheduleRuleVO(ScheduleRule rule) {
        ScheduleRuleVO vo = new ScheduleRuleVO();
        BeanUtils.copyProperties(rule, vo);
        
        // 设置规则类型描述
        vo.setRuleTypeDesc(getRuleTypeDesc(rule.getRuleType()));
        
        // 设置状态描述
        vo.setStatusDesc(rule.getStatus() == 1 ? "启用" : "禁用");
        
        return vo;
    }
    
    /**
     * 获取规则类型描述
     * @param ruleType 规则类型
     * @return 规则类型描述
     */
    private String getRuleTypeDesc(String ruleType) {
        if (ruleType == null) {
            return "";
        }
        
        switch (ruleType) {
            case "FIXED":
                return "固定班";
            case "ROTATION":
                return "轮班";
            case "FLEXIBLE":
                return "弹性工作制";
            case "COMPREHENSIVE":
                return "综合工时制";
            default:
                return ruleType;
        }
    }
    
    // ==================== 排班计划管理 ====================
    
    /**
     * 创建排班计划
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void createSchedulePlan(SchedulePlanCreateDTO dto) {
        log.info("创建排班计划，targetType: {}, targetId: {}, scheduleDate: {}", 
                dto.getTargetType(), dto.getTargetId(), dto.getScheduleDate());
        
        // 获取当前租户ID和用户ID
        Long tenantId = SecurityUtils.getTenantId();
        Long userId = SecurityUtils.getUserId();
        
        // 验证目标类型
        validateTargetType(dto.getTargetType());
        
        // 验证班次是否存在
        Shift shift = shiftMapper.selectById(dto.getShiftId());
        if (shift == null || !shift.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("班次不存在或无权限访问");
        }
        
        // 验证目标是否存在
        validateTarget(dto.getTargetType(), dto.getTargetId(), tenantId);
        
        // 检查是否已存在排班计划
        SchedulePlan existingPlan = findActivePlan(tenantId, dto.getTargetType(), dto.getTargetId(), dto.getScheduleDate());
        if (existingPlan != null) {
            throw new HrBusinessException("该日期已存在排班计划");
        }
        
        // 检查排班与假期冲突（假期模块未实现，暂时跳过）
        // checkLeaveConflict(dto.getTargetId(), dto.getScheduleDate());
        
        // 创建排班计划
        SchedulePlan plan = new SchedulePlan();
        BeanUtils.copyProperties(dto, plan);
        plan.setTenantId(tenantId);
        plan.setStatus("DRAFT"); // 默认为草稿状态
        plan.setCreateBy(userId);
        plan.setUpdateBy(userId);
        
        schedulePlanMapper.insert(plan);
        
        log.info("排班计划创建成功，ID: {}", plan.getId());
    }
    
    /**
     * 批量创建排班计划
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void batchCreateSchedulePlan(BatchSchedulePlanCreateDTO dto) {
        log.info("批量创建排班计划，targetType: {}, targetIds: {}, startDate: {}, endDate: {}", 
                dto.getTargetType(), dto.getTargetIds(), dto.getStartDate(), dto.getEndDate());
        
        // 获取当前租户ID和用户ID
        Long tenantId = SecurityUtils.getTenantId();
        Long userId = SecurityUtils.getUserId();
        
        // 验证目标类型
        validateTargetType(dto.getTargetType());
        
        // 验证班次是否存在
        Shift shift = shiftMapper.selectById(dto.getShiftId());
        if (shift == null || !shift.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("班次不存在或无权限访问");
        }
        
        // 验证日期范围
        if (dto.getStartDate().isAfter(dto.getEndDate())) {
            throw new HrBusinessException("开始日期不能晚于结束日期");
        }
        
        // 计算日期范围内的天数
        long daysBetween = ChronoUnit.DAYS.between(dto.getStartDate(), dto.getEndDate()) + 1;
        if (daysBetween > 31) {
            throw new HrBusinessException("批量排班最多支持31天");
        }
        
        // 批量创建排班计划
        List<SchedulePlan> plans = new ArrayList<>();
        
        for (Long targetId : dto.getTargetIds()) {
            // 验证目标是否存在
            validateTarget(dto.getTargetType(), targetId, tenantId);
            
            // 为每个日期创建排班计划
            LocalDate currentDate = dto.getStartDate();
            while (!currentDate.isAfter(dto.getEndDate())) {
                // 检查是否已存在排班计划
                SchedulePlan existingPlan = findActivePlan(tenantId, dto.getTargetType(), targetId, currentDate);

                if (existingPlan == null) {
                    // 创建排班计划
                    SchedulePlan plan = new SchedulePlan();
                    plan.setTenantId(tenantId);
                    plan.setPlanName(dto.getPlanName());
                    plan.setTargetType(dto.getTargetType());
                    plan.setTargetId(targetId);
                    plan.setShiftId(dto.getShiftId());
                    plan.setScheduleDate(currentDate);
                    plan.setStatus("DRAFT");
                    plan.setCreateBy(userId);
                    plan.setUpdateBy(userId);
                    
                    plans.add(plan);
                }
                
                currentDate = currentDate.plusDays(1);
            }
        }
        
        // 批量插入
        if (!plans.isEmpty()) {
            schedulePlanMapper.batchInsert(plans);
            log.info("批量创建排班计划成功，共创建 {} 条记录", plans.size());
        } else {
            log.warn("没有需要创建的排班计划");
        }
    }
    
    /**
     * 发布排班计划
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void publishSchedulePlan(List<Long> planIds) {
        log.info("发布排班计划，planIds: {}", planIds);
        
        if (planIds == null || planIds.isEmpty()) {
            throw new HrBusinessException("排班计划ID列表不能为空");
        }
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 批量更新状态
        for (Long planId : planIds) {
            SchedulePlan plan = schedulePlanMapper.selectById(planId);
            if (plan == null || !plan.getTenantId().equals(tenantId)) {
                throw new HrBusinessException("排班计划不存在或无权限访问：" + planId);
            }
            
            if (!"DRAFT".equals(plan.getStatus())) {
                throw new HrBusinessException("只能发布草稿状态的排班计划：" + planId);
            }
            
            plan.setStatus("PUBLISHED");
            schedulePlanMapper.updateById(plan);
        }
        
        log.info("排班计划发布成功，共发布 {} 条记录", planIds.size());
    }
    
    /**
     * 取消排班计划
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancelSchedulePlan(Long planId) {
        log.info("取消排班计划，planId: {}", planId);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询排班计划
        SchedulePlan plan = schedulePlanMapper.selectById(planId);
        if (plan == null || !plan.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("排班计划不存在或无权限访问");
        }
        
        if ("CANCELLED".equals(plan.getStatus())) {
            throw new HrBusinessException("排班计划已取消");
        }
        
        // 更新状态为已取消
        plan.setStatus("CANCELLED");
        schedulePlanMapper.updateById(plan);
        
        log.info("排班计划取消成功，planId: {}", planId);
    }
    
    /**
     * 查询排班计划列表
     */
    @Override
    public List<SchedulePlanVO> listSchedulePlans(SchedulePlanQueryDTO query) {
        log.info("查询排班计划列表，query: {}", query);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 构建查询条件
        LambdaQueryWrapper<SchedulePlan> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SchedulePlan::getTenantId, tenantId);
        
        if (query.getTargetType() != null) {
            queryWrapper.eq(SchedulePlan::getTargetType, query.getTargetType());
        }
        if (query.getTargetId() != null) {
            queryWrapper.eq(SchedulePlan::getTargetId, query.getTargetId());
        }
        if (query.getShiftId() != null) {
            queryWrapper.eq(SchedulePlan::getShiftId, query.getShiftId());
        }
        if (query.getStartDate() != null && query.getEndDate() != null) {
            queryWrapper.between(SchedulePlan::getScheduleDate, query.getStartDate(), query.getEndDate());
        }
        if (query.getStatus() != null) {
            queryWrapper.eq(SchedulePlan::getStatus, query.getStatus());
        }
        
        queryWrapper.orderByAsc(SchedulePlan::getScheduleDate);
        
        List<SchedulePlan> plans = schedulePlanMapper.selectList(queryWrapper);
        
        // 转换为VO列表
        return plans.stream()
                .map(this::convertToSchedulePlanVO)
                .collect(Collectors.toList());
    }
    
    /**
     * 获取员工排班日历
     */
    @Override
    public ScheduleCalendarVO getScheduleCalendar(Long employeeId, YearMonth yearMonth) {
        log.info("获取员工排班日历，employeeId: {}, yearMonth: {}", employeeId, yearMonth);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 验证员工是否存在
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null || !employee.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("员工不存在或无权限访问");
        }
        
        // 计算月份的开始和结束日期
        LocalDate startDate = yearMonth.atDay(1);
        LocalDate endDate = yearMonth.atEndOfMonth();
        
        // 查询该月的排班计划
        List<SchedulePlan> plans = schedulePlanMapper.selectByDateRange(
                tenantId, "EMPLOYEE", employeeId, startDate, endDate);
        
        // 转换为VO列表
        List<SchedulePlanVO> planVOs = plans.stream()
                .map(this::convertToSchedulePlanVO)
                .collect(Collectors.toList());
        
        // 构建日历VO
        ScheduleCalendarVO calendarVO = new ScheduleCalendarVO();
        calendarVO.setEmployeeId(employeeId);
        calendarVO.setEmployeeName(employee.getName());
        calendarVO.setYearMonth(yearMonth);
        calendarVO.setSchedulePlans(planVOs);
        
        // 计算统计信息
        ScheduleCalendarVO.ScheduleStatistics statistics = calculateStatistics(planVOs);
        calendarVO.setStatistics(statistics);
        
        return calendarVO;
    }
    
    // ==================== 私有辅助方法（排班计划） ====================
    
    /**
     * 验证目标类型
     * @param targetType 目标类型
     */
    private void validateTargetType(String targetType) {
        if (targetType == null) {
            throw new HrBusinessException("目标类型不能为空");
        }
        
        if (!TARGET_EMPLOYEE.equals(targetType) && !TARGET_POST.equals(targetType) && !TARGET_DEPT.equals(targetType)) {
            throw new HrBusinessException("不支持的目标类型：" + targetType);
        }
    }
    
    /**
     * 验证目标是否存在
     * @param targetType 目标类型
     * @param targetId 目标ID
     * @param tenantId 租户ID
     */
    private void validateTarget(String targetType, Long targetId, Long tenantId) {
        if (TARGET_DEPT.equals(targetType) && deptPostSyncService.validateDeptId(targetId)) {
            return;
        }
        if (TARGET_POST.equals(targetType) && deptPostSyncService.validatePostId(targetId)) {
            return;
        }
        if (TARGET_EMPLOYEE.equals(targetType)) {
            // 验证员工是否存在
            Employee employee = employeeMapper.selectById(targetId);
            if (employee == null || !employee.getTenantId().equals(tenantId)) {
                throw new HrBusinessException("员工不存在或无权限访问：" + targetId);
            }
        } else if (TARGET_POST.equals(targetType)) {
            PostVO post = deptPostSyncService.getCachedPost(targetId);
            if (post == null) {
                throw new HrBusinessException("岗位不存在：" + targetId);
            }
        } else if (TARGET_DEPT.equals(targetType)) {
            // 验证部门是否存在
            DeptVO dept = deptPostSyncService.getCachedDept(targetId);
            if (dept == null) {
                throw new HrBusinessException("部门不存在：" + targetId);
            }
        }
    }

    /**
     * 查询同一目标在同一天是否已经存在未取消的排班。
     */
    private SchedulePlan findActivePlan(Long tenantId, String targetType, Long targetId, LocalDate scheduleDate) {
        LambdaQueryWrapper<SchedulePlan> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SchedulePlan::getTenantId, tenantId)
                .eq(SchedulePlan::getTargetType, targetType)
                .eq(SchedulePlan::getTargetId, targetId)
                .eq(SchedulePlan::getScheduleDate, scheduleDate)
                .ne(SchedulePlan::getStatus, "CANCELLED")
                .last("LIMIT 1");
        return schedulePlanMapper.selectOne(wrapper);
    }
    
    /**
     * 转换为排班计划VO
     * @param plan 排班计划实体
     * @return 排班计划VO
     */
    private SchedulePlanVO convertToSchedulePlanVO(SchedulePlan plan) {
        SchedulePlanVO vo = new SchedulePlanVO();
        BeanUtils.copyProperties(plan, vo);
        
        // 查询班次信息
        Shift shift = shiftMapper.selectById(plan.getShiftId());
        if (shift != null) {
            vo.setShiftName(shift.getShiftName());
            vo.setShiftCode(shift.getShiftCode());
        }
        
        // 查询目标名称
        if (TARGET_EMPLOYEE.equals(plan.getTargetType())) {
            Employee employee = employeeMapper.selectById(plan.getTargetId());
            if (employee != null) {
                vo.setTargetName(employee.getName());
            }
        } else if (TARGET_POST.equals(plan.getTargetType())) {
            PostVO post = deptPostSyncService.getCachedPost(plan.getTargetId());
            if (post != null) {
                vo.setTargetName(post.getPostName());
            }
        } else if (TARGET_DEPT.equals(plan.getTargetType())) {
            DeptVO dept = deptPostSyncService.getCachedDept(plan.getTargetId());
            if (dept != null) {
                vo.setTargetName(dept.getDeptName());
            }
        }
        
        if (TARGET_DEPT.equals(plan.getTargetType()) && vo.getTargetName() == null) {
            DeptVO dept = getDeptFromCacheOrSync(plan.getTargetId());
            vo.setTargetName(dept != null ? dept.getDeptName() : "未知部门");
        }
        if (TARGET_POST.equals(plan.getTargetType()) && vo.getTargetName() == null) {
            PostVO post = deptPostSyncService.getCachedPost(plan.getTargetId());
            vo.setTargetName(post != null ? post.getPostName() : "未知岗位");
        }
        return vo;
    }

    private ScheduleRuleAssignmentVO convertToScheduleRuleAssignmentVO(ScheduleRuleAssignment assignment) {
        ScheduleRuleAssignmentVO vo = new ScheduleRuleAssignmentVO();
        BeanUtils.copyProperties(assignment, vo);
        vo.setStatusDesc(assignment.getStatus() != null && assignment.getStatus() == 1 ? "启用" : "禁用");
        vo.setTargetName(resolveAssignmentTargetName(assignment));
        return vo;
    }

    private String resolveAssignmentTargetName(ScheduleRuleAssignment assignment) {
        if (TARGET_EMPLOYEE.equals(assignment.getTargetType())) {
            Employee employee = employeeMapper.selectById(assignment.getTargetId());
            return employee == null ? String.valueOf(assignment.getTargetId()) : employee.getName();
        }
        if (TARGET_POST.equals(assignment.getTargetType())) {
            PostVO post = deptPostSyncService.getCachedPost(assignment.getTargetId());
            return post == null ? String.valueOf(assignment.getTargetId()) : post.getPostName();
        }
        if (TARGET_DEPT.equals(assignment.getTargetType())) {
            DeptVO dept = deptPostSyncService.getCachedDept(assignment.getTargetId());
            return dept == null ? String.valueOf(assignment.getTargetId()) : dept.getDeptName();
        }
        return String.valueOf(assignment.getTargetId());
    }

    /**
     * 排班展示优先复用缓存，缓存未命中时补一次组织主数据同步。
     */
    private DeptVO getDeptFromCacheOrSync(Long deptId) {
        DeptVO dept = deptPostSyncService.getCachedDept(deptId);
        if (dept != null) {
            return dept;
        }

        if (!deptPostSyncService.validateDeptId(deptId)) {
            return null;
        }

        dept = deptPostSyncService.getCachedDept(deptId);
        if (dept != null) {
            return dept;
        }

        DeptVO fallbackDept = new DeptVO();
        fallbackDept.setDeptId(deptId);
        fallbackDept.setDeptName("未知部门");
        return fallbackDept;
    }
    
    /**
     * 计算排班统计信息
     * @param plans 排班计划列表
     * @return 统计信息
     */
    private ScheduleCalendarVO.ScheduleStatistics calculateStatistics(List<SchedulePlanVO> plans) {
        ScheduleCalendarVO.ScheduleStatistics statistics = new ScheduleCalendarVO.ScheduleStatistics();
        
        // 总排班天数
        statistics.setTotalDays(plans.size());
        
        // 工作日天数（状态为PUBLISHED的）
        long workDays = plans.stream()
                .filter(p -> "PUBLISHED".equals(p.getStatus()))
                .count();
        statistics.setWorkDays((int) workDays);
        
        // 休息日天数（暂时简单计算）
        statistics.setRestDays(0);
        
        // 预计工作时长（小时）
        double expectedWorkHours = plans.stream()
                .filter(p -> "PUBLISHED".equals(p.getStatus()))
                .mapToDouble(p -> {
                    Shift shift = shiftMapper.selectById(p.getShiftId());
                    return shift != null ? shift.getWorkMinutes() / 60.0 : 0;
                })
                .sum();
        statistics.setExpectedWorkHours(expectedWorkHours);
        
        return statistics;
    }
}
