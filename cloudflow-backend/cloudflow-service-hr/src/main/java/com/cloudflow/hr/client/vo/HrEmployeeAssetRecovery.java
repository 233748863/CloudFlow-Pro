package com.cloudflow.hr.client.vo;

import java.util.List;

public record HrEmployeeAssetRecovery(Long employeeId, Long userId, List<Asset> assets) {
    public record Asset(Long assetId, String assetCode, String name, String model, String status,
                        String location, Integer version, Long custodianUserId, Long borrowerUserId,
                        boolean ownershipConsistent) { }
}
