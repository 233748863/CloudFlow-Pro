package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
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
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class HrEmployeeOnboardingService {

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

    @Transactional(rollbackFor = Exception.class)
    public HrEmployeeOnboardingResultVO submit(HrEmployeePayload payload) {
        normalizeAndValidate(payload);
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

        Map<String, Object> employeeDetail = new LinkedHashMap<>(crudService.toMap(payload));
        employeeDetail.put(EMPLOYEE_CREATION_SOURCE_FIELD, EMPLOYEE_CREATION_SOURCE_VALUE);
        viewSupport.putDeptName(employeeDetail);
        viewSupport.putPostName(employeeDetail);
        viewSupport.putPositionSnapshot(employeeDetail);
        Long applicationId = lifecycleService.createApplication(application, employeeDetail);
        String processInstanceId = startWorkflow(applicationId, application, payload, employeeDetail);
        crudService.updateProperties(HrLifecycleApplication.class, applicationId,
                Map.of("processInstanceId", processInstanceId));
        return new HrEmployeeOnboardingResultVO(
                applicationId, application.getApplicationNo(), processInstanceId);
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

    private String startWorkflow(Long applicationId,
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

        R<String> response = workflowServiceClient.startProcess(dto);
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String message = response == null ? "Workflow 服务无响应" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "员工入职审批启动失败：" + message);
        }
        return response.getData();
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
        return lifecycleDetailMapper.selectOne(
                new QueryWrapper<HrLifecycleDetail>()
                        .eq("tenant_id", currentTenantId())
                        .eq("application_id", applicationId)
                        .eq("detail_type", "ONBOARDING")
                        .last("LIMIT 1"));
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
            HrLifecycleDetail detail = lifecycleDetailMapper.selectOne(
                    new QueryWrapper<HrLifecycleDetail>()
                            .eq("tenant_id", tenantId)
                            .eq("application_id", application.getId())
                            .eq("detail_type", "ONBOARDING")
                            .last("LIMIT 1"));
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
