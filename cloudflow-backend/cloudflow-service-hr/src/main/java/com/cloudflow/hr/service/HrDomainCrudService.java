package com.cloudflow.hr.service;

import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class HrDomainCrudService {

    private static final long DEFAULT_TENANT_ID = 100000L;
    private static final Pattern SQL_IDENTIFIER = Pattern.compile("[a-zA-Z][a-zA-Z0-9_]*");
    private static final Set<String> IGNORED_QUERY_KEYS = Set.of("pageNum", "pageSize", "current", "size", "keyword");
    private static final Set<String> AUTO_COLUMNS = Set.of("id", "tenant_id", "create_time", "update_time", "deleted");
    private static final Map<String, String> STATUS_LABELS = Map.ofEntries(
            Map.entry("DRAFT", "草稿"),
            Map.entry("APPROVING", "审批中"),
            Map.entry("APPROVED", "已审批"),
            Map.entry("RECRUITING", "招聘中"),
            Map.entry("SCREENING", "筛选中"),
            Map.entry("INTERVIEW", "面试中"),
            Map.entry("OFFER", "Offer阶段"),
            Map.entry("SCHEDULED", "已排期"),
            Map.entry("COMPLETED", "已完成"),
            Map.entry("EFFECTIVE", "已生效"),
            Map.entry("SENT", "已发送"),
            Map.entry("ACCEPTED", "已接受"),
            Map.entry("REJECTED", "已拒绝"),
            Map.entry("CANCELLED", "已取消"),
            Map.entry("ACTIVE", "启用"),
            Map.entry("PENDING", "待处理")
    );
    private static final Map<String, String> SOURCE_LABELS = Map.of(
            "WEBSITE", "招聘网站",
            "REFERRAL", "内部推荐",
            "HEADHUNTER", "猎头",
            "CAMPUS", "校园招聘"
    );
    private static final Map<String, String> INTERVIEW_ROUND_LABELS = Map.of(
            "FIRST", "初试",
            "SECOND", "复试",
            "FINAL", "终试"
    );
    private static final Map<String, String> INTERVIEW_TYPE_LABELS = Map.of(
            "VIDEO", "视频面试",
            "PHONE", "电话面试",
            "ONSITE", "现场面试"
    );

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final Map<String, Set<String>> columnCache = new ConcurrentHashMap<>();

    public List<Map<String, Object>> list(String tableName, Map<String, ?> query) {
        QueryParts parts = buildQuery(tableName, query, false);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(parts.sql(), parts.args().toArray());
        return rows.stream().map(this::toCamelCaseMap).toList();
    }

    public Map<String, Object> page(String tableName, Map<String, ?> query) {
        QueryParts listParts = buildQuery(tableName, query, true);
        QueryParts countParts = buildCountQuery(tableName, query);
        List<Map<String, Object>> records = jdbcTemplate.queryForList(listParts.sql(), listParts.args().toArray())
                .stream()
                .map(this::toCamelCaseMap)
                .toList();
        Long total = jdbcTemplate.queryForObject(countParts.sql(), Long.class, countParts.args().toArray());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("records", records);
        result.put("rows", records);
        result.put("total", total == null ? records.size() : total);
        result.put("current", toInt(query.get("pageNum"), toInt(query.get("current"), 1)));
        result.put("size", toInt(query.get("pageSize"), toInt(query.get("size"), records.size())));
        return result;
    }

    public Map<String, Object> pageRecruitmentRequisitions(Map<String, Object> query) {
        Map<String, Object> page = page("hr_recruitment_requisition", query);
        return mapPage(page, this::enrichRecruitmentRequisition);
    }

    public void changeRecruitmentRequisitionStatus(Long id, String action) {
        String status = switch (String.valueOf(action).toLowerCase(Locale.ROOT)) {
            case "submit" -> "APPROVING";
            case "approve" -> "RECRUITING";
            case "complete" -> "COMPLETED";
            case "cancel" -> "CANCELLED";
            case "reject" -> "REJECTED";
            default -> String.valueOf(action).toUpperCase(Locale.ROOT);
        };
        update("hr_recruitment_requisition", id, Map.of("status", status));
    }

    public Map<String, Object> pageCandidates(Map<String, Object> query) {
        Map<String, Object> normalizedQuery = new LinkedHashMap<>(query);
        if (!normalizedQuery.containsKey("requisitionId") && normalizedQuery.containsKey("requestId")) {
            normalizedQuery.put("requisitionId", normalizedQuery.get("requestId"));
        }
        Map<String, Object> page = page("hr_candidate", normalizedQuery);
        return mapPage(page, this::enrichCandidate);
    }

    public List<Map<String, Object>> listInterviews(Map<String, Object> query) {
        return list("hr_interview", query).stream().map(this::enrichInterview).toList();
    }

    public List<Map<String, Object>> listOffers(Map<String, Object> query) {
        return list("hr_offer", query).stream().map(this::enrichOffer).toList();
    }

    public Long convertOfferToOnboarding(Long offerId) {
        Map<String, Object> offer = enrichOffer(get("hr_offer", offerId));
        if (offer.isEmpty()) {
            throw new IllegalArgumentException("Offer不存在");
        }

        Long candidateId = toLong(offer.get("candidateId"));
        if (candidateId != null) {
            List<Map<String, Object>> existed = listLifecycleApplications(Map.of("type", "ONBOARDING", "candidateId", candidateId));
            if (!existed.isEmpty()) {
                return toLong(existed.get(0).get("id"));
            }
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("applicationNo", nextNo("HRLC"));
        payload.put("type", "ONBOARDING");
        payload.put("candidateId", candidateId);
        payload.put("name", offer.get("candidateName"));
        payload.put("deptId", offer.get("deptId"));
        payload.put("positionId", offer.get("positionId"));
        payload.put("expectedDate", firstValue(offer, "expectedDate", "expectedArrivalDate"));
        payload.put("effectiveDate", firstValue(offer, "expectedDate", "expectedArrivalDate"));
        payload.put("offerId", offerId);
        payload.put("salary", offer.get("salary"));
        payload.put("status", "DRAFT");
        payload.put("remark", "Offer转入入职办理");
        return createLifecycleApplication(payload);
    }

    public List<Map<String, Object>> listLifecycleApplications(Map<String, Object> query) {
        return list("hr_lifecycle_application", query).stream().map(this::enrichLifecycleApplication).toList();
    }

    public Long createLifecycleApplication(Map<String, Object> payload) {
        Map<String, Object> applicationPayload = normalizeLifecyclePayload(payload);
        Long id = create("hr_lifecycle_application", applicationPayload);
        saveLifecycleDetail(id, String.valueOf(applicationPayload.get("type")), payload);
        createLifecycleTasks(id, String.valueOf(applicationPayload.get("type")), applicationPayload);
        return id;
    }

    public void updateLifecycleApplication(Long id, Map<String, Object> payload) {
        Map<String, Object> applicationPayload = normalizeLifecyclePayload(payload);
        update("hr_lifecycle_application", id, applicationPayload);
        Map<String, Object> current = get("hr_lifecycle_application", id);
        String type = String.valueOf(firstValue(current, "type"));
        saveLifecycleDetail(id, type, payload);
    }

    public void changeLifecycleStatus(Long id, String action, Map<String, Object> payload) {
        changeStatus("hr_lifecycle_application", id, action);
        if (payload != null && !payload.isEmpty()) {
            Map<String, Object> current = enrichLifecycleApplication(get("hr_lifecycle_application", id));
            Map<String, Object> detail = new LinkedHashMap<>(current);
            detail.putAll(payload);
            Object confirmDate = firstValue(payload, "confirmDate", "actualDate");
            if (confirmDate != null) {
                detail.put("actualDate", confirmDate);
            }
            saveLifecycleDetail(id, String.valueOf(current.get("type")), detail);
        }
    }

    public void completeLifecycleTask(Long id, Map<String, Object> payload) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("status", "COMPLETED");
        values.put("completedTime", new java.sql.Timestamp(System.currentTimeMillis()));
        if (payload != null && payload.get("remark") != null) {
            values.put("remark", payload.get("remark"));
        }
        update("hr_lifecycle_task", id, values);
    }

    public Map<String, Object> get(String tableName, Long id) {
        String table = sanitizeIdentifier(tableName);
        Set<String> columns = getColumns(table);
        List<Object> args = new ArrayList<>();
        StringBuilder sql = new StringBuilder("SELECT * FROM ").append(table).append(" WHERE id = ?");
        args.add(id);
        appendTenantWhere(sql, args, columns);
        appendDeletedWhere(sql, columns);

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), args.toArray());
        return rows.isEmpty() ? Map.of() : toCamelCaseMap(rows.get(0));
    }

    public Long create(String tableName, Map<String, Object> payload) {
        String table = sanitizeIdentifier(tableName);
        Set<String> columns = getColumns(table);
        Map<String, Object> values = toColumnValueMap(payload, columns, true);

        if (columns.contains("tenant_id")) {
            values.put("tenant_id", tenantId());
        }
        if (columns.contains("deleted")) {
            values.put("deleted", 0);
        }

        List<String> names = new ArrayList<>(values.keySet());
        String placeholders = String.join(", ", names.stream().map(name -> "?").toList());
        String sql = "INSERT INTO " + table + " (" + String.join(", ", names) + ") VALUES (" + placeholders + ")";

        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            var statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            int index = 1;
            for (String name : names) {
                statement.setObject(index++, values.get(name));
            }
            return statement;
        }, keyHolder);

        Number key = keyHolder.getKey();
        return key == null ? null : key.longValue();
    }

    public void update(String tableName, Long id, Map<String, Object> payload) {
        String table = sanitizeIdentifier(tableName);
        Set<String> columns = getColumns(table);
        Map<String, Object> values = toColumnValueMap(payload, columns, false);
        values.remove("id");

        if (columns.contains("update_time")) {
            values.put("update_time", new java.sql.Timestamp(System.currentTimeMillis()));
        }
        if (values.isEmpty()) {
            return;
        }

        List<Object> args = new ArrayList<>();
        String assignments = String.join(", ", values.keySet().stream().map(name -> {
            args.add(values.get(name));
            return name + " = ?";
        }).toList());

        StringBuilder sql = new StringBuilder("UPDATE ").append(table).append(" SET ").append(assignments).append(" WHERE id = ?");
        args.add(id);
        appendTenantWhere(sql, args, columns);
        jdbcTemplate.update(sql.toString(), args.toArray());
    }

    public void delete(String tableName, Long id) {
        String table = sanitizeIdentifier(tableName);
        Set<String> columns = getColumns(table);
        List<Object> args = new ArrayList<>();
        StringBuilder sql;
        if (columns.contains("deleted")) {
            sql = new StringBuilder("UPDATE ").append(table).append(" SET deleted = 1");
            if (columns.contains("update_time")) {
                sql.append(", update_time = NOW()");
            }
            sql.append(" WHERE id = ?");
        } else {
            sql = new StringBuilder("DELETE FROM ").append(table).append(" WHERE id = ?");
        }
        args.add(id);
        appendTenantWhere(sql, args, columns);
        jdbcTemplate.update(sql.toString(), args.toArray());
    }

    public void changeStatus(String tableName, Long id, String action) {
        String status = switch (String.valueOf(action).toLowerCase(Locale.ROOT)) {
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
        update(tableName, id, Map.of("status", status));
    }

    public void setHeadcountActualCount(Long id, Integer actualCount) {
        jdbcTemplate.update(
                "UPDATE hr_headcount SET actual_count = ?, vacancy_count = approved_count - ?, update_time = NOW() WHERE id = ? AND tenant_id = ?",
                actualCount, actualCount, id, tenantId()
        );
    }

    public Map<String, Object> getHeadcountStatistics(Long id) {
        Map<String, Object> row = get("hr_headcount", id);
        if (row.isEmpty()) {
            return row;
        }
        int approved = toInt(row.get("approvedCount"), 0);
        int actual = toInt(row.get("actualCount"), 0);
        int vacancy = approved - actual;
        row.put("vacancyCount", vacancy);
        row.put("utilizationRate", approved == 0 ? 0 : Math.round((actual * 10000.0) / approved) / 100.0);
        return row;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapPage(Map<String, Object> page, java.util.function.Function<Map<String, Object>, Map<String, Object>> mapper) {
        List<Map<String, Object>> records = ((List<Map<String, Object>>) page.getOrDefault("records", List.of()))
                .stream()
                .map(mapper)
                .toList();
        Map<String, Object> result = new LinkedHashMap<>(page);
        result.put("records", records);
        result.put("rows", records);
        return result;
    }

    private Map<String, Object> enrichRecruitmentRequisition(Map<String, Object> row) {
        if (row.isEmpty()) {
            return row;
        }
        Map<String, Object> result = new LinkedHashMap<>(row);
        result.put("requestNo", firstValue(result, "requestNo", "requisitionNo"));
        result.put("expectedDate", firstValue(result, "expectedDate", "expectedArrivalDate"));
        result.put("jobRequirements", firstValue(result, "jobRequirements", "requirements"));
        putStatusDesc(result);
        putDeptName(result);
        putPositionSnapshot(result);
        return result;
    }

    private Map<String, Object> enrichCandidate(Map<String, Object> row) {
        if (row.isEmpty()) {
            return row;
        }
        Map<String, Object> result = new LinkedHashMap<>(row);
        result.put("requestId", firstValue(result, "requestId", "requisitionId"));
        putStatusDesc(result);
        Object source = result.get("source");
        result.put("sourceDesc", SOURCE_LABELS.getOrDefault(String.valueOf(source), String.valueOf(source == null ? "" : source)));

        Long requisitionId = toLong(firstValue(result, "requisitionId", "requestId"));
        if (requisitionId != null) {
            Map<String, Object> requisition = enrichRecruitmentRequisition(get("hr_recruitment_requisition", requisitionId));
            result.putIfAbsent("requisitionNo", requisition.get("requisitionNo"));
            result.putIfAbsent("requestNo", requisition.get("requestNo"));
            result.putIfAbsent("deptId", requisition.get("deptId"));
            result.putIfAbsent("deptName", requisition.get("deptName"));
            result.putIfAbsent("positionId", requisition.get("positionId"));
            result.putIfAbsent("positionName", requisition.get("positionName"));
            result.putIfAbsent("expectedDate", requisition.get("expectedDate"));
        }
        return result;
    }

    private Map<String, Object> enrichInterview(Map<String, Object> row) {
        if (row.isEmpty()) {
            return row;
        }
        Map<String, Object> result = new LinkedHashMap<>(row);
        putStatusDesc(result);
        Object round = result.get("interviewRound");
        Object type = result.get("interviewType");
        result.put("interviewRoundName", INTERVIEW_ROUND_LABELS.getOrDefault(String.valueOf(round), String.valueOf(round == null ? "" : round)));
        result.put("interviewTypeName", INTERVIEW_TYPE_LABELS.getOrDefault(String.valueOf(type), String.valueOf(type == null ? "" : type)));
        result.put("meetingRoomName", firstValue(result, "meetingRoomName", "location"));

        Long candidateId = toLong(result.get("candidateId"));
        if (candidateId != null) {
            Map<String, Object> candidate = enrichCandidate(get("hr_candidate", candidateId));
            result.putIfAbsent("candidateName", candidate.get("name"));
            result.putIfAbsent("positionName", candidate.get("positionName"));
        }
        return result;
    }

    private Map<String, Object> enrichOffer(Map<String, Object> row) {
        if (row.isEmpty()) {
            return row;
        }
        Map<String, Object> result = new LinkedHashMap<>(row);
        result.put("expectedDate", firstValue(result, "expectedDate", "expectedArrivalDate"));
        result.put("expiryDate", firstValue(result, "expiryDate", "expireDate"));
        putStatusDesc(result);
        putPositionSnapshot(result);

        Long candidateId = toLong(result.get("candidateId"));
        if (candidateId != null) {
            Map<String, Object> candidate = enrichCandidate(get("hr_candidate", candidateId));
            result.putIfAbsent("candidateName", candidate.get("name"));
            result.putIfAbsent("deptId", candidate.get("deptId"));
            result.putIfAbsent("deptName", candidate.get("deptName"));
            if (result.get("positionId") == null) {
                result.put("positionId", candidate.get("positionId"));
                putPositionSnapshot(result);
            }
            result.putIfAbsent("positionName", candidate.get("positionName"));
        }
        return result;
    }

    private Map<String, Object> enrichLifecycleApplication(Map<String, Object> row) {
        if (row.isEmpty()) {
            return row;
        }
        Map<String, Object> result = new LinkedHashMap<>(row);
        Map<String, Object> detail = readLifecycleDetail(toLong(row.get("id")));
        result.putAll(detail);
        result.put("expectedDate", firstValue(result, "expectedDate", "effectiveDate"));
        result.put("onboardDate", firstValue(result, "onboardDate", "effectiveDate"));
        putStatusDesc(result);
        putDeptName(result);
        putPostName(result);
        putPositionSnapshot(result);
        Object name = result.get("name");
        if (name == null || !StringUtils.hasText(String.valueOf(name))) {
            Long employeeId = toLong(result.get("employeeId"));
            if (employeeId != null) {
                Map<String, Object> employee = get("hr_employee", employeeId);
                result.put("name", employee.get("name"));
                result.putIfAbsent("employeeName", employee.get("name"));
            }
        }
        return result;
    }

    private Map<String, Object> normalizeLifecyclePayload(Map<String, Object> payload) {
        Map<String, Object> result = new LinkedHashMap<>(payload);
        Object applicationNo = firstValue(result, "applicationNo", "application_no");
        result.put("applicationNo", applicationNo == null ? nextNo("HRLC") : applicationNo);
        result.put("effectiveDate", firstValue(result, "effectiveDate", "expectedDate", "onboardDate", "actualDate"));
        Object status = firstValue(result, "status");
        result.put("status", status == null ? "DRAFT" : status);
        return result;
    }

    private void saveLifecycleDetail(Long applicationId, String type, Map<String, Object> payload) {
        if (applicationId == null || payload == null || payload.isEmpty()) {
            return;
        }
        Map<String, Object> detail = new LinkedHashMap<>(payload);
        detail.put("applicationId", applicationId);
        detail.put("detailType", StringUtils.hasText(type) ? type : String.valueOf(detail.getOrDefault("type", "GENERAL")));
        Map<String, Object> detailJson = new LinkedHashMap<>(payload);
        detailJson.put("applicationId", applicationId);
        detail.put("detailJson", detailJson);

        List<Map<String, Object>> existed = list("hr_lifecycle_detail", Map.of("applicationId", applicationId));
        if (existed.isEmpty()) {
            create("hr_lifecycle_detail", detail);
        } else {
            update("hr_lifecycle_detail", toLong(existed.get(0).get("id")), detail);
        }
    }

    private Map<String, Object> readLifecycleDetail(Long applicationId) {
        if (applicationId == null) {
            return Map.of();
        }
        List<Map<String, Object>> rows = list("hr_lifecycle_detail", Map.of("applicationId", applicationId));
        if (rows.isEmpty()) {
            return Map.of();
        }
        Object detailJson = rows.get(0).get("detailJson");
        return parseJsonObject(detailJson);
    }

    private void createLifecycleTasks(Long applicationId, String type, Map<String, Object> payload) {
        if (applicationId == null || !list("hr_lifecycle_task", Map.of("applicationId", applicationId)).isEmpty()) {
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
        Map<String, Object> task = new LinkedHashMap<>();
        task.put("applicationId", applicationId);
        task.put("taskName", taskName);
        task.put("taskType", taskType);
        Object dueDate = firstValue(payload, "effectiveDate");
        if (dueDate != null) {
            task.put("dueDate", dueDate);
        }
        task.put("status", "PENDING");
        create("hr_lifecycle_task", task);
    }

    private void putStatusDesc(Map<String, Object> result) {
        Object status = result.get("status");
        result.put("statusDesc", STATUS_LABELS.getOrDefault(String.valueOf(status), String.valueOf(status == null ? "" : status)));
    }

    private void putDeptName(Map<String, Object> result) {
        Long deptId = toLong(result.get("deptId"));
        if (deptId == null || result.get("deptName") != null) {
            return;
        }
        result.put("deptName", lookupSingleValue("sys_dept", "dept_id", deptId, "dept_name"));
    }

    private void putPostName(Map<String, Object> result) {
        Long postId = toLong(result.get("postId"));
        if (postId == null || result.get("postName") != null) {
            return;
        }
        result.put("postName", lookupSingleValue("sys_post", "post_id", postId, "post_name"));
    }

    private void putPositionSnapshot(Map<String, Object> result) {
        Long positionId = toLong(result.get("positionId"));
        if (positionId == null) {
            return;
        }
        Map<String, Object> position = get("hr_position", positionId);
        if (position.isEmpty()) {
            return;
        }
        result.putIfAbsent("positionName", position.get("positionName"));
        result.putIfAbsent("positionCode", position.get("positionCode"));
        result.putIfAbsent("postId", position.get("postId"));
    }

    private Object lookupSingleValue(String tableName, String idColumn, Long id, String valueColumn) {
        String sql = "SELECT " + valueColumn + " FROM " + tableName + " WHERE " + idColumn + " = ? AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1";
        List<Object> values = jdbcTemplate.queryForList(sql, Object.class, id, tenantId());
        return values.isEmpty() ? null : values.get(0);
    }

    private Map<String, Object> parseJsonObject(Object value) {
        if (value == null) {
            return Map.of();
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> result = new LinkedHashMap<>();
            map.forEach((key, item) -> result.put(String.valueOf(key), item));
            return result;
        }
        try {
            return objectMapper.readValue(String.valueOf(value), new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() {
            });
        } catch (JsonProcessingException ex) {
            return Map.of();
        }
    }

    private Object firstValue(Map<String, Object> source, String... keys) {
        for (String key : keys) {
            if (source.containsKey(key) && source.get(key) != null && StringUtils.hasText(String.valueOf(source.get(key)))) {
                return source.get(key);
            }
        }
        return null;
    }

    private String nextNo(String prefix) {
        return prefix + System.currentTimeMillis();
    }

    private QueryParts buildQuery(String tableName, Map<String, ?> query, boolean paged) {
        String table = sanitizeIdentifier(tableName);
        Set<String> columns = getColumns(table);
        List<Object> args = new ArrayList<>();
        StringBuilder sql = new StringBuilder("SELECT * FROM ").append(table).append(" WHERE 1 = 1");
        appendFilters(sql, args, columns, query);
        appendOrder(sql, columns);
        if (paged) {
            int pageNum = Math.max(1, toInt(query.get("pageNum"), toInt(query.get("current"), 1)));
            int pageSize = Math.min(500, Math.max(1, toInt(query.get("pageSize"), toInt(query.get("size"), 50))));
            sql.append(" LIMIT ? OFFSET ?");
            args.add(pageSize);
            args.add((pageNum - 1) * pageSize);
        }
        return new QueryParts(sql.toString(), args);
    }

    private QueryParts buildCountQuery(String tableName, Map<String, ?> query) {
        String table = sanitizeIdentifier(tableName);
        Set<String> columns = getColumns(table);
        List<Object> args = new ArrayList<>();
        StringBuilder sql = new StringBuilder("SELECT COUNT(1) FROM ").append(table).append(" WHERE 1 = 1");
        appendFilters(sql, args, columns, query);
        return new QueryParts(sql.toString(), args);
    }

    private void appendFilters(StringBuilder sql, List<Object> args, Set<String> columns, Map<String, ?> query) {
        appendTenantWhere(sql, args, columns);
        appendDeletedWhere(sql, columns);

        for (Map.Entry<String, ?> entry : query.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();
            if (IGNORED_QUERY_KEYS.contains(key) || value == null || !StringUtils.hasText(String.valueOf(value))) {
                continue;
            }
            String column = toColumnName(key);
            if (!columns.contains(column)) {
                continue;
            }
            sql.append(" AND ").append(column).append(" = ?");
            args.add(value);
        }

        Object keyword = query.get("keyword");
        if (keyword != null && StringUtils.hasText(String.valueOf(keyword))) {
            List<String> keywordColumns = columns.stream()
                    .filter(name -> name.endsWith("_name")
                            || name.endsWith("_no")
                            || name.endsWith("_code")
                            || name.equals("name")
                            || name.equals("title"))
                    .toList();
            if (!keywordColumns.isEmpty()) {
                sql.append(" AND (");
                for (int i = 0; i < keywordColumns.size(); i++) {
                    if (i > 0) {
                        sql.append(" OR ");
                    }
                    sql.append(keywordColumns.get(i)).append(" LIKE ?");
                    args.add("%" + keyword + "%");
                }
                sql.append(")");
            }
        }
    }

    private void appendTenantWhere(StringBuilder sql, List<Object> args, Set<String> columns) {
        if (columns.contains("tenant_id")) {
            sql.append(" AND tenant_id = ?");
            args.add(tenantId());
        }
    }

    private void appendDeletedWhere(StringBuilder sql, Set<String> columns) {
        if (columns.contains("deleted")) {
            sql.append(" AND deleted = 0");
        }
    }

    private void appendOrder(StringBuilder sql, Set<String> columns) {
        if (columns.contains("update_time")) {
            sql.append(" ORDER BY update_time DESC");
            if (columns.contains("id")) {
                sql.append(", id DESC");
            }
            return;
        }
        if (columns.contains("sort_order")) {
            sql.append(" ORDER BY sort_order ASC");
            return;
        }
        if (columns.contains("id")) {
            sql.append(" ORDER BY id DESC");
        }
    }

    private Set<String> getColumns(String tableName) {
        String table = sanitizeIdentifier(tableName);
        return columnCache.computeIfAbsent(table, key -> jdbcTemplate.query("SELECT * FROM " + key + " WHERE 1 = 0", rs -> {
            var metaData = rs.getMetaData();
            Set<String> columns = ConcurrentHashMap.newKeySet();
            for (int i = 1; i <= metaData.getColumnCount(); i++) {
                columns.add(metaData.getColumnLabel(i).toLowerCase(Locale.ROOT));
            }
            return columns;
        }));
    }

    private Map<String, Object> toColumnValueMap(Map<String, Object> payload, Set<String> columns, boolean create) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : payload.entrySet()) {
            String column = toColumnName(entry.getKey());
            if (!columns.contains(column)) {
                continue;
            }
            if (!create && AUTO_COLUMNS.contains(column)) {
                continue;
            }
            result.put(column, toDbValue(entry.getValue()));
        }
        return result;
    }

    private Object toDbValue(Object value) {
        if (value instanceof Map<?, ?> || value instanceof Collection<?>) {
            try {
                return objectMapper.writeValueAsString(value);
            } catch (JsonProcessingException e) {
                throw new IllegalArgumentException("JSON字段序列化失败", e);
            }
        }
        return value;
    }

    private Map<String, Object> toCamelCaseMap(Map<String, Object> row) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            result.put(toCamelCase(entry.getKey()), entry.getValue());
        }
        return result;
    }

    private String toColumnName(String key) {
        if (!StringUtils.hasText(key)) {
            return key;
        }
        String normalized = key.trim();
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < normalized.length(); i++) {
            char ch = normalized.charAt(i);
            if (Character.isUpperCase(ch)) {
                builder.append('_').append(Character.toLowerCase(ch));
            } else if (ch == '-') {
                builder.append('_');
            } else {
                builder.append(Character.toLowerCase(ch));
            }
        }
        return builder.toString().replaceAll("^_+", "");
    }

    private String toCamelCase(String key) {
        String normalized = key.toLowerCase(Locale.ROOT);
        StringBuilder builder = new StringBuilder();
        boolean upperNext = false;
        for (int i = 0; i < normalized.length(); i++) {
            char ch = normalized.charAt(i);
            if (ch == '_') {
                upperNext = true;
                continue;
            }
            builder.append(upperNext ? Character.toUpperCase(ch) : ch);
            upperNext = false;
        }
        return builder.toString();
    }

    private String sanitizeIdentifier(String value) {
        if (!StringUtils.hasText(value) || !SQL_IDENTIFIER.matcher(value).matches()) {
            throw new IllegalArgumentException("非法表名或字段名");
        }
        return value;
    }

    private long tenantId() {
        Long tenantId = TenantContext.getTenantId();
        return tenantId == null ? DEFAULT_TENANT_ID : tenantId;
    }

    private Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private int toInt(Object value, int fallback) {
        if (value == null) {
            return fallback;
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private record QueryParts(String sql, List<Object> args) {
    }
}
