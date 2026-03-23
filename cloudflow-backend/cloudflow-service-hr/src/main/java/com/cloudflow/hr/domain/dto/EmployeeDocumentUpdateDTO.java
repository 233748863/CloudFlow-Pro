package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;

/**
 * 员工证件更新DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class EmployeeDocumentUpdateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 证件类型：ID_CARD-身份证 PASSPORT-护照 DIPLOMA-学历证书 DEGREE-学位证书
     */
    private String documentType;

    /**
     * 证件号码
     */
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
