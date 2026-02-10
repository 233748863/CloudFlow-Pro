package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.List;

/**
 * 通知配置DTO
 */
@Data
public class NotificationConfigDTO {

    /** 通知类型: EMAIL/SMS/WEBSOCKET/WECHAT */
    private String notificationType;

    /** 接收人类型: USER/ROLE/DEPT/ALL */
    private String recipientType;

    /** 接收人ID列表 */
    private List<Long> recipientIds;

    /** 通知标题 */
    private String notificationTitle;

    /** 通知内容模板 */
    private String notificationContent;
}
