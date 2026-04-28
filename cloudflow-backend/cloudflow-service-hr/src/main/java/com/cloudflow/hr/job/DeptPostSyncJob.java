package com.cloudflow.hr.job;

import com.cloudflow.hr.service.DeptPostSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@RequiredArgsConstructor
public class DeptPostSyncJob {

    private final DeptPostSyncService deptPostSyncService;
    private final RedissonClient redissonClient;

    @Scheduled(initialDelay = 300000, fixedRate = 300000)
    public void syncDeptPostData() {
        RLock lock = redissonClient.getLock("lock:scheduled:syncDeptPostData");
        try {
            if (lock.tryLock(1, 50, TimeUnit.SECONDS)) {
                try {
                    deptPostSyncService.syncDepartments();
                    deptPostSyncService.syncPosts();
                    log.info("[DeptPostSyncJob] Dept/post sync completed");
                } finally {
                    lock.unlock();
                }
            } else {
                log.debug("[DeptPostSyncJob] Skip sync because lock was not acquired");
            }
        } catch (InterruptedException e) {
            log.error("[DeptPostSyncJob] Interrupted while acquiring lock", e);
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.error("[DeptPostSyncJob] Dept/post sync failed", e);
        }
    }
}
