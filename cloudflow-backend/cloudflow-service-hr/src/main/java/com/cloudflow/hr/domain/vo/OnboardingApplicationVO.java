package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 入职申请视图对象。
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class OnboardingApplicationVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键 ID。
     */
    private Long id;

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
     * 部门名称。
     */
    private String deptName;

    /**
     * 岗位 ID。
     */
    private Long postId;

    /**
     * 岗位名称。
     */
    private String postName;

    /**
     * 职位 ID。
     */
    private Long positionId;

    /**
     * 职位名称。
     */
    private String positionName;

    /**
     * 预计入职日期。
     */
    private LocalDate expectedDate;

    /**
     * 流程实例 ID。
     */
    private String processInstanceId;

    /**
     * 状态编码。
     */
    private String status;

    /**
     * 状态描述。
     */
    private String statusDesc;

    /**
     * 员工 ID。
     */
    private Long employeeId;

    /**
     * 创建时间。
     */
    private LocalDateTime createTime;

    /**
     * 更新时间。
     */
    private LocalDateTime updateTime;
}
