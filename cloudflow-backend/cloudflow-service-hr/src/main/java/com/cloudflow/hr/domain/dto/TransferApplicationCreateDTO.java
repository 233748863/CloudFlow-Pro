package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

/**
 * 创建调岗申请DTO
 * 
 * @author CloudFlow
 */
@Data
public class TransferApplicationCreateDTO {
    
    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;
    
    /**
     * 目标部门ID
     */
    @NotNull(message = "目标部门ID不能为空")
    private Long toDeptId;
    
    /**
     * 目标岗位ID
     */
    @NotNull(message = "目标岗位ID不能为空")
    private Long toPostId;
    
    /**
     * 目标职位ID
     */
    private Long toPositionId;
    
    /**
     * 调岗类型：DEPT-部门调动 POST-岗位调整 PROMOTION-晋升 DEMOTION-降级
     */
    @NotNull(message = "调岗类型不能为空")
    private String transferType;
    
    /**
     * 调岗原因
     */
    private String reason;
    
    /**
     * 生效日期
     */
    @NotNull(message = "生效日期不能为空")
    private LocalDate effectiveDate;
    
    /**
     * 是否涉及薪资变更
     */
    private Boolean salaryChange;
}
