package com.cloudflow.hr.domain.vo.attendance;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 考勤异常申诉 VO（剔除 deleted/tenantId/instanceId 内部字段）。
 */
@Data
@Schema(name = "HrAttendanceAppealVO", description = "HR 考勤异常申诉 VO")
public class HrAttendanceAppealVO {
    @Schema(description = "申诉 ID") private Long id;
    @Schema(description = "申诉编号") private String appealNo;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "员工姓名") private String employeeName;
    @Schema(description = "部门 ID") private Long deptId;
    @Schema(description = "部门名称") private String deptName;
    @Schema(description = "考勤记录 ID") private Long attendanceRecordId;
    @Schema(description = "考勤日期") private LocalDate attendanceDate;
    @Schema(description = "异常类型") private String exceptionType;
    @Schema(description = "申诉原因") private String reason;
    @Schema(description = "证据 URL 列表") private JsonNode evidenceUrls;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime expectedCheckIn;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime expectedCheckOut;
    @Schema(description = "状态") private String status;
    @Schema(description = "主管 ID") private Long managerId;
    @Schema(description = "主管备注") private String managerRemark;
    @Schema(description = "HR 复核人 ID") private Long hrReviewerId;
    @Schema(description = "HR 复核备注") private String hrRemark;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime approvedCheckIn;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime approvedCheckOut;
    @Schema(description = "最终决定") private String finalDecision;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime decidedTime;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
