package com.cloudflow.oa.domain.export;

import cn.idev.excel.annotation.ExcelProperty;
import com.cloudflow.oa.domain.BusinessTrip;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 出差申请导出对象。
 */
@Data
public class BusinessTripExportVo {

    @ExcelProperty("出差单号")
    private String tripNo;

    @ExcelProperty("申请人")
    private String userName;

    @ExcelProperty("部门")
    private String deptName;

    @ExcelProperty("出发地")
    private String departure;

    @ExcelProperty("目的地")
    private String destination;

    @ExcelProperty("开始日期")
    private String startDate;

    @ExcelProperty("结束日期")
    private String endDate;

    @ExcelProperty("出差天数")
    private BigDecimal tripDays;

    @ExcelProperty("交通方式")
    private String transportType;

    @ExcelProperty("预计费用")
    private BigDecimal estimatedCost;

    @ExcelProperty("项目名称")
    private String projectName;

    @ExcelProperty("状态")
    private String status;

    @ExcelProperty("创建时间")
    private String createTime;

    public static BusinessTripExportVo from(BusinessTrip source) {
        BusinessTripExportVo target = new BusinessTripExportVo();
        target.setTripNo(source.getTripNo());
        target.setUserName(source.getUserName());
        target.setDeptName(source.getDeptName());
        target.setDeparture(source.getDeparture());
        target.setDestination(source.getDestination());
        target.setStartDate(OaExcelExportHelper.formatDate(source.getStartDate()));
        target.setEndDate(OaExcelExportHelper.formatDate(source.getEndDate()));
        target.setTripDays(source.getTripDays());
        target.setTransportType(OaExcelExportHelper.formatTransportType(source.getTransportType()));
        target.setEstimatedCost(source.getEstimatedCost());
        target.setProjectName(source.getProjectName());
        target.setStatus(OaExcelExportHelper.formatStatus(source.getStatus()));
        target.setCreateTime(OaExcelExportHelper.formatDateTime(source.getCreateTime()));
        return target;
    }
}
