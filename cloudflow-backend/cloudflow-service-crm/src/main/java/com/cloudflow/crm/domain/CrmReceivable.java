package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("crm_receivable")
public class CrmReceivable implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long receivableId;
    private Long tenantId;
    private Long customerId;
    private String customerName;
    private Long contractId;
    private String contractNo;
    private String receivableNo;
    private String receivableName;
    private BigDecimal plannedAmount;
    private BigDecimal receivedAmount;
    private BigDecimal outstandingAmount;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate dueDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate receivedDate;
    private String invoiceStatus;
    private Long invoiceId;
    private Long ownerId;
    private String ownerName;
    private String remark;
    private String status;
    private Integer deleted;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
