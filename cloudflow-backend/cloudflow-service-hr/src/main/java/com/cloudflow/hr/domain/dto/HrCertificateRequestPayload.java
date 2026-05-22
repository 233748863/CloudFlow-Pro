package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_certificate_request")
public class HrCertificateRequestPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String requestNo;
    private Long employeeId;
    private String certificateType;
    private String purpose;
    private String language;
    private String recipientOrg;
    private Integer copies;
    private String status;
    private String processInstanceId;
    private LocalDateTime issuedAt;
    private Long pdfFileId;
    private String remark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}
