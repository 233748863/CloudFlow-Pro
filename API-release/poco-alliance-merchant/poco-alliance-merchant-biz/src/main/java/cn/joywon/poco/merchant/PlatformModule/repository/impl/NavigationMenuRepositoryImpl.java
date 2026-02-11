package cn.joywon.poco.merchant.PlatformModule.repository.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.PlatformModule.definition.NavigationMenuCacheKey;
import cn.joywon.poco.merchant.PlatformModule.definition.NavigationMenuTypeEnum;
import cn.joywon.poco.merchant.PlatformModule.repository.INavigationMenuRepository;
import cn.joywon.poco.merchant.PlatformModule.vo.MiniNavigationMenuVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Slf4j
@Repository
@RequiredArgsConstructor
public class NavigationMenuRepositoryImpl implements INavigationMenuRepository, NavigationMenuCacheKey {

    private final RedisTemplate<String, Object> redisTemplate;


    /**
     * 设置顶部导航菜单
     *
     * @param merchantId 商家ID
     * @param vos        顶部导航菜单列表
     * @param type       导航菜单类型
     */
    @Override
    public void setMiniNavigationMenu(String merchantId, List<MiniNavigationMenuVO> vos, NavigationMenuTypeEnum type) {
        if (CollUtil.isEmpty(vos)) {
            return;
        }
        try {
            String menuJson = JSONUtil.toJsonStr(vos);
            switch (type) {
                case TOP -> redisTemplate.opsForHash().put(KEY_MINI_TOP_NAVIGATION_MENU, merchantId, menuJson);
                case MID -> redisTemplate.opsForHash().put(KEY_MINI_MID_NAVIGATION_MENU, merchantId, menuJson);
                case SIDE -> redisTemplate.opsForHash().put(KEY_MINI_SIDE_NAVIGATION_MENU, merchantId, menuJson);
            }
        } catch (Exception e) {
            log.error("写入商家 [{}] 顶部导航菜单缓存失败", merchantId, e);
        }
    }


    /**
     * 删除顶部导航菜单
     *
     * @param merchantId 商家ID
     * @param type       导航菜单类型
     */
    @Override
    public void dropMiniNavigationMenu(String merchantId, NavigationMenuTypeEnum type) {
        switch (type) {
            case TOP -> redisTemplate.opsForHash().delete(KEY_MINI_TOP_NAVIGATION_MENU, merchantId);
            case MID -> redisTemplate.opsForHash().delete(KEY_MINI_MID_NAVIGATION_MENU, merchantId);
            case SIDE -> redisTemplate.opsForHash().delete(KEY_MINI_SIDE_NAVIGATION_MENU, merchantId);
        }
    }


    /**
     * 获取顶部导航菜单
     *
     * @param merchantId 商家ID
     * @param type       菜单类型
     * @return 顶部导航菜单列表
     */
    @Override
    public List<MiniNavigationMenuVO> getMiniNavigationMenu(String merchantId, NavigationMenuTypeEnum type) {
        Object cacheData = null;
        try {
            switch (type) {
                case TOP -> cacheData = redisTemplate.opsForHash().get(KEY_MINI_TOP_NAVIGATION_MENU, merchantId);
                case MID -> cacheData = redisTemplate.opsForHash().get(KEY_MINI_MID_NAVIGATION_MENU, merchantId);
                case SIDE -> cacheData = redisTemplate.opsForHash().get(KEY_MINI_SIDE_NAVIGATION_MENU, merchantId);
            }
            if (ObjUtil.isNull(cacheData)) {
                return List.of();
            }
            return JSONUtil.toList((String) cacheData, MiniNavigationMenuVO.class);
        } catch (Exception e) {
            log.error("读取商家 [{}] 顶部导航菜单缓存失败", merchantId, e);
            return null;
        }
    }


}