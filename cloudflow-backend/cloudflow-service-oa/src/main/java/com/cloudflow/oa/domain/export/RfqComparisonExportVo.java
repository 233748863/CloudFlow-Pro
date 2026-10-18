package com.cloudflow.oa.domain.export;

import cn.idev.excel.annotation.ExcelProperty;
import lombok.Data;
import java.math.BigDecimal;

@Data
public class RfqComparisonExportVo {
    @ExcelProperty("物料名称")
    private String itemName;

    @ExcelProperty("规格")
    private String spec;

    @ExcelProperty("单位")
    private String unit;

    @ExcelProperty("数量")
    private Integer quantity;

    @ExcelProperty("供应商")
    private String supplierName;

    @ExcelProperty("币种")
    private String currency;

    @ExcelProperty("未税单价")
    private BigDecimal unitPrice;

    @ExcelProperty("折扣比例")
    private BigDecimal discountRate;

    @ExcelProperty("税率")
    private BigDecimal taxRate;

    @ExcelProperty("折后未税金额")
    private BigDecimal lineAmount;

    @ExcelProperty("税额")
    private BigDecimal taxAmount;

    @ExcelProperty("含税行金额")
    private BigDecimal grossAmount;

    @ExcelProperty("交付天数")
    private Integer deliveryDays;

    @ExcelProperty("同币种最低单价")
    private String lowestPrice;

    @ExcelProperty("含税报价总额")
    private BigDecimal totalAmount;

    @ExcelProperty("同币种总价排名")
    private Integer rank;

    @ExcelProperty("供应商分档")
    private String standing;

    @ExcelProperty("供应商评分")
    private BigDecimal score;

    @ExcelProperty("付款条件")
    private String paymentTerms;
}
