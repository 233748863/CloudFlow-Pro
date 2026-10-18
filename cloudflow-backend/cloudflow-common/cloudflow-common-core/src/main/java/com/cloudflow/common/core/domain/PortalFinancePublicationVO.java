package com.cloudflow.common.core.domain;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
public class PortalFinancePublicationVO {
    private Integer version;
    private String publicationStatus;
    private String customerId;
    private String customerName;
    private String publishedBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime publishedTime;
    private List<String> fileIds;
    private List<PortalFinanceAttachment> availableFiles;
    private PortalFinanceVO record;
}
