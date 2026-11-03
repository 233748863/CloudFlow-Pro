package com.cloudflow.oa.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.time.LocalDate;

/** 会议纪要与派发任务共用的决议字段。 */
@Data
public class OaMeetingDecision {
    private String title;
    private Long ownerId;
    private String ownerName;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate dueDate;
    private String remark;
    private String status;
    private Long workTaskId;
}
