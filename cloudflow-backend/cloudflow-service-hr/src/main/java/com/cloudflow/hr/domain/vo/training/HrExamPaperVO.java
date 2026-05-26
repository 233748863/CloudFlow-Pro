package com.cloudflow.hr.domain.vo.training;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR 考试试卷 VO（剔除 deleted/tenantId；保留 questionIds/config JSON 列）。
 */
@Data
@Schema(name = "HrExamPaperVO", description = "HR 考试试卷 VO")
public class HrExamPaperVO {
    @Schema(description = "试卷 ID") private Long id;
    @Schema(description = "课程 ID") private Long courseId;
    @Schema(description = "试卷名称") private String paperName;
    @Schema(description = "总分") private BigDecimal totalScore;
    @Schema(description = "及格分") private BigDecimal passScore;
    @Schema(description = "时长（分钟）") private Integer durationMinutes;
    @Schema(description = "题目数") private Integer questionCount;
    @Schema(description = "题目 ID 列表") private List<Long> questionIds;
    @Schema(description = "出题模式 FIXED/RANDOM") private String generateMode;
    @Schema(description = "出题配置") private Map<String, Object> config;
    @Schema(description = "状态") private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
}
