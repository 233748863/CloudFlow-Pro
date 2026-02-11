package cn.joywon.poco.merchant.PlatformModule.repository.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.PlatformModule.definition.PointsRuleCacheKey;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleCacheDTO;
import cn.joywon.poco.merchant.PlatformModule.repository.IPointsRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.stereotype.Repository;

import java.io.Serializable;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Repository
@RequiredArgsConstructor
public class PointsRuleRepositoryImpl implements IPointsRuleRepository, PointsRuleCacheKey {

    private final RedisTemplate<String, Object> redisTemplate;


    /**
     * 添加积分规则缓存
     *
     * @param dto 积分规则缓存
     */
    @Override
    public void upsertPointsRule(PointsRuleCacheDTO dto) {
        String pointRuleCache = JSONUtil.toJsonStr(dto);
        String pointRuleKey = generatePointsRuleKey(dto.getId());
        String pointRuleTypeKey = generatePointsRuleKey(dto.getChangeType(), dto.getRuleType(), dto.getId());

        redisTemplate.opsForValue().set(pointRuleKey, pointRuleCache);
        redisTemplate.opsForValue().set(pointRuleTypeKey, pointRuleCache);

        Instant expireTime = dto.getExpireTime().toInstant(ZoneOffset.ofHours(8));
        Boolean result = redisTemplate.expireAt(pointRuleKey, expireTime);
        Assert.isTrue(result != null && result, () -> {
            dropPointsRule(dto.getId(), dto.getChangeType(), dto.getRuleType());
            throw new RuntimeException("积分规则缓存过期时间设置失败");
        });
        result = redisTemplate.expireAt(pointRuleTypeKey, expireTime);
        Assert.isTrue(result != null && result, () -> {
            dropPointsRule(dto.getId(), dto.getChangeType(), dto.getRuleType());
            throw new RuntimeException("积分规则缓存过期时间设置失败");
        });
    }


    /**
     * 批量添加积分规则缓存
     *
     * @param dtoList 积分规则缓存列表
     */
    @Override
    public void upsertPointsRuleBatch(List<PointsRuleCacheDTO> dtoList) {
        if (CollUtil.isEmpty(dtoList)) {
            return;
        }

        redisTemplate.executePipelined((RedisCallback<Object>) connection -> {
            for (PointsRuleCacheDTO dto : dtoList) {
                String key = generatePointsRuleKey(dto.getId());
                byte[] keyBytes = key.getBytes(StandardCharsets.UTF_8);
                byte[] valueBytes = JSONUtil.toJsonStr(dto).getBytes(StandardCharsets.UTF_8);
                connection.stringCommands().set(keyBytes, valueBytes);

                Instant expireTime = dto.getExpireTime().toInstant(ZoneOffset.ofHours(8));
                connection.keyCommands().expireAt(keyBytes, expireTime.toEpochMilli());
            }
            return null;
        });
    }


    /**
     * 添加默认积分规则缓存(永不过期)
     *
     * @param dto 积分规则缓存
     */
    @Override
    public void upsertPrimaryPointsRule(PointsRuleCacheDTO dto) {
        String key = generatePrimaryPointsRuleKey(dto.getChangeType(), dto.getRuleType());
        String pointRuleCache = JSONUtil.toJsonStr(dto);
        redisTemplate.opsForValue().set(key, pointRuleCache);
    }


    /**
     * 积分规则缓存激活延迟处理
     * 激活时间=key过期时间, 后续由监听过期key监听器处理激活
     *
     * @param id            积分规则ID
     * @param activeSeconds 延迟时间
     */
    @Override
    public void pendingActivation(Serializable id, long activeSeconds) {
        String key = generatePendingActivationKey(id);
        redisTemplate.opsForValue().set(key, id, activeSeconds, TimeUnit.SECONDS);
    }


    /**
     * 批量积分规则缓存激活延迟处理
     * 激活时间=key过期时间, 后续由监听过期key监听器处理激活
     *
     * @param activeMap 待生效积分规则映射(键: 积分规则ID, 值: 延迟时间)
     */
    @Override
    public void pendingActivationMany(Map<Long, Long> activeMap) {
        if (CollUtil.isEmpty(activeMap)) {
            return;
        }

        redisTemplate.executePipelined((RedisCallback<Object>) connection -> {
            for (Map.Entry<Long, Long> entry : activeMap.entrySet()) {
                String key = generatePendingActivationKey(entry.getKey());
                byte[] keyBytes = key.getBytes(StandardCharsets.UTF_8);
                byte[] valueBytes = entry.getKey().toString().getBytes(StandardCharsets.UTF_8);
                connection.stringCommands().setEx(keyBytes, entry.getValue(), valueBytes);
            }
            return null;
        });
    }


