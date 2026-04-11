package com.cloudflow.hr.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.ResignationApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.ResignationConfirmDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.ResignationApplication;
import com.cloudflow.hr.domain.entity.ResignationHandover;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.ResignationApplicationMapper;
import com.cloudflow.hr.mapper.ResignationHandoverMapper;
import com.cloudflow.hr.service.impl.ResignationServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 离职主线功能测试。
 */
@ExtendWith(MockitoExtension.class)
class ResignationServiceTest {

    @Mock
    private ResignationApplicationMapper resignationApplicationMapper;

    @Mock
    private ResignationHandoverMapper resignationHandoverMapper;

    @Mock
    private EmployeeMapper employeeMapper;

    @Mock
    private AuthServiceClient authServiceClient;

    @Mock
    private WorkflowServiceClient workflowServiceClient;

    @Mock
    private HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private ResignationServiceImpl resignationService;

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
     * 验证创建离职申请时会生成草稿申请。
     */
    @Test
    void testCreateResignationApplicationSuccess() {
        ResignationApplicationCreateDTO dto = new ResignationApplicationCreateDTO();
        dto.setEmployeeId(1L);
        dto.setResignationType("VOLUNTARY");
        dto.setResignationReason("个人发展");
        dto.setExpectedDate(LocalDate.of(2026, 4, 30));

        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(resignationApplicationMapper.selectCount(any())).thenReturn(0L);
        when(resignationApplicationMapper.insert(any(ResignationApplication.class))).thenAnswer(invocation -> {
            ResignationApplication application = invocation.getArgument(0);
            application.setId(41L);
            return 1;
        });

        Long applicationId = resignationService.createResignationApplication(dto);

        ArgumentCaptor<ResignationApplication> captor = ArgumentCaptor.forClass(ResignationApplication.class);
        verify(resignationApplicationMapper, times(1)).insert(captor.capture());
        ResignationApplication saved = captor.getValue();

        assertEquals(41L, applicationId);
        assertEquals("DRAFT", saved.getStatus());
        assertEquals(2001L, saved.getTenantId());
        assertTrue(saved.getApplicationNo().startsWith("RS"));
    }

    /**
     * 验证提交离职申请时会启动审批流程。
     */
    @Test
    void testSubmitResignationApplicationSuccess() {
        ResignationApplication application = buildApplication();
        when(resignationApplicationMapper.selectById(41L)).thenReturn(application);
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(workflowProcessKeyProperties.getResignation()).thenReturn("resignation_approval");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-resignation-001"));

        resignationService.submitResignationApplication(41L);

        ArgumentCaptor<ProcessStartDTO> processCaptor = ArgumentCaptor.forClass(ProcessStartDTO.class);
        verify(workflowServiceClient, times(1)).startProcess(processCaptor.capture());
        ProcessStartDTO processStartDTO = processCaptor.getValue();

        assertEquals("resignation_approval", processStartDTO.getProcessDefinitionKey());
        assertEquals("RESIGNATION", processStartDTO.getBusinessType());
        assertEquals(41L, processStartDTO.getBusinessId());

        Map<String, Object> variables = processStartDTO.getVariables();
        assertEquals("测试员工", variables.get("employeeName"));
        assertEquals("EMP001", variables.get("employeeNo"));
        assertEquals("VOLUNTARY", variables.get("resignationType"));
        assertEquals("2026-04-30", variables.get("expectedDate"));

        assertEquals("APPROVING", application.getStatus());
        assertEquals("proc-resignation-001", application.getProcessInstanceId());
        verify(resignationApplicationMapper, times(1)).updateById(application);
    }

    @Test
    void testSubmitResignationApplicationRejectsWhenWorkflowServiceReturnsNull() {
        ResignationApplication application = buildApplication();
        when(resignationApplicationMapper.selectById(41L)).thenReturn(application);
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(workflowProcessKeyProperties.getResignation()).thenReturn("resignation_approval");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(null);

        HrSystemException exception = assertThrows(
                HrSystemException.class,
                () -> resignationService.submitResignationApplication(41L)
        );

        assertTrue(exception.getMessage().contains("Workflow 服务无响应"));
    }

    /**
     * 验证离职审批通过后会生成标准交接清单。
     */
    @Test
    void testSubmitResignationApplicationRejectsWhenWorkflowReturnsBlankProcessInstanceId() {
        ResignationApplication application = buildApplication();
        when(resignationApplicationMapper.selectById(41L)).thenReturn(application);
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(workflowProcessKeyProperties.getResignation()).thenReturn("resignation_approval");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok(""));

        HrSystemException exception = assertThrows(
                HrSystemException.class,
                () -> resignationService.submitResignationApplication(41L)
        );

