package com.cloudflow.common.core.domain;

public record PortalKnowledgeFile(Long documentId, Long versionId, Integer publicationVersion,
        PortalKnowledgeVO.Attachment attachment) { }
