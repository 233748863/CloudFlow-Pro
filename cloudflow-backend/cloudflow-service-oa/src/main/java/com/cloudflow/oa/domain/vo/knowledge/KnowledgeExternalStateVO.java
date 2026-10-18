package com.cloudflow.oa.domain.vo.knowledge;

import com.cloudflow.common.core.domain.PortalKnowledgeVO;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
public class KnowledgeExternalStateVO {
    private Long documentId;
    private Integer version;
    private String status;
    private boolean externalVisible;
    private Long externalVersionId;
    private List<Long> externalAttachmentFileIds = List.of();
    private List<PortalKnowledgeVO.Attachment> attachmentCandidates = List.of();
    private List<Version> versions;
    private PortalKnowledgeVO preview;
    private String attachmentUnavailableReason;

    @Data
    public static class Version {
        private Long id;
        private Integer versionNo;
        private String title;
        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
        private LocalDateTime publishTime;
    }
}
