package com.cloudflow.auth.domain.vo;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.log.domain.SysApiErrorLog;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public final class ObservabilityModels {
    private ObservabilityModels() {
    }

    public record TraceBundle(String traceId, PageResult<SysLogEntity> operations, PageResult<SysApiErrorLog> errors,
                              PageResult<FrontendEntry> frontend) {
    }

    @Data
    public static class FrontendEntry {
        private Long id;
        private String traceId;
        private String message;
        private String stack;
        private String componentStack;
        private String context;
        private String url;
        private String level;
        private String userName;
        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
        private LocalDateTime createTime;
    }

    @Data
    public static class SlowEndpoint {
        private String serviceName;
        private String requestMethod;
        private String requestUrl;
        private Long requestCount;
        private Long slowCount;
        private BigDecimal averageDuration;
        private Long maximumDuration;
    }

    @Data
    public static class ErrorTrend {
        private String date;
        private Long errorCount;
    }
}
