package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.domain.vo.OaEmployeeAssetRecovery;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.SysAssetMapper;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OaEmployeeAssetRecoveryService {
    private final OaIdentityReferenceMapper identities;
    private final SysAssetMapper assets;

    public OaEmployeeAssetRecovery outstanding(Long employeeId) {
        Long tenantId = OaRecordSupport.tenantId();
        if (tenantId <= 0 || !Objects.equals(tenantId, UserContext.getTenantId()) || employeeId == null || employeeId <= 0) {
            throw new IllegalArgumentException("资产核实缺少有效租户或员工");
        }
        OaIdentityReference employee = identities.employeeRecord(employeeId, tenantId);
        if (employee == null || !Objects.equals(employee.getTenantId(), tenantId) || employee.getUserId() == null
                || employee.getUserId() <= 0 || identities.employeeLinkCount(employee.getUserId(), tenantId) != 1) {
            throw new IllegalArgumentException("员工与资产保管账号的关联未核实");
        }
        Long userId = employee.getUserId();
        List<SysAsset> records = assets.selectList(new LambdaQueryWrapper<SysAsset>()
                .eq(SysAsset::getTenantId, tenantId).eq(SysAsset::getDeleted, 0)
                .and(query -> query.eq(SysAsset::getCustodianId, userId).or().eq(SysAsset::getOwnerId, userId))
                .orderByAsc(SysAsset::getAssetId));
        List<OaEmployeeAssetRecovery.Asset> result = records.stream().map(asset -> new OaEmployeeAssetRecovery.Asset(
                asset.getAssetId(), asset.getAssetCode(), asset.getName(), asset.getModel(), asset.getStatus(), asset.getLocation(),
                asset.getVersion(), asset.getCustodianId(), asset.getOwnerId(), asset.getCustodianId() == null || asset.getOwnerId() == null
                || Objects.equals(asset.getCustodianId(), asset.getOwnerId()))).toList();
        return new OaEmployeeAssetRecovery(employeeId, userId, result);
    }
}
