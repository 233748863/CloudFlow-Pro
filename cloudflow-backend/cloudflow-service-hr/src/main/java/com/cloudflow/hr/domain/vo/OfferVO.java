package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Offer VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class OfferVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * Offer编号
     */
    private String offerNo;
    
    /**
     * 候选人ID
     */
    private Long candidateId;
    
    /**
     * 候选人姓名
     */
    private String candidateName;
    
    /**
     * 部门ID
     */
    private Long deptId;
    
    /**
     * 部门名称
     */
    private String deptName;
    
    /**
     * 职位ID
     */
    private Long positionId;
    
    /**
     * 职位名称
     */
    private String positionName;
    
    /**
     * 薪资
     */
    private BigDecimal salary;
    
    /**
     * 期望入职日期
     */
    private LocalDate expectedDate;
    
    /**
     * Offer有效期
     */
    private LocalDate expiryDate;
    
    /**
     * Offer内容
     */
    private String offerContent;
    
    /**
     * 流程实例ID
     */
    private String processInstanceId;
    
    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 SENT-已发送 ACCEPTED-已接受 REJECTED-已拒绝 EXPIRED-已过期
     */
    private String status;
    
    /**
     * 状态描述
     */
    private String statusDesc;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
