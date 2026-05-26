package com.cloudflow.hr.domain.vo.training;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR 考试作答 VO（剔除 tenantId；保留 answers JSON 列）。
 */
@Data
@Schema(name = "HrExamAttemptVO", description = "HR 考试作答 VO")
public class HrExamAttemptVO {
    @Schema(description = "作答 ID") private Long id;
    @Schema(description = "试卷 ID") private Long paperId;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "班次 ID") private Long sessionId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime startTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime submitTime;
    @Schema(description = "成绩") private BigDecimal score;
    @Schema(description = "是否通过") private Boolean passFlag;
    @Schema(description = "答案与得分明细") private List<Map<String, Object>> answers;
    @Schema(description = "状态 IN_PROGRESS/SUBMITTED/GRADED") private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
