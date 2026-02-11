package cn.joywon.poco.merchant.ReportModule.scheduler;

import cn.joywon.poco.merchant.ReportModule.lock.ReportLockKeys;
import cn.joywon.poco.merchant.ReportModule.lock.ReportLockTimeout;
import cn.joywon.poco.merchant.ReportModule.service.DistributedLockService;
import cn.joywon.poco.merchant.ReportModule.service.ReportCacheService;
import cn.joywon.poco.merchant.ReportModule.service.ReportGenerateService;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;

/**
 * 报表定时任务调度器
 * 使用Spring原生@Scheduled注解实现定时任务
 * 集成Redisson分布式锁，支持多实例部署
 * 
 * 调度策略：
 * - 每日凌晨2:00：生成前一天的所有日报表
 * - 每月1日凌晨3:00：生成上月的月度账单
 * - 每小时整点：刷新热点报表缓存（可选）
 *
 * @author poco
 * @date 2025-01-05
 */
@Component
@EnableScheduling
@Slf4j
@AllArgsConstructor
public class ReportScheduler {

    private final ReportGenerateService reportGenerateService;
    private final ReportCacheService reportCacheService;
    private final DistributedLockService distributedLockService;

    /**
     * 每日凌晨2:00执行 - 生成前一天的报表数据
     * Cron表达式: 秒 分 时 日 月 周
     * "0 0 2 * * ?" 表示每天凌晨2:00:00执行
     * 
     * 使用分布式锁确保多实例环境下只执行一次
     */
    @Scheduled(cron = "0 0 2 * * ?")
    public void dailyReportGenerate() {
        LocalDate yesterday = LocalDate.now().minusDays(1);
        String lockKey = ReportLockKeys.dailyReportKey(yesterday);
        
        distributedLockService.tryLockAndExecute(
            lockKey,
            ReportLockTimeout.DAILY_REPORT,
            () -> executeDailyReportGenerate(yesterday)
        );
    }

