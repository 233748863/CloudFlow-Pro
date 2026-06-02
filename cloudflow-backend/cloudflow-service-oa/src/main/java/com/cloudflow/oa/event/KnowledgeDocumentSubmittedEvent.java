package com.cloudflow.oa.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class KnowledgeDocumentSubmittedEvent {

    private Long documentId;

    private String title;

    private Long submitterId;

    private String submitterName;

    private LocalDateTime submittedAt;
}
