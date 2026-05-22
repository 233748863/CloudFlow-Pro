package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_dispute_evidence")
public class HrDisputeEvidencePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long disputeId;
    private String evidenceType;
    private Long fileId;
    private Long uploadedBy;
    private LocalDateTime uploadedAt;
    private String remark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}
