package com.cloudflow.hr.job;

import com.cloudflow.hr.service.DeptPostSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * 部门岗位数据同步定时任务
 * 
 * 定期从Auth服务同步部门和岗位数据到Redis缓存
 * 使用分布式锁防止多实例重复执行
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeptPostSyncJob {

    private final DeptPostSyncService deptPostSyncService;
    private final RedissonClient redissonClient;

    /**
     * 每5分钟同步一次部门岗位数据
     * 使用分布式锁防止多实例重复执行
     */
    @Scheduled(fixedRate = 300000) // 5分钟 = 300000毫秒
    public void syncDeptPostData() {
        String lockKey = "lock:scheduled:syncDeptPostData";
        RLock lock = redissonClient.getLock(lockKey);
        
        try {
            // 尝试获取锁，最多等待1秒，锁定50秒后自动释放
            if (lock.tryLock(1, 50, TimeUnit.SECONDS)) {
                try {
                    log.info("[DeptPostSyncJob] 开始执行部门岗位数据同步任务");
                    
                    // 同步部门数据
                    try {
                        deptPostSyncService.syncDepartments();
                        log.info("[DeptPostSyncJob] 部门数据同步成功");
                    } catch (Exception e) {
                        log.error("[DeptPostSyncJob] 部门数据同步失败", e);
                    }
                    
                    // 同步岗位数据
                    try {
                        deptPostSyncService.syncPosts();
                        log.info("[DeptPostSyncJob] 岗位数据同步成功");
                    } catch (Exception e) {
                        log.error("[DeptPostSyncJob] 岗位数据同步失败", e);
                    }
                    
                    log.info("[DeptPostSyncJob] 部门岗位数据同步任务执行完成");
                    
                } finally {
                    lock.unlock();
                }
            } else {
                log.debug("[DeptPostSyncJob] 未能获取分布式锁，跳过本次执行");
            }
        } catch (InterruptedException e) {
            log.error("[DeptPostSyncJob] 获取分布式锁被中断", e);
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.error("[DeptPostSyncJob] 执行部门岗位数据同步任务失败", e);
        }
    }
}
