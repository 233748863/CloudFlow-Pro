package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;

/**
 * 员工证件创建DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class EmployeeDocumentCreateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;

    /**
     * 证件类型：ID_CARD-身份证 PASSPORT-护照 DIPLOMA-学历证书 DEGREE-学位证书
     */
    @NotBlank(message = "证件类型不能为空")
    private String documentType;

    /**
     * 证件号码
     */
    @NotBlank(message = "证件号码不能为空")
    private String documentNo;

    /**
     * 签发日期
     */
    private LocalDate issueDate;

    /**
     * 有效期至
     */
    private LocalDate expiryDate;

    /**
     * 证件扫描件URL
     */
    private String fileUrl;
}
