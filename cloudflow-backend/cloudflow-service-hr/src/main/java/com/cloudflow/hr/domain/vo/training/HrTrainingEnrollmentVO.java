package com.cloudflow.hr.domain.vo.training;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * HR 培训报名 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrTrainingEnrollmentVO", description = "HR 培训报名 VO")
public class HrTrainingEnrollmentVO {
    @Schema(description = "报名 ID") private Long id;
    @Schema(description = "班次 ID") private Long sessionId;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "报名类型") private String enrollType;
    @Schema(description = "状态") private String status;
    @Schema(description = "审批流程实例 ID") private String processInstanceId;
    @Schema(description = "是否签到") private Boolean attended;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime checkInTime;
    @Schema(description = "结业状态") private String completionStatus;
    @Schema(description = "成绩") private BigDecimal score;
    @Schema(description = "备注") private String comment;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
}
