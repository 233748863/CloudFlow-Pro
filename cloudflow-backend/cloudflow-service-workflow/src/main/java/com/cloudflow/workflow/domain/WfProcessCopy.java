package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 流程抄送记录实体
 * 当流程执行到抄送节点时，为每个抄送人创建一条记录，
 * 抄送人可以在"抄送我的"列表中查看流程详情和表单数据
 */
@Data
@TableName("wf_process_copy")
public class WfProcessCopy {

    /** 主键ID */
    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 流程实例ID */
    private String instanceId;

    /** 流程定义Key */
    private String processDefKey;

    /** 流程标题 */
    private String title;

    /** 抄送节点ID */
    private String nodeId;

    /** 抄送节点名称 */
    private String nodeName;

    /** 发起人ID */
    private Long startUserId;

    /** 发起人姓名 */
    private String startUserName;

    /** 抄送接收人ID */
    private Long userId;

    /** 表单数据快照（JSON格式，记录抄送时刻的表单数据） */
    private String formData;

    /** 是否已读：0-未读，1-已读 */
    private Integer isRead;

    /** 已读时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime readTime;

    /** 抄送时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime createTime;

    // ========== 非数据库字段，用于列表展示 ==========

    /** 流程名称（关联查询） */
    @TableField(exist = false)
    private String processName;

    /** 流程状态（关联查询） */
    @TableField(exist = false)
    private String processStatus;
}
