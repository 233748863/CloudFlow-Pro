package cn.joywon.poco.merchant.CouponModule.scheduler;

import cn.joywon.poco.merchant.CouponModule.lock.JointMarketingLockKeys;
import cn.joywon.poco.merchant.CouponModule.lock.JointMarketingLockTimeout;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingSettlementService;
import cn.joywon.poco.merchant.ReportModule.service.DistributedLockService;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * 联合营销定时任务调度器
 * 使用Spring原生@Scheduled注解实现定时任务
 * 集成Redisson分布式锁，支持多实例部署
 * 
 * 调度策略：
 * - 每月1日凌晨3:00：执行月度结算任务
 * - 每日凌晨4:00：扫描过期返利记录
 *
 * @author poco
 * @date 2025-01-06
 */
@Component
@EnableScheduling
@Slf4j
@AllArgsConstructor
public class JointMarketingScheduler {

    private final IJointMarketingSettlementService settlementService;
    private final DistributedLockService distributedLockService;

    /**
     * 每月1日凌晨3:00执行 - 联合营销月度结算
     * Cron表达式: "0 0 3 1 * ?" 表示每月1日凌晨3:00:00执行
     * 
     * 使用分布式锁确保多实例环境下只执行一次
     */
    @Scheduled(cron = "0 0 3 1 * ?")
    public void monthlySettlement() {
        YearMonth lastMonth = YearMonth.now().minusMonths(1);
        String lockKey = JointMarketingLockKeys.monthlySettlementKey(lastMonth);
        
        distributedLockService.tryLockAndExecute(
            lockKey,
            JointMarketingLockTimeout.MONTHLY_SETTLEMENT,
            () -> executeMonthlySettlement(lastMonth)
        );
    }

    /**
     * 执行月度结算的具体逻辑
     *
     * @param statMonth 统计月份
     */
    private void executeMonthlySettlement(YearMonth statMonth) {
        log.info("========== 开始执行联合营销月度结算任务 ==========");
        long startTime = System.currentTimeMillis();

        try {
            settlementService.executeMonthlySettlement();
            log.info("联合营销月度结算完成，统计月份: {}", statMonth);
        } catch (Exception e) {
            log.error("联合营销月度结算任务失败，统计月份: {}", statMonth, e);
            throw e;
        } finally {
            long costTime = System.currentTimeMillis() - startTime;
            log.info("========== 联合营销月度结算任务完成，耗时: {}ms ==========", costTime);
        }
    }

    /**
     * 每日凌晨4:00执行 - 扫描过期返利记录
     * Cron表达式: "0 0 4 * * ?" 表示每天凌晨4:00:00执行
     * 
     * 使用分布式锁确保多实例环境下只执行一次
     */
    @Scheduled(cron = "0 0 4 * * ?")
    public void expiredRebateScan() {
        LocalDate today = LocalDate.now();
        String lockKey = JointMarketingLockKeys.expiredScanKey(today);
        
        distributedLockService.tryLockAndExecute(
            lockKey,
            JointMarketingLockTimeout.EXPIRED_SCAN,
            () -> executeExpiredRebateScan(today)
        );
    }

    /**
     * 执行过期记录扫描的具体逻辑
     *
     * @param scanDate 扫描日期
     */
    private void executeExpiredRebateScan(LocalDate scanDate) {
        log.info("========== 开始执行联合营销过期记录扫描任务 ==========");
        long startTime = System.currentTimeMillis();

        try {
            settlementService.scanExpiredRebateRecords();
            log.info("联合营销过期记录扫描完成，扫描日期: {}", scanDate);
        } catch (Exception e) {
            log.error("联合营销过期记录扫描任务失败，扫描日期: {}", scanDate, e);
            throw e;
        } finally {
            long costTime = System.currentTimeMillis() - startTime;
            log.info("========== 联合营销过期记录扫描任务完成，耗时: {}ms ==========", costTime);
        }
    }

    /**
     * 手动触发月度结算
     * 可通过Controller接口调用，用于补数据或重跑
     *
     * @param statMonth    统计月份
     * @param forceExecute 是否强制执行（跳过锁检查）
     */
    public void manualMonthlySettlement(YearMonth statMonth, boolean forceExecute) {
        log.info("手动触发联合营销月度结算，统计月份: {}, 强制执行: {}", statMonth, forceExecute);
        
        if (forceExecute) {
            log.warn("强制执行联合营销月度结算，跳过分布式锁检查，统计月份: {}", statMonth);
            executeMonthlySettlement(statMonth);
            return;
        }
        
        String lockKey = JointMarketingLockKeys.monthlySettlementKey(statMonth);
        boolean executed = distributedLockService.tryLockAndExecute(
            lockKey,
            JointMarketingLockTimeout.MONTHLY_SETTLEMENT,
            () -> executeMonthlySettlement(statMonth)
        );
        
        if (!executed) {
            throw new RuntimeException("获取分布式锁失败，任务正在执行中，锁Key: " + lockKey);
        }
    }

    /**
     * 手动触发月度结算（默认不强制执行）
     *
     * @param statMonth 统计月份
     */
    public void manualMonthlySettlement(YearMonth statMonth) {
        manualMonthlySettlement(statMonth, false);
    }

    /**
     * 手动触发过期记录扫描
     * 可通过Controller接口调用
     *
     * @param scanDate     扫描日期
     * @param forceExecute 是否强制执行（跳过锁检查）
     */
    public void manualExpiredRebateScan(LocalDate scanDate, boolean forceExecute) {
        log.info("手动触发联合营销过期记录扫描，扫描日期: {}, 强制执行: {}", scanDate, forceExecute);
        
        if (forceExecute) {
            log.warn("强制执行联合营销过期记录扫描，跳过分布式锁检查，扫描日期: {}", scanDate);
            executeExpiredRebateScan(scanDate);
            return;
        }
        
        String lockKey = JointMarketingLockKeys.expiredScanKey(scanDate);
        boolean executed = distributedLockService.tryLockAndExecute(
            lockKey,
            JointMarketingLockTimeout.EXPIRED_SCAN,
            () -> executeExpiredRebateScan(scanDate)
        );
        
        if (!executed) {
            throw new RuntimeException("获取分布式锁失败，任务正在执行中，锁Key: " + lockKey);
        }
    }

    /**
     * 手动触发过期记录扫描（默认不强制执行）
     *
     * @param scanDate 扫描日期
     */
    public void manualExpiredRebateScan(LocalDate scanDate) {
        manualExpiredRebateScan(scanDate, false);
    }
}
