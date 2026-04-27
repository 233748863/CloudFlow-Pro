package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class PerformanceCategoryDefinitionDTO {

    @NotBlank(message = "考核类型编码不能为空")
    private String categoryCode;

    @NotBlank(message = "考核类型名称不能为空")
    private String categoryName;
}
