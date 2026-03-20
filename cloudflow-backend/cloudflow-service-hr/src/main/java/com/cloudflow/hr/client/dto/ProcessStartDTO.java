package com.cloudflow.hr.client.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.Map;

/**
 * 流程启动DTO
 * 用于调用Workflow服务启动审批流程
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Data
public class ProcessStartDTO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 租户ID
     */
    private Long tenantId;
    
    /**
     * 流程定义Key
     */
    private String processDefinitionKey;
    
    /**
     * 业务类型
     * ONBOARDING-入职, PROBATION_CONFIRMATION-转正, TRANSFER-调岗, RESIGNATION-离职,
     * LEAVE-请假, OVERTIME-加班, SALARY_ADJUSTMENT-调薪, RECRUITMENT_REQUEST-招聘需求,
     * OFFER-Offer, ATTENDANCE_SUPPLEMENT-补卡
     */
    private String businessType;
    
    /**
     * 业务ID
     */
    private Long businessId;
    
    /**
     * 业务编号
     */
    private String businessNo;
    
    /**
     * 流程标题
     */
    private String processTitle;
    
    /**
     * 发起人ID
     */
    private Long startUserId;
    
    /**
     * 流程变量
     */
    private Map<String, Object> variables;
}
