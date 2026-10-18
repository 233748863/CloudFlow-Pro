package com.cloudflow.common.log.event;

import com.cloudflow.common.log.domain.SysApiErrorLog;
import com.cloudflow.common.log.mapper.SysApiErrorLogMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;

@Slf4j
@RequiredArgsConstructor
public class ApiErrorLogListener {
    private final SysApiErrorLogMapper mapper;

    @Async("taskExecutor")
    @EventListener
    public void onError(ApiErrorLogEvent event) {
        SysApiErrorLog entry = (SysApiErrorLog) event.getSource();
        try {
            mapper.insert(entry);
        } catch (Exception exception) {
            log.error("错误日志入库失败: traceId={}, exception={}", entry.getTraceId(), exception.getClass().getSimpleName());
        }
    }
}
