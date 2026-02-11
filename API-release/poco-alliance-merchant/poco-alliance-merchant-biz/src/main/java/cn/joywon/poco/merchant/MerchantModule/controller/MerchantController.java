package cn.joywon.poco.merchant.MerchantModule.controller;

import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MerchantModule.dto.*;
import cn.joywon.poco.merchant.MerchantModule.service.IMerchantService;
import cn.joywon.poco.merchant.MerchantModule.vo.AuditStatusVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantInfoVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantQualificationVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantSimpleInfoVO;
import cn.joywon.poco.merchant.PlatformModule.service.IMerchantAdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@RequiredArgsConstructor
@Tag(name = "商家管理(商家PC端)")
@RequestMapping("/merchant")
public class MerchantController {

    private final IMerchantService merchantService;
    private final IMerchantAdminService merchantAdminService;


    /**
     * 商家申请创建
     *
     * @param dto 商家申请入驻参数
     * @return 响应结果
     */
    @PostMapping("/create")
    @SysLog(value = "商家入驻创建")
    @HasPermission("merchant_merchant_create")
    @Operation(summary = "商家入驻创建")
    public R<?> create(@RequestBody @Valid MerchantCreateDTO dto) {
        return merchantService.create(dto);
    }


    /**
     * 商家信息修改
     *
     * @param dto 商家信息修改参数
     * @return 响应结果
     */
    @PutMapping("/info/update")
    @SysLog(value = "商家信息更新")
    @HasPermission("merchant_merchant_update")
    @Operation(summary = "商家信息更新")
    public R<?> infoUpdate(@RequestBody @Valid MerchantUpdateDTO dto) {
        if (StrUtil.isNotBlank(dto.getAddressDetail())) {
            if (StrUtil.isBlank(dto.getRegionCode())) {
                return R.failed("如需变更地址信息请填写完整有效的地址");
            }
        }
        return merchantService.infoUpdate(dto);
    }


    /**
     * 商家资质信息重新上传
     *
     * @param dto 商家资质信息参数
     * @return 响应结果
     */
    @PutMapping("/qualification/upload")
    @SysLog(value = "商家资质信息重新上传")
    @HasPermission("merchant_merchant_update")
    @Operation(summary = "商家资质信息重新上传")
    public R<?> qualificationUpload(@RequestBody @Valid MerchantQualificationDTO dto) {
        return merchantService.qualificationUpload(dto);
    }


    /**
     * 获取商家简要信息(不需要权限)
     *
     * @param merchantId 商家ID
     * @return 响应结果
     */
    @Inner(value = false)
    @GetMapping("/info/simple")
    @Operation(summary = "获取商家简要信息")
    public R<MerchantSimpleInfoVO> getSimpleInfo(@RequestParam("merchantId") String merchantId) {
        return merchantService.getSimpleInfo(Long.valueOf(merchantId));
    }


    /**
     * 商家获取详情信息
     *
     * @return 响应结果
     */
    @GetMapping("/info")
    @HasPermission("merchant_merchant_info")
    @Operation(summary = "获取商家信息")
    public R<MerchantInfoVO> getInfo() {
        return merchantService.getInfo();
    }


    /**
     * 商家获取资质信息
     *
     * @return 响应结果
     */
    @GetMapping("/qualification")
    @HasPermission("merchant_merchant_info")
    @Operation(summary = "获取商家资质信息")
    public R<MerchantQualificationVO> getQualification() {
        return merchantService.getQualification();
    }


    /**
     * 获取商家审核状态
     *
     * @return 响应结果(当前审核状态)
     */
    @GetMapping("/audit/status")
    @HasPermission("merchant_merchant_info")
    @Operation(summary = "获取商家审核状态")
    public R<AuditStatusVO> getAuditStatus() {
        return merchantAdminService.getAuditStatus();
    }


    /**
     * 获取商家审核记录列表
     *
     * @return 响应结果(商家审核记录列表)
     */
    @PostMapping("/audit/list")
    @HasPermission("merchant_merchant_info")
    @Operation(summary = "获取商家审核历史列表")
    public R<PageQueryVO<AuditStatusVO>> getAuditHistoryList(@RequestBody MerchantAuditQueryDTO dto) {
        return merchantAdminService.getAuditHistoryList(dto);
    }


    /**
     * 获取联合营销邀请商家列表
     *
     * @param dto 联合营销邀请商家查询参数
     * @return 响应结果(联合营销邀请商家信息列表)
     */
    @PostMapping("/list/joint/marketing")
    @Operation(summary = "联合营销功能获取邀请商家列表")
    public R<PageQueryVO<MerchantSimpleInfoVO>> listForInviteJointMarketing(@RequestBody MerchantInviteQueryDTO dto) {
        return merchantService.listForInviteJointMarketing(dto);
    }


}