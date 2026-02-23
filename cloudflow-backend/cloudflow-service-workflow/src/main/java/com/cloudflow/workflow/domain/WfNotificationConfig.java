package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * P4.28: 通知配置
 */
@Data
@TableName("wf_notification_config")
public class WfNotificationConfig {
    @TableId
    private String configId;
    private String eventType;
    private String notifyChannel;
    private String templateId;
    private String recipientType;
    private String recipientValue;
    private Integer enabled;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime updateTime;
}
