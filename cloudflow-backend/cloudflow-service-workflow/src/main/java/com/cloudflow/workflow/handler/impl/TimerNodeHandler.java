package com.cloudflow.workflow.handler.impl;

import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.handler.INodeHandler;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * 定时节点处理器。
 * 支持延时执行和定时执行两种模式。
 */
@Component
@RequiredArgsConstructor
public class TimerNodeHandler implements INodeHandler {

    private static final Logger log = LoggerFactory.getLogger(TimerNodeHandler.class);
    private static final String TIMER_ZSET_KEY = "sys:wf:timers";

    private final RedisCache redisCache;

    @Override
    public String getNodeType() {
        return "TIMER";
    }

    @Override
    public boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        log.info("[TimerNodeHandler] 执行定时节点, nodeKey={}, instanceId={}", node.getId(), instance.getInstanceId());

        if (shouldSkipTimer(variables)) {
            log.info("[TimerNodeHandler] 检测到 _skipTimers=true, 直接跳过定时等待, nodeKey={}, instanceId={}",
                    node.getId(), instance.getInstanceId());
            return true;
        }

        Map<String, Object> props = node.getProps();
        if (props == null) {
            log.warn("[TimerNodeHandler] 定时节点未配置属性, nodeKey={}, 将直接跳过", node.getId());
            return true;
        }

        String timerType = (String) props.getOrDefault("timerType", "DELAY");
        long expireTimeMillis;

        if ("SCHEDULE".equals(timerType)) {
            String scheduleTime = (String) props.get("scheduleTime");
            if (!StringUtils.hasText(scheduleTime)) {
                log.warn("[TimerNodeHandler] SCHEDULE 模式未配置 scheduleTime, nodeKey={}, 将直接跳过", node.getId());
                return true;
            }
            try {
                LocalDateTime targetTime;
                if (scheduleTime.contains("T")) {
                    targetTime = LocalDateTime.parse(scheduleTime, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                } else {
                    targetTime = LocalDateTime.parse(scheduleTime, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                }
                expireTimeMillis = targetTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
                if (expireTimeMillis <= System.currentTimeMillis()) {
                    log.info("[TimerNodeHandler] SCHEDULE 时间已过, nodeKey={}, scheduleTime={}, 直接继续",
                            node.getId(), scheduleTime);
                    return true;
                }
            } catch (Exception e) {
                log.error("[TimerNodeHandler] 解析 scheduleTime 失败, nodeKey={}, value={}: {}",
                        node.getId(), scheduleTime, e.getMessage());
                return true;
            }
        } else {
            Object delayObj = props.get("delayMinutes");
            int delayMinutes = 0;
            if (delayObj instanceof Number) {
                delayMinutes = ((Number) delayObj).intValue();
            } else if (delayObj instanceof String) {
                try {
                    delayMinutes = Integer.parseInt((String) delayObj);
                } catch (NumberFormatException ignored) {
                    delayMinutes = 0;
                }
            }

            if (delayMinutes <= 0) {
                log.warn("[TimerNodeHandler] DELAY 模式 delayMinutes 无效({}), nodeKey={}, 将直接跳过",
                        delayMinutes, node.getId());
                return true;
            }
            expireTimeMillis = System.currentTimeMillis() + (long) delayMinutes * 60 * 1000;
        }

        String timerKey = "sys:wf:timer:" + instance.getInstanceId() + ":" + node.getId();
        Map<String, Object> timerData = new HashMap<>();
        timerData.put("instanceId", instance.getInstanceId());
        timerData.put("nodeKey", node.getId());
        timerData.put("timerType", timerType);
        if (variables != null && !variables.isEmpty()) {
            timerData.put("variables", variables);
        }

        try {
            long ttlSeconds = Math.max(3600L, (expireTimeMillis - System.currentTimeMillis()) / 1000 + 86400L);
            redisCache.setCacheObject(timerKey, timerData, ttlSeconds, TimeUnit.SECONDS);
            redisCache.setCacheZSet(TIMER_ZSET_KEY, timerKey, (double) expireTimeMillis);
            long delaySeconds = (expireTimeMillis - System.currentTimeMillis()) / 1000;
            log.info("[TimerNodeHandler] 定时任务已注册, nodeKey={}, instanceId={}, 将在 {} 秒后触发",
                    node.getId(), instance.getInstanceId(), delaySeconds);
        } catch (Exception e) {
            log.error("[TimerNodeHandler] 注册定时任务到 Redis 失败, nodeKey={}: {}", node.getId(), e.getMessage(), e);
            return true;
        }

        return false;
    }

    private boolean shouldSkipTimer(Map<String, Object> variables) {
        if (variables == null || !variables.containsKey("_skipTimers")) {
            return false;
        }
        Object rawValue = variables.get("_skipTimers");
        if (rawValue instanceof Boolean booleanValue) {
            return booleanValue;
        }
        if (rawValue instanceof Number numberValue) {
            return numberValue.intValue() != 0;
        }
        if (rawValue instanceof String textValue) {
            String normalized = textValue.trim();
            return "true".equalsIgnoreCase(normalized) || "1".equals(normalized);
        }
        return false;
    }
}
