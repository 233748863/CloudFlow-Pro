package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.domain.dto.AttendanceAnomalyQueryDTO;
import com.cloudflow.hr.domain.vo.AttendanceAnomalyVO;
import com.cloudflow.hr.domain.entity.AttendanceMonthly;
import com.cloudflow.hr.domain.entity.AttendanceRecord;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.LeaveApplication;
import com.cloudflow.hr.domain.entity.SchedulePlan;
import com.cloudflow.hr.domain.entity.Shift;
import com.cloudflow.hr.mapper.AttendanceMonthlyMapper;
import com.cloudflow.hr.mapper.AttendanceRecordMapper;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.LeaveApplicationMapper;
import com.cloudflow.hr.mapper.OvertimeApplicationMapper;
import com.cloudflow.hr.mapper.SchedulePlanMapper;
import com.cloudflow.hr.mapper.ShiftMapper;
import com.cloudflow.hr.service.impl.AttendanceStatisticsServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 考勤统计服务测试
 */
@ExtendWith(MockitoExtension.class)
class AttendanceStatisticsServiceTest {

    @Mock
    private AttendanceMonthlyMapper attendanceMonthlyMapper;

    @Mock
    private AttendanceRecordMapper attendanceRecordMapper;

    @Mock
    private EmployeeMapper employeeMapper;

    @Mock
    private LeaveApplicationMapper leaveApplicationMapper;

    @Mock
    private OvertimeApplicationMapper overtimeApplicationMapper;

    @Mock
    private SchedulePlanMapper schedulePlanMapper;

    @Mock
    private ShiftMapper shiftMapper;

    @Mock
    private AuthServiceClient authServiceClient;

    @InjectMocks
    private AttendanceStatisticsServiceImpl attendanceStatisticsService;

    private Employee testEmployee;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(1001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(1L);

        testEmployee = new Employee();
        testEmployee.setId(1L);
        testEmployee.setTenantId(1L);
        testEmployee.setDeptId(10L);
        testEmployee.setName("测试员工");
        testEmployee.setEmployeeNo("EMP001");
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void testGenerateEmployeeMonthlyAttendance_UsesPublishedSchedulesForAbsenceCalculation() {
        when(employeeMapper.selectById(1L)).thenReturn(testEmployee);
        when(schedulePlanMapper.selectByDateRange(1L, "DEPT", 10L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 30)))
                .thenReturn(List.of(
                        buildSchedulePlan(101L, "DEPT", 10L, LocalDate.of(2026, 4, 1)),
                        buildSchedulePlan(102L, "DEPT", 10L, LocalDate.of(2026, 4, 2))
                ));
        when(schedulePlanMapper.selectByDateRange(1L, "EMPLOYEE", 1L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 30)))
                .thenReturn(List.of());
        when(attendanceRecordMapper.selectList(any())).thenReturn(List.of());
        when(leaveApplicationMapper.selectList(any())).thenReturn(List.of());
        when(overtimeApplicationMapper.getOvertimeStatistics(anyLong(), anyLong(), anyInt(), anyInt()))
                .thenReturn(Map.of("totalHours", BigDecimal.ZERO));
        when(attendanceMonthlyMapper.selectOne(any())).thenReturn(null);

        attendanceStatisticsService.generateEmployeeMonthlyAttendance(1L, 2026, 4);

