package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 员工合同VO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class EmployeeContractVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 租户ID
     */
    private Long tenantId;

    /**
     * 员工ID
     */
    private Long employeeId;

    /**
     * 员工姓名
     */
    private String employeeName;

    /**
     * 员工工号
     */
    private String employeeNo;

    /**
     * 合同类型：LABOR-劳动合同 SERVICE-劳务合同 INTERN-实习协议
     */
    private String contractType;

    /**
     * 合同类型名称
     */
    private String contractTypeName;

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
    private List<String> attachmentUrls;

    /**
     * 状态：DRAFT-草稿 ACTIVE-生效中 EXPIRED-已过期 TERMINATED-已终止
     */
    private String status;

    /**
     * 状态名称
     */
    private String statusName;

    /**
     * 剩余天数（距离到期）
     */
    private Long remainingDays;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
