package com.cloudflow.workflow.handler.impl;

import com.cloudflow.common.core.utils.RedisCache;
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
 * 定时节点处理器
 * 支持两种定时模式：
 * 1. DELAY（延迟执行）：在指定分钟数后自动继续流转
 * 2. SCHEDULE（定时执行）：在指定时间点自动继续流转
 *
 * 实现原理：
 * - 将定时任务注册到 Redis 有序集合（ZSet），score 为到期时间戳
 * - 由定时扫描任务（TaskReminderJob 或独立的 TimerScanJob）定期检查到期的定时节点并触发继续流转
 * - 定时节点返回 false 阻塞流程，等待到期后由扫描任务恢复执行
 *
 * 前端配置的 props 字段：
 * - timerType: 定时类型 (DELAY / SCHEDULE)
 * - delayMinutes: 延迟分钟数（DELAY 模式）
 * - scheduleTime: 定时时间字符串（SCHEDULE 模式，格式 yyyy-MM-ddTHH:mm）
 *
 * @author CloudFlow
 */
@Component
@RequiredArgsConstructor
public class TimerNodeHandler implements INodeHandler {

    private static final Logger log = LoggerFactory.getLogger(TimerNodeHandler.class);

    /** Redis ZSet key，需与 TimerScanJob 保持一致 */
    private static final String TIMER_ZSET_KEY = "sys:wf:timers";

    private final RedisCache redisCache;

    @Override
    public String getNodeType() {
        return "TIMER";
    }

    @Override
    public boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        log.info("[TimerNodeHandler] 执行定时节点, nodeKey={}, instanceId={}", node.getId(), instance.getInstanceId());

        Map<String, Object> props = node.getProps();
        if (props == null) {
            log.warn("[TimerNodeHandler] 定时节点未配置属性, nodeKey={}, 将直接跳过", node.getId());
            return true; // 无配置则直接继续
        }

        String timerType = (String) props.getOrDefault("timerType", "DELAY");
        long expireTimeMillis;

        if ("SCHEDULE".equals(timerType)) {
            // 定时执行模式：解析指定的时间点
            String scheduleTime = (String) props.get("scheduleTime");
            if (!StringUtils.hasText(scheduleTime)) {
                log.warn("[TimerNodeHandler] SCHEDULE 模式未配置 scheduleTime, nodeKey={}, 将直接跳过", node.getId());
                return true;
            }
            try {
                // 前端传入格式为 yyyy-MM-ddTHH:mm 或 yyyy-MM-dd HH:mm:ss
                LocalDateTime targetTime;
                if (scheduleTime.contains("T")) {
                    targetTime = LocalDateTime.parse(scheduleTime, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                } else {
                    targetTime = LocalDateTime.parse(scheduleTime, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                }
                expireTimeMillis = targetTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();

                // 如果指定时间已过，直接继续
                if (expireTimeMillis <= System.currentTimeMillis()) {
                    log.info("[TimerNodeHandler] SCHEDULE 时间已过, nodeKey={}, scheduleTime={}, 直接继续",
                            node.getId(), scheduleTime);
                    return true;
                }
            } catch (Exception e) {
                log.error("[TimerNodeHandler] 解析 scheduleTime 失败, nodeKey={}, value={}: {}",
                        node.getId(), scheduleTime, e.getMessage());
                return true; // 解析失败则直接继续，不阻塞流程
            }
        } else {
            // 延迟执行模式：计算到期时间
            Object delayObj = props.get("delayMinutes");
            int delayMinutes = 0;
            if (delayObj instanceof Number) {
                delayMinutes = ((Number) delayObj).intValue();
            } else if (delayObj instanceof String) {
                try {
                    delayMinutes = Integer.parseInt((String) delayObj);
                } catch (NumberFormatException ignored) {}
            }

            if (delayMinutes <= 0) {
                log.warn("[TimerNodeHandler] DELAY 模式延迟时间无效({}分钟), nodeKey={}, 将直接跳过",
                        delayMinutes, node.getId());
                return true;
            }

            expireTimeMillis = System.currentTimeMillis() + (long) delayMinutes * 60 * 1000;
        }

        // 将定时任务注册到 Redis（与 TimerScanJob 协议保持一致）
        // timerKey 作为 ZSet member，同时对应一条 Hash/Object 数据
        String timerKey = "sys:wf:timer:" + instance.getInstanceId() + ":" + node.getId();
        Map<String, Object> timerData = new HashMap<>();
        timerData.put("instanceId", instance.getInstanceId());
        timerData.put("nodeKey", node.getId());
        timerData.put("timerType", timerType);
        if (variables != null && !variables.isEmpty()) {
            timerData.put("variables", variables);
        }

        try {
            // 数据对象的 TTL 至少覆盖触发时间，额外保留 1 天避免边界丢失
            long ttlSeconds = Math.max(3600L, (expireTimeMillis - System.currentTimeMillis()) / 1000 + 86400L);
            redisCache.setCacheObject(timerKey, timerData, ttlSeconds, TimeUnit.SECONDS);
            redisCache.setCacheZSet(TIMER_ZSET_KEY, timerKey, (double) expireTimeMillis);
            long delaySeconds = (expireTimeMillis - System.currentTimeMillis()) / 1000;
            log.info("[TimerNodeHandler] 定时任务已注册, nodeKey={}, instanceId={}, 将在 {}秒后({}分钟后)触发",
                    node.getId(), instance.getInstanceId(), delaySeconds, delaySeconds / 60);
        } catch (Exception e) {
            log.error("[TimerNodeHandler] 注册定时任务到 Redis 失败, nodeKey={}: {}", node.getId(), e.getMessage(), e);
            // Redis 注册失败时直接继续，避免流程永久阻塞
            return true;
        }

        // 返回 false 阻塞流程，等待定时扫描任务到期后触发 advanceAfterNode 继续流转
        return false;
    }
}
