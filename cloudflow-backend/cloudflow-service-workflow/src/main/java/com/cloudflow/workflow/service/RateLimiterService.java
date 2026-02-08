package com.cloudflow.workflow.service;

import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.workflow.exception.RateLimitException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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

    /** 每用户每分钟最大启动流程次数 */
    @Value("${workflow.rate-limit.start-process:10}")
    private int startProcessLimit;

    /** 每用户每分钟最大完成任务次数 */
    @Value("${workflow.rate-limit.complete-task:30}")
    private int completeTaskLimit;

    /** 每用户每小时最大催办次数 */
    @Value("${workflow.rate-limit.urge-task:5}")
    private int urgeTaskLimit;

    /**
     * 检查启动流程限流
     * 
     * @param userId 用户ID
     * @throws RateLimitException 超过限流阈值时抛出
     */
    public void checkStartProcessLimit(Long userId) {
        checkLimit("sys:ratelimit:start:" + userId, startProcessLimit, 60, "启动流程");
    }

    /**
     * 检查完成任务限流
     * 
     * @param userId 用户ID
     * @throws RateLimitException 超过限流阈值时抛出
     */
    public void checkCompleteTaskLimit(Long userId) {
        checkLimit("sys:ratelimit:complete:" + userId, completeTaskLimit, 60, "处理任务");
    }

    /**
     * 检查催办限流
     * 
     * @param userId 用户ID
     * @throws RateLimitException 超过限流阈值时抛出
     */
    public void checkUrgeTaskLimit(Long userId) {
        checkLimit("sys:ratelimit:urge:" + userId, urgeTaskLimit, 3600, "催办");
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
