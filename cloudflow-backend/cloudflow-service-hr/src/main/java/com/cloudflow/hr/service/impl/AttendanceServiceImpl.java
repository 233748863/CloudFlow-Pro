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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 考勤打卡服务实现类
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceServiceImpl implements AttendanceService {
    
    private final AttendanceRecordMapper attendanceRecordMapper;
    private final EmployeeMapper employeeMapper;
    private final SchedulePlanMapper schedulePlanMapper;
    private final ShiftMapper shiftMapper;
    private final WorkflowServiceClient workflowServiceClient;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;
    
    // GPS打卡允许的距离范围（米）
    private static final double GPS_ALLOWED_DISTANCE = 500.0;
    
    // 公司GPS坐标（示例：北京市朝阳区）
    private static final double COMPANY_LATITUDE = 39.9042;
    private static final double COMPANY_LONGITUDE = 116.4074;
    
    // WiFi白名单
    private static final List<String> WIFI_WHITELIST = List.of("CompanyWiFi", "CompanyWiFi-5G", "CompanyGuest");
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void checkIn(AttendanceCheckDTO dto) {
        log.info("员工上班打卡，employeeId: {}, checkMethod: {}", dto.getEmployeeId(), dto.getCheckMethod());
        
        // 设置打卡类型为上班打卡
        dto.setCheckType("CHECK_IN");
        
        // 执行打卡
        doCheckAttendance(dto);
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void checkOut(AttendanceCheckDTO dto) {
        log.info("员工下班打卡，employeeId: {}, checkMethod: {}", dto.getEmployeeId(), dto.getCheckMethod());
        
        // 设置打卡类型为下班打卡
        dto.setCheckType("CHECK_OUT");
        
        // 执行打卡
        doCheckAttendance(dto);
    }
    
    /**
     * 执行打卡逻辑
     * 
     * @param dto 打卡请求DTO
     */
    private void doCheckAttendance(AttendanceCheckDTO dto) {
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        
        // 1. 验证员工是否存在
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null) {
            throw new HrBusinessException("员工不存在");
        }
        validateAttendanceEligibleEmployee(employee, "考勤打卡");
        
        // 2. 检查是否已经打过卡
        AttendanceRecord existingRecord = attendanceRecordMapper.selectByEmployeeAndDate(
                dto.getEmployeeId(), today, dto.getCheckType());
        if (existingRecord != null) {
            throw new HrBusinessException("今天已经打过" + 
                    ("CHECK_IN".equals(dto.getCheckType()) ? "上班卡" : "下班卡") + "，请勿重复打卡");
        }
        
        // 3. 获取员工今天的排班信息
        SchedulePlan schedulePlan = getSchedulePlan(dto.getEmployeeId(), today);
        if (schedulePlan == null) {
            throw new HrBusinessException("今天没有排班，无法打卡");
        }
        
        // 4. 获取班次信息
        Shift shift = shiftMapper.selectById(schedulePlan.getShiftId());
        if (shift == null) {
            throw new HrBusinessException("班次信息不存在");
        }
        
        // 5. 验证打卡方式
        validateCheckMethod(dto);
        
        // 6. 判断打卡状态（正常、迟到、早退）
        String status = determineAttendanceStatus(dto.getCheckType(), now.toLocalTime(), shift);
        
        // 7. 创建打卡记录
        AttendanceRecord record = new AttendanceRecord();
        record.setTenantId(employee.getTenantId());
        record.setEmployeeId(dto.getEmployeeId());
        record.setAttendanceDate(today);
        record.setShiftId(shift.getId());
        record.setCheckType(dto.getCheckType());
        record.setCheckTime(now);
        record.setCheckMethod(dto.getCheckMethod());
        record.setLocation(dto.getLocation());
        record.setStatus(status);
        record.setRemark(dto.getRemark());
        
        attendanceRecordMapper.insert(record);
        
        log.info("打卡成功，recordId: {}, status: {}", record.getId(), status);
    }
    
    /**
     * 验证打卡方式
     * 
     * @param dto 打卡请求DTO
     */
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
    
    /**
     * 验证GPS位置
     * 
     * @param latitude 纬度
     * @param longitude 经度
     */
    private void validateGpsLocation(Double latitude, Double longitude) {
        if (latitude == null || longitude == null) {
            throw new HrBusinessException("GPS定位信息不完整");
        }
        
        // 计算距离（使用Haversine公式）
        double distance = calculateDistance(latitude, longitude, COMPANY_LATITUDE, COMPANY_LONGITUDE);
        
        log.info("GPS打卡距离: {} 米", distance);
        
        if (distance > GPS_ALLOWED_DISTANCE) {
            throw new HrBusinessException(String.format("GPS定位超出允许范围，当前距离: %.0f米，允许范围: %.0f米", 
                    distance, GPS_ALLOWED_DISTANCE));
        }
    }
    
    /**
     * 计算两个GPS坐标之间的距离（米）
     * 使用Haversine公式
     * 
     * @param lat1 纬度1
     * @param lon1 经度1
     * @param lat2 纬度2
     * @param lon2 经度2
     * @return 距离（米）
     */
    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        final int EARTH_RADIUS = 6371000; // 地球半径（米）
        
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                        Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return EARTH_RADIUS * c;
    }
    
    /**
     * 验证WiFi SSID
     * 
     * @param wifiSsid WiFi SSID
     */
    private void validateWifiSsid(String wifiSsid) {
        if (wifiSsid == null || wifiSsid.trim().isEmpty()) {
            throw new HrBusinessException("WiFi SSID不能为空");
        }
        
        if (!WIFI_WHITELIST.contains(wifiSsid)) {
            throw new HrBusinessException("WiFi SSID不在白名单中: " + wifiSsid);
        }
        
        log.info("WiFi验证通过，SSID: {}", wifiSsid);
    }
    
    /**
     * 验证人脸识别token
     * 
     * @param faceToken 人脸识别token
     */
    private void validateFaceToken(String faceToken) {
        if (faceToken == null || faceToken.trim().isEmpty()) {
            throw new HrBusinessException("人脸识别token不能为空");
        }
        
        // TODO: 调用人脸识别服务验证token
        // 这里简化处理，实际应该调用第三方人脸识别API
        log.info("人脸识别验证通过，token: {}", faceToken);
    }
    
    /**
     * 判断打卡状态
     * 
     * @param checkType 打卡类型
     * @param checkTime 打卡时间
     * @param shift 班次信息
     * @return 打卡状态
     */
    private String determineAttendanceStatus(String checkType, LocalTime checkTime, Shift shift) {
        if ("CHECK_IN".equals(checkType)) {
            // 上班打卡：判断是否迟到
            LocalTime startTime = shift.getStartTime();
            LocalTime lateThreshold = startTime.plusMinutes(shift.getLateThreshold());
            
            if (checkTime.isAfter(lateThreshold)) {
                log.info("迟到，打卡时间: {}, 班次开始时间: {}, 迟到阈值: {} 分钟", 
                        checkTime, startTime, shift.getLateThreshold());
                return "LATE";
            }
        } else if ("CHECK_OUT".equals(checkType)) {
            // 下班打卡：判断是否早退
            LocalTime endTime = shift.getEndTime();
            LocalTime earlyThreshold = endTime.minusMinutes(shift.getEarlyThreshold());
            
            if (checkTime.isBefore(earlyThreshold)) {
                log.info("早退，打卡时间: {}, 班次结束时间: {}, 早退阈值: {} 分钟", 
                        checkTime, endTime, shift.getEarlyThreshold());
                return "EARLY";
            }
        }
        
        return "NORMAL";
    }
    
    /**
     * 获取员工的排班信息
     * 
     * @param employeeId 员工ID
     * @param date 日期
     * @return 排班信息
     */
    private SchedulePlan getSchedulePlan(Long employeeId, LocalDate date) {
        LambdaQueryWrapper<SchedulePlan> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SchedulePlan::getTargetType, "EMPLOYEE")
                .eq(SchedulePlan::getTargetId, employeeId)
                .eq(SchedulePlan::getScheduleDate, date)
                .eq(SchedulePlan::getStatus, "PUBLISHED");
        
        return schedulePlanMapper.selectOne(wrapper);
    }

    /**
     * 考勤相关操作只允许已入职员工执行。
     */
    private void validateAttendanceEligibleEmployee(Employee employee, String operation) {
        if ("PROBATION".equals(employee.getEmployeeStatus()) || "REGULAR".equals(employee.getEmployeeStatus())) {
            return;
        }
        throw HrBusinessException.invalidEmployeeStatus(employee.getId(), employee.getEmployeeStatus(), operation);
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createSupplementApplication(AttendanceSupplementDTO dto) {
        log.info("创建补卡申请，employeeId: {}, attendanceDate: {}, checkType: {}", 
                dto.getEmployeeId(), dto.getAttendanceDate(), dto.getCheckType());
        
        // 1. 验证员工是否存在
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null) {
            throw new HrBusinessException("员工不存在");
        }
        validateAttendanceEligibleEmployee(employee, "补卡申请");
        
        // 2. 验证是否已经有打卡记录
        AttendanceRecord existingRecord = attendanceRecordMapper.selectByEmployeeAndDate(
                dto.getEmployeeId(), dto.getAttendanceDate(), dto.getCheckType());
        if (existingRecord != null) {
            throw new HrBusinessException("该日期已有打卡记录，无需补卡");
        }
        
        // 3. 获取排班信息
        SchedulePlan schedulePlan = getSchedulePlan(dto.getEmployeeId(), dto.getAttendanceDate());
        if (schedulePlan == null) {
            throw new HrBusinessException("该日期没有排班，无法补卡");
        }
        
        // 4. 创建补卡记录（状态为MISSING，等待审批）
        AttendanceRecord record = new AttendanceRecord();
        record.setTenantId(employee.getTenantId());
        record.setEmployeeId(dto.getEmployeeId());
        record.setAttendanceDate(dto.getAttendanceDate());
        record.setShiftId(schedulePlan.getShiftId());
        record.setCheckType(dto.getCheckType());
        record.setCheckTime(dto.getCheckTime());
        record.setCheckMethod("SUPPLEMENT");
        record.setStatus("MISSING");
        record.setRemark(dto.getReason());
        
        attendanceRecordMapper.insert(record);
        
        log.info("补卡申请创建成功，recordId: {}", record.getId());
        
        return record.getId();
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitSupplementApplication(Long id) {
        log.info("提交补卡申请，recordId: {}", id);
        
        // 1. 查询补卡记录
        AttendanceRecord record = attendanceRecordMapper.selectById(id);
        if (record == null) {
            throw new HrBusinessException("补卡记录不存在");
        }
        
        if (!"MISSING".equals(record.getStatus())) {
            throw new HrBusinessException("该补卡申请状态不正确，无法提交");
        }
        
        // 2. 调用工作流服务启动审批流程
        ProcessStartDTO processStartDTO = new ProcessStartDTO();
        processStartDTO.setTenantId(record.getTenantId());
        processStartDTO.setProcessDefinitionKey(workflowProcessKeyProperties.getAttendanceSupplement());
        processStartDTO.setBusinessType("ATTENDANCE_SUPPLEMENT");
        processStartDTO.setBusinessId(id);
        processStartDTO.setBusinessNo("ATTENDANCE-" + id);
        processStartDTO.setProcessTitle("补卡申请-" + id);
        processStartDTO.setStartUserId(SecurityUtils.getUserId());
        processStartDTO.setProcessTitle("补卡申请");
        
        Map<String, Object> variables = new HashMap<>();
        variables.put("employeeId", record.getEmployeeId());
        variables.put("attendanceDate", record.getAttendanceDate().toString());
        variables.put("checkType", record.getCheckType());
        variables.put("reason", record.getRemark());
        processStartDTO.setVariables(variables);
        
        try {
            R<String> result = workflowServiceClient.startProcess(processStartDTO);
            if (!result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：" + result.getMsg());
            }

            String processInstanceId = result.getData();
            
            // 3. 更新补卡记录的流程实例ID
            record.setStatus("APPROVING");
            record.setProcessInstanceId(processInstanceId);
            attendanceRecordMapper.updateById(record);
            
            log.info("补卡审批流程启动成功，processInstanceId: {}", processInstanceId);
        } catch (Exception e) {
            log.error("启动补卡审批流程失败", e);
            throw new HrBusinessException("启动审批流程失败: " + e.getMessage());
        }
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveSupplementApplication(Long id) {
        log.info("审批通过补卡申请，recordId: {}", id);
        
        // 1. 查询补卡记录
        AttendanceRecord record = attendanceRecordMapper.selectById(id);
        if (record == null) {
            throw new HrBusinessException("补卡记录不存在");
        }
        
        // 2. 更新补卡记录状态为SUPPLEMENT
        if (!"APPROVING".equals(record.getStatus())) {
            throw new HrBusinessException("只有审批中的补卡申请才能通过");
        }

        record.setStatus("SUPPLEMENT");
        attendanceRecordMapper.updateById(record);
        
        log.info("补卡申请审批通过，recordId: {}", id);
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectSupplementApplication(Long id) {
        log.info("审批拒绝补卡申请，recordId: {}", id);

        AttendanceRecord record = attendanceRecordMapper.selectById(id);
        if (record == null) {
            throw new HrBusinessException("补卡记录不存在");
        }
        if (!"APPROVING".equals(record.getStatus())) {
            throw new HrBusinessException("只有审批中的补卡申请才能拒绝");
        }

        record.setStatus("REJECTED");
        attendanceRecordMapper.updateById(record);

        log.info("补卡申请审批拒绝完成，recordId: {}", id);
    }

    @Override
    public List<AttendanceRecordVO> listAttendanceRecords(AttendanceRecordQueryDTO query) {
        log.info("查询打卡记录列表，query: {}", query);
        
        // 构建查询条件
        LambdaQueryWrapper<AttendanceRecord> wrapper = new LambdaQueryWrapper<>();
        
        if (query.getEmployeeId() != null) {
            wrapper.eq(AttendanceRecord::getEmployeeId, query.getEmployeeId());
        }
        
        if (query.getStartDate() != null && query.getEndDate() != null) {
            wrapper.between(AttendanceRecord::getAttendanceDate, query.getStartDate(), query.getEndDate());
        }
        
        if (query.getCheckType() != null && !query.getCheckType().isEmpty()) {
            wrapper.eq(AttendanceRecord::getCheckType, query.getCheckType());
        }
        
        if (query.getStatus() != null && !query.getStatus().isEmpty()) {
            wrapper.eq(AttendanceRecord::getStatus, query.getStatus());
        }
        
        wrapper.orderByDesc(AttendanceRecord::getAttendanceDate, AttendanceRecord::getCheckTime);
        
        // 查询打卡记录
        List<AttendanceRecord> records = attendanceRecordMapper.selectList(wrapper);
        
        // 转换为VO
        List<AttendanceRecordVO> voList = new ArrayList<>();
        for (AttendanceRecord record : records) {
            AttendanceRecordVO vo = new AttendanceRecordVO();
            BeanUtils.copyProperties(record, vo);
            
            // 查询员工信息
            Employee employee = employeeMapper.selectById(record.getEmployeeId());
            if (employee != null) {
                vo.setEmployeeName(employee.getName());
                vo.setEmployeeNo(employee.getEmployeeNo());
            }
            
            // 查询班次信息
            if (record.getShiftId() != null) {
                Shift shift = shiftMapper.selectById(record.getShiftId());
                if (shift != null) {
                    vo.setShiftName(shift.getShiftName());
                }
            }
            
            voList.add(vo);
        }
        
        return voList;
    }
    
    @Override
    public AttendanceDailyVO getDailyAttendance(Long employeeId, LocalDate date) {
        log.info("获取每日考勤，employeeId: {}, date: {}", employeeId, date);
        
        // 1. 查询员工信息
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null) {
            throw new HrBusinessException("员工不存在");
        }
        
        // 2. 查询当天的所有打卡记录
        List<AttendanceRecord> records = attendanceRecordMapper.selectByEmployeeAndDateAll(employeeId, date);
        
        // 3. 查询排班信息
        SchedulePlan schedulePlan = getSchedulePlan(employeeId, date);
        
        // 4. 构建VO
        AttendanceDailyVO vo = new AttendanceDailyVO();
        vo.setEmployeeId(employeeId);
        vo.setEmployeeName(employee.getName());
        vo.setAttendanceDate(date);
        
        if (schedulePlan != null) {
            vo.setShiftId(schedulePlan.getShiftId());
            
            Shift shift = shiftMapper.selectById(schedulePlan.getShiftId());
            if (shift != null) {
                vo.setShiftName(shift.getShiftName());
            }
        }
        
        // 5. 分离上班和下班打卡记录
        AttendanceRecordVO checkInVO = null;
        AttendanceRecordVO checkOutVO = null;
        
        for (AttendanceRecord record : records) {
            AttendanceRecordVO recordVO = new AttendanceRecordVO();
            BeanUtils.copyProperties(record, recordVO);
            recordVO.setEmployeeName(employee.getName());
            recordVO.setEmployeeNo(employee.getEmployeeNo());
            
            if ("CHECK_IN".equals(record.getCheckType())) {
                checkInVO = recordVO;
            } else if ("CHECK_OUT".equals(record.getCheckType())) {
                checkOutVO = recordVO;
            }
        }
        
        vo.setCheckInRecord(checkInVO);
        vo.setCheckOutRecord(checkOutVO);
        
        // 6. 计算考勤状态和工作时长
        calculateAttendanceStatus(vo, checkInVO, checkOutVO);
        
        return vo;
    }
    
    /**
     * 计算考勤状态和工作时长
     * 
     * @param vo 每日考勤VO
     * @param checkInVO 上班打卡记录
     * @param checkOutVO 下班打卡记录
     */
    private void calculateAttendanceStatus(AttendanceDailyVO vo, 
                                          AttendanceRecordVO checkInVO, 
                                          AttendanceRecordVO checkOutVO) {
        // 判断考勤状态
        if (checkInVO == null && checkOutVO == null) {
            vo.setAttendanceStatus("ABSENT"); // 旷工
        } else if (checkInVO == null || checkOutVO == null) {
            vo.setAttendanceStatus("MISSING"); // 缺卡
        } else if ("LATE".equals(checkInVO.getStatus()) && "EARLY".equals(checkOutVO.getStatus())) {
            vo.setAttendanceStatus("LATE"); // 迟到早退，标记为迟到
        } else if ("LATE".equals(checkInVO.getStatus())) {
            vo.setAttendanceStatus("LATE"); // 迟到
        } else if ("EARLY".equals(checkOutVO.getStatus())) {
            vo.setAttendanceStatus("EARLY"); // 早退
        } else {
            vo.setAttendanceStatus("NORMAL"); // 正常
        }
        
        // 计算工作时长
        if (checkInVO != null && checkOutVO != null) {
            Duration duration = Duration.between(checkInVO.getCheckTime(), checkOutVO.getCheckTime());
            vo.setWorkMinutes((int) duration.toMinutes());
        }
    }
}
