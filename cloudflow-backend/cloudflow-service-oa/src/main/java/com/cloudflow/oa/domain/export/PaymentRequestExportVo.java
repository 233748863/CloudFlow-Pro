package com.cloudflow.oa.domain.export;

import cn.idev.excel.annotation.ExcelProperty;
import com.cloudflow.oa.domain.BizPaymentRequest;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 付款申请导出对象。
 */
@Data
public class PaymentRequestExportVo {

    @ExcelProperty("付款单号")
    private String paymentNo;

    @ExcelProperty("申请人")
    private String userName;

    @ExcelProperty("部门")
    private String deptName;

    @ExcelProperty("收款方")
    private String payeeName;

    @ExcelProperty("收款账号")
    private String payeeAccount;

    @ExcelProperty("开户行")
    private String payeeBank;

    @ExcelProperty("付款金额")
    private BigDecimal amount;

    @ExcelProperty("付款类型")
    private String paymentType;

    @ExcelProperty("期望付款日期")
    private String expectedDate;

    @ExcelProperty("状态")
    private String status;

    @ExcelProperty("创建时间")
    private String createTime;

    public static PaymentRequestExportVo from(BizPaymentRequest source) {
        PaymentRequestExportVo target = new PaymentRequestExportVo();
        target.setPaymentNo(source.getPaymentNo());
        target.setUserName(source.getUserName());
        target.setDeptName(source.getDeptName());
        target.setPayeeName(source.getPayeeName());
        target.setPayeeAccount(OaExcelExportHelper.maskBankCard(source.getPayeeAccount()));
        target.setPayeeBank(source.getPayeeBank());
        target.setAmount(source.getAmount());
        target.setPaymentType(OaExcelExportHelper.formatPaymentType(source.getPaymentType()));
        target.setExpectedDate(OaExcelExportHelper.formatDateTime(source.getExpectedDate()));
        target.setStatus(OaExcelExportHelper.formatStatus(source.getStatus()));
        target.setCreateTime(OaExcelExportHelper.formatDateTime(source.getCreateTime()));
        return target;
    }
}
