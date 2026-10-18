package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.OaAssetMovement;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.domain.vo.OaEmployeeAssetDisposition;
import com.cloudflow.oa.domain.vo.OaEmployeeAssetRecovery;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaAssetMovementMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.SysAssetMapper;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** A read-only snapshot of current responsibility and actual completed disposition. */
@Service
@RequiredArgsConstructor
public class OaEmployeeAssetDispositionService {
    private final OaIdentityReferenceMapper identities;
    private final SysAssetMapper assets;
    private final OaAssetMovementMapper movements;

    @Transactional(readOnly = true)
    public OaEmployeeAssetDisposition inspect(Long employeeId, Long assetId) {
        Long tenant = OaRecordSupport.tenantId();
        if (tenant <= 0 || !Objects.equals(tenant, UserContext.getTenantId()) || employeeId == null || employeeId <= 0 || assetId == null || assetId <= 0) throw new IllegalArgumentException("资产核实缺少有效租户、员工或资产");
        OaIdentityReference employee = identities.employeeRecord(employeeId, tenant);
        if (employee == null || !Objects.equals(employee.getTenantId(), tenant) || employee.getUserId() == null || employee.getUserId() <= 0
                || identities.employeeLinkCount(employee.getUserId(), tenant) != 1) throw new IllegalArgumentException("员工与资产保管账号的关联未核实");
        SysAsset asset = assets.selectById(assetId);
        if (asset == null || !Objects.equals(asset.getTenantId(), tenant) || !Integer.valueOf(0).equals(asset.getDeleted())) throw new IllegalArgumentException("资产不存在或不可核实");
        Long user = employee.getUserId();
        boolean released = !Objects.equals(asset.getCustodianId(), user) && !Objects.equals(asset.getOwnerId(), user);
        List<OaAssetMovement> related = movements.selectList(new LambdaQueryWrapper<OaAssetMovement>()
                .eq(OaAssetMovement::getTenantId, tenant).eq(OaAssetMovement::getAssetId, assetId).eq(OaAssetMovement::getDeleted, 0)
                .eq(OaAssetMovement::getStatus, "COMPLETED").eq(OaAssetMovement::getFromCustodianId, user)
                .in(OaAssetMovement::getPurpose, "RETURN", "TRANSFER", "SCRAP", "DISPOSE", "LOST")
                .and(query -> query.isNull(OaAssetMovement::getToCustodianId).or().ne(OaAssetMovement::getToCustodianId, user))
                .orderByDesc(OaAssetMovement::getUpdateTime).orderByDesc(OaAssetMovement::getMovementId));
        if (released && related.isEmpty()) throw new IllegalArgumentException("资产责任已变化，但缺少该员工真实完成的处置记录");
        OaAssetMovement movement = related.isEmpty() ? null : related.get(0);
        OaEmployeeAssetDisposition.Movement evidence = movement == null ? null : new OaEmployeeAssetDisposition.Movement(
                movement.getMovementId(), movement.getMovementNo(), movement.getPurpose(), movement.getMovementDate(), movement.getVersion(), movement.getFromCustodianId(), movement.getToCustodianId());
        OaEmployeeAssetRecovery.Asset current = new OaEmployeeAssetRecovery.Asset(asset.getAssetId(), asset.getAssetCode(), asset.getName(), asset.getModel(), asset.getStatus(), asset.getLocation(),
                asset.getVersion(), asset.getCustodianId(), asset.getOwnerId(), asset.getCustodianId() == null || asset.getOwnerId() == null || Objects.equals(asset.getCustodianId(), asset.getOwnerId()));
        return new OaEmployeeAssetDisposition(employeeId, user, current, released, evidence);
    }
}
