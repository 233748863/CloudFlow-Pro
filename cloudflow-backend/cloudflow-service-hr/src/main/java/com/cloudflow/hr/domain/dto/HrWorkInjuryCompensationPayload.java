package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("hr_work_injury_compensation")
public class HrWorkInjuryCompensationPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long injuryId;
    private String itemType;
    private BigDecimal amount;
    private String paymentStatus;
    private LocalDateTime paidAt;

    @EncryptField
    private String bankAccount;

    private String remark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}
