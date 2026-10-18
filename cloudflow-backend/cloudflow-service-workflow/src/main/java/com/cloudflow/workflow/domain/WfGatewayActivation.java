package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("wf_gateway_activation")
public class WfGatewayActivation {
    @TableId
    private String activationId;
    private Long tenantId;
    private String instanceId;
    private String gatewayId;
    private String joinNodeKey;
    private String joinType;
    private String activatedBranches;
    private Integer expectedCount;
    private String parentContext;
    private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime releasedTime;
    @Version
    private Integer version;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
