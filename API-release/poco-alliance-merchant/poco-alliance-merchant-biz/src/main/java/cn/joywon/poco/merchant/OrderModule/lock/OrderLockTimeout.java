package cn.joywon.poco.merchant.OrderModule.lock;

/**
 * 订单模块定时任务锁超时时间常量
 * 单位：秒
 *
 * @author poco
 * @date 2025-01-06
 */
public final class OrderLockTimeout {

    private OrderLockTimeout() {
        // 私有构造函数，防止实例化
    }

    /**
     * 分账重试任务锁超时时间
     * 每次处理100条订单，设置较短超时
     * 默认: 30分钟
     */
    public static final long PROFIT_SHARING_RETRY = 1800L;
}
