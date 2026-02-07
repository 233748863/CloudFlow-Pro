package com.cloudflow.workflow.job;

import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.common.core.utils.RedisStreamUtil;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Component
public class TaskTimeoutJob {

    private static final Logger log = LoggerFactory.getLogger(TaskTimeoutJob.class);

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private RedisStreamUtil redisStreamUtil;

    @Autowired
    private WorkflowProperties workflowProperties;

    @Scheduled(cron = "0 0/1 * * * ?") // 每分钟执行
    public void checkTaskTimeouts() {
        log.info("开始检查任务超时...");
        
        long now = System.currentTimeMillis();
        Set<Object> taskIds = redisCache.getCacheZSetRangeByScore("sys:task:timeouts", 0, (double) now);
        
        if (taskIds != null && !taskIds.isEmpty()) {
            for (Object obj : taskIds) {
                String taskId = (String) obj;
                log.info("检测到任务超时: {}, 准备投递到 Stream", taskId);
                
                try {
                    // 构造消息体
                    Map<String, Object> content = new HashMap<>();
                    content.put("taskId", taskId);
                    content.put("timestamp", String.valueOf(System.currentTimeMillis()));
                    content.put("trigger", "JOB_SCAN");

                    // 投递到 Stream
                    redisStreamUtil.publish(workflowProperties.getKey(), content);
                    
                    // 移除已处理的任务 (Triggered)
                    // 只有投递成功才移除，保证至少投递一次
                    redisCache.removeCacheZSet("sys:task:timeouts", taskId);
                    
                    log.info("任务超时事件已投递: {}", taskId);
                } catch (Exception e) {
                    log.error("投递超时任务失败: " + taskId, e);
                    // 不移除 ZSet，等待下次重试
                }
            }
        }
    }
}
