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
    private String processInstanceId;
    private String businessType;
    private Long businessId;
    private String expectedStatus;
    private String actualStatus;
    private LocalDateTime createTime;
}
