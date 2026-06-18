package com.cloudflow.workflow.service;

import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.config.SysConfigKeys;
import com.cloudflow.workflow.exception.RateLimitException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

/**
 * 限流服务
 * 
 * P0修复：实现流程实例限流
 * 使用 Redis 滑动窗口限流，限制每用户每分钟启动流程次数
 * 
 * @author CloudFlow
 */
@Service
public class RateLimiterService {

    private static final Logger log = LoggerFactory.getLogger(RateLimiterService.class);

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private RuntimeSysConfigService runtimeSysConfigService;

    /**
     * 检查启动流程限流
     * 
     * @param userId 用户ID
     * @throws RateLimitException 超过限流阈值时抛出
     */
    public void checkStartProcessLimit(Long userId) {
        checkLimit("sys:ratelimit:start:" + userId,
                runtimeSysConfigService.getInt(SysConfigKeys.WORKFLOW_RATE_LIMIT_START_PROCESS, 10),
                runtimeSysConfigService.getInt(SysConfigKeys.WORKFLOW_RATE_LIMIT_START_PROCESS_WINDOW_SECONDS, 60),
                "启动流程");
    }

    /**
     * 检查完成任务限流
     * 
     * @param userId 用户ID
     * @throws RateLimitException 超过限流阈值时抛出
     */
    public void checkCompleteTaskLimit(Long userId) {
        checkLimit("sys:ratelimit:complete:" + userId,
                runtimeSysConfigService.getInt(SysConfigKeys.WORKFLOW_RATE_LIMIT_COMPLETE_TASK, 30),
                runtimeSysConfigService.getInt(SysConfigKeys.WORKFLOW_RATE_LIMIT_COMPLETE_TASK_WINDOW_SECONDS, 60),
                "处理任务");
    }

    /**
     * 检查催办限流
     * 
     * @param userId 用户ID
     * @throws RateLimitException 超过限流阈值时抛出
     */
    public void checkUrgeTaskLimit(Long userId) {
        checkLimit("sys:ratelimit:urge:" + userId,
                runtimeSysConfigService.getInt(SysConfigKeys.WORKFLOW_RATE_LIMIT_URGE_TASK, 5),
                runtimeSysConfigService.getInt(SysConfigKeys.WORKFLOW_RATE_LIMIT_URGE_TASK_WINDOW_SECONDS, 3600),
                "催办");
    }

    /**
     * 通用限流检查
     * 
     * @param key Redis Key
     * @param limit 限流阈值
     * @param windowSeconds 时间窗口（秒）
     * @param operation 操作名称
     */
    private void checkLimit(String key, int limit, int windowSeconds, String operation) {
        try {
            long count = redisCache.increment(key);
            if (count == 1) {
                // 第一次请求，设置过期时间
                redisCache.expire(key, windowSeconds, TimeUnit.SECONDS);
            }
            if (count > limit) {
                log.warn("用户操作 [{}] 触发限流，当前计数: {}, 限制: {}", operation, count, limit);
                throw new RateLimitException(operation + "操作过于频繁，请稍后再试");
            }
        } catch (RateLimitException e) {
            throw e;
        } catch (Exception e) {
            // Redis 异常时不阻塞业务，降级放行
            log.error("限流检查异常，降级放行: {}", e.getMessage());
        }
    }
}
