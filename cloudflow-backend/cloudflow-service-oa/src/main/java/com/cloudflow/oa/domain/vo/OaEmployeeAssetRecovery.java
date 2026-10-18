package com.cloudflow.oa.domain.vo;

import java.util.List;

public record OaEmployeeAssetRecovery(Long employeeId, Long userId, List<Asset> assets) {
    public OaEmployeeAssetRecovery { assets = List.copyOf(assets); }

    public record Asset(Long assetId, String assetCode, String name, String model, String status,
                        String location, Integer version, Long custodianUserId, Long borrowerUserId,
                        boolean ownershipConsistent) { }
}
