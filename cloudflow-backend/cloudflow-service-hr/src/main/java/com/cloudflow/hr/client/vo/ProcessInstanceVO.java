package com.cloudflow.hr.client.vo;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.io.Serializable;

/**
 * 流程实例VO
 * 从Workflow服务获取的流程实例信息
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class ProcessInstanceVO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 流程实例ID
     */
    private String processInstanceId;
    
    /**
     * 流程定义ID
     */
    private String processDefinitionId;
    
    /**
     * 流程定义Key
     */
    private String processDefinitionKey;
    
    /**
     * 流程定义名称
     */
    private String processDefinitionName;
    
    /**
     * 业务类型
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
     * 发起人名称
     */
    private String startUserName;
    
    /**
     * 流程状态
     * RUNNING-运行中, COMPLETED-已完成, SUSPENDED-已挂起, CANCELLED-已取消
     */
    private String status;
    
    /**
     * 当前节点名称
     */
    private String currentNodeName;
    
    /**
     * 开始时间
     */
    private String startTime;
    
    /**
     * 结束时间
     */
    private String endTime;
}
