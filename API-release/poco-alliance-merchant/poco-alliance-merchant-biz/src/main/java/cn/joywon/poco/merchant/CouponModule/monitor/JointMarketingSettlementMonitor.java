package cn.joywon.poco.merchant.CouponModule.monitor;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Component
public class JointMarketingSettlementMonitor {

    private final AtomicInteger totalProcessed = new AtomicInteger(0);
    private final AtomicInteger successCount = new AtomicInteger(0);
    private final AtomicInteger failureCount = new AtomicInteger(0);
    private LocalDateTime batchStartTime;

    public void startSettlementBatch() {
        batchStartTime = LocalDateTime.now();
        totalProcessed.set(0);
        successCount.set(0);
        failureCount.set(0);
    }

    public void recordProcessed(boolean success) {
        totalProcessed.incrementAndGet();
        if (success) {
            successCount.incrementAndGet();
        } else {
            failureCount.incrementAndGet();
        }
    }

    public void completeSettlementBatch(int total) {
        LocalDateTime endTime = LocalDateTime.now();
        long duration = java.time.Duration.between(batchStartTime, endTime).getSeconds();

        log.info("结算批次完成统计 - 总数: {}, 成功: {}, 失败: {}, 耗时: {}秒",
                total, successCount.get(), failureCount.get(), duration);
    }

    public void recordSettlementFailure(Exception e) {
        log.error("结算批次执行失败", e);
    }

}