        ArgumentCaptor<AttendanceMonthly> captor = ArgumentCaptor.forClass(AttendanceMonthly.class);
        verify(attendanceMonthlyMapper).insert(captor.capture());
        AttendanceMonthly saved = captor.getValue();
        assertEquals(2, saved.getWorkDays());
        assertEquals(0, saved.getActualDays());
        assertEquals(2, saved.getAbsentDays());
    }

    @Test
    void testGenerateEmployeeMonthlyAttendance_IgnoresPendingSupplementRecords() {
        AttendanceRecord pendingSupplement = new AttendanceRecord();
        pendingSupplement.setEmployeeId(1L);
        pendingSupplement.setAttendanceDate(LocalDate.of(2026, 4, 1));
        pendingSupplement.setCheckType("CHECK_IN");
        pendingSupplement.setStatus("APPROVING");

        when(employeeMapper.selectById(1L)).thenReturn(testEmployee);
        when(schedulePlanMapper.selectByDateRange(1L, "DEPT", 10L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 30)))
                .thenReturn(List.of(buildSchedulePlan(101L, "DEPT", 10L, LocalDate.of(2026, 4, 1))));
        when(schedulePlanMapper.selectByDateRange(1L, "EMPLOYEE", 1L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 30)))
                .thenReturn(List.of());
        when(attendanceRecordMapper.selectList(any())).thenReturn(List.of(pendingSupplement));
        when(leaveApplicationMapper.selectList(any())).thenReturn(List.of());
        when(overtimeApplicationMapper.getOvertimeStatistics(anyLong(), anyLong(), anyInt(), anyInt()))
                .thenReturn(Map.of("totalHours", BigDecimal.ZERO));
        when(attendanceMonthlyMapper.selectOne(any())).thenReturn(null);

        attendanceStatisticsService.generateEmployeeMonthlyAttendance(1L, 2026, 4);

        ArgumentCaptor<AttendanceMonthly> captor = ArgumentCaptor.forClass(AttendanceMonthly.class);
        verify(attendanceMonthlyMapper).insert(captor.capture());
        AttendanceMonthly saved = captor.getValue();
        assertEquals(1, saved.getWorkDays());
        assertEquals(0, saved.getActualDays());
        assertEquals(1, saved.getAbsentDays());
        assertEquals(0, saved.getMissingTimes());
    }

    @Test
    void testGenerateEmployeeMonthlyAttendance_ClipsCrossMonthLeaveDaysToCurrentMonth() {
        LeaveApplication crossMonthLeave = buildLeaveApplication(
                LocalDateTime.of(2026, 3, 31, 9, 0),
                LocalDateTime.of(2026, 4, 2, 18, 0),
                new BigDecimal("3.00"),
                "DAY"
        );

        when(employeeMapper.selectById(1L)).thenReturn(testEmployee);
        when(schedulePlanMapper.selectByDateRange(1L, "DEPT", 10L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 30)))
                .thenReturn(List.of());
        when(schedulePlanMapper.selectByDateRange(1L, "EMPLOYEE", 1L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 30)))
                .thenReturn(List.of());
        when(attendanceRecordMapper.selectList(any())).thenReturn(List.of());
        when(leaveApplicationMapper.selectList(any())).thenReturn(List.of(crossMonthLeave));
        when(overtimeApplicationMapper.getOvertimeStatistics(anyLong(), anyLong(), anyInt(), anyInt()))
                .thenReturn(Map.of("totalHours", BigDecimal.ZERO));
        when(attendanceMonthlyMapper.selectOne(any())).thenReturn(null);

        attendanceStatisticsService.generateEmployeeMonthlyAttendance(1L, 2026, 4);

        ArgumentCaptor<AttendanceMonthly> captor = ArgumentCaptor.forClass(AttendanceMonthly.class);
        verify(attendanceMonthlyMapper).insert(captor.capture());
        AttendanceMonthly saved = captor.getValue();
        assertEquals(new BigDecimal("2.00"), saved.getLeaveDays());
    }

    @Test
    void testGenerateEmployeeMonthlyAttendance_ConvertsHourlyLeaveToLeaveDays() {
        LeaveApplication hourlyLeave = buildLeaveApplication(
                LocalDateTime.of(2026, 4, 1, 13, 0),
                LocalDateTime.of(2026, 4, 1, 17, 0),
                new BigDecimal("4.00"),
                "HOUR"
        );

        when(employeeMapper.selectById(1L)).thenReturn(testEmployee);
        when(schedulePlanMapper.selectByDateRange(1L, "DEPT", 10L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 30)))
                .thenReturn(List.of(buildSchedulePlan(101L, "DEPT", 10L, LocalDate.of(2026, 4, 1))));
        when(schedulePlanMapper.selectByDateRange(1L, "EMPLOYEE", 1L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 30)))
                .thenReturn(List.of());
        when(shiftMapper.selectById(101L)).thenReturn(buildShift(101L, 480));
        when(attendanceRecordMapper.selectList(any())).thenReturn(List.of());
        when(leaveApplicationMapper.selectList(any())).thenReturn(List.of(hourlyLeave));
        when(overtimeApplicationMapper.getOvertimeStatistics(anyLong(), anyLong(), anyInt(), anyInt()))
                .thenReturn(Map.of("totalHours", BigDecimal.ZERO));
        when(attendanceMonthlyMapper.selectOne(any())).thenReturn(null);

        attendanceStatisticsService.generateEmployeeMonthlyAttendance(1L, 2026, 4);

        ArgumentCaptor<AttendanceMonthly> captor = ArgumentCaptor.forClass(AttendanceMonthly.class);
        verify(attendanceMonthlyMapper).insert(captor.capture());
        AttendanceMonthly saved = captor.getValue();
        assertEquals(new BigDecimal("0.50"), saved.getLeaveDays());
    }

    @Test
    void testListAttendanceAnomalies_ReturnsComputedAbsentRecords() {
        AttendanceAnomalyQueryDTO query = new AttendanceAnomalyQueryDTO();
        query.setEmployeeId(1L);
        query.setAnomalyType("ABSENT");
        query.setStartDate(LocalDate.of(2026, 4, 1));
        query.setEndDate(LocalDate.of(2026, 4, 2));

        when(employeeMapper.selectList(any())).thenReturn(List.of(testEmployee));
        when(schedulePlanMapper.selectByDateRange(1L, "DEPT", 10L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 2)))
                .thenReturn(List.of(buildSchedulePlan(101L, "DEPT", 10L, LocalDate.of(2026, 4, 1))));
        when(schedulePlanMapper.selectByDateRange(1L, "EMPLOYEE", 1L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 2)))
                .thenReturn(List.of());
        when(attendanceRecordMapper.selectList(any())).thenReturn(List.of());
        when(leaveApplicationMapper.selectList(any())).thenReturn(List.of());

        IPage<AttendanceAnomalyVO> results = attendanceStatisticsService.listAttendanceAnomalies(query);

        assertEquals(1L, results.getTotal());
        assertEquals(1, results.getRecords().size());
        assertEquals("ABSENT", results.getRecords().get(0).getAnomalyType());
        assertEquals(LocalDate.of(2026, 4, 1), results.getRecords().get(0).getAttendanceDate());
    }

    @Test
    void testListAttendanceAnomalies_ReturnsComputedMissingRecords() {
        AttendanceAnomalyQueryDTO query = new AttendanceAnomalyQueryDTO();
        query.setEmployeeId(1L);
        query.setAnomalyType("MISSING");
        query.setStartDate(LocalDate.of(2026, 4, 1));
        query.setEndDate(LocalDate.of(2026, 4, 1));

        AttendanceRecord checkInRecord = new AttendanceRecord();
        checkInRecord.setEmployeeId(1L);
        checkInRecord.setAttendanceDate(LocalDate.of(2026, 4, 1));
        checkInRecord.setCheckType("CHECK_IN");
        checkInRecord.setStatus("NORMAL");
        checkInRecord.setCheckTime(LocalDateTime.of(2026, 4, 1, 9, 0));

        when(employeeMapper.selectList(any())).thenReturn(List.of(testEmployee));
        when(attendanceRecordMapper.selectList(any())).thenReturn(List.of(checkInRecord));

        IPage<AttendanceAnomalyVO> results = attendanceStatisticsService.listAttendanceAnomalies(query);

        assertEquals(1L, results.getTotal());
        assertEquals(1, results.getRecords().size());
        assertEquals("MISSING", results.getRecords().get(0).getAnomalyType());
        assertEquals(LocalDate.of(2026, 4, 1), results.getRecords().get(0).getAttendanceDate());
    }

    @Test
    void testListAttendanceAnomalies_DoesNotTreatSupplementDraftAsMissingAnomaly() {
        AttendanceAnomalyQueryDTO query = new AttendanceAnomalyQueryDTO();
        query.setEmployeeId(1L);
        query.setAnomalyType("MISSING");
        query.setStartDate(LocalDate.of(2026, 4, 1));
        query.setEndDate(LocalDate.of(2026, 4, 1));

        AttendanceRecord supplementDraft = new AttendanceRecord();
        supplementDraft.setEmployeeId(1L);
        supplementDraft.setAttendanceDate(LocalDate.of(2026, 4, 1));
        supplementDraft.setCheckType("CHECK_IN");
        supplementDraft.setStatus("MISSING");
        supplementDraft.setCheckMethod("SUPPLEMENT");

        when(employeeMapper.selectList(any())).thenReturn(List.of(testEmployee));
        when(attendanceRecordMapper.selectList(any())).thenReturn(List.of(supplementDraft));

        IPage<AttendanceAnomalyVO> results = attendanceStatisticsService.listAttendanceAnomalies(query);

        assertEquals(0L, results.getTotal());
        assertEquals(0, results.getRecords().size());
    }

    @Test
    void testListAttendanceAnomalies_MergesRecordAndAbsentAnomalies() {
        AttendanceAnomalyQueryDTO query = new AttendanceAnomalyQueryDTO();
        query.setEmployeeId(1L);
        query.setStartDate(LocalDate.of(2026, 4, 1));
        query.setEndDate(LocalDate.of(2026, 4, 2));

        Map<String, Object> lateRecord = new HashMap<>();
        lateRecord.put("employeeId", 1L);
        lateRecord.put("employeeName", "测试员工");
        lateRecord.put("employeeNo", "EMP001");
        lateRecord.put("deptId", 10L);
        lateRecord.put("attendanceDate", LocalDate.of(2026, 4, 2));
        lateRecord.put("shiftId", 101L);
        lateRecord.put("checkType", "CHECK_IN");
        lateRecord.put("checkTime", LocalDateTime.of(2026, 4, 2, 9, 30));
        lateRecord.put("anomalyType", "LATE");
        lateRecord.put("anomalyTypeName", "迟到");

        when(attendanceMonthlyMapper.listAttendanceAnomalies(1L, 1L, null, null, "2026-04-01", "2026-04-02"))
                .thenReturn(List.of(lateRecord));
        when(employeeMapper.selectList(any())).thenReturn(List.of(testEmployee));
        when(schedulePlanMapper.selectByDateRange(1L, "DEPT", 10L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 2)))
                .thenReturn(List.of(buildSchedulePlan(101L, "DEPT", 10L, LocalDate.of(2026, 4, 1))));
        when(schedulePlanMapper.selectByDateRange(1L, "EMPLOYEE", 1L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 2)))
                .thenReturn(List.of());
        when(attendanceRecordMapper.selectList(any())).thenReturn(List.of());
        when(leaveApplicationMapper.selectList(any())).thenReturn(List.of());

        IPage<AttendanceAnomalyVO> results = attendanceStatisticsService.listAttendanceAnomalies(query);

        assertEquals(2L, results.getTotal());
        assertEquals(2, results.getRecords().size());
        assertEquals("LATE", results.getRecords().get(0).getAnomalyType());
        assertEquals("ABSENT", results.getRecords().get(1).getAnomalyType());
    }

    @Test
    void testListAttendanceAnomalies_AppliesPagination() {
        AttendanceAnomalyQueryDTO query = new AttendanceAnomalyQueryDTO();
        query.setEmployeeId(1L);
        query.setStartDate(LocalDate.of(2026, 4, 1));
        query.setEndDate(LocalDate.of(2026, 4, 3));
        query.setPageNum(2);
        query.setPageSize(1);

        Map<String, Object> lateRecord = new HashMap<>();
        lateRecord.put("employeeId", 1L);
        lateRecord.put("employeeName", "测试员工");
        lateRecord.put("employeeNo", "EMP001");
        lateRecord.put("deptId", 10L);
        lateRecord.put("attendanceDate", LocalDate.of(2026, 4, 3));
        lateRecord.put("shiftId", 101L);
        lateRecord.put("checkType", "CHECK_IN");
        lateRecord.put("checkTime", LocalDateTime.of(2026, 4, 3, 9, 30));
        lateRecord.put("anomalyType", "LATE");
        lateRecord.put("anomalyTypeName", "迟到");

        when(attendanceMonthlyMapper.listAttendanceAnomalies(1L, 1L, null, null, "2026-04-01", "2026-04-03"))
                .thenReturn(List.of(lateRecord));
        when(employeeMapper.selectList(any())).thenReturn(List.of(testEmployee));
        when(schedulePlanMapper.selectByDateRange(1L, "DEPT", 10L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 3)))
                .thenReturn(List.of(
                        buildSchedulePlan(101L, "DEPT", 10L, LocalDate.of(2026, 4, 1)),
                        buildSchedulePlan(101L, "DEPT", 10L, LocalDate.of(2026, 4, 2))
                ));
        when(schedulePlanMapper.selectByDateRange(1L, "EMPLOYEE", 1L, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 3)))
                .thenReturn(List.of());
        when(attendanceRecordMapper.selectList(any())).thenReturn(List.of());
        when(leaveApplicationMapper.selectList(any())).thenReturn(List.of());

        IPage<AttendanceAnomalyVO> results = attendanceStatisticsService.listAttendanceAnomalies(query);

        assertEquals(3L, results.getTotal());
        assertEquals(2L, results.getCurrent());
        assertEquals(1L, results.getSize());
        assertEquals(1, results.getRecords().size());
        assertEquals("ABSENT", results.getRecords().get(0).getAnomalyType());
    }

    private LeaveApplication buildLeaveApplication(LocalDateTime startTime,
                                                   LocalDateTime endTime,
                                                   BigDecimal duration,
                                                   String unit) {
        LeaveApplication leaveApplication = new LeaveApplication();
        leaveApplication.setTenantId(1L);
        leaveApplication.setEmployeeId(1L);
        leaveApplication.setStatus("APPROVED");
        leaveApplication.setStartTime(startTime);
        leaveApplication.setEndTime(endTime);
        leaveApplication.setDuration(duration);
        leaveApplication.setUnit(unit);
        return leaveApplication;
    }

    private Shift buildShift(Long shiftId, Integer workMinutes) {
        Shift shift = new Shift();
        shift.setId(shiftId);
        shift.setTenantId(1L);
        shift.setWorkMinutes(workMinutes);
        return shift;
    }

    private SchedulePlan buildSchedulePlan(Long shiftId, String targetType, Long targetId, LocalDate scheduleDate) {
        SchedulePlan plan = new SchedulePlan();
        plan.setTenantId(1L);
        plan.setTargetType(targetType);
        plan.setTargetId(targetId);
        plan.setShiftId(shiftId);
        plan.setScheduleDate(scheduleDate);
        plan.setStatus("PUBLISHED");
        return plan;
    }
}
