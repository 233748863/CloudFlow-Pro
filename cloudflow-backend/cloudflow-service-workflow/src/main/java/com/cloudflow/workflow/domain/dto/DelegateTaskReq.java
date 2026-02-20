package com.cloudflow.workflow.domain.dto;

import lombok.Data;

/**
 * P1-5: 委派任务请求 DTO
 * 支持两种模式：
 * - TRANSFER: 直接转办（任务完全移交给目标用户）
 * - DELEGATE: 委派（目标用户处理后自动回到委派人）
 */
@Data
public class DelegateTaskReq {

    /** 任务ID */
    private String taskId;

    /** 目标用户ID */
    private Long toUserId;

    /** 目标用户名称 */
    private String toUserName;

    /**
     * 委派模式
     * TRANSFER - 直接转办：任务完全移交，原处理人不再参与
     * DELEGATE - 委派审批：目标用户处理后，任务自动回到委派人确认
     */
    private String mode;

    /** 委派原因 */
    private String reason;
}
