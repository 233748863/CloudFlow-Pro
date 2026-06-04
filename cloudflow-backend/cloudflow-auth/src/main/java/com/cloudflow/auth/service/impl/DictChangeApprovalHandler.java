package com.cloudflow.auth.service.impl;

import com.cloudflow.auth.constant.AuthBusinessTypes;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class DictChangeApprovalHandler implements ApprovalResultHandler {

    private final SysDictTypeServiceImpl sysDictTypeService;

    @Override
    public String getSupportedBusinessType() {
        return AuthBusinessTypes.DICT_CHANGE_APPROVAL;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        sysDictTypeService.handleDictChangeApproved(dto);
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        sysDictTypeService.handleDictChangeRejected(dto);
    }
}
