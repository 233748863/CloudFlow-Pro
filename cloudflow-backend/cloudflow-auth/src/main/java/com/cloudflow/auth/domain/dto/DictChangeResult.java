package com.cloudflow.auth.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DictChangeResult {

    private boolean applied;

    private boolean approvalRequired;

    private Long approvalId;

    private String approvalNo;

    private String status;

    private String message;

    public static DictChangeResult applied(String message) {
        return new DictChangeResult(true, false, null, null, "APPLIED", message);
    }

    public static DictChangeResult pending(Long approvalId, String approvalNo, String message) {
        return new DictChangeResult(false, true, approvalId, approvalNo, "PENDING", message);
    }
}
