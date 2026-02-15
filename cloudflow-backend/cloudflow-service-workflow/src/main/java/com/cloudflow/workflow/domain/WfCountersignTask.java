package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.util.Date;

/**
 * 5.I: 会签任务实体
 * 用于支持多人同时审批的会签场景
 */
@Data
@TableName("wf_countersign_task")
public class WfCountersignTask {
    
    @TableId
    private String countersignId;
    
    /** 租户ID */
    private Long tenantId;
    
    /** 流程实例ID */
    private String instanceId;
    
    /** 节点Key */
    private String nodeKey;
    
    /** 节点名称 */
    private String nodeName;
    
    /** 会签类型: ALL(全部通过), ANY(任一通过), PERCENT(按比例) */
    private String signType;
    
    /** 通过比例（百分比，如 60 表示 60%），仅 PERCENT 类型有效 */
    private Integer passPercent;
    
    /** 总人数 */
    private Integer totalCount;
    
    /** 已投票人数 */
    private Integer votedCount;
    
    /** 同意人数 */
    private Integer approveCount;
    
    /** 拒绝人数 */
    private Integer rejectCount;
    
    /** 会签状态: VOTING(投票中), PASSED(通过), REJECTED(拒绝) */
    private String status;
    
    /** 顺序签署：有序的审批人ID列表（JSON数组，如 "[1,2,3]"），仅 SEQUENTIAL 类型使用 */
    private String assigneeOrder;
    
    /** 顺序签署：当前签署人在 assigneeOrder 中的索引（从0开始），仅 SEQUENTIAL 类型使用 */
    private Integer currentIndex;
    
    /** 创建时间 */
    private Date createTime;
    
    /** 完成时间 */
    private Date completeTime;
}
