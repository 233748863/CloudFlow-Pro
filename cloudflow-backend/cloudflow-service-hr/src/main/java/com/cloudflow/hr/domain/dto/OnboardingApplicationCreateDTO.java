package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;

/**
 * 创建入职申请 DTO。
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class OnboardingApplicationCreateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 候选人 ID，若来自招聘链路则可传入。
     */
    private Long candidateId;

    /**
     * 姓名。
     */
    @NotBlank(message = "姓名不能为空")
    private String name;

    /**
     * 性别：MALE-男，FEMALE-女。
     * 手工创建入职申请时应显式传入；若来自候选人链路，可由服务层自动回填。
     */
    private String gender;

    /**
     * 手机号。
     */
    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确")
    private String phone;

    /**
     * 邮箱。
     */
    @Email(message = "邮箱格式不正确")
    private String email;

    /**
     * 部门 ID。
     */
    @NotNull(message = "部门ID不能为空")
    private Long deptId;

    /**
     * 岗位 ID。
     */
    @NotNull(message = "岗位ID不能为空")
    private Long postId;

    /**
     * 职位 ID。
     */
    private Long positionId;

    /**
     * 预计入职日期。
     */
    @NotNull(message = "预计入职日期不能为空")
    private LocalDate expectedDate;
}
