package com.cloudflow.common.log.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 操作日志实体
 *
 * @author CloudFlow
 */
@Data
@TableName("sys_log")
public class SysLogEntity {

    /** 日志ID */
    @TableId(type = IdType.AUTO)
    private Long logId;

    /** 租户ID */
    private Long tenantId;

    /** 日志类型（0正常 9错误） */
    private String logType;

    /** 操作描述 */
    private String title;

    /** 服务名称 */
    private String serviceId;

    /** 客户端IP */
    private String remoteAddr;

    /** User-Agent */
    private String userAgent;

    /** 请求URI */
    private String requestUri;

    /** HTTP方法 */
    private String method;

    /** 请求参数 */
    private String params;

    /** 执行时间(ms) */
    private Long time;

    /** 异常信息 */
    private String exception;

    /** 操作人 */
    private String createBy;

    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
