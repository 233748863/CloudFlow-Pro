package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackInstanceGuard;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * CRM 通用审批 handler 的公共工具：加载审批流水 / 回写状态 / 反序列化 payload。
 */
@Slf4j
@RequiredArgsConstructor
abstract class AbstractCrmApprovalHandler {

    protected final CrmApprovalMapper approvalMapper;
    protected final ObjectMapper objectMapper;

    protected CrmApproval loadApproval(ApprovalResultDTO dto) {
        CrmApproval approval = approvalMapper.selectById(dto.getBusinessId());
        if (approval == null || !CrmConstants.DelFlag.NORMAL.equals(approval.getDeleted())) {
            throw new IllegalStateException("未找到 CRM 审批流水: " + dto.getBusinessId());
        }
        return approval;
    }

    protected boolean updateApprovalStatus(CrmApproval approval, ApprovalResultDTO dto, boolean approved) {
        LambdaUpdateWrapper<CrmApproval> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(CrmApproval::getApprovalId, approval.getApprovalId())
                .eq(CrmApproval::getInstanceId, dto.getProcessInstanceId())
                .set(CrmApproval::getStatus, approved ? "APPROVED" : "REJECTED")
                .set(CrmApproval::getApprovalComment, dto.getApprovalComment())
                .set(CrmApproval::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(CrmApproval::getUpdateTime, LocalDateTime.now());
        int updated = approvalMapper.update(null, wrapper);
        if (updated <= 0) {
            if (WorkflowCallbackInstanceGuard.shouldSkipStaleCallback(
                    "CRM审批流水", approval.getApprovalId(), approval.getInstanceId(), dto.getProcessInstanceId())) {
                return false;
            }
            throw new IllegalStateException("CRM审批流水回写失败: " + approval.getApprovalId());
        }
        approval.setStatus(approved ? "APPROVED" : "REJECTED");
        approval.setApprovalComment(dto.getApprovalComment());
        approval.setUpdateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        approval.setUpdateTime(LocalDateTime.now());
        return true;
    }

    protected Map<String, Object> parsePayload(CrmApproval approval) {
        if (approval == null || approval.getPayloadJson() == null) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(approval.getPayloadJson(),
                    new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception ex) {
            log.warn("解析 CRM 审批 payload 失败: approvalId={}", approval.getApprovalId(), ex);
            return new LinkedHashMap<>();
        }
    }

    protected Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    protected BigDecimal toDecimal(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return new BigDecimal(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    protected String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
