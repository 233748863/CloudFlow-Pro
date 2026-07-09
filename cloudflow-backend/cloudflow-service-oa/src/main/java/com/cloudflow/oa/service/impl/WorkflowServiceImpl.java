package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.domain.dto.WorkflowTaskCompleteDTO;
import com.cloudflow.oa.service.IWorkflowService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 工作流服务实现
 * 通过 Feign 远程调用工作流微服务
 */
@Slf4j
@Service
public class WorkflowServiceImpl implements IWorkflowService {

    @Autowired
    private RemoteWorkflowService remoteWorkflowService;

    @Override
    public R<?> startProcess(String processDefinitionKey, String businessKey, Map<String, Object> variables) {
        return startProcess(processDefinitionKey, businessKey, null, null, variables);
    }

    @Override
    public R<?> startProcess(String processDefinitionKey, String businessKey, Long startUserId,
                             String startUserName, Map<String, Object> variables) {
        try {
            if (startUserId != null) {
                InternalWorkflowStartDTO req = new InternalWorkflowStartDTO();
                req.setTenantId(requireCurrentTenantId());
                req.setProcessDefKey(processDefinitionKey);
                req.setBusinessKey(businessKey);
                req.setStartUserId(startUserId);
                req.setStartUserName(startUserName);
                req.setVariables(variables);
                R<?> result = remoteWorkflowService.startProcessInternal(req);
                log.info("工作流内部启动成功，流程定义Key: {}, 业务Key: {}, 发起人: {}",
                        processDefinitionKey, businessKey, startUserId);
                return result;
            }

            WorkflowProcessStartDTO req = new WorkflowProcessStartDTO();
            req.setTenantId(requireCurrentTenantId());
            req.setProcessDefKey(processDefinitionKey);
            req.setBusinessKey(businessKey);
            req.setVariables(variables);
            
            R<?> result = remoteWorkflowService.startProcess(req);
            log.info("工作流启动成功，流程定义Key: {}, 业务Key: {}", processDefinitionKey, businessKey);
            return result;
        } catch (Exception e) {
            log.error("工作流启动失败，流程定义Key: {}, 业务Key: {}", processDefinitionKey, businessKey, e);
            return R.fail("工作流启动失败: " + e.getMessage());
        }
    }

    @Override
    public R<?> completeTask(String taskId, Map<String, Object> variables) {
        try {
            WorkflowTaskCompleteDTO req = new WorkflowTaskCompleteDTO();
            req.setTaskId(taskId);
            req.setVariables(variables);
            
            R<?> result = remoteWorkflowService.completeTask(req);
            log.info("任务完成成功，任务ID: {}", taskId);
            return result;
        } catch (Exception e) {
            log.error("任务完成失败，任务ID: {}", taskId, e);
            return R.fail("任务完成失败: " + e.getMessage());
        }
    }

    private Long requireCurrentTenantId() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            throw new IllegalArgumentException("tenantId不能为空");
        }
        return tenantId;
    }

    @Override
    public R<String> getProcessStatus(String processInstanceId) {
        try {
            R<?> result = remoteWorkflowService.getProcessInstance(processInstanceId);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                // 从流程实例数据中提取状态
                Object data = result.getData();
                if (data instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> dataMap = (Map<String, Object>) data;
                    Object status = dataMap.get("status");
                    return R.ok(status != null ? String.valueOf(status) : "UNKNOWN");
                }
                return R.ok(String.valueOf(data));
            }
            return R.ok("UNKNOWN");
        } catch (Exception e) {
            log.error("查询流程状态失败，实例ID: {}", processInstanceId, e);
            return R.fail("查询流程状态失败: " + e.getMessage());
        }
    }
}
