package cn.joywon.poco.merchant.OrderModule.lock;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 订单模块定时任务锁Key常量
 * 用于分布式锁的唯一标识
 *
 * @author poco
 * @date 2025-01-06
 */
public final class OrderLockKeys {

    private OrderLockKeys() {
        // 私有构造函数，防止实例化
    }

    /**
     * 锁Key前缀
     */
    public static final String PREFIX = "order:scheduler:";

    /**
     * 分账重试锁Key模板
     * 格式: order:scheduler:profit_sharing_retry:2025-01-06T10
     */
    public static final String PROFIT_SHARING_RETRY = PREFIX + "profit_sharing_retry:%s";

    /**
     * 生成分账重试锁Key
     * 按小时生成，确保每小时只执行一次
     *
     * @param dateTime 执行时间
     * @return 锁Key
     */
    public static String profitSharingRetryKey(LocalDateTime dateTime) {
        String hourKey = dateTime.format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH"));
        return String.format(PROFIT_SHARING_RETRY, hourKey);
    }

    /**
     * 生成分账重试锁Key（使用当前时间）
     *
     * @return 锁Key
     */
    public static String profitSharingRetryKey() {
        return profitSharingRetryKey(LocalDateTime.now());
    }
}
