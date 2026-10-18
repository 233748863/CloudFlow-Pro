package com.cloudflow.oa.service.impl;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackInstanceGuard;
import com.cloudflow.oa.config.CrmEventStreamConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.util.OaContractConstants;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 合同审批结果处理器。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ContractApprovalHandler implements ApprovalResultHandler {

    private final OaContractMapper contractMapper;
    private final IOaTraceEventService oaTraceEventService;
    private final RedisStreamUtil redisStreamUtil;
    private final OaContractPerformanceService performance;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.CONTRACT;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApproved(ApprovalResultDTO dto) {
        OaContract contract = updateStatus(dto, OaContractConstants.CONTRACT_STATUS_APPROVED, "APPROVAL_APPROVED", "合同审批通过");
        if (contract != null) {
            publishCrmEvent(contract, CrmEventStreamConstants.EVENT_CONTRACT_APPROVED, dto);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleRejected(ApprovalResultDTO dto) {
        OaContract contract = updateStatus(dto, OaContractConstants.CONTRACT_STATUS_REJECTED, "APPROVAL_REJECTED", "合同审批驳回");
        if (contract != null) {
            publishCrmEvent(contract, CrmEventStreamConstants.EVENT_CONTRACT_REJECTED, dto);
        }
    }

    private OaContract updateStatus(ApprovalResultDTO dto, String status, String eventType, String eventTitle) {
        if (dto == null || !Objects.equals(dto.getTenantId(), OaRecordSupport.tenantId()))
            throw new IllegalArgumentException("合同审批回写租户不一致");
        OaContract contract = contractMapper.selectForUpdate(dto.getBusinessId(), dto.getTenantId());
        if (contract == null || !Integer.valueOf(0).equals(contract.getDeleted())) {
            throw new IllegalStateException("未找到合同记录，businessId=" + dto.getBusinessId());
        }
        if (WorkflowCallbackInstanceGuard.shouldSkipStaleCallback(
                "合同", dto.getBusinessId(), contract.getInstanceId(), dto.getProcessInstanceId())) return null;
        if (OaContractConstants.CONTRACT_STATUS_CANCELLED.equals(contract.getStatus())) return null;
        if (Objects.equals(contract.getStatus(), status) || OaContractConstants.CONTRACT_STATUS_APPROVED.equals(status)
                && Set.of("SEALING", "SEALED", "ACTIVE", "EXPIRED", "TERMINATED").contains(contract.getStatus())) {
            performance.synchronize(contract.getContractId());
            return null;
        }
        if (!OaContractConstants.CONTRACT_STATUS_PENDING.equals(contract.getStatus()))
            throw new IllegalStateException("合同当前状态与审批回写不一致，请核对原流程");
        contract.setStatus(status); contract.setUpdateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        contract.setUpdateTime(LocalDateTime.now());
        OaRecordSupport.saved(contractMapper.updateById(contract));
        performance.synchronize(contract.getContractId());
        oaTraceEventService.record(contract.getTenantId(), OaContractConstants.BUSINESS_TYPE_CONTRACT, contract.getContractId(),
                OaContractConstants.BUSINESS_TYPE_APPROVAL, contract.getContractId(), eventType, eventTitle,
                dto.getApprovalComment(), dto.getApproverId(), dto.getApproverName(), null);
        log.info("合同审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
        contract.setStatus(status);
        return contract;
    }

    /**
     * 仅对来源于 CRM 的合同（sourceType=CRM_*）广播事件，避免无关 OA 自建合同触发 CRM 处理。
     */
    private void publishCrmEvent(OaContract contract, String eventType, ApprovalResultDTO dto) {
        if (contract.getSourceType() == null || !contract.getSourceType().startsWith("CRM_")) {
            return;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventType", eventType);
        payload.put("tenantId", String.valueOf(contract.getTenantId()));
        payload.put("eventTime", String.valueOf(Instant.now().toEpochMilli()));
        payload.put("contractId", String.valueOf(contract.getContractId()));
        payload.put("contractNo", contract.getContractNo() == null ? "" : contract.getContractNo());
        payload.put("contractName", contract.getContractName() == null ? "" : contract.getContractName());
        payload.put("amount", String.valueOf(contract.getAmount()));
        payload.put("customerId", contract.getCustomerId() == null ? "" : String.valueOf(contract.getCustomerId()));
        payload.put("customerName", contract.getCustomerName() == null ? "" : contract.getCustomerName());
        payload.put("ownerId", contract.getOwnerId() == null ? "" : String.valueOf(contract.getOwnerId()));
        payload.put("ownerName", contract.getOwnerName() == null ? "" : contract.getOwnerName());
        payload.put("deptId", contract.getDeptId() == null ? "" : String.valueOf(contract.getDeptId()));
        payload.put("deptName", contract.getDeptName() == null ? "" : contract.getDeptName());
        payload.put("sourceType", contract.getSourceType());
        payload.put("sourceId", contract.getSourceId() == null ? "" : String.valueOf(contract.getSourceId()));
        payload.put("approverId", dto.getApproverId() == null ? "" : String.valueOf(dto.getApproverId()));
        payload.put("approverName", dto.getApproverName() == null ? "" : dto.getApproverName());
        try {
            String recordId = redisStreamUtil.publishGlobal(CrmEventStreamConstants.CRM_EVENTS_STREAM_KEY, payload);
            log.info("已向 CRM 广播合同事件: type={}, contractId={}, recordId={}",
                    eventType, contract.getContractId(), recordId);
        } catch (Exception ex) {
            log.error("合同事件广播失败: type={}, contractId={}", eventType, contract.getContractId(), ex);
        }
    }
}
