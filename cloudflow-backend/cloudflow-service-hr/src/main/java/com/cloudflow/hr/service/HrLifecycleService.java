package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload;
import com.cloudflow.hr.domain.dto.HrLifecycleStatusChangePayload;
import com.cloudflow.hr.domain.dto.HrLifecycleTaskPayload;
import com.cloudflow.hr.domain.dto.lifecycle.HrLifecycleCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrLifecycleApplication;
import com.cloudflow.hr.domain.entity.HrLifecycleDetail;
import com.cloudflow.hr.domain.entity.HrLifecycleTask;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.hr.domain.vo.lifecycle.HrLifecycleApplicationVO;
import com.cloudflow.hr.domain.vo.lifecycle.HrLifecycleDetailVO;
import com.cloudflow.hr.domain.vo.lifecycle.HrLifecycleTaskVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrLifecycleApplicationMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Locale;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class HrLifecycleService {

    private static final Set<String> RESIGNATION_EFFECTIVE_STATUSES = Set.of("EFFECTIVE", "COMPLETED");

    private final HrTypedCrudService crudService;
    private final HrViewSupport viewSupport;
    private final HrEventPublisher hrEventPublisher;
    private final AuthServiceClient authServiceClient;
    private final ObjectMapper objectMapper;
    private final IHrIntegrationQueryService employeeDirectory;
    private final HrLifecycleApplicationMapper applicationMapper;

    public List<HrLifecycleApplicationVO> listApplications(HrLifecycleCommonQueryDTO query) {
        Map<String, Object> raw = MapConverters.toServiceQuery(query, objectMapper);
        return crudService.list(HrLifecycleApplication.class, raw).stream()
                .map(this::enrichLifecycleApplication)
                .map(row -> objectMapper.convertValue(row, HrLifecycleApplicationVO.class))
                .toList();
    }

    public HrLifecycleApplicationVO getApplication(Long id) {
        return objectMapper.convertValue(enrichLifecycleApplication(requireApplication(id)), HrLifecycleApplicationVO.class);
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

    @Transactional(rollbackFor = Exception.class)
    public Long createApplication(HrLifecycleApplicationPayload payload) {
        return createApplication(payload, crudService.toMap(payload));
    }

    Long createApplication(HrLifecycleApplicationPayload payload, Map<String, Object> detailPayload) {
        Map<String, Object> normalized = normalizeLifecyclePayload(crudService.toMap(payload));
        Map<String, Object> detail = detailPayload(detailPayload);
        if (isResignation(normalized) && !"DRAFT".equals(normalized.get("status"))) {
            throw new HrBusinessException("离职申请须从草稿提交审批");
        }
        validateSuccessor(normalized, detail);
        Long id = crudService.create(HrLifecycleApplication.class, normalized);
        saveLifecycleDetail(id, String.valueOf(normalized.get("type")), detail);
        createLifecycleTasks(id, String.valueOf(normalized.get("type")), normalized);
        return id;
    }

    String nextApplicationNo() {
        return viewSupport.nextNo("HRLC");
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateApplication(Long id, HrLifecycleApplicationPayload payload) {
        Map<String, Object> current = lockApplication(id);
        Map<String, Object> patch = new LinkedHashMap<>(crudService.toMap(payload));
        patch.values().removeIf(Objects::isNull);
        Map<String, Object> detailPatch = detailPayload(patch);
        if (isResignation(current) || isResignation(patch)) {
            if (!isResignation(current) || !Set.of("DRAFT", "APPROVING", "APPROVED", "ACCEPTED", "REJECTED").contains(current.get("status"))) {
                throw new HrBusinessException("已生效离职申请不能修改，其他类型申请不能改为离职");
            }
            for (String property : List.of("type", "employeeId", "status")) {
                if (patch.containsKey(property) && !Objects.equals(String.valueOf(patch.get(property)), String.valueOf(current.get(property)))) {
                    throw new HrBusinessException("离职员工及申请类型不能替换，状态须通过审批操作变更");
                }
            }
            if (detailPatch.containsKey("successorUserId") && payload.getVersion() == null) {
                throw new HrBusinessException("变更接任人须提供当前申请版本，请刷新后重试");
            }
        }
        if (payload.getVersion() != null && !Objects.equals(payload.getVersion(), current.get("version"))) {
            throw new HrBusinessException("申请已被修改，请刷新后重试；未保存输入仍保留");
        }
        Map<String, Object> detail = new LinkedHashMap<>(readLifecycleDetail(id));
        detail.putAll(detailPatch);
        Map<String, Object> next = new LinkedHashMap<>(current);
        next.putAll(patch);
        validateSuccessor(next, detail);
        if (isResignation(next)) {
            patch.put("deptId", next.get("deptId"));
            patch.put("name", next.get("name"));
        }
        crudService.updateProperties(HrLifecycleApplication.class, id, patch);
        saveLifecycleDetail(id, String.valueOf(current.get("type")), detail);
    }

    @Transactional(rollbackFor = Exception.class)
    public void changeLifecycleStatus(Long id, String action, HrLifecycleStatusChangePayload payload) {
        Map<String, Object> application = lockApplication(id);
        if (isResignation(application)) {
            String status = String.valueOf(application.get("status"));
            String operation = String.valueOf(action).toLowerCase(Locale.ROOT);
            if (RESIGNATION_EFFECTIVE_STATUSES.contains(status) && Set.of("complete", "effective").contains(operation)) return;
            Set<String> allowed = switch (operation) {
                case "submit" -> Set.of("DRAFT");
                case "approve", "reject" -> Set.of("APPROVING");
                case "complete", "effective" -> Set.of("APPROVED", "ACCEPTED");
                case "cancel" -> Set.of("DRAFT", "APPROVING", "APPROVED", "REJECTED");
                default -> Set.of();
            };
            if (!allowed.contains(status)) throw new HrBusinessException("当前离职申请状态不允许此操作");
            if (Set.of("complete", "effective").contains(operation) && (payload == null || payload.getVersion() == null)) {
                throw new HrBusinessException("完成离职须提供当前申请版本，请刷新并核对接任人后重试");
            }
            if (payload != null && payload.getVersion() != null && !Objects.equals(payload.getVersion(), application.get("version"))) {
                throw new HrBusinessException("申请已被修改，请刷新并核对接任人后重试");
            }
            if (Set.of("submit", "approve", "complete", "effective").contains(operation)) {
                Map<String, Object> detail = new LinkedHashMap<>(readLifecycleDetail(id));
                validateSuccessor(application, detail);
                saveLifecycleDetail(id, "RESIGNATION", detail);
            }
            if (Set.of("complete", "effective").contains(operation) && crudService.list(HrLifecycleTask.class, Map.of("applicationId", id)).stream()
                    .anyMatch(task -> !"COMPLETED".equals(task.get("status")))) {
                throw new HrBusinessException("请先完成全部离职交接任务");
            }
        }
        crudService.changeStatus(HrLifecycleApplication.class, id, action);
        if (payload != null) {
            Map<String, Object> patch = crudService.toMap(payload);
            patch.remove("version");
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
        requireApplication(applicationId);
        return crudService.list(HrLifecycleDetail.class, Map.of("applicationId", applicationId)).stream()
                .map(row -> objectMapper.convertValue(row, HrLifecycleDetailVO.class))
                .toList();
    }

    public List<HrLifecycleTaskVO> listTasks(Long applicationId) {
        requireApplication(applicationId);
        return crudService.list(HrLifecycleTask.class, Map.of("applicationId", applicationId)).stream()
                .map(row -> objectMapper.convertValue(row, HrLifecycleTaskVO.class))
                .toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public void completeTask(Long id, HrLifecycleTaskPayload payload) {
        Map<String, Object> task = crudService.get(HrLifecycleTask.class, id);
        if (task.isEmpty()) throw new HrBusinessException("交接任务不存在或无权访问");
        Map<String, Object> application = lockApplication(viewSupport.toLong(task.get("applicationId")));
        task = crudService.get(HrLifecycleTask.class, id);
        if ("COMPLETED".equals(task.get("status"))) return;
        if (isResignation(application) && !Set.of("APPROVED", "ACCEPTED").contains(application.get("status"))) {
            throw new HrBusinessException("离职申请通过审批后才能确认交接任务");
        }
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
        Map<String, Object> result = new LinkedHashMap<>(readLifecycleDetail(viewSupport.toLong(row.get("id"))));
        row.forEach((key, value) -> {
            if (!Set.of("successorUserId", "detailJson").contains(key)) result.put(key, value);
        });
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
        if (applicationMapper.lockEmployee(currentTenantId(), employeeId) == null) {
            throw new HrBusinessException("离职员工档案不存在，请核对当前申请后重试");
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
        Map<String, Object> detail = readLifecycleDetail(applicationId);
        Long successorUserId = resolveSuccessorUserId(detail);
        LocalDate resignDate = objectMapper.convertValue(application.get("effectiveDate"), LocalDate.class);
        if (employee.isEmpty() || resignDate == null) {
            throw new HrBusinessException("离职员工档案或生效日期不完整，请核对当前申请后重试");
        }
        Map<String, Object> resignation = new LinkedHashMap<>();
        resignation.put("employeeStatus", "RESIGNED");
        resignation.put("resignDate", resignDate);
        crudService.updateProperties(HrEmployee.class, employeeId, resignation);
        disableAuthUserIfPresent(userId);
        hrEventPublisher.publishEmployeeLeft(employeeId, userId, employeeName, deptId, deptName, successorUserId);
    }

    private void disableAuthUserIfPresent(Long userId) {
        if (userId == null) {
            return;
        }
        R<Void> result = authServiceClient.disableUser(userId);
        if (result == null || !result.isSuccess()) {
            throw new HrBusinessException("账号停用结果尚未确认，离职尚未完成；请核对账号状态后重试当前申请");
        }
    }

    private Long resolveSuccessorUserId(Map<String, Object> detail) {
        Object value = detail.get("successorUserId");
        if (value == null || "".equals(value)) return null;
        Long userId = viewSupport.toLong(value);
        if (userId == null || userId <= 0) throw new HrBusinessException("接任人须为有效用户编号");
        return userId;
    }

    private Map<String, Object> detailPayload(Map<String, Object> payload) {
        Object nested = payload.get("detailJson");
        if (nested != null && !(nested instanceof Map<?, ?>) && !(nested instanceof com.fasterxml.jackson.databind.JsonNode node && node.isObject())) {
            throw new HrBusinessException("申请明细须为对象");
        }
        Map<String, Object> detail = new LinkedHashMap<>(viewSupport.parseJsonObject(nested));
        if (payload.get("successorUserId") != null && detail.containsKey("successorUserId")
                && !Objects.equals(resolveSuccessorUserId(payload), resolveSuccessorUserId(detail))) {
            throw new HrBusinessException("接任人字段不一致，请重新选择");
        }
        payload.forEach((key, value) -> {
            if (!"detailJson".equals(key) && value != null) detail.put(key, value);
        });
        return detail;
    }

    private void validateSuccessor(Map<String, Object> application, Map<String, Object> detail) {
        Long successorUserId = resolveSuccessorUserId(detail);
        detail.remove("successorName");
        if (!isResignation(application)) {
            if (successorUserId != null) throw new HrBusinessException("只有离职申请可以指定客户业务接任人");
            return;
        }
        Long employeeId = viewSupport.toLong(application.get("employeeId"));
        Map<String, Object> employee = employeeId == null ? Map.of() : crudService.get(HrEmployee.class, employeeId);
        if (employee.isEmpty()) throw new HrBusinessException("离职员工不存在或无权访问");
        application.put("deptId", employee.get("deptId"));
        application.put("name", employee.get("name"));
        if (successorUserId == null) return;
        Long userId = viewSupport.toLong(employee.get("userId"));
        if (userId == null) throw new HrBusinessException("离职员工尚未关联账号，无法指定客户业务接任人");
        if (Objects.equals(successorUserId, userId)) throw new HrBusinessException("接任人不能与离职员工为同一人");
        List<HrEmployeeSummaryVO> candidates = employeeDirectory.listEmployeesByUserIds(List.of(successorUserId));
        if (candidates == null || candidates.size() != 1) throw new HrBusinessException("接任人须为本租户有效在职员工");
        HrEmployeeSummaryVO successor = candidates.get(0);
        if (successor == null || !Objects.equals(successor.getTenantId(), currentTenantId())
                || !Objects.equals(successor.getUserId(), successorUserId) || successor.getEmployeeId() == null
                || successor.getEmployeeId() <= 0 || successor.getDeptId() == null || successor.getDeptId() <= 0
                || !org.springframework.util.StringUtils.hasText(successor.getEmployeeName())
                || !successor.isActive() || !successor.isUserEnabled() || !successor.isDepartmentEnabled()) {
            throw new HrBusinessException("接任人须为本租户在职员工，且账号和部门均启用");
        }
        detail.put("successorUserId", successorUserId);
        detail.put("successorName", successor.getEmployeeName());
    }

    private boolean isResignation(Map<String, Object> application) {
        return "RESIGNATION".equalsIgnoreCase(String.valueOf(application.get("type")));
    }

    private Map<String, Object> requireApplication(Long id) {
        Map<String, Object> application = id == null ? Map.of() : crudService.get(HrLifecycleApplication.class, id);
        if (application.isEmpty()) throw new HrBusinessException("申请不存在或无权访问");
        return application;
    }

    private Map<String, Object> lockApplication(Long id) {
        requireApplication(id);
        HrLifecycleApplication application = applicationMapper.lockForUpdate(currentTenantId(), id);
        if (application == null) throw new HrBusinessException("申请不存在或无权访问");
        return crudService.toMap(application);
    }

    private Long currentTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) tenantId = UserContext.getTenantId();
        if (tenantId == null || tenantId <= 0) throw new HrBusinessException("离职交接缺少租户上下文");
        return tenantId;
    }
}
