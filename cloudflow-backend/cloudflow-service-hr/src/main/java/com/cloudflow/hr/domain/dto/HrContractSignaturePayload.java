package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_contract_signature")
public class HrContractSignaturePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long contractId;
    private String signerType;
    private Long signerId;
    private String signMethod;
    private String signStatus;
    private LocalDateTime signTime;
    private String ipAddress;
    private Long signatureFileId;
    private String processInstanceId;
    private LocalDateTime expireTime;
    private String remark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}
