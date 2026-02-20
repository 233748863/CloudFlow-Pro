package com.cloudflow.auth.controller;

import com.cloudflow.common.core.domain.R;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.connection.RedisServerCommands;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;
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
     * 获取缓存 Key 列表
     */
    @GetMapping("/keys")
    public R<Set<String>> getKeys() {
        Set<String> keys = redisTemplate.keys("*");
        return R.ok(keys != null ? keys : Collections.emptySet());
    }
}
