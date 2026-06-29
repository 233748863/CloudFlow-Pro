package com.cloudflow.auth.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

@Data
@Builder
public class LegalReleaseVO {

    private String releaseCode;

    private String title;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate effectiveDate;

    private String description;

    private List<LegalDocumentSummaryVO> documents;
}
