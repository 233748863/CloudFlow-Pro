package com.cloudflow.common.log.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("sys_api_error_log")
public class SysApiErrorLog implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long errorId;
    private Long tenantId;
    private String traceId;
    private String serviceName;
    private Long userId;
    private String userName;
    private String requestMethod;
    private String requestUrl;
    private String requestParams;
    private String exceptionClass;
    private String exceptionMessage;
    private String exceptionStack;
    private String clientIp;
    private String userAgent;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime occurTime;
    private String processStatus;
    private String processBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime processTime;
    private String processRemark;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
