package com.cloudflow.workflow.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 流程实例VO
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Data
public class ProcessInstanceVO {

    /**
     * 流程实例ID
     */
    private String instanceId;

    /**
     * 流程定义ID
     */
    private String processDefId;

    /**
     * 流程定义Key
     */
    private String processDefKey;

    /**
     * 流程定义名称
     */
    private String processDefName;

    /**
     * 业务键
     */
    private String businessKey;

    /**
     * 发起人ID
     */
    private Long startUserId;

    /**
     * 发起人姓名
     */
    private String startUserName;

    /**
     * 开始时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    /**
     * 结束时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;

    /**
     * 流程状态
     */
    private String status;

    /**
     * 当前节点
     */
    private String currentNode;
}