        assertTrue(exception.getMessage().contains("未返回流程实例ID"));
    }

    @Test
    void testApproveResignationGeneratesHandovers() {
        ResignationApplication application = buildApplication();
        application.setStatus("APPROVING");
        when(resignationApplicationMapper.selectById(41L)).thenReturn(application);

        resignationService.approveResignation(41L);

        ArgumentCaptor<ResignationHandover> handoverCaptor = ArgumentCaptor.forClass(ResignationHandover.class);
        verify(resignationHandoverMapper, times(4)).insert(handoverCaptor.capture());
        List<ResignationHandover> handovers = handoverCaptor.getAllValues();

        assertEquals("APPROVED", application.getStatus());
        assertEquals(4, handovers.size());
        assertTrue(handovers.stream().anyMatch(item -> "WORK".equals(item.getHandoverType())));
        assertTrue(handovers.stream().anyMatch(item -> "ASSET".equals(item.getHandoverType())));
        assertTrue(handovers.stream().anyMatch(item -> "DOCUMENT".equals(item.getHandoverType())));
        assertTrue(handovers.stream().anyMatch(item -> "ACCOUNT".equals(item.getHandoverType())));
    }

    /**
     * 验证确认离职时会更新员工状态、完成申请并注销账号。
     */
    @Test
    void testConductExitInterviewNormalizesJsonStringContent() throws Exception {
        ResignationApplication application = buildApplication();
        when(resignationApplicationMapper.selectById(41L)).thenReturn(application);
        when(objectMapper.readValue("\"codex regression exit interview\"", String.class))
                .thenReturn("codex regression exit interview");

        resignationService.conductExitInterview(41L, "\"codex regression exit interview\"");

        assertEquals("codex regression exit interview", application.getInterviewContent());
        verify(resignationApplicationMapper, times(1)).updateById(application);
    }

    @Test
    void testConfirmResignationSuccess() {
        ResignationApplication application = buildApplication();
        application.setStatus("APPROVED");
        Employee employee = buildEmployee();
        employee.setUserId(9001L);

        when(resignationApplicationMapper.selectById(41L)).thenReturn(application);
        when(resignationHandoverMapper.selectCount(any())).thenReturn(0L);
        when(employeeMapper.selectById(1L)).thenReturn(employee);
        when(authServiceClient.disableUser(9001L)).thenReturn(R.ok());

        ResignationConfirmDTO dto = new ResignationConfirmDTO();
        dto.setApplicationId(41L);
        dto.setActualDate(LocalDate.of(2026, 4, 30));

        resignationService.confirmResignation(dto);

        ArgumentCaptor<Employee> employeeCaptor = ArgumentCaptor.forClass(Employee.class);
        verify(employeeMapper, times(1)).updateById(employeeCaptor.capture());
        Employee updatedEmployee = employeeCaptor.getValue();

        assertEquals("RESIGNED", updatedEmployee.getEmployeeStatus());
        assertEquals(LocalDate.of(2026, 4, 30), updatedEmployee.getResignDate());
        assertEquals("COMPLETED", application.getStatus());
        assertEquals(LocalDate.of(2026, 4, 30), application.getActualDate());
        verify(resignationApplicationMapper, times(1)).updateById(application);
        verify(authServiceClient, times(1)).disableUser(9001L);
    }

    @Test
    void testConfirmResignationRejectsWhenDisableUserServiceReturnsNull() {
        ResignationApplication application = buildApplication();
        application.setStatus("APPROVED");
        Employee employee = buildEmployee();
        employee.setUserId(9001L);

        when(resignationApplicationMapper.selectById(41L)).thenReturn(application);
        when(resignationHandoverMapper.selectCount(any())).thenReturn(0L);
        when(employeeMapper.selectById(1L)).thenReturn(employee);
        when(authServiceClient.disableUser(9001L)).thenReturn(null);

        ResignationConfirmDTO dto = new ResignationConfirmDTO();
        dto.setApplicationId(41L);
        dto.setActualDate(LocalDate.of(2026, 4, 30));

        HrSystemException exception = assertThrows(
                HrSystemException.class,
                () -> resignationService.confirmResignation(dto)
        );

        assertTrue(exception.getMessage().contains("Auth 服务无响应"));
    }

    private Employee buildEmployee() {
        Employee employee = new Employee();
        employee.setId(1L);
        employee.setTenantId(2001L);
        employee.setEmployeeNo("EMP001");
        employee.setName("测试员工");
        employee.setEmployeeStatus("REGULAR");
        return employee;
    }

    private ResignationApplication buildApplication() {
        ResignationApplication application = new ResignationApplication();
        application.setId(41L);
        application.setTenantId(2001L);
        application.setApplicationNo("RS202603220001");
        application.setEmployeeId(1L);
        application.setResignationType("VOLUNTARY");
        application.setResignationReason("个人发展");
        application.setExpectedDate(LocalDate.of(2026, 4, 30));
        application.setStatus("DRAFT");
        return application;
    }
}
