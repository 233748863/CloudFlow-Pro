package cn.joywon.poco.merchant.PlatformModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PlatformModule.dto.BannerCreateDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.BannerQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.BannerUpdateDTO;
import cn.joywon.poco.merchant.PlatformModule.service.IMiniBannerService;
import cn.joywon.poco.merchant.PlatformModule.vo.BannerDetailVO;
import cn.joywon.poco.merchant.PlatformModule.vo.BannerListVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@Tag(name = "轮播图管理(平台后台端)")
@RequiredArgsConstructor
@RequestMapping("/platform/banner")
public class BannerController {

    private final IMiniBannerService bannerService;


    /**
     * 新增轮播图
     *
     * @param dto 轮播图新增参数
     * @return 响应结果(轮播图详情)
     */
    @PostMapping("/save")
    @Operation(summary = "新增轮播图")
    @SysLog(value = "新增轮播图")
    @HasPermission("mini:banner:upsert")
    public R<BannerDetailVO> saveBanner(@RequestBody @Valid BannerCreateDTO dto) {
        if (dto.getShowStartTime() != null && dto.getShowEndTime() != null) {
            if (!dto.getShowEndTime().isAfter(dto.getShowStartTime())) {
                return R.failed("无效的轮播图展示时间范围");
            }
        }
        return bannerService.saveBanner(dto);
    }


    /**
     * 删除轮播图
     *
     * @param id 轮播图ID
     * @return 响应结果
     */
    @DeleteMapping("/delete")
    @Operation(summary = "删除轮播图")
    @SysLog(value = "删除轮播图")
    @HasPermission("mini:banner:delete")
    public R<?> deleteBanner(@RequestParam("id") String id) {
        return bannerService.deleteBanner(id);
    }


    /**
     * 重建轮播图缓存
     *
     * @return 响应结果
     */
    @Inner(value = false)
    @PutMapping("/cache/rebuild")
    @Operation(summary = "重建轮播图缓存")
    @SysLog(value = "重建轮播图缓存")
    public R<?> rebuildBannerCache() {
        return bannerService.rebuildBannerCache();
    }


    /**
     * 修改轮播图信息
     *
     * @param dto 轮播图修改参数
     * @return 响应结果(轮播图详情)
     */
    @PutMapping("/modify")
    @Operation(summary = "修改轮播图")
    @SysLog(value = "修改轮播图")
    @HasPermission("mini:banner:upsert")
    public R<BannerDetailVO> modifyBanner(@RequestBody @Valid BannerUpdateDTO dto) {
        return bannerService.modifyBanner(dto);
    }


    /**
     * 启用/禁用轮播图
     *
     * @param id 轮播图ID
     * @return 响应结果
     */
    @PutMapping("/enable")
    @Operation(summary = "启用/禁用轮播图")
    @SysLog(value = "启用/禁用轮播图")
    @HasPermission("mini:banner:enable")
    public R<?> enableBanner(@RequestParam("id") String id) {
        return bannerService.enableBanner(id);
    }


    /**
     * 查询轮播图分页列表
     *
     * @param dto 轮播图查询参数
     * @return 响应结果(轮播图分页列表)
     */
    @PutMapping("/query")
    @Operation(summary = "查询轮播图分页列表")
    public R<PageQueryVO<BannerListVO>> queryBanner(@RequestBody @Valid BannerQueryDTO dto) {
        return bannerService.queryBanner(dto);
    }


    /**
     * 查询轮播图详情
     *
     * @param id 轮播图ID
     * @return 响应结果(轮播图详情)
     */
    @GetMapping("/detail")
    @Operation(summary = "查询轮播图详情")
    public R<BannerDetailVO> bannerDetail(@RequestParam("id") String id) {
        return bannerService.bannerDetail(id);
    }


}