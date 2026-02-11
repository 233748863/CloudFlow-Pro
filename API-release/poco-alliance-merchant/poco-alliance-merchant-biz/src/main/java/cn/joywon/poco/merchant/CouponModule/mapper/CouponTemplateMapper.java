package cn.joywon.poco.merchant.CouponModule.mapper;

import cn.joywon.poco.merchant.CouponModule.bo.MerchantCouponGroupBO;
import cn.joywon.poco.merchant.CouponModule.entity.CouponTemplate;
import cn.joywon.poco.merchant.CouponModule.vo.MiniCouponIndexShowVO;
import cn.joywon.poco.merchant.CouponModule.vo.UserClaimableCouponListVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.yulichang.base.MPJBaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

@Mapper
public interface CouponTemplateMapper extends MPJBaseMapper<CouponTemplate> {


    /**
     * 用户查询可领取优惠券列表
     *
     * @param merchantIds 商家ID列表
     * @return 用户可领取优惠券分页列表
     */
    List<UserClaimableCouponListVO> queryUserClaimableCoupons(@Param("merchantIds") Collection<Long> merchantIds);


    /**
     * 【用户端】
     * 根据商家ID列表查询商家优惠券分组列表
     *
     * @param merchantIds 商家ID列表
     * @return 优惠券分组列表
     */
    List<MerchantCouponGroupBO> queryMerchantCouponGroups(@Param("merchantIds") Collection<Long> merchantIds);


    /**
     * 【用户端】
     * 根据商家ID查询商家优惠券列表
     *
     * @param page       分页参数
     * @param merchantId 商家ID
     * @return 优惠券分页列表
     */
    Page<MiniCouponIndexShowVO> getMerchantCoupons(@Param("page") Page<Object> page,
                                                   @Param("merchantId") Long merchantId);


}