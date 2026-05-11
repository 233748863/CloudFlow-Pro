package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.Pattern;
import java.io.Serializable;
import java.util.List;

/**
 * 候选人更新DTO
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class CandidateUpdateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 姓名
     */
    private String name;

    /**
     * 性别：MALE-男 FEMALE-女
     */
    private String gender;

    /**
     * 手机号
     */
    @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确")
    private String phone;

    /**
     * 邮箱
     */
    @Pattern(regexp = "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$", message = "邮箱格式不正确")
    private String email;

    /**
     * 简历附件URL列表
     */
    private List<String> resumeAttachmentUrls;

    /**
     * 来源：WEBSITE-官网 REFERRAL-内推 HEADHUNTER-猎头 CAMPUS-校招
     */
    private String source;
}
