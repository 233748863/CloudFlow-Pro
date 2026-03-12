package com.cloudflow.oa.domain.export;

import cn.idev.excel.annotation.ExcelProperty;
import com.cloudflow.oa.domain.AttendanceAppeal;
import lombok.Data;

/**
 * 补卡/外勤申请导出对象。
 */
@Data
public class AttendanceAppealExportVo {

    @ExcelProperty("申请单号")
    private String appealNo;

    @ExcelProperty("申请人")
    private String userName;

    @ExcelProperty("部门")
    private String deptName;

    @ExcelProperty("申请类型")
    private String appealType;

    @ExcelProperty("申请日期")
    private String appealDate;

    @ExcelProperty("补卡时间")
    private String appealTime;

    @ExcelProperty("打卡类型")
    private String checkType;

    @ExcelProperty("原始状态")
    private String originalStatus;

    @ExcelProperty("证明人")
    private String witnessName;

    @ExcelProperty("状态")
    private String status;

    @ExcelProperty("创建时间")
    private String createTime;

    public static AttendanceAppealExportVo from(AttendanceAppeal source) {
        AttendanceAppealExportVo target = new AttendanceAppealExportVo();
        target.setAppealNo(source.getAppealNo());
        target.setUserName(source.getUserName());
        target.setDeptName(source.getDeptName());
        target.setAppealType(OaExcelExportHelper.formatAppealType(source.getAppealType()));
        target.setAppealDate(OaExcelExportHelper.formatDate(source.getAppealDate()));
        target.setAppealTime(source.getAppealTime());
        target.setCheckType(OaExcelExportHelper.formatCheckType(source.getCheckType()));
        target.setOriginalStatus(OaExcelExportHelper.formatOriginalStatus(source.getOriginalStatus()));
        target.setWitnessName(source.getWitnessName());
        target.setStatus(OaExcelExportHelper.formatStatus(source.getStatus()));
        target.setCreateTime(OaExcelExportHelper.formatDateTime(source.getCreateTime()));
        return target;
    }
}
