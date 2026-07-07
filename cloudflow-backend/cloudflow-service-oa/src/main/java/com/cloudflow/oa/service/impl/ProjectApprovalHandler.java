package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackInstanceGuard;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.mapper.OaProjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectApprovalHandler implements ApprovalResultHandler {

    private final OaProjectMapper projectMapper;
    private final ProjectExecutionStateService projectExecutionStateService;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.PROJECT;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        if (updateStatus(dto, "APPROVED")) {
            projectExecutionStateService.syncProjectStatus(dto.getBusinessId(), WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        }
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, "REJECTED");
    }

    private boolean updateStatus(ApprovalResultDTO dto, String status) {
        LambdaUpdateWrapper<OaProject> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaProject::getProjectId, dto.getBusinessId())
                .eq(OaProject::getInstanceId, dto.getProcessInstanceId())
                .set(OaProject::getStatus, status)
                .set(OaProject::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(OaProject::getUpdateTime, LocalDateTime.now());
        int updated = projectMapper.update(null, wrapper);
        if (updated <= 0) {
            OaProject project = projectMapper.selectById(dto.getBusinessId());
            if (project == null) {
                throw new IllegalStateException("未找到项目记录，businessId=" + dto.getBusinessId());
            }
            if (WorkflowCallbackInstanceGuard.shouldSkipStaleCallback(
                    "项目", dto.getBusinessId(), project.getInstanceId(), dto.getProcessInstanceId())) {
                return false;
            }
            throw new IllegalStateException("项目审批结果回写失败，businessId=" + dto.getBusinessId());
        }
        log.info("项目立项审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
        return true;
    }
}
