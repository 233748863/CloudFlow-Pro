package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.OaAssetRecoveryClient;
import com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery;
import com.cloudflow.hr.domain.entity.HrEmployee;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class HrSettlementAssetSource {
    private final OaAssetRecoveryClient client;
    private final HrHSupport access;

    public List<HrEmployeeAssetRecovery.Asset> outstanding(Long employeeId) {
        access.permission("hr:settlement:calculate");
        access.scope(employeeId);
        HrEmployee employee = access.employee(employeeId);
        R<HrEmployeeAssetRecovery> response;
        try { response = client.outstanding(employeeId); }
        catch (RuntimeException failure) { throw HrHException.conflict("SETTLEMENT_ASSETS_UNVERIFIED", "OA资产清单尚未核实，请重试"); }
        if (response == null || !response.isSuccess() || response.getData() == null || response.getData().assets() == null
                || !Objects.equals(response.getData().employeeId(), employeeId) || employee.getUserId() == null
                || !Objects.equals(response.getData().userId(), employee.getUserId())) {
            throw HrHException.conflict("SETTLEMENT_ASSETS_UNVERIFIED", "OA资产清单或员工归属尚未核实");
        }
        Set<Long> identifiers = new HashSet<>();
        for (HrEmployeeAssetRecovery.Asset asset : response.getData().assets()) {
            if (asset == null || asset.assetId() == null || asset.assetId() <= 0 || !identifiers.add(asset.assetId())
                    || asset.version() == null || asset.version() < 0
                    || !Objects.equals(asset.custodianUserId(), employee.getUserId()) && !Objects.equals(asset.borrowerUserId(), employee.getUserId())) {
                throw HrHException.conflict("SETTLEMENT_ASSETS_UNVERIFIED", "OA资产来源重复、版本缺失或保管归属不匹配");
            }
        }
        return List.copyOf(response.getData().assets());
    }
}
