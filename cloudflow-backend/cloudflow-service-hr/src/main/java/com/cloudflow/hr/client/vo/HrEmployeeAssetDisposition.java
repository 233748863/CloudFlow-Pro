package com.cloudflow.hr.client.vo;

import java.time.LocalDate;

public record HrEmployeeAssetDisposition(Long employeeId, Long userId, HrEmployeeAssetRecovery.Asset asset,
                                        boolean responsibilityReleased, Movement movement) {
    public record Movement(Long movementId, String movementNo, String purpose, LocalDate movementDate,
                           Integer version, Long fromCustodianId, Long toCustodianId) { }
}
