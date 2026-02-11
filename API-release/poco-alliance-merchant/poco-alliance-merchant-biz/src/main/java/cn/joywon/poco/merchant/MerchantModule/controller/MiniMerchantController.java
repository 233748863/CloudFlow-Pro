package cn.joywon.poco.merchant.MerchantModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.merchant.Common.page.CursorQueryVO;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MerchantModule.dto.MiniStoreQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.service.IMiniMerchantService;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantIndexVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantInfoVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantQualificationVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/mini/merchant")
@Tag(name = "小程序商家功能")
public class MiniMerchantController {

    private final IMiniMerchantService miniMerchantService;


    /**
     * 查询范围内商家列表
     *
     * @param dto 查询参数
     * @return 响应结果(距离升序商家列表)
     */
    @Inner(value = false)
    @PostMapping("/list")
    @Operation(summary = "查询范围内商家列表")
    public R<CursorQueryVO<MiniMerchantListVO>> queryMerchantByRadiusAndIndustry(@RequestBody @Valid MiniStoreQueryDTO dto) {
        return miniMerchantService.queryMerchantByRadiusAndIndustry(dto);
    }


    /**
     * 根据名称查询商家列表
     *
     * @param dto 查询参数
     * @return 响应结果(距离升序商家分页列表)
     */
    @Inner(value = false)
    @PostMapping("/list/name")
    @Operation(summary = "根据名称查询商家列表")
    public R<PageQueryVO<MiniMerchantListVO>> queryMerchantByName(@RequestBody @Valid MiniStoreQueryDTO dto) {
        return miniMerchantService.queryMerchantByName(dto);
    }


    /**
     * 获取商家首页
     *
     * @param merchantId 商家ID
     * @param longitude  用户地理经度
     * @param latitude   用户地理纬度
     * @return 响应结果(商家首页)
     */
    @Inner(value = false)
    @GetMapping("/index")
    @Operation(summary = "获取商家首页")
    public R<MiniMerchantIndexVO> getMerchantIndex(@RequestParam("merchantId") String merchantId,
                                                   @DecimalMin(value = "-180.0") @DecimalMax(value = "180.0")
                                                   @RequestParam("longitude") Double longitude,
                                                   @DecimalMin(value = "-90.0") @DecimalMax(value = "90.0")
                                                   @RequestParam("latitude") Double latitude) {
        return miniMerchantService.getMerchantIndex(Long.valueOf(merchantId), longitude, latitude);
    }


    /**
     * 获取商家详细信息
     *
     * @param merchantId 商家ID
     * @return 响应结果(商家详细信息)
     */
    @Inner(value = false)
    @GetMapping("/info")
    @Operation(summary = "获取商家详细信息")
    public R<MiniMerchantInfoVO> getMerchantInfo(@RequestParam("merchantId") String merchantId) {
        return miniMerchantService.getMerchantInfo(Long.valueOf(merchantId));
    }


    /**
     * 获取商家资质信息
     *
     * @param merchantId 商家ID
     * @return 响应结果(商家资质信息)
     */
    @Inner(value = false)
    @GetMapping("/qualification")
    @Operation(summary = "获取商家资质信息")
    public R<MiniMerchantQualificationVO> getMerchantQualification(@RequestParam("merchantId") String merchantId) {
        return miniMerchantService.getMerchantQualification(Long.valueOf(merchantId));
    }


    /**
     * 获取商家图片列表
     *
     * @param merchantId 商家ID
     * @return 响应结果(商家图片列表)
     */
    @Inner(value = false)
    @GetMapping("/images")
    @Operation(summary = "获取商家图片列表")
    public R<List<String>> getMerchantImages(@RequestParam("merchantId") String merchantId) {
        return miniMerchantService.getMerchantImages(Long.valueOf(merchantId));
    }


}