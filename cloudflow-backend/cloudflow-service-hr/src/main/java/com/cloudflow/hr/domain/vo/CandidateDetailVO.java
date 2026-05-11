package com.cloudflow.hr.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 候选人详情VO
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class CandidateDetailVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 租户ID
     */
    private Long tenantId;

    /**
     * 招聘需求ID
     */
    private Long requestId;

    /**
     * 招聘需求编号
     */
    private String requestNo;

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
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate expectedDate;

    /**
     * 姓名
     */
    private String name;

    /**
     * 性别：MALE-男 FEMALE-女
     */
    private String gender;

    /**
     * 性别描述
     */
    private String genderDesc;

    /**
     * 手机号
     */
    private String phone;

    /**
     * 邮箱
     */
    private String email;

    /**
     * 简历附件URL列表
     */
    private List<String> resumeAttachmentUrls;

    /**
     * 来源：WEBSITE-官网 REFERRAL-内推 HEADHUNTER-猎头 CAMPUS-校招
     */
    private String source;

    /**
     * 来源描述
     */
    private String sourceDesc;

    /**
     * 状态：NEW-新简历 SCREENING-筛选中 INTERVIEW-面试中 OFFER-已发Offer HIRED-已入职 REJECTED-已拒绝
     */
    private String status;

    /**
     * 状态描述
     */
    private String statusDesc;

    /**
     * 拒绝原因
     */
    private String rejectReason;

    /**
     * 创建时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
