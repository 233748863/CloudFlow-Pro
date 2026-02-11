package cn.joywon.poco.merchant.ReportModule.lock;

/**
 * 报表定时任务锁超时时间常量（秒）
 * 定义各类定时任务的锁自动释放时间
 *
 * @author poco
 * @date 2025-01-06
 */
public final class ReportLockTimeout {

    private ReportLockTimeout() {
        // 私有构造函数，防止实例化
    }

    /**
     * 每日报表生成锁超时时间：30分钟
     * 覆盖正常的日报表生成时间
     */
    public static final long DAILY_REPORT = 30 * 60;

    /**
     * 月度账单生成锁超时时间：60分钟
     * 覆盖月度账单生成时间，月度数据量较大需要更长时间
     */
    public static final long MONTHLY_BILL = 60 * 60;

    /**
     * 缓存刷新锁超时时间：5分钟
     * 缓存刷新操作相对较快
     */
    public static final long CACHE_REFRESH = 5 * 60;
}
