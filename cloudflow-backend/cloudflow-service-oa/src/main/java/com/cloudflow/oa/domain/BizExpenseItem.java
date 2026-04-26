package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 报销明细实体类
 */
@Data
@TableName("biz_expense_item")
public class BizExpenseItem implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 主键ID */
    @TableId(type = IdType.AUTO)
    private Long id;

    /** 报销申请ID */
    private Long claimId;

    /** 费用类型(MEAL餐费/HOTEL住宿/TRANSPORT交通/OFFICE办公用品/COMM通讯/OTHER其他) */
    private String expenseType;

    /** 金额 */
    private BigDecimal amount;

    /** 费用发生日期（格式：yyyy-MM-dd，例如 2026-03-11） */
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate expenseDate;

    /** 费用说明 */
    private String description;

    /** 凭证附件URL（多个用逗号分隔） */
    private String receiptUrl;

    /** 关联车辆费用ID */
    private Long vehicleExpenseId;
}
