package com.cloudflow.hr.domain.vo.organization;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 岗位 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrPositionVO", description = "HR 岗位 VO")
public class HrPositionVO {
    @Schema(description = "岗位 ID") private Long id;
    @Schema(description = "岗位编码") private String positionCode;
    @Schema(description = "岗位名称") private String positionName;
    @Schema(description = "职族 ID") private Long familyId;
    @Schema(description = "职级 ID") private Long levelId;
    @Schema(description = "岗位类别 ID") private Long postId;
    @Schema(description = "岗位描述") private String jobDescription;
    @Schema(description = "任职要求") private String requirements;
    @Schema(description = "状态") private Integer status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
