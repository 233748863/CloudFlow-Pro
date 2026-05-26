package com.cloudflow.hr.domain.vo.training;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR 考试题库 VO（剔除 deleted/tenantId；保留 options/answer JSON 列）。
 */
@Data
@Schema(name = "HrExamQuestionBankVO", description = "HR 考试题库 VO")
public class HrExamQuestionBankVO {
    @Schema(description = "题目 ID") private Long id;
    @Schema(description = "分类 ID") private Long categoryId;
    @Schema(description = "题型 SINGLE/MULTI/JUDGE/FILL/ESSAY") private String questionType;
    @Schema(description = "题干") private String content;
    @Schema(description = "选项列表") private List<Map<String, Object>> options;
    @Schema(description = "答案列表") private List<Object> answer;
    @Schema(description = "分值") private BigDecimal score;
    @Schema(description = "难度") private Integer difficulty;
    @Schema(description = "解析") private String analysis;
    @Schema(description = "状态") private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
}
