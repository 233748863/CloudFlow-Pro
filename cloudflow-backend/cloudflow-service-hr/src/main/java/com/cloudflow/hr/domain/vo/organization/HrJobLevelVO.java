package com.cloudflow.hr.domain.vo.organization;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 职级 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrJobLevelVO", description = "HR 职级 VO")
public class HrJobLevelVO {
    @Schema(description = "职级 ID") private Long id;
    @Schema(description = "职级编码") private String levelCode;
    @Schema(description = "职级名称") private String levelName;
    @Schema(description = "序列") private String levelSeries;
    @Schema(description = "排序") private Integer levelRank;
    @Schema(description = "描述") private String description;
    @Schema(description = "状态") private Integer status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
