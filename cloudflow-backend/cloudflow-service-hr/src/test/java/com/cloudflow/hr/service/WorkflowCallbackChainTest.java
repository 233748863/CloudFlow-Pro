package com.cloudflow.hr.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.domain.dto.OnboardingApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.ResignationApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.TransferApplicationCreateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.OnboardingApplication;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.entity.ResignationApplication;
import com.cloudflow.hr.domain.entity.TransferApplication;
import com.cloudflow.hr.mapper.CandidateMapper;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.OnboardingApplicationMapper;
import com.cloudflow.hr.mapper.OnboardingTaskMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.mapper.ResignationApplicationMapper;
import com.cloudflow.hr.mapper.ResignationHandoverMapper;
import com.cloudflow.hr.mapper.TransferApplicationMapper;
import com.cloudflow.hr.service.impl.OnboardingApprovalHandler;
import com.cloudflow.hr.service.impl.OnboardingServiceImpl;
import com.cloudflow.hr.service.impl.ResignationApprovalHandler;
import com.cloudflow.hr.service.impl.ResignationServiceImpl;
import com.cloudflow.hr.service.impl.TransferApprovalHandler;
import com.cloudflow.hr.service.impl.TransferServiceImpl;
import com.cloudflow.hr.service.impl.WorkflowCallbackServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 工作流回调串联测试。
 * 验证“发起审批 -> workflow 回调 -> HR 状态更新”主链路。
 */
@ExtendWith(MockitoExtension.class)
class WorkflowCallbackChainTest {

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
    private TransferApplicationMapper transferApplicationMapper;

    @Mock
    private ResignationApplicationMapper resignationApplicationMapper;

    @Mock
    private ResignationHandoverMapper resignationHandoverMapper;

    @Mock
    private AuthServiceClient authServiceClient;

    @Mock
    private WorkflowServiceClient workflowServiceClient;

    @Mock
    private HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    @Mock
    private ObjectMapper objectMapper;

