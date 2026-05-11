package com.cloudflow.hr.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 面试VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class InterviewVO {

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 候选人ID
     */
    private Long candidateId;

    /**
     * 候选人姓名
     */
    private String candidateName;

    /**
     * 面试轮次：FIRST-初试 SECOND-复试 FINAL-终试
     */
    private String interviewRound;

    /**
     * 面试轮次名称
     */
    private String interviewRoundName;

    /**
     * 面试类型：PHONE-电话面试 VIDEO-视频面试 ONSITE-现场面试
     */
    private String interviewType;

    /**
     * 面试类型名称
     */
    private String interviewTypeName;

    /**
     * 面试时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime interviewTime;

    /**
     * 面试结束时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime interviewEndTime;

    /**
     * 面试地点
     */
    private String location;

    /**
     * 关联会议室ID
     */
    private Long meetingRoomId;

    /**
     * 会议室名称快照
     */
    private String meetingRoomName;

    /**
     * OA日程事件ID
     */
    private Long scheduleEventId;

    /**
     * 面试官ID列表
     */
    private List<Long> interviewerIds;

    /**
     * 面试官姓名列表
     */
    private List<String> interviewerNames;

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
     * 面试结果名称
     */
    private String resultName;

    /**
     * 状态：SCHEDULED-已安排 COMPLETED-已完成 CANCELLED-已取消
     */
    private String status;

    /**
     * 状态名称
     */
    private String statusName;

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
