package com.cloudflow.oa.domain.vo.knowledge;

import lombok.Data;

@Data
public class KnowledgePublication {
    private Long documentId;
    private Long versionId;
    private Integer versionNo;
    private Integer publicationVersion;
    private String title;
    private String content;
    private String attachmentUrl;
    private String externalAttachmentFileIds;
}
