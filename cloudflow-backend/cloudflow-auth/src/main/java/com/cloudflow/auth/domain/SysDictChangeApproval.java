package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_dict_change_approval")
public class SysDictChangeApproval {

    @TableId(type = IdType.AUTO)
    private Long approvalId;

    private Long tenantId;

    private String approvalNo;

    private String dictType;

    private String changeScope;

    private String actionType;

    private String riskLevel;

    private String targetIds;

    private String targetSummary;

    private String payloadJson;

    private Long applicantId;

    private String applicantName;

    private Long deptId;

    private String deptName;

    private String status;

    private String instanceId;

    private String approvalComment;

    private String remark;

    @Version
    private Integer version;

    private String createBy;

    private LocalDateTime createTime;

    private String updateBy;

    private LocalDateTime updateTime;
}
