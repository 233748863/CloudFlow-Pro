package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 招聘需求实体类
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_recruitment_request")
public class RecruitmentRequest {

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
     * 需求编号
     */
    private String requestNo;

    /**
     * 部门ID
     */
    private Long deptId;

    /**
     * 职位ID
     */
    private Long positionId;

    /**
     * 招聘人数
     */
    private Integer headcount;

    /**
     * 任职要求
     */
    private String jobRequirements;

    /**
     * 薪资范围-最低
     */
    private BigDecimal salaryMin;

    /**
     * 薪资范围-最高
     */
    private BigDecimal salaryMax;

    /**
     * 期望到岗日期
     */
    private LocalDate expectedDate;

    /**
     * 流程实例ID
     */
    private String processInstanceId;

    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 RECRUITING-招聘中 COMPLETED-已完成 CANCELLED-已取消
     */
    private String status;

    /**
     * 已招聘人数
     */
    private Integer hiredCount;

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
