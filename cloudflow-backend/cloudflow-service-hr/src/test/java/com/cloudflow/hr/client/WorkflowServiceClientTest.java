package com.cloudflow.hr.client;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.client.fallback.WorkflowServiceFallback;
import com.cloudflow.hr.client.vo.ProcessInstanceVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("Workflow 服务客户端测试")
class WorkflowServiceClientTest {

    @Mock
    private WorkflowServiceClient workflowServiceClient;

    private WorkflowServiceFallback workflowServiceFallback;
    private ProcessStartDTO processStartDTO;
    private String processInstanceId;

    @BeforeEach
    void setUp() {
        workflowServiceFallback = new WorkflowServiceFallback();
        processInstanceId = "process-instance-12345";

        processStartDTO = new ProcessStartDTO();
        processStartDTO.setProcessDefinitionKey("onboarding_approval");
        processStartDTO.setBusinessType("ONBOARDING");
        processStartDTO.setBusinessId(1L);
        processStartDTO.setProcessTitle("张三-入职申请");

        Map<String, Object> variables = new HashMap<>();
        variables.put("applicantName", "张三");
        variables.put("deptName", "技术部");
        processStartDTO.setVariables(variables);
    }

    @Test
    @DisplayName("启动流程成功")
    void testStartProcessSuccess() {
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok(processInstanceId));

        R<String> result = workflowServiceClient.startProcess(processStartDTO);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isEqualTo(processInstanceId);
    }

    @Test
    @DisplayName("启动流程降级返回失败")
    void testStartProcessFallback() {
        R<String> result = workflowServiceFallback.startProcess(processStartDTO);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getMsg()).contains("工作流服务");
        assertThat(result.getMsg()).contains("稍后重试");
    }

    @Test
    @DisplayName("查询流程实例成功")
    void testGetProcessInstanceSuccess() {
        ProcessInstanceVO processInstance = new ProcessInstanceVO();
        processInstance.setProcessInstanceId(processInstanceId);
        processInstance.setBusinessType("ONBOARDING");
        processInstance.setBusinessId(1L);
        processInstance.setProcessTitle("张三-入职申请");
        processInstance.setStatus("RUNNING");
        processInstance.setCurrentNodeName("部门经理审批");

        when(workflowServiceClient.getProcessInstance(anyString())).thenReturn(R.ok(processInstance));

        R<ProcessInstanceVO> result = workflowServiceClient.getProcessInstance(processInstanceId);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().getProcessInstanceId()).isEqualTo(processInstanceId);
        assertThat(result.getData().getCurrentNodeName()).isEqualTo("部门经理审批");
    }

    @Test
    @DisplayName("查询流程实例不存在")
    void testGetProcessInstanceNotFound() {
        when(workflowServiceClient.getProcessInstance(anyString())).thenReturn(R.fail("流程实例不存在"));

        R<ProcessInstanceVO> result = workflowServiceClient.getProcessInstance("missing");

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getMsg()).contains("不存在");
    }

    @Test
    @DisplayName("查询流程实例降级返回失败")
    void testGetProcessInstanceFallback() {
        R<ProcessInstanceVO> result = workflowServiceFallback.getProcessInstance(processInstanceId);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getMsg()).contains("工作流服务");
    }

    @Test
    @DisplayName("撤销流程成功")
    void testCancelProcessSuccess() {
        when(workflowServiceClient.cancelProcess(anyString())).thenReturn(R.ok());

        R<Void> result = workflowServiceClient.cancelProcess(processInstanceId);

        assertThat(result.isSuccess()).isTrue();
    }

    @Test
    @DisplayName("撤销流程降级返回失败")
    void testCancelProcessFallback() {
        R<Void> result = workflowServiceFallback.cancelProcess(processInstanceId);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getMsg()).contains("工作流服务");
        assertThat(result.getMsg()).contains("稍后重试");
    }
}
