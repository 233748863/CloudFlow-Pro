package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 集中调度执行日志。
 */
@Data
@TableName("sys_job_log")
public class SysJobLog implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long logId;
    private Long tenantId;
    private Long jobId;
    private String jobName;
    private String handlerName;
    private String executeNo;
    private String triggerType;
    private String triggerBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;
    private Long durationMs;
    private String executeStatus;
    private Integer affectedRows;
    private String resultMsg;
    private String exceptionStack;
    private String executorIp;
    private String dispatcherIp;
    private Integer dispatchRetryIndex;
    private Integer retryIndex;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime reportTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
