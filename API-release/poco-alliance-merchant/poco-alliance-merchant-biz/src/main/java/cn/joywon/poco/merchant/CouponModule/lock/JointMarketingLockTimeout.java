package cn.joywon.poco.merchant.CouponModule.lock;

/**
 * 联合营销定时任务锁超时时间常量
 * 单位：秒
 *
 * @author poco
 * @date 2025-01-06
 */
public final class JointMarketingLockTimeout {

    private JointMarketingLockTimeout() {
        // 私有构造函数，防止实例化
    }

    /**
     * 月度结算任务锁超时时间
     * 结算任务可能涉及大量记录处理和远程调用，设置较长超时
     * 默认: 2小时
     */
    public static final long MONTHLY_SETTLEMENT = 7200L;

    /**
     * 过期记录扫描任务锁超时时间
     * 扫描任务相对轻量，设置较短超时
     * 默认: 30分钟
     */
    public static final long EXPIRED_SCAN = 1800L;
}
