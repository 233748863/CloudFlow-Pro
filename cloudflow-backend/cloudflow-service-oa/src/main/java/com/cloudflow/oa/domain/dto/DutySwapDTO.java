package com.cloudflow.oa.domain.dto;

import lombok.Data;

/**
 * 值班换班入参。
 */
@Data
public class DutySwapDTO {

    private Long backupUserId;

    private String backupUserName;

    private String reason;
}
