package com.cloudflow.oa.job;

import com.cloudflow.oa.service.IOaLicenseBorrowService;
import com.cloudflow.oa.service.IOaSealApplicationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 用印/证照逾期归还扫描任务。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OaBorrowOverdueJob {

    private final IOaSealApplicationService sealApplicationService;
    private final IOaLicenseBorrowService licenseBorrowService;

    @Scheduled(cron = "${cloudflow.oa.borrow.overdue-cron:0 0 9 * * ?}")
    public void scanOverdueBorrows() {
        int sealCount = sealApplicationService.scanAndRemindOverdue();
        int licenseCount = licenseBorrowService.scanAndRemindOverdue();
        if (sealCount > 0 || licenseCount > 0) {
            log.info("用印/证照逾期扫描完成: sealCount={}, licenseCount={}", sealCount, licenseCount);
        }
    }
}
