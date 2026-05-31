package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.HrContractSignaturePayload;
import com.cloudflow.hr.domain.entity.HrContractSignature;
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrContractSignatureMapper;
import com.cloudflow.hr.mapper.HrEmployeeContractMapper;
import com.cloudflow.hr.service.IHrContractSignatureService;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 电子合同签署服务实现，详见接口文档。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrContractSignatureServiceImpl implements IHrContractSignatureService {

    private static final Set<String> CANCELABLE_STATUS = Set.of("PENDING", "APPROVING");

    private final HrContractSignatureMapper contractSignatureMapper;
    private final HrEmployeeContractMapper employeeContractMapper;
    private final HrEssSupport essSupport;
    private final WorkflowServiceClient workflowServiceClient;

    @Value("${cloudflow.hr.contract.sign-process-key:wf_hr_contract_sign}")
    private String processDefinitionKey;

    @Value("${cloudflow.hr.contract.default-expire-days:7}")
    private int defaultExpireDays;

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
        signature.setExpireTime(LocalDateTime.now().plusDays(defaultExpireDays));
        signature.setRemark(payload == null ? null : payload.getRemark());
        signature.setDeleted(0);
        signature.setCreateBy(currentUserName());
        signature.setUpdateBy(currentUserName());
        contractSignatureMapper.insert(signature);

        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(tenantId);
        dto.setProcessDefinitionKey(processDefinitionKey);
        dto.setBusinessType("HR_CONTRACT_SIGN");
        dto.setBusinessId(signature.getId());
        dto.setBusinessNo(String.valueOf(contractId));
        dto.setProcessTitle("员工电子合同签署-合同 " + contractId);
        dto.setStartUserId(UserContext.getUserId());
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("contractId", contractId);
        vars.put("contractType", contract.getContractType());
        vars.put("employeeId", employeeId);
        vars.put("signMethod", signature.getSignMethod());
        dto.setVariables(vars);

        R<String> response = workflowServiceClient.startProcess(dto);
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String msg = response == null ? "Workflow 服务无响应" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "合同签署流程启动失败：" + msg);
        }
        UpdateWrapper<HrContractSignature> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", signature.getId())
                .eq("tenant_id", tenantId)
                .set("process_instance_id", response.getData())
                .set("update_time", LocalDateTime.now());
        contractSignatureMapper.update(null, wrapper);

        UpdateWrapper<HrEmployeeContract> contractWrapper = new UpdateWrapper<>();
        contractWrapper.eq("id", contractId)
                .eq("tenant_id", tenantId)
                .set("sign_status", "SIGNING")
                .set("update_time", LocalDateTime.now());
        employeeContractMapper.update(null, contractWrapper);

        log.info("合同签署申请已发起，contractId: {}, signatureId: {}, processInstanceId: {}",
                contractId, signature.getId(), response.getData());
        return signature.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(Long id) {
        HrContractSignature signature = loadSignature(id);
        essSupport.assertOwner(signature.getSignerId());
        if (!CANCELABLE_STATUS.contains(String.valueOf(signature.getSignStatus()).toUpperCase())) {
            throw new HrBusinessException("STATUS_NOT_CANCELABLE",
                    "当前签署状态 " + signature.getSignStatus() + " 不允许撤销");
        }
        if (StringUtils.hasText(signature.getProcessInstanceId())) {
            R<Void> cancelResult = workflowServiceClient.cancelProcess(signature.getProcessInstanceId());
            if (cancelResult == null || !cancelResult.isSuccess()) {
                String msg = cancelResult == null ? "Workflow 服务无响应" : cancelResult.getMsg();
                log.warn("撤销合同签署流程失败，signatureId: {}, processInstanceId: {}, msg: {}",
                        id, signature.getProcessInstanceId(), msg);
            }
        }
        UpdateWrapper<HrContractSignature> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", id)
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
}
