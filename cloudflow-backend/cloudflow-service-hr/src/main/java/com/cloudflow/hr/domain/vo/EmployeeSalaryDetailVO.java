package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 员工薪资详情视图对象（包含薪资项目明细）
 */
@Data
public class EmployeeSalaryDetailVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 员工工号
     */
    private String employeeNo;
    
    /**
     * 员工姓名
     */
    private String employeeName;
    
    /**
     * 薪资结构ID
     */
    private Long structureId;
    
    /**
     * 薪资结构编码
     */
    private String structureCode;
    
    /**
     * 薪资结构名称
     */
    private String structureName;
    
    /**
     * 薪资项目明细列表
     */
    private List<SalaryItemDetail> items;
    
    /**
     * 总薪资
     */
    private BigDecimal totalSalary;
    
    /**
     * 生效日期
     */
    private LocalDate effectiveDate;
    
    /**
     * 状态：DRAFT-草稿 ACTIVE-生效中 EXPIRED-已过期
     */
    private String status;
    
    /**
     * 状态描述
     */
    private String statusDesc;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
    
    /**
     * 薪资项目明细
     */
    @Data
    public static class SalaryItemDetail {
        /**
         * 薪资项目ID
         */
        private Long itemId;
        
        /**
         * 项目编码
         */
        private String itemCode;
        
        /**
         * 项目名称
         */
        private String itemName;
        
        /**
         * 项目类型：FIXED-固定项 VARIABLE-浮动项
         */
        private String itemType;
        
        /**
         * 分类：BASIC-基本工资 ALLOWANCE-津贴 BONUS-奖金 DEDUCTION-扣款 INSURANCE-社保 TAX-个税
         */
        private String category;
        
        /**
         * 金额
         */
        private BigDecimal amount;
    }
}
