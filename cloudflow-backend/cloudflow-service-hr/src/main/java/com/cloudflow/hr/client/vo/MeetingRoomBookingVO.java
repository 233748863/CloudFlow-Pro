package com.cloudflow.hr.client.vo;

import lombok.Data;

/**
 * 会议室预订结果VO
 */
@Data
public class MeetingRoomBookingVO {

    private Long eventId;

    private Long roomId;

    private String roomName;

    private String roomLocation;

    private String locationSnapshot;
}
