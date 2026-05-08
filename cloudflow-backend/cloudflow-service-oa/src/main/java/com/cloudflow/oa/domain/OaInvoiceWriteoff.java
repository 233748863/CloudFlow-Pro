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

@Data
@TableName("oa_invoice_writeoff")
public class OaInvoiceWriteoff implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long writeoffId;
    private Long tenantId;
    private Long invoiceId;
    private String businessType;
    private Long businessId;
    private String businessNo;
    private BigDecimal writeoffAmount;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate writeoffDate;
    private String remark;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
