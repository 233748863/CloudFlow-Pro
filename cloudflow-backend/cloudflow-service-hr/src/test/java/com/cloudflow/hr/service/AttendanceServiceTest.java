package com.cloudflow.hr.service;

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
import com.cloudflow.hr.mapper.AttendanceRecordMapper;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.SchedulePlanMapper;
import com.cloudflow.hr.mapper.ShiftMapper;
import com.cloudflow.hr.service.impl.AttendanceServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 考勤打卡服务测试类
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@ExtendWith(MockitoExtension.class)
class AttendanceServiceTest {
    
    @Mock
    private AttendanceRecordMapper attendanceRecordMapper;
    
    @Mock
    private EmployeeMapper employeeMapper;
    
    @Mock
    private SchedulePlanMapper schedulePlanMapper;
    
    @Mock
    private ShiftMapper shiftMapper;
    
    @InjectMocks
    private AttendanceServiceImpl attendanceService;
    
    private Employee testEmployee;
    private Shift testShift;
    private SchedulePlan testSchedulePlan;
    
    @BeforeEach
    void setUp() {
        // 准备测试数据
        testEmployee = new Employee();
        testEmployee.setId(1L);
        testEmployee.setTenantId(1L);
        testEmployee.setEmployeeNo("EMP001");
        testEmployee.setName("测试员工");
        testEmployee.setEmployeeStatus("PROBATION");
        
        testShift = new Shift();
        testShift.setId(1L);
        testShift.setShiftCode("STANDARD");
        testShift.setShiftName("标准班");
        testShift.setStartTime(LocalTime.of(9, 0));
        testShift.setEndTime(LocalTime.of(18, 0));
        testShift.setLateThreshold(15);
        testShift.setEarlyThreshold(15);
        
        testSchedulePlan = new SchedulePlan();
        testSchedulePlan.setId(1L);
        testSchedulePlan.setTenantId(1L);
        testSchedulePlan.setTargetType("EMPLOYEE");
        testSchedulePlan.setTargetId(1L);
        testSchedulePlan.setShiftId(1L);
        testSchedulePlan.setScheduleDate(LocalDate.now());
        testSchedulePlan.setStatus("PUBLISHED");
    }
    
    /**
     * 测试GPS打卡 - 位置在允许范围内
     */
    @Test
    void testCheckIn_GpsWithinRange_Success() {
        // 准备测试数据
        AttendanceCheckDTO dto = new AttendanceCheckDTO();
        dto.setEmployeeId(1L);
        dto.setCheckMethod("GPS");
        dto.setLatitude(39.9042); // 公司位置
        dto.setLongitude(116.4074);
        dto.setLocation("39.9042,116.4074");
        
        // Mock依赖
        when(employeeMapper.selectById(1L)).thenReturn(testEmployee);
        when(attendanceRecordMapper.selectByEmployeeAndDate(any(), any(), any())).thenReturn(null);
        when(schedulePlanMapper.selectOne(any())).thenReturn(testSchedulePlan);
        when(shiftMapper.selectById(1L)).thenReturn(testShift);
        when(attendanceRecordMapper.insert(any(AttendanceRecord.class))).thenReturn(1);
        
        // 执行测试
        assertDoesNotThrow(() -> attendanceService.checkIn(dto));
        
        // 验证
        verify(attendanceRecordMapper, times(1)).insert(any(AttendanceRecord.class));
    }
    
    /**
     * 测试GPS打卡 - 位置超出允许范围
     */
    @Test
    void testCheckIn_GpsOutOfRange_ThrowsException() {
        // 准备测试数据 - 距离公司很远的位置
        AttendanceCheckDTO dto = new AttendanceCheckDTO();
        dto.setEmployeeId(1L);
        dto.setCheckMethod("GPS");
        dto.setLatitude(31.2304); // 上海位置
        dto.setLongitude(121.4737);
        dto.setLocation("31.2304,121.4737");
        
        // Mock依赖
        when(employeeMapper.selectById(1L)).thenReturn(testEmployee);
        when(attendanceRecordMapper.selectByEmployeeAndDate(any(), any(), any())).thenReturn(null);
        when(schedulePlanMapper.selectOne(any())).thenReturn(testSchedulePlan);
        when(shiftMapper.selectById(1L)).thenReturn(testShift);
        
        // 执行测试并验证异常
        HrBusinessException exception = assertThrows(HrBusinessException.class, 
                () -> attendanceService.checkIn(dto));
        
        assertTrue(exception.getMessage().contains("GPS定位超出允许范围"));
        
        // 验证没有插入打卡记录
        verify(attendanceRecordMapper, never()).insert(any(AttendanceRecord.class));
    }
    
