package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 安排面试DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class InterviewScheduleDTO {

    /**
     * 候选人ID
     */
    @NotNull(message = "候选人ID不能为空")
    private Long candidateId;

    /**
     * 面试轮次：FIRST-初试 SECOND-复试 FINAL-终试
     */
    @NotNull(message = "面试轮次不能为空")
    private String interviewRound;

    /**
     * 面试类型：PHONE-电话面试 VIDEO-视频面试 ONSITE-现场面试
     */
    @NotNull(message = "面试类型不能为空")
    private String interviewType;

    /**
     * 面试时间
     */
    @NotNull(message = "面试时间不能为空")
    private LocalDateTime interviewTime;

    /**
     * 面试结束时间
     */
    @NotNull(message = "面试结束时间不能为空")
    private LocalDateTime interviewEndTime;

    /**
     * 面试地点
     */
    private String location;

    /**
     * 会议室ID
     */
    private Long meetingRoomId;

    /**
     * 面试官ID列表
     */
    private List<Long> interviewerIds;
}
