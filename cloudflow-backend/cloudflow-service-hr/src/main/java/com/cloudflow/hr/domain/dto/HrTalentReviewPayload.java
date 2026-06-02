package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_talent_review")
public class HrTalentReviewPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String reviewNo;
    private String reviewName;
    private Integer reviewYear;
    private String cycleType;
    private String scopeType;
    private String scopeValue;
    private Long performanceSourceObjectiveId;
    private Long ownerId;
    private LocalDate deadline;
    private String status;
    private String processInstanceId;
    private LocalDateTime publishTime;
    private String description;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
