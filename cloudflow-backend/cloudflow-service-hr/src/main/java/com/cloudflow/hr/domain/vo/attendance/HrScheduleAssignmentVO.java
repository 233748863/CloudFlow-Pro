package com.cloudflow.hr.domain.vo.attendance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 排班 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrScheduleAssignmentVO", description = "HR 排班 VO")
public class HrScheduleAssignmentVO {
    @Schema(description = "排班 ID") private Long id;
    @Schema(description = "目标类型") private String targetType;
    @Schema(description = "目标 ID") private Long targetId;
    @Schema(description = "目标名称") private String targetName;
    @Schema(description = "规则 ID") private Long ruleId;
    @Schema(description = "班次 ID") private Long shiftId;
    @Schema(description = "排班日期") private LocalDate scheduleDate;
    @Schema(description = "生效开始日期") private LocalDate effectiveStart;
    @Schema(description = "生效结束日期") private LocalDate effectiveEnd;
    @Schema(description = "状态") private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
