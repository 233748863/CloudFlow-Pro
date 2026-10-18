package com.cloudflow.crm.domain.dto;

import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;

@Data
public class CrmActivityQuery {
    private String activityType;
    private String status;
    private String subject;
    private Long customerId;
    private Long ownerId;
    private String bizType;
    private Long bizId;
    private Integer overdueFlag;
    private String view;
    @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime start;
    @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime end;
}
