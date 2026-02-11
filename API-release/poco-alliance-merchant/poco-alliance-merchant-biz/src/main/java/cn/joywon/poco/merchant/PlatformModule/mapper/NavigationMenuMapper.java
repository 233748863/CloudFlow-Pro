package cn.joywon.poco.merchant.PlatformModule.mapper;

import cn.joywon.poco.merchant.PlatformModule.dto.NavigationMenuQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.NavigationMenu;
import cn.joywon.poco.merchant.PlatformModule.vo.NavigationMenuVO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface NavigationMenuMapper extends BaseMapper<NavigationMenu> {


    /**
     * 删除导航菜单及子级
     *
     * @param ids 菜单ID列表
     * @return 删除结果
     */
    int deleteNavigationMenuAndSubs(@Param("ids") List<Long> ids);


    /**
     * 获取导航菜单下子菜单ID列表
     *
     * @param id 菜单ID
     * @return 子菜单ID列表
     */
    List<Long> getSubNavigationMenuIds(@Param("id") String id);


    /**
     * 查询导航菜单列表
     *
     * @param page 分页参数
     * @param dto  查询参数
     * @return 查询结果(菜单分页列表)
     */
    Page<NavigationMenuVO> queryNavigationMenuList(@Param("page") Page<NavigationMenuVO> page,
                                                   @Param("dto") NavigationMenuQueryDTO dto);


    /**
     * 【小程序端】
     * 获取导航菜单树形列表
     *
     * @param merchantId 商家ID
     * @param type       菜单类型
     * @return 导航菜单属性列表
     */
    List<NavigationMenu> getMiniNavigationMenuTree(@Param("merchantId") Long merchantId, @Param("type") String type);


    /**
     * 获取导航菜单属性
     *
     * @param menuId 菜单ID
     * @return 菜单详情
     */
    NavigationMenuVO getNavigationMenu(@Param("menuId") Long menuId);


}