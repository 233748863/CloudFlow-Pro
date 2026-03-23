package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.io.Serializable;

/**
 * 候选人创建DTO
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class CandidateCreateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 招聘需求ID
     */
    @NotNull(message = "招聘需求ID不能为空")
    private Long requestId;

    /**
     * 姓名
     */
    @NotBlank(message = "姓名不能为空")
    private String name;

    /**
     * 性别：MALE-男 FEMALE-女
     */
    private String gender;

    /**
     * 手机号
     */
    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确")
    private String phone;

    /**
     * 邮箱
     */
    @Pattern(regexp = "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$", message = "邮箱格式不正确")
    private String email;

    /**
     * 简历URL
     */
    private String resumeUrl;

    /**
     * 来源：WEBSITE-官网 REFERRAL-内推 HEADHUNTER-猎头 CAMPUS-校招
     */
    private String source;
}
