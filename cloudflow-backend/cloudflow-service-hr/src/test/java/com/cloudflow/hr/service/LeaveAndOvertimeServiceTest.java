package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.LeaveApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.OvertimeApplicationCreateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.LeaveApplication;
import com.cloudflow.hr.domain.entity.LeaveQuota;
import com.cloudflow.hr.domain.entity.LeaveType;
import com.cloudflow.hr.domain.entity.OvertimeApplication;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.LeaveApplicationMapper;
import com.cloudflow.hr.mapper.LeaveQuotaMapper;
import com.cloudflow.hr.mapper.LeaveTypeMapper;
import com.cloudflow.hr.mapper.OvertimeApplicationMapper;
import com.cloudflow.hr.service.impl.LeaveServiceImpl;
import com.cloudflow.hr.service.impl.OvertimeServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 请假和加班主线功能测试。
 */
@ExtendWith(MockitoExtension.class)
class LeaveAndOvertimeServiceTest {

    @Mock
    private LeaveTypeMapper leaveTypeMapper;

    @Mock
    private LeaveQuotaMapper leaveQuotaMapper;

    @Mock
    private LeaveApplicationMapper leaveApplicationMapper;

    @Mock
    private EmployeeMapper employeeMapper;

    @Mock
    private WorkflowServiceClient workflowServiceClient;

    @Mock
    private OvertimeApplicationMapper overtimeApplicationMapper;

    @Mock
    private HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    private LeaveService leaveService;
    private OvertimeService overtimeService;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(1001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(2001L);

        leaveService = new LeaveServiceImpl(
                leaveTypeMapper,
                leaveQuotaMapper,
                leaveApplicationMapper,
                employeeMapper,
                workflowServiceClient,
                new ObjectMapper(),
                workflowProcessKeyProperties
        );
        overtimeService = new OvertimeServiceImpl(
                overtimeApplicationMapper,
                employeeMapper,
                leaveTypeMapper,
                leaveQuotaMapper,
                workflowServiceClient,
                workflowProcessKeyProperties
        );
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void testCreateLeaveApplicationSuccess() {
        AtomicReference<LeaveApplication> stored = new AtomicReference<>();
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectOne(any())).thenReturn(buildLeaveQuota(new BigDecimal("10.00"), BigDecimal.ZERO, BigDecimal.ZERO));
        when(leaveApplicationMapper.insert(any(LeaveApplication.class))).thenAnswer(invocation -> {
            LeaveApplication application = invocation.getArgument(0);
            application.setId(11L);
            stored.set(application);
            return 1;
        });

        LeaveApplicationCreateDTO dto = buildLeaveCreateDto();
        Long applicationId = leaveService.createLeaveApplication(dto);

        assertEquals(11L, applicationId);
        assertEquals("DRAFT", stored.get().getStatus());
        assertTrue(stored.get().getApplicationNo().startsWith("LEAVE"));
        assertEquals(new BigDecimal("2.00"), stored.get().getDuration());
    }

    @Test
    void testSubmitLeaveApplicationFreezesQuotaAndStartsWorkflow() {
        LeaveApplication application = buildLeaveApplication("DRAFT");
        LeaveQuota quota = buildLeaveQuota(new BigDecimal("10.00"), BigDecimal.ZERO, BigDecimal.ZERO);

        when(leaveApplicationMapper.selectById(11L)).thenReturn(application);
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectOne(any())).thenReturn(quota);
        when(workflowProcessKeyProperties.getLeave()).thenReturn("leave_request");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-leave-001"));

        leaveService.submitLeaveApplication(11L);

        ArgumentCaptor<ProcessStartDTO> processCaptor = ArgumentCaptor.forClass(ProcessStartDTO.class);
        verify(workflowServiceClient, times(1)).startProcess(processCaptor.capture());
        ProcessStartDTO processStartDTO = processCaptor.getValue();

