package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.client.dto.UserCreateDTO;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.OnboardingApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.OnboardingConfirmDTO;
import com.cloudflow.hr.domain.dto.OnboardingTaskCompleteDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.OnboardingApplication;
import com.cloudflow.hr.domain.entity.OnboardingTask;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.CandidateMapper;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.OnboardingApplicationMapper;
import com.cloudflow.hr.mapper.OnboardingTaskMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.service.impl.OnboardingServiceImpl;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 入职主线功能测试。
 */
@ExtendWith(MockitoExtension.class)
class OnboardingServiceTest {

    @Mock
    private OnboardingApplicationMapper onboardingApplicationMapper;

    @Mock
    private OnboardingTaskMapper onboardingTaskMapper;

    @Mock
    private EmployeeMapper employeeMapper;

    @Mock
    private PositionMapper positionMapper;

    @Mock
    private CandidateMapper candidateMapper;

    @Mock
    private AuthServiceClient authServiceClient;

    @Mock
    private WorkflowServiceClient workflowServiceClient;

    @Mock
    private HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    @InjectMocks
    private OnboardingServiceImpl onboardingService;

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
     * 验证创建入职申请时会写入租户、标准化性别和草稿状态。
     */
    @Test
    void testCreateOnboardingApplicationSuccess() {
        OnboardingApplicationCreateDTO dto = new OnboardingApplicationCreateDTO();
        dto.setName("张三");
        dto.setGender("female");
        dto.setPhone("13800000000");
        dto.setEmail("zhangsan@test.com");
        dto.setDeptId(101L);
        dto.setPostId(201L);
        dto.setExpectedDate(LocalDate.of(2026, 4, 1));

        when(authServiceClient.getDeptById(101L)).thenReturn(R.ok(buildDept(101L, "技术部")));
        when(authServiceClient.getPostById(201L)).thenReturn(R.ok(buildPost(201L, "Java开发")));
        when(onboardingApplicationMapper.insert(any(OnboardingApplication.class))).thenAnswer(invocation -> {
            OnboardingApplication application = invocation.getArgument(0);
            application.setId(11L);
            return 1;
        });

        Long applicationId = onboardingService.createOnboardingApplication(dto);

        ArgumentCaptor<OnboardingApplication> captor = ArgumentCaptor.forClass(OnboardingApplication.class);
        verify(onboardingApplicationMapper, times(1)).insert(captor.capture());
        OnboardingApplication saved = captor.getValue();

        assertEquals(11L, applicationId);
        assertEquals(2001L, saved.getTenantId());
        assertEquals("FEMALE", saved.getGender());
        assertEquals("DRAFT", saved.getStatus());
        assertTrue(saved.getApplicationNo().startsWith("OB"));
    }

    /**
     * 验证提交入职申请时会启动工作流并更新流程实例信息。
     */
    @Test
    void testSubmitOnboardingApplicationSuccess() {
        OnboardingApplication application = buildApplication();
        when(onboardingApplicationMapper.selectById(11L)).thenReturn(application);
        when(workflowProcessKeyProperties.getOnboarding()).thenReturn("onboarding_approval");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-onboarding-001"));

        onboardingService.submitOnboardingApplication(11L);

        ArgumentCaptor<ProcessStartDTO> processCaptor = ArgumentCaptor.forClass(ProcessStartDTO.class);
        verify(workflowServiceClient, times(1)).startProcess(processCaptor.capture());
        ProcessStartDTO processStartDTO = processCaptor.getValue();

        assertEquals("onboarding_approval", processStartDTO.getProcessDefinitionKey());
        assertEquals("ONBOARDING", processStartDTO.getBusinessType());
        assertEquals(11L, processStartDTO.getBusinessId());
        assertEquals(1001L, processStartDTO.getStartUserId());

        Map<String, Object> variables = processStartDTO.getVariables();
        assertEquals("张三", variables.get("applicantName"));
        assertEquals(101L, variables.get("deptId"));
        assertEquals(201L, variables.get("postId"));
        assertEquals("2026-04-01", variables.get("expectedDate"));

        assertEquals("APPROVING", application.getStatus());
        assertEquals("proc-onboarding-001", application.getProcessInstanceId());
        verify(onboardingApplicationMapper, times(1)).updateById(application);
    }

    @Test
    void testSubmitOnboardingApplicationRejectsWhenWorkflowReturnsBlankProcessInstanceId() {
        OnboardingApplication application = buildApplication();
        when(onboardingApplicationMapper.selectById(11L)).thenReturn(application);
        when(workflowProcessKeyProperties.getOnboarding()).thenReturn("onboarding_approval");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok(""));

        HrSystemException exception = assertThrows(
                HrSystemException.class,
                () -> onboardingService.submitOnboardingApplication(11L)
        );

