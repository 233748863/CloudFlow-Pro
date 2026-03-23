package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 入职申请实体。
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_onboarding_application")
public class OnboardingApplication implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键 ID。
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 租户 ID。
     */
    private Long tenantId;

    /**
     * 申请编号。
     */
    private String applicationNo;

    /**
     * 候选人 ID。
     */
    private Long candidateId;

    /**
     * 姓名。
     */
    private String name;

    /**
     * 性别：MALE-男，FEMALE-女。
     */
    private String gender;

    /**
     * 手机号。
     */
    private String phone;

    /**
     * 邮箱。
     */
    private String email;

    /**
     * 部门 ID。
     */
    private Long deptId;

    /**
     * 岗位 ID。
     */
    private Long postId;

    /**
     * 职位 ID。
     */
    private Long positionId;

    /**
     * 预计入职日期。
     */
    private LocalDate expectedDate;

    /**
     * 流程实例 ID。
     */
    private String processInstanceId;

    /**
     * 状态：DRAFT、APPROVING、APPROVED、REJECTED、ONBOARDED。
     */
    private String status;

    /**
     * 员工 ID。
     */
    private Long employeeId;

    /**
     * 创建时间。
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /**
     * 更新时间。
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    /**
     * 创建人。
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    /**
     * 更新人。
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    /**
     * 删除标志。
     */
    @TableLogic
    private Integer deleted;
}
