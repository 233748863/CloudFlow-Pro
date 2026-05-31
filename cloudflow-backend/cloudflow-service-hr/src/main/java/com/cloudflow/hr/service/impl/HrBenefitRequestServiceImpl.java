package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.benefit.HrBenefitRequestDTO;
import com.cloudflow.hr.domain.dto.benefit.HrBenefitRequestQueryDTO;
import com.cloudflow.hr.domain.entity.HrBenefitRequest;
import com.cloudflow.hr.domain.vo.benefit.HrBenefitRequestVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrBenefitRequestMapper;
import com.cloudflow.hr.service.IHrBenefitRequestService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.statemachine.core.StateMachine;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.hr.enums.BenefitRequestStatus;
import com.cloudflow.hr.enums.BenefitRequestEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

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
    @Audit(name = "更新福利申请")
    public void updateRequest(Long requestId, HrBenefitRequestDTO dto) {
        // M1-4: 所有权校验
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

        // M1-6: 使用状态机进行状态转换（提交前验证状态）
        StateMachine<BenefitRequestStatus, BenefitRequestEvent> stateMachine = stateMachineRegistry.require("BenefitRequest");
        BenefitRequestStatus currentStatus = BenefitRequestStatus.valueOf(request.getStatus());
        BenefitRequestStatus newStatus = stateMachine.fire(currentStatus, BenefitRequestEvent.SUBMIT);

        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(currentTenantId());
        dto.setProcessDefinitionKey(benefitProcessKey);
        dto.setBusinessType("HR_BENEFIT_REQUEST");
        dto.setBusinessId(requestId);
        dto.setBusinessNo(request.getRequestNo());
        dto.setProcessTitle("福利申领-" + request.getRequestNo());
        dto.setStartUserId(UserContext.getUserId());
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("requestId", requestId);
        vars.put("amount", request.getAmount());
        vars.put("pointAmount", request.getPointAmount());
        vars.put("requestType", request.getRequestType());
        dto.setVariables(vars);
        R<String> response = workflowServiceClient.startProcess(dto);
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String msg = response == null ? "Workflow 服务无响应" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "福利申领审批启动失败：" + msg);
        }
        UpdateWrapper<HrBenefitRequest> uw = new UpdateWrapper<>();
        uw.eq("id", requestId).eq("tenant_id", currentTenantId())
                .set("process_instance_id", response.getData())
                .set("status", newStatus.name())
                .set("update_time", LocalDateTime.now());
        requestMapper.update(null, uw);
        return response.getData();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancelRequest(Long requestId, String reason) {
        HrBenefitRequest request = requestMapper.selectById(requestId);
        if (request == null) {
            throw new HrBusinessException("BENEFIT_REQUEST_NOT_FOUND", "福利申领不存在：" + requestId);
        }
        // M1-4: 所有权校验
        if (request.getEmployeeId() != null) {
            DataScopeUtils.assertOwnership(request.getEmployeeId(), "福利申请");
        }

        // M1-6: 使用状态机进行状态转换
        StateMachine<BenefitRequestStatus, BenefitRequestEvent> stateMachine = stateMachineRegistry.require("BenefitRequest");
        BenefitRequestStatus currentStatus = BenefitRequestStatus.valueOf(request.getStatus());
        BenefitRequestStatus newStatus = stateMachine.fire(currentStatus, BenefitRequestEvent.CANCEL);

        UpdateWrapper<HrBenefitRequest> uw = new UpdateWrapper<>();
        uw.eq("id", requestId).eq("tenant_id", currentTenantId())
                .set("status", newStatus.name())
                .set("update_time", LocalDateTime.now());
        requestMapper.update(null, uw);
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
