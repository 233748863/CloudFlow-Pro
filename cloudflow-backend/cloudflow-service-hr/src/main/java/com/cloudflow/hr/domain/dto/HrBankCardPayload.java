package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_bank_card")
public class HrBankCardPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private String bankName;
    private String bankBranch;

    @EncryptField
    private String accountNo;

    private String accountHolder;
    private Boolean isPrimary;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
