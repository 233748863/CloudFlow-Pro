package com.cloudflow.hr.domain.vo.training;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * HR 培训课程 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrTrainingCourseVO", description = "HR 培训课程 VO")
public class HrTrainingCourseVO {
    @Schema(description = "课程 ID") private Long id;
    @Schema(description = "课程编号") private String courseCode;
    @Schema(description = "课程名称") private String courseName;
    @Schema(description = "课程分类 ID") private Long categoryId;
    @Schema(description = "讲师 ID") private Long instructorId;
    @Schema(description = "授课模式") private String mode;
    @Schema(description = "时长（小时）") private BigDecimal durationHours;
    @Schema(description = "学分") private BigDecimal creditHours;
    @Schema(description = "封面 URL") private String coverUrl;
    @Schema(description = "课件附件 ID 列表") private List<Long> materials;
    @Schema(description = "描述") private String description;
    @Schema(description = "状态") private String status;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
