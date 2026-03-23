package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * 面试评价DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class InterviewEvaluationDTO {

    /**
     * 面试评价
     */
    @NotNull(message = "面试评价不能为空")
    private String evaluation;

    /**
     * 面试评分（0-100）
     */
    @NotNull(message = "面试评分不能为空")
    @Min(value = 0, message = "面试评分不能小于0")
    @Max(value = 100, message = "面试评分不能大于100")
    private Integer score;

    /**
     * 面试结果：PASS-通过 FAIL-不通过 PENDING-待定
     */
    @NotNull(message = "面试结果不能为空")
    private String result;
}
