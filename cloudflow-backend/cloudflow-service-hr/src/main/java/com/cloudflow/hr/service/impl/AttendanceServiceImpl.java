package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.bo.AttendanceRuleResolution;
import com.cloudflow.hr.domain.dto.AttendanceCheckDTO;
import com.cloudflow.hr.domain.dto.AttendanceRecordQueryDTO;
import com.cloudflow.hr.domain.dto.AttendanceSupplementDTO;
import com.cloudflow.hr.domain.entity.AttendanceRecord;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.SchedulePlan;
import com.cloudflow.hr.domain.entity.ScheduleRule;
import com.cloudflow.hr.domain.entity.Shift;
import com.cloudflow.hr.domain.vo.AttendanceDailyVO;
import com.cloudflow.hr.domain.vo.AttendanceRecordVO;
import com.cloudflow.hr.domain.vo.EffectiveAttendanceRuleVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.AttendanceRecordMapper;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.ScheduleRuleMapper;
import com.cloudflow.hr.mapper.ShiftMapper;
import com.cloudflow.hr.service.AttendanceRuleResolver;
import com.cloudflow.hr.service.AttendanceService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * HR 考勤服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceServiceImpl implements AttendanceService {

    private static final String CHECK_TYPE_IN = "CHECK_IN";
    private static final String CHECK_TYPE_OUT = "CHECK_OUT";
    private static final String CHECK_METHOD_SUPPLEMENT = "SUPPLEMENT";
    private static final String STATUS_NORMAL = "NORMAL";
    private static final String STATUS_LATE = "LATE";
    private static final String STATUS_SEVERE_LATE = "SEVERE_LATE";
    private static final String STATUS_EARLY = "EARLY";
    private static final String STATUS_MISSING = "MISSING";
    private static final String STATUS_SUPPLEMENT = "SUPPLEMENT";
    private static final String STATUS_APPROVING = "APPROVING";
    private static final String STATUS_REJECTED = "REJECTED";
    private static final String STATUS_ABSENT = "ABSENT";

    private final AttendanceRecordMapper attendanceRecordMapper;
    private final EmployeeMapper employeeMapper;
    private final ShiftMapper shiftMapper;
    private final ScheduleRuleMapper scheduleRuleMapper;
    private final AttendanceRuleResolver attendanceRuleResolver;
    private final WorkflowServiceClient workflowServiceClient;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void checkIn(AttendanceCheckDTO dto) {
        dto.setCheckType(CHECK_TYPE_IN);
        doCheckAttendance(dto);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void checkOut(AttendanceCheckDTO dto) {
        dto.setCheckType(CHECK_TYPE_OUT);
        doCheckAttendance(dto);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createSupplementApplication(AttendanceSupplementDTO dto) {
        Employee employee = resolveAttendanceEmployee(dto.getEmployeeId());
        dto.setEmployeeId(employee.getId());
        validateAttendanceEligibleEmployee(employee, "补卡申请");
        validateSupplementConflict(employee.getId(), dto.getAttendanceDate(), dto.getCheckType(), null);

        AttendanceRuleResolution resolution = attendanceRuleResolver.resolve(employee, dto.getAttendanceDate());

        AttendanceRecord record = new AttendanceRecord();
        record.setTenantId(employee.getTenantId());
        record.setEmployeeId(employee.getId());
        record.setAttendanceDate(dto.getAttendanceDate());
        record.setRuleId(resolution.getRule().getId());
        record.setShiftId(resolution.getShift() != null ? resolution.getShift().getId() : null);
        record.setCheckType(dto.getCheckType());
        record.setCheckTime(dto.getCheckTime());
        record.setExpectedTime(resolveExpectedTime(dto.getAttendanceDate(), dto.getCheckType(), resolution.getShift()));
        record.setDeviationMinutes(resolveDeviationMinutes(dto.getCheckType(), dto.getCheckTime(), record.getExpectedTime()));
        record.setCheckMethod(CHECK_METHOD_SUPPLEMENT);
        record.setStatus(STATUS_MISSING);
        record.setRemark(dto.getReason());
        attendanceRecordMapper.insert(record);

        return record.getId();
    }

    @Override
    public List<AttendanceRecordVO> listSupplementApplications(AttendanceRecordQueryDTO query) {
        Long tenantId = SecurityUtils.getTenantId();
        LambdaQueryWrapper<AttendanceRecord> wrapper = buildAttendanceQuery(query, tenantId);
        wrapper.eq(AttendanceRecord::getCheckMethod, CHECK_METHOD_SUPPLEMENT)
                .orderByDesc(AttendanceRecord::getAttendanceDate, AttendanceRecord::getCheckTime, AttendanceRecord::getCreateTime);
        return attendanceRecordMapper.selectList(wrapper).stream()
                .map(this::toAttendanceRecordVO)
                .collect(Collectors.toList());
    }

    @Override
    public AttendanceRecordVO getSupplementApplication(Long id) {
        return toAttendanceRecordVO(getSupplementRecord(id));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateSupplementApplication(Long id, AttendanceSupplementDTO dto) {
        AttendanceRecord record = getSupplementRecord(id);
        validateEditableSupplement(record);

        Employee employee = resolveAttendanceEmployee(dto.getEmployeeId());
        dto.setEmployeeId(employee.getId());
        validateAttendanceEligibleEmployee(employee, "补卡申请编辑");
        validateSupplementConflict(employee.getId(), dto.getAttendanceDate(), dto.getCheckType(), id);

        AttendanceRuleResolution resolution = attendanceRuleResolver.resolve(employee, dto.getAttendanceDate());

        record.setTenantId(employee.getTenantId());
        record.setEmployeeId(employee.getId());
        record.setAttendanceDate(dto.getAttendanceDate());
        record.setRuleId(resolution.getRule().getId());
        record.setShiftId(resolution.getShift() != null ? resolution.getShift().getId() : null);
        record.setCheckType(dto.getCheckType());
        record.setCheckTime(dto.getCheckTime());
        record.setExpectedTime(resolveExpectedTime(dto.getAttendanceDate(), dto.getCheckType(), resolution.getShift()));
        record.setDeviationMinutes(resolveDeviationMinutes(dto.getCheckType(), dto.getCheckTime(), record.getExpectedTime()));
        record.setCheckMethod(CHECK_METHOD_SUPPLEMENT);
        record.setStatus(STATUS_MISSING);
        record.setProcessInstanceId(null);
        record.setRemark(dto.getReason());
        attendanceRecordMapper.updateById(record);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteSupplementApplication(Long id) {
        AttendanceRecord record = getSupplementRecord(id);
        validateEditableSupplement(record);
        attendanceRecordMapper.deleteById(id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitSupplementApplication(Long id) {
        AttendanceRecord record = getSupplementRecord(id);
        if (!STATUS_MISSING.equals(record.getStatus())) {
            throw new HrBusinessException("只有草稿状态的补卡申请才能提交");
        }

        ProcessStartDTO processStartDTO = new ProcessStartDTO();
        processStartDTO.setTenantId(record.getTenantId());
        processStartDTO.setProcessDefinitionKey(workflowProcessKeyProperties.getAttendanceSupplement());
        processStartDTO.setBusinessType("ATTENDANCE_SUPPLEMENT");
        processStartDTO.setBusinessId(id);
        processStartDTO.setBusinessNo("ATTENDANCE-" + id);
        processStartDTO.setProcessTitle("补卡申请-" + id);
        processStartDTO.setStartUserId(SecurityUtils.getUserId());

        Map<String, Object> variables = new HashMap<>();
        variables.put("employeeId", record.getEmployeeId());
        variables.put("attendanceDate", record.getAttendanceDate() != null ? record.getAttendanceDate().toString() : null);
        variables.put("checkType", record.getCheckType());
        variables.put("reason", record.getRemark());
        processStartDTO.setVariables(variables);

        try {
            R<String> result = workflowServiceClient.startProcess(processStartDTO);
            if (result == null) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败: Workflow 服务无响应");
            }
            if (!result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败: " + result.getMsg());
            }
            if (result.getData() == null || result.getData().isBlank()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败: Workflow 未返回流程实例ID");
            }
            record.setStatus(STATUS_APPROVING);
            record.setProcessInstanceId(result.getData());
            attendanceRecordMapper.updateById(record);
        } catch (Exception e) {
            log.error("启动补卡审批流程失败，recordId: {}", id, e);
            throw new HrBusinessException("启动审批流程失败: " + e.getMessage());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveSupplementApplication(Long id) {
        AttendanceRecord record = getSupplementRecord(id);
        if (!STATUS_APPROVING.equals(record.getStatus())) {
            throw new HrBusinessException("只有审批中的补卡申请才能通过");
        }
        record.setStatus(STATUS_SUPPLEMENT);
        attendanceRecordMapper.updateById(record);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectSupplementApplication(Long id) {
        AttendanceRecord record = getSupplementRecord(id);
        if (!STATUS_APPROVING.equals(record.getStatus())) {
            throw new HrBusinessException("只有审批中的补卡申请才能驳回");
        }
        record.setStatus(STATUS_REJECTED);
        attendanceRecordMapper.updateById(record);
    }

    @Override
    public List<AttendanceRecordVO> listAttendanceRecords(AttendanceRecordQueryDTO query) {
        Long tenantId = SecurityUtils.getTenantId();
        LambdaQueryWrapper<AttendanceRecord> wrapper = buildAttendanceQuery(query, tenantId);
        wrapper.orderByDesc(AttendanceRecord::getAttendanceDate, AttendanceRecord::getCheckTime);
        return attendanceRecordMapper.selectList(wrapper).stream()
                .map(this::toAttendanceRecordVO)
                .collect(Collectors.toList());
    }

    @Override
    public AttendanceDailyVO getDailyAttendance(Long employeeId, LocalDate date) {
        Employee employee = getEmployeeByIdWithinTenant(employeeId);
        List<AttendanceRecord> records = attendanceRecordMapper.selectByEmployeeAndDateAll(employee.getId(), date);
        AttendanceRuleResolution resolution = attendanceRuleResolver.resolve(employee, date);

        AttendanceDailyVO vo = new AttendanceDailyVO();
        vo.setEmployeeId(employee.getId());
        vo.setEmployeeName(employee.getName());
        vo.setAttendanceDate(date);

        if (resolution.getShift() != null) {
            vo.setShiftId(resolution.getShift().getId());
            vo.setShiftName(resolution.getShift().getShiftName());
        }

        AttendanceRecordVO checkInVO = null;
        AttendanceRecordVO checkOutVO = null;
        for (AttendanceRecord record : records) {
            AttendanceRecordVO recordVO = toAttendanceRecordVO(record);
            if (CHECK_TYPE_IN.equals(record.getCheckType())) {
                checkInVO = recordVO;
            } else if (CHECK_TYPE_OUT.equals(record.getCheckType())) {
                checkOutVO = recordVO;
            }
        }

        vo.setCheckInRecord(checkInVO);
        vo.setCheckOutRecord(checkOutVO);
        calculateAttendanceStatus(vo, checkInVO, checkOutVO, attendanceRuleResolver.isWorkday(resolution));
        return vo;
    }

    @Override
    public EffectiveAttendanceRuleVO getEffectiveRule(Long employeeId, LocalDate date) {
        Employee employee = employeeId == null ? resolveAttendanceEmployee(null) : getEmployeeByIdWithinTenant(employeeId);
        AttendanceRuleResolution resolution = attendanceRuleResolver.resolve(employee, date == null ? LocalDate.now() : date);
        return attendanceRuleResolver.toEffectiveRuleVO(resolution);
    }

    private void doCheckAttendance(AttendanceCheckDTO dto) {
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        Employee employee = resolveAttendanceEmployee(dto.getEmployeeId());
        dto.setEmployeeId(employee.getId());
        validateAttendanceEligibleEmployee(employee, "考勤打卡");

        AttendanceRecord existingRecord = attendanceRecordMapper.selectByEmployeeAndDate(
                employee.getId(), today, dto.getCheckType());
        if (existingRecord != null) {
            String label = CHECK_TYPE_IN.equals(dto.getCheckType()) ? "上班卡" : "下班卡";
            throw new HrBusinessException("今天已经打过" + label + "，请勿重复打卡");
        }

        AttendanceRuleResolution resolution = attendanceRuleResolver.resolve(employee, today);
        Shift shift = resolution.getShift();

        validateCheckMethod(dto, resolution);
        LocalDateTime expectedTime = resolveExpectedTime(today, dto.getCheckType(), shift);
        int deviationMinutes = resolveDeviationMinutes(dto.getCheckType(), now, expectedTime);
        String status = determineAttendanceStatus(dto.getCheckType(), now.toLocalTime(), shift, resolution.getConfig(), attendanceRuleResolver.isWorkday(resolution));

        AttendanceRecord record = new AttendanceRecord();
        record.setTenantId(employee.getTenantId());
        record.setEmployeeId(employee.getId());
        record.setAttendanceDate(today);
        record.setRuleId(resolution.getRule().getId());
        record.setShiftId(shift != null ? shift.getId() : null);
        record.setCheckType(dto.getCheckType());
        record.setCheckTime(now);
        record.setExpectedTime(expectedTime);
        record.setDeviationMinutes(deviationMinutes);
        record.setCheckMethod(dto.getCheckMethod());
        record.setLocation(dto.getLocation());
        record.setStatus(status);
        record.setRemark(dto.getRemark());
        attendanceRecordMapper.insert(record);
    }

    private void validateCheckMethod(AttendanceCheckDTO dto, AttendanceRuleResolution resolution) {
        List<String> checkMethods = readStringList(resolution.getConfig(), "checkMethods", List.of("GPS", "WIFI", "FACE"));
        if (!checkMethods.contains(dto.getCheckMethod())) {
            throw new HrBusinessException("当前规则不允许该打卡方式: " + dto.getCheckMethod());
        }
        switch (dto.getCheckMethod()) {
            case "GPS":
                validateGpsLocation(dto.getLatitude(), dto.getLongitude(), resolution.getConfig());
                break;
            case "WIFI":
                validateWifiSsid(dto.getWifiSsid(), resolution.getConfig());
                break;
            case "FACE":
                validateFaceToken(dto.getFaceToken());
                break;
            default:
                throw new HrBusinessException("不支持的打卡方式: " + dto.getCheckMethod());
        }
    }

    private void validateGpsLocation(Double latitude, Double longitude, Map<String, Object> config) {
        if (latitude == null || longitude == null) {
            throw new HrBusinessException("GPS 定位信息不完整");
        }

        List<Map<String, Object>> points = readMapList(config, "locationPoints");
        if (points.isEmpty()) {
            return;
        }

        int radius = readInt(config, "radius", 500);
        double minDistance = Double.MAX_VALUE;
        for (Map<String, Object> point : points) {
            Double targetLatitude = readDouble(point, "latitude");
            Double targetLongitude = readDouble(point, "longitude");
            Integer pointRadius = readNullableInt(point, "radius");
            if (targetLatitude == null || targetLongitude == null) {
                continue;
            }
            double distance = calculateDistance(latitude, longitude, targetLatitude, targetLongitude);
            minDistance = Math.min(minDistance, distance);
            if (distance <= (pointRadius == null ? radius : pointRadius)) {
                return;
            }
        }
        if (minDistance != Double.MAX_VALUE) {
            throw new HrBusinessException(String.format("GPS 定位超出允许范围，当前距离 %.0f 米，允许范围 %.0f 米",
                    minDistance, (double) radius));
        }
    }

    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        final int earthRadius = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadius * c;
    }

    private void validateWifiSsid(String wifiSsid, Map<String, Object> config) {
        if (wifiSsid == null || wifiSsid.trim().isEmpty()) {
            throw new HrBusinessException("WiFi SSID 不能为空");
        }
        List<String> whitelist = readWifiWhitelist(config);
        if (!whitelist.isEmpty() && !whitelist.contains(wifiSsid)) {
            throw new HrBusinessException("WiFi SSID 不在白名单中: " + wifiSsid);
        }
    }

    private void validateFaceToken(String faceToken) {
        if (faceToken == null || faceToken.trim().isEmpty()) {
            throw new HrBusinessException("人脸识别 token 不能为空");
        }
    }

    private String determineAttendanceStatus(String checkType,
                                             LocalTime checkTime,
                                             Shift shift,
                                             Map<String, Object> config,
                                             boolean workday) {
        if (!workday || shift == null) {
            return STATUS_NORMAL;
        }

        if (CHECK_TYPE_IN.equals(checkType)) {
            LocalTime startTime = shift.getStartTime();
            int lateThreshold = shift.getLateThreshold() == null ? 0 : shift.getLateThreshold();
            if (startTime != null && checkTime.isAfter(startTime.plusMinutes(lateThreshold))) {
                int absentMinutes = readInt(config, "absentMinutes", 240);
                if (checkTime.isAfter(startTime.plusMinutes(absentMinutes))) {
                    return STATUS_ABSENT;
                }
                int severeLateMinutes = readInt(config, "severeLateMinutes", 60);
                if (checkTime.isAfter(startTime.plusMinutes(severeLateMinutes))) {
                    return STATUS_SEVERE_LATE;
                }
                return STATUS_LATE;
            }
        }

        if (CHECK_TYPE_OUT.equals(checkType)) {
            LocalTime endTime = shift.getEndTime();
            int earlyThreshold = shift.getEarlyThreshold() == null ? 0 : shift.getEarlyThreshold();
            if (endTime != null && checkTime.isBefore(endTime.minusMinutes(earlyThreshold))) {
                return STATUS_EARLY;
            }
        }

        return STATUS_NORMAL;
    }

    private Employee resolveAttendanceEmployee(Long employeeId) {
        if (employeeId != null) {
            return getEmployeeByIdWithinTenant(employeeId);
        }

        Long tenantId = SecurityUtils.getTenantId();
        Long userId = SecurityUtils.getUserId();
        if (userId == null) {
            throw new HrBusinessException("未找到当前登录用户，无法定位员工档案");
        }

        LambdaQueryWrapper<Employee> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Employee::getTenantId, tenantId)
                .eq(Employee::getUserId, userId)
                .last("LIMIT 1");
        Employee employee = employeeMapper.selectOne(wrapper);
        if (employee == null) {
            throw new HrBusinessException("当前登录用户未关联 HR 员工档案");
        }
        return employee;
    }

    private Employee getEmployeeByIdWithinTenant(Long employeeId) {
        Long tenantId = SecurityUtils.getTenantId();
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null || !tenantId.equals(employee.getTenantId())) {
            throw new HrBusinessException("员工不存在");
        }
        return employee;
    }

    private void validateAttendanceEligibleEmployee(Employee employee, String operation) {
        if ("PROBATION".equals(employee.getEmployeeStatus()) || "REGULAR".equals(employee.getEmployeeStatus())) {
            return;
        }
        throw HrBusinessException.invalidEmployeeStatus(employee.getId(), employee.getEmployeeStatus(), operation);
    }

    private void validateSupplementConflict(Long employeeId,
                                            LocalDate attendanceDate,
                                            String checkType,
                                            Long currentRecordId) {
        AttendanceRecord existingRecord = attendanceRecordMapper.selectByEmployeeAndDate(employeeId, attendanceDate, checkType);
        if (existingRecord != null && (currentRecordId == null || !existingRecord.getId().equals(currentRecordId))) {
            throw new HrBusinessException("该日期已存在对应打卡记录，无法重复补卡");
        }
    }

    private AttendanceRecord getSupplementRecord(Long id) {
        Long tenantId = SecurityUtils.getTenantId();
        AttendanceRecord record = attendanceRecordMapper.selectById(id);
        if (record == null || !tenantId.equals(record.getTenantId()) || !CHECK_METHOD_SUPPLEMENT.equals(record.getCheckMethod())) {
            throw new HrBusinessException("补卡申请不存在");
        }
        return record;
    }

    private void validateEditableSupplement(AttendanceRecord record) {
        if (STATUS_MISSING.equals(record.getStatus()) || STATUS_REJECTED.equals(record.getStatus())) {
            return;
        }
        throw new HrBusinessException("只有草稿或已驳回的补卡申请才允许编辑或删除");
    }

    private LambdaQueryWrapper<AttendanceRecord> buildAttendanceQuery(AttendanceRecordQueryDTO query, Long tenantId) {
        LambdaQueryWrapper<AttendanceRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AttendanceRecord::getTenantId, tenantId);

        if (query.getDeptId() != null) {
            LambdaQueryWrapper<Employee> employeeWrapper = new LambdaQueryWrapper<>();
            employeeWrapper.eq(Employee::getTenantId, tenantId)
                    .eq(Employee::getDeptId, query.getDeptId());
            List<Long> employeeIds = employeeMapper.selectList(employeeWrapper).stream()
                    .map(Employee::getId)
                    .collect(Collectors.toList());
            if (employeeIds.isEmpty()) {
                wrapper.in(AttendanceRecord::getEmployeeId, Collections.singletonList(-1L));
            } else {
                wrapper.in(AttendanceRecord::getEmployeeId, employeeIds);
            }
        }

        if (query.getEmployeeId() != null) {
            wrapper.eq(AttendanceRecord::getEmployeeId, query.getEmployeeId());
        }
        if (query.getStartDate() != null) {
            wrapper.ge(AttendanceRecord::getAttendanceDate, query.getStartDate());
        }
        if (query.getEndDate() != null) {
            wrapper.le(AttendanceRecord::getAttendanceDate, query.getEndDate());
        }
        if (query.getCheckType() != null && !query.getCheckType().trim().isEmpty()) {
            wrapper.eq(AttendanceRecord::getCheckType, query.getCheckType());
        }
        if (query.getStatus() != null && !query.getStatus().trim().isEmpty()) {
            wrapper.eq(AttendanceRecord::getStatus, query.getStatus());
        }
        return wrapper;
    }

    private AttendanceRecordVO toAttendanceRecordVO(AttendanceRecord record) {
        AttendanceRecordVO vo = new AttendanceRecordVO();
        BeanUtils.copyProperties(record, vo);

        Employee employee = employeeMapper.selectById(record.getEmployeeId());
        if (employee != null) {
            vo.setEmployeeName(employee.getName());
            vo.setEmployeeNo(employee.getEmployeeNo());
        }

        if (record.getShiftId() != null) {
            Shift shift = shiftMapper.selectById(record.getShiftId());
            if (shift != null) {
                vo.setShiftName(shift.getShiftName());
            }
        }
        if (record.getRuleId() != null) {
            ScheduleRule rule = scheduleRuleMapper.selectById(record.getRuleId());
            if (rule != null) {
                vo.setRuleName(rule.getRuleName());
            }
        }
        return vo;
    }

    private void calculateAttendanceStatus(AttendanceDailyVO vo,
                                           AttendanceRecordVO checkInVO,
                                           AttendanceRecordVO checkOutVO,
                                           boolean hasSchedule) {
        if (checkInVO == null && checkOutVO == null) {
            // 无排班且无打卡记录时，不应误判为旷工。
            vo.setAttendanceStatus(hasSchedule ? STATUS_ABSENT : STATUS_NORMAL);
            return;
        }

        if (checkInVO == null || checkOutVO == null) {
            vo.setAttendanceStatus(STATUS_MISSING);
        } else if (STATUS_ABSENT.equals(checkInVO.getStatus())) {
            vo.setAttendanceStatus(STATUS_ABSENT);
        } else if (STATUS_SEVERE_LATE.equals(checkInVO.getStatus())) {
            vo.setAttendanceStatus(STATUS_SEVERE_LATE);
        } else if (STATUS_LATE.equals(checkInVO.getStatus())) {
            vo.setAttendanceStatus(STATUS_LATE);
        } else if (STATUS_EARLY.equals(checkOutVO.getStatus())) {
            vo.setAttendanceStatus(STATUS_EARLY);
        } else {
            vo.setAttendanceStatus(STATUS_NORMAL);
        }

        if (checkInVO != null && checkOutVO != null
                && checkInVO.getCheckTime() != null && checkOutVO.getCheckTime() != null) {
            Duration duration = Duration.between(checkInVO.getCheckTime(), checkOutVO.getCheckTime());
            vo.setWorkMinutes((int) Math.max(duration.toMinutes(), 0));
        }
    }

    private LocalDateTime resolveExpectedTime(LocalDate attendanceDate, String checkType, Shift shift) {
        if (attendanceDate == null || shift == null) {
            return null;
        }
        if (CHECK_TYPE_IN.equals(checkType) && shift.getStartTime() != null) {
            return attendanceDate.atTime(shift.getStartTime());
        }
        if (CHECK_TYPE_OUT.equals(checkType) && shift.getEndTime() != null) {
            LocalDate expectedDate = shift.getEndTime().isBefore(shift.getStartTime()) ? attendanceDate.plusDays(1) : attendanceDate;
            return expectedDate.atTime(shift.getEndTime());
        }
        return null;
    }

    private int resolveDeviationMinutes(String checkType, LocalDateTime checkTime, LocalDateTime expectedTime) {
        if (checkTime == null || expectedTime == null) {
            return 0;
        }
        return (int) Duration.between(expectedTime, checkTime).toMinutes();
    }

    private int readInt(Map<String, Object> config, String key, int fallback) {
        Object value = config == null ? null : config.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value != null) {
            try {
                return Integer.parseInt(value.toString());
            } catch (NumberFormatException ignored) {
            }
        }
        return fallback;
    }

    private Integer readNullableInt(Map<String, Object> config, String key) {
        Object value = config == null ? null : config.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value != null) {
            try {
                return Integer.parseInt(value.toString());
            } catch (NumberFormatException ignored) {
            }
        }
        return null;
    }

    private Double readDouble(Map<String, Object> config, String key) {
        Object value = config == null ? null : config.get(key);
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value != null) {
            try {
                return Double.parseDouble(value.toString());
            } catch (NumberFormatException ignored) {
            }
        }
        return null;
    }

    private List<String> readStringList(Map<String, Object> config, String key, List<String> fallback) {
        Object value = config == null ? null : config.get(key);
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).collect(Collectors.toList());
        }
        if (value instanceof String text && !text.isBlank()) {
            return List.of(text.split(","));
        }
        return fallback;
    }

    private List<Map<String, Object>> readMapList(Map<String, Object> config, String key) {
        Object value = config == null ? null : config.get(key);
        if (value instanceof List<?> list) {
            List<Map<String, Object>> result = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Map<String, Object> typed = new HashMap<>();
                    map.forEach((mapKey, mapValue) -> typed.put(String.valueOf(mapKey), mapValue));
                    result.add(typed);
                }
            }
            return result;
        }
        return List.of();
    }

    private List<String> readWifiWhitelist(Map<String, Object> config) {
        Object value = config == null ? null : config.get("wifiConfigs");
        if (value instanceof List<?> list) {
            List<String> result = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Object ssid = map.get("ssid");
                    if (ssid != null) {
                        result.add(String.valueOf(ssid));
                    }
                } else if (item != null) {
                    result.add(String.valueOf(item));
                }
            }
            return result;
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                List<Map<String, Object>> parsed = objectMapper.readValue(text, new TypeReference<List<Map<String, Object>>>() {
                });
                return parsed.stream()
                        .map(item -> item.get("ssid"))
                        .filter(item -> item != null)
                        .map(String::valueOf)
                        .collect(Collectors.toList());
            } catch (Exception ignored) {
                return List.of(text.split(","));
            }
        }
        return List.of();
    }
}
