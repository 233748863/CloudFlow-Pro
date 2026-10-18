package com.cloudflow.crm.domain.vo;

import com.cloudflow.crm.service.email.archive.CrmEmailArchiveFiles;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;
import lombok.ToString;

@Data
@ToString(onlyExplicitlyIncluded = true)
public class CrmEmailRecordVO {
    @ToString.Include
    private Long emailId;
    private Long messageRecordId;
    private String requestKey;
    private String direction;
    private String subject;
    private String contentSummary;
    private String sanitizedContent;
    private String fromAddress;
    private List<String> toAddresses;
    private List<String> ccAddresses;
    private String bizType;
    private Long bizId;
    private Long customerId;
    private Long contactId;
    private Long senderUserId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sendTime;
    private String sendStatus;
    private Integer attachmentCount;
    private List<CrmEmailArchiveFiles.FileInfo> attachments;
    private Integer readFlag;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime readTime;
    private String remark;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
