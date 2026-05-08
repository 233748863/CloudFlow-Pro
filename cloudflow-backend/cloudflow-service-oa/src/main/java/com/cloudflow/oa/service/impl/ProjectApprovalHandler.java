package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.mapper.OaProjectMapper;
import com.cloudflow.oa.service.ApprovalResultHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectApprovalHandler implements ApprovalResultHandler {

    private final OaProjectMapper projectMapper;

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_PROJECT;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, "APPROVED");
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, "REJECTED");
    }

    private void updateStatus(ApprovalResultDTO dto, String status) {
        LambdaUpdateWrapper<OaProject> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaProject::getProjectId, dto.getBusinessId())
                .set(OaProject::getInstanceId, dto.getProcessInstanceId())
                .set(OaProject::getStatus, status)
                .set(OaProject::getUpdateBy, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY)
                .set(OaProject::getUpdateTime, LocalDateTime.now());
        int updated = projectMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到项目记录，businessId=" + dto.getBusinessId());
        }
        log.info("项目立项审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
