package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 更新面试DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class InterviewUpdateDTO {

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
     * 面试结束时间
     */
    private LocalDateTime interviewEndTime;

    /**
     * 面试地点
     */
    private String location;

    /**
     * 面试官ID列表
     */
    private List<Long> interviewerIds;
}