        assertTrue(exception.getMessage().contains("未返回流程实例ID"));
        verify(onboardingApplicationMapper, never()).updateById(any(OnboardingApplication.class));
    }

    /**
     * 验证审批通过后会生成标准入职任务清单。
     */
    @Test
    void testApproveOnboardingGeneratesTasks() {
        OnboardingApplication application = buildApplication();
        application.setStatus("APPROVING");
        when(onboardingApplicationMapper.selectById(11L)).thenReturn(application);

        onboardingService.approveOnboarding(11L);

        ArgumentCaptor<OnboardingTask> taskCaptor = ArgumentCaptor.forClass(OnboardingTask.class);
        verify(onboardingTaskMapper, times(4)).insert(taskCaptor.capture());
        List<OnboardingTask> tasks = taskCaptor.getAllValues();

        assertEquals("APPROVED", application.getStatus());
        assertEquals(4, tasks.size());
        assertTrue(tasks.stream().anyMatch(task -> "DOCUMENT".equals(task.getTaskType())));
        assertTrue(tasks.stream().anyMatch(task -> "ACCOUNT".equals(task.getTaskType())));
        assertTrue(tasks.stream().anyMatch(task -> "EQUIPMENT".equals(task.getTaskType())));
        assertTrue(tasks.stream().anyMatch(task -> "TRAINING".equals(task.getTaskType())));
    }

    /**
     * 验证完成账号开通任务时会调用认证服务创建账号。
     */
    @Test
    void testCompleteAccountTaskCreatesUser() {
        OnboardingTask task = new OnboardingTask();
        task.setId(21L);
        task.setApplicationId(11L);
        task.setTaskType("ACCOUNT");
        task.setStatus("PENDING");

        OnboardingApplication application = buildApplication();

        when(onboardingTaskMapper.selectById(21L)).thenReturn(task);
        when(onboardingApplicationMapper.selectById(11L)).thenReturn(application);
        when(authServiceClient.getUserByUserName("13800000000")).thenReturn(null);
        when(authServiceClient.createUser(any(UserCreateDTO.class))).thenReturn(R.ok(5001L));

        OnboardingTaskCompleteDTO dto = new OnboardingTaskCompleteDTO();
        dto.setTaskId(21L);
        dto.setRemark("账号已创建");

        onboardingService.completeOnboardingTask(dto);

        ArgumentCaptor<UserCreateDTO> userCaptor = ArgumentCaptor.forClass(UserCreateDTO.class);
        verify(authServiceClient, times(1)).createUser(userCaptor.capture());
        UserCreateDTO userCreateDTO = userCaptor.getValue();

        assertEquals("COMPLETED", task.getStatus());
        assertEquals("账号已创建", task.getRemark());
        assertNotNull(task.getCompletedTime());
        assertEquals("13800000000", userCreateDTO.getUserName());
        assertEquals("张三", userCreateDTO.getNickName());
        assertEquals(List.of(201L), userCreateDTO.getPostIds());
    }

    @Test
    void testConfirmOnboardingRejectsWhenCreateUserReturnsNullUserId() {
        OnboardingApplication application = buildApplication();
        application.setStatus("APPROVED");

        when(onboardingApplicationMapper.selectById(11L)).thenReturn(application);
        when(authServiceClient.getUserByUserName("13800000000")).thenReturn(null);
        when(authServiceClient.createUser(any(UserCreateDTO.class))).thenReturn(R.ok((Long) null));

        OnboardingConfirmDTO dto = new OnboardingConfirmDTO();
        dto.setApplicationId(11L);
        dto.setActualDate(LocalDate.of(2026, 4, 7));

        HrSystemException exception = assertThrows(
                HrSystemException.class,
                () -> onboardingService.confirmOnboarding(dto)
        );

        assertTrue(exception.getMessage().contains("未返回用户ID"));
        verify(employeeMapper, never()).insert(any(Employee.class));
    }

    /**
     * 验证确认入职后会创建员工档案并回写申请单状态。
     */
    @Test
    void testConfirmOnboardingCreatesEmployee() {
        OnboardingApplication application = buildApplication();
        application.setStatus("APPROVED");

        when(onboardingApplicationMapper.selectById(11L)).thenReturn(application);
        when(authServiceClient.getUserByUserName("13800000000")).thenReturn(null);
        when(authServiceClient.createUser(any(UserCreateDTO.class))).thenReturn(R.ok(5001L));
        when(employeeMapper.insert(any(Employee.class))).thenAnswer(invocation -> {
            Employee employee = invocation.getArgument(0);
            employee.setId(88L);
            return 1;
        });

        OnboardingConfirmDTO dto = new OnboardingConfirmDTO();
        dto.setApplicationId(11L);
        dto.setActualDate(LocalDate.of(2026, 4, 7));

        onboardingService.confirmOnboarding(dto);

        ArgumentCaptor<Employee> employeeCaptor = ArgumentCaptor.forClass(Employee.class);
        verify(employeeMapper, times(1)).insert(employeeCaptor.capture());
        Employee created = employeeCaptor.getValue();

        assertEquals("张三", created.getName());
        assertEquals("FEMALE", created.getGender());
        assertEquals("PROBATION", created.getEmployeeStatus());
        assertEquals(LocalDate.of(2026, 4, 7), created.getHireDate());
        assertTrue(created.getEmployeeNo().startsWith("EMP"));
        assertTrue(created.getEmployeeNo().length() > 20);

        assertEquals("ONBOARDED", application.getStatus());
        assertEquals(88L, application.getEmployeeId());
        verify(onboardingApplicationMapper, times(1)).updateById(application);
    }

    private OnboardingApplication buildApplication() {
        OnboardingApplication application = new OnboardingApplication();
        application.setId(11L);
        application.setTenantId(2001L);
        application.setApplicationNo("OB202603220001");
        application.setName("张三");
        application.setGender("FEMALE");
        application.setPhone("13800000000");
        application.setEmail("zhangsan@test.com");
        application.setDeptId(101L);
        application.setPostId(201L);
        application.setExpectedDate(LocalDate.of(2026, 4, 1));
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
}
