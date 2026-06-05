package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("wf_escalation_log")
public class WfEscalationLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String taskId;
    private String instanceId;
    private String bizModule;
    private Integer levelNo;
    private String actionType;
    private String actionTarget;
    private Long targetUserId;
    private String targetUserName;
    private LocalDateTime triggerAt;
    private LocalDateTime createTime;
}
