package cn.joywon.poco.merchant.CouponModule.lock;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * 联合营销定时任务锁Key常量
 * 用于分布式锁的唯一标识
 *
 * @author poco
 * @date 2025-01-06
 */
public final class JointMarketingLockKeys {

    private JointMarketingLockKeys() {
        // 私有构造函数，防止实例化
    }

    /**
     * 锁Key前缀
     */
    public static final String PREFIX = "joint_marketing:scheduler:";

    /**
     * 月度结算锁Key模板
     * 格式: joint_marketing:scheduler:settlement:2025-01
     */
    public static final String MONTHLY_SETTLEMENT = PREFIX + "settlement:%s";

    /**
     * 过期记录扫描锁Key模板
     * 格式: joint_marketing:scheduler:expired_scan:2025-01-06
     */
    public static final String EXPIRED_SCAN = PREFIX + "expired_scan:%s";

    /**
     * 联合营销结算任务锁Key
     */
    public static final String JOINT_MARKETING_SETTLEMENT_LOCK = "joint:marketing:settlement:lock";

    /**
     * 联合营销结算任务记录批次大小
     */
    public static final int SETTLEMENT_RECORD_BATCH_SIZE = 100;

    /**
     * 生成月度结算锁Key
     *
     * @param month 执行月份
     * @return 锁Key
     */
    public static String monthlySettlementKey(YearMonth month) {
        return String.format(MONTHLY_SETTLEMENT, month.toString());
    }

    /**
     * 生成月度结算锁Key（使用字符串格式）
     *
     * @param month 执行月份，格式: yyyy-MM
     * @return 锁Key
     */
    public static String monthlySettlementKey(String month) {
        return String.format(MONTHLY_SETTLEMENT, month);
    }

    /**
     * 生成过期记录扫描锁Key
     *
     * @param date 执行日期
     * @return 锁Key
     */
    public static String expiredScanKey(LocalDate date) {
        return String.format(EXPIRED_SCAN, date.toString());
    }
}
