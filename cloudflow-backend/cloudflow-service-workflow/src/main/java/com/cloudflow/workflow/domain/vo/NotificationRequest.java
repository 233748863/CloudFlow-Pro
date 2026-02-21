package com.cloudflow.workflow.domain.vo;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 通知请求VO
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Data
public class NotificationRequest {

    /**
     * 通知类型：EMAIL/SMS/SYSTEM
     */
    private String notificationType;

    /**
     * 接收人ID列表
     */
    private List<Long> receiverIds;

    /**
     * 接收人列表（别名，用于兼容）
     */
    public List<Long> getRecipients() {
        return receiverIds;
    }

    public void setRecipients(List<Long> recipients) {
        this.receiverIds = recipients;
    }

    /**
     * 通知类型（别名，用于兼容）
     */
    public String getType() {
        return notificationType;
    }

    public void setType(String type) {
        this.notificationType = type;
    }

    /**
     * 标题
     */
    private String title;

    /**
     * 内容
     */
    private String content;

    /**
     * 模板代码
     */
    private String templateCode;

    /**
     * 模板参数
     */
    private Map<String, Object> templateParams;

    /**
     * 业务类型
     */
    private String businessType;

    /**
     * 业务ID
     */
    private String businessId;

    /**
     * 优先级：LOW/NORMAL/HIGH/URGENT
     */
    private String priority;
}