        assertEquals("leave_request", processStartDTO.getProcessDefinitionKey());
        assertEquals("LEAVE", processStartDTO.getBusinessType());
        assertEquals(11L, processStartDTO.getBusinessId());
        assertEquals("请假申请-LEAVE202603220001", processStartDTO.getProcessTitle());
        assertEquals("APPROVING", application.getStatus());
        assertEquals("proc-leave-001", application.getProcessInstanceId());
        assertEquals(new BigDecimal("2.00"), quota.getFrozenQuota());
        assertEquals(new BigDecimal("8.00"), quota.getAvailableQuota());
    }

    @Test
    void testApproveLeaveApplicationConsumesFrozenQuota() {
        LeaveApplication application = buildLeaveApplication("APPROVING");
        LeaveQuota quota = buildLeaveQuota(new BigDecimal("10.00"), BigDecimal.ZERO, new BigDecimal("2.00"));
        quota.setAvailableQuota(new BigDecimal("8.00"));

        when(leaveApplicationMapper.selectById(11L)).thenReturn(application);
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectOne(any())).thenReturn(quota);

        leaveService.approveLeaveApplication(11L);

        assertEquals("APPROVED", application.getStatus());
        assertEquals(BigDecimal.ZERO.setScale(2), quota.getFrozenQuota().setScale(2));
        assertEquals(new BigDecimal("2.00"), quota.getUsedQuota());
    }

    @Test
    void testRejectLeaveApplicationReleasesFrozenQuota() {
        LeaveApplication application = buildLeaveApplication("APPROVING");
        LeaveQuota quota = buildLeaveQuota(new BigDecimal("10.00"), BigDecimal.ZERO, new BigDecimal("2.00"));
        quota.setAvailableQuota(new BigDecimal("8.00"));

        when(leaveApplicationMapper.selectById(11L)).thenReturn(application);
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectOne(any())).thenReturn(quota);

        leaveService.rejectLeaveApplication(11L);

        assertEquals("REJECTED", application.getStatus());
        assertEquals(BigDecimal.ZERO.setScale(2), quota.getFrozenQuota().setScale(2));
        assertEquals(new BigDecimal("10.00"), quota.getAvailableQuota());
    }

    @Test
    void testCreateOvertimeApplicationSuccess() {
        AtomicReference<OvertimeApplication> stored = new AtomicReference<>();
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(overtimeApplicationMapper.insert(any(OvertimeApplication.class))).thenAnswer(invocation -> {
            OvertimeApplication application = invocation.getArgument(0);
            application.setId(21L);
            stored.set(application);
            return 1;
        });

        OvertimeApplicationCreateDTO dto = buildOvertimeCreateDto();
        Long applicationId = overtimeService.createOvertimeApplication(dto);

        assertEquals(21L, applicationId);
        assertEquals("DRAFT", stored.get().getStatus());
        assertEquals(new BigDecimal("2.00"), stored.get().getDuration());
        assertEquals(new BigDecimal("3.00"), stored.get().getCompensationHours());
        assertTrue(stored.get().getApplicationNo().startsWith("OT"));
    }

    @Test
    void testSubmitOvertimeApplicationSuccess() {
        OvertimeApplication application = buildOvertimeApplication("DRAFT");
        when(overtimeApplicationMapper.selectById(21L)).thenReturn(application);
        when(workflowProcessKeyProperties.getOvertime()).thenReturn("overtime_request");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-overtime-001"));

        overtimeService.submitOvertimeApplication(21L);

        assertEquals("APPROVING", application.getStatus());
        assertEquals("proc-overtime-001", application.getProcessInstanceId());
        verify(workflowServiceClient, times(1)).startProcess(any(ProcessStartDTO.class));
    }

    @Test
    void testApproveOvertimeApplicationAddsTimeOffQuota() {
        OvertimeApplication application = buildOvertimeApplication("APPROVING");
        LeaveType compensatoryType = new LeaveType();
        compensatoryType.setId(401L);
        compensatoryType.setTenantId(2001L);
        compensatoryType.setLeaveCode("COMPENSATORY");
        LeaveQuota quota = buildLeaveQuota(new BigDecimal("5.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        quota.setLeaveTypeId(401L);

        when(overtimeApplicationMapper.selectById(21L)).thenReturn(application);
        when(leaveTypeMapper.selectOne(any())).thenReturn(compensatoryType);
        when(leaveQuotaMapper.selectOne(any())).thenReturn(quota);

        overtimeService.approveOvertimeApplication(21L);

        assertEquals("APPROVED", application.getStatus());
        assertEquals(new BigDecimal("8.00"), quota.getTotalQuota());
        assertEquals(new BigDecimal("8.00"), quota.getAvailableQuota());
    }

    @Test
    void testRejectOvertimeApplicationSuccess() {
        OvertimeApplication application = buildOvertimeApplication("APPROVING");
        when(overtimeApplicationMapper.selectById(21L)).thenReturn(application);

        overtimeService.rejectOvertimeApplication(21L);

        assertEquals("REJECTED", application.getStatus());
    }

    private Employee buildEmployee() {
        Employee employee = new Employee();
        employee.setId(1L);
        employee.setTenantId(2001L);
        employee.setName("测试员工");
        employee.setEmployeeNo("EMP001");
        employee.setEmployeeStatus("REGULAR");
        return employee;
    }

    private LeaveType buildAnnualLeaveType() {
        LeaveType leaveType = new LeaveType();
        leaveType.setId(301L);
        leaveType.setTenantId(2001L);
        leaveType.setLeaveCode("ANNUAL");
        leaveType.setLeaveName("年假");
        leaveType.setNeedQuota(true);
        return leaveType;
    }

    private LeaveQuota buildLeaveQuota(BigDecimal totalQuota, BigDecimal usedQuota, BigDecimal frozenQuota) {
        LeaveQuota quota = new LeaveQuota();
        quota.setId(501L);
        quota.setTenantId(2001L);
        quota.setEmployeeId(1L);
        quota.setLeaveTypeId(301L);
        quota.setYear(2026);
        quota.setTotalQuota(totalQuota);
        quota.setUsedQuota(usedQuota);
        quota.setFrozenQuota(frozenQuota);
        quota.setAvailableQuota(totalQuota.subtract(usedQuota).subtract(frozenQuota));
        quota.setExpiryDate(LocalDate.of(2026, 12, 31));
        return quota;
    }

    private LeaveApplicationCreateDTO buildLeaveCreateDto() {
        LeaveApplicationCreateDTO dto = new LeaveApplicationCreateDTO();
        dto.setEmployeeId(1L);
        dto.setLeaveTypeId(301L);
        dto.setStartTime(LocalDateTime.of(2026, 3, 22, 9, 0));
        dto.setEndTime(LocalDateTime.of(2026, 3, 23, 18, 0));
        dto.setDuration(new BigDecimal("2.00"));
        dto.setUnit("DAY");
        dto.setReason("个人事务");
        return dto;
    }

    private LeaveApplication buildLeaveApplication(String status) {
        LeaveApplication application = new LeaveApplication();
        application.setId(11L);
        application.setTenantId(2001L);
        application.setApplicationNo("LEAVE202603220001");
        application.setEmployeeId(1L);
        application.setLeaveTypeId(301L);
        application.setStartTime(LocalDateTime.of(2026, 3, 22, 9, 0));
        application.setEndTime(LocalDateTime.of(2026, 3, 23, 18, 0));
        application.setDuration(new BigDecimal("2.00"));
        application.setUnit("DAY");
        application.setReason("个人事务");
        application.setStatus(status);
        return application;
    }

    private OvertimeApplicationCreateDTO buildOvertimeCreateDto() {
        OvertimeApplicationCreateDTO dto = new OvertimeApplicationCreateDTO();
        dto.setEmployeeId(1L);
        dto.setStartTime(LocalDateTime.of(2026, 3, 22, 18, 0));
        dto.setEndTime(LocalDateTime.of(2026, 3, 22, 20, 0));
        dto.setOvertimeType("WEEKEND");
        dto.setReason("项目上线");
        dto.setCompensationType("TIME_OFF");
        return dto;
    }

    private OvertimeApplication buildOvertimeApplication(String status) {
        OvertimeApplication application = new OvertimeApplication();
        application.setId(21L);
        application.setTenantId(2001L);
        application.setApplicationNo("OT202603220001");
        application.setEmployeeId(1L);
        application.setStartTime(LocalDateTime.of(2026, 3, 22, 18, 0));
        application.setEndTime(LocalDateTime.of(2026, 3, 22, 20, 0));
        application.setDuration(new BigDecimal("2.00"));
        application.setOvertimeType("WEEKEND");
        application.setReason("项目上线");
        application.setCompensationType("TIME_OFF");
        application.setCompensationHours(new BigDecimal("3.00"));
        application.setStatus(status);
        return application;
    }
}
