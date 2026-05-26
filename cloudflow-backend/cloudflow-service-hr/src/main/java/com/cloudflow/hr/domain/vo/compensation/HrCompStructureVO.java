package com.cloudflow.hr.domain.vo.compensation;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 薪酬结构 VO（剔除 tenantId 内部字段）。
 */
@Data
@Schema(name = "HrCompStructureVO", description = "HR 薪酬结构 VO")
public class HrCompStructureVO {
    @Schema(description = "结构 ID") private Long id;
    @Schema(description = "结构编码") private String structureCode;
    @Schema(description = "结构名称") private String structureName;
    @Schema(description = "结构描述") private String description;
    @Schema(description = "状态") private Integer status;
    @Schema(description = "薪酬项配置 JSON") private JsonNode componentConfig;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
