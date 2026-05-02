package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.domain.bo.AttendanceRuleResolution;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.SchedulePlan;
import com.cloudflow.hr.domain.entity.ScheduleRule;
import com.cloudflow.hr.domain.entity.ScheduleRuleAssignment;
import com.cloudflow.hr.domain.entity.Shift;
import com.cloudflow.hr.domain.entity.WorkCalendar;
import com.cloudflow.hr.domain.vo.EffectiveAttendanceRuleVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.SchedulePlanMapper;
import com.cloudflow.hr.mapper.ScheduleRuleAssignmentMapper;
import com.cloudflow.hr.mapper.ScheduleRuleMapper;
import com.cloudflow.hr.mapper.ShiftMapper;
import com.cloudflow.hr.mapper.WorkCalendarMapper;
import com.cloudflow.hr.service.AttendanceRuleResolver;
import com.cloudflow.hr.service.DeptPostSyncService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceRuleResolverImpl implements AttendanceRuleResolver {

    private static final String TARGET_EMPLOYEE = "EMPLOYEE";
    private static final String TARGET_POST = "POST";
    private static final String TARGET_DEPT = "DEPT";
    private static final String PLAN_STATUS_PUBLISHED = "PUBLISHED";
    private static final String DAY_WORKDAY = "WORKDAY";
    private static final String DAY_REST = "REST";
    private static final String DAY_HOLIDAY = "HOLIDAY";

    private final EmployeeMapper employeeMapper;
    private final ScheduleRuleMapper scheduleRuleMapper;
    private final ScheduleRuleAssignmentMapper scheduleRuleAssignmentMapper;
    private final WorkCalendarMapper workCalendarMapper;
    private final SchedulePlanMapper schedulePlanMapper;
    private final ShiftMapper shiftMapper;
    private final DeptPostSyncService deptPostSyncService;
    private final ObjectMapper objectMapper;

    @Override
    public AttendanceRuleResolution resolve(Long employeeId, LocalDate date) {
        Employee employee = employeeMapper.selectById(employeeId);
        Long tenantId = SecurityUtils.getTenantId();
        if (employee == null || !tenantId.equals(employee.getTenantId())) {
            throw new HrBusinessException("员工不存在");
        }
        return resolve(employee, date);
    }

    @Override
    public AttendanceRuleResolution resolve(Employee employee, LocalDate date) {
        if (employee == null) {
            throw new HrBusinessException("员工不存在");
        }
        LocalDate targetDate = date == null ? LocalDate.now() : date;
        ScheduleRuleAssignment assignment = findEffectiveAssignment(employee, targetDate);
        ScheduleRule rule = assignment == null ? findDefaultRule(employee.getTenantId()) : scheduleRuleMapper.selectById(assignment.getRuleId());
        if (rule == null || !employee.getTenantId().equals(rule.getTenantId()) || rule.getStatus() == null || rule.getStatus() != 1) {
            throw new HrBusinessException("未找到可用考勤规则");
        }

        Map<String, Object> config = parseRuleConfig(rule.getRuleConfig());
        SchedulePlan schedulePlan = resolveSchedulePlan(employee, targetDate);
        Long shiftId = schedulePlan != null ? schedulePlan.getShiftId() : readLong(config, "shiftId");
        Shift shift = shiftId == null ? null : shiftMapper.selectById(shiftId);
        if (shift != null && !employee.getTenantId().equals(shift.getTenantId())) {
            shift = null;
        }

        WorkCalendar calendar = findCalendar(employee.getTenantId(), targetDate);
        AttendanceRuleResolution resolution = new AttendanceRuleResolution();
        resolution.setEmployee(employee);
        resolution.setRule(rule);
        resolution.setAssignment(assignment);
        resolution.setCalendar(calendar);
        resolution.setSchedulePlan(schedulePlan);
        resolution.setShift(shift);
        resolution.setAttendanceDate(targetDate);
        resolution.setSourceType(assignment == null ? "DEFAULT" : assignment.getTargetType());
        resolution.setSourceTargetId(assignment == null ? null : assignment.getTargetId());
        resolution.setSourceTargetName(resolveSourceName(assignment, employee));
        resolution.setDayType(resolveDayType(calendar, targetDate, config));
        resolution.setConfig(config);
        return resolution;
    }

    @Override
    public SchedulePlan resolveSchedulePlan(Employee employee, LocalDate date) {
        Map<LocalDate, SchedulePlan> plans = resolveSchedulePlans(employee, date, date);
        return plans.get(date);
    }

    @Override
    public Map<LocalDate, SchedulePlan> resolveSchedulePlans(Employee employee, LocalDate startDate, LocalDate endDate) {
        Map<LocalDate, SchedulePlan> effectivePlans = new LinkedHashMap<>();
        if (employee == null || startDate == null || endDate == null) {
            return effectivePlans;
        }
        if (employee.getDeptId() != null) {
            mergePublishedPlans(
                    effectivePlans,
                    schedulePlanMapper.selectByDateRange(employee.getTenantId(), TARGET_DEPT, employee.getDeptId(), startDate, endDate)
            );
        }
        if (employee.getPostId() != null) {
            mergePublishedPlans(
                    effectivePlans,
                    schedulePlanMapper.selectByDateRange(employee.getTenantId(), TARGET_POST, employee.getPostId(), startDate, endDate)
            );
        }
        mergePublishedPlans(
                effectivePlans,
                schedulePlanMapper.selectByDateRange(employee.getTenantId(), TARGET_EMPLOYEE, employee.getId(), startDate, endDate)
        );
        return effectivePlans;
    }

    @Override
    public EffectiveAttendanceRuleVO toEffectiveRuleVO(AttendanceRuleResolution resolution) {
        EffectiveAttendanceRuleVO vo = new EffectiveAttendanceRuleVO();
        ScheduleRule rule = resolution.getRule();
        Shift shift = resolution.getShift();
        Map<String, Object> config = resolution.getConfig() == null ? Map.of() : resolution.getConfig();

        vo.setRuleId(rule.getId());
        vo.setRuleName(rule.getRuleName());
        vo.setRuleType(rule.getRuleType());
        vo.setSourceType(resolution.getSourceType());
        vo.setSourceTargetId(resolution.getSourceTargetId());
        vo.setSourceTargetName(resolution.getSourceTargetName());
        vo.setShiftId(shift == null ? null : shift.getId());
        vo.setShiftName(shift == null ? null : shift.getShiftName());
        vo.setCheckInTime(shift == null ? null : shift.getStartTime());
        vo.setCheckOutTime(shift == null ? null : shift.getEndTime());
        vo.setBreakMinutes(shift == null ? 0 : shift.getBreakMinutes());
        vo.setLateThreshold(shift == null ? readInt(config, "elasticMinutes", 15) : shift.getLateThreshold());
        vo.setEarlyThreshold(shift == null ? readInt(config, "earlyThreshold", readInt(config, "elasticMinutes", 15)) : shift.getEarlyThreshold());
        vo.setSevereLateMinutes(readInt(config, "severeLateMinutes", 60));
        vo.setAbsentMinutes(readInt(config, "absentMinutes", 240));
        vo.setOvertimeEnabled(readBoolean(config, "overtimeEnabled", true));
        vo.setOvertimeMinMinutes(readInt(config, "overtimeMinMinutes", 30));
        vo.setPhotoRequired(readBoolean(config, "photoRequired", false));
        vo.setRadius(readInt(config, "radius", 500));
        vo.setCheckMethods(readStringList(config, "checkMethods", List.of("GPS", "WIFI", "FACE")));
        vo.setDayType(resolution.getDayType());
        vo.setDayName(resolution.getCalendar() == null ? null : resolution.getCalendar().getDayName());
        vo.setEffectiveDate(resolution.getAttendanceDate());
        return vo;
    }

    @Override
    public boolean isWorkday(AttendanceRuleResolution resolution) {
        return resolution != null && DAY_WORKDAY.equals(resolution.getDayType());
    }

    private ScheduleRuleAssignment findEffectiveAssignment(Employee employee, LocalDate date) {
        List<ScheduleRuleAssignment> candidates = new ArrayList<>();
        addAssignmentCandidates(candidates, employee.getTenantId(), TARGET_EMPLOYEE, employee.getId(), date);
        if (!candidates.isEmpty()) {
            return candidates.get(0);
        }
        addAssignmentCandidates(candidates, employee.getTenantId(), TARGET_POST, employee.getPostId(), date);
        if (!candidates.isEmpty()) {
            return candidates.get(0);
        }
        addAssignmentCandidates(candidates, employee.getTenantId(), TARGET_DEPT, employee.getDeptId(), date);
        return candidates.isEmpty() ? null : candidates.get(0);
    }

    private void addAssignmentCandidates(List<ScheduleRuleAssignment> candidates,
                                         Long tenantId,
                                         String targetType,
                                         Long targetId,
                                         LocalDate date) {
        if (targetId == null) {
            return;
        }
        LambdaQueryWrapper<ScheduleRuleAssignment> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ScheduleRuleAssignment::getTenantId, tenantId)
                .eq(ScheduleRuleAssignment::getTargetType, targetType)
                .eq(ScheduleRuleAssignment::getTargetId, targetId)
                .eq(ScheduleRuleAssignment::getStatus, 1)
                .le(ScheduleRuleAssignment::getEffectiveStart, date)
                .and(item -> item.isNull(ScheduleRuleAssignment::getEffectiveEnd)
                        .or()
                        .ge(ScheduleRuleAssignment::getEffectiveEnd, date))
                .orderByDesc(ScheduleRuleAssignment::getEffectiveStart)
                .last("LIMIT 1");
        ScheduleRuleAssignment assignment = scheduleRuleAssignmentMapper.selectOne(wrapper);
        if (assignment != null) {
            candidates.add(assignment);
        }
    }

    private ScheduleRule findDefaultRule(Long tenantId) {
        LambdaQueryWrapper<ScheduleRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ScheduleRule::getTenantId, tenantId)
                .eq(ScheduleRule::getStatus, 1)
                .orderByAsc(ScheduleRule::getId)
                .last("LIMIT 1");
        return scheduleRuleMapper.selectOne(wrapper);
    }

    private WorkCalendar findCalendar(Long tenantId, LocalDate date) {
        LambdaQueryWrapper<WorkCalendar> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WorkCalendar::getTenantId, tenantId)
                .eq(WorkCalendar::getCalendarDate, date)
                .eq(WorkCalendar::getStatus, 1)
                .last("LIMIT 1");
        return workCalendarMapper.selectOne(wrapper);
    }

    private String resolveDayType(WorkCalendar calendar, LocalDate date, Map<String, Object> config) {
        if (calendar != null && calendar.getDayType() != null) {
            return calendar.getDayType();
        }
        List<Integer> workDays = readIntList(config, "workDays", List.of(1, 2, 3, 4, 5));
        DayOfWeek dayOfWeek = date.getDayOfWeek();
        return workDays.contains(dayOfWeek.getValue()) ? DAY_WORKDAY : DAY_REST;
    }

    private Map<String, Object> parseRuleConfig(String value) {
        if (value == null || value.isBlank()) {
            return new HashMap<>();
        }
        try {
            return objectMapper.readValue(value, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            log.warn("考勤规则配置 JSON 解析失败: {}", value, e);
            return new HashMap<>();
        }
    }

    private void mergePublishedPlans(Map<LocalDate, SchedulePlan> effectivePlans, List<SchedulePlan> plans) {
        if (plans == null || plans.isEmpty()) {
            return;
        }
        for (SchedulePlan plan : plans) {
            if (plan == null || !PLAN_STATUS_PUBLISHED.equals(plan.getStatus()) || plan.getScheduleDate() == null) {
                continue;
            }
            effectivePlans.put(plan.getScheduleDate(), plan);
        }
    }

    private String resolveSourceName(ScheduleRuleAssignment assignment, Employee employee) {
        if (assignment == null) {
            return "默认规则";
        }
        if (TARGET_EMPLOYEE.equals(assignment.getTargetType())) {
            return employee.getId().equals(assignment.getTargetId()) ? employee.getName() : String.valueOf(assignment.getTargetId());
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

    private Long readLong(Map<String, Object> config, String key) {
        Object value = config.get(key);
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public static int readInt(Map<String, Object> config, String key, int fallback) {
        Object value = config.get(key);
        if (value == null) {
            return fallback;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    public static boolean readBoolean(Map<String, Object> config, String key, boolean fallback) {
        Object value = config.get(key);
        if (value == null) {
            return fallback;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        return Boolean.parseBoolean(value.toString());
    }

    @SuppressWarnings("unchecked")
    public static List<String> readStringList(Map<String, Object> config, String key, List<String> fallback) {
        Object value = config.get(key);
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        if (value instanceof String text && !text.isBlank()) {
            return List.of(text.split(","));
        }
        return fallback;
    }

    private List<Integer> readIntList(Map<String, Object> config, String key, List<Integer> fallback) {
        Object value = config.get(key);
        if (value instanceof List<?> list) {
            List<Integer> result = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Number number) {
                    result.add(number.intValue());
                } else {
                    try {
                        result.add(Integer.parseInt(String.valueOf(item)));
                    } catch (NumberFormatException ignored) {
                    }
                }
            }
            return result.isEmpty() ? fallback : result;
        }
        return fallback;
    }
}
