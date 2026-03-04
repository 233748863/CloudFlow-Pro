package com.cloudflow.workflow.service;

import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.service.INodeExecutionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 定时任务调度服务
 * 用于扫描和触发定时节点
 */
@Service
public class TimerSchedulerService {

    private static final Logger log = LoggerFactory.getLogger(TimerSchedulerService.class);

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private WfProcessDefinitionMapper processDefinitionMapper;

    @Autowired
    private INodeExecutionService nodeExecutionService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 兼容保留：旧版定时器扫描逻辑。
     * 当前生产调度统一由 TimerScanJob 执行，这里不再挂载 @Scheduled，
     * 避免同一 Redis ZSet 被两个调度器并发消费导致重复触发或流转不一致。
     */
    public void scanAndTriggerTimers() {
        String lockKey = "lock:scheduled:scanAndTriggerTimers";
        RLock lock = redissonClient.getLock(lockKey);
        
        try {
            // 尝试获取锁，最多等待1秒，锁定50秒后自动释放
            if (lock.tryLock(1, 50, TimeUnit.SECONDS)) {
                try {
                    long currentTime = System.currentTimeMillis();
                    
                    // 从Redis有序集合中获取所有到期的定时任务
                    Set<Object> expiredTimersRaw = redisCache.getCacheZSetByScoreRange(
                        "sys:wf:timers", 0, currentTime);
                    
                    if (expiredTimersRaw == null || expiredTimersRaw.isEmpty()) {
                        return;
                    }
                    
                    log.info("[scanAndTriggerTimers] 发现 {} 个到期的定时任务", expiredTimersRaw.size());
                    
                    for (Object timerKeyObj : expiredTimersRaw) {
                        if (!(timerKeyObj instanceof String)) {
                            log.warn("[scanAndTriggerTimers] 跳过非字符串类型的定时任务键: {}", timerKeyObj);
                            continue;
                        }
                        String timerKey = (String) timerKeyObj;
                        try {
                            triggerTimer(timerKey);
                        } catch (Exception e) {
                            log.error("[scanAndTriggerTimers] 触发定时任务失败, timerKey={}, error={}", 
                                timerKey, e.getMessage(), e);
                        }
                    }
                } finally {
                    lock.unlock();
                }
            } else {
                log.debug("[scanAndTriggerTimers] 未能获取分布式锁，跳过本次执行");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("[scanAndTriggerTimers] 获取分布式锁被中断");
        } catch (Exception e) {
            log.error("[scanAndTriggerTimers] 扫描定时任务失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 触发指定的定时任务
     */
    private void triggerTimer(String timerKey) {
        try {
            // 从Redis获取定时任务数据
            Map<String, Object> timerData = redisCache.getCacheObject(timerKey);
            
            if (timerData == null) {
                log.warn("[triggerTimer] 定时任务数据不存在, timerKey={}", timerKey);
                // 从有序集合中移除
                redisCache.removeCacheZSet("sys:wf:timers", timerKey);
                return;
            }
            
            Object instanceIdObj = timerData.get("instanceId");
            Object nodeKeyObj = timerData.get("nodeKey");
            Object nextNodeKeyObj = timerData.get("nextNodeKey");
            Object variablesObj = timerData.get("variables");
            
            if (!(instanceIdObj instanceof String) || !(nodeKeyObj instanceof String)) {
                log.warn("[triggerTimer] 定时任务数据格式错误, timerKey={}", timerKey);
                cleanup(timerKey);
                return;
            }
            
            String instanceId = (String) instanceIdObj;
            String nodeKey = (String) nodeKeyObj;
            String nextNodeKey = nextNodeKeyObj instanceof String ? (String) nextNodeKeyObj : null;
            
            @SuppressWarnings("unchecked")
            Map<String, Object> variables = variablesObj instanceof Map ? (Map<String, Object>) variablesObj : null;
            
            log.info("[triggerTimer] 触发定时任务, instanceId={}, nodeKey={}, nextNodeKey={}", 
                instanceId, nodeKey, nextNodeKey);
            
            // 查询流程实例
            WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
            if (instance == null) {
                log.warn("[triggerTimer] 流程实例不存在, instanceId={}", instanceId);
                cleanup(timerKey);
                return;
            }
            
            // 检查流程实例状态
            if (!"RUNNING".equals(instance.getStatus())) {
                log.warn("[triggerTimer] 流程实例状态异常, instanceId={}, status={}", 
                    instanceId, instance.getStatus());
                cleanup(timerKey);
                return;
            }
            
            // 优先按实例 definitionId 读取流程定义，避免定时触发时被新版本模型污染
            WfProcessDefinition def = null;
            if (StringUtils.hasText(instance.getDefinitionId())) {
                def = processDefinitionMapper.selectById(instance.getDefinitionId());
                if (def == null) {
                    log.warn("[triggerTimer] definitionId={} 不存在，回退 processDefKey={} 最新版本",
                        instance.getDefinitionId(), instance.getProcessDefKey());
                }
            }

            // 兼容历史实例（definitionId 为空）回退按 processKey 取最新版本
            if (def == null) {
                def = processDefinitionMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<WfProcessDefinition>()
                        .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                        .and(w -> w.ne(WfProcessDefinition::getStatus, "DRAFT")
                            .or()
                            .isNull(WfProcessDefinition::getStatus))
                        .orderByDesc(WfProcessDefinition::getVersion)
                        .last("LIMIT 1")
                );
            }
            
            if (def == null || !StringUtils.hasText(def.getModelJson())) {
                log.warn("[triggerTimer] 流程定义不存在或模型为空, processDefKey={}", 
                    instance.getProcessDefKey());
                cleanup(timerKey);
                return;
            }
            
            // 解析流程模型
            WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
            
            // 查找下一个节点
            WfNodeConfig nextNode = null;
            if (StringUtils.hasText(nextNodeKey)) {
                nextNode = findNode(root, nextNodeKey);
            }
            
            if (nextNode == null) {
                log.warn("[triggerTimer] 下一个节点不存在, nextNodeKey={}", nextNodeKey);
                cleanup(timerKey);
                return;
            }
            
            // 继续执行流程（委托给节点执行引擎）
            nodeExecutionService.runNode(instance, nextNode, variables != null ? variables : new java.util.HashMap<>(), 0, root);
            
            log.info("[triggerTimer] 定时任务触发成功, instanceId={}, nodeKey={}", instanceId, nodeKey);
            
            // 清理定时任务数据
            cleanup(timerKey);
            
        } catch (Exception e) {
            log.error("[triggerTimer] 触发定时任务失败, timerKey={}, error={}", 
                timerKey, e.getMessage(), e);
            // 失败时也清理，避免重复触发
            cleanup(timerKey);
        }
    }

    /**
     * 清理定时任务数据
     */
    private void cleanup(String timerKey) {
        try {
            redisCache.deleteObject(timerKey);
            redisCache.removeCacheZSet("sys:wf:timers", timerKey);
        } catch (Exception e) {
            log.warn("[cleanup] 清理定时任务数据失败, timerKey={}: {}", timerKey, e.getMessage());
        }
    }

    /**
     * 递归查找节点
     */
    private WfNodeConfig findNode(WfNodeConfig root, String nodeId) {
        if (root == null) return null;
        if (nodeId.equals(root.getId())) return root;
        
        WfNodeConfig found = findNode(root.getNext(), nodeId);
        if (found != null) return found;
        
        if (root.getBranches() != null) {
            for (WfNodeConfig branch : root.getBranches()) {
                found = findNode(branch, nodeId);
                if (found != null) return found;
            }
        }
        return null;
    }

    /**
     * 取消指定流程实例的所有定时任务
     */
    public void cancelTimersForInstance(String instanceId) {
        try {
            // 查找该实例的所有定时任务
            Set<Object> allTimersRaw = redisCache.getCacheZSetByScoreRange("sys:wf:timers", Double.NEGATIVE_INFINITY, Double.POSITIVE_INFINITY);
            
            if (allTimersRaw == null || allTimersRaw.isEmpty()) {
                return;
            }
            
            for (Object timerKeyObj : allTimersRaw) {
                if (!(timerKeyObj instanceof String)) {
                    continue;
                }
                String timerKey = (String) timerKeyObj;
                if (timerKey.contains(instanceId)) {
                    cleanup(timerKey);
                    log.info("[cancelTimersForInstance] 已取消定时任务, instanceId={}, timerKey={}", 
                        instanceId, timerKey);
                }
            }
            
        } catch (Exception e) {
            log.error("[cancelTimersForInstance] 取消定时任务失败, instanceId={}: {}", 
                instanceId, e.getMessage(), e);
        }
    }
}
