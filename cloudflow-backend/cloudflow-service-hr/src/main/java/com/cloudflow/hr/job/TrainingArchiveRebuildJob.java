package com.cloudflow.hr.job;

import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.hr.service.IHrTrainingArchiveService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * HR-P0-1 培训档案凌晨重建定时任务。
 *
 * <p>每天 02:30 遍历所有活跃租户全量重建 hr_training_archive,
 * 避免增量 hook 异常导致的数据漂移; 单实例幂等执行, 不带分布式锁。
 * 通过 {@link TenantIterator} 按租户切换 TenantContext, 避免 MP 因
 * TenantContext 为 null 时整张表跳过过滤导致跨租户裸跑。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TrainingArchiveRebuildJob {

    private final IHrTrainingArchiveService archiveService;
    private final TenantIterator tenantIterator;

    @Scheduled(cron = "0 30 2 * * ?")
    public void run() {
        log.info("HR-P0-1 培训档案凌晨重建任务开始");
        AtomicInteger total = new AtomicInteger();
        tenantIterator.forEachActiveTenant(tid -> {
            try {
                int count = archiveService.rebuildAll();
                total.addAndGet(count);
                log.info("HR-P0-1 培训档案凌晨重建, tenantId={}, refreshed={}", tid, count);
            } catch (Exception e) {
                log.error("HR-P0-1 培训档案凌晨重建租户处理失败, tenantId={}", tid, e);
            }
        });
        log.info("HR-P0-1 培训档案凌晨重建任务完成, 共刷新 {} 名员工", total.get());
    }
}
