package com.cloudflow.workflow.service.impl;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.service.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 工作流服务门面类（Facade）
 * 
 * 重构说明：
 * 原 WorkflowServiceImpl 是一个 2000+ 行的上帝类，承担了所有工作流职责。
 * 参考 RuoYi-Cloud-Plus 的 8 个 Service 接口职责分离设计，现已拆分为：
 * 
 * 1. {@link INodeExecutionService} — 节点执行引擎（runNode、条件评估、人员分配、步骤提取）
 * 2. {@link IWfTaskService} — 任务操作（completeTask、rejectTask、getTodoTasks、readTask、urgeTask）
 * 3. {@link IWfInstanceService} — 实例管理（startProcess、recallProcess、pauseProcess、getProcessInstance）
 * 4. {@link IWfDefinitionService} — 定义管理（saveProcessDefinition、deployProcessDefinition）
 * 5. {@link IWfFormService} — 表单管理（saveFormDefinition、getFormDefinition）
 * 6. {@link ITaskStatisticsService} — 统计查询（已在之前拆分）
 * 
 * 本类作为门面保留 {@link IWorkflowService} 接口的实现，将所有调用委托给对应的子服务。
 * Controller 层无需修改，保持向后兼容。
 *
 * @author CloudFlow
 */
@Service
public class WorkflowServiceImpl implements IWorkflowService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowServiceImpl.class);

    /** 流程实例管理服务 */
    @Autowired
    private IWfInstanceService instanceService;

    /** 任务操作服务 */
    @Autowired
    private IWfTaskService taskService;

    /** 流程定义管理服务 */
    @Autowired
    private IWfDefinitionService definitionService;

    /** 表单管理服务 */
    @Autowired
    private IWfFormService formService;

    /** 统计查询服务 */
    @Autowired
    private ITaskStatisticsService taskStatisticsService;

    // ==================== 流程实例管理（委托给 IWfInstanceService） ====================

    @Override
    public R<?> startProcess(String processDefKey, String businessKey, Map<String, Object> variables) {
        return instanceService.startProcess(processDefKey, businessKey, variables);
    }

    @Override
    public R<?> recallProcess(String instanceId) {
        return instanceService.recallProcess(instanceId);
    }

    @Override
    public R<?> pauseProcess(String instanceId) {
        return instanceService.pauseProcess(instanceId);
    }

    @Override
    public R<?> resumeProcess(String instanceId) {
        return instanceService.resumeProcess(instanceId);
    }

    @Override
    public WfProcessInstance getProcessInstance(String instanceId) {
        return instanceService.getProcessInstance(instanceId);
    }

    @Override
    public Map<String, Object> getProcessTrace(String instanceId) {
        return instanceService.getProcessTrace(instanceId);
    }

    @Override
    public PageResult<WfProcessInstance> getMyInstances(Long userId, PageQuery pageQuery) {
        return instanceService.getMyInstances(userId, pageQuery);
    }

    @Override
    public void continueFromTimerNode(String instanceId, String nodeKey, Map<String, Object> variables) {
        instanceService.continueFromTimerNode(instanceId, nodeKey, variables);
    }

    // ==================== 任务操作（委托给 IWfTaskService） ====================

    @Override
    public R<?> completeTask(String taskId, String action, String comment, Map<String, Object> variables, String delegateUserId) {
        return taskService.completeTask(taskId, action, comment, variables, delegateUserId);
    }

    @Override
    public R<?> rejectTask(String taskId, String targetNodeKey, String comment) {
        return taskService.rejectTask(taskId, targetNodeKey, comment);
    }

    @Override
    public PageResult<WfTask> getTodoTasks(Long userId, PageQuery pageQuery) {
        return taskService.getTodoTasks(userId, pageQuery);
    }

    @Override
    public void readTask(String taskId, Long userId) {
        taskService.readTask(taskId, userId);
    }

    @Override
    public R<?> urgeTask(String taskId, String reason) {
        return taskService.urgeTask(taskId, reason);
    }

    // ==================== 流程定义管理（委托给 IWfDefinitionService） ====================

    @Override
    public R<?> saveProcessDefinition(WfProcessDefinition definition) {
        return definitionService.saveProcessDefinition(definition);
    }

    @Override
    public R<?> deployProcessDefinition(String definitionId) {
        return definitionService.deployProcessDefinition(definitionId);
    }

    @Override
    public R<?> deleteProcessDefinition(String definitionId) {
        return definitionService.deleteProcessDefinition(definitionId);
    }

    @Override
    public WfProcessDefinition getProcessDefinition(String definitionId) {
        return definitionService.getProcessDefinition(definitionId);
    }

    @Override
    public PageResult<WfProcessDefinition> listProcessDefinitions(PageQuery pageQuery) {
        return definitionService.listProcessDefinitions(pageQuery);
    }

    // ==================== 表单管理（委托给 IWfFormService） ====================

    @Override
    public R<?> saveFormDefinition(WfFormDefinition definition) {
        return formService.saveFormDefinition(definition);
    }

    @Override
    public WfFormDefinition getFormDefinition(String formId) {
        return formService.getFormDefinition(formId);
    }

    @Override
    public PageResult<WfFormDefinition> listFormDefinitions(PageQuery pageQuery) {
        return formService.listFormDefinitions(pageQuery);
    }

    // ==================== 统计查询（委托给 ITaskStatisticsService） ====================

    @Override
    public Map<String, Integer> getTasksCount(Long userId) {
        return taskStatisticsService.getTasksCount(userId);
    }

    @Override
    public Map<String, Object> getTaskStatistics(Long userId, LocalDateTime startTime, LocalDateTime endTime) {
        return taskStatisticsService.getTaskStatistics(userId, startTime, endTime);
    }

    @Override
    public Map<String, Object> getTaskGroups(Long userId) {
        return taskStatisticsService.getTaskGroups(userId);
    }
}
