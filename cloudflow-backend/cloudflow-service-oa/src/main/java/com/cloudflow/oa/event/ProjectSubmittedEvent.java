package com.cloudflow.oa.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ProjectSubmittedEvent {

    private Long projectId;

    private String projectNo;

    private Long ownerId;

    private String ownerName;

    private LocalDateTime submittedAt;
}
