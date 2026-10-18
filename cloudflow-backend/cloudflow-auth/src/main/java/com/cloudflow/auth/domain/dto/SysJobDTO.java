package com.cloudflow.auth.domain.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 定时任务维护请求。
 */
@Data
public class SysJobDTO {
    private Long jobId;
    @NotBlank(message = "任务名称不能为空")
    private String jobName;
    private String jobGroup;
    @NotBlank(message = "服务名不能为空")
    private String serviceName;
    @NotBlank(message = "Handler不能为空")
    private String handlerName;
    private String handlerParam;
    private String triggerType;
    private String cronExpression;
    private Long intervalMs;
    private String status;
    private Integer concurrentFlag;
    private String misfireStrategy;
    private Integer retryCount;
    private Integer retryIntervalSec;
    private Integer dispatchRetryCount;
    private Integer dispatchRetryIntervalSec;
    private Integer timeoutSeconds;
    private Integer lockTimeSeconds;
    private Integer criticalFlag;
    private Integer logSuccessFlag;
    private Integer alarmOnFailFlag;
    private String alarmReceiver;
    private Boolean confirmCritical;
    private String remark;
}
