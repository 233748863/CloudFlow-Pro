package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 面试实体类
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_interview")
public class Interview implements Serializable {

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
     * 候选人ID
     */
    private Long candidateId;

    /**
     * 面试轮次：FIRST-初试 SECOND-复试 FINAL-终试
     */
    private String interviewRound;

    /**
     * 面试类型：PHONE-电话面试 VIDEO-视频面试 ONSITE-现场面试
     */
    private String interviewType;

    /**
     * 面试时间
     */
    private LocalDateTime interviewTime;

    /**
     * 面试地点
     */
    private String location;

    /**
     * 面试官ID列表（JSON格式）
     */
    private String interviewers;

    /**
     * 面试评价
     */
    private String evaluation;

    /**
     * 面试评分（0-100）
     */
    private Integer score;

    /**
     * 面试结果：PASS-通过 FAIL-不通过 PENDING-待定
     */
    private String result;

    /**
     * 状态：SCHEDULED-已安排 COMPLETED-已完成 CANCELLED-已取消
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
