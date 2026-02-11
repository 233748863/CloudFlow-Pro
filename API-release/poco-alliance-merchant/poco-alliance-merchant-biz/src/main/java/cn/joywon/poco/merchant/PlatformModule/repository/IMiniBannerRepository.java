package cn.joywon.poco.merchant.PlatformModule.repository;

import cn.joywon.poco.merchant.PlatformModule.dto.BannerCacheDTO;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public interface IMiniBannerRepository {


    /**
     * 写入轮播图缓存
     *
     * @param dto         轮播图缓存数据
     * @param showEndTime 轮播图展示结束时间
     */
    void writeBannerCache(BannerCacheDTO dto, LocalDateTime showEndTime);


    /**
     * 批量写入轮播图缓存
     *
     * @param dtoList       轮播图缓存数据列表
     * @param expireTimeMap 轮播图展示结束时间映射(键: 轮播图ID, 值: 轮播图展示结束时间)
     */
    void writeBannerCacheBatch(List<BannerCacheDTO> dtoList, Map<Long, LocalDateTime> expireTimeMap);


    /**
     * 轮播图缓存激活延迟处理
     * 激活时间=key过期时间, 后续由监听过期key监听器处理激活
     *
     * @param id            轮播图ID
     * @param expireSeconds 延迟时间
     */
    void pendingActivate(Serializable id, Long expireSeconds);


    /**
     * 轮播图缓存激活延迟批量处理
     *
     * @param pendingMap 待生效轮播图映射(键: 轮播图ID, 值: 延迟时间)
     */
    void pendingActivateBatch(Map<Serializable, Long> pendingMap);


    /**
     * 删除轮播图缓存激活键
     *
     * @param id 轮播图ID
     */
    void dropActivateKey(Serializable id);


    /**
     * 删除轮播图缓存
     *
     * @param id 轮播图ID
     */
    void dropBannerCache(Serializable id);


    /**
     * 删除所有轮播图缓存
     */
    void dropAllBannerCache();


    /**
     * 获取轮播图缓存
     *
     * @return 轮播图缓存列表
     */
    List<BannerCacheDTO> scanBanner();


}