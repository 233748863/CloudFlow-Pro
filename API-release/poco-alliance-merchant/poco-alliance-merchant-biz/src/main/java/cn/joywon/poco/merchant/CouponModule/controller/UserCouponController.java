package cn.joywon.poco.merchant.CouponModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.merchant.Common.page.CursorQueryVO;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.dto.*;
import cn.joywon.poco.merchant.CouponModule.service.IUserCouponService;
import cn.joywon.poco.merchant.CouponModule.vo.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@Validated
@RequiredArgsConstructor
@Tag(name = "优惠券功能(用户端)")
@RequestMapping("/user/coupon")
public class UserCouponController {

    private final IUserCouponService userCouponService;


    /**
     * 用户领取优惠券
     *
     * @param dto 用户领取优惠券参数
     * @return 响应结果
     */
    @PostMapping("/receive")
    @Operation(summary = "用户领取优惠券")
    @SysLog(value = "用户领取优惠券")
    public R<Boolean> receive(@RequestBody @Valid UserReceiveCouponDTO dto) {
        return userCouponService.receive(dto);
    }


    /**
     * 用户领取可领取优惠券
     *
     * @param merchantId 商家ID
     * @return 响应结果(领取优惠券数量)
     */
    @PutMapping("/claimable")
    @Operation(summary = "用户领取可领取优惠券")
    @SysLog(value = "用户领取可领取优惠券")
    public R<Integer> receiveClaimable(@RequestParam("merchantId") String merchantId) {
        return userCouponService.receiveClaimable(Long.valueOf(merchantId));
    }


    /**
     * 用户核销优惠券
     *
     * @param dto 用户核销优惠券参数
     * @return 响应结果
     */
    @PostMapping("/redeem")
    @Operation(summary = "用户核销优惠券")
    @SysLog(value = "用户核销优惠券")
    public R<?> redeem(@RequestBody @Valid UserCouponRedeemDTO dto) {
        return userCouponService.redeem(dto);
    }


    /**
     * 根据订单商品查询订单可用优惠券
     *
     * @param dto 获取订单可用优惠券参数
     * @return 响应结果(用户可用优惠券列表)
     */
    @PostMapping("/usable/order")
    @Operation(summary = "根据订单商品查询订单可用优惠券")
    public R<List<UserCouponUsableVO>> queryOrderAvailableCoupons(@RequestBody @Valid UserCouponAvailableDTO dto) {
        return userCouponService.queryOrderAvailableCoupon(dto);
    }


    /**
     * 用户获取可领取优惠券列表
     *
     * @param dto 用户查询可领取优惠券列表参数
     * @return 响应结果(用户可领取优惠券列表)
     */
    @PostMapping("/list/claimable")
    @Operation(summary = "用户查询可领取优惠券列表")
    public R<CursorQueryVO<UserClaimableCouponListVO>> getClaimableList(@RequestBody @Valid UserClaimableQueryDTO dto) {
        return userCouponService.getClaimableList(dto);
    }


    /**
     * 用户查询已领取优惠券列表
     *
     * @param couponStatus 优惠券状态
     * @return 响应结果(用户已领取优惠券列表)
     */
    @GetMapping("/list/collected/{couponStatus}")
    @Operation(summary = "用户查询已领取优惠券列表")
    public R<List<UserCouponCollectedListVO>> getCollectedList(@Pattern(message = "无效的优惠券状态",
            regexp = CouponStatusEnum.USER_COUPON_STATUS_REGEX_PATTERN)
                                                               @PathVariable("couponStatus") String couponStatus) {
        return userCouponService.getCollectedList(couponStatus);
    }


    /**
     * 用户查询优惠券详情
     *
     * @param couponTemplateId 优惠券模板ID
     * @return 响应结果(用户优惠券详情)
     */
    @GetMapping("/detail/{couponId}")
    @Operation(summary = "用户查询优惠券详情")
    public R<UserCouponDetailVO> getDetail(@PathVariable("couponId") String couponTemplateId) {
        return userCouponService.getDetail(Long.valueOf(couponTemplateId));
    }


    /**
     * 用户查询优惠券码
     *
     * @param couponId 用户优惠券ID
     * @return 响应结果(用户优惠券码信息)
     */
    @GetMapping("/code/{couponId}")
    @Operation(summary = "用户查询优惠券码")
    public R<UserCouponCodeVO> getCode(@PathVariable("couponId") String couponId) {
        return userCouponService.getCode(Long.valueOf(couponId));
    }


    /**
     * 计算优惠券折扣
     *
     * @param dto 计算优惠券折扣参数
     * @return 响应结果(计算结果)
     */
    @PostMapping("/calculate")
    @Operation(summary = "计算优惠券折扣")
    public R<CouponCalculateDiscountVO> calculateCouponDiscount(@RequestBody @Valid CouponCalculateDiscountDTO dto) {
        CouponCalculateDiscountVO calculateResult = userCouponService.calculateCouponDiscount(dto);
        return R.ok(calculateResult);
    }


}