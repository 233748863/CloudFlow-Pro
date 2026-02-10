package com.cloudflow.workflow.domain;

/**
 * P4 实体类说明文件
 * 
 * P4 功能所需的所有数据模型已拆分为独立文件：
 * - WfTaskCandidate.java - P4.6: 候选人记录
 * - WfTaskAttachment.java - P4.9: 任务附件
 * - WfDeployRecord.java - P4.22: 发布记录
 * - WfNotificationConfig.java - P4.28: 通知配置
 * - WfNotificationLog.java - P4.28: 通知日志
 * - WfUrgeEffect.java - P4.27: 催办效果记录
 * 
 * 注意：WfTask 和 WfProcessInstance 的扩展字段通过 ALTER TABLE 添加
 * - priority VARCHAR(20) - 优先级: URGENT, HIGH, NORMAL, LOW
 * - is_timeout TINYINT(1) - 是否超时
 * - proxy_user_id BIGINT - 代理人ID
 */
public class P4Entities {
    // 此类仅作为文档说明，所有实体已拆分为独立文件
    private P4Entities() {}
}
