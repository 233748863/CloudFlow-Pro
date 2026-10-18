package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.TraceContext;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.oa.domain.FrontendErrorLog;
import com.cloudflow.oa.mapper.FrontendErrorLogMapper;
import com.cloudflow.oa.service.IFrontendErrorLogService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class FrontendErrorLogServiceImpl extends ServiceImpl<FrontendErrorLogMapper, FrontendErrorLog>
        implements IFrontendErrorLogService {
    private final ApplicationEventPublisher publisher;
    private final ObjectMapper objectMapper;

    @Override
    public void reportError(FrontendErrorLog entry, String clientIp) {
        if (entry == null) throw new IllegalArgumentException("错误上报内容不能为空");
        entry.setId(null);
        entry.setUserId(UserContext.getUserId());
        entry.setUserName(LogSanitizer.limit(UserContext.getUserName(), 64));
        entry.setTenantId(UserContext.getTenantId() == null ? 0L : UserContext.getTenantId());
        entry.setClientIp(LogSanitizer.limit(clientIp, 64));
        entry.setCreateTime(LocalDateTime.now());
        entry.setTraceId(TraceContext.isValid(entry.getTraceId()) ? entry.getTraceId() : null);
        entry.setMessage(LogSanitizer.limit(entry.getMessage(), 1000));
        entry.setStack(LogSanitizer.limit(entry.getStack(), 8000));
        entry.setComponentStack(LogSanitizer.limit(entry.getComponentStack(), 4000));
        entry.setContext(LogSanitizer.limit(entry.getContext(), 200));
        entry.setUrl(LogSanitizer.limit(entry.getUrl(), 500));
        entry.setUserAgent(LogSanitizer.limit(entry.getUserAgent(), 500));
        String level = entry.getLevel() == null ? "error" : entry.getLevel().trim().toLowerCase(Locale.ROOT);
        entry.setLevel(java.util.Set.of("error", "warning", "info").contains(level) ? level : "error");
        entry.setExtra(safeMap(entry.getExtra()));
        Map<String, String> tags = new LinkedHashMap<>();
        if (entry.getTags() != null) {
            safeMap(entry.getTags()).forEach((key, value) -> tags.put(key, LogSanitizer.limit(String.valueOf(value), 100)));
        }
        entry.setTags(tags);
        publisher.publishEvent(new Reported(entry));
    }

    @Async("taskExecutor")
    @EventListener
    public void onReported(Reported event) {
        FrontendErrorLog entry = event.entry();
        try {
            baseMapper.insert(entry);
        } catch (Exception exception) {
            log.error("前端错误入库失败: traceId={}, exception={}", entry.getTraceId(), exception.getClass().getSimpleName());
        }
    }

    private Map<String, Object> safeMap(Map<String, ?> source) {
        if (source == null) return Map.of();
        Map<String, Object> bounded = new LinkedHashMap<>();
        source.entrySet().stream().limit(20).forEach(entry -> bounded.put(LogSanitizer.limit(entry.getKey(), 100), entry.getValue()));
        try {
            return objectMapper.readValue(LogSanitizer.json(bounded, objectMapper, 8000), new TypeReference<Map<String, Object>>() {});
        } catch (Exception exception) {
            return Map.of("notice", "内容已安全截断");
        }
    }

    public record Reported(FrontendErrorLog entry) {
    }
}
