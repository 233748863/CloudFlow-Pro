package com.cloudflow.hr.domain.vo.lifecycle;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 生命周期任务 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrLifecycleTaskVO", description = "HR 生命周期任务 VO")
public class HrLifecycleTaskVO {
    @Schema(description = "任务 ID") private Long id;
    @Schema(description = "申请 ID") private Long applicationId;
    @Schema(description = "任务名称") private String taskName;
    @Schema(description = "任务类型") private String taskType;
    @Schema(description = "负责人 ID") private Long ownerId;
    @Schema(description = "到期日期") private LocalDate dueDate;
    @Schema(description = "状态") private String status;
    @Schema(description = "备注") private String remark;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime completedTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
