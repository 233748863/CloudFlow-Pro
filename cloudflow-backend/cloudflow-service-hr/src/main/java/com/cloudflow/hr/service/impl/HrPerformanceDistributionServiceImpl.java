package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.HrPerfDistributionCheckPayload;
import com.cloudflow.hr.domain.dto.HrPerfDistributionRulePayload;
import com.cloudflow.hr.service.HrPerformanceDistributionService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
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

/**
 * HR-P0-2 强制分布实现。
 * - listRules：返回 objective_id IS NULL(全局默认) + objective_id=? 的并集。
 * - saveRule：upsert(无 id 则插入，有 id 则更新)，distribution 落 JSON 列。
 * - validate：依据规则配额 vs 实际评分等级数量计算 violations，BLOCK 模式时 valid=false。
 */
@Service
@RequiredArgsConstructor
public class HrPerformanceDistributionServiceImpl implements HrPerformanceDistributionService {

    private static final long TENANT_ID = 100000L;
    private static final TypeReference<List<LinkedHashMap<String, Object>>> LIST_MAP_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @Override
    public List<Map<String, Object>> listRules(Long objectiveId) {
        StringBuilder sql = new StringBuilder("SELECT * FROM hr_perf_distribution_rule WHERE tenant_id=? AND deleted=0");
        List<Object> args = new ArrayList<>(List.of(TENANT_ID));
        if (objectiveId != null) {
            sql.append(" AND (objective_id IS NULL OR objective_id=?)");
            args.add(objectiveId);
        }
        sql.append(" ORDER BY objective_id IS NULL DESC, id DESC");
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), args.toArray());
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> camel = toCamelRow(row);
            camel.put("distribution", parseList(row.get("distribution")));
            result.add(camel);
        }
        return result;
    }

    @Override
    @Transactional
    public Long saveRule(HrPerfDistributionRulePayload payload) {
        if (payload == null || !StringUtils.hasText(payload.getRuleName())) {
            throw new IllegalArgumentException("ruleName 不能为空");
        }
        if (payload.getDistribution() == null || payload.getDistribution().isEmpty()) {
            throw new IllegalArgumentException("distribution 不能为空");
        }
        String distJson = writeJson(payload.getDistribution());
        String enforceMode = StringUtils.hasText(payload.getEnforceMode())
                ? payload.getEnforceMode().toUpperCase(Locale.ROOT) : "BLOCK";
        String status = StringUtils.hasText(payload.getStatus())
                ? payload.getStatus().toUpperCase(Locale.ROOT) : "ACTIVE";

        if (payload.getId() == null) {
            return insertAndReturnId(
                    "INSERT INTO hr_perf_distribution_rule (tenant_id, objective_id, rule_name, distribution, total_population, enforce_mode, status, remark, create_by, update_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    TENANT_ID,
                    payload.getObjectiveId(),
                    payload.getRuleName(),
                    distJson,
                    payload.getTotalPopulation(),
                    enforceMode,
                    status,
                    payload.getRemark(),
                    defaultOperator(),
                    defaultOperator()
            );
        }
        jdbcTemplate.update(
                "UPDATE hr_perf_distribution_rule SET objective_id=?, rule_name=?, distribution=?, total_population=?, enforce_mode=?, status=?, remark=?, update_by=? WHERE id=? AND tenant_id=?",
                payload.getObjectiveId(),
                payload.getRuleName(),
                distJson,
                payload.getTotalPopulation(),
                enforceMode,
                status,
                payload.getRemark(),
                defaultOperator(),
                payload.getId(),
                TENANT_ID
        );
        return payload.getId();
    }

    @Override
    @Transactional
    public void deleteRule(Long id) {
        jdbcTemplate.update(
                "UPDATE hr_perf_distribution_rule SET deleted=1, update_by=? WHERE id=? AND tenant_id=?",
                defaultOperator(), id, TENANT_ID);
    }

    @Override
    public Map<String, Object> validate(HrPerfDistributionCheckPayload payload) {
        if (payload == null || payload.getObjectiveId() == null) {
            throw new IllegalArgumentException("objectiveId 不能为空");
        }
        List<Map<String, Object>> grades = payload.getGrades() == null ? List.of() : payload.getGrades();
        int total = grades.size();

        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Map<String, Object> item : grades) {
            String grade = resolveGrade(item);
            counts.merge(grade, 1, Integer::sum);
        }

        // 选规则：优先目标专属规则，其次全局规则(objective_id IS NULL)
        Map<String, Object> rule = jdbcTemplate.query(
                "SELECT * FROM hr_perf_distribution_rule WHERE tenant_id=? AND deleted=0 AND status='ACTIVE' AND objective_id=? ORDER BY id DESC LIMIT 1",
                rs -> rs.next() ? rowToMap(rs) : null,
                TENANT_ID, payload.getObjectiveId());
        if (rule == null) {
            rule = jdbcTemplate.query(
                    "SELECT * FROM hr_perf_distribution_rule WHERE tenant_id=? AND deleted=0 AND status='ACTIVE' AND objective_id IS NULL ORDER BY id DESC LIMIT 1",
                    rs -> rs.next() ? rowToMap(rs) : null,
                    TENANT_ID);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("total", total);
        response.put("countsByGrade", counts);
        if (rule == null) {
            response.put("valid", true);
            response.put("hasRule", false);
            return response;
        }
        List<Map<String, Object>> distribution = parseList(rule.get("distribution"));
        String enforceMode = String.valueOf(rule.getOrDefault("enforce_mode", "BLOCK")).toUpperCase(Locale.ROOT);

        Map<String, Map<String, Object>> quotaByGrade = new LinkedHashMap<>();
        List<Map<String, Object>> violations = new ArrayList<>();
        for (Map<String, Object> dist : distribution) {
            String grade = String.valueOf(dist.get("grade")).toUpperCase(Locale.ROOT);
            BigDecimal percent = new BigDecimal(String.valueOf(dist.getOrDefault("percent", "0")));
            int expectedMax = percent.multiply(BigDecimal.valueOf(total))
                    .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP)
                    .intValue();
            Integer minCount = dist.get("minCount") == null ? null : Integer.valueOf(String.valueOf(dist.get("minCount")));
            Integer maxCount = dist.get("maxCount") == null ? null : Integer.valueOf(String.valueOf(dist.get("maxCount")));
            int actual = counts.getOrDefault(grade, 0);
            int maxAllowed = maxCount != null ? maxCount : expectedMax;
            int minAllowed = minCount != null ? minCount : 0;

            Map<String, Object> q = new LinkedHashMap<>();
            q.put("percent", percent);
            q.put("expectedMax", expectedMax);
            q.put("minAllowed", minAllowed);
            q.put("maxAllowed", maxAllowed);
            q.put("actual", actual);
            quotaByGrade.put(grade, q);

            if (actual > maxAllowed) {
                violations.add(Map.of(
                        "grade", grade,
                        "type", "OVER",
                        "actual", actual,
                        "maxAllowed", maxAllowed,
                        "exceedBy", actual - maxAllowed));
            } else if (actual < minAllowed) {
                violations.add(Map.of(
                        "grade", grade,
                        "type", "UNDER",
                        "actual", actual,
                        "minAllowed", minAllowed,
                        "shortBy", minAllowed - actual));
            }
        }

        boolean valid = violations.isEmpty() || !"BLOCK".equals(enforceMode);
        response.put("valid", valid);
        response.put("hasRule", true);
        response.put("ruleId", rule.get("id"));
        response.put("ruleName", rule.get("rule_name"));
        response.put("enforceMode", enforceMode);
        response.put("quotaByGrade", quotaByGrade);
        response.put("violations", violations);
        return response;
    }

    // ============= helpers =============

    private String resolveGrade(Map<String, Object> item) {
        Object grade = item.get("grade");
        if (grade != null && StringUtils.hasText(String.valueOf(grade))) {
            return String.valueOf(grade).toUpperCase(Locale.ROOT);
        }
        Object score = item.get("score");
        if (score == null || !StringUtils.hasText(String.valueOf(score))) {
            return "D";
        }
        BigDecimal s = new BigDecimal(String.valueOf(score));
        if (s.compareTo(BigDecimal.valueOf(95)) >= 0) return "S";
        if (s.compareTo(BigDecimal.valueOf(85)) >= 0) return "A";
        if (s.compareTo(BigDecimal.valueOf(75)) >= 0) return "B";
        if (s.compareTo(BigDecimal.valueOf(60)) >= 0) return "C";
        return "D";
    }

    private List<Map<String, Object>> parseList(Object value) {
        if (value == null) return List.of();
        if (value instanceof java.util.Collection<?> collection) {
            List<Map<String, Object>> result = new ArrayList<>();
            for (Object o : collection) {
                if (o instanceof Map<?, ?> m) {
                    Map<String, Object> r = new LinkedHashMap<>();
                    m.forEach((k, v) -> r.put(String.valueOf(k), v));
                    result.add(r);
                }
            }
            return result;
        }
        String text = String.valueOf(value);
        if (!StringUtils.hasText(text)) return List.of();
        try {
            return new ArrayList<>(objectMapper.readValue(text, LIST_MAP_TYPE));
        } catch (JsonProcessingException e) {
            return List.of();
        }
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
            String key = entry.getKey();
            StringBuilder builder = new StringBuilder();
            boolean upperNext = false;
            for (char ch : key.toCharArray()) {
                if (ch == '_') { upperNext = true; continue; }
                builder.append(upperNext ? Character.toUpperCase(ch) : Character.toLowerCase(ch));
                upperNext = false;
            }
            result.put(builder.toString(), entry.getValue());
        }
        return result;
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
}
