package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("hr_training_enrollment")
public class HrTrainingEnrollmentPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long sessionId;
    private Long employeeId;
    private String enrollType;
    private String status;
    private String processInstanceId;
    private Boolean attended;
    private LocalDateTime checkInTime;
    private String completionStatus;
    private BigDecimal score;
    private String comment;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
