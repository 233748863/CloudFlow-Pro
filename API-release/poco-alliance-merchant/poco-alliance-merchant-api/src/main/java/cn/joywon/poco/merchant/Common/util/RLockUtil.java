package cn.joywon.poco.merchant.Common.util;

import lombok.RequiredArgsConstructor;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Component
@RefreshScope
@RequiredArgsConstructor
public class RLockUtil {

    // 锁过期时间
    @Value("${lock4j.expire}")
    private Long lockExpireSeconds;
    // 锁等待时间
    @Value("${lock4j.acquire-timeout}")
    private Long lockWaitTimeoutMs;

    private final RedissonClient redissonClient;


    /**
     * 获取缓存锁
     *
     * @param lockKey 锁键
     * @return 锁对象
     */
    public RLock tryLock(String lockKey) {
        RLock lock = redissonClient.getLock(lockKey);
        try {
            boolean result = lock.tryLock(lockWaitTimeoutMs, lockExpireSeconds, TimeUnit.MICROSECONDS);
            if (result) {
                return lock;
            } else {
                return null;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }


    /**
     * 释放缓存锁
     *
     * @param lock 锁对象
     */
    public void releaseLock(RLock lock) {
        if (lock == null) {
            return;
        }
        if (lock.isHeldByCurrentThread()) {
            lock.unlock();
        }
    }


}