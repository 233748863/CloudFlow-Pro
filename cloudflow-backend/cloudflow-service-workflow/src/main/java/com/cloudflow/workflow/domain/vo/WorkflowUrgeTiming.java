package com.cloudflow.workflow.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/** 最后一次催办至任务实际完成的时间。 */
@Data
public class WorkflowUrgeTiming {
    private String historyId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime urgeTime;
    private Long elapsedSeconds;
}
