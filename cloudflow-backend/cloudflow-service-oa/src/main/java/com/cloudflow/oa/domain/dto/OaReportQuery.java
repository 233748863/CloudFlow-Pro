package com.cloudflow.oa.domain.dto;

import lombok.Data;
import java.time.LocalDate;
import java.util.List;

@Data
public class OaReportQuery {
    private Long tenantId;
    private Long userId;
    private LocalDate fromDate;
    private LocalDate toDate;
    private List<Long> rfqIds;
}