    /**
     * 测试WiFi打卡 - SSID在白名单中
     */
    @Test
    void testCheckIn_WifiInWhitelist_Success() {
        // 准备测试数据
        AttendanceCheckDTO dto = new AttendanceCheckDTO();
        dto.setEmployeeId(1L);
        dto.setCheckMethod("WIFI");
        dto.setWifiSsid("CompanyWiFi");
        dto.setLocation("CompanyWiFi");
        
        // Mock依赖
        when(employeeMapper.selectById(1L)).thenReturn(testEmployee);
        when(attendanceRecordMapper.selectByEmployeeAndDate(any(), any(), any())).thenReturn(null);
        when(schedulePlanMapper.selectOne(any())).thenReturn(testSchedulePlan);
        when(shiftMapper.selectById(1L)).thenReturn(testShift);
        when(attendanceRecordMapper.insert(any(AttendanceRecord.class))).thenReturn(1);
        
        // 执行测试
        assertDoesNotThrow(() -> attendanceService.checkIn(dto));
        
        // 验证
        verify(attendanceRecordMapper, times(1)).insert(any(AttendanceRecord.class));
    }
    
    /**
     * 测试WiFi打卡 - SSID不在白名单中
     */
    @Test
    void testCheckIn_WifiNotInWhitelist_ThrowsException() {
        // 准备测试数据
        AttendanceCheckDTO dto = new AttendanceCheckDTO();
        dto.setEmployeeId(1L);
        dto.setCheckMethod("WIFI");
        dto.setWifiSsid("UnknownWiFi");
        dto.setLocation("UnknownWiFi");
        
        // Mock依赖
        when(employeeMapper.selectById(1L)).thenReturn(testEmployee);
        when(attendanceRecordMapper.selectByEmployeeAndDate(any(), any(), any())).thenReturn(null);
        when(schedulePlanMapper.selectOne(any())).thenReturn(testSchedulePlan);
        when(shiftMapper.selectById(1L)).thenReturn(testShift);
        
        // 执行测试并验证异常
        HrBusinessException exception = assertThrows(HrBusinessException.class, 
                () -> attendanceService.checkIn(dto));
        
        assertTrue(exception.getMessage().contains("WiFi SSID不在白名单中"));
        
        // 验证没有插入打卡记录
        verify(attendanceRecordMapper, never()).insert(any(AttendanceRecord.class));
    }
    
    /**
     * 测试重复打卡
     */
    @Test
    void testCheckIn_DuplicateCheckIn_ThrowsException() {
        // 准备测试数据
        AttendanceCheckDTO dto = new AttendanceCheckDTO();
        dto.setEmployeeId(1L);
        dto.setCheckMethod("GPS");
        dto.setLatitude(39.9042);
        dto.setLongitude(116.4074);
        
        // Mock已存在的打卡记录
        AttendanceRecord existingRecord = new AttendanceRecord();
        existingRecord.setId(1L);
        existingRecord.setEmployeeId(1L);
        existingRecord.setCheckType("CHECK_IN");
        
        // Mock依赖
        when(employeeMapper.selectById(1L)).thenReturn(testEmployee);
        when(attendanceRecordMapper.selectByEmployeeAndDate(any(), any(), any())).thenReturn(existingRecord);
        
        // 执行测试并验证异常
        HrBusinessException exception = assertThrows(HrBusinessException.class, 
                () -> attendanceService.checkIn(dto));
        
        assertTrue(exception.getMessage().contains("已经打过"));
        
        // 验证没有插入新的打卡记录
        verify(attendanceRecordMapper, never()).insert(any(AttendanceRecord.class));
    }
    
