package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.service.IWorkflowSagaService;

import java.time.LocalDateTime;
import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * G.2: 事务补偿机制（Saga模式）
 * 当流程执行失败时，自动回滚已执行的步骤
 */
@Service
public class WorkflowSagaServiceImpl implements IWorkflowSagaService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowSagaServiceImpl.class);
    private static final String SAGA_LOG_PREFIX = "sys:wf:saga:";

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private WfTaskMapper taskMapper;

    @Autowired
    private WfTaskHistoryMapper taskHistoryMapper;

    @Autowired
    private RedisCache redisCache;

    /**
     * 记录 Saga 步骤（用于后续补偿）
     */
    public void recordSagaStep(String instanceId, String stepId, String stepType, String data) {
        String key = SAGA_LOG_PREFIX + instanceId;
        Map<String, String> step = new HashMap<>();
        step.put("stepId", stepId);
        step.put("stepType", stepType);
        step.put("data", data);
        step.put("timestamp", String.valueOf(System.currentTimeMillis()));

        try {
            List<Map<String, String>> steps = redisCache.getCacheObject(key);
            if (steps == null) {
                steps = new ArrayList<>();
            }
            steps.add(step);
            redisCache.setCacheObject(key, steps);
            log.debug("[recordSagaStep] 记录Saga步骤, instanceId={}, stepId={}, stepType={}", instanceId, stepId, stepType);
        } catch (Exception e) {
            log.warn("[recordSagaStep] 记录Saga步骤失败: {}", e.getMessage());
        }
    }

    /**
     * 执行补偿（回滚）
     * 当流程执行失败时调用
     */
    @Transactional(rollbackFor = Exception.class)
    public void compensate(String instanceId, String reason) {
        log.info("[compensate] 开始执行Saga补偿, instanceId={}, reason={}", instanceId, reason);

        try {
            // 1. 删除该实例的所有活动任务
            taskMapper.delete(
                new LambdaQueryWrapper<WfTask>()
                    .eq(WfTask::getInstanceId, instanceId)
            );
            log.info("[compensate] 已清理活动任务, instanceId={}", instanceId);

            // 2. 更新实例状态为 FAILED
            WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
            if (instance != null) {
                instance.setStatus("FAILED");
                instance.setEndTime(LocalDateTime.now());
                processInstanceMapper.updateById(instance);
                log.info("[compensate] 实例状态已更新为FAILED, instanceId={}", instanceId);
            }

            // 3. 记录补偿历史
            WfTaskHistory compensationHistory = new WfTaskHistory();
            compensationHistory.setHistoryId(UUID.randomUUID().toString());
            compensationHistory.setInstanceId(instanceId);
            compensationHistory.setNodeName("系统补偿");
            compensationHistory.setNodeKey("SAGA_COMPENSATION");
            compensationHistory.setAction("COMPENSATE");
            compensationHistory.setComment("Saga补偿: " + reason);
            compensationHistory.setOperatorId(0L);
            compensationHistory.setOperatorName("SYSTEM");
            compensationHistory.setCreateTime(LocalDateTime.now());
            taskHistoryMapper.insert(compensationHistory);

            // 4. 清理 Redis 中的 Saga 日志
            cleanupSagaLog(instanceId);

            // 5. 清理 Redis 中的并行网关数据
            cleanupParallelGatewayData(instanceId);

            log.info("[compensate] Saga补偿完成, instanceId={}", instanceId);

        } catch (Exception e) {
            log.error("[compensate] Saga补偿执行失败, instanceId={}, error={}", instanceId, e.getMessage(), e);
            throw e;
        }
    }

    /**
     * 清理 Saga 日志
     */
    public void cleanupSagaLog(String instanceId) {
        try {
            redisCache.deleteObject(SAGA_LOG_PREFIX + instanceId);
        } catch (Exception e) {
            log.warn("[cleanupSagaLog] 清理Saga日志失败: {}", e.getMessage());
        }
    }

    /**
     * 清理并行网关数据
     */
    private void cleanupParallelGatewayData(String instanceId) {
        try {
            // 清理所有以 sys:wf:join:{instanceId}: 开头的 key
            redisCache.deleteObject("sys:wf:join:" + instanceId + ":*");
        } catch (Exception e) {
            log.warn("[cleanupParallelGatewayData] 清理并行网关数据失败: {}", e.getMessage());
        }
    }

    /**
     * 检查实例是否需要补偿
     */
    public boolean needsCompensation(String instanceId) {
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            return false;
        }
        // 如果实例处于 RUNNING 状态但没有活动任务，可能需要补偿
        if ("RUNNING".equals(instance.getStatus())) {
            Long activeTaskCount = taskMapper.selectCount(
                new LambdaQueryWrapper<WfTask>().eq(WfTask::getInstanceId, instanceId)
            );
            if (activeTaskCount == 0) {
                log.warn("[needsCompensation] 实例处于RUNNING状态但无活动任务, instanceId={}", instanceId);
                return true;
            }
        }
        return false;
    }
}
