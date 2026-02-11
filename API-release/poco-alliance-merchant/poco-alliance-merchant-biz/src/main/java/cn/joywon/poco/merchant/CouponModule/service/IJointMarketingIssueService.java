package cn.joywon.poco.merchant.CouponModule.service;

import cn.joywon.poco.merchant.OrderModule.entity.Order;

import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingAllocation;
import java.util.List;

/**
 * 联合营销发券服务接口
 */
public interface IJointMarketingIssueService {

    /**
     * 获 取联合营销分润配置 (用于订单核销时的实时分账)
     *
     * @param ruleId 规则ID (对应 UserCoupon 的 sourceId)
     * @return 分润配置列表
     */
    List<JointMarketingAllocation> getProfitSharingAllocations(Long ruleId);

    /**
     * 更新联合营销返利记录状态为已结算 (当订单分账成功后调用)
     *
     * @param couponId 优惠券ID
     * @param allocationId 分润配置ID
     */
    void updateRebateStatusToSettled(Long couponId, Long allocationId);

    /**
     * 触发联合营销发券
     *
     * @param order 订单信息
     */
    void triggerIssue(Order order);

    /**
     * 检查订单是否使用了联合营销优惠券
     *
     * @param orderId 订单ID
     * @return true-已使用; false-未使用
     */
    boolean checkCouponsUsed(Long orderId);

    /**
     * 作废订单关联的联合营销优惠券
     *
     * @param orderId 订单ID
     */
    void invalidateCoupons(Long orderId);

    /**
     * 优惠券核销时更新返利记录状态
     *
     * @param couponId 优惠券ID
     */
    void updateRebateStatusOnCouponVerify(Long couponId);
}
