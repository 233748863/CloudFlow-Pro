package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_point_transaction")
public class HrPointTransactionPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long accountId;
    private Long employeeId;
    private String txnNo;
    private String direction;
    private String sourceType;
    private Long sourceId;
    private Integer points;
    private Integer balanceAfter;
    private LocalDate effectiveDate;
    private LocalDate expireDate;
    private String remark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}
