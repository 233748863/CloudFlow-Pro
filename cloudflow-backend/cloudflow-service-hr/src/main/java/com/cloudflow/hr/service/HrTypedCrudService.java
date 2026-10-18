package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.metadata.TableFieldInfo;
import com.baomidou.mybatisplus.core.metadata.TableInfo;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.HrAuditSnapshot;
import com.cloudflow.hr.domain.entity.HrCompGrade;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrPosition;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrCompGradeMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrPositionMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.beans.Introspector;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class HrTypedCrudService {

    private static final long DEFAULT_TENANT_ID = 100000L;
    /** 兜底默认值：HR 模块查询单页最大条数（实际值从 sys.hr.maxPageSize 读取） */
    private static final int DEFAULT_MAX_PAGE_SIZE = 500;
    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final Set<String> IGNORED_QUERY_KEYS = Set.of("pageNum", "pageSize", "current", "size", "keyword");
    // DTOs include nullable audit fields: clients must never erase the creator or override the updater.
    private static final Set<String> AUTO_PROPERTIES = Set.of("id", "tenantId", "createBy", "updateBy", "createTime", "updateTime", "deleted");
    private static final Set<String> HIGH_SENSITIVE_WRITE_TABLES = Set.of(
            "hr_payroll",
            "hr_employee_salary",
            "hr_salary_adjustment",
            "hr_performance_salary_adjustment",
            "hr_employee_comp",
            "hr_employee_benefit",
            "hr_tax_profile",
            "hr_tax_deduction",
            "hr_social_security",
            "hr_salary_grade",
            "hr_salary_structure",
            "hr_salary_structure_item",
            "hr_salary_item"
    );
    private static final Set<String> HIGH_SENSITIVE_ROLES = Set.of(
            "admin", "hr_admin", "hr_manager", "hr_specialist"
    );
    private static final Set<String> MASK_COLUMNS = Set.of(
            "id_card", "id_number", "id_card_no", "identity_card", "identity_no",
            "bank_account", "bank_card", "bank_no", "card_no", "account_no",
            "salary", "base_salary", "monthly_salary", "actual_salary",
            "min_salary", "max_salary", "mid_salary", "total_salary",
            "salary_min", "salary_max",
            "salary_amount", "gross_salary", "net_salary",
            "bonus", "subsidy", "performance_pay",
            "tax_amount", "social_security_amount", "housing_fund_amount",
            "phone", "mobile", "telephone", "contact_phone", "receiver_phone", "applicant_external_phone",
            "email", "contact_email",
            "home_address", "address", "receiver_address",
            "base_amount", "amount"
    );

    private final ApplicationContext applicationContext;
    private final ObjectMapper objectMapper;
    private final HrEmployeeMapper employeeMapper;
    private final HrPositionMapper positionMapper;
    private final HrCompGradeMapper compGradeMapper;
    private final HrAuditLogMapper auditLogMapper;
    private final HrAppraisalGuard appraisalGuard;
    private final HrRecruitmentIdentityService recruitmentIdentities;
    private final HrReferralProgressService referralProgress;
    private final com.cloudflow.common.redis.core.SysConfigHelper sysConfigHelper;
    private final HrGrievanceAccessService grievanceAccess;

    private int maxPageSize() {
        return sysConfigHelper.getConfigInt("sys.hr.maxPageSize", DEFAULT_MAX_PAGE_SIZE);
    }

    public <T> List<Map<String, Object>> list(Class<T> entityClass, Map<String, ?> query) {
        BaseMapper<T> mapper = mapper(entityClass);
        QueryWrapper<T> wrapper = buildQueryWrapper(entityClass, query, false);
        boolean privileged = isPrivilegedUser();
        return mapper.selectList(wrapper).stream()
                .map(this::toResponseMap)
                .map(row -> maskRow(row, privileged))
                .toList();
    }

    public <T> Map<String, Object> page(Class<T> entityClass, Map<String, ?> query) {
        return page(entityClass, query, wrapper -> { });
    }

    public <T> Map<String, Object> page(Class<T> entityClass, Map<String, ?> query,
                                       java.util.function.Consumer<QueryWrapper<T>> restriction) {
        BaseMapper<T> mapper = mapper(entityClass);
        QueryWrapper<T> wrapper = buildQueryWrapper(entityClass, query, false);
        restriction.accept(wrapper);
        int pageNum = Math.max(1, toInt(query.get("pageNum"), toInt(query.get("current"), 1)));
        int pageSize = Math.min(maxPageSize(), Math.max(1, toInt(query.get("pageSize"), toInt(query.get("size"), 50))));
        IPage<T> page = mapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
        boolean privileged = isPrivilegedUser();
        List<Map<String, Object>> records = page.getRecords().stream()
                .map(this::toResponseMap)
                .map(row -> maskRow(row, privileged))
                .toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("records", records);
        result.put("rows", records);
        result.put("total", page.getTotal());
        result.put("current", pageNum);
        result.put("size", pageSize);
        return result;
    }

    public <T> Map<String, Object> get(Class<T> entityClass, Long id) {
        BaseMapper<T> mapper = mapper(entityClass);
        TableInfo tableInfo = tableInfo(entityClass);
        QueryWrapper<T> wrapper = new QueryWrapper<>();
        wrapper.eq(tableInfo.getKeyColumn(), id);
        appendDeletedFilter(wrapper, tableInfo);
        appendDataScope(wrapper, tableInfo);
        T entity = mapper.selectOne(wrapper);
        if (entity == null) {
            return Map.of();
        }
        return maskRow(toResponseMap(entity), isPrivilegedUser());
    }

    @Audit(name = "HR记录创建",
            oldVal = "@hrTypedCrudService.emptySnapshot(#entityClass)",
            newVal = "@hrTypedCrudService.payloadSnapshot(#entityClass, #payload)")
    @Transactional(rollbackFor = Exception.class)
    public <T> Long create(Class<T> entityClass, Object payload) {
        assertHWrite(entityClass, null, payload);
        BaseMapper<T> mapper = mapper(entityClass);
        TableInfo tableInfo = tableInfo(entityClass);
        assertWriteAllowed(tableInfo.getTableName());
        T entity = objectMapper.convertValue(MessagePayloadCodec.internalTree(payload, objectMapper), entityClass);
        applyCompGradeAutoFill(entity, tableInfo);
        applyCreateDefaults(entity, tableInfo);
        verifyRecruitmentWrite(entity, null, null);
        if (entity instanceof HrCandidate candidate) {
            recruitmentIdentities.prepareCandidate(candidate, null);
            referralProgress.verifyCandidateWrite(candidate, null);
        }
        mapper.insert(entity);
        if (entity instanceof HrCandidate candidate) recruitmentIdentities.occupyCandidate(candidate);
        if (isRecruitmentProgress(entity)) referralProgress.recruitmentChanged(entity);
        Long createdId = extractId(entity, tableInfo);
        writeAuditLog(tableInfo.getTableName(), createdId, "CREATE", Map.of(), getAuditRow(entityClass, createdId));
        invalidateCalendarAssignments(entityClass);
        return createdId;
    }

    @Audit(name = "HR记录更新",
            oldVal = "@hrTypedCrudService.snapshot(#entityClass, #id)",
            newVal = "@hrTypedCrudService.snapshot(#entityClass, #id)")
    @Transactional(rollbackFor = Exception.class)
    public <T> void update(Class<T> entityClass, Long id, Object payload) {
        updateInternal(entityClass, id, payload, "UPDATE");
    }

    @Audit(name = "HR记录更新",
            oldVal = "@hrTypedCrudService.snapshot(#entityClass, #id)",
            newVal = "@hrTypedCrudService.snapshot(#entityClass, #id)")
    @Transactional(rollbackFor = Exception.class)
    public <T> void updateProperties(Class<T> entityClass, Long id, Map<String, Object> payload) {
        updateInternal(entityClass, id, payload, "UPDATE");
    }

    @Audit(name = "HR工作流回调状态变更",
            oldVal = "@hrTypedCrudService.snapshot(#entityClass, #id)",
            newVal = "@hrTypedCrudService.snapshot(#entityClass, #id)")
    @Transactional(rollbackFor = Exception.class)
    public <T> boolean updatePropertiesIfWorkflowInstanceMatches(Class<T> entityClass,
                                                                 Long id,
                                                                 String workflowInstanceId,
                                                                 Map<String, Object> payload,
                                                                 String... instanceProperties) {
        return updateInternal(entityClass, id, payload, "UPDATE", workflowInstanceId, instanceProperties);
    }

    @Audit(name = "HR工作流回调状态变更",
            oldVal = "@hrTypedCrudService.snapshot(#entityClass, #id)",
            newVal = "@hrTypedCrudService.snapshot(#entityClass, #id)")
    @Transactional(rollbackFor = Exception.class)
    public <T> boolean updatePropertiesIfWorkflowInstanceMatchesAndCurrentStatusIn(
            Class<T> entityClass,
            Long id,
            String workflowInstanceId,
            String statusProperty,
            Collection<String> allowedCurrentStatuses,
            Map<String, Object> payload,
            String... instanceProperties) {
        return updateInternal(entityClass, id, payload, "UPDATE", workflowInstanceId,
                statusProperty, allowedCurrentStatuses, instanceProperties);
    }

    @Audit(name = "HR记录删除",
            oldVal = "@hrTypedCrudService.snapshot(#entityClass, #id)",
            newVal = "@hrTypedCrudService.emptySnapshot(#entityClass)",
            highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public <T> void delete(Class<T> entityClass, Long id) {
        assertHWrite(entityClass, id, Map.of());
        BaseMapper<T> mapper = mapper(entityClass);
        TableInfo tableInfo = tableInfo(entityClass);
        assertWriteAllowed(tableInfo.getTableName());
        if (entityClass == HrCandidate.class) recruitmentIdentities.requireCandidate(id);
        T entity = mapper.selectById(id);
        if (entity == null) {
            return;
        }
        Map<String, Object> before = toResponseMap(entity);
        if (isImmutableSalarySlip(tableInfo.getTableName(), before)) {
            throw new HrBusinessException("SALARY_SLIP_IMMUTABLE",
                    "已归档或已发布工资条禁止删除，记录ID：" + id);
        }
        int affected;
        if (hasProperty(tableInfo, "deleted")) {
            setProperty(entity, "updateBy", currentUserName());
            if (tableInfo.isWithLogicDelete()) {
                UpdateWrapper<T> wrapper = new UpdateWrapper<>();
                wrapper.eq(tableInfo.getKeyColumn(), id);
                if (hasProperty(tableInfo, "tenantId")) {
                    wrapper.eq(columnOf(tableInfo, "tenantId"), currentTenantId());
                }
                wrapper.set(tableInfo.getLogicDeleteFieldInfo().getColumn(), tableInfo.getLogicDeleteFieldInfo().getLogicDeleteValue());
                affected = mapper.update(entity, wrapper);
            } else {
                setProperty(entity, "deleted", 1);
                affected = mapper.updateById(entity);
            }
        } else {
            affected = mapper.deleteById(id);
        }
        if (affected != 1) {
            throw HrHException.conflict("DELETE_CONFLICT", "记录已变化，删除未成功，请刷新后重试");
        }
        writeAuditLog(tableInfo.getTableName(), id, "DELETE", before, Map.of());
        invalidateCalendarAssignments(entityClass);
    }

    @Audit(name = "HR记录状态变更",
            oldVal = "@hrTypedCrudService.snapshot(#entityClass, #id)",
            newVal = "@hrTypedCrudService.snapshot(#entityClass, #id)")
    @Transactional(rollbackFor = Exception.class)
    public <T> void changeStatus(Class<T> entityClass, Long id, String action) {
        updateInternal(entityClass, id, Map.of("status", statusFromAction(action)), "STATUS");
    }

    private void invalidateCalendarAssignments(Class<?> entityClass) {
        if (List.of("hr_employee", "hr_shift", "hr_schedule_assignment").contains(tableInfo(entityClass).getTableName())) {
            applicationContext.getBean(HolidayCalendarService.class).invalidateAssignments();
        }
    }

    public <T> HrAuditSnapshot snapshot(Class<T> entityClass, Long id) {
        return new HrAuditSnapshot(tableInfo(entityClass).getTableName(), id, getAuditRow(entityClass, id));
    }

    public <T> HrAuditSnapshot payloadSnapshot(Class<T> entityClass, Object payload) {
        return new HrAuditSnapshot(tableInfo(entityClass).getTableName(), null, hAuditValues(tableInfo(entityClass).getTableName(), toMap(payload)));
    }

    public <T> HrAuditSnapshot emptySnapshot(Class<T> entityClass) {
        return new HrAuditSnapshot(tableInfo(entityClass).getTableName(), null, Map.of());
    }

    public String statusFromAction(String action) {
        return switch (String.valueOf(action).toLowerCase(Locale.ROOT)) {
            case "submit" -> "APPROVING";
            case "approve" -> "APPROVED";
            case "reject" -> "REJECTED";
            case "cancel" -> "CANCELLED";
            case "complete", "confirm", "convert-to-onboarding" -> "COMPLETED";
            case "effective" -> "EFFECTIVE";
            case "send" -> "SENT";
            case "accept" -> "ACCEPTED";
            default -> String.valueOf(action).toUpperCase(Locale.ROOT);
        };
    }

    public Map<String, Object> toMap(Object payload) {
        if (payload == null) {
            return Map.of();
        }
        if (payload instanceof Map<?, ?> rawMap) {
            Map<String, Object> result = new LinkedHashMap<>();
            rawMap.forEach((key, value) -> result.put(String.valueOf(key), value));
            return result;
        }
        return objectMapper.convertValue(payload, MAP_TYPE);
    }

    public Map<String, Object> toInternalMap(Object payload) {
        if (payload == null) return Map.of();
        return objectMapper.convertValue(MessagePayloadCodec.internalTree(payload, objectMapper), MAP_TYPE);
    }

    private <T> void updateInternal(Class<T> entityClass, Long id, Object payload, String operationType) {
        updateInternal(entityClass, id, payload, operationType, null);
    }

    private <T> boolean updateInternal(Class<T> entityClass,
                                       Long id,
                                       Object payload,
                                       String operationType,
                                       String workflowInstanceId,
                                       String... instanceProperties) {
        return updateInternal(entityClass, id, payload, operationType, workflowInstanceId,
                null, null, instanceProperties);
    }

    private <T> boolean updateInternal(Class<T> entityClass,
                                       Long id,
                                       Object payload,
                                       String operationType,
                                       String workflowInstanceId,
                                       String currentStatusProperty,
                                       Collection<String> allowedCurrentStatuses,
                                       String... instanceProperties) {
        assertHWrite(entityClass, id, payload);
        BaseMapper<T> mapper = mapper(entityClass);
        TableInfo tableInfo = tableInfo(entityClass);
        assertWriteAllowed(tableInfo.getTableName());
        HrCandidate previousCandidate = entityClass == HrCandidate.class ? objectMapper.convertValue(
                MessagePayloadCodec.internalTree(recruitmentIdentities.requireCandidate(id), objectMapper), HrCandidate.class) : null;
        T entity = mapper.selectById(id);
        if (entity == null) {
            return false;
        }
        Map<String, Object> before = toResponseMap(entity);
        if (isImmutableSalarySlip(tableInfo.getTableName(), before)) {
            throw new HrBusinessException("SALARY_SLIP_IMMUTABLE",
                    "已归档或已发布工资条禁止修改，记录ID：" + id);
        }
        Map<String, Object> payloadMap = toInternalMap(payload);
        if (payloadMap.isEmpty()) {
            return false;
        }
        String workflowInstanceProperty = resolveWorkflowInstanceProperty(tableInfo, instanceProperties);
        String normalizedStatusProperty = resolveCurrentStatusProperty(tableInfo, currentStatusProperty, allowedCurrentStatuses);
        Set<String> normalizedAllowedStatuses = normalizeStatuses(allowedCurrentStatuses);
        Set<String> nullColumns = new LinkedHashSet<>();
        applyPayload(entityClass, entity, payloadMap, tableInfo, nullColumns);
        verifyRecruitmentWrite(entity, before, workflowInstanceId);
        if (entity instanceof HrCandidate candidate) {
            referralProgress.verifyCandidateWrite(candidate, previousCandidate);
            recruitmentIdentities.prepareCandidate(candidate, previousCandidate);
            recruitmentIdentities.occupyCandidateHistory(candidate, previousCandidate);
            if (candidate.getPhone() == null) nullColumns.add("phone");
            if (candidate.getEmail() == null) nullColumns.add("email");
        }
        setProperty(entity, "updateBy", currentUserName());
        UpdateWrapper<T> wrapper = new UpdateWrapper<>();
        wrapper.eq(tableInfo.getKeyColumn(), id);
        if (hasProperty(tableInfo, "tenantId")) {
            wrapper.eq(columnOf(tableInfo, "tenantId"), currentTenantId());
        }
        if (StringUtils.hasText(workflowInstanceId)) {
            if (!StringUtils.hasText(workflowInstanceProperty)) {
                throw new IllegalStateException("HR表缺少流程实例字段：" + tableInfo.getTableName());
            }
            wrapper.eq(columnOf(tableInfo, workflowInstanceProperty), workflowInstanceId);
        }
        if (StringUtils.hasText(normalizedStatusProperty)) {
            wrapper.in(columnOf(tableInfo, normalizedStatusProperty), normalizedAllowedStatuses);
        }
        for (String nullColumn : nullColumns) {
            wrapper.set(nullColumn, null);
        }
        int updated = mapper.update(entity, wrapper);
        if (updated <= 0) {
            if (StringUtils.hasText(workflowInstanceId)) {
                T latest = mapper.selectById(id);
                Object currentInstanceId = latest == null ? null : getProperty(latest, workflowInstanceProperty);
                if (currentInstanceId == null || !StringUtils.hasText(String.valueOf(currentInstanceId))) {
                    throw new IllegalStateException("HR流程实例未回填，等待回调重试，businessId=" + id);
                }
                if (!Objects.equals(String.valueOf(currentInstanceId), workflowInstanceId)) {
                    return false;
                }
                if (StringUtils.hasText(normalizedStatusProperty)
                        && !statusAllowed(latest, normalizedStatusProperty, normalizedAllowedStatuses)) {
                    return false;
                }
                if (payloadAlreadyApplied(latest, payloadMap, tableInfo)) {
                    return false;
                }
            }
            throw new IllegalStateException("HR记录更新失败：" + tableInfo.getTableName() + "#" + id);
        }
        if (isRecruitmentProgress(entity)) referralProgress.recruitmentChanged(entity);
        writeAuditLog(tableInfo.getTableName(), id, operationType, before, getAuditRow(entityClass, id));
        invalidateCalendarAssignments(entityClass);
        return true;
    }

    private boolean isRecruitmentProgress(Object entity) {
        return entity instanceof HrCandidate || entity instanceof com.cloudflow.hr.domain.entity.HrInterview
                || entity instanceof com.cloudflow.hr.domain.entity.HrOffer;
    }

    private void verifyRecruitmentWrite(Object entity, Map<String, Object> previous, String workflowInstanceId) {
        if (entity instanceof com.cloudflow.hr.domain.entity.HrOffer offer) {
            if (previous == null && offer.getStatus() == null) offer.setStatus("DRAFT");
            if (!StringUtils.hasText(workflowInstanceId) && (offer.getProcessInstanceId() != null || !"DRAFT".equals(offer.getStatus())
                    || previous != null && !"DRAFT".equals(previous.get("status")))) throw HrHException.conflict("OFFER_WORKFLOW_REQUIRED", "录用仅允许编辑未提交的草稿，审批结果由真实流程回写");
            if (!StringUtils.hasText(workflowInstanceId)) recruitmentIdentities.requireCandidate(offer.getCandidateId());
        }
        if (entity instanceof com.cloudflow.hr.domain.entity.HrInterview interview) recruitmentIdentities.requireCandidate(interview.getCandidateId());
    }

    private String resolveCurrentStatusProperty(TableInfo tableInfo,
                                                String statusProperty,
                                                Collection<String> allowedCurrentStatuses) {
        if (!StringUtils.hasText(statusProperty) || allowedCurrentStatuses == null || allowedCurrentStatuses.isEmpty()) {
            return null;
        }
        String normalized = normalizeProperty(tableInfo, statusProperty);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalStateException("HR表缺少状态字段：" + tableInfo.getTableName() + "." + statusProperty);
        }
        return normalized;
    }

    private Set<String> normalizeStatuses(Collection<String> statuses) {
        if (statuses == null || statuses.isEmpty()) {
            return Set.of();
        }
        Set<String> normalized = new LinkedHashSet<>();
        for (String status : statuses) {
            if (StringUtils.hasText(status)) {
                normalized.add(status.trim().toUpperCase(Locale.ROOT));
            }
        }
        return normalized;
    }

    private boolean statusAllowed(Object entity, String statusProperty, Set<String> allowedStatuses) {
        if (entity == null || !StringUtils.hasText(statusProperty) || allowedStatuses == null || allowedStatuses.isEmpty()) {
            return false;
        }
        Object current = getProperty(entity, statusProperty);
        return current != null && allowedStatuses.contains(String.valueOf(current).trim().toUpperCase(Locale.ROOT));
    }

    private String resolveWorkflowInstanceProperty(TableInfo tableInfo, String... candidates) {
        if (candidates != null) {
            for (String candidate : candidates) {
                if (StringUtils.hasText(candidate) && hasProperty(tableInfo, candidate)) {
                    return candidate;
                }
            }
        }
        for (String candidate : List.of("processInstanceId", "instanceId")) {
            if (hasProperty(tableInfo, candidate)) {
                return candidate;
            }
        }
        return null;
    }

    private boolean payloadAlreadyApplied(Object latest, Map<String, Object> payloadMap, TableInfo tableInfo) {
        if (latest == null || payloadMap == null || payloadMap.isEmpty()) {
            return false;
        }
        for (Map.Entry<String, Object> entry : payloadMap.entrySet()) {
            String property = normalizeProperty(tableInfo, entry.getKey());
            if (property == null || AUTO_PROPERTIES.contains(property)) {
                continue;
            }
            Object current = getProperty(latest, property);
            Object expected = entry.getValue();
            if (!Objects.equals(String.valueOf(current), String.valueOf(expected))) {
                return false;
            }
        }
        return true;
    }

    private boolean isImmutableSalarySlip(String tableName, Map<String, Object> row) {
        if (!"hr_salary_slip".equals(tableName) || row == null) {
            return false;
        }
        Object status = row.get("status");
        return Objects.equals("ARCHIVED", status) || Objects.equals("RELEASED", status);
    }

    private <T> QueryWrapper<T> buildQueryWrapper(Class<T> entityClass, Map<String, ?> query, boolean includePagination) {
        TableInfo tableInfo = tableInfo(entityClass);
        QueryWrapper<T> wrapper = new QueryWrapper<>();
        appendDeletedFilter(wrapper, tableInfo);
        appendDataScope(wrapper, tableInfo);

        for (Map.Entry<String, ?> entry : query.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();
            if (IGNORED_QUERY_KEYS.contains(key) || value == null || !StringUtils.hasText(String.valueOf(value))) {
                continue;
            }
            String property = normalizeProperty(tableInfo, key);
            if (property == null) {
                continue;
            }
            wrapper.eq(columnOf(tableInfo, property), value);
        }

        Object keyword = query.get("keyword");
        if (keyword != null && StringUtils.hasText(String.valueOf(keyword))) {
            List<String> keywordColumns = keywordColumns(tableInfo);
            if (!keywordColumns.isEmpty()) {
                wrapper.and(item -> {
                    for (int i = 0; i < keywordColumns.size(); i++) {
                        item.like(keywordColumns.get(i), keyword);
                        if (i < keywordColumns.size() - 1) {
                            item.or();
                        }
                    }
                });
            }
        }

        appendOrder(wrapper, tableInfo);
        return wrapper;
    }

    private List<String> keywordColumns(TableInfo tableInfo) {
        List<String> columns = new ArrayList<>();
        for (String column : propertyToColumnMap(tableInfo).values()) {
            if (column.endsWith("_name")
                    || column.endsWith("_no")
                    || column.endsWith("_code")
                    || "name".equals(column)
                    || "title".equals(column)) {
                columns.add(column);
            }
        }
        return columns;
    }

    private <T> void appendDeletedFilter(QueryWrapper<T> wrapper, TableInfo tableInfo) {
        if (hasProperty(tableInfo, "deleted")) {
            wrapper.eq(columnOf(tableInfo, "deleted"), 0);
        }
    }

    public HrEmployeeReadScope employeeReadScope() {
        return HrEmployeeReadScope.from(isPrivilegedUser(), UserContext.getDsType(), UserContext.getUserId(),
                currentUserName(), UserContext.getDsDeptIds());
    }

    private <T> void appendDataScope(QueryWrapper<T> wrapper, TableInfo tableInfo) {
        appraisalGuard.legacyRead(wrapper, tableInfo.getTableName());
        if ("hr_employee".equals(tableInfo.getTableName())) {
            employeeReadScope().restrict(wrapper);
            return;
        }
        if ("hr_labor_dispute".equals(tableInfo.getTableName())) {
            HrGrievanceAccessService.DisputeReadScope scope = grievanceAccess.disputeReadScope();
            // Keep tenant/deletion/filter predicates outside the additional per-case read grant.
            wrapper.eq("tenant_id", currentTenantId())
                    .notIn(!scope.excluded().isEmpty(), tableInfo.getKeyColumn(), scope.excluded());
            if (scope.allowed().isEmpty()) {
                appendStandardDataScope(wrapper, tableInfo);
            } else {
                wrapper.and(read -> read.nested(standard -> {
                    // An unrestricted role still needs a nonempty original-scope branch.
                    standard.eq("tenant_id", currentTenantId());
                    appendStandardDataScope(standard, tableInfo);
                }).or().in(tableInfo.getKeyColumn(), scope.allowed()));
            }
            return;
        }
        appendStandardDataScope(wrapper, tableInfo);
    }

    private <T> void appendStandardDataScope(QueryWrapper<T> wrapper, TableInfo tableInfo) {
        if (isPrivilegedUser()) {
            return;
        }
        Integer dsType = UserContext.getDsType();
        if (dsType == null || dsType == 0) {
            return;
        }
        Long currentUserId = UserContext.getUserId();
        String currentUserName = currentUserName();

        if (dsType == 4) {
            if (hasProperty(tableInfo, "userId") && currentUserId != null) {
                wrapper.eq(columnOf(tableInfo, "userId"), currentUserId);
            } else if (hasProperty(tableInfo, "createBy") && StringUtils.hasText(currentUserName)) {
                wrapper.eq(columnOf(tableInfo, "createBy"), currentUserName);
            }
            return;
        }

        List<Long> deptIds = UserContext.getDsDeptIds();
        if (deptIds == null || deptIds.isEmpty()) {
            if (hasProperty(tableInfo, "createBy") && StringUtils.hasText(currentUserName)) {
                wrapper.eq(columnOf(tableInfo, "createBy"), currentUserName);
            }
            return;
        }
        if (hasProperty(tableInfo, "deptId")) {
            wrapper.in(columnOf(tableInfo, "deptId"), deptIds);
        } else if (hasProperty(tableInfo, "createBy") && StringUtils.hasText(currentUserName)) {
            wrapper.eq(columnOf(tableInfo, "createBy"), currentUserName);
        }
    }

    private <T> void appendOrder(QueryWrapper<T> wrapper, TableInfo tableInfo) {
        if (hasProperty(tableInfo, "updateTime")) {
            wrapper.orderByDesc(columnOf(tableInfo, "updateTime"));
            if (tableInfo.getKeyColumn() != null) {
                wrapper.orderByDesc(tableInfo.getKeyColumn());
            }
            return;
        }
        if (hasProperty(tableInfo, "sortOrder")) {
            wrapper.orderByAsc(columnOf(tableInfo, "sortOrder"));
            return;
        }
        if (tableInfo.getKeyColumn() != null) {
            wrapper.orderByDesc(tableInfo.getKeyColumn());
        }
    }

    /**
     * P2 薪酬套改: 新增 hr_employee_comp 时, 若 gradeId 或 totalSalary 留空,
     * 按 hr_employee.position_id -> hr_position.level_id -> hr_comp_grade 套用默认区间(mid_salary).
     * HR 仍可手动覆盖, 不强制锁死.
     */
    private <T> void applyCompGradeAutoFill(T entity, TableInfo tableInfo) {
        if (!"hr_employee_comp".equals(tableInfo.getTableName())) {
            return;
        }
        Long employeeId = (Long) readProperty(entity, "employeeId");
        if (employeeId == null) {
            return;
        }
        Long tenantId = currentTenantId();
        try {
            HrEmployee employee = employeeMapper.selectOne(
                    new LambdaQueryWrapper<HrEmployee>()
                            .eq(HrEmployee::getId, employeeId)
                            .eq(HrEmployee::getTenantId, tenantId)
                            .eq(HrEmployee::getDeleted, 0));
            if (employee == null || employee.getPositionId() == null) {
                return;
            }
            HrPosition position = positionMapper.selectOne(
                    new LambdaQueryWrapper<HrPosition>()
                            .eq(HrPosition::getId, employee.getPositionId())
                            .eq(HrPosition::getTenantId, tenantId));
            if (position == null || position.getLevelId() == null) {
                return;
            }
            List<HrCompGrade> grades = compGradeMapper.selectPage(new Page<>(1, 1, false),
                    new LambdaQueryWrapper<HrCompGrade>()
                            .eq(HrCompGrade::getLevelId, position.getLevelId())
                            .eq(HrCompGrade::getTenantId, tenantId)
                            .eq(HrCompGrade::getStatus, 1)
                            .orderByAsc(HrCompGrade::getId)).getRecords();
            if (grades.isEmpty()) {
                return;
            }
            HrCompGrade grade = grades.get(0);
            if (readProperty(entity, "gradeId") == null) {
                writeProperty(entity, "gradeId", grade.getId());
            }
            if (readProperty(entity, "totalSalaryText") == null) {
                String midSalaryText = grade.getMidSalaryText();
                if (midSalaryText != null) {
                    writeProperty(entity, "totalSalaryText", midSalaryText);
                }
            }
        } catch (Exception ex) {
            // 套改失败不阻断主流程, HR 仍可手动填写
        }
    }

    private Object readProperty(Object entity, String propertyName) {
        try {
            Field field = findField(entity.getClass(), propertyName);
            if (field == null) {
                return null;
            }
            field.setAccessible(true);
            return field.get(entity);
        } catch (IllegalAccessException ex) {
            return null;
        }
    }

    private void writeProperty(Object entity, String propertyName, Object value) {
        try {
            Field field = findField(entity.getClass(), propertyName);
            if (field == null) {
                return;
            }
            field.setAccessible(true);
            field.set(entity, value);
        } catch (IllegalAccessException ex) {
            // ignore
        }
    }

    private <T> void applyCreateDefaults(T entity, TableInfo tableInfo) {
        if (hasProperty(tableInfo, "tenantId")) {
            ensureProperty(entity, "tenantId", currentTenantId());
        }
        if (hasProperty(tableInfo, "deleted")) {
            ensureProperty(entity, "deleted", 0);
        }
        if (hasProperty(tableInfo, "createBy")) {
            ensureProperty(entity, "createBy", currentUserName());
        }
        if (hasProperty(tableInfo, "updateBy")) {
            ensureProperty(entity, "updateBy", currentUserName());
        }
    }

    private <T> void applyPayload(Class<T> entityClass,
                                  T target,
                                  Map<String, Object> payloadMap,
                                  TableInfo tableInfo,
                                  Set<String> nullColumns) {
        T patch = objectMapper.convertValue(payloadMap, entityClass);
        Map<String, Object> normalized = new LinkedHashMap<>(payloadMap);
        for (Map.Entry<String, Object> entry : normalized.entrySet()) {
            String property = normalizeProperty(tableInfo, entry.getKey());
            if (property == null || AUTO_PROPERTIES.contains(property)) {
                continue;
            }
            Object value = getProperty(patch, property);
            setProperty(target, property, value);
            if (value == null) {
                nullColumns.add(columnOf(tableInfo, property));
            }
        }
    }

    @SuppressWarnings("unchecked")
    private <T> BaseMapper<T> mapper(Class<T> entityClass) {
        String beanName = Introspector.decapitalize(entityClass.getSimpleName()) + "Mapper";
        return (BaseMapper<T>) applicationContext.getBean(beanName);
    }

    private <T> TableInfo tableInfo(Class<T> entityClass) {
        TableInfo tableInfo = TableInfoHelper.getTableInfo(entityClass);
        if (tableInfo == null) {
            throw new IllegalStateException("未找到实体表映射：" + entityClass.getName());
        }
        return tableInfo;
    }

    private Map<String, String> propertyToColumnMap(TableInfo tableInfo) {
        Map<String, String> mapping = new LinkedHashMap<>();
        if (tableInfo.getKeyProperty() != null && tableInfo.getKeyColumn() != null) {
            mapping.put(tableInfo.getKeyProperty(), tableInfo.getKeyColumn());
        }
        for (TableFieldInfo fieldInfo : tableInfo.getFieldList()) {
            mapping.put(fieldInfo.getProperty(), fieldInfo.getColumn());
        }
        return mapping;
    }

    private boolean hasProperty(TableInfo tableInfo, String property) {
        return propertyToColumnMap(tableInfo).containsKey(property);
    }

    private String columnOf(TableInfo tableInfo, String property) {
        return propertyToColumnMap(tableInfo).get(property);
    }

    private String normalizeProperty(TableInfo tableInfo, String rawKey) {
        if (!StringUtils.hasText(rawKey)) {
            return null;
        }
        Map<String, String> properties = propertyToColumnMap(tableInfo);
        if (properties.containsKey(rawKey)) {
            return rawKey;
        }
        String camel = toCamel(rawKey);
        if (properties.containsKey(camel)) {
            return camel;
        }
        String snake = camelToSnake(rawKey);
        for (Map.Entry<String, String> entry : properties.entrySet()) {
            if (Objects.equals(entry.getValue(), snake)) {
                return entry.getKey();
            }
        }
        return null;
    }

    private Long extractId(Object entity, TableInfo tableInfo) {
        Object value = getProperty(entity, tableInfo.getKeyProperty());
        return value == null ? null : Long.parseLong(String.valueOf(value));
    }

    private Map<String, Object> getAuditRow(Class<?> entityClass, Long id) {
        if (id == null) {
            return Map.of();
        }
        BaseMapper<?> mapper = mapper(entityClass);
        Object entity = mapper.selectById(id);
        return entity == null ? Map.of() : hAuditValues(tableInfo(entityClass).getTableName(), toResponseMap(entity));
    }

    private <T> void assertHWrite(Class<T> type, Long id, Object payload) {
        String table = tableInfo(type).getTableName(); Map<String, Object> values = toMap(payload);
        if (Set.of("hr_appraisal_cycle", "hr_appraisal_kra", "hr_appraisal_result").contains(table)) {
            throw new HrHException("APPRAISAL_DEDICATED_ENTRY_REQUIRED", "绩效周期须使用独立业务入口", 403);
        }
        if (Set.of("hr_performance_objective", "hr_performance_assignment", "hr_performance_result", "hr_perf_distribution_rule", "hr_talent_calibration_session").contains(table)) {
            if (id != null) appraisalGuard.legacyEntity(mapper(type).selectById(id));
            appraisalGuard.legacyEntity(objectMapper.convertValue(values, type));
        }
        if (List.of("hr_skill", "hr_position_skill", "hr_employee_skill").contains(table)) {
            throw new HrHException("SKILL_BUSINESS_ENTRY_REQUIRED", "技能数据须使用独立的核定或本人自报入口", 403);
        }
        if ("hr_training_course".equals(table) && (values.containsKey("skillId") || values.containsKey("targetLevel")
                || values.containsKey("skill_id") || values.containsKey("target_level")
                || payload instanceof com.cloudflow.hr.domain.dto.HrTrainingCoursePayload coursePayload && coursePayload.isSkillTargetSupplied())) {
            throw new HrHException("SKILL_TARGET_ENTRY_REQUIRED", "课程技能目标须由授权HR在技能管理中配置", 403);
        }
        if (List.of("hr_overtime_request", "hr_shift_request", "hr_overtime_type", "hr_employee_referral").contains(table)) throw new HrBusinessException("H_BUSINESS_ENTRY_REQUIRED", "该记录须使用独立业务入口");
        if (!List.of("hr_time_request", "hr_comp_change", "hr_schedule_assignment").contains(table)) return;
        Object existing = id == null ? null : mapper(type).selectById(id);
        Map<String, Object> previous = existing == null ? Map.of() : toResponseMap(existing);
        if ("hr_time_request".equals(table) && ("OVERTIME".equalsIgnoreCase(String.valueOf(values.get("requestType"))) || "OVERTIME".equalsIgnoreCase(String.valueOf(previous.get("requestType"))))) throw new HrBusinessException("OVERTIME_LEGACY_DISABLED", "加班须使用独立申请入口");
        if ("hr_comp_change".equals(table) && (List.of("HR_OVERTIME", "HR_REFERRAL", "CRM_COMMISSION").contains(Objects.toString(previous.get("sourceBizType"), ""))
                || values.get("sourceBizType") != null || values.get("sourceBizId") != null)) {
            String code = "HR_OVERTIME".equals(previous.get("sourceBizType")) || "HR_OVERTIME".equals(values.get("sourceBizType"))
                    ? "OVERTIME_SOURCE_IMMUTABLE" : "AUTOMATIC_SOURCE_IMMUTABLE";
            throw new HrBusinessException(code, "自动工资变动不能被普通新增、修改、删除或改状态入口改写");
        }
        if ("hr_schedule_assignment".equals(table) && (previous.get("sourceShiftRequestId") != null || values.get("sourceShiftRequestId") != null)) throw new HrBusinessException("H_SCHEDULE_IMMUTABLE", "审批调班来源仅允许内部应用写入");
    }

    private Map<String, Object> hAuditValues(String table, Map<String, Object> values) {
        if (!List.of("hr_overtime_request", "hr_shift_request").contains(table) && !("hr_comp_change".equals(table)
                && List.of("HR_OVERTIME", "CRM_COMMISSION").contains(Objects.toString(values.get("sourceBizType"), "")))) return values;
        Map<String, Object> safe = new LinkedHashMap<>();
        for (String field : List.of("tenantId", "id", "requestId", "employeeId", "status", "version", "sourceBizType", "sourceBizId", "payrollPeriodId", "settlementStatus", "applicationStatus")) if (values.containsKey(field)) safe.put(field, values.get(field));
        return safe;
    }

    private Map<String, Object> toResponseMap(Object entity) {
        if (entity == null) {
            return Map.of();
        }
        return objectMapper.convertValue(entity, MAP_TYPE);
    }

    private void writeAuditLog(String tableName,
                               Long businessId,
                               String operationType,
                               Map<String, Object> before,
                               Map<String, Object> after) {
        try {
            auditLogMapper.insertLog(
                    currentTenantId(),
                    tableName,
                    businessId,
                    operationType,
                    UserContext.getUserId(),
                    currentUserName(),
                    writeJsonSafely(hAuditValues(tableName, before)),
                    writeJsonSafely(hAuditValues(tableName, after))
            );
        } catch (Exception ignored) {
        }
    }

    private String writeJsonSafely(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value == null ? Map.of() : value);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    private long currentTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        tenantId = UserContext.getTenantId();
        return tenantId == null ? DEFAULT_TENANT_ID : tenantId;
    }

    private boolean isPrivilegedUser() {
        Set<String> roles = UserContext.getRoles();
        if (roles == null || roles.isEmpty()) {
            return false;
        }
        for (String role : roles) {
            if (role != null && HIGH_SENSITIVE_ROLES.contains(role.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    private void assertWriteAllowed(String tableName) {
        if (tableName == null || !HIGH_SENSITIVE_WRITE_TABLES.contains(tableName)) {
            return;
        }
        if (!isPrivilegedUser()) {
            throw new HrBusinessException(
                    "FORBIDDEN_SENSITIVE_WRITE",
                    "无权操作敏感薪税数据表：" + tableName + "，请联系 HR 管理员");
        }
    }

    private Map<String, Object> maskRow(Map<String, Object> camelRow, boolean privileged) {
        if (privileged || camelRow == null || camelRow.isEmpty()) {
            return camelRow;
        }
        Map<String, Object> result = new LinkedHashMap<>(camelRow);
        for (Map.Entry<String, Object> entry : result.entrySet()) {
            Object value = entry.getValue();
            if (!(value instanceof CharSequence) && !(value instanceof Number)) {
                continue;
            }
            String snake = camelToSnake(entry.getKey());
            if (!MASK_COLUMNS.contains(snake)) {
                continue;
            }
            entry.setValue(SensitiveUtils.maskByFieldName(snake, String.valueOf(value)));
        }
        return result;
    }

    private Object getProperty(Object target, String property) {
        if (target == null || !StringUtils.hasText(property)) {
            return null;
        }
        Field field = findField(target.getClass(), property);
        if (field == null) {
            return null;
        }
        try {
            field.setAccessible(true);
            return field.get(target);
        } catch (IllegalAccessException e) {
            return null;
        }
    }

    private void ensureProperty(Object target, String property, Object value) {
        if (getProperty(target, property) == null && value != null) {
            setProperty(target, property, value);
        }
    }

    private void setProperty(Object target, String property, Object value) {
        if (target == null || !StringUtils.hasText(property)) {
            return;
        }
        Field field = findField(target.getClass(), property);
        if (field == null) {
            return;
        }
        try {
            field.setAccessible(true);
            field.set(target, objectMapper.convertValue(value, field.getType()));
        } catch (IllegalArgumentException ignored) {
            try {
                field.set(target, value);
            } catch (IllegalAccessException ignoredAgain) {
            }
        } catch (IllegalAccessException ignored) {
        }
    }

    private Field findField(Class<?> type, String name) {
        Class<?> current = type;
        while (current != null && current != Object.class) {
            for (Field field : current.getDeclaredFields()) {
                if (field.getName().equals(name) && field.getAnnotation(EncryptField.class) != null) {
                    return field;
                }
                if (field.getName().equals(name)) {
                    return field;
                }
            }
            current = current.getSuperclass();
        }
        return null;
    }

    private String toCamel(String value) {
        StringBuilder builder = new StringBuilder();
        boolean upperNext = false;
        for (char ch : value.toCharArray()) {
            if (ch == '_') {
                upperNext = true;
                continue;
            }
            builder.append(upperNext ? Character.toUpperCase(ch) : ch);
            upperNext = false;
        }
        return builder.toString();
    }

    private String camelToSnake(String camel) {
        if (camel == null || camel.isEmpty()) {
            return camel;
        }
        StringBuilder sb = new StringBuilder(camel.length() + 4);
        for (int i = 0; i < camel.length(); i++) {
            char c = camel.charAt(i);
            if (Character.isUpperCase(c)) {
                if (i > 0) {
                    sb.append('_');
                }
                sb.append(Character.toLowerCase(c));
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private int toInt(Object value, int fallback) {
        if (value == null || !StringUtils.hasText(String.valueOf(value))) {
            return fallback;
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }
}
