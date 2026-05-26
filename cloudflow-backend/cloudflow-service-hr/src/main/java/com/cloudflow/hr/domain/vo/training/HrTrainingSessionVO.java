package com.cloudflow.hr.domain.vo.training;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 培训班次 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrTrainingSessionVO", description = "HR 培训班次 VO")
public class HrTrainingSessionVO {
    @Schema(description = "班次 ID") private Long id;
    @Schema(description = "计划 ID") private Long planId;
    @Schema(description = "课程 ID") private Long courseId;
    @Schema(description = "班次编号") private String sessionNo;
    @Schema(description = "上课地点") private String location;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime startTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime endTime;
    @Schema(description = "容量") private Integer capacity;
    @Schema(description = "已报名人数") private Integer enrolledCount;
    @Schema(description = "讲师 ID") private Long instructorId;
    @Schema(description = "状态") private String status;
    @Schema(description = "备注") private String remark;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
