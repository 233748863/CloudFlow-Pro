package com.cloudflow.hr.service;

import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload;
import com.cloudflow.hr.domain.dto.HrLifecycleStatusChangePayload;
import com.cloudflow.hr.domain.dto.HrLifecycleTaskPayload;
import com.cloudflow.hr.domain.dto.lifecycle.HrLifecycleCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrLifecycleApplication;
import com.cloudflow.hr.domain.entity.HrLifecycleDetail;
import com.cloudflow.hr.domain.entity.HrLifecycleTask;
import com.cloudflow.hr.domain.vo.lifecycle.HrLifecycleApplicationVO;
import com.cloudflow.hr.domain.vo.lifecycle.HrLifecycleDetailVO;
import com.cloudflow.hr.domain.vo.lifecycle.HrLifecycleTaskVO;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class HrLifecycleService {

    private static final Set<String> RESIGNATION_EFFECTIVE_STATUSES = Set.of("EFFECTIVE", "COMPLETED");

    private final HrTypedCrudService crudService;
    private final HrViewSupport viewSupport;
    private final HrEventPublisher hrEventPublisher;
    private final ObjectMapper objectMapper;

    public List<HrLifecycleApplicationVO> listApplications(HrLifecycleCommonQueryDTO query) {
        Map<String, Object> raw = MapConverters.toServiceQuery(query, objectMapper);
        return crudService.list(HrLifecycleApplication.class, raw).stream()
                .map(this::enrichLifecycleApplication)
                .map(row -> objectMapper.convertValue(row, HrLifecycleApplicationVO.class))
                .toList();
    }

    /**
     * 按候选人 + 类型查询首条生命周期申请 ID（HR 招聘 Offer → 入职转换内部使用）。
     */
    public Long findApplicationIdByCandidate(Long candidateId, String type) {
        if (candidateId == null) {
            return null;
        }
        List<Map<String, Object>> existed = crudService.list(HrLifecycleApplication.class,
                Map.of("type", type, "candidateId", candidateId));
        if (existed.isEmpty()) {
            return null;
        }
        return viewSupport.toLong(existed.get(0).get("id"));
    }

    public Long createApplication(HrLifecycleApplicationPayload payload) {
        Map<String, Object> normalized = normalizeLifecyclePayload(crudService.toMap(payload));
        Long id = crudService.create(HrLifecycleApplication.class, normalized);
        saveLifecycleDetail(id, String.valueOf(normalized.get("type")), crudService.toMap(payload));
        createLifecycleTasks(id, String.valueOf(normalized.get("type")), normalized);
        return id;
    }

    public void updateApplication(Long id, HrLifecycleApplicationPayload payload) {
        Map<String, Object> normalized = normalizeLifecyclePayload(crudService.toMap(payload));
        crudService.updateProperties(HrLifecycleApplication.class, id, normalized);
        Map<String, Object> current = crudService.get(HrLifecycleApplication.class, id);
        saveLifecycleDetail(id, String.valueOf(viewSupport.firstValue(current, "type")), crudService.toMap(payload));
    }

    public void changeLifecycleStatus(Long id, String action, HrLifecycleStatusChangePayload payload) {
        crudService.changeStatus(HrLifecycleApplication.class, id, action);
        if (payload != null) {
            Map<String, Object> patch = crudService.toMap(payload);
            patch.values().removeIf(java.util.Objects::isNull);
            if (!patch.isEmpty()) {
                Map<String, Object> current = enrichLifecycleApplication(crudService.get(HrLifecycleApplication.class, id));
                Map<String, Object> detail = new LinkedHashMap<>(current);
                detail.putAll(patch);
                Object confirmDate = viewSupport.firstValue(patch, "confirmDate", "actualDate");
                if (confirmDate != null) {
                    detail.put("actualDate", confirmDate);
                }
                saveLifecycleDetail(id, String.valueOf(current.get("type")), detail);
            }
        }
        maybePublishEmployeeLeftEvent(id);
    }

    public List<HrLifecycleDetailVO> listDetails(Long applicationId) {
        return crudService.list(HrLifecycleDetail.class, Map.of("applicationId", applicationId)).stream()
                .map(row -> objectMapper.convertValue(row, HrLifecycleDetailVO.class))
                .toList();
    }

    public List<HrLifecycleTaskVO> listTasks(Long applicationId) {
        return crudService.list(HrLifecycleTask.class, Map.of("applicationId", applicationId)).stream()
                .map(row -> objectMapper.convertValue(row, HrLifecycleTaskVO.class))
                .toList();
    }

    public void completeTask(Long id, HrLifecycleTaskPayload payload) {
        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put("status", "COMPLETED");
        updates.put("completedTime", LocalDateTime.now());
        if (payload != null && payload.getRemark() != null) {
            updates.put("remark", payload.getRemark());
        }
        crudService.updateProperties(HrLifecycleTask.class, id, updates);
    }

    private Map<String, Object> enrichLifecycleApplication(Map<String, Object> row) {
        if (row.isEmpty()) {
            return row;
        }
        Map<String, Object> result = new LinkedHashMap<>(row);
        result.putAll(readLifecycleDetail(viewSupport.toLong(row.get("id"))));
        result.put("expectedDate", viewSupport.firstValue(result, "expectedDate", "effectiveDate"));
        result.put("onboardDate", viewSupport.firstValue(result, "onboardDate", "effectiveDate"));
        viewSupport.putStatusDesc(result);
        viewSupport.putDeptName(result);
        viewSupport.putPostName(result);
        viewSupport.putPositionSnapshot(result);
        Object name = result.get("name");
        if (name == null || !org.springframework.util.StringUtils.hasText(String.valueOf(name))) {
            Long employeeId = viewSupport.toLong(result.get("employeeId"));
            if (employeeId != null) {
                Map<String, Object> employee = crudService.get(HrEmployee.class, employeeId);
                result.put("name", employee.get("name"));
                result.putIfAbsent("employeeName", employee.get("name"));
            }
        }
        return result;
    }

    private Map<String, Object> normalizeLifecyclePayload(Map<String, Object> payload) {
        Map<String, Object> result = new LinkedHashMap<>(payload);
        Object applicationNo = viewSupport.firstValue(result, "applicationNo", "application_no");
        result.put("applicationNo", applicationNo == null ? viewSupport.nextNo("HRLC") : applicationNo);
        Object effectiveDate = viewSupport.firstValue(result, "effectiveDate", "expectedDate", "onboardDate", "actualDate");
        if (effectiveDate instanceof LocalDate localDate) {
            result.put("effectiveDate", localDate);
        }
        Object status = viewSupport.firstValue(result, "status");
        result.put("status", status == null ? "DRAFT" : status);
        return result;
    }

    private void saveLifecycleDetail(Long applicationId, String type, Map<String, Object> payload) {
        if (applicationId == null || payload == null || payload.isEmpty()) {
            return;
        }
        Map<String, Object> detail = new LinkedHashMap<>(payload);
        detail.put("applicationId", applicationId);
        detail.put("detailType", org.springframework.util.StringUtils.hasText(type) ? type : String.valueOf(detail.getOrDefault("type", "GENERAL")));
        Map<String, Object> detailJson = new LinkedHashMap<>(payload);
        detailJson.put("applicationId", applicationId);
        detail.put("detailJson", detailJson);
        List<Map<String, Object>> existed = crudService.list(HrLifecycleDetail.class, Map.of("applicationId", applicationId));
        if (existed.isEmpty()) {
            crudService.create(HrLifecycleDetail.class, detail);
        } else {
            crudService.updateProperties(HrLifecycleDetail.class, viewSupport.toLong(existed.get(0).get("id")), detail);
        }
    }

    private Map<String, Object> readLifecycleDetail(Long applicationId) {
        if (applicationId == null) {
            return Map.of();
        }
        List<Map<String, Object>> rows = crudService.list(HrLifecycleDetail.class, Map.of("applicationId", applicationId));
        if (rows.isEmpty()) {
            return Map.of();
        }
        return viewSupport.parseJsonObject(rows.get(0).get("detailJson"));
    }

    private void createLifecycleTasks(Long applicationId, String type, Map<String, Object> payload) {
        if (applicationId == null || !crudService.list(HrLifecycleTask.class, Map.of("applicationId", applicationId)).isEmpty()) {
            return;
        }
        if ("ONBOARDING".equalsIgnoreCase(type)) {
            createLifecycleTask(applicationId, "开通系统账号", "IT_ACCOUNT", payload);
            createLifecycleTask(applicationId, "准备入职资料", "DOCUMENT", payload);
        }
        if ("RESIGNATION".equalsIgnoreCase(type)) {
            createLifecycleTask(applicationId, "资产交接", "HANDOVER", payload);
        }
    }

    private void createLifecycleTask(Long applicationId, String taskName, String taskType, Map<String, Object> payload) {
        HrLifecycleTaskPayload task = new HrLifecycleTaskPayload();
        task.setApplicationId(applicationId);
        task.setTaskName(taskName);
        task.setTaskType(taskType);
        Object dueDate = viewSupport.firstValue(payload, "effectiveDate");
        if (dueDate instanceof LocalDate localDate) {
            task.setDueDate(localDate);
        }
        task.setStatus("PENDING");
        crudService.create(HrLifecycleTask.class, task);
    }

    private void maybePublishEmployeeLeftEvent(Long applicationId) {
        if (applicationId == null) {
            return;
        }
        Map<String, Object> application = crudService.get(HrLifecycleApplication.class, applicationId);
        if (application.isEmpty()) {
            return;
        }
        String type = String.valueOf(application.getOrDefault("type", ""));
        if (!"RESIGNATION".equalsIgnoreCase(type)) {
            return;
        }
        String status = String.valueOf(application.getOrDefault("status", "")).toUpperCase();
        if (!RESIGNATION_EFFECTIVE_STATUSES.contains(status)) {
            return;
        }
        Long employeeId = viewSupport.toLong(application.get("employeeId"));
        if (employeeId == null) {
            return;
        }
        Map<String, Object> employee = crudService.get(HrEmployee.class, employeeId);
        Long userId = viewSupport.toLong(employee.get("userId"));
        String employeeName = String.valueOf(employee.getOrDefault("name", application.getOrDefault("name", "")));
        Long deptId = viewSupport.toLong(viewSupport.firstValue(employee, "deptId"));
        if (deptId == null) {
            deptId = viewSupport.toLong(application.get("deptId"));
        }
        String deptName = employee.get("deptName") != null
                ? String.valueOf(employee.get("deptName"))
                : (application.get("deptName") != null ? String.valueOf(application.get("deptName")) : null);
        hrEventPublisher.publishEmployeeLeft(employeeId, userId, employeeName, deptId, deptName);
    }
}
