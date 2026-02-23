package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * 前端错误日志实体类
 * 用于接收前端 errorReporter 上报的错误信息并持久化到数据库
 * 
 * 前端上报的 JSON 示例：
 * {
 *   "message": "Cannot read property 'x' of undefined",
 *   "stack": "TypeError: Cannot read property...",
 *   "componentStack": "\n    at App\n    at ErrorBoundary",
 *   "context": "顶层ErrorBoundary（应用级）",
 *   "url": "https://example.com/dashboard",
 *   "userAgent": "Mozilla/5.0...",
 *   "timestamp": "2026-02-13T01:30:00.000Z",
 *   "level": "error",
 *   "tags": {"module": "dashboard"},
 *   "extra": {"userId": 123}
 * }
 */
@Data
@TableName(value = "sys_frontend_error_log", autoResultMap = true)
public class FrontendErrorLog implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 主键ID */
    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 错误消息 */
    private String message;

    /** 错误堆栈 */
    private String stack;

    /** React组件堆栈 */
    private String componentStack;

    /** 错误发生的上下文描述 */
    private String context;

    /** 页面URL */
    private String url;

    /** 用户代理 */
    private String userAgent;

    /** 错误级别(error/warning/info) */
    private String level;

    /** 标签信息(JSON) - 前端传入对象，数据库存储为 JSON */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, String> tags;

    /** 额外数据(JSON) - 前端传入对象，数据库存储为 JSON */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> extra;

    /** 客户端IP */
    private String clientIp;

    /** 当前用户ID */
    private Long userId;

    /** 当前用户名 */
    private String userName;

    /**
     * 客户端上报时间
     * 前端字段名为 "timestamp"，通过 @JsonAlias 映射到此字段
     */
    @JsonAlias("timestamp")
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", timezone = "UTC")
    private LocalDateTime clientTime;

    /** 服务端接收时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
