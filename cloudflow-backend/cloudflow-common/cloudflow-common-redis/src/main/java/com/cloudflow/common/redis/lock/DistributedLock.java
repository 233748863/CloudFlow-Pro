package com.cloudflow.common.redis.lock;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 分布式锁注解。基于 Redisson RLock 实现，支持 SpEL 表达式动态 key。
 * <p>
 * 示例：
 * <pre>
 * &#64;DistributedLock(key = "'lead:convert:' + #leadId", waitMs = 200, leaseMs = 10000)
 * public void convertLead(Long leadId) {
 *     // 业务逻辑，同一 leadId 同时只有一个线程执行
 * }
 * </pre>
 * <p>
 * 等锁失败/超时统一抛 ServiceException("ERR.CONCURRENT")，由 GlobalExceptionHandler 翻译为 HTTP 409。
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface DistributedLock {

    /**
     * 锁 key，支持 SpEL 表达式。
     * <p>
     * 示例：
     * <ul>
     *   <li>"'contract:' + #contractId" → contract:123</li>
     *   <li>"'budget:' + #dto.budgetId" → budget:456</li>
     *   <li>"'lead:convert:' + #leadId" → lead:convert:789</li>
     * </ul>
     * <p>
     * 最终 key 会自动拼租户前缀（若有）：tenantId:lock:{key}
     */
    String key();

    /**
     * 等待锁超时时间（毫秒）。超时未获取到锁抛 ServiceException("ERR.CONCURRENT")。
     * 默认 200ms，适合高并发场景快速失败。
     */
    long waitMs() default 200;

    /**
     * 锁自动释放时间（毫秒）。防止业务方法异常退出后锁永不释放。
     * 默认 10000ms = 10s，适合大部分业务方法。若方法执行超过 leaseMs，锁会自动释放，可能导致并发问题。
     */
    long leaseMs() default 10000;
}
