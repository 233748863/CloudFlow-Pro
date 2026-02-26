package com.cloudflow.auth.controller;

import com.cloudflow.common.core.domain.R;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.connection.DataType;
import org.springframework.data.redis.connection.RedisServerCommands;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 缓存监控控制器
 * 提供 Redis 缓存信息查询接口，用于运维监控
 *
 * @author CloudFlow
 */
@RestController
@RequestMapping("/system/cache")
@RequiredArgsConstructor
public class CacheMonitorController {

    private final RedisTemplate<String, Object> redisTemplate;
    /** 用于读取原始字符串值，避免 Jackson 反序列化带 @class 的问题 */
    private final StringRedisTemplate stringRedisTemplate;

    /**
     * 获取 Redis 缓存监控信息
     * 包含：服务器信息、Key 数量、命令统计、Key 分组统计
     */
    @GetMapping("/info")
    public R<Map<String, Object>> getInfo() {
        // 获取 Redis 服务器信息
        Properties info = (Properties) redisTemplate.execute(
                (RedisCallback<Object>) RedisServerCommands::info);

        // 获取 Key 总数
        Long dbSize = redisTemplate.execute(
                (RedisCallback<Long>) RedisServerCommands::dbSize);

        // 获取命令统计
        Properties commandStats = (Properties) redisTemplate.execute(
                (RedisCallback<Object>) connection -> connection.serverCommands().info("commandstats"));

        // 解析命令统计为列表
        List<Map<String, Object>> commandList = new ArrayList<>();
        if (commandStats != null) {
            commandStats.stringPropertyNames().forEach(key -> {
                Map<String, Object> data = new HashMap<>(2);
                String property = commandStats.getProperty(key);
                // 格式：cmdstat_get:calls=100,usec=200,usec_per_call=2.00
                data.put("name", key.replace("cmdstat_", ""));
                data.put("value", property.split(",")[0].split("=")[1]);
                commandList.add(data);
            });
        }
        // 按调用次数降序排列，取 Top 10
        commandList.sort((a, b) -> Long.compare(
                Long.parseLong(b.get("value").toString()),
                Long.parseLong(a.get("value").toString())));
        List<Map<String, Object>> topCommands = commandList.stream()
                .limit(10).collect(Collectors.toList());

        // 获取 Key 分组统计（按冒号前缀分组）
        Set<String> keys = redisTemplate.keys("*");
        Map<String, Long> keyGroupMap = new TreeMap<>();
        if (keys != null) {
            for (String key : keys) {
                String prefix = key.contains(":") ? key.substring(0, key.indexOf(":")) : key;
                keyGroupMap.merge(prefix, 1L, Long::sum);
            }
        }
        List<Map<String, Object>> keyGroups = keyGroupMap.entrySet().stream()
                .map(entry -> {
                    Map<String, Object> group = new HashMap<>(2);
                    group.put("prefix", entry.getKey());
                    group.put("count", entry.getValue());
                    return group;
                })
                .sorted((a, b) -> Long.compare(
                        (Long) b.get("count"), (Long) a.get("count")))
                .collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>(4);
        result.put("info", info);
        result.put("dbSize", dbSize);
        result.put("commandStats", topCommands);
        result.put("keyGroups", keyGroups);
        return R.ok(result);
    }

    /**
     * 获取缓存 Key 列表（支持模式匹配）
     *
     * @param pattern 匹配模式，默认 *（全部）
     */
    @GetMapping("/keys")
    public R<Set<String>> getKeys(@RequestParam(defaultValue = "*") String pattern) {
        Set<String> keys = redisTemplate.keys(pattern);
        return R.ok(keys != null ? keys : Collections.emptySet());
    }

    /**
     * 获取指定 Key 的详细信息（值、类型、TTL）
     *
     * @param key Redis key 名称（Base64 编码，避免路径特殊字符问题）
     */
    @GetMapping("/value")
    public R<Map<String, Object>> getKeyValue(@RequestParam String key) {
        if (key == null || key.isEmpty()) {
            return R.fail("Key 不能为空");
        }

        Boolean exists = redisTemplate.hasKey(key);
        if (exists == null || !exists) {
            return R.fail("Key 不存在: " + key);
        }

        Map<String, Object> result = new HashMap<>(4);
        result.put("key", key);

        // 获取数据类型
        DataType type = redisTemplate.type(key);
        result.put("type", type != null ? type.code() : "unknown");

        // 获取 TTL（秒），-1 表示永不过期，-2 表示 key 不存在
        Long ttl = redisTemplate.getExpire(key, TimeUnit.SECONDS);
        result.put("ttl", ttl != null ? ttl : -2);

        // 使用 StringRedisTemplate 读取原始值，避免 Jackson @class 反序列化问题
        try {
            if (type == DataType.STRING) {
                String value = stringRedisTemplate.opsForValue().get(key);
                result.put("value", value);
            } else if (type == DataType.LIST) {
                Long size = stringRedisTemplate.opsForList().size(key);
                List<String> list = stringRedisTemplate.opsForList().range(key, 0, Math.min(size != null ? size : 0, 100) - 1);
                result.put("value", list);
                result.put("size", size);
            } else if (type == DataType.SET) {
                Set<String> members = stringRedisTemplate.opsForSet().members(key);
                result.put("value", members);
                result.put("size", members != null ? members.size() : 0);
            } else if (type == DataType.ZSET) {
                Long size = stringRedisTemplate.opsForZSet().size(key);
                Set<String> range = stringRedisTemplate.opsForZSet().range(key, 0, Math.min(size != null ? size : 0, 100) - 1);
                result.put("value", range);
                result.put("size", size);
            } else if (type == DataType.HASH) {
                Map<Object, Object> entries = stringRedisTemplate.opsForHash().entries(key);
                result.put("value", entries);
                result.put("size", entries.size());
            } else {
                result.put("value", "[不支持的类型: " + (type != null ? type.code() : "unknown") + "]");
            }
        } catch (Exception e) {
            result.put("value", "[读取失败: " + e.getMessage() + "]");
        }

        return R.ok(result);
    }

    /**
     * 删除指定的 Key
     *
     * @param key 要删除的 key 名称
     */
    @DeleteMapping("/key")
    public R<Boolean> deleteKey(@RequestParam String key) {
        if (key == null || key.isEmpty()) {
            return R.fail("Key 不能为空");
        }
        Boolean deleted = redisTemplate.delete(key);
        return R.ok(deleted != null && deleted);
    }

    /**
     * 按前缀批量删除 Key
     *
     * @param prefix key 前缀（会自动追加 * 通配符）
     */
    @DeleteMapping("/prefix")
    public R<Long> deleteByPrefix(@RequestParam String prefix) {
        if (prefix == null || prefix.isEmpty()) {
            return R.fail("前缀不能为空");
        }
        // 安全检查：不允许删除所有 key
        if ("*".equals(prefix.trim())) {
            return R.fail("不允许删除所有 Key，请使用具体前缀");
        }
        String pattern = prefix.endsWith("*") ? prefix : prefix + "*";
        Set<String> keys = redisTemplate.keys(pattern);
        if (keys != null && !keys.isEmpty()) {
            Long count = redisTemplate.delete(keys);
            return R.ok(count != null ? count : 0L);
        }
        return R.ok(0L);
    }
}
