package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 面试查询DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class InterviewQueryDTO {

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
     * 面试时间开始
     */
    private LocalDateTime interviewTimeStart;

    /**
     * 面试时间结束
     */
    private LocalDateTime interviewTimeEnd;

    /**
     * 面试结果：PASS-通过 FAIL-不通过 PENDING-待定
     */
    private String result;

    /**
     * 状态：SCHEDULED-已安排 COMPLETED-已完成 CANCELLED-已取消
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
