package cn.joywon.poco.merchant.PlatformModule.controller;

import cn.hutool.core.util.ObjectUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.dto.AuditResultDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.MerchantAuditQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.MerchantCreateDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.MerchantListDTO;
import cn.joywon.poco.merchant.MerchantModule.service.IMerchantService;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantAuditDetailVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantAuditListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantDetailVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantListVO;
import cn.joywon.poco.merchant.PlatformModule.dto.MerchantCreateByPlatformDTO;
import cn.joywon.poco.merchant.PlatformModule.service.IMerchantAdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@Tag(name = "商家管理(平台后台端)")
@RequiredArgsConstructor
@RequestMapping("/platform/merchant")
public class MerchantAdminController {

    private final IMerchantService merchantService;
    private final IMerchantAdminService merchantAdminService;


    /**
     * 平台创建商家
     *
     * @param dto 商家创建参数
     * @return 响应结果
     */
    @PostMapping("/create")
    @SysLog(value = "平台创建商家")
    @Operation(summary = "平台创建商家")
    @HasPermission("platform_merchant_create")
    public R<?> createMerchant(@RequestBody @Valid MerchantCreateByPlatformDTO dto) {
        MerchantCreateDTO merchant = merchantAdminService.createMerchantPlatformAccount(dto);
        return merchantService.create(merchant);
    }


    /**
     * 商家信息审核
     *
     * @param dto 审核参数
     * @return 响应结果
     */
    @PutMapping("/audit/handle")
    @SysLog(value = "商家信息审核")
    @HasPermission("platform_merchant_audit")
    @Operation(summary = "商家信息审核")
    public R<?> auditHandle(@RequestBody @Valid AuditResultDTO dto) {
        if (ObjectUtil.equals(dto.getAuditResult(), AuditStatusEnum.REJECTED.getValue())) {
            if (StrUtil.isBlank(dto.getAuditRemark())) {
                return R.failed("审核拒绝必须填写拒绝原因");
            }
        }
        return merchantAdminService.auditHandle(dto);
    }


    /**
     * 获取商家列表
     *
     * @param dto 商家列表查询参数
     * @return 响应结果(商家列表分页)
     */
    @PostMapping("/list")
    @HasPermission("platform_merchant_info")
    @Operation(summary = "获取商家列表")
    public R<PageQueryVO<MerchantListVO>> getList(@RequestBody @Valid MerchantListDTO dto) {
        return merchantService.getList(dto);
    }


    /**
     * 获取商家审核列表
     *
     * @param dto 审核列表查询参数
     * @return 响应结果(商家审核列表分页)
     */
    @PostMapping("/audit/list")
    @HasPermission("platform_merchant_info")
    @Operation(summary = "获取商家审核列表")
    public R<PageQueryVO<MerchantAuditListVO>> getAuditList(@RequestBody @Valid MerchantAuditQueryDTO dto) {
        if (dto.getStartDate() != null && dto.getEndDate() != null) {
            if (dto.getStartDate().isAfter(dto.getEndDate())) {
                return R.failed("查询开始时间不能晚于查询结束时间");
            }
        }
        return merchantAdminService.getAuditList(dto);
    }


    /**
     * 获取商家详情
     *
     * @param merchantId 商家ID
     * @return 响应结果(商家详情)
     */
    @GetMapping("/detail/{merchantId}")
    @HasPermission("platform_merchant_info")
    @Operation(summary = "获取商家详情")
    public R<MerchantDetailVO> getDetail(@PathVariable("merchantId") String merchantId) {
        return merchantAdminService.getDetail(Long.valueOf(merchantId));
    }


    /**
     * 获取商家审核详情
     *
     * @param auditId 审核记录ID
     * @return 响应结果(商家待审核详情)
     */
    @GetMapping("/audit/{auditId}")
    @HasPermission("platform_merchant_info")
    @Operation(summary = "获取商家待审核详情")
    public R<MerchantAuditDetailVO> getAuditDetail(@PathVariable("auditId") String auditId) {
        return merchantAdminService.getAuditDetail(Long.valueOf(auditId));
    }


    /**
     * 生成商家绑定微信身份二维码
     *
     * @param merchantId 商家ID
     * @return 响应结果
     */
    @GetMapping("/bindCode")
    @HasPermission("platform_merchant_info")
    @SysLog(value = "生成商家绑定微信身份小程序码")
    @Operation(summary = "生成商家绑定微信身份小程序码")
    public R<?> generateMerchantBindWxCode(@RequestParam("merchantId") String merchantId) {
        byte[] qrCode = merchantAdminService.generateMerchantBindWxCode(merchantId);
        return qrCode == null ? R.failed("生成小程序码失败") : R.ok(qrCode);
    }


}