package com.cloudflow.hr.domain.vo.training;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * HR 培训讲师 VO（剔除 deleted/tenantId；contact 按权限掩码）。
 */
@Data
@Schema(name = "HrTrainingInstructorVO", description = "HR 培训讲师 VO")
public class HrTrainingInstructorVO {
    @Schema(description = "讲师 ID") private Long id;
    @Schema(description = "讲师姓名") private String instructorName;
    @Schema(description = "讲师类型") private String instructorType;
    @Schema(description = "关联员工 ID") private Long employeeId;
    @Schema(description = "擅长领域") private String expertise;
    @Schema(description = "简介") private String bio;
    @Schema(description = "联系方式（按权限掩码）") private String contact;
    @Schema(description = "课时费") private BigDecimal hourlyRate;
    @Schema(description = "状态") private String status;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
