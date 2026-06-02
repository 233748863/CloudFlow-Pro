package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * P4.6: 候选人记录
 */
@Data
@TableName("wf_task_candidate")
public class WfTaskCandidate {
    @TableId
    private String candidateId;
    /** 租户ID */
    private Long tenantId;
    private String taskId;
    private String instanceId;
    private Long userId;
    private String userName;
    /** 候选类型: USER, ROLE, DEPT */
    private String candidateType;
    /** 状态: PENDING, CLAIMED, CANCELLED */
    private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime createTime;

    @Version

    private Integer version;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime claimTime;
}
