package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 9.C: 流程实例快照表
 * 用于记录流程在每个节点完成时的状态
 */
@Data
@TableName("wf_process_snapshot")
public class WfProcessSnapshot {
    
    @TableId
    private String snapshotId;
    
    /** 流程实例ID */
    private String instanceId;
    
    /** 节点Key */
    private String nodeKey;
    
    /** 节点名称 */
    private String nodeName;
    
    /** 快照时的流程状态 */
    private String status;
    
    /** 快照时的变量（JSON） */
    private String variables;
    
    /** 快照时的活动任务（JSON） */
    private String activeTasks;
    
    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime createTime;
}