    /**
     * 删除积分规则缓存
     *
     * @param id 积分规则ID
     */
    @Override
    public void dropPointsRule(Serializable id, String addOrDed, String ruleType) {
        String pointsRuleKey = generatePointsRuleKey(id);
        String pointsRuleTypeKey = generatePointsRuleKey(addOrDed, ruleType, id);
        List<String> keys = List.of(pointsRuleKey, pointsRuleTypeKey);
        redisTemplate.delete(keys);
    }


    /**
     * 删除所有积分规则缓存
     */
    @Override
    public void dropAllPointsRule() {
        String keyPattern = generatePointsRuleKey("*");
        List<String> deleteKeys;

        while (true) {
            deleteKeys = scanKeys(keyPattern);
            if (CollUtil.isEmpty(deleteKeys)) {
                break;
            }
            redisTemplate.delete(deleteKeys);
        }
    }


    /**
     * 删除积分规则缓存激活键
     *
     * @param id 积分规则ID
     */
    @Override
    public void dropActivateKey(Serializable id) {
        String key = generatePendingActivationKey(id);
        redisTemplate.delete(key);
    }


    /**
     * 获取默认积分规则缓存
     *
     * @param addOrDed 积分变动类型
     * @param ruleType 积分规则类型
     * @return 积分规则缓存
     */
    @Override
    public PointsRuleCacheDTO getPrimaryPointsRuleCache(String addOrDed, String ruleType) {
        String key = generatePrimaryPointsRuleKey(addOrDed, ruleType);
        Object cache = redisTemplate.opsForValue().get(key);
        if (cache == null) {
            return null;
        }

        return JSONUtil.toBean(cache.toString(), PointsRuleCacheDTO.class);
    }


    /**
     * 获取积分规则缓存
     *
     * @param id 积分规则ID
     * @return 积分规则缓存
     */
    @Override
    public PointsRuleCacheDTO getPointsRule(Serializable id) {
        String key = generatePointsRuleKey(id);
        Object cache = redisTemplate.opsForValue().get(key);
        if (cache == null) {
            return null;
        }

        return JSONUtil.toBean(cache.toString(), PointsRuleCacheDTO.class);
    }


    /**
     * 根据积分变动类型规则类型查询积分规则缓存列表
     *
     * @param addOrDed 积分变动类型
     * @param ruleType 积分规则类型
     * @return 积分规则缓存列表
     */
    @Override
    public List<PointsRuleCacheDTO> queryPointRuleCacheList(String addOrDed, String ruleType) {
        String key = generatePointsRuleKey(addOrDed, ruleType, "*");
        List<String> keys = scanKeys(key);
        if (CollUtil.isEmpty(keys)) {
            return List.of();
        }
        List<Object> caches = redisTemplate.opsForValue().multiGet(keys);
        if (CollUtil.isEmpty(caches)) {
            return List.of();
        }

        List<PointsRuleCacheDTO> pointsRules = new ArrayList<>();
        for (Object cache : caches) {
            pointsRules.add(JSONUtil.toBean(cache.toString(), PointsRuleCacheDTO.class));
        }

        return pointsRules;
    }


    /**
     * private
     * 扫描指定前缀key
     *
     * @param keyPattern key匹配模式
     * @return 匹配的key列表
     */
    private List<String> scanKeys(String keyPattern) {
        List<String> matchKeys = new ArrayList<>();
        ScanOptions scanOptions = ScanOptions.scanOptions().match(keyPattern).count(100).build();

        try {
            redisTemplate.execute((RedisCallback<Object>) connection -> {
                try (Cursor<byte[]> cursor = connection.keyCommands().scan(scanOptions)) {
                    while (cursor.hasNext()) {
                        byte[] keyBytes = cursor.next();
                        if (keyBytes != null) {
                            String matchKey = new String(keyBytes, StandardCharsets.UTF_8);
                            if (StrUtil.isNotBlank(matchKey)) {
                                matchKeys.add(matchKey);
                            }
                        }
                    }
                } catch (Exception e) {
                    log.error("积分规则缓存key扫描失败", e);
                }
                return null;
            });
        } catch (Exception e) {
            log.error("积分规则缓存key扫描失败", e);
        }

        return matchKeys;
    }


    private String generatePointsRuleKey(Serializable id) {
        return KEY_PREFIX_POINTS_RULE + id;
    }


    private String generatePointsRuleKey(String addOrDed, String rulesType, Serializable id) {
        return KEY_PREFIX_POINTS_RULE + addOrDed + ":" + rulesType + ":" + id;
    }


    private String generatePrimaryPointsRuleKey(String addOrDed, String rulesType) {
        return KEY_PREFIX_POINTS_RULE_PRIMARY + addOrDed + ":" + rulesType;
    }


    private String generatePendingActivationKey(Serializable id) {
        return KEY_PREFIX_PENDING_ACTIVATE + id;
    }


}