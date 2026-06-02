package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_talent_pool_member")
public class HrTalentPoolMemberPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long poolId;
    private Long employeeId;
    private LocalDateTime joinedAt;
    private Long joinedReviewId;
    private LocalDateTime exitAt;
    private String exitReason;
    private String status;
    private String remark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
