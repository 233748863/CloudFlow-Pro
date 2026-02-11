package cn.joywon.poco.merchant.PlatformModule.controller;

import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PlatformModule.dto.NavigationMenuAddDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.NavigationMenuGetDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.NavigationMenuQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.NavigationMenuUpdateDTO;
import cn.joywon.poco.merchant.PlatformModule.service.INavigationMenuService;
import cn.joywon.poco.merchant.PlatformModule.vo.NavigationMenuVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@RequiredArgsConstructor
@Tag(name = "小程序导航菜单管理(平台后台端)")
@RequestMapping("/platform/navi/menu")
public class NavigationMenuController {

    private final INavigationMenuService navigationMenuService;


    /**
     * 新增小程序导航菜单
     *
     * @param dto 新增参数
     * @return 响应结果(新增的导航菜单)
     */
    @PutMapping("/add")
    @Operation(summary = "新增小程序导航菜单")
    @SysLog(value = "新增小程序导航菜单")
    @HasPermission("mini:navi:upsert")
    public R<NavigationMenuVO> addNavigationMenu(@RequestBody @Valid NavigationMenuAddDTO dto) {
        return navigationMenuService.addNavigationMenu(dto);
    }


    /**
     * 删除小程序导航菜单
     *
     * @param dto 菜单ID参数
     * @return 响应结果
     */
    @PutMapping("/delete")
    @Operation(summary = "删除小程序导航菜单")
    @SysLog(value = "删除小程序导航菜单")
    @HasPermission("mini:navi:delete")
    public R<?> deleteNavigationMenu(@RequestBody @Valid NavigationMenuGetDTO dto) {
        return navigationMenuService.deleteNavigationMenu(dto.getId(), dto.getPlatform());
    }


    /**
     * 修改小程序导航菜单
     *
     * @param dto 修改参数
     * @return 响应结果(修改后的导航菜单)
     */
    @PutMapping("/modify")
    @Operation(summary = "修改小程序导航菜单")
    @SysLog(value = "修改小程序导航菜单")
    @HasPermission("mini:navi:upsert")
    public R<NavigationMenuVO> modifyNavigationMenu(@RequestBody @Valid NavigationMenuUpdateDTO dto) {
        return navigationMenuService.modifyNavigationMenu(dto);
    }


    /**
     * 启用/禁用小程序导航菜单
     *
     * @param dto 菜单ID参数
     * @return 响应结果
     */
    @PutMapping("/enable")
    @Operation(summary = "启用/禁用小程序导航菜单")
    @SysLog(value = "启用/禁用小程序导航菜单")
    @HasPermission("mini:navi:enable")
    public R<?> enableNavigationMenu(@RequestBody @Valid NavigationMenuGetDTO dto) {
        return navigationMenuService.enableNavigationMenu(dto.getId(), dto.getPlatform());
    }


    /**
     * 查询商家小程序导航菜单列表
     *
     * @param dto 查询参数
     * @return 响应结果(菜单分页列表)
     */
    @PostMapping("/list")
    @Operation(summary = "查询商家小程序导航菜单列表")
    public R<PageQueryVO<NavigationMenuVO>> navigationMenuList(@RequestBody @Valid NavigationMenuQueryDTO dto) {
        if (StrUtil.isBlank(dto.getMerchantId())) {
            dto.setMerchantId("0");
        }
        return navigationMenuService.queryNavigationMenuList(dto);
    }


}