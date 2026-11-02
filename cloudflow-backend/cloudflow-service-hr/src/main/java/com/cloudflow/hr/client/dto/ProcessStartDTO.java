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
     * 正式业务类型，取自 HrWorkflowBusinessTypes。
     * 生命周期和假勤的具体子类型保存在业务记录 type / requestType 中。
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
