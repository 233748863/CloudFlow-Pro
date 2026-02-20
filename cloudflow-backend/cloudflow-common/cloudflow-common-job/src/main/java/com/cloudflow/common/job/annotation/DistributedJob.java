package com.cloudflow.common.job.annotation;

import java.lang.annotation.*;

/**
 * 分布式定时任务注解
 * 标注在方法上，配合 @Scheduled 使用，确保多实例部署时只有一个实例执行任务
 * 基于 Redisson 分布式锁实现
 *
 * 使用示例：
 * @Scheduled(cron = "0 0 2 * * ?")
 * @DistributedJob(name = "cleanExpiredData", lockTime = 300)
 * public void cleanExpiredData() { ... }
 *
 * @author CloudFlow
 */
@Target({ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface DistributedJob {

    /**
     * 任务名称（用作分布式锁的 key）
     * 默认使用 类名:方法名
     */
    String name() default "";

    /**
     * 锁持有时间（秒）
     * 超过此时间自动释放锁，防止死锁
     * 默认 300 秒（5 分钟）
     */
    long lockTime() default 300;

    /**
     * 获取锁的等待时间（秒）
     * 默认 0 表示不等待，获取不到锁直接跳过
     */
    long waitTime() default 0;
}
