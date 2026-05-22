package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("hr_training_instructor")
public class HrTrainingInstructorPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String instructorName;
    private String instructorType;
    private Long employeeId;
    private String expertise;
    private String bio;
    private String contact;
    private BigDecimal hourlyRate;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}
