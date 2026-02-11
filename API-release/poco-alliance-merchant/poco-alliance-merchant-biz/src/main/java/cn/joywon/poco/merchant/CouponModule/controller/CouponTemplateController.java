package cn.joywon.poco.merchant.CouponModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.dto.CouponTemplateCancelDTO;
import cn.joywon.poco.merchant.CouponModule.dto.CouponTemplateCreateDTO;
import cn.joywon.poco.merchant.CouponModule.dto.CouponTemplateQueryListDTO;
import cn.joywon.poco.merchant.CouponModule.dto.UserCouponCodeDTO;
import cn.joywon.poco.merchant.CouponModule.service.ICouponTemplateService;
import cn.joywon.poco.merchant.CouponModule.service.IUserCouponService;
import cn.joywon.poco.merchant.CouponModule.vo.CouponTemplateDetailVO;
import cn.joywon.poco.merchant.CouponModule.vo.CouponTemplateListVO;
import cn.joywon.poco.merchant.CouponModule.vo.UserCouponCodeVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@RequiredArgsConstructor
@Tag(name = "优惠券管理(商家PC端)")
@RequestMapping("/merchant/coupon")
public class CouponTemplateController {

    private final ICouponTemplateService couponTemplateService;
    private final IUserCouponService userCouponService;


    /**
     * 商家创建优惠券
     *
     * @param dto 优惠券模板创建参数
     * @return 响应结果(优惠券模板ID)
     */
    @PostMapping("/create")
    @Operation(summary = "商家创建优惠券")
    @SysLog("商家PC端创建优惠券")
    public R<Long> create(@RequestBody @Valid CouponTemplateCreateDTO dto) {
        return couponTemplateService.create(dto);
    }


    /**
     * 商家作废优惠券
     *
     * @param dto 优惠券作废参数
     * @return 响应结果
     */
    @PutMapping("/cancel")
    @Operation(summary = "商家作废优惠券")
    @SysLog("商家作废优惠券")
    public R<?> cancel(@RequestBody @Valid CouponTemplateCancelDTO dto) {
        return couponTemplateService.cancel(dto);
    }


    /**
     * 商家核销优惠券
     *
     * @param dto 优惠券码参数
     * @return 响应结果
     */
    @PutMapping("/redeem/code")
    @Operation(summary = "商家核销优惠券")
    @SysLog(value = "商家核销优惠券")
    public R<?> redeemByCode(@RequestBody @Valid UserCouponCodeDTO dto) {
        return userCouponService.redeemByCode(dto);
    }


    /**
     * 商家作废用户优惠券
     *
     * @return 响应结果
     */
    @PutMapping("/cancel/code")
    @Operation(summary = "商家作废用户优惠券")
    @SysLog(value = "商家作废用户优惠券")
    public R<?> cancelUserCoupon(@RequestBody @Valid UserCouponCodeDTO dto) {
        return userCouponService.cancelByCode(dto);
    }


    /**
     * 商家查询本商家优惠券列表
     *
     * @param dto 优惠券列表查询参数
     * @return 响应结果(优惠券分页列表)
     */
    @PostMapping("/list")
    @Operation(summary = "商家查询本商家优惠券列表")
    public R<PageQueryVO<CouponTemplateListVO>> queryCouponList(@RequestBody @Valid CouponTemplateQueryListDTO dto) {
        return couponTemplateService.queryCouponList(dto);
    }


    /**
     * 商家查询本商家优惠券详情
     *
     * @param merchantId       商家ID
     * @param couponTemplateId 优惠券模板ID
     * @return 响应结果(优惠券详情)
     */
    @GetMapping("/detail")
    @Operation(summary = "商家获取本商家优惠券详情")
    public R<CouponTemplateDetailVO> getCouponDetail(@RequestParam(value = "merchantId", required = false) Long merchantId,
                                                     @RequestParam("couponTemplateId") Long couponTemplateId) {
        return couponTemplateService.getCouponDetail(merchantId, couponTemplateId);
    }


    /**
     * 商家根据优惠券码获取用户优惠券信息
     *
     * @return 响应结果
     */
    @GetMapping("/info/code")
    @Operation(summary = "根据优惠券码获取优惠券信息")
    public R<UserCouponCodeVO> getCouponByCode(@RequestParam("couponCode") String couponCode) {
        return userCouponService.getCouponByCode(couponCode);
    }


}