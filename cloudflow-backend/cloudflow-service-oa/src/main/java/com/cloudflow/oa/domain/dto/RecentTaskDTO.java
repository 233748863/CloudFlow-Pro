package com.cloudflow.oa.domain.dto;

import lombok.Data;
import java.io.Serializable;

/**
 * 最近任务 DTO
 */
@Data
public class RecentTaskDTO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 任务ID
     */
    private String taskId;
    
    /**
     * 任务名称
     */
    private String taskName;
    
    /**
     * 流程实例ID
     */
    private String processInstanceId;
    
    /**
     * 流程名称
     */
    private String processName;
    
    /**
     * 任务状态
     */
    private String status;
    
    /**
     * 优先级
     */
    private String priority;
    
    /**
     * 截止时间
     */
    private String deadline;
    
    /**
     * 操作时间
     */
    private String operateTime;
    
    /**
     * 申请人
     */
    private String applicant;
}
