package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.AttendanceSupplementDTO;
import com.cloudflow.hr.domain.entity.AttendanceRecord;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.SchedulePlan;
import com.cloudflow.hr.mapper.AttendanceRecordMapper;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.SchedulePlanMapper;
import com.cloudflow.hr.mapper.ShiftMapper;
import com.cloudflow.hr.service.impl.AttendanceServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 补卡主线功能测试。
 */
@ExtendWith(MockitoExtension.class)
class AttendanceSupplementServiceTest {

    @Mock
    private AttendanceRecordMapper attendanceRecordMapper;

    @Mock
    private EmployeeMapper employeeMapper;

    @Mock
    private SchedulePlanMapper schedulePlanMapper;

    @Mock
    private ShiftMapper shiftMapper;

    @Mock
    private WorkflowServiceClient workflowServiceClient;

    @Mock
    private HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    private AttendanceService attendanceService;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(1001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(2001L);

        attendanceService = new AttendanceServiceImpl(
                attendanceRecordMapper,
                employeeMapper,
                schedulePlanMapper,
                shiftMapper,
                workflowServiceClient,
                workflowProcessKeyProperties
        );
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void testCreateSupplementApplicationSuccess() {
        AtomicReference<AttendanceRecord> stored = new AtomicReference<>();
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(attendanceRecordMapper.selectByEmployeeAndDate(any(), any(), any())).thenReturn(null);
        when(schedulePlanMapper.selectOne(any())).thenReturn(buildSchedulePlan());
        when(attendanceRecordMapper.insert(any(AttendanceRecord.class))).thenAnswer(invocation -> {
            AttendanceRecord record = invocation.getArgument(0);
            record.setId(31L);
            stored.set(record);
            return 1;
        });

        Long recordId = attendanceService.createSupplementApplication(buildSupplementDto());

        assertEquals(31L, recordId);
        assertEquals("MISSING", stored.get().getStatus());
        assertEquals("SUPPLEMENT", stored.get().getCheckMethod());
        assertEquals("补卡说明", stored.get().getRemark());
    }

    @Test
    void testCreateSupplementApplicationWithoutScheduleStillSuccess() {
        AtomicReference<AttendanceRecord> stored = new AtomicReference<>();
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(attendanceRecordMapper.selectByEmployeeAndDate(any(), any(), any())).thenReturn(null);
        when(schedulePlanMapper.selectOne(any())).thenReturn(null);
        when(attendanceRecordMapper.insert(any(AttendanceRecord.class))).thenAnswer(invocation -> {
            AttendanceRecord record = invocation.getArgument(0);
            record.setId(32L);
            stored.set(record);
            return 1;
        });

        Long recordId = attendanceService.createSupplementApplication(buildSupplementDto());

        assertEquals(32L, recordId);
        assertNotNull(stored.get());
        assertNull(stored.get().getShiftId());
        assertEquals("MISSING", stored.get().getStatus());
    }

    @Test
    void testSubmitSupplementApplicationSuccess() {
        AttendanceRecord record = buildSupplementRecord("MISSING");
        when(attendanceRecordMapper.selectById(31L)).thenReturn(record);
        when(workflowProcessKeyProperties.getAttendanceSupplement()).thenReturn("attendance_appeal");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-attendance-001"));

        attendanceService.submitSupplementApplication(31L);

        ArgumentCaptor<ProcessStartDTO> captor = ArgumentCaptor.forClass(ProcessStartDTO.class);
        verify(workflowServiceClient, times(1)).startProcess(captor.capture());
        assertEquals("APPROVING", record.getStatus());
        assertEquals("proc-attendance-001", record.getProcessInstanceId());
    }

    @Test
    void testApproveSupplementApplicationSuccess() {
        AttendanceRecord record = buildSupplementRecord("APPROVING");
        when(attendanceRecordMapper.selectById(31L)).thenReturn(record);

        attendanceService.approveSupplementApplication(31L);

        assertEquals("SUPPLEMENT", record.getStatus());
        verify(attendanceRecordMapper, times(1)).updateById(record);
    }

    @Test
    void testRejectSupplementApplicationSuccess() {
        AttendanceRecord record = buildSupplementRecord("APPROVING");
        when(attendanceRecordMapper.selectById(31L)).thenReturn(record);

        attendanceService.rejectSupplementApplication(31L);

        assertEquals("REJECTED", record.getStatus());
        verify(attendanceRecordMapper, times(1)).updateById(record);
    }

    private Employee buildEmployee() {
        Employee employee = new Employee();
        employee.setId(1L);
        employee.setTenantId(2001L);
        employee.setEmployeeStatus("REGULAR");
        return employee;
    }

    private SchedulePlan buildSchedulePlan() {
        SchedulePlan plan = new SchedulePlan();
        plan.setId(11L);
        plan.setTenantId(2001L);
        plan.setTargetType("EMPLOYEE");
        plan.setTargetId(1L);
        plan.setShiftId(101L);
        plan.setScheduleDate(LocalDate.of(2026, 3, 22));
        plan.setStatus("PUBLISHED");
        return plan;
    }

    private AttendanceSupplementDTO buildSupplementDto() {
        AttendanceSupplementDTO dto = new AttendanceSupplementDTO();
        dto.setEmployeeId(1L);
        dto.setAttendanceDate(LocalDate.of(2026, 3, 22));
        dto.setCheckType("CHECK_IN");
        dto.setCheckTime(LocalDateTime.of(2026, 3, 22, 9, 0));
        dto.setReason("补卡说明");
        return dto;
    }

    private AttendanceRecord buildSupplementRecord(String status) {
        AttendanceRecord record = new AttendanceRecord();
        record.setId(31L);
        record.setTenantId(2001L);
        record.setEmployeeId(1L);
        record.setAttendanceDate(LocalDate.of(2026, 3, 22));
        record.setShiftId(101L);
        record.setCheckType("CHECK_IN");
        record.setCheckTime(LocalDateTime.of(2026, 3, 22, 9, 0));
        record.setCheckMethod("SUPPLEMENT");
        record.setStatus(status);
        record.setRemark("补卡说明");
        return record;
    }
}
