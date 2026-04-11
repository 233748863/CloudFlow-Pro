package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.SalaryAdjustmentCreateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.EmployeeSalary;
import com.cloudflow.hr.domain.entity.SalaryAdjustment;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.EmployeeSalaryMapper;
import com.cloudflow.hr.mapper.SalaryAdjustmentMapper;
import com.cloudflow.hr.service.impl.SalaryAdjustmentServiceImpl;
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
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 调薪主线功能测试。
 */
@ExtendWith(MockitoExtension.class)
class SalaryAdjustmentServiceTest {

    @Mock
    private SalaryAdjustmentMapper salaryAdjustmentMapper;

    @Mock
    private EmployeeMapper employeeMapper;

    @Mock
    private EmployeeSalaryMapper employeeSalaryMapper;

    @Mock
    private WorkflowServiceClient workflowServiceClient;

    @Mock
    private HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    private SalaryAdjustmentService salaryAdjustmentService;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(1001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(2001L);

        salaryAdjustmentService = new SalaryAdjustmentServiceImpl(
                salaryAdjustmentMapper,
                employeeMapper,
                employeeSalaryMapper,
                workflowServiceClient,
                workflowProcessKeyProperties,
                new ObjectMapper()
        );
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void testCreateSalaryAdjustmentSuccess() {
        AtomicReference<SalaryAdjustment> stored = new AtomicReference<>();
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(employeeSalaryMapper.selectOne(any())).thenReturn(buildCurrentSalary());
        when(salaryAdjustmentMapper.generateApplicationNo()).thenReturn("SA202603220001");
        when(salaryAdjustmentMapper.insert(any(SalaryAdjustment.class))).thenAnswer(invocation -> {
            SalaryAdjustment adjustment = invocation.getArgument(0);
            adjustment.setId(31L);
            stored.set(adjustment);
            return 1;
        });

        SalaryAdjustmentCreateDTO dto = buildCreateDto();
        Long adjustmentId = salaryAdjustmentService.createSalaryAdjustment(dto);

        assertEquals(31L, adjustmentId);
        assertEquals(new BigDecimal("10000.00"), stored.get().getBeforeTotal());
        assertEquals(new BigDecimal("12000.00"), stored.get().getAfterTotal());
        assertEquals(new BigDecimal("2000.00"), stored.get().getAdjustmentAmount());
        assertTrue(stored.get().getAdjustmentRate().compareTo(new BigDecimal("20")) == 0);
        assertEquals("DRAFT", stored.get().getStatus());
    }

    @Test
    void testCreateSalaryAdjustmentFallsBackToSnowflakeApplicationNo() {
        AtomicReference<SalaryAdjustment> stored = new AtomicReference<>();
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(employeeSalaryMapper.selectOne(any())).thenReturn(buildCurrentSalary());
        when(salaryAdjustmentMapper.generateApplicationNo()).thenReturn(null);
        when(salaryAdjustmentMapper.insert(any(SalaryAdjustment.class))).thenAnswer(invocation -> {
            SalaryAdjustment adjustment = invocation.getArgument(0);
            adjustment.setId(32L);
            stored.set(adjustment);
            return 1;
        });

        Long adjustmentId = salaryAdjustmentService.createSalaryAdjustment(buildCreateDto());

        assertEquals(32L, adjustmentId);
        assertTrue(stored.get().getApplicationNo().startsWith("SA"));
        assertTrue(stored.get().getApplicationNo().length() > 10);
    }

    @Test
    void testSubmitSalaryAdjustmentSuccess() {
        SalaryAdjustment adjustment = buildAdjustment("DRAFT", LocalDate.of(2026, 4, 1));
        when(salaryAdjustmentMapper.selectById(31L)).thenReturn(adjustment);
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(workflowProcessKeyProperties.getSalaryAdjustment()).thenReturn("salary_adjustment_approval");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-salary-001"));

        salaryAdjustmentService.submitSalaryAdjustment(31L);

        assertEquals("APPROVING", adjustment.getStatus());
        assertEquals("proc-salary-001", adjustment.getProcessInstanceId());
        verify(workflowServiceClient, times(1)).startProcess(any(ProcessStartDTO.class));
    }

    @Test
    void testSubmitSalaryAdjustmentRejectsWhenWorkflowServiceReturnsNull() {
        SalaryAdjustment adjustment = buildAdjustment("DRAFT", LocalDate.of(2026, 4, 1));
        when(salaryAdjustmentMapper.selectById(31L)).thenReturn(adjustment);
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(workflowProcessKeyProperties.getSalaryAdjustment()).thenReturn("salary_adjustment_approval");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(null);

        HrSystemException exception = assertThrows(HrSystemException.class, () -> salaryAdjustmentService.submitSalaryAdjustment(31L));

        assertTrue(exception.getMessage().contains("Workflow 服务无响应"));
    }

    @Test
    void testApproveSalaryAdjustmentEffectiveImmediately() {
        SalaryAdjustment adjustment = buildAdjustment("APPROVING", LocalDate.now());
        EmployeeSalary currentSalary = buildCurrentSalary();

        when(salaryAdjustmentMapper.selectById(31L)).thenReturn(adjustment);
        when(employeeSalaryMapper.selectOne(any())).thenReturn(currentSalary);

        salaryAdjustmentService.approveSalaryAdjustment(31L);

        ArgumentCaptor<EmployeeSalary> newSalaryCaptor = ArgumentCaptor.forClass(EmployeeSalary.class);
        verify(employeeSalaryMapper, times(1)).insert(newSalaryCaptor.capture());
        EmployeeSalary newSalary = newSalaryCaptor.getValue();

        assertEquals("EXPIRED", currentSalary.getStatus());
        assertEquals("EFFECTIVE", adjustment.getStatus());
        assertEquals("ACTIVE", newSalary.getStatus());
        assertEquals(new BigDecimal("12000.00"), newSalary.getTotalSalary());
        assertEquals("{\"101\":9000.00,\"102\":3000.00}", newSalary.getSalaryData());
    }

    private Employee buildEmployee() {
        Employee employee = new Employee();
        employee.setId(1L);
        employee.setTenantId(2001L);
        employee.setName("测试员工");
        employee.setEmployeeNo("EMP001");
        return employee;
    }

    private EmployeeSalary buildCurrentSalary() {
        EmployeeSalary salary = new EmployeeSalary();
        salary.setId(101L);
        salary.setTenantId(2001L);
        salary.setEmployeeId(1L);
        salary.setStructureId(51L);
        salary.setSalaryData("{\"101\":8000.00,\"102\":2000.00}");
        salary.setTotalSalary(new BigDecimal("10000.00"));
        salary.setEffectiveDate(LocalDate.of(2026, 1, 1));
        salary.setStatus("ACTIVE");
        return salary;
    }

    private SalaryAdjustmentCreateDTO buildCreateDto() {
        SalaryAdjustmentCreateDTO dto = new SalaryAdjustmentCreateDTO();
        dto.setEmployeeId(1L);
        dto.setAdjustmentType("PROMOTION");
        dto.setAdjustmentReason("晋升调薪");
        dto.setAfterSalaryData("{\"101\":9000.00,\"102\":3000.00}");
        dto.setAfterTotal(new BigDecimal("12000.00"));
        dto.setEffectiveDate(LocalDate.of(2026, 4, 1));
        return dto;
    }

    private SalaryAdjustment buildAdjustment(String status, LocalDate effectiveDate) {
        SalaryAdjustment adjustment = new SalaryAdjustment();
        adjustment.setId(31L);
        adjustment.setTenantId(2001L);
        adjustment.setApplicationNo("SA202603220001");
        adjustment.setEmployeeId(1L);
        adjustment.setAdjustmentType("PROMOTION");
        adjustment.setAdjustmentReason("晋升调薪");
        adjustment.setBeforeSalaryData("{\"101\":8000.00,\"102\":2000.00}");
        adjustment.setAfterSalaryData("{\"101\":9000.00,\"102\":3000.00}");
        adjustment.setBeforeTotal(new BigDecimal("10000.00"));
        adjustment.setAfterTotal(new BigDecimal("12000.00"));
        adjustment.setAdjustmentAmount(new BigDecimal("2000.00"));
        adjustment.setAdjustmentRate(new BigDecimal("20.00"));
        adjustment.setEffectiveDate(effectiveDate);
        adjustment.setStatus(status);
        return adjustment;
    }
}
