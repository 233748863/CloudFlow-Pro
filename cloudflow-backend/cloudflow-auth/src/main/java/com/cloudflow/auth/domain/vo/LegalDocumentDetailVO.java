package com.cloudflow.auth.domain.vo;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class LegalDocumentDetailVO {

    private String releaseCode;

    private String docType;

    private String title;

    private String version;

    private String content;

    private String externalUrl;

    private Boolean required;
}
