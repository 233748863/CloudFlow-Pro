package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * P4.28: 通知日志
 */
@Data
@TableName("wf_notification_log")
public class WfNotificationLog {
    @TableId
    private String logId;
    private String eventType;
    @TableField("notification_type")
    private String notifyChannel;
    private Long recipientId;
    private String recipientName;
    private String title;
    private String content;
    @TableField("send_status")
    private String status;
    @TableField("error_message")
    private String errorMsg;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime createTime;

    @Version

    private Integer version;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    @TableField("send_time")
    private LocalDateTime sentTime;
}
