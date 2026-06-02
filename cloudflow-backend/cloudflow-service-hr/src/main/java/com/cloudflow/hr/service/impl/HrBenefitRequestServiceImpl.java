package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.statemachine.core.StateMachine;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.benefit.HrBenefitRequestDTO;
import com.cloudflow.hr.domain.dto.benefit.HrBenefitRequestQueryDTO;
import com.cloudflow.hr.domain.entity.HrBenefitRequest;
import com.cloudflow.hr.event.HrBenefitRequestSubmittedEvent;
import com.cloudflow.hr.domain.vo.benefit.HrBenefitRequestVO;
import com.cloudflow.hr.enums.BenefitRequestEvent;
import com.cloudflow.hr.enums.BenefitRequestStatus;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrBenefitRequestMapper;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.IHrBenefitRequestService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrBenefitRequestServiceImpl implements IHrBenefitRequestService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrBenefitRequestMapper requestMapper;
    private final HrTypedCrudService crudService;
    private final WorkflowServiceClient workflowServiceClient;
    private final ObjectMapper objectMapper;
    private final StateMachineRegistry stateMachineRegistry;
    private final OutboxPublisher outboxPublisher;

    @Value("${cloudflow.hr.benefit.request-process-key:wf_hr_benefit_request}")
    private String benefitProcessKey;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createRequest(HrBenefitRequestDTO dto) {
        HrBenefitRequest request = objectMapper.convertValue(dto, HrBenefitRequest.class);
        request.setTenantId(currentTenantId());
        request.setStatus(StringUtils.hasText(request.getStatus()) ? request.getStatus() : "DRAFT");
        request.setDeleted(0);
        request.setCreateBy(currentUserName());
        request.setUpdateBy(currentUserName());
        if (!StringUtils.hasText(request.getRequestNo())) {
            request.setRequestNo("BR-" + System.currentTimeMillis());
        }
        requestMapper.insert(request);
        return request.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新福利申请", highRisk = true)
    public void updateRequest(Long requestId, HrBenefitRequestDTO dto) {
        HrBenefitRequest existing = requestMapper.selectById(requestId);
        if (existing != null && existing.getEmployeeId() != null) {
            DataScopeUtils.assertOwnership(existing.getEmployeeId(), "福利申请");
        }
        crudService.updateProperties(HrBenefitRequest.class, requestId,
                MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public PageResult<HrBenefitRequestVO> page(HrBenefitRequestQueryDTO query) {
        Map<String, Object> raw = crudService.page(HrBenefitRequest.class,
                MapConverters.toServiceQuery(query, objectMapper));
        return MapConverters.toPageResult(raw, HrBenefitRequestVO.class, objectMapper);
    }

    @Override
    public HrBenefitRequestVO get(Long requestId) {
        Map<String, Object> raw = crudService.get(HrBenefitRequest.class, requestId);
        return MapConverters.toVO(raw, HrBenefitRequestVO.class, objectMapper);
    }

    @Override
    public PageResult<HrBenefitRequestVO> listMine(HrBenefitRequestQueryDTO query) {
        Map<String, Object> q = new LinkedHashMap<>(MapConverters.toServiceQuery(query, objectMapper));
        Long userId = UserContext.getUserId();
        if (userId != null) {
            q.put("createBy", currentUserName());
        }
        Map<String, Object> raw = crudService.page(HrBenefitRequest.class, q);
        return MapConverters.toPageResult(raw, HrBenefitRequestVO.class, objectMapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String submitWorkflow(Long requestId) {
        HrBenefitRequest request = requestMapper.selectById(requestId);
        if (request == null) {
            throw new HrBusinessException("BENEFIT_REQUEST_NOT_FOUND", "福利申领不存在：" + requestId);
        }

        StateMachine<BenefitRequestStatus, BenefitRequestEvent> stateMachine = stateMachineRegistry.require("BenefitRequest");
        BenefitRequestStatus currentStatus = BenefitRequestStatus.valueOf(request.getStatus());
        BenefitRequestStatus newStatus = stateMachine.fire(currentStatus, BenefitRequestEvent.SUBMIT);

        UpdateWrapper<HrBenefitRequest> uw = new UpdateWrapper<>();
        uw.eq("id", requestId).eq("tenant_id", currentTenantId())
                .set("status", newStatus.name())
                .set("update_time", LocalDateTime.now());
        requestMapper.update(null, uw);
        HrBenefitRequestSubmittedEvent event = new HrBenefitRequestSubmittedEvent();
        event.setRequestId(requestId);
        event.setRequestNo(request.getRequestNo());
        event.setSubmittedAt(LocalDateTime.now());
        publishBenefitSubmittedEvent(request, event);
        return null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "取消福利申请", highRisk = true)
    public void cancelRequest(Long requestId, String reason) {
        HrBenefitRequest request = requestMapper.selectById(requestId);
        if (request == null) {
            throw new HrBusinessException("BENEFIT_REQUEST_NOT_FOUND", "福利申领不存在：" + requestId);
        }
        if (request.getEmployeeId() != null) {
            DataScopeUtils.assertOwnership(request.getEmployeeId(), "福利申请");
        }

        StateMachine<BenefitRequestStatus, BenefitRequestEvent> stateMachine = stateMachineRegistry.require("BenefitRequest");
        BenefitRequestStatus currentStatus = BenefitRequestStatus.valueOf(request.getStatus());
        BenefitRequestStatus newStatus = stateMachine.fire(currentStatus, BenefitRequestEvent.CANCEL);

        UpdateWrapper<HrBenefitRequest> uw = new UpdateWrapper<>();
        uw.eq("id", requestId).eq("tenant_id", currentTenantId())
                .set("status", newStatus.name())
                .set("update_time", LocalDateTime.now());
        requestMapper.update(null, uw);
    }

    public void startBenefitWorkflow(HrBenefitRequest request) {
        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(currentTenantId());
        dto.setProcessDefinitionKey(benefitProcessKey);
        dto.setBusinessType("HR_BENEFIT_REQUEST");
        dto.setBusinessId(request.getId());
        dto.setBusinessNo(request.getRequestNo());
        dto.setProcessTitle("福利申领-" + request.getRequestNo());
        dto.setStartUserId(request.getEmployeeId());
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("requestId", request.getId());
        vars.put("amount", request.getAmount());
        vars.put("pointAmount", request.getPointAmount());
        vars.put("requestType", request.getRequestType());
        dto.setVariables(vars);
        R<String> response = workflowServiceClient.startProcess(dto);
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String msg = response == null ? "Workflow service unavailable" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "福利申领审批启动失败：" + msg);
        }
        UpdateWrapper<HrBenefitRequest> uw = new UpdateWrapper<>();
        uw.eq("id", request.getId()).eq("tenant_id", currentTenantId())
                .set("process_instance_id", response.getData())
                .set("update_time", LocalDateTime.now());
        requestMapper.update(null, uw);
    }

    private void publishBenefitSubmittedEvent(HrBenefitRequest request, HrBenefitRequestSubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("HR_BENEFIT_REQUEST_SUBMITTED")
                    .sourceModule("cloudflow-hr")
                    .sourceId(request.getId())
                    .tenantId(request.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            throw new HrBusinessException("WORKFLOW_EVENT_PUBLISH_FAILED", "福利申领流程事件发布失败");
        }
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
