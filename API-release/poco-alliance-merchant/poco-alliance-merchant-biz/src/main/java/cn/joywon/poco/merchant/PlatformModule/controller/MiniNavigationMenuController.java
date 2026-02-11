package cn.joywon.poco.merchant.PlatformModule.controller;

import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.merchant.PlatformModule.definition.NavigationMenuTypeEnum;
import cn.joywon.poco.merchant.PlatformModule.service.INavigationMenuService;
import cn.joywon.poco.merchant.PlatformModule.vo.MiniNavigationMenuVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@Tag(name = "小程序导航菜单")
@RequestMapping("/mini/navi/menu")
public class MiniNavigationMenuController {

    private final INavigationMenuService navigationMenuService;


    /**
     * 获取小程序导航菜单树形列表
     *
     * @param merchantId 商家ID(0表示平台)
     * @param type       菜单类型
     * @return 响应结果(小程序导航菜单树形列表)
     */
    @Inner(value = false)
    @GetMapping("/tree")
    @Operation(summary = "获取小程序导航菜单列表")
    public R<List<MiniNavigationMenuVO>> getMiniNavigationMenu(@RequestParam(name = "merchantId", required = false) String merchantId,
                                                               @Pattern(message = "无效的菜单类型",
                                                                       regexp = NavigationMenuTypeEnum.MENU_TYPE_REGEX_PATTERN)
                                                               @RequestParam("type") String type) {
        if (StrUtil.isBlank(merchantId)) {
            merchantId = "0";
        }
        List<MiniNavigationMenuVO> vos =
                navigationMenuService.getMiniNavigationMenuTree(Long.valueOf(merchantId), NavigationMenuTypeEnum.valueOf(type));
        return R.ok(vos);
    }


}