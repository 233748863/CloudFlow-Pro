package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

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
    private Date createTime;
    private Date updateTime;
}
