package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
@TableName("oa_budget_line")
public class OaBudgetLine implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long lineId;
    private Long tenantId;
    private Long budgetId;
    private Long subjectId;
    private String subjectCode;
    private String subjectName;
    private BigDecimal amount;
    private BigDecimal reservedAmount;
    private BigDecimal actualAmount;
    private BigDecimal availableAmount;
    private BigDecimal warningRatio;
    private BigDecimal alertRatio;
    private BigDecimal blockRatio;
    private Integer sortOrder;
    private String remark;
}
