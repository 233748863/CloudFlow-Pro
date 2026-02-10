package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

/**
 * P4.2: 加签记录
 */
@Data
@TableName("wf_task_add_sign")
public class WfTaskAddSign {
    @TableId
    private String addSignId;
    
    /** 租户ID */
    private Long tenantId;
    
    /** 原任务ID */
    private String taskId;
    
    /** 流程实例ID */
    private String instanceId;
    
    /** 加签类型: BEFORE(前加签), AFTER(后加签), PARALLEL(并行加签) */
    private String signType;
    
    /** 加签人ID列表（逗号分隔） */
    private String signUserIds;
    
    /** 加签人名称列表（逗号分隔） */
    private String signUserNames;
    
    /** 发起人ID */
    private Long initiatorId;
    
    /** 发起人名称 */
    private String initiatorName;
    
    /** 加签原因 */
    private String reason;
    
    /** 状态: PENDING(待处理), COMPLETED(已完成), CANCELLED(已取消) */
    private String status;
    
    /** 创建时间 */
    private Date createTime;
    
    /** 完成时间 */
    private Date completeTime;
}
