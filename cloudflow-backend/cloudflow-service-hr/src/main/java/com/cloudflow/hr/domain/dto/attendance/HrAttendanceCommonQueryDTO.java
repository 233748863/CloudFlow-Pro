package com.cloudflow.hr.domain.dto.attendance;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;

/**
 * 考勤域共用查询入参（班次/规则/排班/记录/月汇总/假期类型/假期额度/时间申请列表使用）。
 *
 * <p>考勤过滤维度统一收敛：关键字、状态、员工、日期区间。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrAttendanceCommonQueryDTO", description = "考勤域共用分页查询入参")
public class HrAttendanceCommonQueryDTO extends PageQuery {

    @Schema(description = "关键字 模糊匹配")
    private String keyword;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "部门 ID")
    private Long deptId;

    @Schema(description = "班次 ID")
    private Long shiftId;

    @Schema(description = "考勤规则 ID")
    private Long ruleId;

    @Schema(description = "假期类型 ID")
    private Long leaveTypeId;

    @Schema(description = "时间申请类型 LEAVE/OVERTIME/MAKEUP/BUSINESS")
    private String requestType;

    @Schema(description = "起始日期")
    private LocalDate startDate;

    @Schema(description = "结束日期")
    private LocalDate endDate;

    @Schema(description = "月份 YYYY-MM")
    private String yearMonth;
}
