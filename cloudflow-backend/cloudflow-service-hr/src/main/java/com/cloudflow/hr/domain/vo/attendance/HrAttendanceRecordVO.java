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
    @Schema(description = "打卡类型") private String checkType;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime checkTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime expectedTime;
    @Schema(description = "偏差分钟数") private Integer deviationMinutes;
    @Schema(description = "打卡方式") private String checkMethod;
    @Schema(description = "打卡位置") private String location;
    @Schema(description = "状态") private String status;
    @Schema(description = "备注") private String remark;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
