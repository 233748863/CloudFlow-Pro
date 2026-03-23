package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.ProbationConfirmationCreateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.ProbationConfirmation;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.ProbationConfirmationMapper;
import com.cloudflow.hr.service.impl.ProbationConfirmationServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 转正服务测试类
 */
@ExtendWith(MockitoExtension.class)
class ProbationConfirmationServiceTest {

    @Mock
    private ProbationConfirmationMapper probationConfirmationMapper;

    @Mock
    private EmployeeMapper employeeMapper;

    @Mock
    private WorkflowServiceClient workflowServiceClient;

    @Mock
    private HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    @InjectMocks
    private ProbationConfirmationServiceImpl probationConfirmationService;

    @BeforeEach
    void setUpUserContext() {
        UserContext.setUserId(1001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(2001L);
    }

    @AfterEach
    void clearUserContext() {
        UserContext.clear();
    }

    /**
     * 测试创建转正申请时，能够正确写入租户、状态和申请编号
     */
    @Test
    void testCreateProbationConfirmationSuccess() {
        ProbationConfirmationCreateDTO dto = new ProbationConfirmationCreateDTO();
        dto.setEmployeeId(1L);
        dto.setProbationStartDate(LocalDate.of(2026, 1, 1));
        dto.setProbationEndDate(LocalDate.of(2026, 3, 31));
        dto.setExpectedRegularDate(LocalDate.of(2026, 4, 1));
        dto.setSelfEvaluation("试用期表现稳定");
        dto.setManagerEvaluation("建议转正");

        Employee employee = buildProbationEmployee();

        when(employeeMapper.selectById(1L)).thenReturn(employee);
        when(probationConfirmationMapper.selectCount(any())).thenReturn(0L);
        when(probationConfirmationMapper.insert(any(ProbationConfirmation.class))).thenAnswer(invocation -> {
            ProbationConfirmation confirmation = invocation.getArgument(0);
            confirmation.setId(88L);
            return 1;
        });

        Long confirmationId = probationConfirmationService.createProbationConfirmation(dto);

        ArgumentCaptor<ProbationConfirmation> confirmationCaptor = ArgumentCaptor.forClass(ProbationConfirmation.class);
        verify(probationConfirmationMapper, times(1)).insert(confirmationCaptor.capture());

        ProbationConfirmation saved = confirmationCaptor.getValue();
        assertEquals(88L, confirmationId);
        assertEquals(2001L, saved.getTenantId());
        assertEquals("DRAFT", saved.getStatus());
        assertTrue(saved.getApplicationNo().startsWith("PC"));
        assertEquals(dto.getProbationStartDate(), saved.getProbationStartDate());
        assertEquals(dto.getProbationEndDate(), saved.getProbationEndDate());
        assertEquals(dto.getExpectedRegularDate(), saved.getExpectedRegularDate());
    }

    /**
     * 测试提交转正申请时，会启动工作流并更新审批状态
     */
    @Test
    void testSubmitProbationConfirmationSuccess() {
        ProbationConfirmation confirmation = buildDraftConfirmation();
        Employee employee = buildProbationEmployee();

        when(probationConfirmationMapper.selectById(10L)).thenReturn(confirmation);
        when(employeeMapper.selectById(1L)).thenReturn(employee);
        when(workflowProcessKeyProperties.getProbationConfirmation()).thenReturn("probation_confirmation_approval");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-20260322"));

        probationConfirmationService.submitProbationConfirmation(10L);

        ArgumentCaptor<ProcessStartDTO> processCaptor = ArgumentCaptor.forClass(ProcessStartDTO.class);
        verify(workflowServiceClient, times(1)).startProcess(processCaptor.capture());

        ProcessStartDTO processStartDTO = processCaptor.getValue();
        assertEquals(2001L, processStartDTO.getTenantId());
        assertEquals("probation_confirmation_approval", processStartDTO.getProcessDefinitionKey());
        assertEquals("PROBATION_CONFIRMATION", processStartDTO.getBusinessType());
        assertEquals(10L, processStartDTO.getBusinessId());
        assertEquals("PC202603220001", processStartDTO.getBusinessNo());
        assertEquals(1001L, processStartDTO.getStartUserId());

        Map<String, Object> variables = processStartDTO.getVariables();
        assertEquals("测试员工", variables.get("employeeName"));
        assertEquals("EMP001", variables.get("employeeNo"));
        assertEquals(101L, variables.get("deptId"));

        ArgumentCaptor<ProbationConfirmation> updateCaptor = ArgumentCaptor.forClass(ProbationConfirmation.class);
        verify(probationConfirmationMapper, times(1)).updateById(updateCaptor.capture());

        ProbationConfirmation updated = updateCaptor.getValue();
        assertEquals("APPROVING", updated.getStatus());
        assertEquals("proc-20260322", updated.getProcessInstanceId());
    }

    /**
     * 测试审批通过后，员工状态会变成正式员工
     */
    @Test
    void testApproveProbationConfirmationSuccess() {
        ProbationConfirmation confirmation = buildDraftConfirmation();
        Employee employee = buildProbationEmployee();

        when(probationConfirmationMapper.selectById(10L)).thenReturn(confirmation);
        when(employeeMapper.selectById(1L)).thenReturn(employee);

        probationConfirmationService.approveProbationConfirmation(10L);

        ArgumentCaptor<Employee> employeeCaptor = ArgumentCaptor.forClass(Employee.class);
        verify(employeeMapper, times(1)).updateById(employeeCaptor.capture());

        Employee updatedEmployee = employeeCaptor.getValue();
        assertEquals("REGULAR", updatedEmployee.getEmployeeStatus());
        assertEquals(LocalDate.of(2026, 4, 1), updatedEmployee.getRegularDate());

        ArgumentCaptor<ProbationConfirmation> confirmationCaptor = ArgumentCaptor.forClass(ProbationConfirmation.class);
        verify(probationConfirmationMapper, times(1)).updateById(confirmationCaptor.capture());
        assertEquals("APPROVED", confirmationCaptor.getValue().getStatus());
    }

    /**
     * 测试审批拒绝且延长试用期时，不会把员工标记为离职
     */
    @Test
    void testRejectProbationConfirmationWithExtensionSuccess() {
        ProbationConfirmation confirmation = buildDraftConfirmation();
        Employee employee = buildProbationEmployee();

        when(probationConfirmationMapper.selectById(10L)).thenReturn(confirmation);
        when(employeeMapper.selectById(1L)).thenReturn(employee);

        probationConfirmationService.rejectProbationConfirmation(10L, "需要继续观察", 15);

        ArgumentCaptor<ProbationConfirmation> confirmationCaptor = ArgumentCaptor.forClass(ProbationConfirmation.class);
        verify(probationConfirmationMapper, times(1)).updateById(confirmationCaptor.capture());

        ProbationConfirmation updated = confirmationCaptor.getValue();
        assertEquals("EXTENDED", updated.getStatus());
        assertEquals("需要继续观察", updated.getRejectReason());
        assertEquals(15, updated.getExtensionDays());
        assertEquals(LocalDate.of(2026, 4, 15), updated.getProbationEndDate());
        assertEquals(LocalDate.of(2026, 4, 15), updated.getExpectedRegularDate());
        verify(employeeMapper, never()).updateById(any(Employee.class));
    }

    /**
     * 测试审批拒绝且不延长期限时，员工会被标记为离职
     */
    @Test
    void testRejectProbationConfirmationWithoutExtensionMarksResigned() {
        ProbationConfirmation confirmation = buildDraftConfirmation();
        Employee employee = buildProbationEmployee();

        when(probationConfirmationMapper.selectById(10L)).thenReturn(confirmation);
        when(employeeMapper.selectById(1L)).thenReturn(employee);

        probationConfirmationService.rejectProbationConfirmation(10L, "试用期考核未通过", null);

        ArgumentCaptor<Employee> employeeCaptor = ArgumentCaptor.forClass(Employee.class);
        verify(employeeMapper, times(1)).updateById(employeeCaptor.capture());

        Employee updatedEmployee = employeeCaptor.getValue();
        assertEquals("RESIGNED", updatedEmployee.getEmployeeStatus());
        assertNotNull(updatedEmployee.getResignDate());
        assertFalse(updatedEmployee.getResignDate().isAfter(LocalDate.now()));

        ArgumentCaptor<ProbationConfirmation> confirmationCaptor = ArgumentCaptor.forClass(ProbationConfirmation.class);
        verify(probationConfirmationMapper, times(1)).updateById(confirmationCaptor.capture());

        ProbationConfirmation updated = confirmationCaptor.getValue();
        assertEquals("REJECTED", updated.getStatus());
        assertEquals("试用期考核未通过", updated.getRejectReason());
    }

    private Employee buildProbationEmployee() {
        Employee employee = new Employee();
        employee.setId(1L);
        employee.setTenantId(2001L);
        employee.setEmployeeNo("EMP001");
        employee.setName("测试员工");
        employee.setDeptId(101L);
        employee.setHireDate(LocalDate.of(2026, 1, 1));
        employee.setEmployeeStatus("PROBATION");
        return employee;
    }

    private ProbationConfirmation buildDraftConfirmation() {
        ProbationConfirmation confirmation = new ProbationConfirmation();
        confirmation.setId(10L);
        confirmation.setTenantId(2001L);
        confirmation.setEmployeeId(1L);
        confirmation.setApplicationNo("PC202603220001");
        confirmation.setStatus("DRAFT");
        confirmation.setProbationStartDate(LocalDate.of(2026, 1, 1));
        confirmation.setProbationEndDate(LocalDate.of(2026, 3, 31));
        confirmation.setExpectedRegularDate(LocalDate.of(2026, 4, 1));
        return confirmation;
    }
}
