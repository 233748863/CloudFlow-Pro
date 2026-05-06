package com.cloudflow.oa.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.cloudflow.oa.domain.OaTraceEvent;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 前端通用业务时间线事件。
 */
@Data
public class TimelineEventDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long id;
    private String businessType;
    private Long businessId;
    private String eventType;
    private String title;
    private String content;
    private String operatorName;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime eventTime;

    private String snapshotJson;

    public static TimelineEventDTO from(OaTraceEvent event) {
        TimelineEventDTO dto = new TimelineEventDTO();
        dto.setId(event.getId());
        dto.setBusinessType(event.getBusinessType());
        dto.setBusinessId(event.getBusinessId());
        dto.setEventType(event.getEventType());
        dto.setTitle(event.getEventTitle());
        dto.setContent(event.getEventContent());
        dto.setOperatorName(event.getOperatorName());
        dto.setEventTime(event.getEventTime());
        dto.setSnapshotJson(event.getSnapshotJson());
        return dto;
    }
}
