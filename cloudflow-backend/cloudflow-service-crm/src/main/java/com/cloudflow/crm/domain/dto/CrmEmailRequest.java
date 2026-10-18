package com.cloudflow.crm.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

public record CrmEmailRequest(
        @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{16,128}") String requestKey,
        @NotBlank @Pattern(regexp = "CUSTOMER|OPPORTUNITY|TICKET|QUOTE") String bizType,
        @NotNull @Positive Long bizId,
        @Positive Long contactId,
        @Size(max = 100) String templateCode,
        @NotBlank @Size(max = 200) String subject,
        @NotBlank @Size(max = 1_048_576) String content,
        @Size(max = 10) List<@NotNull @Positive Long> fileIds,
        @Size(max = 254) String fromAddress,
        @Size(max = 50) List<@NotBlank @Size(max = 254) String> toAddresses,
        @Size(max = 50) List<@NotBlank @Size(max = 254) String> ccAddresses,
        @Size(max = 500) String remark) {
    @Override public String toString() { return "CrmEmailRequest[bizType=" + bizType + ",bizId=" + bizId + "]"; }
}
