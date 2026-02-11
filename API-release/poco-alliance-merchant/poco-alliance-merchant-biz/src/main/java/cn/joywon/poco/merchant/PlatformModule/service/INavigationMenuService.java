package cn.joywon.poco.merchant.PlatformModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PlatformModule.definition.NavigationMenuTypeEnum;
import cn.joywon.poco.merchant.PlatformModule.dto.NavigationMenuAddDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.NavigationMenuQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.NavigationMenuUpdateDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.NavigationMenu;
import cn.joywon.poco.merchant.PlatformModule.vo.MiniNavigationMenuVO;
import cn.joywon.poco.merchant.PlatformModule.vo.NavigationMenuVO;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

public interface INavigationMenuService extends IService<NavigationMenu> {


    /**
     * 新增小程序导航菜单
     *
     * @param dto 新增参数
     * @return 操作结果(新增的导航菜单)
     */
    R<NavigationMenuVO> addNavigationMenu(NavigationMenuAddDTO dto);


    /**
     * 删除小程序导航菜单
     *
     * @param id       导航菜单ID
     * @param platform 是否为平台级菜单
     * @return 操作结果
     */
    R<?> deleteNavigationMenu(String id, Boolean platform);


    /**
     * 修改小程序导航菜单
     *
     * @param dto 修改参数
     * @return 操作结果(修改后的导航菜单)
     */
    R<NavigationMenuVO> modifyNavigationMenu(NavigationMenuUpdateDTO dto);


    /**
     * 启用/禁用小程序导航菜单
     *
     * @param id       导航菜单ID
     * @param platform 是否为平台级菜单
     * @return 操作结果
     */
    R<?> enableNavigationMenu(String id, Boolean platform);


    /**
     * 查询小程序导航菜单列表
     *
     * @param dto 查询参数
     * @return 查询结果(菜单分页列表)
     */
    R<PageQueryVO<NavigationMenuVO>> queryNavigationMenuList(NavigationMenuQueryDTO dto);


    /**
     * 【小程序端】
     * 获取小程序导航菜单树形列表
     *
     * @param merchantId 商家ID
     * @param type       菜单类型
     * @return 查询结果(导航菜单属性列表)
     */
    List<MiniNavigationMenuVO> getMiniNavigationMenuTree(Long merchantId, NavigationMenuTypeEnum type);


}