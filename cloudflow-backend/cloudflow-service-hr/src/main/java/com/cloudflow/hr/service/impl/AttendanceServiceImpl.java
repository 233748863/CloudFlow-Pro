package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.AttendanceCheckDTO;
import com.cloudflow.hr.domain.dto.AttendanceRecordQueryDTO;
import com.cloudflow.hr.domain.dto.AttendanceSupplementDTO;
import com.cloudflow.hr.domain.entity.AttendanceRecord;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.SchedulePlan;
import com.cloudflow.hr.domain.entity.Shift;
import com.cloudflow.hr.domain.vo.AttendanceDailyVO;
import com.cloudflow.hr.domain.vo.AttendanceRecordVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.AttendanceRecordMapper;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.SchedulePlanMapper;
import com.cloudflow.hr.mapper.ShiftMapper;
import com.cloudflow.hr.service.AttendanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
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
    private static final String STATUS_EARLY = "EARLY";
    private static final String STATUS_MISSING = "MISSING";
    private static final String STATUS_SUPPLEMENT = "SUPPLEMENT";
    private static final String STATUS_APPROVING = "APPROVING";
    private static final String STATUS_REJECTED = "REJECTED";
    private static final String TARGET_EMPLOYEE = "EMPLOYEE";
    private static final String TARGET_DEPT = "DEPT";
    private static final String PLAN_STATUS_PUBLISHED = "PUBLISHED";

    // GPS 打卡允许距离，单位米。
    private static final double GPS_ALLOWED_DISTANCE = 500.0;
    private static final double COMPANY_LATITUDE = 39.9042;
    private static final double COMPANY_LONGITUDE = 116.4074;
    private static final List<String> WIFI_WHITELIST = List.of("CompanyWiFi", "CompanyWiFi-5G", "CompanyGuest");

    private final AttendanceRecordMapper attendanceRecordMapper;
    private final EmployeeMapper employeeMapper;
    private final SchedulePlanMapper schedulePlanMapper;
    private final ShiftMapper shiftMapper;
    private final WorkflowServiceClient workflowServiceClient;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

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

        SchedulePlan schedulePlan = getSchedulePlan(employee, dto.getAttendanceDate());

        AttendanceRecord record = new AttendanceRecord();
        record.setTenantId(employee.getTenantId());
        record.setEmployeeId(employee.getId());
        record.setAttendanceDate(dto.getAttendanceDate());
        // 无排班时也允许补卡，兼容临时加班、临时到岗等非计划性出勤。
        record.setShiftId(schedulePlan != null ? schedulePlan.getShiftId() : null);
        record.setCheckType(dto.getCheckType());
        record.setCheckTime(dto.getCheckTime());
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

        SchedulePlan schedulePlan = getSchedulePlan(employee, dto.getAttendanceDate());

        record.setTenantId(employee.getTenantId());
        record.setEmployeeId(employee.getId());
        record.setAttendanceDate(dto.getAttendanceDate());
        // 编辑补卡时保持与新增一致：无排班也允许提交业务单据。
        record.setShiftId(schedulePlan != null ? schedulePlan.getShiftId() : null);
        record.setCheckType(dto.getCheckType());
        record.setCheckTime(dto.getCheckTime());
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
            if (!result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败: " + result.getMsg());
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
        SchedulePlan schedulePlan = getSchedulePlan(employee, date);

        AttendanceDailyVO vo = new AttendanceDailyVO();
        vo.setEmployeeId(employee.getId());
        vo.setEmployeeName(employee.getName());
        vo.setAttendanceDate(date);

        if (schedulePlan != null) {
            vo.setShiftId(schedulePlan.getShiftId());
            Shift shift = shiftMapper.selectById(schedulePlan.getShiftId());
            if (shift != null) {
                vo.setShiftName(shift.getShiftName());
            }
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
        calculateAttendanceStatus(vo, checkInVO, checkOutVO, schedulePlan != null);
        return vo;
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

        SchedulePlan schedulePlan = getSchedulePlan(employee, today);
        Shift shift = null;
        if (schedulePlan != null) {
            shift = shiftMapper.selectById(schedulePlan.getShiftId());
            if (shift == null || !employee.getTenantId().equals(shift.getTenantId())) {
                throw new HrBusinessException("班次信息不存在");
            }
        }

        validateCheckMethod(dto);
        String status = determineAttendanceStatus(dto.getCheckType(), now.toLocalTime(), shift);

        AttendanceRecord record = new AttendanceRecord();
        record.setTenantId(employee.getTenantId());
        record.setEmployeeId(employee.getId());
        record.setAttendanceDate(today);
        // 无排班时也允许打卡，兼容临时加班、外勤返岗等高频场景。
        record.setShiftId(shift != null ? shift.getId() : null);
        record.setCheckType(dto.getCheckType());
        record.setCheckTime(now);
        record.setCheckMethod(dto.getCheckMethod());
        record.setLocation(dto.getLocation());
        record.setStatus(status);
        record.setRemark(dto.getRemark());
        attendanceRecordMapper.insert(record);
    }

    private void validateCheckMethod(AttendanceCheckDTO dto) {
        switch (dto.getCheckMethod()) {
            case "GPS":
                validateGpsLocation(dto.getLatitude(), dto.getLongitude());
                break;
            case "WIFI":
                validateWifiSsid(dto.getWifiSsid());
                break;
            case "FACE":
                validateFaceToken(dto.getFaceToken());
                break;
            default:
                throw new HrBusinessException("不支持的打卡方式: " + dto.getCheckMethod());
        }
    }

    private void validateGpsLocation(Double latitude, Double longitude) {
        if (latitude == null || longitude == null) {
            throw new HrBusinessException("GPS 定位信息不完整");
        }

        double distance = calculateDistance(latitude, longitude, COMPANY_LATITUDE, COMPANY_LONGITUDE);
        if (distance > GPS_ALLOWED_DISTANCE) {
            throw new HrBusinessException(String.format("GPS 定位超出允许范围，当前距离 %.0f 米，允许范围 %.0f 米",
                    distance, GPS_ALLOWED_DISTANCE));
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

    private void validateWifiSsid(String wifiSsid) {
        if (wifiSsid == null || wifiSsid.trim().isEmpty()) {
            throw new HrBusinessException("WiFi SSID 不能为空");
        }
        if (!WIFI_WHITELIST.contains(wifiSsid)) {
            throw new HrBusinessException("WiFi SSID 不在白名单中: " + wifiSsid);
        }
    }

    private void validateFaceToken(String faceToken) {
        if (faceToken == null || faceToken.trim().isEmpty()) {
            throw new HrBusinessException("人脸识别 token 不能为空");
        }
    }

    private String determineAttendanceStatus(String checkType, LocalTime checkTime, Shift shift) {
        // 无排班时无法判断迟到或早退，默认按正常打卡处理。
        if (shift == null) {
            return STATUS_NORMAL;
        }

        if (CHECK_TYPE_IN.equals(checkType)) {
            LocalTime startTime = shift.getStartTime();
            int lateThreshold = shift.getLateThreshold() == null ? 0 : shift.getLateThreshold();
            if (startTime != null && checkTime.isAfter(startTime.plusMinutes(lateThreshold))) {
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

    private SchedulePlan getSchedulePlan(Employee employee, LocalDate date) {
        Long tenantId = employee.getTenantId();

        LambdaQueryWrapper<SchedulePlan> employeeWrapper = new LambdaQueryWrapper<>();
        employeeWrapper.eq(SchedulePlan::getTenantId, tenantId)
                .eq(SchedulePlan::getTargetType, TARGET_EMPLOYEE)
                .eq(SchedulePlan::getTargetId, employee.getId())
                .eq(SchedulePlan::getScheduleDate, date)
                .eq(SchedulePlan::getStatus, PLAN_STATUS_PUBLISHED);
        SchedulePlan employeePlan = schedulePlanMapper.selectOne(employeeWrapper);
        if (employeePlan != null) {
            return employeePlan;
        }

        if (employee.getDeptId() == null) {
            return null;
        }

        LambdaQueryWrapper<SchedulePlan> deptWrapper = new LambdaQueryWrapper<>();
        deptWrapper.eq(SchedulePlan::getTenantId, tenantId)
                .eq(SchedulePlan::getTargetType, TARGET_DEPT)
                .eq(SchedulePlan::getTargetId, employee.getDeptId())
                .eq(SchedulePlan::getScheduleDate, date)
                .eq(SchedulePlan::getStatus, PLAN_STATUS_PUBLISHED);
        return schedulePlanMapper.selectOne(deptWrapper);
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
        return vo;
    }

    private void calculateAttendanceStatus(AttendanceDailyVO vo,
                                           AttendanceRecordVO checkInVO,
                                           AttendanceRecordVO checkOutVO,
                                           boolean hasSchedule) {
        if (checkInVO == null && checkOutVO == null) {
            // 无排班且无打卡记录时，不应误判为旷工。
            vo.setAttendanceStatus(hasSchedule ? "ABSENT" : STATUS_NORMAL);
            return;
        }

        if (checkInVO == null || checkOutVO == null) {
            vo.setAttendanceStatus(STATUS_MISSING);
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
}
