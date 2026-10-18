package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 用户消息订阅配置。
 */
@Data
@TableName("sys_message_subscribe")
public class SysMessageSubscribe implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long subscribeId;
    private Long tenantId;
    private Long userId;
    private String messageCategory;
    private String channelType;
    private Integer enabledFlag;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime quietStart;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime quietEnd;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
