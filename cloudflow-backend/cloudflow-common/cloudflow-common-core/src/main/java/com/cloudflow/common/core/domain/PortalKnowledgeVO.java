package com.cloudflow.common.core.domain;

import java.util.List;
import lombok.Data;

@Data
public class PortalKnowledgeVO {
    private Long documentId;
    private Long versionId;
    private Integer versionNo;
    private String title;
    private String content;
    private List<Attachment> attachments = List.of();

    @Data
    public static class Attachment {
        private Long fileId;
        private String fileName;
        private Long fileSize;
    }
}
