package cn.joywon.poco.merchant.CouponModule.mapper;

import cn.joywon.poco.merchant.CouponModule.bo.UserClaimedCouponCountBO;
import cn.joywon.poco.merchant.CouponModule.entity.UserCoupon;
import cn.joywon.poco.merchant.CouponModule.vo.UserCouponCodeVO;
import cn.joywon.poco.merchant.CouponModule.vo.UserCouponUsableVO;
import com.github.yulichang.base.MPJBaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

@Mapper
public interface UserCouponMapper extends MPJBaseMapper<UserCoupon> {


    /**
     * 检查用户是否领取过列表中优惠券
     *
     * @param couponTemplateIds 优惠券模板ID列表
     * @param userId            用户ID
     * @return 用户领取优惠券次数列表
     */
    List<UserClaimedCouponCountBO> checkCouponHasClaimed(@Param("couponTemplateIds") Collection<Long> couponTemplateIds,
                                                         @Param("userId") Long userId);


    /**
     * 根据用户优惠券ID查询优惠券码信息
     *
     * @param couponId   优惠券ID
     * @param couponCode 优惠券码
     * @return 用户优惠券码信息 111
     */
    UserCouponCodeVO getByIdOrCode(@Param("couponId") Long couponId, @Param("couponCode") String couponCode);


    /**
     * 获取用户未使用优惠券ID列表
     *
     * @param userId 用户ID
     * @return 用户未使用优惠券ID列表
     */
    List<UserCoupon> getUserUnusedCouponTemplateIds(@Param("userId") Long userId);


    /**
     * 查询用户可用优惠券列表
     *
     * @param couponIds 用户优惠券ID列表
     * @return 用户可用优惠券列表
     */
    List<UserCouponUsableVO> queryAvailableCoupons(@Param("couponIds") List<Long> couponIds);


}