package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.TransferApplicationCreateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.entity.TransferApplication;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.mapper.TransferApplicationMapper;
import com.cloudflow.hr.service.impl.TransferServiceImpl;
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
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 调岗主线功能测试。
 */
@ExtendWith(MockitoExtension.class)
class TransferServiceTest {

    @Mock
    private TransferApplicationMapper transferApplicationMapper;

    @Mock
    private EmployeeMapper employeeMapper;

    @Mock
    private PositionMapper positionMapper;

    @Mock
    private AuthServiceClient authServiceClient;

    @Mock
    private WorkflowServiceClient workflowServiceClient;

    @Mock
    private HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    @InjectMocks
    private TransferServiceImpl transferService;

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
     * 验证创建调岗申请时会落原组织信息和草稿状态。
     */
    @Test
    void testCreateTransferApplicationSuccess() {
        TransferApplicationCreateDTO dto = new TransferApplicationCreateDTO();
        dto.setEmployeeId(1L);
        dto.setToDeptId(102L);
        dto.setToPostId(202L);
        dto.setToPositionId(302L);
        dto.setTransferType("PROMOTION");
        dto.setReason("组织调整");
        dto.setEffectiveDate(LocalDate.of(2026, 4, 1));
        dto.setSalaryChange(Boolean.TRUE);

        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(authServiceClient.getDeptById(102L)).thenReturn(R.ok(buildDept(102L, "产品部")));
        when(authServiceClient.getPostById(202L)).thenReturn(R.ok(buildPost(202L, "产品经理")));
        when(positionMapper.selectById(302L)).thenReturn(buildPosition(302L, "高级产品经理"));
        when(transferApplicationMapper.selectCount(any())).thenReturn(0L);
        when(transferApplicationMapper.insert(any(TransferApplication.class))).thenAnswer(invocation -> {
            TransferApplication application = invocation.getArgument(0);
            application.setId(31L);
            return 1;
        });

        Long applicationId = transferService.createTransferApplication(dto);

        ArgumentCaptor<TransferApplication> captor = ArgumentCaptor.forClass(TransferApplication.class);
        verify(transferApplicationMapper, times(1)).insert(captor.capture());
        TransferApplication saved = captor.getValue();

        assertEquals(31L, applicationId);
        assertEquals(101L, saved.getFromDeptId());
        assertEquals(201L, saved.getFromPostId());
        assertEquals(301L, saved.getFromPositionId());
        assertEquals("DRAFT", saved.getStatus());
        assertTrue(saved.getApplicationNo().startsWith("TR"));
    }

    /**
     * 验证提交调岗申请时会启动流程并写回审批状态。
     */
    @Test
    void testSubmitTransferApplicationSuccess() {
        TransferApplication application = buildTransferApplication();
        when(transferApplicationMapper.selectById(31L)).thenReturn(application);
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(workflowProcessKeyProperties.getTransfer()).thenReturn("transfer_approval");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-transfer-001"));

        transferService.submitTransferApplication(31L);

        ArgumentCaptor<ProcessStartDTO> processCaptor = ArgumentCaptor.forClass(ProcessStartDTO.class);
        verify(workflowServiceClient, times(1)).startProcess(processCaptor.capture());
        ProcessStartDTO processStartDTO = processCaptor.getValue();

        assertEquals("transfer_approval", processStartDTO.getProcessDefinitionKey());
        assertEquals("TRANSFER", processStartDTO.getBusinessType());
        assertEquals(31L, processStartDTO.getBusinessId());
        assertEquals(1001L, processStartDTO.getStartUserId());

        Map<String, Object> variables = processStartDTO.getVariables();
        assertEquals("测试员工", variables.get("employeeName"));
        assertEquals("EMP001", variables.get("employeeNo"));
        assertEquals(101L, variables.get("fromDeptId"));
        assertEquals(102L, variables.get("toDeptId"));
        assertEquals("PROMOTION", variables.get("transferType"));
        assertEquals("2026-03-22", variables.get("effectiveDate"));
        assertEquals(Boolean.TRUE, variables.get("salaryChange"));

        assertEquals("APPROVING", application.getStatus());
        assertEquals("proc-transfer-001", application.getProcessInstanceId());
        verify(transferApplicationMapper, times(1)).updateById(application);
    }

    /**
     * 验证审批通过且生效日期已到时，会立即更新员工组织信息。
     */
    @Test
    void testApproveTransferEffectiveImmediately() {
        TransferApplication application = buildTransferApplication();
        application.setStatus("APPROVING");
        application.setEffectiveDate(LocalDate.now());

        Employee employee = buildEmployee();
        when(transferApplicationMapper.selectById(31L)).thenReturn(application);
        when(employeeMapper.selectById(1L)).thenReturn(employee);

        transferService.approveTransfer(31L);

        ArgumentCaptor<Employee> employeeCaptor = ArgumentCaptor.forClass(Employee.class);
        verify(employeeMapper, times(1)).updateById(employeeCaptor.capture());
        Employee updatedEmployee = employeeCaptor.getValue();

        assertEquals(102L, updatedEmployee.getDeptId());
        assertEquals(202L, updatedEmployee.getPostId());
        assertEquals(302L, updatedEmployee.getPositionId());
        assertEquals("EFFECTIVE", application.getStatus());
        verify(transferApplicationMapper, times(2)).updateById(application);
    }

    /**
     * 验证审批拒绝会把申请状态改为已拒绝。
     */
    @Test
    void testRejectTransferSuccess() {
        TransferApplication application = buildTransferApplication();
        application.setStatus("APPROVING");
        when(transferApplicationMapper.selectById(31L)).thenReturn(application);

        transferService.rejectTransfer(31L);

        assertEquals("REJECTED", application.getStatus());
        verify(transferApplicationMapper, times(1)).updateById(application);
    }

    private Employee buildEmployee() {
        Employee employee = new Employee();
        employee.setId(1L);
        employee.setTenantId(2001L);
        employee.setEmployeeNo("EMP001");
        employee.setName("测试员工");
        employee.setDeptId(101L);
        employee.setPostId(201L);
        employee.setPositionId(301L);
        employee.setEmployeeStatus("REGULAR");
        return employee;
    }

    private TransferApplication buildTransferApplication() {
        TransferApplication application = new TransferApplication();
        application.setId(31L);
        application.setTenantId(2001L);
        application.setApplicationNo("TR202603220001");
        application.setEmployeeId(1L);
        application.setFromDeptId(101L);
        application.setFromPostId(201L);
        application.setFromPositionId(301L);
        application.setToDeptId(102L);
        application.setToPostId(202L);
        application.setToPositionId(302L);
        application.setTransferType("PROMOTION");
        application.setReason("组织调整");
        application.setEffectiveDate(LocalDate.of(2026, 3, 22));
        application.setSalaryChange(Boolean.TRUE);
        application.setStatus("DRAFT");
        return application;
    }

    private DeptVO buildDept(Long deptId, String deptName) {
        DeptVO dept = new DeptVO();
        dept.setDeptId(deptId);
        dept.setDeptName(deptName);
        return dept;
    }

    private PostVO buildPost(Long postId, String postName) {
        PostVO post = new PostVO();
        post.setPostId(postId);
        post.setPostName(postName);
        return post;
    }

    private Position buildPosition(Long positionId, String positionName) {
        Position position = new Position();
        position.setId(positionId);
        position.setPositionName(positionName);
        return position;
    }
}
