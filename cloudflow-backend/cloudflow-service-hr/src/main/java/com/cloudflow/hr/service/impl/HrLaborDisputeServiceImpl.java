package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.entity.HrDisputeEvidence;
import com.cloudflow.hr.domain.entity.HrLaborDispute;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrDisputeEvidenceMapper;
import com.cloudflow.hr.mapper.HrLaborDisputeMapper;
import com.cloudflow.hr.service.HrLaborDisputeService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrLaborDisputeServiceImpl implements HrLaborDisputeService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrLaborDisputeMapper disputeMapper;
    private final HrDisputeEvidenceMapper evidenceMapper;
    private final HrTypedCrudService crudService;
    private final WorkflowServiceClient workflowServiceClient;
    private final ObjectMapper objectMapper;

    @Value("${cloudflow.hr.dispute.process-key:wf_hr_labor_dispute}")
    private String disputeProcessKey;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long registerDispute(Map<String, Object> payload) {
        HrLaborDispute dispute = objectMapper.convertValue(payload, HrLaborDispute.class);
        dispute.setTenantId(currentTenantId());
        if (!StringUtils.hasText(dispute.getDisputeNo())) {
            dispute.setDisputeNo("LD-" + System.currentTimeMillis());
        }
        if (!StringUtils.hasText(dispute.getStatus())) {
            dispute.setStatus("REGISTERED");
        }
        if (dispute.getOpenedAt() == null) {
            dispute.setOpenedAt(LocalDate.now());
        }
        dispute.setDeleted(0);
        dispute.setCreateBy(currentUserName());
        dispute.setUpdateBy(currentUserName());
        disputeMapper.insert(dispute);
        return dispute.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateDispute(Long disputeId, Map<String, Object> payload) {
        crudService.updateProperties(HrLaborDispute.class, disputeId, payload);
    }

    @Override
    public Map<String, Object> page(Map<String, Object> query) {
        return crudService.page(HrLaborDispute.class, query);
    }

    @Override
    public Map<String, Object> get(Long disputeId) {
        return crudService.get(HrLaborDispute.class, disputeId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String submitWorkflow(Long disputeId) {
        HrLaborDispute dispute = disputeMapper.selectById(disputeId);
        if (dispute == null) {
            throw new HrBusinessException("LABOR_DISPUTE_NOT_FOUND", "争议不存在：" + disputeId);
        }
        if (!"REGISTERED".equals(dispute.getStatus()) && !"MEDIATED".equals(dispute.getStatus())) {
            throw new HrBusinessException("LABOR_DISPUTE_STATUS_INVALID",
                    "状态 " + dispute.getStatus() + " 不允许发起审批");
        }
        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(currentTenantId());
        dto.setProcessDefinitionKey(disputeProcessKey);
        dto.setBusinessType("HR_LABOR_DISPUTE");
        dto.setBusinessId(disputeId);
        dto.setBusinessNo(dispute.getDisputeNo());
        dto.setProcessTitle("劳动争议-" + dispute.getDisputeNo());
        dto.setStartUserId(UserContext.getUserId());
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("disputeId", disputeId);
        vars.put("disputeType", dispute.getDisputeType());
        vars.put("claimAmount", dispute.getClaimAmount());
        dto.setVariables(vars);
        R<String> response = workflowServiceClient.startProcess(dto);
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String msg = response == null ? "Workflow 服务无响应" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "劳动争议审批启动失败：" + msg);
        }
        String nextStatus = "REGISTERED".equals(dispute.getStatus()) ? "MEDIATING" : "ARBITRATING";
        UpdateWrapper<HrLaborDispute> uw = new UpdateWrapper<>();
        uw.eq("id", disputeId).eq("tenant_id", currentTenantId())
                .set("process_instance_id", response.getData())
                .set("status", nextStatus)
                .set("update_time", LocalDateTime.now());
        disputeMapper.update(null, uw);
        return response.getData();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void close(Long disputeId, String reason) {
        HrLaborDispute dispute = disputeMapper.selectById(disputeId);
        if (dispute == null) {
            throw new HrBusinessException("LABOR_DISPUTE_NOT_FOUND", "争议不存在：" + disputeId);
        }
        UpdateWrapper<HrLaborDispute> uw = new UpdateWrapper<>();
        uw.eq("id", disputeId).eq("tenant_id", currentTenantId())
                .set("status", "CLOSED")
                .set("closed_at", LocalDate.now())
                .set("remark", reason)
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        disputeMapper.update(null, uw);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long attachEvidence(Long disputeId, Map<String, Object> payload) {
        if (disputeMapper.selectById(disputeId) == null) {
            throw new HrBusinessException("LABOR_DISPUTE_NOT_FOUND", "争议不存在：" + disputeId);
        }
        HrDisputeEvidence evidence = objectMapper.convertValue(payload, HrDisputeEvidence.class);
        evidence.setDisputeId(disputeId);
        evidence.setTenantId(currentTenantId());
        if (evidence.getUploadedAt() == null) {
            evidence.setUploadedAt(LocalDateTime.now());
        }
        if (evidence.getUploadedBy() == null) {
            evidence.setUploadedBy(UserContext.getUserId());
        }
        evidence.setDeleted(0);
        evidence.setCreateBy(currentUserName());
        evidence.setUpdateBy(currentUserName());
        evidenceMapper.insert(evidence);
        return evidence.getId();
    }

    @Override
    public Map<String, Object> listEvidence(Long disputeId) {
        QueryWrapper<HrDisputeEvidence> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId()).eq("dispute_id", disputeId).eq("deleted", 0)
                .orderByDesc("create_time");
        List<HrDisputeEvidence> rows = evidenceMapper.selectList(qw);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows == null ? new LinkedList<>() : rows);
        result.put("total", rows == null ? 0 : rows.size());
        return result;
    }

    private long currentTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        tenantId = UserContext.getTenantId();
        return tenantId == null ? DEFAULT_TENANT_ID : tenantId;
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }
}
