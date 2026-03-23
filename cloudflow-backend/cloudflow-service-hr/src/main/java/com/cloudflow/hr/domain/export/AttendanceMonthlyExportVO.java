package com.cloudflow.hr.domain.export;

import cn.idev.excel.annotation.ExcelProperty;
import com.cloudflow.hr.domain.vo.AttendanceMonthlyVO;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 考勤月报导出对象
 */
@Data
public class AttendanceMonthlyExportVO {

    @ExcelProperty("统计月份")
    private String yearMonth;

    @ExcelProperty("员工工号")
    private String employeeNo;

    @ExcelProperty("员工姓名")
    private String employeeName;

    @ExcelProperty("部门")
    private String deptName;

    @ExcelProperty("应出勤天数")
    private Integer workDays;

    @ExcelProperty("实际出勤天数")
    private Integer actualDays;

    @ExcelProperty("旷工天数")
    private Integer absentDays;

    @ExcelProperty("缺卡次数")
    private Integer missingTimes;

    @ExcelProperty("迟到次数")
    private Integer lateTimes;

    @ExcelProperty("早退次数")
    private Integer earlyTimes;

    @ExcelProperty("请假天数")
    private BigDecimal leaveDays;

    @ExcelProperty("加班时长(小时)")
    private BigDecimal overtimeHours;

    @ExcelProperty("出勤率(%)")
    private BigDecimal attendanceRate;

    @ExcelProperty("状态")
    private String statusName;

    public static AttendanceMonthlyExportVO from(AttendanceMonthlyVO source) {
        AttendanceMonthlyExportVO target = new AttendanceMonthlyExportVO();
        target.setYearMonth(String.format("%d-%02d", source.getYear(), source.getMonth()));
        target.setEmployeeNo(source.getEmployeeNo());
        target.setEmployeeName(source.getEmployeeName());
        target.setDeptName(source.getDeptName());
        target.setWorkDays(source.getWorkDays());
        target.setActualDays(source.getActualDays());
        target.setAbsentDays(source.getAbsentDays());
        target.setMissingTimes(source.getMissingTimes());
        target.setLateTimes(source.getLateTimes());
        target.setEarlyTimes(source.getEarlyTimes());
        target.setLeaveDays(source.getLeaveDays());
        target.setOvertimeHours(source.getOvertimeHours());
        target.setAttendanceRate(source.getAttendanceRate());
        target.setStatusName(source.getStatusName());
        return target;
    }
}
