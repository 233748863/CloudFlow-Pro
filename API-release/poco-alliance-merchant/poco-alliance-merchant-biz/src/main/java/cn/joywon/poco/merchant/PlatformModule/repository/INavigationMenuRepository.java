package cn.joywon.poco.merchant.PlatformModule.repository;

import cn.joywon.poco.merchant.PlatformModule.definition.NavigationMenuTypeEnum;
import cn.joywon.poco.merchant.PlatformModule.vo.MiniNavigationMenuVO;

import java.util.List;

public interface INavigationMenuRepository {


    /**
     * 设置顶部导航菜单
     *
     * @param merchantId 商家ID
     * @param vos        顶部导航菜单列表
     * @param type       导航菜单类型
     */
    void setMiniNavigationMenu(String merchantId, List<MiniNavigationMenuVO> vos, NavigationMenuTypeEnum type);


    /**
     * 删除顶部导航菜单
     *
     * @param merchantId 商家ID
     * @param type       导航菜单类型
     */
    void dropMiniNavigationMenu(String merchantId, NavigationMenuTypeEnum type);


    /**
     * 获取导航菜单
     *
     * @param merchantId 商家ID
     * @param type       导航菜单类型
     * @return 导航菜单列表
     */
    List<MiniNavigationMenuVO> getMiniNavigationMenu(String merchantId, NavigationMenuTypeEnum type);


}