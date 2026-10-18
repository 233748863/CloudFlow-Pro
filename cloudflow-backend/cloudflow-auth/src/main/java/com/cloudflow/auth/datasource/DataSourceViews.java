package com.cloudflow.auth.datasource;

import com.cloudflow.common.core.domain.PageResult;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import java.util.List;

public final class DataSourceViews {
    private DataSourceViews() { }

    public record Overview(boolean configured, boolean accountVerificationReady, String message,
            List<String> allowedServices, PageResult<Config> page) { }

    public record Config(Long configId, String configName, String dsKey, String url, String username,
            boolean passwordConfigured, int initSize, int maxActive, List<String> targetServices, String status,
            String remark, int version, @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime updateTime,
            List<Instance> instances) { }

    public record Instance(String serviceName, String instanceKey, int appliedVersion, String status,
            String errorCode, @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime checkedTime) { }

    public record TestResult(boolean successful, String errorCode, String message, long elapsedMillis) { }
}
