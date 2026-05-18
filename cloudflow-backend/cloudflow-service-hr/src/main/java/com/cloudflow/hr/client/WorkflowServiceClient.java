package com.cloudflow.hr.client;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.client.dto.WorkflowInvalidateRequest;
import com.cloudflow.hr.client.dto.WorkflowStartRequest;
import com.cloudflow.hr.client.fallback.WorkflowServiceFallback;
import com.cloudflow.hr.client.vo.ProcessInstanceVO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.HashMap;
import java.util.Map;

/**
 * Workflow 服务 Feign 客户端。
 * HR 通过该适配层调用 workflow 公共接口，避免依赖 workflow 的 HR 专属接口。
 */
@FeignClient(
        name = "cloudflow-service-workflow",
        fallback = WorkflowServiceFallback.class
)
public interface WorkflowServiceClient {

    /**
     * 适配 HR 内部发起审批的 DTO。
     *
     * @param dto HR 侧流程发起参数
     * @return 流程实例ID
     */
    default R<String> startProcess(ProcessStartDTO dto) {
        if (dto == null || dto.getProcessDefinitionKey() == null || dto.getProcessDefinitionKey().isBlank()) {
            return R.fail("流程定义Key不能为空");
        }
        if (dto.getBusinessType() == null || dto.getBusinessType().isBlank() || dto.getBusinessId() == null) {
            return R.fail("业务标识不完整，无法启动流程");
        }

        Map<String, Object> variables = dto.getVariables() == null
                ? new HashMap<>()
                : new HashMap<>(dto.getVariables());
        if (dto.getProcessTitle() != null && !dto.getProcessTitle().isBlank()) {
            variables.put("_title", dto.getProcessTitle());
        }
        variables.put("tenantId", dto.getTenantId());
        variables.put("businessType", dto.getBusinessType());
        variables.put("businessId", dto.getBusinessId());
        variables.put("businessNo", dto.getBusinessNo());
        variables.put("startUserId", dto.getStartUserId());
        variables.put("callbackStreamKey", "workflow:stream:approval-callback:hr");

        WorkflowStartRequest request = new WorkflowStartRequest();
        request.setProcessDefKey(dto.getProcessDefinitionKey());
        request.setBusinessKey(dto.getBusinessType() + ":" + dto.getBusinessId());
        request.setVariables(variables);

        R<Map<String, String>> response = startProcessInternal(request);
        if (response == null) {
            return R.fail("Workflow 服务无响应");
        }
        if (!response.isSuccess()) {
            return R.fail(response.getMsg());
        }

        Map<String, String> data = response.getData();
        String instanceId = data != null ? data.get("instanceId") : null;
        if (instanceId == null || instanceId.isBlank()) {
            return R.fail("Workflow 服务未返回流程实例ID");
        }
        return R.ok(instanceId);
    }

    /**
     * workflow 原生启动接口
     */
    @PostMapping("/start")
    R<Map<String, String>> startProcessInternal(@RequestBody WorkflowStartRequest request);

    /**
     * 查询流程实例
     */
    @GetMapping("/instance/{processInstanceId}")
    R<ProcessInstanceVO> getProcessInstance(@PathVariable("processInstanceId") String processInstanceId);

    /**
     * 适配 workflow 作废接口
     */
    default R<Void> cancelProcess(String processInstanceId) {
        WorkflowInvalidateRequest request = new WorkflowInvalidateRequest();
        request.setInstanceId(processInstanceId);
        request.setReason("HR 服务发起撤销");
        R<?> response = invalidateProcess(request);
        if (response != null && response.isSuccess()) {
            return R.ok();
        }
        return R.fail(response != null ? response.getMsg() : "Workflow 服务无响应");
    }

    @PostMapping("/enhance/instance/invalidate")
    R<?> invalidateProcess(@RequestBody WorkflowInvalidateRequest request);
}
