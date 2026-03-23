package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;

/**
 * 员工合同更新DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class EmployeeContractUpdateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 合同类型：LABOR-劳动合同 SERVICE-劳务合同 INTERN-实习协议
     */
    private String contractType;

    /**
     * 合同编号
     */
    private String contractNo;

    /**
     * 签订日期
     */
    private LocalDate signDate;

    /**
     * 开始日期
     */
    private LocalDate startDate;

    /**
     * 结束日期
     */
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
     * 状态：DRAFT-草稿 ACTIVE-生效中 EXPIRED-已过期 TERMINATED-已终止
     */
    private String status;
}
