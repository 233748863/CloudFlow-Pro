package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryContext;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.config.SysConfigKeys;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.HrEmployeePayload;
import com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrLifecycleApplication;
import com.cloudflow.hr.domain.entity.HrLifecycleDetail;
import com.cloudflow.hr.domain.vo.employee.HrEmployeeOnboardingResultVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrLifecycleApplicationMapper;
import com.cloudflow.hr.mapper.HrLifecycleDetailMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrEmployeeOnboardingService {

    public static final String SUBMITTED_EVENT = "HR_EMPLOYEE_ONBOARDING_SUBMITTED";

    private static final long DEFAULT_TENANT_ID = 100000L;
    private static final String DEFAULT_PROCESS_KEY = "onboarding_approval";
    private static final String EMPLOYEE_CREATION_SOURCE_FIELD = "employeeCreationSource";
    private static final String EMPLOYEE_CREATION_SOURCE_VALUE = "EMPLOYEE_DIALOG_WORKFLOW";
    private static final Set<String> ACTIVE_APPLICATION_STATUSES = Set.of("DRAFT", "APPROVING", "APPROVED");

    private final HrLifecycleService lifecycleService;
    private final HrViewSupport viewSupport;
    private final HrTypedCrudService crudService;
    private final WorkflowServiceClient workflowServiceClient;
    private final RuntimeSysConfigService runtimeSysConfigService;
    private final HrEmployeeMapper employeeMapper;
    private final HrLifecycleApplicationMapper lifecycleApplicationMapper;
    private final HrLifecycleDetailMapper lifecycleDetailMapper;
    private final ObjectMapper objectMapper;
    private final PlatformTransactionManager transactionManager;
    private final OutboxPublisher outboxPublisher;

    public HrEmployeeOnboardingResultVO submit(HrEmployeePayload payload) {
        normalizeAndValidate(payload);
        ProcessStartDTO request = Objects.requireNonNull(localTransaction().execute(status -> prepareApplication(payload)));
        String processInstanceId;
        try {
            processInstanceId = startPersistedWorkflow(request);
        } catch (RuntimeException failure) {
            log.warn("入职审批启动或回填未完成，保留已保存申请等待重试，applicationId={}, failureType={}",
                    request.getBusinessId(), failure.getClass().getSimpleName());
            throw new HrBusinessException("WORKFLOW_START_FAILED",
                    "入职申请 [" + request.getBusinessNo() + "] 已保存，审批启动暂未完成，系统已登记重试，请勿重复提交", failure);
        }
        if (!StringUtils.hasText(processInstanceId)) {
            throw new HrBusinessException("ONBOARDING_NOT_PENDING", "入职申请已结束或撤销，无法启动审批");
        }
        return new HrEmployeeOnboardingResultVO(request.getBusinessId(), request.getBusinessNo(), processInstanceId);
    }

    public String startPersistedWorkflow(ProcessStartDTO request) {
        TransactionTemplate withoutTransaction = new TransactionTemplate(transactionManager);
        withoutTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
        return withoutTransaction.execute(status -> performWorkflowStart(request));
    }

    private ProcessStartDTO prepareApplication(HrEmployeePayload payload) {
        assertEmployeeNoAvailable(payload.getEmployeeNo(), null);

        HrLifecycleApplicationPayload application = new HrLifecycleApplicationPayload();
        application.setApplicationNo(lifecycleService.nextApplicationNo());
        application.setType("ONBOARDING");
        application.setName(payload.getName());
        application.setDeptId(payload.getDeptId());
        application.setPostId(payload.getPostId());
        application.setPositionId(payload.getPositionId());
        application.setEffectiveDate(payload.getHireDate());
        application.setStatus("APPROVING");

        Map<String, Object> employeeDetail = new LinkedHashMap<>(crudService.toInternalMap(payload));
        employeeDetail.put(EMPLOYEE_CREATION_SOURCE_FIELD, EMPLOYEE_CREATION_SOURCE_VALUE);
        viewSupport.putDeptName(employeeDetail);
        viewSupport.putPostName(employeeDetail);
        viewSupport.putPositionSnapshot(employeeDetail);
        Long applicationId = lifecycleService.createApplication(application, employeeDetail);
        ProcessStartDTO request = createWorkflowRequest(applicationId, application, payload, employeeDetail);
        validateWorkflowRequest(request);
        try {
            outboxPublisher.publish(BusinessEventEnvelope.builder()
                    .eventType(SUBMITTED_EVENT)
                    .sourceModule("cloudflow-hr")
                    .sourceId(applicationId)
                    .tenantId(request.getTenantId())
                    .payload(objectMapper.writeValueAsString(request))
                    .build());
        } catch (JsonProcessingException failure) {
            throw new HrBusinessException("WORKFLOW_EVENT_PUBLISH_FAILED", "入职审批启动记录保存失败", failure);
        }
        return request;
    }

    @Transactional(rollbackFor = Exception.class)
    public Long createEmployeeFromApprovedApplication(Long applicationId) {
        HrLifecycleApplication application = lifecycleApplicationMapper.selectById(applicationId);
        if (application == null || !"ONBOARDING".equalsIgnoreCase(application.getType())) {
            throw new HrBusinessException("ONBOARDING_NOT_FOUND", "入职申请不存在：" + applicationId);
        }
        if (application.getEmployeeId() != null) {
            return application.getEmployeeId();
        }

        HrEmployeePayload payload = readEmployeePayload(applicationId);
        normalizeAndValidate(payload);
        assertEmployeeNoAvailable(payload.getEmployeeNo(), applicationId);

        try {
            Long employeeId = crudService.create(HrEmployee.class, payload);
            crudService.updateProperties(HrLifecycleApplication.class, applicationId,
                    Map.of("employeeId", employeeId));
            return employeeId;
        } catch (DuplicateKeyException ex) {
            throw HrBusinessException.duplicateEmployeeNo(payload.getEmployeeNo());
        }
    }

    public boolean isEmployeeCreationRequest(Long applicationId) {
        HrLifecycleDetail detail = findOnboardingDetail(applicationId);
        return detail != null
                && detail.getDetailJson() != null
                && EMPLOYEE_CREATION_SOURCE_VALUE.equals(
                        detail.getDetailJson().path(EMPLOYEE_CREATION_SOURCE_FIELD).asText());
    }

    private ProcessStartDTO createWorkflowRequest(Long applicationId,
                                                  HrLifecycleApplicationPayload application,
                                                  HrEmployeePayload employee,
                                                  Map<String, Object> employeeDetail) {
        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(currentTenantId());
        dto.setProcessDefinitionKey(runtimeSysConfigService.getString(
                SysConfigKeys.HR_ONBOARDING_PROCESS_KEY, DEFAULT_PROCESS_KEY));
        dto.setBusinessType("ONBOARDING");
        dto.setBusinessId(applicationId);
        dto.setBusinessNo(application.getApplicationNo());
        dto.setProcessTitle("员工入职审批-" + employee.getName());
        dto.setStartUserId(UserContext.getUserId());

        Map<String, Object> variables = new LinkedHashMap<>();
        variables.put("applicationId", applicationId);
        variables.put("employeeNo", employee.getEmployeeNo());
        variables.put("employeeName", employee.getName());
        variables.put("deptId", employee.getDeptId());
        variables.put("deptName", employeeDetail.get("deptName"));
        variables.put("postId", employee.getPostId());
        variables.put("postName", employeeDetail.get("postName"));
        variables.put("positionId", employee.getPositionId());
        variables.put("positionName", employeeDetail.get("positionName"));
        variables.put("employeeType", employee.getEmployeeType());
        variables.put("employeeStatus", employee.getEmployeeStatus());
        variables.put("onboardDate", employee.getHireDate());
        variables.put("remark", application.getRemark());
        dto.setVariables(variables);
        return dto;
    }

    private String performWorkflowStart(ProcessStartDTO request) {
        validateWorkflowRequest(request);
        HrLifecycleApplication application = loadWorkflowApplication(request);
        if (application == null) {
            return null;
        }
        if (StringUtils.hasText(application.getProcessInstanceId())) {
            return application.getProcessInstanceId();
        }
        if (!"APPROVING".equals(application.getStatus())) {
            return null;
        }
        AtomicReference<R<String>> result = new AtomicReference<>();
        WorkflowFallbackRetryContext.runRetrying(() -> result.set(workflowServiceClient.startProcess(request)));
        R<String> response = result.get();
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String message = response == null ? "Workflow 服务无响应" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "员工入职审批启动失败：" + message);
        }
        String processInstanceId = response.getData();
        localTransaction().executeWithoutResult(status -> {
            HrLifecycleApplication current = loadWorkflowApplication(request);
            if (current == null) {
                throw new HrBusinessException("ONBOARDING_NOT_FOUND", "入职申请不存在：" + request.getBusinessId());
            }
            if (StringUtils.hasText(current.getProcessInstanceId())) {
                if (!processInstanceId.equals(current.getProcessInstanceId())) {
                    throw new HrBusinessException("ONBOARDING_PROCESS_CONFLICT", "入职申请已关联其他审批流程");
                }
                return;
            }
            crudService.updateProperties(HrLifecycleApplication.class, request.getBusinessId(),
                    Map.of("processInstanceId", processInstanceId));
        });
        return processInstanceId;
    }

    private HrLifecycleApplication loadWorkflowApplication(ProcessStartDTO request) {
        HrLifecycleApplication application = lifecycleApplicationMapper.selectById(request.getBusinessId());
        if (application == null || Integer.valueOf(1).equals(application.getDeleted())) {
            return null;
        }
        if (!Objects.equals(request.getTenantId(), application.getTenantId())
                || !"ONBOARDING".equals(application.getType())
                || !Objects.equals(request.getBusinessNo(), application.getApplicationNo())
                || !isEmployeeCreationRequest(request.getBusinessId())) {
            throw new HrBusinessException("ONBOARDING_REQUEST_MISMATCH", "入职申请与审批启动记录不匹配");
        }
        return application;
    }

    private void validateWorkflowRequest(ProcessStartDTO request) {
        Long tenantId = TenantContext.getTenantId() != null ? TenantContext.getTenantId() : UserContext.getTenantId();
        if (request == null || request.getBusinessId() == null || request.getStartUserId() == null
                || !"ONBOARDING".equals(request.getBusinessType())
                || !StringUtils.hasText(request.getBusinessNo())
                || !StringUtils.hasText(request.getProcessDefinitionKey())
                || tenantId == null || !tenantId.equals(request.getTenantId())
                || (UserContext.getTenantId() != null && !tenantId.equals(UserContext.getTenantId()))) {
            throw new HrBusinessException("ONBOARDING_REQUEST_INVALID", "入职审批启动参数或租户上下文无效");
        }
    }

    private TransactionTemplate localTransaction() {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return transaction;
    }

    private HrEmployeePayload readEmployeePayload(Long applicationId) {
        HrLifecycleDetail detail = findOnboardingDetail(applicationId);
        if (detail == null || detail.getDetailJson() == null) {
            throw new HrBusinessException("ONBOARDING_DETAIL_MISSING", "入职申请缺少员工资料：" + applicationId);
        }
        ObjectNode employeeJson = detail.getDetailJson().deepCopy();
        employeeJson.remove(EMPLOYEE_CREATION_SOURCE_FIELD);
        employeeJson.remove("applicationId");
        return objectMapper.convertValue(employeeJson, HrEmployeePayload.class);
    }

    private HrLifecycleDetail findOnboardingDetail(Long applicationId) {
        return lifecycleDetailMapper.selectOnboardingDetail(currentTenantId(), applicationId);
    }

    private void assertEmployeeNoAvailable(String employeeNo, Long currentApplicationId) {
        Long tenantId = currentTenantId();
        long employeeCount = employeeMapper.selectCount(new QueryWrapper<HrEmployee>()
                .eq("tenant_id", tenantId)
                .eq("employee_no", employeeNo)
                .eq("deleted", 0));
        if (employeeCount > 0) {
            throw HrBusinessException.duplicateEmployeeNo(employeeNo);
        }

        List<HrLifecycleApplication> applications = lifecycleApplicationMapper.selectList(
                new QueryWrapper<HrLifecycleApplication>()
                        .eq("tenant_id", tenantId)
                        .eq("type", "ONBOARDING")
                        .in("status", ACTIVE_APPLICATION_STATUSES)
                        .eq("deleted", 0));
        for (HrLifecycleApplication application : applications) {
            if (currentApplicationId != null && currentApplicationId.equals(application.getId())) {
                continue;
            }
            HrLifecycleDetail detail = findOnboardingDetail(application.getId());
            if (detail == null || detail.getDetailJson() == null) {
                continue;
            }
            String pendingEmployeeNo = detail.getDetailJson().path("employeeNo").asText("").trim();
            if (employeeNo.equalsIgnoreCase(pendingEmployeeNo)) {
                throw new HrBusinessException("DUPLICATE_ONBOARDING_EMPLOYEE_NO",
                        "工号 [" + employeeNo + "] 已存在未结束的入职审批");
            }
        }
    }

    private void normalizeAndValidate(HrEmployeePayload payload) {
        if (payload == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "员工资料不能为空");
        }
        payload.setEmployeeNo(trim(payload.getEmployeeNo()));
        payload.setName(trim(payload.getName()));
        payload.setPhone(trimToNull(payload.getPhone()));
        payload.setEmail(trimToNull(payload.getEmail()));
        if (!StringUtils.hasText(payload.getEmployeeNo())) {
            throw new HrBusinessException("INVALID_PARAMETER", "工号不能为空");
        }
        if (!StringUtils.hasText(payload.getName())) {
            throw new HrBusinessException("INVALID_PARAMETER", "姓名不能为空");
        }
        if (!"PENDING".equals(payload.getEmployeeStatus()) && payload.getHireDate() == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "待入职之外的员工状态必须填写入职日期");
        }
        LocalDate hireDate = payload.getHireDate();
        if (hireDate != null && payload.getRegularDate() != null && payload.getRegularDate().isBefore(hireDate)) {
            throw new HrBusinessException("INVALID_PARAMETER", "转正日期不能早于入职日期");
        }
        if (hireDate != null && payload.getResignDate() != null && payload.getResignDate().isBefore(hireDate)) {
            throw new HrBusinessException("INVALID_PARAMETER", "离职日期不能早于入职日期");
        }
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }

    private String trimToNull(String value) {
        String trimmed = trim(value);
        return StringUtils.hasText(trimmed) ? trimmed : null;
    }

    private Long currentTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        tenantId = UserContext.getTenantId();
        return tenantId == null ? DEFAULT_TENANT_ID : tenantId;
    }
}
