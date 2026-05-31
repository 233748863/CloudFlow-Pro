package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.FrontendErrorLog;
import com.cloudflow.oa.mapper.FrontendErrorLogMapper;
import com.cloudflow.oa.service.IFrontendErrorLogService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 前端错误日志 Service 实现
 * 接收前端上报的错误信息，异步写入数据库，避免阻塞前端请求
 */
@Slf4j
@Service
public class FrontendErrorLogServiceImpl extends ServiceImpl<FrontendErrorLogMapper, FrontendErrorLog>
        implements IFrontendErrorLogService {

    @Override
    public void reportError(FrontendErrorLog errorLog, String clientIp) {
        sanitize(errorLog);
        errorLog.setClientIp(clientIp);
        errorLog.setCreateTime(LocalDateTime.now());

        try {
            Long userId = UserContext.getUserId();
            String userName = UserContext.getUserName();
            Long tenantId = UserContext.getTenantId();
            if (userId != null) {
                errorLog.setUserId(userId);
            }
            if (userName != null) {
                errorLog.setUserName(userName);
            }
            if (tenantId != null) {
                errorLog.setTenantId(tenantId);
            }
        } catch (Exception e) {
            log.debug("获取用户上下文失败，跳过用户信息填充: {}", e.getMessage());
        }

        asyncSave(errorLog);
    }

    @Async
    public void asyncSave(FrontendErrorLog errorLog) {
        try {
            this.save(errorLog);
            log.info("前端错误日志已记录: level={}, message={}, url={}",
                    errorLog.getLevel(), errorLog.getMessage(), errorLog.getUrl());
        } catch (Exception e) {
            log.error("前端错误日志写入数据库失败，降级为日志输出。原始错误: level={}, message={}, url={}, stack={}",
                    errorLog.getLevel(), errorLog.getMessage(), errorLog.getUrl(), errorLog.getStack(), e);
        }
    }

    private void sanitize(FrontendErrorLog errorLog) {
        if (errorLog == null) {
            throw new IllegalArgumentException("错误上报内容不能为空");
        }
        errorLog.setMessage(limit(errorLog.getMessage(), 1000));
        errorLog.setStack(limit(errorLog.getStack(), 8000));
        errorLog.setComponentStack(limit(errorLog.getComponentStack(), 4000));
        errorLog.setContext(limit(errorLog.getContext(), 500));
        errorLog.setUrl(limit(errorLog.getUrl(), 1000));
        errorLog.setUserAgent(limit(errorLog.getUserAgent(), 1000));
        errorLog.setLevel(normalizeLevel(errorLog.getLevel()));
        errorLog.setTags(limitMap(errorLog.getTags(), 20, 100));
        errorLog.setExtra(limitObjectMap(errorLog.getExtra(), 20, 500));
    }

    private String limit(String value, int maxLength) {
        if (!StringUtils.hasText(value)) {
            return value;
        }
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private String normalizeLevel(String level) {
        if (!StringUtils.hasText(level)) {
            return "error";
        }
        String normalized = level.trim().toLowerCase();
        return switch (normalized) {
            case "info", "warning", "error" -> normalized;
            default -> "error";
        };
    }

    private Map<String, String> limitMap(Map<String, String> source, int maxEntries, int maxValueLength) {
        if (source == null || source.isEmpty()) {
            return source;
        }
        java.util.Map<String, String> limited = new java.util.LinkedHashMap<>();
        for (Map.Entry<String, String> entry : source.entrySet()) {
            if (limited.size() >= maxEntries) {
                break;
            }
            String key = limit(entry.getKey(), 100);
            if (!StringUtils.hasText(key)) {
                continue;
            }
            limited.put(key, limit(entry.getValue(), maxValueLength));
        }
        return limited;
    }

    private Map<String, Object> limitObjectMap(Map<String, Object> source, int maxEntries, int maxValueLength) {
        if (source == null || source.isEmpty()) {
            return source;
        }
        java.util.Map<String, Object> limited = new java.util.LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            if (limited.size() >= maxEntries) {
                break;
            }
            String key = limit(entry.getKey(), 100);
            if (!StringUtils.hasText(key)) {
                continue;
            }
            Object value = entry.getValue();
            limited.put(key, value instanceof String ? limit((String) value, maxValueLength) : value);
        }
        return limited;
    }
}
