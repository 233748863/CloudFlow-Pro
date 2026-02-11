package cn.joywon.poco.merchant.ReportModule.service;

import cn.joywon.poco.merchant.ReportModule.vo.LockStatusVO;

import java.util.List;
import java.util.function.Supplier;

/**
 * 分布式锁服务接口
 * 基于 Redisson 实现，提供定时任务所需的分布式锁能力
 *
 * @author poco
 * @date 2025-01-06
 */
public interface DistributedLockService {

    /**
     * 尝试获取锁并执行任务
     * 使用非阻塞方式获取锁，获取成功则执行任务，失败则跳过
     *
     * @param lockKey   锁的唯一标识
     * @param leaseTime 锁的自动释放时间（秒）
     * @param task      需要执行的任务
     * @return 是否成功获取锁并执行任务
     */
    boolean tryLockAndExecute(String lockKey, long leaseTime, Runnable task);

    /**
     * 尝试获取锁并执行任务（带返回值）
     * 使用非阻塞方式获取锁，获取成功则执行任务，失败则返回null
     *
     * @param lockKey   锁的唯一标识
     * @param leaseTime 锁的自动释放时间（秒）
     * @param task      需要执行的任务
     * @param <T>       返回值类型
     * @return 任务执行结果，如果获取锁失败返回 null
     */
    <T> T tryLockAndExecute(String lockKey, long leaseTime, Supplier<T> task);

    /**
     * 查询锁状态
     *
     * @param lockKey 锁的唯一标识
     * @return 锁状态信息
     */
    LockStatusVO getLockStatus(String lockKey);

    /**
     * 强制释放锁（仅限管理员使用）
     * 用于处理异常情况下锁无法正常释放的场景
     *
     * @param lockKey 锁的唯一标识
     * @return 是否释放成功
     */
    boolean forceUnlock(String lockKey);

    /**
     * 获取所有报表相关锁的状态
     * 包括每日报表锁、月度账单锁、缓存刷新锁
     *
     * @return 锁状态列表
     */
    List<LockStatusVO> getAllReportLockStatus();
}
