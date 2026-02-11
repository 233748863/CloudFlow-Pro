package cn.joywon.poco.merchant.PlatformModule.controller;

import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.dto.AuditResultDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.StoreAuditQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.StoreListDTO;
import cn.joywon.poco.merchant.MerchantModule.service.IStoreService;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreAuditDetailVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreAuditListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreDetailVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreListVO;
import cn.joywon.poco.merchant.PlatformModule.service.IStoreAdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@Tag(name = "门店管理(平台后台端)")
@RequiredArgsConstructor
@RequestMapping("/platform/store")
public class StoreAdminController {

    private final IStoreService storeService;
    private final IStoreAdminService storeAuditService;


    /**
     * 重建门店缓存
     *
     * @return 响应结果
     */
    @PutMapping("cache/rebuild")
    @Operation(summary = "重建门店缓存")
//    @HasPermission("platform_cache_rebuild")
    @SysLog(value = "重建门店缓存")
    public R<?> rebuildStoreCache() {
        return storeService.rebuildStoreCache();
    }


    /**
     * 审核门店信息
     *
     * @param dto 审核参数
     * @return 响应结果
     */
    @PutMapping("/audit/handle")
    @HasPermission("platform_merchant_audit")
    @SysLog(value = "审核门店信息")
    @Operation(summary = "审核门店信息(新增/修改/营业状态)")
    public R<?> auditHandle(@RequestBody @Valid AuditResultDTO dto) {
        if (ObjUtil.equals(dto.getAuditResult(), AuditStatusEnum.REJECTED.getValue())) {
            if (StrUtil.isBlank(dto.getAuditRemark())) {
                return R.failed("请填写审核拒绝原因");
            }
        }
        return storeAuditService.auditHandle(dto);
    }


    /**
     * 查询门店审核列表
     *
     * @param dto 查询参数
     * @return 响应结果(门店审核列表)
     */
    @PostMapping("/audit/list")
    @HasPermission("platform_merchant_info")
    @Operation(summary = "查询门店审核列表")
    public R<PageQueryVO<StoreAuditListVO>> queryAuditList(@RequestBody @Valid StoreAuditQueryDTO dto) {
        return storeAuditService.queryAuditList(dto);
    }


    /**
     * 获取门店审核详情
     *
     * @param auditId 审核记录ID
     * @return 响应结果(门店审核详情)
     */
    @GetMapping("/audit/detail/{auditId}")
    @HasPermission("platform_merchant_info")
    @Operation(summary = "获取审核详情")
    public R<StoreAuditDetailVO> getAuditDetail(@PathVariable("auditId") String auditId) {
        return storeAuditService.getAuditDetail(Long.valueOf(auditId));
    }


    /**
     * 查询门店列表
     *
     * @param dto 查询参数
     * @return 响应结果(门店列表)
     */
    @PostMapping("/list")
    @HasPermission("platform_merchant_info")
    @Operation(summary = "查询门店列表")
    public R<PageQueryVO<StoreListVO>> queryStoreList(@RequestBody @Valid StoreListDTO dto) {
        return storeService.queryStoreList(dto);
    }


    /**
     * 获取门店详情
     *
     * @param storeId 门店ID
     * @return 响应结果(门店详情)
     */
    @GetMapping("/detail/{storeId}")
    @HasPermission("platform_merchant_info")
    @Operation(summary = "获取门店详情")
    public R<StoreDetailVO> getDetail(@PathVariable("storeId") String storeId) {
        return storeAuditService.getDetail(Long.valueOf(storeId));
    }


}