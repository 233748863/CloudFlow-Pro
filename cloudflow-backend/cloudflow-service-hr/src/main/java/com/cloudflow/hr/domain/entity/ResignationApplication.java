package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 离职申请实体类
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_resignation_application")
public class ResignationApplication implements Serializable {

    private static final long serialVersionUID = 1L;

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
     * 申请编号
     */
    private String applicationNo;

    /**
     * 员工ID
     */
    private Long employeeId;

    /**
     * 离职类型：VOLUNTARY-主动离职 INVOLUNTARY-被动离职 CONTRACT_EXPIRY-合同到期
     */
    private String resignationType;

    /**
     * 离职原因
     */
    private String resignationReason;

    /**
     * 预计离职日期
     */
    private LocalDate expectedDate;

    /**
     * 实际离职日期
     */
    private LocalDate actualDate;

    /**
     * 离职面谈内容
     */
    private String interviewContent;

    /**
     * 流程实例ID
     */
    private String processInstanceId;

    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 COMPLETED-已完成
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
