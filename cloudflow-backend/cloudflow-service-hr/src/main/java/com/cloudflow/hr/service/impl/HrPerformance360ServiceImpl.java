package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.Hr360EvaluatorInvitePayload;
import com.cloudflow.hr.domain.dto.Hr360EvaluatorResponsePayload;
import com.cloudflow.hr.service.HrPerformance360Service;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * HR-P0-1 360 评估实现。
 * - 邀请：批量插入 hr_perf_evaluator(unique(objective,evaluatee,evaluator,source) 防重)。
 * - 提交：upsert hr_perf_evaluator_response + 将 hr_perf_evaluator.status 置为 SUBMITTED。
 * - 聚合：按 evaluator_source 分组算各源均值，再按各源在该被评员工上的权重做加权求和；
 *   聚合结果回填 hr_performance_result(score + grade)，状态保持当前。
 */
@Service
@RequiredArgsConstructor
public class HrPerformance360ServiceImpl implements HrPerformance360Service {

    private static final long TENANT_ID = 100000L;
    private static final Set<String> ALLOWED_SOURCES = Set.of(
            "SELF", "MANAGER", "PEER", "SUBORDINATE", "CUSTOMER");

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public List<Long> inviteEvaluators(Hr360EvaluatorInvitePayload payload) {
        if (payload == null || payload.getObjectiveId() == null || payload.getEvaluateeId() == null) {
            throw new IllegalArgumentException("objectiveId 与 evaluateeId 不能为空");
        }
        if (payload.getEvaluators() == null || payload.getEvaluators().isEmpty()) {
            throw new IllegalArgumentException("至少需要一位评估人");
        }
        List<Long> ids = new ArrayList<>();
        for (Hr360EvaluatorInvitePayload.Item item : payload.getEvaluators()) {
            if (item.getEvaluatorId() == null) {
                continue;
            }
            String source = normalizeSource(item.getEvaluatorSource());
            BigDecimal weight = item.getWeight() == null ? BigDecimal.valueOf(20) : item.getWeight();

            Long existing = jdbcTemplate.query(
                    "SELECT id FROM hr_perf_evaluator WHERE tenant_id=? AND objective_id=? AND evaluatee_id=? AND evaluator_id=? AND evaluator_source=? AND deleted=0",
                    rs -> rs.next() ? rs.getLong("id") : null,
                    TENANT_ID, payload.getObjectiveId(), payload.getEvaluateeId(),
                    item.getEvaluatorId(), source);
            if (existing != null) {
                jdbcTemplate.update(
                        "UPDATE hr_perf_evaluator SET weight=?, status='PENDING', invite_time=NOW(), update_by=? WHERE id=?",
                        weight, defaultOperator(), existing);
                ids.add(existing);
                continue;
            }

            Long newId = insertAndReturnId(
                    "INSERT INTO hr_perf_evaluator (tenant_id, objective_id, assignment_id, evaluatee_id, evaluatee_name, evaluator_id, evaluator_name, evaluator_source, weight, status, invite_time, create_by, update_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW(), ?, ?)",
                    TENANT_ID,
                    payload.getObjectiveId(),
                    payload.getAssignmentId(),
                    payload.getEvaluateeId(),
                    payload.getEvaluateeName(),
                    item.getEvaluatorId(),
                    item.getEvaluatorName(),
                    source,
                    weight,
                    defaultOperator(),
                    defaultOperator()
            );
            ids.add(newId);
        }
        writeAuditLog("hr_perf_evaluator", payload.getEvaluateeId(), "INVITE",
                Map.of("objectiveId", payload.getObjectiveId()),
                Map.of("evaluatorIds", ids));
        return ids;
    }

    @Override
    @Transactional
    public void submitResponse(Hr360EvaluatorResponsePayload payload) {
        if (payload == null || payload.getEvaluatorId() == null || payload.getScore() == null) {
            throw new IllegalArgumentException("evaluatorId 与 score 不能为空");
        }
        Map<String, Object> evaluator = jdbcTemplate.query(
                "SELECT * FROM hr_perf_evaluator WHERE id=? AND tenant_id=? AND deleted=0",
                rs -> rs.next() ? rowToMap(rs) : null,
                payload.getEvaluatorId(), TENANT_ID);
        if (evaluator == null) {
            throw new IllegalArgumentException("评估邀请不存在");
        }
        if (!"PENDING".equalsIgnoreCase(String.valueOf(evaluator.get("status")))) {
            throw new IllegalStateException("评估邀请状态非 PENDING，不可再提交");
        }
        String dimensionJson = writeJson(payload.getDimensionScores() == null ? List.of() : payload.getDimensionScores());

        Long existingResp = jdbcTemplate.query(
                "SELECT id FROM hr_perf_evaluator_response WHERE tenant_id=? AND evaluator_id=? AND deleted=0",
                rs -> rs.next() ? rs.getLong("id") : null,
                TENANT_ID, payload.getEvaluatorId());
        if (existingResp == null) {
            jdbcTemplate.update(
                    "INSERT INTO hr_perf_evaluator_response (tenant_id, evaluator_id, objective_id, evaluatee_id, evaluator_source, score, dimension_scores, comment_text, submit_time, create_by, update_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)",
                    TENANT_ID,
                    payload.getEvaluatorId(),
                    evaluator.get("objective_id"),
                    evaluator.get("evaluatee_id"),
                    evaluator.get("evaluator_source"),
                    payload.getScore(),
                    dimensionJson,
                    payload.getCommentText(),
                    defaultOperator(),
                    defaultOperator()
            );
        } else {
            jdbcTemplate.update(
                    "UPDATE hr_perf_evaluator_response SET score=?, dimension_scores=?, comment_text=?, submit_time=NOW(), update_by=? WHERE id=?",
                    payload.getScore(), dimensionJson, payload.getCommentText(), defaultOperator(), existingResp);
        }
        jdbcTemplate.update(
                "UPDATE hr_perf_evaluator SET status='SUBMITTED', update_by=? WHERE id=?",
                defaultOperator(), payload.getEvaluatorId());

        writeAuditLog("hr_perf_evaluator_response", payload.getEvaluatorId(), "SUBMIT",
                Map.of(),
                Map.of("score", payload.getScore()));
    }

