package com.cloudflow.hr.job;

import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;

import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.hr.service.IHrTrainingArchiveService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.ArrayList;
import java.util.List;

/**
 * HR-P0-1 培训档案凌晨重建定时任务。
 *
 * <p>每天 02:30 遍历所有活跃租户全量重建 hr_training_archive,
 * 避免增量 hook 异常导致的数据漂移；通过集中调度和分布式锁避免重复执行。
 * 通过 {@link TenantIterator} 按租户切换 TenantContext, 避免 MP 因
 * TenantContext 为 null 时整张表跳过过滤导致跨租户裸跑。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TrainingArchiveRebuildJob {

    private final IHrTrainingArchiveService archiveService;
    private final TenantIterator tenantIterator;

    @JobHandler(value = "trainingArchiveRebuild", desc = "重建培训归档")
    @DistributedJob(name = "hr-training-archive-rebuild-job", lockTime = 1800, waitTime = 5)
    public JobResult run() {
        log.info("HR-P0-1 培训档案凌晨重建任务开始");
        AtomicInteger total = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        tenantIterator.forEachActiveTenant(tid -> {
            try {
                int count = archiveService.rebuildAll();
                total.addAndGet(count);
                log.info("HR-P0-1 培训档案凌晨重建, tenantId={}, refreshed={}", tid, count);
            } catch (RuntimeException e) {
                log.error("HR-P0-1 培训档案凌晨重建租户处理失败, tenantId={}", tid, e);
                failures.add(new IllegalStateException("培训档案重建失败，租户：" + tid, e));
            }
        });
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("培训档案重建存在失败租户："
                    + failures.size() + "个");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        log.info("HR-P0-1 培训档案凌晨重建任务完成, 共刷新 {} 名员工", total.get());
        return JobResult.success(total.get(), "培训档案重建完成：已刷新" + total.get() + "名员工");
    }
}
