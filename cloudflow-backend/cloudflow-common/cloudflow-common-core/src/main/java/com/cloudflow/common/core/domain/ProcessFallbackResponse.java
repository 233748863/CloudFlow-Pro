package com.cloudflow.common.core.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProcessFallbackResponse implements Serializable {

    private static final long serialVersionUID = 1L;

    private Boolean submitted;

    private Boolean retry;

    private String reason;

    private String processDefKey;

    private String businessKey;

    public static ProcessFallbackResponse retry(String reason, String processDefKey, String businessKey) {
        return ProcessFallbackResponse.builder()
                .submitted(false)
                .retry(true)
                .reason(reason)
                .processDefKey(processDefKey)
                .businessKey(businessKey)
                .build();
    }
}