    private OnboardingService onboardingService;
    private TransferService transferService;
    private ResignationService resignationService;
    private WorkflowCallbackServiceImpl workflowCallbackService;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(1001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(2001L);

        onboardingService = new OnboardingServiceImpl(
                onboardingApplicationMapper,
                onboardingTaskMapper,
                employeeMapper,
                positionMapper,
                candidateMapper,
                authServiceClient,
                workflowServiceClient,
                workflowProcessKeyProperties
        );
        transferService = new TransferServiceImpl(
                transferApplicationMapper,
                employeeMapper,
                positionMapper,
                authServiceClient,
                workflowServiceClient,
                workflowProcessKeyProperties
        );
        resignationService = new ResignationServiceImpl(
                resignationApplicationMapper,
                resignationHandoverMapper,
                employeeMapper,
                authServiceClient,
                workflowServiceClient,
                workflowProcessKeyProperties,
                objectMapper
        );

        workflowCallbackService = new WorkflowCallbackServiceImpl();
        injectHandlers(workflowCallbackService, List.of(
                new OnboardingApprovalHandler(onboardingService),
                new TransferApprovalHandler(transferService),
                new ResignationApprovalHandler(resignationService)
        ));
        workflowCallbackService.init();

        when(workflowServiceClient.startProcess(any())).thenReturn(R.ok("proc-chain-001"));
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    /**
     * 验证入职流程从发起到审批回调通过的完整链路。
     */
    @Test
    void testOnboardingWorkflowApprovedChain() {
        AtomicReference<OnboardingApplication> stored = new AtomicReference<>();
        when(authServiceClient.getDeptById(101L)).thenReturn(R.ok(buildDept(101L, "技术部")));
        when(authServiceClient.getPostById(201L)).thenReturn(R.ok(buildPost(201L, "Java开发")));
        when(workflowProcessKeyProperties.getOnboarding()).thenReturn("onboarding_approval");
        when(onboardingApplicationMapper.insert(any(OnboardingApplication.class))).thenAnswer(invocation -> {
            OnboardingApplication application = invocation.getArgument(0);
            application.setId(1011L);
            stored.set(application);
            return 1;
        });
        when(onboardingApplicationMapper.selectById(1011L)).thenAnswer(invocation -> stored.get());

        OnboardingApplicationCreateDTO dto = new OnboardingApplicationCreateDTO();
        dto.setName("张三");
        dto.setGender("MALE");
        dto.setPhone("13800000000");
        dto.setEmail("zhangsan@test.com");
        dto.setDeptId(101L);
        dto.setPostId(201L);
        dto.setExpectedDate(LocalDate.of(2026, 4, 1));

        Long businessId = onboardingService.createOnboardingApplication(dto);
        onboardingService.submitOnboardingApplication(businessId);
        workflowCallbackService.handleApprovalResult(buildApprovalDto("ONBOARDING", businessId, "APPROVED"));

        assertEquals("APPROVED", stored.get().getStatus());
        assertEquals("proc-chain-001", stored.get().getProcessInstanceId());
        verify(onboardingTaskMapper, times(4)).insert(any(com.cloudflow.hr.domain.entity.OnboardingTask.class));
    }

    /**
     * 验证调岗流程从提交到审批驳回的完整链路。
     */
    @Test
    void testTransferWorkflowRejectedChain() {
        AtomicReference<TransferApplication> stored = new AtomicReference<>();
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(authServiceClient.getDeptById(102L)).thenReturn(R.ok(buildDept(102L, "产品部")));
        when(authServiceClient.getPostById(202L)).thenReturn(R.ok(buildPost(202L, "产品经理")));
        when(positionMapper.selectById(302L)).thenReturn(buildPosition(302L, "高级产品经理"));
        when(transferApplicationMapper.selectCount(any())).thenReturn(0L);
        when(workflowProcessKeyProperties.getTransfer()).thenReturn("transfer_approval");
        when(transferApplicationMapper.insert(any(TransferApplication.class))).thenAnswer(invocation -> {
            TransferApplication application = invocation.getArgument(0);
            application.setId(2031L);
            stored.set(application);
            return 1;
        });
        when(transferApplicationMapper.selectById(2031L)).thenAnswer(invocation -> stored.get());

        TransferApplicationCreateDTO dto = new TransferApplicationCreateDTO();
        dto.setEmployeeId(1L);
        dto.setToDeptId(102L);
        dto.setToPostId(202L);
        dto.setToPositionId(302L);
        dto.setTransferType("PROMOTION");
        dto.setReason("组织调整");
        dto.setEffectiveDate(LocalDate.of(2026, 4, 1));
        dto.setSalaryChange(Boolean.TRUE);

        Long businessId = transferService.createTransferApplication(dto);
        transferService.submitTransferApplication(businessId);
        workflowCallbackService.handleApprovalResult(buildApprovalDto("TRANSFER", businessId, "REJECTED"));

        assertEquals("REJECTED", stored.get().getStatus());
        assertEquals("proc-chain-001", stored.get().getProcessInstanceId());
    }

    /**
     * 验证离职流程从提交到审批通过生成交接清单的完整链路。
     */
    @Test
    void testResignationWorkflowApprovedChain() {
        AtomicReference<ResignationApplication> stored = new AtomicReference<>();
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(resignationApplicationMapper.selectCount(any())).thenReturn(0L);
        when(workflowProcessKeyProperties.getResignation()).thenReturn("resignation_approval");
        when(resignationApplicationMapper.insert(any(ResignationApplication.class))).thenAnswer(invocation -> {
            ResignationApplication application = invocation.getArgument(0);
            application.setId(3041L);
            stored.set(application);
            return 1;
        });
        when(resignationApplicationMapper.selectById(3041L)).thenAnswer(invocation -> stored.get());

        ResignationApplicationCreateDTO dto = new ResignationApplicationCreateDTO();
        dto.setEmployeeId(1L);
        dto.setResignationType("VOLUNTARY");
        dto.setResignationReason("个人发展");
        dto.setExpectedDate(LocalDate.of(2026, 4, 30));

        Long businessId = resignationService.createResignationApplication(dto);
        resignationService.submitResignationApplication(businessId);
        workflowCallbackService.handleApprovalResult(buildApprovalDto("RESIGNATION", businessId, "APPROVED"));

        assertEquals("APPROVED", stored.get().getStatus());
        assertEquals("proc-chain-001", stored.get().getProcessInstanceId());
        verify(resignationHandoverMapper, times(4)).insert(any(com.cloudflow.hr.domain.entity.ResignationHandover.class));
    }

    private ApprovalResultDTO buildApprovalDto(String businessType, Long businessId, String result) {
        ApprovalResultDTO dto = new ApprovalResultDTO();
        dto.setTenantId(2001L);
        dto.setProcessInstanceId("proc-chain-001");
        dto.setBusinessType(businessType);
        dto.setBusinessId(businessId);
        dto.setApprovalResult(result);
        dto.setApprovalComment("workflow callback");
        return dto;
    }

    private void injectHandlers(WorkflowCallbackServiceImpl callbackService, List<ApprovalResultHandler> handlers) {
        try {
            Field handlersField = WorkflowCallbackServiceImpl.class.getDeclaredField("handlers");
            handlersField.setAccessible(true);
            handlersField.set(callbackService, handlers);
        } catch (Exception e) {
            throw new IllegalStateException("注入 workflow handlers 失败", e);
        }
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
