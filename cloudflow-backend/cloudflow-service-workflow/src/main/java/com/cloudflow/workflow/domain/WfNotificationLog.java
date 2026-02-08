package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

/**
 * P4.28: 通知日志
 */
@Data
@TableName("wf_notification_log")
public class WfNotificationLog {
    @TableId
    private String logId;
    private String eventType;
    private String notifyChannel;
    private Long recipientId;
    private String recipientName;
    private String title;
    private String content;
    private String status;
    private String errorMsg;
    private Date createTime;
    private Date sentTime;
}
