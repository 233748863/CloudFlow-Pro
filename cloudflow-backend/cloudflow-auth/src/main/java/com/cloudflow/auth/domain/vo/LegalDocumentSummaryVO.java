package com.cloudflow.auth.domain.vo;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class LegalDocumentSummaryVO {

    private String docType;

    private String title;

    private String version;

    private Boolean required;

    private Integer sortOrder;

    private Boolean hasContent;

    private Boolean hasExternalUrl;
}
