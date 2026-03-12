package com.cloudflow.oa.domain.export;

import cn.idev.excel.annotation.ExcelProperty;
import com.cloudflow.oa.domain.OvertimeRequest;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 加班申请导出对象。
 */
@Data
public class OvertimeRequestExportVo {

    @ExcelProperty("加班单号")
    private String overtimeNo;

    @ExcelProperty("申请人")
    private String userName;

    @ExcelProperty("部门")
    private String deptName;

    @ExcelProperty("加班类型")
    private String overtimeType;

    @ExcelProperty("开始时间")
    private String startTime;

    @ExcelProperty("结束时间")
    private String endTime;

    @ExcelProperty("加班时长(小时)")
    private BigDecimal overtimeHours;

    @ExcelProperty("补偿方式")
    private String compensateType;

    @ExcelProperty("是否用餐")
    private String needMeal;

    @ExcelProperty("加班地点")
    private String workLocation;

    @ExcelProperty("状态")
    private String status;

    @ExcelProperty("创建时间")
    private String createTime;

    public static OvertimeRequestExportVo from(OvertimeRequest source) {
        OvertimeRequestExportVo target = new OvertimeRequestExportVo();
        target.setOvertimeNo(source.getOvertimeNo());
        target.setUserName(source.getUserName());
        target.setDeptName(source.getDeptName());
        target.setOvertimeType(OaExcelExportHelper.formatOvertimeType(source.getOvertimeType()));
        target.setStartTime(OaExcelExportHelper.formatDateTime(source.getStartTime()));
        target.setEndTime(OaExcelExportHelper.formatDateTime(source.getEndTime()));
        target.setOvertimeHours(source.getOvertimeHours());
        target.setCompensateType(OaExcelExportHelper.formatCompensateType(source.getCompensateType()));
        target.setNeedMeal(OaExcelExportHelper.formatMealFlag(source.getNeedMeal()));
        target.setWorkLocation(source.getWorkLocation());
        target.setStatus(OaExcelExportHelper.formatStatus(source.getStatus()));
        target.setCreateTime(OaExcelExportHelper.formatDateTime(source.getCreateTime()));
        return target;
    }
}
