package com.cloudflow.oa.domain.export;

import cn.idev.excel.annotation.ExcelProperty;
import com.cloudflow.oa.domain.LeaveRequest;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 请假申请导出对象。
 */
@Data
public class LeaveRequestExportVo {

    @ExcelProperty("请假单号")
    private String leaveNo;

    @ExcelProperty("申请人")
    private String userName;

    @ExcelProperty("部门")
    private String deptName;

    @ExcelProperty("请假类型")
    private String leaveType;

    @ExcelProperty("开始时间")
    private String startTime;

    @ExcelProperty("结束时间")
    private String endTime;

    @ExcelProperty("请假天数")
    private BigDecimal leaveDays;

    @ExcelProperty("状态")
    private String status;

    @ExcelProperty("请假事由")
    private String reason;

    @ExcelProperty("创建时间")
    private String createTime;

    public static LeaveRequestExportVo from(LeaveRequest source) {
        LeaveRequestExportVo target = new LeaveRequestExportVo();
        target.setLeaveNo(source.getLeaveNo());
        target.setUserName(source.getUserName());
        target.setDeptName(source.getDeptName());
        target.setLeaveType(OaExcelExportHelper.formatLeaveType(source.getLeaveType()));
        target.setStartTime(OaExcelExportHelper.formatDateTime(source.getStartTime()));
        target.setEndTime(OaExcelExportHelper.formatDateTime(source.getEndTime()));
        target.setLeaveDays(source.getLeaveDays());
        target.setStatus(OaExcelExportHelper.formatStatus(source.getStatus()));
        target.setReason(source.getReason());
        target.setCreateTime(OaExcelExportHelper.formatDateTime(source.getCreateTime()));
        return target;
    }
}
