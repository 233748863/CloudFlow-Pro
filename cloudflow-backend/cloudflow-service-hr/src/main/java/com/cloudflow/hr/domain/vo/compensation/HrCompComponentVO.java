package com.cloudflow.hr.domain.vo.compensation;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 薪酬项 VO（剔除 deleted/tenantId 内部字段）。
 */
@Data
@Schema(name = "HrCompComponentVO", description = "HR 薪酬项 VO")
public class HrCompComponentVO {
    @Schema(description = "薪酬项 ID") private Long id;
    @Schema(description = "薪酬项编码") private String componentCode;
    @Schema(description = "薪酬项名称") private String componentName;
    @Schema(description = "薪酬项类型") private String componentType;
    @Schema(description = "分类") private String category;
    @Schema(description = "是否计税 0/1") private Integer taxable;
    @Schema(description = "排序") private Integer sortOrder;
    @Schema(description = "状态") private Integer status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
