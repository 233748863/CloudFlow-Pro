package cn.joywon.poco.merchant.PlatformModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.merchant.PlatformModule.service.IMiniBannerService;
import cn.joywon.poco.merchant.PlatformModule.vo.MiniBannerVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@Tag(name = "轮播图(小程序端)")
@RequestMapping("/mini/banner")
public class MiniBannerController {

    private final IMiniBannerService miniBannerService;


    /**
     * 获取首页轮播图
     *
     * @return 响应结果(首页轮播图列表)
     */
    @Inner(value = false)
    @GetMapping("/index")
    @Operation(summary = "获取首页轮播图")
    public R<List<MiniBannerVO>> getIndexBanner() {
        return miniBannerService.getIndexBanner();
    }


}