    /**
     * 执行每日报表生成的具体逻辑
     *
     * @param statDate 统计日期
     */
    private void executeDailyReportGenerate(LocalDate statDate) {
        log.info("========== 开始执行每日报表生成任务 ==========");
        long startTime = System.currentTimeMillis();
        int successCount = 0;
        int failCount = 0;

        try {
            // 1. 生成门店经营日报
            try {
                reportGenerateService.generateStoreDailyStats(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成门店经营日报失败", e);
                failCount++;
            }

            // 2. 生成商品销售日报
            try {
                reportGenerateService.generateGoodsSalesDaily(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成商品销售日报失败", e);
                failCount++;
            }

            // 3. 生成分类销售汇总
            try {
                reportGenerateService.generateCategorySalesSummary(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成分类销售汇总失败", e);
                failCount++;
            }

            // 4. 生成退款分析
            try {
                reportGenerateService.generateRefundAnalysis(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成退款分析失败", e);
                failCount++;
            }

            // 5. 生成时段销售趋势
            try {
                reportGenerateService.generateHourlySales(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成时段销售趋势失败", e);
                failCount++;
            }

            // 6. 生成商家结算日报
            try {
                reportGenerateService.generateMerchantSettlementDaily(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成商家结算日报失败", e);
                failCount++;
            }

            // 7. 生成支付渠道对账
            try {
                reportGenerateService.generatePayChannelReconcile(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成支付渠道对账失败", e);
                failCount++;
            }

            // 8. 生成应收账款
            try {
                reportGenerateService.generateReceivable(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成应收账款失败", e);
                failCount++;
            }

            // 9. 生成积分流水
            try {
                reportGenerateService.generatePointsFlow(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成积分流水失败", e);
                failCount++;
            }

            // 10. 生成优惠券分析
            try {
                reportGenerateService.generateCouponAnalysis(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成优惠券分析失败", e);
                failCount++;
            }

            // 11. 生成用户消费分析
            try {
                reportGenerateService.generateUserConsumption(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成用户消费分析失败", e);
                failCount++;
            }

            // 12. 生成联合营销效果
            try {
                reportGenerateService.generateJointMarketing(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成联合营销效果失败", e);
                failCount++;
            }

            // 13. 生成代理佣金
            try {
                reportGenerateService.generateAgentCommission(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成代理佣金失败", e);
                failCount++;
            }

            // 14. 生成平台概览
            try {
                reportGenerateService.generatePlatformOverview(statDate);
                successCount++;
            } catch (Exception e) {
                log.error("生成平台概览失败", e);
                failCount++;
            }

            // 清除所有报表缓存，确保查询获取最新数据
            try {
                reportCacheService.evictCache("*");
                log.info("已清除所有报表缓存");
            } catch (Exception e) {
                log.warn("清除报表缓存失败", e);
            }

        } finally {
            long costTime = System.currentTimeMillis() - startTime;
            log.info("========== 每日报表生成任务完成 ==========");
            log.info("统计日期: {}, 成功: {}, 失败: {}, 耗时: {}ms", 
                statDate, successCount, failCount, costTime);
        }
    }

    /**
     * 每月1日凌晨3:00执行 - 生成上月账单
     * Cron表达式: "0 0 3 1 * ?" 表示每月1日凌晨3:00:00执行
     * 
     * 使用分布式锁确保多实例环境下只执行一次
     */
    @Scheduled(cron = "0 0 3 1 * ?")
    public void monthlyBillGenerate() {
        String lastMonth = YearMonth.now().minusMonths(1).toString();
        String lockKey = ReportLockKeys.monthlyBillKey(lastMonth);
        
        distributedLockService.tryLockAndExecute(
            lockKey,
            ReportLockTimeout.MONTHLY_BILL,
            () -> executeMonthlyBillGenerate(lastMonth)
        );
    }

    /**
     * 执行月度账单生成的具体逻辑
     *
     * @param statMonth 统计月份
     */
    private void executeMonthlyBillGenerate(String statMonth) {
        log.info("========== 开始执行月度账单生成任务 ==========");
        long startTime = System.currentTimeMillis();

        try {
            reportGenerateService.generateMerchantMonthlyBill(statMonth);
            
            // 清除月度账单缓存
            reportCacheService.evictCache(ReportCacheService.REPORT_MONTHLY_BILL);
            
            log.info("月度账单生成完成，统计月份: {}", statMonth);
        } catch (Exception e) {
            log.error("月度账单生成任务失败，统计月份: {}", statMonth, e);
            throw e;
        } finally {
            long costTime = System.currentTimeMillis() - startTime;
            log.info("========== 月度账单生成任务完成，耗时: {}ms ==========", costTime);
        }
    }

    /**
     * 每小时整点执行 - 刷新热点报表缓存（可选）
     * Cron表达式: "0 0 * * * ?" 表示每小时整点执行
     * 
     * 使用分布式锁确保多实例环境下只执行一次
     * 
     * 刷新策略：
     * - 清除平台概览缓存（实时性要求高）
     * - 清除门店日报缓存（查询频率高）
     */
    @Scheduled(cron = "0 0 * * * ?")
    public void hourlyRefreshCache() {
        String lockKey = ReportLockKeys.cacheRefreshKey(LocalDateTime.now());
        
        distributedLockService.tryLockAndExecute(
            lockKey,
            ReportLockTimeout.CACHE_REFRESH,
            this::executeHourlyRefreshCache
        );
    }

    /**
     * 执行缓存刷新的具体逻辑
     */
    private void executeHourlyRefreshCache() {
        log.info("开始刷新热点报表缓存");
        
        try {
            // 刷新平台概览缓存
            reportCacheService.evictCache(ReportCacheService.REPORT_PLATFORM_OVERVIEW);
            
            // 刷新门店日报缓存
            reportCacheService.evictCache(ReportCacheService.REPORT_STORE_DAILY);
            
            // 刷新时段销售缓存
            reportCacheService.evictCache(ReportCacheService.REPORT_HOURLY_SALES);
            
            log.info("热点报表缓存刷新完成");
        } catch (Exception e) {
            log.warn("热点报表缓存刷新失败", e);
            throw e;
        }
    }

    /**
     * 手动触发指定日期的报表生成
     * 可通过Controller接口调用，用于补数据或重跑
     * 使用与定时任务相同的分布式锁机制
     *
     * @param statDate     统计日期
     * @param forceExecute 是否强制执行（跳过锁检查，仅限紧急情况）
     */
    public void manualGenerateDailyReport(LocalDate statDate, boolean forceExecute) {
        log.info("手动触发报表生成，统计日期: {}, 强制执行: {}", statDate, forceExecute);
        
        if (forceExecute) {
            // 强制执行，跳过锁检查
            log.warn("强制执行每日报表生成，跳过分布式锁检查，统计日期: {}", statDate);
            executeDailyReportGenerate(statDate);
            return;
        }
        
        String lockKey = ReportLockKeys.dailyReportKey(statDate);
        boolean executed = distributedLockService.tryLockAndExecute(
            lockKey,
            ReportLockTimeout.DAILY_REPORT,
            () -> executeDailyReportGenerate(statDate)
        );
        
        if (!executed) {
            throw new RuntimeException("获取分布式锁失败，任务正在执行中，锁Key: " + lockKey);
        }
    }

    /**
     * 手动触发指定日期的报表生成（默认不强制执行）
     *
     * @param statDate 统计日期
     */
    public void manualGenerateDailyReport(LocalDate statDate) {
        manualGenerateDailyReport(statDate, false);
    }

    /**
     * 手动触发指定月份的月度账单生成
     * 使用与定时任务相同的分布式锁机制
     *
     * @param statMonth    统计月份，格式：YYYY-MM
     * @param forceExecute 是否强制执行（跳过锁检查，仅限紧急情况）
     */
    public void manualGenerateMonthlyBill(String statMonth, boolean forceExecute) {
        log.info("手动触发月度账单生成，统计月份: {}, 强制执行: {}", statMonth, forceExecute);
        
        if (forceExecute) {
            // 强制执行，跳过锁检查
            log.warn("强制执行月度账单生成，跳过分布式锁检查，统计月份: {}", statMonth);
            executeMonthlyBillGenerate(statMonth);
            return;
        }
        
        String lockKey = ReportLockKeys.monthlyBillKey(statMonth);
        boolean executed = distributedLockService.tryLockAndExecute(
            lockKey,
            ReportLockTimeout.MONTHLY_BILL,
            () -> executeMonthlyBillGenerate(statMonth)
        );
        
        if (!executed) {
            throw new RuntimeException("获取分布式锁失败，任务正在执行中，锁Key: " + lockKey);
        }
    }

    /**
     * 手动触发指定月份的月度账单生成（默认不强制执行）
     *
     * @param statMonth 统计月份，格式：YYYY-MM
     */
    public void manualGenerateMonthlyBill(String statMonth) {
        manualGenerateMonthlyBill(statMonth, false);
    }
}
