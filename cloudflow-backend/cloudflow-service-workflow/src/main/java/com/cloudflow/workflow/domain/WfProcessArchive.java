package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 流程归档实体
 * 
 * @author CloudFlow
 */
@Data
@TableName("workflow_archive")
public class WfProcessArchive {

    /**
     * 归档记录 ID
     */
    @TableId
    private String id;

    /**
     * 流程 ID
     */
    private String workflowId;

    /**
     * 流程名称（冗余存储）
     */
    private String workflowName;

    /**
     * 归档操作人 ID
     */
    private String archivedBy;

    /**
     * 归档时间
     */
    private LocalDateTime archivedAt;

    /**
     * 归档原因
     */
    private String archiveReason;

    /**
     * 是否可恢复（1-可恢复，0-不可恢复）
     */
    private Integer canRestore;

    /**
     * 原始流程数据（JSON 格式）
     */
    private String originalData;
}
