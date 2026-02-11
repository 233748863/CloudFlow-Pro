package cn.joywon.poco.merchant.CouponModule.definition;

public interface CouponKeyConst {


    /**
     * 优惠券模板 Redis key 前缀
     */
    String LOCK_KEY_PREFIX_COUPON_TEMPLATE = "coupon:template:lock:";


    /**
     * 用户优惠券 Redis key 前缀
     */
    String LOCK_KEY_PREFIX_USER_COUPON = "coupon:user:lock:";


    /**
     * 合作优惠券 Redis key 前缀
     */
    String LOCK_KEY_PREFIX_COUPON_COOP = "coupon:coop:lock:";


}