package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * OA-P1-1 合同付款计划。
 */
@Data
@TableName("oa_contract_payment_schedule")
public class OaContractPaymentSchedule implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long contractId;
    private Long milestoneId;
    private Integer paymentNo;
    private String paymentName;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate planDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate actualDate;

    private BigDecimal amount;
    private BigDecimal actualAmount;
    private String currency;
    private Long payeeId;
    private String payeeName;
    /** PENDING / PAID / OVERDUE / CANCELLED */
    private String status;
    private Long invoiceId;
    private String remark;
    private Integer deleted;
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
