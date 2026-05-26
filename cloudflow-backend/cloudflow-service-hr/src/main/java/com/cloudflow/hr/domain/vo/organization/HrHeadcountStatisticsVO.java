package com.cloudflow.hr.domain.vo.organization;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 编制统计 VO（在 HrHeadcountVO 基础上追加 utilizationRate）。
 */
@Data
@Schema(name = "HrHeadcountStatisticsVO", description = "HR 编制统计 VO")
public class HrHeadcountStatisticsVO {
    @Schema(description = "编制 ID") private Long id;
    @Schema(description = "目标类型") private String targetType;
    @Schema(description = "目标 ID") private Long targetId;
    @Schema(description = "目标名称") private String targetName;
    @Schema(description = "核定编制人数") private Integer approvedCount;
    @Schema(description = "实配人数") private Integer actualCount;
    @Schema(description = "缺编人数") private Integer vacancyCount;
    @Schema(description = "编制使用率(%)") private Double utilizationRate;
    @Schema(description = "生效日期") private LocalDate effectiveDate;
    @Schema(description = "失效日期") private LocalDate expiryDate;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
