package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.service.IWorkflowHealthCheckService;
import com.cloudflow.common.audit.annotation.Audit;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.vo.DynamicMapVO;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * R.5: 流程引擎健康检查服务
 */
@Service
public class WorkflowHealthCheckServiceImpl implements IWorkflowHealthCheckService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowHealthCheckServiceImpl.class);

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private WfTaskMapper taskMapper;

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private RedissonClient redissonClient;

    /**
     * 执行全面健康检查
     */
    public DynamicMapVO performHealthCheck() {
        Map<String, Object> health = new HashMap<>();
        health.put("status", "UP");
        health.put("timestamp", System.currentTimeMillis());

        // 1. 数据库连接检查
        try {
            Long instanceCount = processInstanceMapper.selectCount(null);
            health.put("database", Map.of("status", "UP", "instanceCount", instanceCount));
        } catch (Exception e) {
            health.put("database", Map.of("status", "DOWN", "error", e.getMessage()));
            health.put("status", "DOWN");
        }

        // 2. Redis 连接检查
        try {
            redisCache.setCacheObject("sys:wf:health:ping", "pong");
            String pong = redisCache.getCacheObject("sys:wf:health:ping");
            health.put("redis", Map.of("status", "pong".equals(pong) ? "UP" : "DOWN"));
        } catch (Exception e) {
            health.put("redis", Map.of("status", "DOWN", "error", e.getMessage()));
            health.put("status", "DOWN");
        }

        // 3. Redisson 分布式锁检查
        try {
            boolean lockAvailable = redissonClient.getLock("sys:wf:health:lock").tryLock();
            if (lockAvailable) {
                redissonClient.getLock("sys:wf:health:lock").unlock();
            }
            health.put("distributedLock", Map.of("status", "UP"));
        } catch (Exception e) {
            health.put("distributedLock", Map.of("status", "DOWN", "error", e.getMessage()));
            health.put("status", "DEGRADED");
        }

        // 4. 流程引擎统计
        try {
            Long runningCount = processInstanceMapper.selectCount(
                new LambdaQueryWrapper<WfProcessInstance>().eq(WfProcessInstance::getStatus, "RUNNING")
            );
            Long pendingTaskCount = taskMapper.selectCount(
                new LambdaQueryWrapper<WfTask>().eq(WfTask::getStatus, "TODO")
            );
            health.put("engine", Map.of(
                "status", "UP",
                "runningInstances", runningCount,
                "pendingTasks", pendingTaskCount
            ));
        } catch (Exception e) {
            health.put("engine", Map.of("status", "DOWN", "error", e.getMessage()));
        }

        // 5. 检测僵尸实例（RUNNING 但无活动任务）
        try {
            List<String> runningInstanceIds = processInstanceMapper.selectList(
                    new LambdaQueryWrapper<WfProcessInstance>()
                            .select(WfProcessInstance::getInstanceId)
                            .eq(WfProcessInstance::getStatus, "RUNNING")
            ).stream()
                    .map(WfProcessInstance::getInstanceId)
                    .collect(Collectors.toList());

            long zombieCount = 0L;
            if (!runningInstanceIds.isEmpty()) {
                Set<String> activeInstanceIds = new HashSet<>(taskMapper.selectList(
                        new LambdaQueryWrapper<WfTask>()
                                .select(WfTask::getInstanceId)
                                .in(WfTask::getInstanceId, runningInstanceIds)
                                .eq(WfTask::getStatus, "TODO")
                ).stream()
                        .map(WfTask::getInstanceId)
                        .distinct()
                        .collect(Collectors.toList()));
                zombieCount = runningInstanceIds.stream()
                        .filter(instanceId -> !activeInstanceIds.contains(instanceId))
                        .count();
            }

            health.put("zombieInstances", zombieCount);
        } catch (Exception e) {
            log.warn("[performHealthCheck] 僵尸实例检测失败: {}", e.getMessage());
        }

        log.info("[performHealthCheck] 健康检查完成, status={}", health.get("status"));
        return DynamicMapVO.from(health);
    }
}
