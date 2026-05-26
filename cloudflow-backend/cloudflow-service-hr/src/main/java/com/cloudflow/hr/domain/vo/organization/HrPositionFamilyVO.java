package com.cloudflow.hr.domain.vo.organization;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 职族 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrPositionFamilyVO", description = "HR 职族 VO")
public class HrPositionFamilyVO {
    @Schema(description = "职族 ID") private Long id;
    @Schema(description = "职族编码") private String familyCode;
    @Schema(description = "职族名称") private String familyName;
    @Schema(description = "描述") private String description;
    @Schema(description = "排序") private Integer sortOrder;
    @Schema(description = "状态") private Integer status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
