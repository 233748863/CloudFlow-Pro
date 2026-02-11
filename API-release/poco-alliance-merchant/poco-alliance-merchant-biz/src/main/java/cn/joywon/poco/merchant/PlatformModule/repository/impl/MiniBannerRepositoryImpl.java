package cn.joywon.poco.merchant.PlatformModule.repository.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.PlatformModule.definition.BannerCacheKey;
import cn.joywon.poco.merchant.PlatformModule.dto.BannerCacheDTO;
import cn.joywon.poco.merchant.PlatformModule.repository.IMiniBannerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.*;
import org.springframework.stereotype.Repository;

import java.io.Serializable;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Repository
@RequiredArgsConstructor
public class MiniBannerRepositoryImpl implements IMiniBannerRepository, BannerCacheKey {

    private final RedisTemplate<String, Object> redisTemplate;


    /**
     * 写入轮播图缓存
     *
     * @param dto         轮播图缓存数据
     * @param showEndTime 轮播图显示结束时间
     */
    @Override
    public void writeBannerCache(BannerCacheDTO dto, LocalDateTime showEndTime) {
        String bannerCache = JSONUtil.toJsonStr(dto);
        String key = generateKey(dto.getId());

        Boolean result = redisTemplate.opsForValue().setIfAbsent(key, bannerCache);
        Assert.isTrue(result != null && result, () -> new RuntimeException("轮播图缓存写入失败"));

        if (showEndTime != null) {
            Instant expireTime = showEndTime.toInstant(ZoneOffset.ofHours(8));
            result = redisTemplate.expireAt(key, expireTime);
            Assert.isTrue(result != null && result, () -> {
                dropBannerCache(dto.getId());
                throw new RuntimeException("轮播图缓存过期时间设置失败");
            });
        }
    }


    /**
     * 批量写入轮播图缓存
     *
     * @param dtoList       轮播图缓存数据列表
     * @param expireTimeMap 轮播图展示结束时间映射(键: 轮播图ID, 值: 轮播图展示结束时间)
     */
    @Override
    public void writeBannerCacheBatch(List<BannerCacheDTO> dtoList, Map<Long, LocalDateTime> expireTimeMap) {
        redisTemplate.executePipelined(new SessionCallback<>() {
            @Override
            public <K, V> Object execute(@NotNull RedisOperations<K, V> operations) throws DataAccessException {
                @SuppressWarnings("unchecked")
                RedisOperations<String, Object> stringObjectOps = (RedisOperations<String, Object>) operations;

                for (BannerCacheDTO dto : dtoList) {
                    String key = generateKey(dto.getId());
                    // 写入缓存
                    stringObjectOps.opsForValue().set(key, JSONUtil.toJsonStr(dto));
                    // 设置过期时间(如有)
                    LocalDateTime expireTime = expireTimeMap.get(Long.valueOf(dto.getId()));
                    if (expireTime == null) {
                        continue;
                    }
                    Instant expireTimeInstant = expireTime.toInstant(ZoneOffset.ofHours(8));
                    stringObjectOps.expireAt(key, expireTimeInstant);
                }

                return null;
            }
        });
    }


    /**
     * 轮播图缓存激活延迟处理
     * 激活时间=key过期时间, 后续由监听过期key监听器处理激活
     *
     * @param id            轮播图ID
     * @param expireSeconds 延迟时间
     */
    @Override
    public void pendingActivate(Serializable id, Long expireSeconds) {
        String key = KEY_PREFIX_BANNER_ACTIVATE + id;
        redisTemplate.opsForValue().set(key, id, expireSeconds, TimeUnit.SECONDS);
    }


    /**
     * 轮播图缓存激活延迟批量处理
     *
     * @param pendingMap 待生效轮播图映射(键: 轮播图ID, 值: 延迟时间)
     */
    @Override
    public void pendingActivateBatch(Map<Serializable, Long> pendingMap) {
        if (CollUtil.isEmpty(pendingMap)) {
            return;
        }
        // 批量写入key
        Map<String, String> keyMap = new HashMap<>();
        for (Map.Entry<Serializable, Long> entry : pendingMap.entrySet()) {
            String key = KEY_PREFIX_BANNER_ACTIVATE + entry.getKey();
            keyMap.put(key, entry.getKey().toString());
        }
        redisTemplate.opsForValue().multiSet(keyMap);
        // 循环设置过期时间
        for (Map.Entry<Serializable, Long> entry : pendingMap.entrySet()) {
            String key = KEY_PREFIX_BANNER_ACTIVATE + entry.getKey();
            redisTemplate.expire(key, entry.getValue(), TimeUnit.SECONDS);
        }
    }


    /**
     * 删除轮播图缓存激活键
     *
     * @param id 轮播图ID
     */
    @Override
    public void dropActivateKey(Serializable id) {
        String key = KEY_PREFIX_BANNER_ACTIVATE + id;
        redisTemplate.delete(key);
    }


    /**
     * 删除轮播图缓存
     *
     * @param id 轮播图ID
     */
    @Override
    public void dropBannerCache(Serializable id) {
        String key = generateKey(id);
        redisTemplate.delete(key);
    }


    /**
     * 删除所有轮播图缓存
     */
    @Override
    public void dropAllBannerCache() {
        List<String> keys = new ArrayList<>();
        String keyPattern = generateKey("*");
        ScanOptions scanOptions = ScanOptions.scanOptions().match(keyPattern).count(100).build();

        try {
            redisTemplate.execute((RedisCallback<Object>) connection -> {
                try (Cursor<byte[]> cursor = connection.keyCommands().scan(scanOptions)) {
                    while (cursor.hasNext()) {
                        byte[] keyBytes = cursor.next();
                        if (keyBytes != null) {
                            String key = new String(keyBytes, StandardCharsets.UTF_8);
                            if (StrUtil.isNotBlank(key)) {
                                keys.add(key);
                            }
                        }
                    }
                } catch (Exception e) {
                    log.error("删除所有轮播图缓存过程中轮播图缓存扫描失败", e);
                }
                return null;
            });
        } catch (Exception e) {
            log.error("删除所有轮播图缓存过程中轮播图缓存扫描失败", e);
        }

        if (CollUtil.isNotEmpty(keys)) {
            redisTemplate.delete(keys);
        }
    }


    /**
     * 获取轮播图缓存
     *
     * @return 轮播图缓存列表
     */
    @Override
    public List<BannerCacheDTO> scanBanner() {
        List<BannerCacheDTO> result = new ArrayList<>();
        ScanOptions scanOptions = ScanOptions.scanOptions().match(KEY_PREFIX_MINI_BANNER + "*").count(100).build();
        try {
            Cursor<byte[]> cursor = redisTemplate.executeWithStickyConnection(c -> c.keyCommands().scan(scanOptions));
            if (cursor != null) {
                try {
                    while (cursor.hasNext()) {
                        byte[] keyBytes = cursor.next();
                        String key = redisTemplate.getStringSerializer().deserialize(keyBytes);
                        if (key != null) {
                            Object value = redisTemplate.opsForValue().get(key);
                            if (value != null) {
                                result.add(JSONUtil.toBean(JSONUtil.toJsonStr(value), BannerCacheDTO.class));
                            }
                        }
                    }
                } finally {
                    cursor.close();
                }
            }
        } catch (DataAccessException e) {
            log.error("轮播图缓存获取失败", e);
            throw new RuntimeException("轮播图缓存获取失败", e);
        }

        if (CollUtil.isEmpty(result)) {
            return null;
        }

        return result;
    }


    private String generateKey(Serializable id) {
        return KEY_PREFIX_MINI_BANNER + id;
    }


}