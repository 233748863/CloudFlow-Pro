package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("wf_reconcile_alert")
public class WfReconcileAlert {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String bizModule;
    private Long bizId;
    private String wfInstanceId;
    private String bizStatus;
    private String wfStatus;
    private LocalDateTime detectedAt;
    private LocalDateTime resolvedAt;
    private Long resolvedBy;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
