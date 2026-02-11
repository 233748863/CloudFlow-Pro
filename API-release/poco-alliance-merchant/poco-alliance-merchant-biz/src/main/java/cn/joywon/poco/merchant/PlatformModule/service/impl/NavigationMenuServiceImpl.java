package cn.joywon.poco.merchant.PlatformModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PlatformModule.definition.NavigationMenuTypeEnum;
import cn.joywon.poco.merchant.PlatformModule.dto.NavigationMenuAddDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.NavigationMenuQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.NavigationMenuUpdateDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.NavigationMenu;
import cn.joywon.poco.merchant.PlatformModule.mapper.NavigationMenuMapper;
import cn.joywon.poco.merchant.PlatformModule.repository.INavigationMenuRepository;
import cn.joywon.poco.merchant.PlatformModule.service.INavigationMenuService;
import cn.joywon.poco.merchant.PlatformModule.vo.MiniNavigationMenuVO;
import cn.joywon.poco.merchant.PlatformModule.vo.NavigationMenuVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class NavigationMenuServiceImpl extends
        ServiceImpl<NavigationMenuMapper, NavigationMenu> implements INavigationMenuService {

    private final INavigationMenuRepository navigationMenuRepository;

    private final NavigationMenuMapper navigationMenuMapper;


    /**
     * 新增小程序导航菜单
     *
     * @param dto 新增参数
     * @return 操作结果(新增的导航菜单)
     */
    @Override
    public R<NavigationMenuVO> addNavigationMenu(NavigationMenuAddDTO dto) {
        Long merchantId = getCurrentMerchantId(dto.getPlatform());

        NavigationMenu navigationMenu = lambdaQuery()
                .eq(NavigationMenu::getName, dto.getName())
                .eq(NavigationMenu::getType, dto.getType())
                .eq(NavigationMenu::getMerchantId, merchantId)
                .last("LIMIT 1")
                .one();
        if (ObjUtil.isNotNull(navigationMenu)) {
            return R.failed("新增导航菜单失败, 已有相同名称导航菜单");
        }

        int depth = 1;
        String parentMenuId = dto.getParentId();
        if (StrUtil.isNotBlank(parentMenuId) && !parentMenuId.equals("0")) {
            NavigationMenu parentMenu = getById(parentMenuId);
            if (ObjUtil.isNull(parentMenu)) {
                return R.failed("新增导航菜单失败, 父级菜单不存在");
            }
            if (!parentMenu.getEnable()) {
                return R.failed("新增导航菜单失败, 父级菜单已禁用");
            }
            if (!ObjUtil.equals(parentMenu.getMerchantId(), merchantId)) {
                return R.failed("新增导航菜单失败, 无效的父级菜单");
            }
            if (!ObjUtil.equals(parentMenu.getType().getValue(), dto.getType())) {
                return R.failed("新增导航菜单失败, 与父级菜单类型不一致");
            }
            depth += parentMenu.getDepth();
        }

        navigationMenu = BeanUtil.copyProperties(dto, NavigationMenu.class);
        navigationMenu.setDepth(depth);
        boolean result = saveOrUpdate(navigationMenu);
        if (!result) {
            return R.failed("新增导航菜单失败");
        }

        NavigationMenuVO vo = getNavigationMenu(navigationMenu.getId());

        return R.ok(vo);
    }


    /**
     * 删除小程序导航菜单
     *
     * @param id       导航菜单ID
     * @param platform 是否为平台级菜单
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> deleteNavigationMenu(String id, Boolean platform) {
        Long merchantId = getCurrentMerchantId(platform);
        // 检查菜单状态
        NavigationMenu navigationMenu = getById(id);
        if (ObjUtil.isNull(navigationMenu)) {
            return R.failed("删除导航菜单失败, 导航菜单不存在");
        }
        if (merchantId != 0L || !ObjUtil.equals(navigationMenu.getMerchantId(), merchantId)) {
            return R.failed("删除导航菜单失败, 无效的导航菜单");
        }
        // 更新数据库
        List<Long> ids = navigationMenuMapper.getSubNavigationMenuIds(id);
        int count = navigationMenuMapper.deleteNavigationMenuAndSubs(ids);
        Assert.isTrue(count == ids.size(), () -> new RuntimeException("删除导航菜单失败"));
        // 更新缓存
        rebuildMiniNavigationMenuCache(navigationMenu.getMerchantId(), navigationMenu.getType());

        return R.ok();
    }


    /**
     * 修改小程序导航菜单
     *
     * @param dto 修改参数
     * @return 操作结果(修改后的导航菜单)
     */
    @Override
    public R<NavigationMenuVO> modifyNavigationMenu(NavigationMenuUpdateDTO dto) {
        Long merchantId = getCurrentMerchantId(dto.getPlatform());

        /* step-1 检查菜单状态 */
        NavigationMenu navigationMenu = getById(dto.getId());
        if (ObjUtil.isNull(navigationMenu)) {
            return R.failed("修改导航菜单失败, 导航菜单不存在");
        }
        if (!ObjUtil.equals(navigationMenu.getMerchantId(), merchantId)) {
            return R.failed("修改导航菜单失败, 无效的导航菜单");
        }
        Integer depth = null;
        String parentMenuId = dto.getParentId();
        if (StrUtil.isNotBlank(parentMenuId) && !parentMenuId.equals("0")) {
            NavigationMenu parentMenu = getById(parentMenuId);
            if (ObjUtil.isNull(parentMenu)) {
                return R.failed("修改导航菜单失败, 父级菜单不存在");
            }
            if (!parentMenu.getEnable()) {
                return R.failed("修改导航菜单失败, 父级菜单已禁用");
            }
            if (!ObjUtil.equals(parentMenu.getMerchantId(), merchantId)) {
                return R.failed("修改导航菜单失败, 无效的父级菜单");
            }
            depth = parentMenu.getDepth() + 1;
        }

        /* step-2 更新数据库 */
        CopyOptions copier = CopyOptions.create().ignoreNullValue();
        BeanUtil.copyProperties(dto, navigationMenu, copier);
        navigationMenu.setDepth(depth == null ? navigationMenu.getDepth() : depth);
        boolean result = updateById(navigationMenu);
        if (!result) {
            return R.failed("修改导航菜单失败");
        }

        /* step-3 更新缓存 */
        rebuildMiniNavigationMenuCache(navigationMenu.getMerchantId(), navigationMenu.getType());

        NavigationMenuVO vo = getNavigationMenu(navigationMenu.getId());

        return R.ok(vo);
    }


    /**
     * 启用/禁用小程序导航菜单
     *
     * @param id       导航菜单ID
     * @param platform 是否为平台级菜单
     * @return 操作结果
     */
    @Override
    public R<?> enableNavigationMenu(String id, Boolean platform) {
        Long merchantId = getCurrentMerchantId(platform);

        NavigationMenu navigationMenu = getById(id);
        if (ObjUtil.isNull(navigationMenu)) {
            return R.failed("操作失败, 导航菜单不存在");
        }
        if (merchantId != 0L || !ObjUtil.equals(navigationMenu.getMerchantId(), merchantId)) {
            return R.failed("操作失败, 无效的导航菜单");
        }

        navigationMenu.setEnable(!navigationMenu.getEnable());
        boolean result = updateById(navigationMenu);
        if (!result) {
            return R.failed("操作失败");
        }

        rebuildMiniNavigationMenuCache(navigationMenu.getMerchantId(), navigationMenu.getType());

        return R.ok();
    }


    /**
     * 查询小程序导航菜单列表
     *
     * @param dto 查询参数
     * @return 查询结果(菜单分页列表)
     */
    @Override
    public R<PageQueryVO<NavigationMenuVO>> queryNavigationMenuList(NavigationMenuQueryDTO dto) {
        Page<NavigationMenuVO> pageData = navigationMenuMapper.queryNavigationMenuList(dto.page(), dto);
        pageData.getRecords().forEach(i -> {
            if (i.getParentId() == 0) {
                i.setParentName("根菜单");
            }
        });
        return R.ok(PageQueryVO.of(pageData));
    }


    /**
     * 【小程序端】
     * 获取小程序导航菜单树形列表
     *
     * @param merchantId 商家ID
     * @param type       菜单类型
     * @return 查询结果(导航菜单属性列表)
     */
    @Override
    public List<MiniNavigationMenuVO> getMiniNavigationMenuTree(Long merchantId, NavigationMenuTypeEnum type) {
        /* step-1 尝试从缓存中获取导航栏菜单 */
        List<MiniNavigationMenuVO> menuCaches = navigationMenuRepository.getMiniNavigationMenu(merchantId.toString(), type);
        if (CollUtil.isNotEmpty(menuCaches)) {
            return menuCaches;
        }

        /* step-2 缓存没有命中, 从数据库中获取导航栏菜单 */
        List<NavigationMenu> menus = navigationMenuMapper.getMiniNavigationMenuTree(merchantId, type.getValue());
        if (CollUtil.isEmpty(menus)) {
            return List.of();
        }

        /* step-3 将List数据转化为Map方便操作 */
        Map<Long, NavigationMenu> menuMap = menus.stream().collect(Collectors.toMap(NavigationMenu::getId, i -> i));
        Map<Long, MiniNavigationMenuVO> voMap = menus.stream().collect(Collectors.toMap(NavigationMenu::getId, i -> {
            MiniNavigationMenuVO vo = BeanUtil.copyProperties(i, MiniNavigationMenuVO.class);
            vo.setChild(new ArrayList<>());
            return vo;
        }));

        /* step-4 操作Map转化为树形结构 */
        List<MiniNavigationMenuVO> vos = new ArrayList<>();
        for (NavigationMenu menu : menus) {
            if (menu.getDepth() == 1) {
                vos.add(voMap.get(menu.getId()));
            } else {
                Long parentId = menu.getParentId();
                Optional.ofNullable(parentId)
                        .map(menuMap::get)
                        .ifPresent(i -> voMap.get(parentId).getChild().add(voMap.get(menu.getId())));
//                NavigationMenu parentMenu = menuMap.get(parentId);
//                if (ObjUtil.isNotNull(parentMenu)) {
//                    voMap.get(parentId).getChild().add(voMap.get(menu.getId()));
//                }
            }
        }

        /* step-5 将树形结构菜单写入缓存 */
        navigationMenuRepository.setMiniNavigationMenu(merchantId.toString(), vos, type);

        return vos;
    }


    /**
     * 获取小程序导航菜单详情
     *
     * @param menuId 导航菜单ID
     * @return 导航菜单详情
     */
    public NavigationMenuVO getNavigationMenu(Long menuId) {
        return navigationMenuMapper.getNavigationMenu(menuId);
    }


    /**
     * 重建小程序导航菜单缓存
     *
     * @param merchantId 商家ID
     * @param menuType   菜单类型
     */
    private void rebuildMiniNavigationMenuCache(Long merchantId, NavigationMenuTypeEnum menuType) {
        navigationMenuRepository.dropMiniNavigationMenu(merchantId.toString(), menuType);
        getMiniNavigationMenuTree(merchantId, menuType);
    }


    private Long getCurrentMerchantId() {
        PocoUser user = SecurityUtils.getUser();
        Assert.notNull(user, () -> new RuntimeException("无效的登录用户"));
        return user.getDeptId();
    }


    private Long getCurrentMerchantId(Boolean platform) {
        if (platform == null || !platform) {
            return getCurrentMerchantId();
        }
        return 0L;
    }

}