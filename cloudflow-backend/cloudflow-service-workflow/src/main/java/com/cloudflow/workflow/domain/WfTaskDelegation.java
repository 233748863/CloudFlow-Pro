package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

/**
 * P4.1/P4.5: 任务委托/转办/代理记录
 */
@Data
@TableName("wf_task_delegation")
public class WfTaskDelegation {
    @TableId
    private String delegationId;
    
    /** 租户ID */
    private Long tenantId;
    
    /** 原任务ID */
    private String taskId;
    
    /** 流程实例ID */
    private String instanceId;
    
    /** 委托类型: DELEGATE(转办), PROXY(代理) */
    private String delegationType;
    
    /** 原处理人ID */
    private Long fromUserId;
    
    /** 原处理人名称 */
    private String fromUserName;
    
    /** 目标处理人ID */
    private Long toUserId;
    
    /** 目标处理人名称 */
    private String toUserName;
    
    /** 委托原因 */
    private String reason;
    
    /** 状态: ACTIVE(生效中), COMPLETED(已完成), CANCELLED(已取消) */
    private String status;
    
    /** 代理开始时间（仅代理模式） */
    private Date startTime;
    
    /** 代理结束时间（仅代理模式） */
    private Date endTime;
    
    /** 创建时间 */
    private Date createTime;
}
