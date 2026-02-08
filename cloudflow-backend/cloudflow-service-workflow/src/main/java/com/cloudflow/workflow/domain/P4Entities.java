package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

/**
 * P4 所有实体类集合文件
 * 包含P4功能所需的所有数据模型
 */

// ==================== P4.6: 候选人记录 ====================
@Data
@TableName("wf_task_candidate")
class WfTaskCandidate {
    @TableId
    private String candidateId;
    private String taskId;
    private String instanceId;
    private Long userId;
    private String userName;
    private String candidateType; // USER, ROLE, DEPT
    private String status; // PENDING, CLAIMED, CANCELLED
    private Date createTime;
    private Date claimTime;
}

// ==================== P4.9: 任务附件 ====================
@Data
@TableName("wf_task_attachment")
class WfTaskAttachment {
    @TableId
    private String attachmentId;
    private String taskId;
    private String instanceId;
    private String fileName;
    private String fileUrl;
    private String fileType;
    private Long fileSize;
    private Long uploaderId;
    private String uploaderName;
    private Date uploadTime;
}

// ==================== P4.22: 发布记录 ====================
@Data
@TableName("wf_deploy_record")
class WfDeployRecord {
    @TableId
    private String recordId;
    private String definitionId;
    private String processKey;
    private Integer version;
    private Long deployerId;
    private String deployerName;
    private String deployNote;
    private String changeLog;
    private Date deployTime;
}

// ==================== P4.28: 通知配置 ====================
@Data
@TableName("wf_notification_config")
class WfNotificationConfig {
    @TableId
    private String configId;
    private String eventType; // PROCESS_START, TASK_ASSIGN, TASK_COMPLETE, etc.
    private String notifyChannel; // EMAIL, SMS, WEBSOCKET, SYSTEM
    private String templateId;
    private String recipientType; // INITIATOR, ASSIGNEE, ROLE, DEPT
    private String recipientValue;
    private Integer enabled;
    private Date createTime;
    private Date updateTime;
}

// ==================== P4.28: 通知日志 ====================
@Data
@TableName("wf_notification_log")
class WfNotificationLog {
    @TableId
    private String logId;
    private String eventType;
    private String notifyChannel;
    private Long recipientId;
    private String recipientName;
    private String title;
    private String content;
    private String status; // PENDING, SENT, FAILED
    private String errorMsg;
    private Date createTime;
    private Date sentTime;
}

// ==================== P4.27: 催办效果记录 ====================
@Data
@TableName("wf_urge_effect")
class WfUrgeEffect {
    @TableId
    private String effectId;
    private String urgeId;
    private String taskId;
    private Long beforeDuration; // 催办前已耗时（秒）
    private Long afterDuration; // 催办后完成耗时（秒）
    private Integer effectiveness; // 有效性评分 1-5
    private Date urgeTime;
    private Date completeTime;
}

// ==================== P4.11/P4.13: WfTask扩展字段（通过ALTER TABLE添加） ====================
// priority VARCHAR(20) - 优先级: URGENT, HIGH, NORMAL, LOW
// is_timeout TINYINT(1) - 是否超时
// proxy_user_id BIGINT - 代理人ID

// ==================== P4.24: WfProcessInstance扩展字段（通过ALTER TABLE添加） ====================
// priority VARCHAR(20) - 优先级: URGENT, HIGH, NORMAL, LOW
