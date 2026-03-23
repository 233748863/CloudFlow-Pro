package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 候选人查询DTO
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class CandidateQueryDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 招聘需求ID
     */
    private Long requestId;

    /**
     * 姓名（模糊查询）
     */
    private String name;

    /**
     * 手机号
     */
    private String phone;

    /**
     * 邮箱
     */
    private String email;

    /**
     * 来源：WEBSITE-官网 REFERRAL-内推 HEADHUNTER-猎头 CAMPUS-校招
     */
    private String source;

    /**
     * 状态：NEW-新简历 SCREENING-筛选中 INTERVIEW-面试中 OFFER-已发Offer HIRED-已入职 REJECTED-已拒绝
     */
    private String status;

    /**
     * 页码
     */
    private Integer pageNum = 1;

    /**
     * 每页大小
     */
    private Integer pageSize = 10;
}
