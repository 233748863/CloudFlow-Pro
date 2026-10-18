package com.cloudflow.hr.domain.vo.attendance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 考勤打卡记录 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrAttendanceRecordVO", description = "HR 考勤打卡记录 VO")
public class HrAttendanceRecordVO {
    @Schema(description = "记录 ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "考勤日期") private LocalDate attendanceDate;
    @Schema(description = "班次 ID") private Long shiftId;
    @Schema(description = "实际工时") private Integer workMinutes;
    @Schema(description = "应出勤工时") private Integer expectedMinutes;
    @Schema(description = "迟到分钟") private Integer lateMinutes;
    @Schema(description = "早退分钟") private Integer earlyExitMinutes;
    @Schema(description = "加班分钟") private Integer overtimeMinutes;
    @Schema(description = "已正式批准的核定加班分钟，按考勤归属日聚合") private Integer approvedOvertimeMinutes;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime firstCheckinTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime lastCheckoutTime;
    @Schema(description = "打卡次数") private Integer checkinCount;
    @Schema(description = "是否半天") private Integer halfDayFlag;
    @Schema(description = "是否缺勤") private Integer absentFlag;
    @Schema(description = "日期类型") private String dateType;
    @Schema(description = "状态") private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime recalcTime;
    @Schema(description = "是否人工调整") private Integer manualAdjustedFlag;
    @Schema(description = "申诉ID") private Long appealId;
    @Schema(description = "备注") private String remark;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
