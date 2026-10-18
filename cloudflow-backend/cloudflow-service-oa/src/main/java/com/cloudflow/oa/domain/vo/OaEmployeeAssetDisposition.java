package com.cloudflow.oa.domain.vo;

import java.time.LocalDate;

public record OaEmployeeAssetDisposition(Long employeeId, Long userId, OaEmployeeAssetRecovery.Asset asset,
                                        boolean responsibilityReleased, Movement movement) {
    public record Movement(Long movementId, String movementNo, String purpose, LocalDate movementDate,
                           Integer version, Long fromCustodianId, Long toCustodianId) { }
}
