package cn.joywon.poco.merchant.MerchantModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.merchant.MerchantModule.dto.MiniStoreQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.service.IMiniStoreService;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniStoreIndexVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniStoreListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniStoreQualificationVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/mini/store")
@Tag(name = "小程序门店功能")
public class MiniStoreController {

    private final IMiniStoreService miniStoreService;


    /**
     * 用户获取范围内门店列表
     *
     * @param dto 查询参数
     * @return 响应结果(门店缓存分页列表)
     */
//    @PostMapping("/list")
    public R<?> getStoreListByRadius(@RequestBody @Valid MiniStoreQueryDTO dto) {
        return miniStoreService.getStoreListByRadius(dto);
    }


    /**
     * 查询商家下的门店列表
     *
     * @param merchantId 商家ID
     * @param longitude  经度
     * @param latitude   纬度
     * @return 响应结果(门店列表)
     */
    @Inner(value = false)
    @GetMapping("/list")
    @Operation(summary = "查询商家下的门店列表")
    public R<List<MiniStoreListVO>> queryStoreListByMerchantId(@RequestParam("merchantId") String merchantId,
                                                                @RequestParam(value = "longitude", required = false) Double longitude,
                                                                @RequestParam(value = "latitude", required = false) Double latitude) {
        return miniStoreService.queryStoreListByMerchantId(Long.valueOf(merchantId), longitude, latitude);
    }


    /**
     * 获取门店首页详情
     *
     * @param storeId   门店ID
     * @param longitude 经度
     * @param latitude  纬度
     * @return 响应结果(门店详情信息)
     */
    @Inner(value = false)
    @GetMapping("/index")
    @Operation(summary = "获取门店首页详情")
    public R<MiniStoreIndexVO> getStoreIndex(@RequestParam("storeId") String storeId,
                                             @RequestParam(value = "longitude", required = false) Double longitude,
                                             @RequestParam(value = "latitude", required = false) Double latitude) {
        return miniStoreService.getStoreIndex(Long.valueOf(storeId), longitude, latitude);
    }


    /**
     * 获取门店图片列表
     *
     * @param storeId 门店ID
     * @return 响应结果(门店图片列表)
     */
    @Inner(value = false)
    @GetMapping("/images")
    @Operation(summary = "获取门店图片列表")
    public R<List<String>> getStoreImages(@RequestParam("storeId") String storeId,
                                          @RequestParam(value = "allShow", required = false) Boolean allShow) {
        return miniStoreService.getStoreImages(Long.valueOf(storeId), allShow);
    }


    /**
     * 获取门店资质信息
     *
     * @param storeId 门店ID
     * @return 响应结果(门店资质信息)
     */
    @Inner(value = false)
    @GetMapping("/qualification")
    @Operation(summary = "获取门店资质信息")
    public R<MiniStoreQualificationVO> getStoreQualification(@RequestParam("storeId") String storeId) {
        return miniStoreService.getStoreQualification(Long.valueOf(storeId));
    }


}