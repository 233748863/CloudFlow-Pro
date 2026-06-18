package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.config.SysConfigKeys;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.HrContractSignaturePayload;
import com.cloudflow.hr.domain.entity.HrContractSignature;
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.event.HrContractSignatureSubmittedEvent;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrContractSignatureMapper;
import com.cloudflow.hr.mapper.HrEmployeeContractMapper;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.IHrContractSignatureService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrContractSignatureServiceImpl implements IHrContractSignatureService {

    private static final Set<String> CANCELABLE_STATUS = Set.of("PENDING", "APPROVING");
    private static final Set<String> REQUESTABLE_SIGN_STATUS = Set.of("UNSIGNED", "REJECTED", "EXPIRED", "CANCELLED");
    private static final Set<String> CLOSED_CONTRACT_STATUS = Set.of("EXPIRED", "TERMINATED");

    private final HrContractSignatureMapper contractSignatureMapper;
    private final HrEmployeeContractMapper employeeContractMapper;
    private final HrEssSupport essSupport;
    private final WorkflowServiceClient workflowServiceClient;
    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;
    private final RuntimeSysConfigService runtimeSysConfigService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long requestSign(Long contractId, HrContractSignaturePayload payload) {
        if (contractId == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "contractId 不能为空");
        }
        HrEmployeeContract contract = employeeContractMapper.selectById(contractId);
        if (contract == null || Integer.valueOf(1).equals(contract.getDeleted())) {
            throw new HrBusinessException("CONTRACT_NOT_FOUND", "合同不存在：" + contractId);
        }
        essSupport.assertOwner(contract.getEmployeeId());
        assertRequestable(contract);
        Long tenantId = currentTenantId();
        Long employeeId = contract.getEmployeeId();

        HrContractSignature signature = new HrContractSignature();
        signature.setTenantId(tenantId);
        signature.setContractId(contractId);
        signature.setSignerType("EMPLOYEE");
        signature.setSignerId(employeeId);
        signature.setSignMethod(StringUtils.hasText(payload == null ? null : payload.getSignMethod())
                ? payload.getSignMethod() : "E_SIGN");
        signature.setSignStatus("PENDING");
        signature.setExpireTime(LocalDateTime.now().plusDays(runtimeSysConfigService.getInt(
                SysConfigKeys.HR_CONTRACT_DEFAULT_EXPIRE_DAYS,
                7)));
        signature.setRemark(payload == null ? null : payload.getRemark());
        signature.setDeleted(0);
        signature.setCreateBy(currentUserName());
        signature.setUpdateBy(currentUserName());
        contractSignatureMapper.insert(signature);

        UpdateWrapper<HrEmployeeContract> contractWrapper = new UpdateWrapper<>();
        contractWrapper.eq("id", contractId)
                .eq("tenant_id", tenantId)
                .set("sign_status", "PENDING")
                .set("update_time", LocalDateTime.now());
        employeeContractMapper.update(null, contractWrapper);
        HrContractSignatureSubmittedEvent event = new HrContractSignatureSubmittedEvent();
        event.setSignatureId(signature.getId());
        event.setContractId(contractId);
        event.setSubmittedAt(LocalDateTime.now());
        publishContractSignatureSubmittedEvent(signature, event);
        log.info("合同签署申请已发起，contractId: {}, signatureId: {}", contractId, signature.getId());
        return signature.getId();
    }

    @Override
    @Audit(name = "取消合同签署", highRisk = true)
    public void cancel(Long id) {
        HrContractSignature signature = loadSignature(id);
        essSupport.assertOwner(signature.getSignerId());
        if (!CANCELABLE_STATUS.contains(String.valueOf(signature.getSignStatus()).toUpperCase())) {
            throw new HrBusinessException("STATUS_NOT_CANCELABLE",
                    "当前签署状态 " + signature.getSignStatus() + " 不允许撤销");
        }
        cancelWorkflowIfNeeded(id, signature.getProcessInstanceId());
        markCancelled(signature);
    }

    private void cancelWorkflowIfNeeded(Long id, String processInstanceId) {
        if (!StringUtils.hasText(processInstanceId)) {
            return;
        }
        R<Void> cancelResult = workflowServiceClient.cancelProcess(processInstanceId);
        if (cancelResult == null || !cancelResult.isSuccess()) {
            String msg = cancelResult == null ? "Workflow 服务无响应" : cancelResult.getMsg();
            log.warn("撤销合同签署流程失败，signatureId: {}, processInstanceId: {}, msg: {}",
                    id, processInstanceId, msg);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    protected void markCancelled(HrContractSignature signature) {
        UpdateWrapper<HrContractSignature> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", signature.getId())
                .eq("tenant_id", currentTenantId())
                .set("sign_status", "CANCELLED")
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        contractSignatureMapper.update(null, wrapper);

        UpdateWrapper<HrEmployeeContract> contractWrapper = new UpdateWrapper<>();
        contractWrapper.eq("id", signature.getContractId())
                .eq("tenant_id", currentTenantId())
                .set("sign_status", "UNSIGNED")
                .set("update_time", LocalDateTime.now());
        employeeContractMapper.update(null, contractWrapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void onSigned(Long id) {
        HrContractSignature signature = loadSignature(id);
        LocalDateTime now = LocalDateTime.now();
        UpdateWrapper<HrContractSignature> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", id)
                .eq("tenant_id", currentTenantId())
                .set("sign_status", "SIGNED")
                .set("sign_time", now)
                .set("update_time", now);
        contractSignatureMapper.update(null, wrapper);

        UpdateWrapper<HrEmployeeContract> contractWrapper = new UpdateWrapper<>();
        contractWrapper.eq("id", signature.getContractId())
                .eq("tenant_id", currentTenantId())
                .set("sign_status", "SIGNED")
                .set("signed_at", now)
                .set("update_time", now);
        employeeContractMapper.update(null, contractWrapper);
        log.info("合同签署完成回写，signatureId: {}, contractId: {}", id, signature.getContractId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void syncContractSignStatus(Long id, String signStatus) {
        HrContractSignature signature = loadSignature(id);
        String normalizedStatus = normalizeStatus(signStatus);
        UpdateWrapper<HrEmployeeContract> contractWrapper = new UpdateWrapper<>();
        contractWrapper.eq("id", signature.getContractId())
                .eq("tenant_id", currentTenantId())
                .set("sign_status", normalizedStatus)
                .set("update_time", LocalDateTime.now());
        employeeContractMapper.update(null, contractWrapper);
    }

    public void startContractSignatureWorkflow(HrContractSignature signature) {
        HrEmployeeContract contract = employeeContractMapper.selectById(signature.getContractId());
        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(signature.getTenantId());
        dto.setProcessDefinitionKey(runtimeSysConfigService.getString(
                SysConfigKeys.HR_CONTRACT_SIGN_PROCESS_KEY,
                "wf_hr_contract_sign"));
        dto.setBusinessType("HR_CONTRACT_SIGN");
        dto.setBusinessId(signature.getId());
        dto.setBusinessNo(String.valueOf(signature.getContractId()));
        dto.setProcessTitle("员工电子合同签署-合同 " + signature.getContractId());
        dto.setStartUserId(signature.getSignerId());
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("contractId", signature.getContractId());
        vars.put("contractType", contract == null ? null : contract.getContractType());
        vars.put("employeeId", signature.getSignerId());
        vars.put("signMethod", signature.getSignMethod());
        dto.setVariables(vars);

        R<String> response = workflowServiceClient.startProcess(dto);
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String msg = response == null ? "Workflow 服务无响应" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "合同签署流程启动失败：" + msg);
        }
        UpdateWrapper<HrContractSignature> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", signature.getId())
                .eq("tenant_id", signature.getTenantId())
                .set("process_instance_id", response.getData())
                .set("update_time", LocalDateTime.now());
        contractSignatureMapper.update(null, wrapper);
        log.info("合同签署申请已发起，contractId: {}, signatureId: {}, processInstanceId: {}",
                signature.getContractId(), signature.getId(), response.getData());
    }

    private HrContractSignature loadSignature(Long id) {
        if (id == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "签署记录 ID 不能为空");
        }
        HrContractSignature signature = contractSignatureMapper.selectById(id);
        if (signature == null || Integer.valueOf(1).equals(signature.getDeleted())) {
            throw new HrBusinessException("CONTRACT_SIGNATURE_NOT_FOUND", "签署记录不存在：" + id);
        }
        return signature;
    }

    private void assertRequestable(HrEmployeeContract contract) {
        String contractStatus = normalizeStatus(contract.getStatus());
        if (CLOSED_CONTRACT_STATUS.contains(contractStatus)
                || (contract.getEndDate() != null && contract.getEndDate().isBefore(LocalDate.now()))) {
            throw new HrBusinessException("CONTRACT_EXPIRED",
                    "合同已到期或终止，不允许发起签署：" + contract.getId());
        }
        String signStatus = normalizeStatus(contract.getSignStatus());
        if (StringUtils.hasText(signStatus) && !REQUESTABLE_SIGN_STATUS.contains(signStatus)) {
            throw new HrBusinessException("CONTRACT_SIGN_STATUS_INVALID",
                    "当前签署状态不允许重新发起：" + signStatus);
        }
    }

    private String normalizeStatus(String value) {
        return StringUtils.hasText(value) ? value.trim().toUpperCase() : "";
    }

    private Long currentTenantId() {
        Long tid = TenantContext.getTenantId();
        if (tid != null) {
            return tid;
        }
        tid = UserContext.getTenantId();
        return tid == null ? 100000L : tid;
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    private void publishContractSignatureSubmittedEvent(HrContractSignature signature, HrContractSignatureSubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("HR_CONTRACT_SIGNATURE_SUBMITTED")
                    .sourceModule("cloudflow-hr")
                    .sourceId(signature.getId())
                    .tenantId(signature.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            throw new HrBusinessException("WORKFLOW_EVENT_PUBLISH_FAILED", "合同签署流程事件发布失败");
        }
    }
}
