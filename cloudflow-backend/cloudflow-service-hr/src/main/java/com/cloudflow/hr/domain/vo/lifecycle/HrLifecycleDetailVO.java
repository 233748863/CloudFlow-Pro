package com.cloudflow.hr.domain.vo.lifecycle;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 生命周期明细 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrLifecycleDetailVO", description = "HR 生命周期明细 VO")
public class HrLifecycleDetailVO {
    @Schema(description = "明细 ID") private Long id;
    @Schema(description = "申请 ID") private Long applicationId;
    @Schema(description = "明细类型") private String detailType;
    @Schema(description = "明细 JSON") private JsonNode detailJson;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
