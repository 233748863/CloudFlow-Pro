package cn.joywon.poco.merchant.ReportModule.service.impl;

import cn.joywon.poco.merchant.ReportModule.lock.ReportLockKeys;
import cn.joywon.poco.merchant.ReportModule.service.DistributedLockService;
import cn.joywon.poco.merchant.ReportModule.vo.LockStatusVO;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * 分布式锁服务实现类
 * 基于 Redisson 实现，提供定时任务所需的分布式锁能力
 *
 * @author poco
 * @date 2025-01-06
 */
@Service
@Slf4j
@AllArgsConstructor
public class DistributedLockServiceImpl implements DistributedLockService {

    private final RedissonClient redissonClient;

    @Override
    public boolean tryLockAndExecute(String lockKey, long leaseTime, Runnable task) {
        RLock lock = redissonClient.getLock(lockKey);

        try {
            // 尝试获取锁，不等待，立即返回
            boolean acquired = lock.tryLock(0, leaseTime, TimeUnit.SECONDS);

            if (acquired) {
                log.info("成功获取分布式锁: {}", lockKey);
                try {
                    task.run();
                    return true;
                } finally {
                    // 确保锁被释放
                    safeUnlock(lock, lockKey);
                }
            } else {
                log.info("获取分布式锁失败，任务跳过: {}", lockKey);
                return false;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("获取分布式锁被中断: {}", lockKey, e);
            return false;
        } catch (Exception e) {
            log.error("执行分布式锁任务异常: {}", lockKey, e);
            // 确保异常情况下锁也被释放
            safeUnlock(lock, lockKey);
            throw e;
        }
    }


    @Override
    public <T> T tryLockAndExecute(String lockKey, long leaseTime, Supplier<T> task) {
        RLock lock = redissonClient.getLock(lockKey);

        try {
            // 尝试获取锁，不等待，立即返回
            boolean acquired = lock.tryLock(0, leaseTime, TimeUnit.SECONDS);

            if (acquired) {
                log.info("成功获取分布式锁: {}", lockKey);
                try {
                    return task.get();
                } finally {
                    // 确保锁被释放
                    safeUnlock(lock, lockKey);
                }
            } else {
                log.info("获取分布式锁失败，任务跳过: {}", lockKey);
                return null;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("获取分布式锁被中断: {}", lockKey, e);
            return null;
        } catch (Exception e) {
            log.error("执行分布式锁任务异常: {}", lockKey, e);
            // 确保异常情况下锁也被释放
            safeUnlock(lock, lockKey);
            throw e;
        }
    }

    @Override
    public LockStatusVO getLockStatus(String lockKey) {
        RLock lock = redissonClient.getLock(lockKey);
        LockStatusVO status = new LockStatusVO();
        status.setLockKey(lockKey);
        status.setLocked(lock.isLocked());
        status.setRemainLeaseTime(lock.remainTimeToLive());

        // 尝试获取持有者信息
        if (lock.isLocked()) {
            try {
                // Redisson 不直接提供持有者ID，但可以通过锁名称推断
                status.setHolderId("unknown");
                status.setLockTime(LocalDateTime.now()); // 无法获取精确锁定时间
            } catch (Exception e) {
                log.debug("获取锁持有者信息失败: {}", lockKey, e);
            }
        }

        return status;
    }

    @Override
    public boolean forceUnlock(String lockKey) {
        RLock lock = redissonClient.getLock(lockKey);
        if (lock.isLocked()) {
            lock.forceUnlock();
            log.warn("强制释放分布式锁: {}", lockKey);
            return true;
        }
        log.info("锁未被持有，无需释放: {}", lockKey);
        return false;
    }

    @Override
    public List<LockStatusVO> getAllReportLockStatus() {
        List<LockStatusVO> statusList = new ArrayList<>();

        // 检查昨天的日报表锁
        String dailyKey = ReportLockKeys.dailyReportKey(LocalDate.now().minusDays(1));
        statusList.add(getLockStatus(dailyKey));

        // 检查上月的月度账单锁
        String monthlyKey = ReportLockKeys.monthlyBillKey(
                YearMonth.now().minusMonths(1).toString());
        statusList.add(getLockStatus(monthlyKey));

        // 检查当前小时的缓存刷新锁
        String cacheKey = ReportLockKeys.cacheRefreshKey(LocalDateTime.now());
        statusList.add(getLockStatus(cacheKey));

        return statusList;
    }

    /**
     * 安全释放锁
     * 确保只有当前线程持有锁时才释放，避免释放其他线程的锁
     *
     * @param lock    锁对象
     * @param lockKey 锁Key（用于日志）
     */
    private void safeUnlock(RLock lock, String lockKey) {
        try {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
                log.info("释放分布式锁: {}", lockKey);
            }
        } catch (Exception e) {
            log.warn("释放分布式锁异常: {}", lockKey, e);
        }
    }
}
