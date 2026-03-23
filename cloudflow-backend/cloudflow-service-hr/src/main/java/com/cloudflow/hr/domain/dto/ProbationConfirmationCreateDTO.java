package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

/**
 * 创建转正申请DTO
 * 
 * @author CloudFlow
 */
@Data
public class ProbationConfirmationCreateDTO {
    
    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;
    
    /**
     * 试用期开始日期
     */
    @NotNull(message = "试用期开始日期不能为空")
    private LocalDate probationStartDate;
    
    /**
     * 试用期结束日期
     */
    @NotNull(message = "试用期结束日期不能为空")
    private LocalDate probationEndDate;
    
    /**
     * 预计转正日期
     */
    @NotNull(message = "预计转正日期不能为空")
    private LocalDate expectedRegularDate;
    
    /**
     * 自我评价
     */
    private String selfEvaluation;
    
    /**
     * 主管评价
     */
    private String managerEvaluation;
}
