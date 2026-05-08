package com.cloudflow.crm.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CrmWorkspaceActivityItemVO {
    private String id;
    private String module;
    private String sourceLabel;
    private String title;
    private String content;
    private String operatorName;
    private LocalDateTime eventTime;
    private String path;
    private Long businessId;
    private String businessType;
}
