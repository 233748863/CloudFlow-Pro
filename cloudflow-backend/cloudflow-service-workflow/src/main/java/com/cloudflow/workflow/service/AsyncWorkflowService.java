package com.cloudflow.workflow.service;

import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * P1-6: 异步流程启动服务
 * 
 * 将流程启动中耗时的节点解析和任务创建操作异步执行，
 * startProcess 同步返回实例ID后，由此服务异步完成后续流转。
 * 
 * 启动状态通过 Redis 存储，前端可通过轮询获取启动结果：
 * - PENDING: 正在启动
 * - SUCCESS: 启动成功
 * - FAILED: 启动失败（附带错误信息）
 * 
 * @author CloudFlow
 */
@Service
public class AsyncWorkflowService {

    private static final Logger log = LoggerFactory.getLogger(AsyncWorkflowService.class);

    private static final String ASYNC_STATUS_PREFIX = "sys:wf:async:status:";
    /** 兜底默认值：异步流程状态在 Redis 中的过期分钟数（实际值从 sys.workflow.asyncStatusExpire 读取） */
    private static final int DEFAULT_STATUS_EXPIRE_MINUTES = 10;

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private SysConfigHelper sysConfigHelper;

    private int statusExpireMinutes() {
        return sysConfigHelper.getConfigInt("sys.workflow.asyncStatusExpire", DEFAULT_STATUS_EXPIRE_MINUTES);
    }

    @Autowired
    private WfProcessDefinitionMapper processDefinitionMapper;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private WorkflowAuditService auditService;

    @Autowired
    private IWorkflowSagaService sagaService;
    @Autowired
    private WorkflowGraphModelResolver workflowGraphModelResolver;
    @Autowired
    private INodeExecutionService nodeExecutionService;

    /**
     * 异步执行流程节点解析和任务创建
     * 
     * @param instance 已创建的流程实例
     * @param def 流程定义
     * @param variables 流程变量
     * @param nodeRunner 节点执行回调
     */
    @Async("workflowExecutor")
    public void asyncStartProcessNodes(WfProcessInstance instance, WfProcessDefinition def,
                                        Map<String, Object> variables, NodeRunner nodeRunner) {
        String instanceId = instance.getInstanceId();
        log.info("[asyncStartProcessNodes] 异步启动流程节点, instanceId={}, processKey={}", 
            instanceId, instance.getProcessDefKey());

        // 设置状态为 PENDING
        setAsyncStatus(instanceId, "PENDING", null);

        try {
            if (!StringUtils.hasText(def.getModelJson())) {
                // 图模型为空时不执行节点，直接标记成功并返回
                log.warn("[asyncStartProcessNodes] 无模型JSON, instanceId={}", instanceId);
                setAsyncStatus(instanceId, "SUCCESS", null);
                return;
            }

            WfNodeConfig rootNode = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
            WorkflowRuntimeGraph runtimeGraph = workflowGraphModelResolver.resolveRuntimeGraph(rootNode);
            String firstNodeId = runtimeGraph != null
                    ? runtimeGraph.getFirstExecutableNodeId()
                    : workflowGraphModelResolver.resolveFirstExecutableNodeId(def.getModelJson());
            WfNodeConfig nextNode = StringUtils.hasText(firstNodeId)
                    ? nodeExecutionService.findNode(rootNode, firstNodeId)
                    : rootNode;
            if (nextNode == null) {
                throw WorkflowException.validationError("流程启动失败：未找到首个可执行节点");
            }

            // 执行节点（通过回调委托给调用方）
            nodeRunner.run(instance, nextNode, variables, 0, rootNode);

            // 标记成功
            setAsyncStatus(instanceId, "SUCCESS", null);
            log.info("[asyncStartProcessNodes] 异步启动成功, instanceId={}", instanceId);

        } catch (Exception e) {
            log.error("[asyncStartProcessNodes] 异步启动失败, instanceId={}, error={}", 
                instanceId, e.getMessage(), e);

            // Saga 补偿
            try {
                sagaService.compensate(instanceId, e.getMessage());
            } catch (Exception sagaEx) {
                log.error("[asyncStartProcessNodes] Saga补偿失败: {}", sagaEx.getMessage());
            }

            // 更新实例状态为失败
            try {
                instance.setStatus(WfProcessStatus.REJECTED.getCode());
                processInstanceMapper.updateById(instance);
            } catch (Exception updateEx) {
                log.error("[asyncStartProcessNodes] 更新实例状态失败: {}", updateEx.getMessage());
            }

            // 标记失败
            setAsyncStatus(instanceId, "FAILED", e.getMessage());
        }
    }

    /**
     * 查询异步启动状态
     * 
     * @param instanceId 流程实例ID
     * @return 状态信息 {status: "PENDING|SUCCESS|FAILED", error: "错误信息"}
     */
    public Map<String, String> getAsyncStartStatus(String instanceId) {
        String statusKey = ASYNC_STATUS_PREFIX + instanceId;
        String status = redisCache.getCacheObject(statusKey + ":status");
        String error = redisCache.getCacheObject(statusKey + ":error");

        Map<String, String> result = new java.util.HashMap<>();
        result.put("status", status != null ? status : "UNKNOWN");
        result.put("instanceId", instanceId);
        if (error != null) {
            result.put("error", error);
        }
        return result;
    }

    /**
     * 设置异步启动状态到 Redis
     */
    private void setAsyncStatus(String instanceId, String status, String error) {
        try {
            String statusKey = ASYNC_STATUS_PREFIX + instanceId;
            int expire = statusExpireMinutes();
            redisCache.setCacheObject(statusKey + ":status", status, expire, TimeUnit.MINUTES);
            if (error != null) {
                redisCache.setCacheObject(statusKey + ":error", error, expire, TimeUnit.MINUTES);
            }
        } catch (Exception e) {
            log.warn("[setAsyncStatus] 设置异步状态失败: {}", e.getMessage());
        }
    }

    /**
     * 清理异步状态（启动完成后前端确认后调用）
     */
    public void clearAsyncStatus(String instanceId) {
        try {
            String statusKey = ASYNC_STATUS_PREFIX + instanceId;
            redisCache.deleteObject(statusKey + ":status");
            redisCache.deleteObject(statusKey + ":error");
        } catch (Exception e) {
            log.warn("[clearAsyncStatus] 清理异步状态失败: {}", e.getMessage());
        }
    }

    /**
     * 节点执行回调接口
     * 由调用方实现，传递给异步服务
     */
    @FunctionalInterface
    public interface NodeRunner {
        void run(WfProcessInstance instance, WfNodeConfig node, 
                 Map<String, Object> variables, int depth, WfNodeConfig rootNode);
    }
}