    /**
     * 测试没有排班时打卡
     */
    @Test
    void testCheckIn_NoSchedulePlan_ThrowsException() {
        // 准备测试数据
        AttendanceCheckDTO dto = new AttendanceCheckDTO();
        dto.setEmployeeId(1L);
        dto.setCheckMethod("GPS");
        dto.setLatitude(39.9042);
        dto.setLongitude(116.4074);
        
        // Mock依赖
        when(employeeMapper.selectById(1L)).thenReturn(testEmployee);
        when(attendanceRecordMapper.selectByEmployeeAndDate(any(), any(), any())).thenReturn(null);
        when(schedulePlanMapper.selectOne(any())).thenReturn(null); // 没有排班
        
        // 执行测试并验证异常
        HrBusinessException exception = assertThrows(HrBusinessException.class, 
                () -> attendanceService.checkIn(dto));
        
        assertTrue(exception.getMessage().contains("没有排班"));
        
        // 验证没有插入打卡记录
        verify(attendanceRecordMapper, never()).insert(any(AttendanceRecord.class));
    }
    
    /**
     * 测试查询打卡记录列表
     */
    @Test
    void testListAttendanceRecords_Success() {
        // 准备测试数据
        AttendanceRecordQueryDTO query = new AttendanceRecordQueryDTO();
        query.setEmployeeId(1L);
        query.setStartDate(LocalDate.now().minusDays(7));
        query.setEndDate(LocalDate.now());
        
        List<AttendanceRecord> records = new ArrayList<>();
        AttendanceRecord record = new AttendanceRecord();
        record.setId(1L);
        record.setEmployeeId(1L);
        record.setAttendanceDate(LocalDate.now());
        record.setCheckType("CHECK_IN");
        record.setCheckTime(LocalDateTime.now());
        record.setStatus("NORMAL");
        records.add(record);
        
        // Mock依赖
        when(attendanceRecordMapper.selectList(any())).thenReturn(records);
        when(employeeMapper.selectById(1L)).thenReturn(testEmployee);
        
        // 执行测试
        List<AttendanceRecordVO> result = attendanceService.listAttendanceRecords(query);
        
        // 验证
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals("测试员工", result.get(0).getEmployeeName());
    }
    
    /**
     * 测试获取每日考勤
     */
    @Test
    void testGetDailyAttendance_Success() {
        // 准备测试数据
        List<AttendanceRecord> records = new ArrayList<>();
        
        AttendanceRecord checkInRecord = new AttendanceRecord();
        checkInRecord.setId(1L);
        checkInRecord.setEmployeeId(1L);
        checkInRecord.setAttendanceDate(LocalDate.now());
        checkInRecord.setCheckType("CHECK_IN");
        checkInRecord.setCheckTime(LocalDateTime.now().withHour(9).withMinute(0));
        checkInRecord.setStatus("NORMAL");
        records.add(checkInRecord);
        
        AttendanceRecord checkOutRecord = new AttendanceRecord();
        checkOutRecord.setId(2L);
        checkOutRecord.setEmployeeId(1L);
        checkOutRecord.setAttendanceDate(LocalDate.now());
        checkOutRecord.setCheckType("CHECK_OUT");
        checkOutRecord.setCheckTime(LocalDateTime.now().withHour(18).withMinute(0));
        checkOutRecord.setStatus("NORMAL");
        records.add(checkOutRecord);
        
        // Mock依赖
        when(employeeMapper.selectById(1L)).thenReturn(testEmployee);
        when(attendanceRecordMapper.selectByEmployeeAndDateAll(any(), any())).thenReturn(records);
        when(schedulePlanMapper.selectOne(any())).thenReturn(testSchedulePlan);
        when(shiftMapper.selectById(1L)).thenReturn(testShift);
        
        // 执行测试
        AttendanceDailyVO result = attendanceService.getDailyAttendance(1L, LocalDate.now());
        
        // 验证
        assertNotNull(result);
        assertEquals(1L, result.getEmployeeId());
        assertEquals("测试员工", result.getEmployeeName());
        assertEquals("NORMAL", result.getAttendanceStatus());
        assertNotNull(result.getCheckInRecord());
        assertNotNull(result.getCheckOutRecord());
    }
}
