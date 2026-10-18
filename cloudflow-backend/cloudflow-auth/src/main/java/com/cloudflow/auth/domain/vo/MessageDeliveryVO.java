package com.cloudflow.auth.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class MessageDeliveryVO {
    private Long deliveryId;
    private Long recordId;
    private String channelType;
    private String status;
    private Integer attemptCount;
    private Integer version;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sendStartedTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime nextAttemptTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime acceptedTime;
    private String lastErrorCode;
    private Long resolvedBy;
    private String resolutionReason;
}
