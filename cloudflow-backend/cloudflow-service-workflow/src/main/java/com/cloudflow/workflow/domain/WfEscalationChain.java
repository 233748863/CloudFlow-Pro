package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("wf_escalation_chain")
public class WfEscalationChain {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String bizModule;
    private Integer levelNo;
    private Integer timeoutMinutes;
    private String actionType;
    private String actionTarget;
    private Integer status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
