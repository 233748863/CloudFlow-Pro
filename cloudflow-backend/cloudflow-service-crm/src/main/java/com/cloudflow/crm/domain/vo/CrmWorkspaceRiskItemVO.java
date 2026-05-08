package com.cloudflow.crm.domain.vo;

import lombok.Data;

@Data
public class CrmWorkspaceRiskItemVO {
    private String id;
    private String module;
    private String sourceLabel;
    private String title;
    private String description;
    private String level;
    private String status;
    private String path;
    private Long businessId;
    private String businessType;
}
