package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 流程发布通知记录实体
 */
@Data
@TableName("wf_deploy_notification")
public class WfDeployNotification {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 发布记录ID */
    private Long deployId;

    /** 通知类型: EMAIL-邮件, SMS-短信, WEBSOCKET-站内信, WECHAT-微信 */
    private String notificationType;

    /** 接收人类型: USER-指定用户, ROLE-角色, DEPT-部门, ALL-所有人 */
    private String recipientType;

    /** 接收人ID列表(JSON数组) */
    private String recipientIds;

    /** 通知标题 */
    private String notificationTitle;

    /** 通知内容 */
    private String notificationContent;

    /** 发送状态: PENDING-待发送, SENDING-发送中, SUCCESS-成功, FAILED-失败 */
    private String sendStatus;

    /** 发送时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sendTime;

    /** 错误信息 */
    private String errorMessage;

    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdTime;
}
