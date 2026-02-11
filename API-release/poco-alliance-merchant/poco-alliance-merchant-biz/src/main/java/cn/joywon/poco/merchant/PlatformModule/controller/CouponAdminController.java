package cn.joywon.poco.merchant.PlatformModule.controller;

import cn.hutool.core.util.ObjectUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.dto.CouponTemplateAuditDTO;
import cn.joywon.poco.merchant.CouponModule.dto.CouponTemplateAuditListDTO;
import cn.joywon.poco.merchant.CouponModule.vo.CouponTemplateAuditDetailVO;
import cn.joywon.poco.merchant.CouponModule.vo.CouponTemplateAuditListVO;
import cn.joywon.poco.merchant.PlatformModule.service.ICouponAdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@Tag(name = "优惠券管理(平台后台端)")
@RequiredArgsConstructor
@RequestMapping("/platform/coupon")
public class CouponAdminController {

    private final ICouponAdminService couponAdminService;


    /**
     * 审核优惠券模板
     *
     * @param dto 优惠券模板审核参数
     * @return 响应结果
     */
    @PutMapping("/audit/handle")
    @SysLog("商家管理(平台后台端)-优惠券模板审核")
    @Operation(summary = "审核优惠券模板")
    public R<?> auditHandle(@RequestBody @Valid CouponTemplateAuditDTO dto) {
        if (ObjectUtil.equals(CouponStatusEnum.TEMPLATE_REJECTED.getValue(), dto.getAuditResult())) {
            if (StrUtil.isBlank(dto.getAuditRemark())) {
                return R.failed("审核失败, 请填写审核拒绝原因");
            }
        }
        return couponAdminService.auditHandle(dto);
    }


    /**
     * 获取优惠券模板列表
     *
     * @param dto 优惠券模板列表参数
     * @return 响应结果(优惠券模板列表)
     */
    @PostMapping("/list")
    @Operation(summary = "获取优惠券模板列表")
    public R<PageQueryVO<CouponTemplateAuditListVO>> getList(@RequestBody @Valid CouponTemplateAuditListDTO dto) {
        return couponAdminService.getList(dto);
    }


    /**
     * 获取优惠券模板详情
     *
     * @param couponTemplateId 优惠券模板ID
     * @return 响应结果(优惠券模板详情)
     */
    @GetMapping("/detail/{couponTemplateId}")
    @Operation(summary = "获取优惠券模板详情")
    public R<CouponTemplateAuditDetailVO> getDetail(@PathVariable("couponTemplateId") Long couponTemplateId) {
        return couponAdminService.getDetail(couponTemplateId);
    }


}