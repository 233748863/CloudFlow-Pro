package cn.joywon.poco.merchant.CouponModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.bo.MerchantCouponGroupBO;
import cn.joywon.poco.merchant.CouponModule.dto.CouponTemplateCancelDTO;
import cn.joywon.poco.merchant.CouponModule.dto.CouponTemplateCreateDTO;
import cn.joywon.poco.merchant.CouponModule.dto.CouponTemplateQueryListDTO;
import cn.joywon.poco.merchant.CouponModule.entity.CouponTemplate;
import cn.joywon.poco.merchant.CouponModule.vo.*;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.Collection;
import java.util.List;

public interface ICouponTemplateService extends IService<CouponTemplate> {


    /**
     * 创建优惠券
     *
     * @param dto 优惠券模板创建参数
     * @return 操作结果(优惠券模板ID)
     */
    R<Long> create(CouponTemplateCreateDTO dto);


    /**
     * 商家作废优惠券
     *
     * @param dto 优惠券作废参数
     * @return 操作结果
     */
    R<?> cancel(CouponTemplateCancelDTO dto);


    /**
     * 商家查询本商家优惠券列表
     *
     * @param dto 优惠券列表查询参数
     * @return 查询结果(优惠券分页列表)
     */
    R<PageQueryVO<CouponTemplateListVO>> queryCouponList(CouponTemplateQueryListDTO dto);


    /**
     * 商家查询本商家优惠券详情
     *
     * @param merchantId       商家ID
     * @param couponTemplateId 优惠券模板ID
     * @return 查询结果(优惠券详情)
     */
    R<CouponTemplateDetailVO> getCouponDetail(Long merchantId, Long couponTemplateId);


    /**
     * 用户查询可领取优惠券列表
     *
     * @param merchantIds 商家ID列表
     * @return 查询结果(用户可领取优惠券分页列表)
     */
    List<UserClaimableCouponListVO> queryUserClaimableCoupons(Collection<Long> merchantIds);


    /**
     * 【用户端】
     * 根据商家ID列表查询商家优惠券分组列表
     *
     * @param merchantIds 商家ID列表
     * @return 查询结果(优惠券分组列表)
     */
    List<MerchantCouponGroupBO> queryMerchantCouponGroups(Collection<Long> merchantIds);


    /**
     * 【用户端】
     * 根据商家ID查询商家优惠券列表
     *
     * @param page       分页参数
     * @param merchantId 商家ID
     * @return 查询结果(优惠券分页列表)
     */
    Page<MiniCouponIndexShowVO> getMerchantCoupons(Page<Object> page, Long merchantId);


}