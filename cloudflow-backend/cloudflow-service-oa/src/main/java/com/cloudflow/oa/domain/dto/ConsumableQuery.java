package com.cloudflow.oa.domain.dto;

import lombok.Data;
import java.time.LocalDateTime;
import org.springframework.format.annotation.DateTimeFormat;

@Data
public class ConsumableQuery {
    private Integer pageNum = 1;
    private Integer pageSize = 10;
    private String keyword;
    private Long consumableId;
    private Long categoryId;
    private String transactionType;
    private String sourceBizType;
    private Long sourceBizId;
    private String status;
    private String requestNo;
    private String applicantName;
    private Long deptId;
    private Long applicantId;
    private String groupBy = "CONSUMABLE";
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
    private LocalDateTime from;
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
    private LocalDateTime to;
}
