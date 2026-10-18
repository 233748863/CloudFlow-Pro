package com.cloudflow.crm.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class CrmTimelineItemVO {
    private String type;
    private Long sourceId;
    private String title;
    private String content;
    private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime eventTime;
    private String ownerName;
}
