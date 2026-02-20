package com.cloudflow.common.job.config;

import com.cloudflow.common.job.aspect.DistributedJobAspect;
import org.redisson.api.RedissonClient;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 定时任务自动配置类
 * 启用 Spring Scheduling 并注册分布式任务切面
 *
 * @author CloudFlow
 */
@AutoConfiguration
@EnableScheduling
public class JobAutoConfiguration {

    @Bean
    public DistributedJobAspect distributedJobAspect(RedissonClient redissonClient) {
        return new DistributedJobAspect(redissonClient);
    }
}
