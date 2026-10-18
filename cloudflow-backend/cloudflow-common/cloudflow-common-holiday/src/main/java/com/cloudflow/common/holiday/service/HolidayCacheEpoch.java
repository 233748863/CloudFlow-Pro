package com.cloudflow.common.holiday.service;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.support.RuntimeContextBridge;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
final class HolidayCacheEpoch {
    private static final DefaultRedisScript<String> SCRIPT = new DefaultRedisScript<>("""
            local operation = ARGV[1]
            local marker = 'pending:' .. ARGV[2]
            local generation = ARGV[3]
            if operation == 'READ' then
                local revisions = {}
                for index, key in ipairs(KEYS) do
                    if redis.call('HLEN', key) > 1 then return '' end
                    local revision = redis.call('HGET', key, 'revision')
                    if not revision then
                        revision = generation
                        redis.call('HSET', key, 'revision', revision)
                        redis.call('EXPIRE', key, 172800)
                    end
                    revisions[index] = revision
                end
                return table.concat(revisions, ':')
            end
            for index, key in ipairs(KEYS) do
                redis.call('HSET', key, 'revision', generation)
                if operation == 'BEGIN' then
                    redis.call('HSET', key, marker, '1')
                    redis.call('PERSIST', key)
                elseif operation == 'END' then
                    redis.call('HDEL', key, marker)
                    if redis.call('HLEN', key) == 1 then redis.call('EXPIRE', key, 172800) end
                else
                    return redis.error_reply('Unknown holiday cache operation')
                end
            end
            return 'OK'
            """, String.class);

    private final RedisCache redisCache;
    private final Map<String, List<String>> completed = new ConcurrentHashMap<>();

    HolidayCacheEpoch(RedisCache redisCache) {
        this.redisCache = redisCache;
    }

    String current(String... scopes) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) return null;
        retryCompleted();
        try {
            String generation = execute("READ", keys(scopes), UUID.randomUUID().toString());
            return generation == null || generation.isEmpty() ? null : generation;
        } catch (RuntimeException unavailable) {
            return null;
        }
    }

    void invalidate(String... scopes) {
        retryCompleted();
        List<String> keys = keys(scopes);
        String marker = UUID.randomUUID().toString();
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()) {
            begin(keys, marker);
            complete(keys, marker);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            private boolean attempted;

            @Override
            public void beforeCommit(boolean readOnly) {
                attempted = true;
                begin(keys, marker);
            }

            @Override
            public void afterCompletion(int status) {
                if (!attempted) return;
                if (status == STATUS_UNKNOWN) {
                    log.warn("节假日日历事务结果未确认，相关缓存保持停用，范围={}", keys);
                    return;
                }
                complete(keys, marker);
            }
        });
    }

    private void begin(List<String> keys, String marker) {
        try {
            if (!"OK".equals(execute("BEGIN", keys, marker))) throw new IllegalStateException();
        } catch (RuntimeException unavailable) {
            throw new ServiceException("节假日日历缓存暂不可用，本次变更未提交，请稍后重试");
        }
    }

    private void complete(List<String> keys, String marker) {
        completed.put(marker, keys);
        if (!tryComplete(keys, marker)) {
            log.warn("节假日日历缓存失效标记未清理，相关读取继续回源数据库，范围={}", keys);
        }
    }

    private void retryCompleted() {
        for (Map.Entry<String, List<String>> entry : completed.entrySet()) {
            if (!tryComplete(entry.getValue(), entry.getKey())) return;
        }
    }

    private boolean tryComplete(List<String> keys, String marker) {
        try {
            if (!"OK".equals(execute("END", keys, marker))) throw new IllegalStateException();
            completed.remove(marker);
            return true;
        } catch (RuntimeException unavailable) {
            return false;
        }
    }

    private String execute(String operation, List<String> keys, String marker) {
        return redisCache.redisTemplate.execute(SCRIPT, StringRedisSerializer.UTF_8, StringRedisSerializer.UTF_8,
                keys, operation, marker, UUID.randomUUID().toString());
    }

    private List<String> keys(String[] scopes) {
        Long tenantId = RuntimeContextBridge.getTenantId();
        String prefix = (tenantId == null ? "" : tenantId + ":") + "holiday:epoch:v2:";
        return Arrays.stream(scopes).distinct().map(scope -> prefix + scope).toList();
    }
}
