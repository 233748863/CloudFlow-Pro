package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Offer实体类
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_offer")
public class Offer {
    
    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;
    
    /**
     * 租户ID
     */
    private Long tenantId;
    
    /**
     * Offer编号
     */
    private String offerNo;
    
    /**
     * 候选人ID
     */
    private Long candidateId;
    
    /**
     * 部门ID
     */
    private Long deptId;
    
    /**
     * 职位ID
     */
    private Long positionId;
    
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
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
    
    /**
     * 创建者
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    
    /**
     * 更新者
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    
    /**
     * 删除标志（0-未删除 1-已删除）
     */
    @TableLogic
    private Integer deleted;
}
