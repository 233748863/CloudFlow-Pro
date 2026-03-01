package com.cloudflow.workflow.util;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.dto.SafetyCheckResultDTO;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 批量操作安全检查工具类
 * 检查流程是否可以安全地执行归档、删除等操作
 * 
 * @author CloudFlow
 */
@Slf4j
@Component
public class SafetyChecker {

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    // TODO: 注入流程实例服务，用于检查运行中的实例
    // @Autowired
    // private IProcessInstanceService instanceService;

    /**
     * 检查流程是否可以安全执行批量操作
     * 
     * @param workflowIds 流程 ID 列表
     * @return 安全检查结果
     */
    public SafetyCheckResultDTO checkSafety(List<String> workflowIds) {
        log.info("开始安全检查, workflowCount={}", workflowIds.size());

        SafetyCheckResultDTO result = SafetyCheckResultDTO.builder()
            .safe(true)
            .build();

        // 1. 检查流程是否存在
        checkWorkflowsExist(workflowIds, result);

        // 2. 检查是否有正在运行的实例
        checkRunningInstances(workflowIds, result);

        // 3. 检查依赖关系
        checkDependencies(workflowIds, result);

        // 4. 检查权限
        checkPermissions(workflowIds, result);

        // 生成总体消息
        generateMessage(result);

        log.info("安全检查完成, safe={}, warnings={}, errors={}", 
            result.getSafe(), result.getWarnings().size(), result.getErrors().size());

        return result;
    }

    /**
     * 检查流程是否存在
     */
    private void checkWorkflowsExist(List<String> workflowIds, SafetyCheckResultDTO result) {
        for (String workflowId : workflowIds) {
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            if (definition == null) {
                result.getErrors().add("流程不存在: " + workflowId);
                result.getDetails().put(workflowId, "流程不存在");
                result.setSafe(false);
            }
        }
    }

    /**
     * 检查是否有正在运行的实例
     */
    private void checkRunningInstances(List<String> workflowIds, SafetyCheckResultDTO result) {
        // TODO: 实现运行实例检查
        // 当前简化实现，假设没有运行实例
        
        /*
        for (String workflowId : workflowIds) {
            // 查询正在运行的实例数量
            long runningCount = instanceService.countRunningInstances(workflowId);
            
            if (runningCount > 0) {
                result.getWorkflowsWithRunningInstances().add(workflowId);
                result.getWarnings().add(
                    String.format("流程 %s 有 %d 个正在运行的实例", workflowId, runningCount)
                );
                result.getDetails().put(workflowId, 
                    String.format("有 %d 个正在运行的实例", runningCount));
            }
        }
        */
        
        log.debug("运行实例检查完成（当前为简化实现）");
    }

    /**
     * 检查依赖关系
     */
    private void checkDependencies(List<String> workflowIds, SafetyCheckResultDTO result) {
        // TODO: 实现依赖关系检查
        // 检查是否有其他流程引用这些流程
        // 检查是否有定时任务关联这些流程
        
        /*
        for (String workflowId : workflowIds) {
            // 检查是否有子流程引用
            List<String> referencingWorkflows = findReferencingWorkflows(workflowId);
            
            if (!referencingWorkflows.isEmpty()) {
                result.getWorkflowsWithDependencies().add(workflowId);
                result.getWarnings().add(
                    String.format("流程 %s 被 %d 个其他流程引用", 
                        workflowId, referencingWorkflows.size())
                );
                result.getDetails().put(workflowId, 
                    "被其他流程引用: " + String.join(", ", referencingWorkflows));
            }
        }
        */
        
        log.debug("依赖关系检查完成（当前为简化实现）");
    }

    /**
     * 检查权限
     */
    private void checkPermissions(List<String> workflowIds, SafetyCheckResultDTO result) {
        // 获取当前用户信息
        Long currentUserId = UserContext.getUserId();
        Long currentTenantId = UserContext.getTenantId();
        
        if (currentUserId == null) {
            result.getErrors().add("无法获取当前用户信息");
            result.setSafe(false);
            return;
        }

        for (String workflowId : workflowIds) {
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            
            if (definition == null) {
                continue; // 已在存在性检查中处理
            }

            // 检查租户权限
            if (currentTenantId != null && definition.getTenantId() != null) {
                if (!currentTenantId.equals(definition.getTenantId())) {
                    result.getWorkflowsWithoutPermission().add(workflowId);
                    result.getErrors().add("无权操作流程: " + workflowId + "（不同租户）");
                    result.getDetails().put(workflowId, "无权操作（不同租户）");
                    result.setSafe(false);
                    continue;
                }
            }

            // TODO: 检查更细粒度的权限
            // 例如：只有流程创建者或管理员可以删除流程
            /*
            String createdBy = definition.getCreateBy();
            boolean isCreator = currentUserId.toString().equals(createdBy);
            boolean isAdmin = hasAdminRole();
            
            if (!isCreator && !isAdmin) {
                result.getWorkflowsWithoutPermission().add(workflowId);
                result.getErrors().add("无权操作流程: " + workflowId);
                result.getDetails().put(workflowId, "无权操作（非创建者或管理员）");
                result.setSafe(false);
            }
            */
        }
    }

    /**
     * 生成总体消息
     */
    private void generateMessage(SafetyCheckResultDTO result) {
        if (result.getSafe()) {
            if (result.getWarnings().isEmpty()) {
                result.setMessage("安全检查通过，可以执行操作");
            } else {
                result.setMessage(
                    String.format("安全检查通过，但有 %d 个警告，建议谨慎操作", 
                        result.getWarnings().size())
                );
            }
        } else {
            result.setMessage(
                String.format("安全检查失败，有 %d 个错误，无法执行操作", 
                    result.getErrors().size())
            );
        }
    }

    /**
     * 检查单个流程的安全性
     */
    public SafetyCheckResultDTO checkSafety(String workflowId) {
        List<String> workflowIds = new ArrayList<>();
        workflowIds.add(workflowId);
        return checkSafety(workflowIds);
    }
}
