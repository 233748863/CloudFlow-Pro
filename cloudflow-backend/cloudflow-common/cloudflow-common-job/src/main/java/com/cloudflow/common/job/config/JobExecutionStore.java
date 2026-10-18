package com.cloudflow.common.job.config;

import com.cloudflow.common.job.model.JobResult;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;

/**
 * 执行编号短期状态存储，供 auth 巡检反查。
 */
@Component
@RequiredArgsConstructor
public class JobExecutionStore {
    private static final String PREFIX = "cloudflow:job:execution:";
    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    public void put(String executeNo, JobResult result, Duration ttl) {
        try {
            redis.opsForValue().set(PREFIX + executeNo, objectMapper.writeValueAsString(result), ttl);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("任务状态序列化失败", e);
        }
    }

    /**
     * 原子占用执行编号。返回 false 表示该 executeNo 已被同一服务实例集群接收。
     */
    public boolean putIfAbsent(String executeNo, JobResult result, Duration ttl) {
        try {
            Boolean stored = redis.opsForValue().setIfAbsent(
                    PREFIX + executeNo, objectMapper.writeValueAsString(result), ttl);
            return Boolean.TRUE.equals(stored);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("任务状态序列化失败", e);
        }
    }

    public JobResult get(String executeNo) {
        String raw = redis.opsForValue().get(PREFIX + executeNo);
        if (raw == null) return null;
        try { return objectMapper.readValue(raw, JobResult.class); }
        catch (Exception e) { return null; }
    }

    public void remove(String executeNo) {
        redis.delete(PREFIX + executeNo);
    }
}
