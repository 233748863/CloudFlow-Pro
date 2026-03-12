package com.cloudflow.oa.domain.export;

import cn.idev.excel.annotation.ExcelProperty;
import com.cloudflow.oa.domain.BizExpenseClaim;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 报销申请导出对象。
 */
@Data
public class ExpenseClaimExportVo {

    @ExcelProperty("报销单号")
    private String claimNo;

    @ExcelProperty("申请人")
    private String userName;

    @ExcelProperty("部门")
    private String deptName;

    @ExcelProperty("报销类别")
    private String category;

    @ExcelProperty("总金额")
    private BigDecimal totalAmount;

    @ExcelProperty("状态")
    private String status;

    @ExcelProperty("报销说明")
    private String description;

    @ExcelProperty("创建时间")
    private String createTime;

    public static ExpenseClaimExportVo from(BizExpenseClaim source) {
        ExpenseClaimExportVo target = new ExpenseClaimExportVo();
        target.setClaimNo(source.getClaimNo());
        target.setUserName(source.getUserName());
        target.setDeptName(source.getDeptName());
        target.setCategory(OaExcelExportHelper.formatExpenseCategory(source.getCategory()));
        target.setTotalAmount(source.getTotalAmount());
        target.setStatus(OaExcelExportHelper.formatStatus(source.getStatus()));
        target.setDescription(source.getDescription());
        target.setCreateTime(OaExcelExportHelper.formatDateTime(source.getCreateTime()));
        return target;
    }
}
