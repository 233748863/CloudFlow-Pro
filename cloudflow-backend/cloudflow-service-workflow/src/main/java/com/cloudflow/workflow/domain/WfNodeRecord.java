package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 节点执行记录实体
 * 借鉴 poco-flow FlowProcessEventListener 中 ACTIVITY_STARTED / ACTIVITY_COMPLETED 事件的设计，
 * 记录每个节点的开始时间、结束时间、执行人、状态等信息，
 * 用于精确的流程轨迹展示和节点级性能分析。
 *
 * 与 WfTaskHistory 的区别：
 * - WfTaskHistory 只记录需要人工操作的审批任务的完成记录
 * - WfNodeRecord 记录所有节点（包括自动节点如通知、脚本、定时、抄送等）的执行记录
 * - WfNodeRecord 精确记录节点的开始和结束时间，可用于性能分析
 */
@Data
@TableName("wf_node_record")
public class WfNodeRecord {

    /** 主键ID */
    @TableId(type = IdType.AUTO)
    private Long id;

    /** 流程实例ID */
    private String instanceId;

    /** 流程定义Key */
    private String processDefKey;

    /** 节点Key（对应 WfNodeConfig.id） */
    private String nodeKey;

    /** 节点名称 */
    private String nodeName;

    /** 节点类型（APPROVAL / NOTIFICATION / SCRIPT / TIMER / COPY / MANUAL / CONDITION / PARALLEL / END） */
    private String nodeType;

    /**
     * 节点执行状态
     * RUNNING - 执行中（节点开始但未完成，如审批节点等待用户操作）
     * COMPLETED - 正常完成
     * SKIPPED - 被跳过（如条件分支未命中）
     * FAILED - 执行失败（如脚本节点异常）
     */
    private String status;

    /** 执行人ID（审批/人工任务节点的处理人） */
    private Long executorId;

    /** 执行人姓名 */
    private String executorName;

    /** 节点开始时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    /** 节点结束时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;

    /** 执行耗时（毫秒） */
    private Long durationMs;

    /** 附加信息（JSON 格式，如审批意见、脚本执行结果、变量变更等） */
    private String extraData;

    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
