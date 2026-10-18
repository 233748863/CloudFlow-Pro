package com.cloudflow.hr.domain.vo.attendance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * HR 班次 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrShiftVO", description = "HR 班次 VO")
public class HrShiftVO {
    @Schema(description = "班次 ID") private Long id;
    @Schema(description = "班次编码") private String shiftCode;
    @Schema(description = "班次名称") private String shiftName;
    @Schema(description = "开始时间") private LocalTime startTime;
    @Schema(description = "结束时间") private LocalTime endTime;
    @Schema(description = "休息分钟数") private Integer breakMinutes;
    @Schema(description = "工时分钟数") private Integer workMinutes;
    @Schema(description = "班前打卡窗口") private Integer checkinWindowBeforeMinutes;
    @Schema(description = "班后打卡窗口") private Integer checkoutWindowAfterMinutes;
    @Schema(description = "迟到宽容分钟") private Integer lateGraceMinutes;
    @Schema(description = "早退宽容分钟") private Integer earlyExitGraceMinutes;
    @Schema(description = "半天工时阈值") private BigDecimal halfDayHoursThreshold;
    @Schema(description = "缺勤工时阈值") private BigDecimal absentHoursThreshold;
    @Schema(description = "工时计算方式") private String workingHoursCalcMode;
    @Schema(description = "进出打卡判定方式") private String checkinDetermineMode;
    @Schema(description = "节假日日历ID") private Long holidayCalendarId;
    @Schema(description = "是否自动考勤") private Integer autoAttendanceFlag;
    @Schema(description = "自动处理起始日期") private LocalDate processAttendanceAfter;
    @Schema(description = "节假日是否判勤") private Integer markOnHolidayFlag;
    @Schema(description = "加班阈值分钟") private Integer overtimeThresholdMinutes;
    @Schema(description = "标识色") private String color;
    @Schema(description = "状态") private Integer status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