    @Override
    @Transactional
    public void cancelEvaluator(Long evaluatorId) {
        jdbcTemplate.update(
                "UPDATE hr_perf_evaluator SET status='CANCELLED', update_by=? WHERE id=? AND tenant_id=?",
                defaultOperator(), evaluatorId, TENANT_ID);
    }

    @Override
    public List<Map<String, Object>> listEvaluators(Long objectiveId, Long evaluateeId) {
        StringBuilder sql = new StringBuilder(
                "SELECT e.*, r.score AS response_score, r.dimension_scores AS response_dimensions, r.comment_text AS response_comment, r.submit_time AS response_submit_time "
                + "FROM hr_perf_evaluator e LEFT JOIN hr_perf_evaluator_response r ON r.evaluator_id = e.id AND r.deleted=0 "
                + "WHERE e.tenant_id=? AND e.deleted=0 AND e.objective_id=?");
        List<Object> args = new ArrayList<>(List.of(TENANT_ID, objectiveId));
        if (evaluateeId != null) {
            sql.append(" AND e.evaluatee_id=?");
            args.add(evaluateeId);
        }
        sql.append(" ORDER BY e.evaluatee_id, e.evaluator_source, e.id");
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), args.toArray());
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            result.add(toCamelRow(row));
        }
        return result;
    }

    @Override
    public List<Map<String, Object>> listPendingForEvaluator(Long evaluatorId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT e.*, o.objective_name, o.cycle_name FROM hr_perf_evaluator e "
                        + "LEFT JOIN hr_performance_objective o ON o.id = e.objective_id "
                        + "WHERE e.tenant_id=? AND e.deleted=0 AND e.evaluator_id=? AND e.status='PENDING' "
                        + "ORDER BY e.invite_time DESC, e.id DESC",
                TENANT_ID, evaluatorId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            result.add(toCamelRow(row));
        }
        return result;
    }

    @Override
    @Transactional
    public Map<String, Object> aggregate(Long objectiveId, Long evaluateeId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT e.evaluator_source, e.weight, r.score FROM hr_perf_evaluator e "
                        + "INNER JOIN hr_perf_evaluator_response r ON r.evaluator_id = e.id AND r.deleted=0 "
                        + "WHERE e.tenant_id=? AND e.deleted=0 AND e.objective_id=? AND e.evaluatee_id=? AND e.status='SUBMITTED'",
                TENANT_ID, objectiveId, evaluateeId);
        if (rows.isEmpty()) {
            throw new IllegalStateException("尚无任何评估人提交打分，无法聚合");
        }

        Map<String, List<BigDecimal>> bySource = new LinkedHashMap<>();
        Map<String, BigDecimal> weightBySource = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String source = String.valueOf(row.get("evaluator_source")).toUpperCase(Locale.ROOT);
            BigDecimal score = new BigDecimal(String.valueOf(row.get("score")));
            BigDecimal weight = new BigDecimal(String.valueOf(row.get("weight")));
            bySource.computeIfAbsent(source, k -> new ArrayList<>()).add(score);
            weightBySource.putIfAbsent(source, weight);
        }

        BigDecimal weightedSum = BigDecimal.ZERO;
        BigDecimal totalWeight = BigDecimal.ZERO;
        Map<String, BigDecimal> sourceAvg = new LinkedHashMap<>();
        for (Map.Entry<String, List<BigDecimal>> entry : bySource.entrySet()) {
            BigDecimal sum = BigDecimal.ZERO;
            for (BigDecimal s : entry.getValue()) {
                sum = sum.add(s);
            }
            BigDecimal avg = sum.divide(BigDecimal.valueOf(entry.getValue().size()), 2, RoundingMode.HALF_UP);
            BigDecimal weight = weightBySource.get(entry.getKey());
            sourceAvg.put(entry.getKey(), avg);
            weightedSum = weightedSum.add(avg.multiply(weight));
            totalWeight = totalWeight.add(weight);
        }
        BigDecimal aggregated = totalWeight.compareTo(BigDecimal.ZERO) > 0
                ? weightedSum.divide(totalWeight, 2, RoundingMode.HALF_UP)
                : weightedSum;
        String grade = gradeOfScore(aggregated);

        Long resultId = jdbcTemplate.query(
                "SELECT id FROM hr_performance_result WHERE tenant_id=? AND objective_id=? AND employee_id=? ORDER BY id DESC LIMIT 1",
                rs -> rs.next() ? rs.getLong("id") : null,
                TENANT_ID, objectiveId, evaluateeId);
        if (resultId == null) {
            resultId = insertAndReturnId(
                    "INSERT INTO hr_performance_result (tenant_id, objective_id, employee_id, score, grade, status) VALUES (?, ?, ?, ?, ?, 'DRAFT')",
                    TENANT_ID, objectiveId, evaluateeId, aggregated, grade);
        } else {
            jdbcTemplate.update(
                    "UPDATE hr_performance_result SET score=?, grade=? WHERE id=?",
                    aggregated, grade, resultId);
        }
        Long finalResultId = resultId;
        jdbcTemplate.update(
                "UPDATE hr_perf_evaluator SET result_id=? WHERE tenant_id=? AND objective_id=? AND evaluatee_id=?",
                finalResultId, TENANT_ID, objectiveId, evaluateeId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("resultId", resultId);
        result.put("objectiveId", objectiveId);
        result.put("evaluateeId", evaluateeId);
        result.put("score", aggregated);
        result.put("grade", grade);
        result.put("sourceAvg", sourceAvg);
        result.put("totalWeight", totalWeight);

        writeAuditLog("hr_performance_result", resultId, "AGGREGATE_360",
                Map.of(), result);
        return result;
    }

    // ============= helpers =============

    private String normalizeSource(String source) {
        String value = source == null ? "" : source.trim().toUpperCase(Locale.ROOT);
        if (!ALLOWED_SOURCES.contains(value)) {
            throw new IllegalArgumentException("evaluatorSource 非法: " + source);
        }
        return value;
    }

    private Long insertAndReturnId(String sql, Object... values) {
        return jdbcTemplate.execute((org.springframework.jdbc.core.ConnectionCallback<Long>) connection -> {
            PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < values.length; i++) {
                Object value = values[i];
                if (value == null) {
                    statement.setNull(i + 1, Types.NULL);
                } else {
                    statement.setObject(i + 1, value);
                }
            }
            statement.executeUpdate();
            try (var rs = statement.getGeneratedKeys()) {
                if (rs.next()) {
                    return rs.getLong(1);
                }
            }
            return null;
        });
    }

    private Map<String, Object> rowToMap(java.sql.ResultSet rs) throws java.sql.SQLException {
        Map<String, Object> map = new LinkedHashMap<>();
        java.sql.ResultSetMetaData md = rs.getMetaData();
        for (int i = 1; i <= md.getColumnCount(); i++) {
            map.put(md.getColumnLabel(i), rs.getObject(i));
        }
        return map;
    }

    private Map<String, Object> toCamelRow(Map<String, Object> row) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            result.put(toCamel(entry.getKey()), entry.getValue());
        }
        return result;
    }

    private String toCamel(String key) {
        StringBuilder builder = new StringBuilder();
        boolean upperNext = false;
        for (char ch : key.toCharArray()) {
            if (ch == '_') {
                upperNext = true;
                continue;
            }
            builder.append(upperNext ? Character.toUpperCase(ch) : Character.toLowerCase(ch));
            upperNext = false;
        }
        return builder.toString();
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("JSON序列化失败", e);
        }
    }

    private String defaultOperator() {
        String name = UserContext.getUserName();
        return StringUtils.hasText(name) ? name : "system";
    }

    private String gradeOfScore(BigDecimal score) {
        if (score.compareTo(BigDecimal.valueOf(95)) >= 0) return "S";
        if (score.compareTo(BigDecimal.valueOf(85)) >= 0) return "A";
        if (score.compareTo(BigDecimal.valueOf(75)) >= 0) return "B";
        if (score.compareTo(BigDecimal.valueOf(60)) >= 0) return "C";
        return "D";
    }

    private void writeAuditLog(String tableName, Long businessId, String operationType,
                               Map<String, Object> before, Map<String, Object> after) {
        try {
            jdbcTemplate.update(
                    "INSERT INTO hr_audit_log (tenant_id, business_domain, business_id, operation_type, operator_id, operator_name, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    TENANT_ID, tableName, businessId, operationType,
                    UserContext.getUserId(), UserContext.getUserName(),
                    writeJson(before == null ? Map.of() : before),
                    writeJson(after == null ? Map.of() : after));
        } catch (Exception ignored) {
        }
    }
}
