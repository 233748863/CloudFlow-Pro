package com.cloudflow.hr.domain.vo.attendance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * HR 月度考勤汇总 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrAttendanceMonthlyVO", description = "HR 月度考勤汇总 VO")
public class HrAttendanceMonthlyVO {
    @Schema(description = "汇总 ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "年份") private Integer year;
    @Schema(description = "月份") private Integer month;
    @Schema(description = "应出勤天数") private BigDecimal workDays;
    @Schema(description = "实际出勤天数") private BigDecimal actualDays;
    @Schema(description = "迟到次数") private Integer lateTimes;
    @Schema(description = "早退次数") private Integer earlyTimes;
    @Schema(description = "旷工天数") private BigDecimal absentDays;
    @Schema(description = "请假天数") private BigDecimal leaveDays;
    @Schema(description = "加班小时数") private BigDecimal overtimeHours;
    @Schema(description = "出勤率") private BigDecimal attendanceRate;
    @Schema(description = "状态") private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
