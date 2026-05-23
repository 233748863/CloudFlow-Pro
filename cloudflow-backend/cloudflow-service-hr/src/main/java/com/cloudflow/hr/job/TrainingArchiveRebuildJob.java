package com.cloudflow.hr.job;

import com.cloudflow.hr.service.HrTrainingArchiveService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * HR-P0-1 培训档案凌晨重建定时任务。
 *
 * <p>每天 02:30 全量重建当前租户上下文(取 100000 默认租户) hr_training_archive,
 * 避免增量 hook 异常导致的数据漂移; 单实例幂等执行, 不带分布式锁。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TrainingArchiveRebuildJob {

    private final HrTrainingArchiveService archiveService;

    @Scheduled(cron = "0 30 2 * * ?")
    public void run() {
        log.info("HR-P0-1 培训档案凌晨重建任务开始");
        try {
            int count = archiveService.rebuildAll();
            log.info("HR-P0-1 培训档案凌晨重建任务完成, 共刷新 {} 名员工", count);
        } catch (Exception e) {
            log.error("HR-P0-1 培训档案凌晨重建任务失败", e);
        }
    }
}
