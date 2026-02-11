package cn.joywon.poco.merchant.MerchantModule.controller;

import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MerchantModule.dto.*;
import cn.joywon.poco.merchant.MerchantModule.service.IStoreService;
import cn.joywon.poco.merchant.MerchantModule.vo.AuditStatusVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreInfoVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreQualificationVO;
import cn.joywon.poco.merchant.PlatformModule.service.IStoreAdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@Validated
@RequiredArgsConstructor
@Tag(name = "门店管理(商家PC端)")
@RequestMapping("/merchant/store")
public class StoreController {

    private final IStoreService storeService;
    private final IStoreAdminService storeAdminService;


    /**
     * 创建门店
     *
     * @param dto 门店创建参数
     * @return 响应结果
     */
    @PostMapping("/create")
    @SysLog("商家创建门店创建门店")
    @HasPermission("merchant_merchant_create")
    @Operation(summary = "商家创建门店")
    public R<?> create(@RequestBody @Valid StoreCreateDTO dto) {
        return storeService.create(dto);
    }


    /**
     * 删除门店
     *
     * @param storeId 门店ID
     * @param reason  删除原因
     * @return 响应结果
     */
    @DeleteMapping("/delete")
    @SysLog("商家删除门店")
    @HasPermission("merchant_merchant_delete")
    @Operation(summary = "商家删除门店")
    public R<?> delete(@RequestParam("storeId") String storeId,
                       @RequestParam("reason") String reason) {
        return storeService.delete(Long.valueOf(storeId), reason);
    }


    /**
     * 修改门店信息
     *
     * @param dto 门店信息修改参数
     * @return 响应结果
     */
    @PutMapping("/update/info")
    @SysLog("商家修改门店信息")
    @HasPermission("merchant_merchant_update")
    @Operation(summary = "商家修改门店信息")
    public R<?> updateInfo(@RequestBody @Valid StoreInfoUpdateDTO dto) {
        if (StrUtil.isNotBlank(dto.getAddressDetail())) {
            if (StrUtil.isBlank(dto.getRegionCode())) {
                return R.failed("请填写完整的地址信息");
            }
        }
        return storeService.updateInfo(dto);
    }


    /**
     * 修改门店资质信息
     *
     * @param dto 门店资质信息修改参数
     * @return 响应结果
     */
    @PutMapping("/update/qualification")
    @SysLog("商家修改门店资质信息")
    @HasPermission("merchant_merchant_update")
    @Operation(summary = "商家修改门店资质信息")
    public R<?> updateQualification(@RequestBody @Valid StoreQualificationDTO dto) {
        return storeService.updateQualification(dto);
    }


    /**
     * 修改门店营业状态
     *
     * @param dto 营业状态修改参数
     * @return 响应结果
     */
    @PutMapping("/update/status/biz")
    @SysLog("商家修改门店营业状态")
    @HasPermission("merchant_merchant_update")
    @Operation(summary = "商家修改门店营业状态")
    public R<?> updateBusinessStatus(@RequestBody @Valid StoreBizStatusDTO dto) {
        return storeService.updateBusinessStatus(dto);
    }


    /**
     * 商家获取门店列表
     *
     * @param dto 商家门店列表查询参数
     * @return 响应结果
     */
    @PostMapping("/list")
    @HasPermission("merchant_merchant_info")
    @Operation(summary = "商家获取门店列表")
    public R<PageQueryVO<StoreListVO>> getListByMerchant(@RequestBody @Valid MerchantStoreListDTO dto) {
        return storeService.getListByMerchant(dto);
    }


    /**
     * 获取门店信息详情
     *
     * @param storeId 门店ID
     * @return 响应结果
     */
    @GetMapping("/info")
    @HasPermission("merchant_merchant_info")
    @Operation(summary = "商家获取门店信息")
    public R<StoreInfoVO> getInfo(@RequestParam("storeId") String storeId) {
        return storeService.getInfo(Long.valueOf(storeId));
    }


    /**
     * 获取门店资质信息
     *
     * @param storeId 门店ID
     * @return 响应结果
     */
    @GetMapping("/qualification")
    @HasPermission("merchant_merchant_info")
    @Operation(summary = "商家获取门店资质信息")
    public R<StoreQualificationVO> getQualification(@RequestParam("storeId") String storeId) {
        return storeService.getQualification(Long.valueOf(storeId));
    }


    /**
     * 获取门店当前审核状态
     *
     * @param storeId 门店ID
     * @return 响应结果(门店当前审核状态)
     */
    @GetMapping("/info/audit")
    @HasPermission("merchant_merchant_info")
    @Operation(summary = "商家获取门店当前审核状态")
    public R<AuditStatusVO> getAuditStatus(@RequestParam("storeId") String storeId) {
        return storeAdminService.getAuditStatus(Long.valueOf(storeId));
    }


    /**
     * 获取门店审核历史列表
     *
     * @param storeId  门店ID
     * @param sortDesc 是否按提交审核时间降序排序
     * @return 响应结果(审核历史列表)
     */
    @GetMapping("/list/audit")
    @HasPermission("merchant_merchant_info")
    @Operation(summary = "商家获取门店审核历史列表")
    public R<List<AuditStatusVO>> getAuditHistoryList(@RequestParam("storeId") String storeId,
                                                      @RequestParam(value = "sortDesc", required = false) Boolean sortDesc) {
        return storeAdminService.getAuditHistoryList(Long.valueOf(storeId), sortDesc);
    }


}