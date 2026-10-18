package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 集中调度任务。
 */
@Data
@TableName("sys_job")
public class SysJob implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long jobId;
    private Long tenantId;
    private String jobName;
    private String jobGroup;
    private String serviceName;
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
    private Integer consecutiveFailCount;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime lastFireTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime nextFireTime;
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;
    @Version
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
