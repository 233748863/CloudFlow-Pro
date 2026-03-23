package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;

/**
 * 员工合同创建DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class EmployeeContractCreateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;

    /**
     * 合同类型：LABOR-劳动合同 SERVICE-劳务合同 INTERN-实习协议
     */
    @NotBlank(message = "合同类型不能为空")
    private String contractType;

    /**
     * 合同编号
     */
    @NotBlank(message = "合同编号不能为空")
    private String contractNo;

    /**
     * 签订日期
     */
    @NotNull(message = "签订日期不能为空")
    private LocalDate signDate;

    /**
     * 开始日期
     */
    @NotNull(message = "开始日期不能为空")
    private LocalDate startDate;

    /**
     * 结束日期
     */
    @NotNull(message = "结束日期不能为空")
    private LocalDate endDate;

    /**
     * 合同期限（月）
     */
    private Integer duration;

    /**
     * 合同文件URL
     */
    private String fileUrl;

    /**
     * 状态：DRAFT-草稿 ACTIVE-生效中
     */
    private String status;
}
