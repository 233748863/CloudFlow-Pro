package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 候选人实体类
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_candidate")
public class Candidate implements Serializable {

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
     * 招聘需求ID
     */
    private Long requestId;

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
    private String phone;

    /**
     * 邮箱
     */
    private String email;

    /**
     * 简历URL
     */
    private String resumeAttachmentUrls;

    /**
     * 来源：WEBSITE-官网 REFERRAL-内推 HEADHUNTER-猎头 CAMPUS-校招
     */
    private String source;

    /**
     * 状态：NEW-新简历 SCREENING-筛选中 INTERVIEW-面试中 OFFER-已发Offer HIRED-已入职 REJECTED-已拒绝
     */
    private String status;

    /**
     * 拒绝原因
     */
    private String rejectReason;

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
