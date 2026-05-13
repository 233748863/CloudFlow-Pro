package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.dto.ApprovalResultDTO;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import com.cloudflow.crm.config.WorkflowCallbackStreamConstants;

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
        if (approval == null || !CrmConstants.DelFlag.NORMAL.equals(approval.getDelFlag())) {
            throw new IllegalStateException("未找到 CRM 审批流水: " + dto.getBusinessId());
        }
        return approval;
    }

    protected void updateApprovalStatus(CrmApproval approval, ApprovalResultDTO dto, boolean approved) {
        approval.setStatus(approved ? "APPROVED" : "REJECTED");
        approval.setInstanceId(dto.getProcessInstanceId());
        approval.setApprovalComment(dto.getApprovalComment());
        approval.setUpdateBy(WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY);
        approval.setUpdateTime(LocalDateTime.now());
        approvalMapper.updateById(approval);
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
