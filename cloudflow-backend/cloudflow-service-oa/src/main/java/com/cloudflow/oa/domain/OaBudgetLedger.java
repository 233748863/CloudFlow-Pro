package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("oa_budget_ledger")
public class OaBudgetLedger implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long ledgerId;
    private Long tenantId;
    private Long budgetId;
    private Long lineId;
    private String targetType;
    private Long targetId;
    private String businessType;
    private Long businessId;
    private String businessNo;
    private String subjectCode;
    private String subjectName;
    private String operationType;
    private BigDecimal amount;
    private BigDecimal availableAfter;
    private String status;
    private String remark;
    private String createBy;
    @Version
    private Integer version;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
