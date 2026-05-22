package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_training_certificate")
public class HrTrainingCertificatePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String certNo;
    private Long employeeId;
    private Long courseId;
    private Long sessionId;
    private Long templateId;
    private LocalDate issueDate;
    private LocalDate expireDate;
    private Long pdfFileId;
    private String status;
    private String revokedReason;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}
