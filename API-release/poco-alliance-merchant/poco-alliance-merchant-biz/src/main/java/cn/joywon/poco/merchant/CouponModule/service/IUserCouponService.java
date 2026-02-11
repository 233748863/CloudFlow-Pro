package cn.joywon.poco.merchant.CouponModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.CursorQueryVO;
import cn.joywon.poco.merchant.CouponModule.bo.UserClaimedCouponCountBO;
import cn.joywon.poco.merchant.CouponModule.dto.*;
import cn.joywon.poco.merchant.CouponModule.entity.UserCoupon;
import cn.joywon.poco.merchant.CouponModule.vo.*;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.Collection;
import java.util.List;

public interface IUserCouponService extends IService<UserCoupon> {


    /**
     * 用户领取优惠券
     *
     * @param dto 用户领取优惠券参数
     * @return 处理结果
     */
    R<Boolean> receive(UserReceiveCouponDTO dto);


    /**
     * 用户领取可领取优惠券
     *
     * @param merchantId 商家ID
     * @return 操作结果(领取优惠券数量)
     */
    R<Integer> receiveClaimable(Long merchantId);


    /**
     * 系统自动发放优惠券(指定用户, 带来源信息)
     *
     * @param couponTemplateId 优惠券模板ID
     * @param userId           用户ID
     * @param sourceType       来源类型
     * @param sourceId         来源ID
     * @return 发放的优惠券ID
     */
    Long receiveForUser(Long couponTemplateId, Long userId, String sourceType, Long sourceId);


    /**
     * 用户核销优惠券
     *
     * @param dto 用户核销优惠券参数
     * @return 处理结果
     */
    R<?> redeem(UserCouponRedeemDTO dto);


    /**
     * 商家核销优惠券
     *
     * @param dto 优惠券码参数
     * @return 处理结果
     */
    R<?> redeemByCode(UserCouponCodeDTO dto);


    /**
     * 商家作废用户优惠券
     *
     * @param dto 优惠券码参数
     * @return 处理结果
     */
    R<?> cancelByCode(UserCouponCodeDTO dto);


    /**
     * 根据订单商品查询订单可用优惠券
     *
     * @param dto 获取订单可用优惠券参数
     * @return 查询结果(用户可用优惠券列表)
     */
    R<List<UserCouponUsableVO>> queryOrderAvailableCoupon(UserCouponAvailableDTO dto);


    /**
     * 用户获取可领取优惠券列表
     *
     * @param dto 用户查询可领取优惠券列表参数
     * @return 查询结果(用户可领取优惠券列表)
     */
    R<CursorQueryVO<UserClaimableCouponListVO>> getClaimableList(UserClaimableQueryDTO dto);


    /**
     * 用户查询已领取优惠券列表
     *
     * @param couponStatus 优惠券状态
     * @return 查询结果(用户已领取优惠券列表)
     */
    R<List<UserCouponCollectedListVO>> getCollectedList(String couponStatus);


    /**
     * 用户查询优惠券详情
     *
     * @param couponTemplateId 优惠券模板ID
     * @return 查询结果(优惠券详情)
     */
    R<UserCouponDetailVO> getDetail(Long couponTemplateId);


    /**
     * 用户查询优惠券码
     *
     * @param couponId 用户优惠券ID
     * @return 查询结果(用户优惠券码信息)
     */
    R<UserCouponCodeVO> getCode(Long couponId);


    /**
     * 检查用户是否领取过优惠券
     *
     * @param couponTemplateIds 优惠券模板ID列表
     * @param userId            用户ID
     * @return 查询结果(用户领取优惠券统计)
     */
    List<UserClaimedCouponCountBO> checkCouponHasClaimed(Collection<Long> couponTemplateIds, Long userId);


    /**
     * 商家根据优惠券码获取用户优惠券信息
     *
     * @param couponCode 优惠券码
     * @return 查询结果(用户优惠券码信息)
     */
    R<UserCouponCodeVO> getCouponByCode(String couponCode);


    /**
     * 计算优惠券折扣
     *
     * @param dto 优惠券计算折扣参数
     * @return 优惠券计算折扣结果
     */
    CouponCalculateDiscountVO calculateCouponDiscount(CouponCalculateDiscountDTO dto);


}