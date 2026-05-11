package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 会议室预订创建DTO
 */
@Data
public class MeetingRoomBookingCreateDTO {

    private Long roomId;

    private String title;

    private String description;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    private Long creatorId;

    private String attendees;
}
