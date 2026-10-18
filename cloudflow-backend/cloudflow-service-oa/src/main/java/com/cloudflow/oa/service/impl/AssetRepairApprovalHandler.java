package com.cloudflow.oa.service.impl;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaAssetRepair;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.mapper.OaAssetRepairMapper;
import com.cloudflow.oa.service.OaApprovalParticipant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AssetRepairApprovalHandler implements OaApprovalParticipant {
    private final OaAssetRepairMapper mapper;
    private final OaAssetOperationsService operations;
    private final OaApprovalOutboxService approvals;

    @Override
    public String getSupportedBusinessType() { return "OA_ASSET_REPAIR"; }

    @Override
    public String currentInstance(Long id) { return OaRecordSupport.active(mapper.selectById(id)).getInstanceId(); }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void bindInstance(OaApprovalRequest request, String instanceId) {
        OaAssetRepair record = OaRecordSupport.active(mapper.selectForUpdate(request.getBusinessId(), OaRecordSupport.tenantId()));
        if (!request.getReservation().equals(record.getInstanceId())) return;
        record.setInstanceId(instanceId); OaRecordSupport.touch(record); OaRecordSupport.saved(mapper.updateById(record)); approvals.recordBinding(request, instanceId);
    }

    @Override
    public void handleApproved(ApprovalResultDTO result) { operations.repairDecision(result, true); }

    @Override
    public void handleRejected(ApprovalResultDTO result) { operations.repairDecision(result, false); }
}
