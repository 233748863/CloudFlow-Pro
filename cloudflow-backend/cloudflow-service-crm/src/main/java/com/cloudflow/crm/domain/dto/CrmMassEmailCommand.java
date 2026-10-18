package com.cloudflow.crm.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;

public record CrmMassEmailCommand(Integer version, String previewDigest, Boolean confirmLarge, Integer confirmedRecipientCount,
        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime scheduledTime,
        @JsonProperty(access = JsonProperty.Access.WRITE_ONLY) String testAddress) {
    @Override public String toString() { return "CrmMassEmailCommand[version=" + version + "]"; }
}
