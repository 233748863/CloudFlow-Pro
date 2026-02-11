package cn.joywon.poco.merchant.ReportModule.lock;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 报表定时任务锁Key常量
 * 用于分布式锁的唯一标识
 *
 * @author poco
 * @date 2025-01-06
 */
public final class ReportLockKeys {

    private ReportLockKeys() {
        // 私有构造函数，防止实例化
    }

    /**
     * 锁Key前缀
     */
    public static final String PREFIX = "report:scheduler:";

    /**
     * 每日报表生成锁Key模板
     * 格式: report:scheduler:daily:2025-01-06
     */
    public static final String DAILY_REPORT = PREFIX + "daily:%s";

    /**
     * 月度账单生成锁Key模板
     * 格式: report:scheduler:monthly:2025-01
     */
    public static final String MONTHLY_BILL = PREFIX + "monthly:%s";

    /**
     * 缓存刷新锁Key模板
     * 格式: report:scheduler:cache:2025-01-06T14
     */
    public static final String CACHE_REFRESH = PREFIX + "cache:%s";

    /**
     * 生成每日报表锁Key
     *
     * @param date 执行日期
     * @return 锁Key
     */
    public static String dailyReportKey(LocalDate date) {
        return String.format(DAILY_REPORT, date.toString());
    }

    /**
     * 生成月度账单锁Key
     *
     * @param month 执行月份，格式: yyyy-MM
     * @return 锁Key
     */
    public static String monthlyBillKey(String month) {
        return String.format(MONTHLY_BILL, month);
    }

    /**
     * 生成缓存刷新锁Key
     *
     * @param dateTime 执行时间
     * @return 锁Key
     */
    public static String cacheRefreshKey(LocalDateTime dateTime) {
        return String.format(CACHE_REFRESH,
                dateTime.format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH")));
    }
}
