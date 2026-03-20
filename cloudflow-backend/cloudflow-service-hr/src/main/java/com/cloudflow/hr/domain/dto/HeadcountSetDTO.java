package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Min;
import java.time.LocalDate;

/**
 * 设置编制DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class HeadcountSetDTO {

    /**
     * 目标类型：DEPT-部门 POST-岗位
     */
    @NotBlank(message = "目标类型不能为空")
    private String targetType;

    /**
     * 目标ID（dept_id或post_id）
     */
    @NotNull(message = "目标ID不能为空")
    private Long targetId;

    /**
     * 核定编制数
     */
    @NotNull(message = "核定编制数不能为空")
    @Min(value = 0, message = "核定编制数不能小于0")
    private Integer approvedCount;

    /**
     * 生效日期
     */
    private LocalDate effectiveDate;

    /**
     * 失效日期
     */
    private LocalDate expiryDate;
}
