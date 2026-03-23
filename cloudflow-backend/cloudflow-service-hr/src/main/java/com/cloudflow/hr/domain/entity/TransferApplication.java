package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 调岗申请实体类
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_transfer_application")
public class TransferApplication implements Serializable {

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
     * 原部门ID
     */
    private Long fromDeptId;

    /**
     * 原岗位ID
     */
    private Long fromPostId;

    /**
     * 原职位ID
     */
    private Long fromPositionId;

    /**
     * 目标部门ID
     */
    private Long toDeptId;

    /**
     * 目标岗位ID
     */
    private Long toPostId;

    /**
     * 目标职位ID
     */
    private Long toPositionId;

    /**
     * 调岗类型：DEPT-部门调动 POST-岗位调整 PROMOTION-晋升 DEMOTION-降级
     */
    private String transferType;

    /**
     * 调岗原因
     */
    private String reason;

    /**
     * 生效日期
     */
    private LocalDate effectiveDate;

    /**
     * 是否涉及薪资变更
     */
    private Boolean salaryChange;

    /**
     * 流程实例ID
     */
    private String processInstanceId;

    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 EFFECTIVE-已生效
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
