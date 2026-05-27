package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.hr.domain.dto.HrPerfDistributionCheckPayload;
import com.cloudflow.hr.domain.dto.HrPerfDistributionRulePayload;
import com.cloudflow.hr.domain.entity.HrPerfDistributionRule;
import com.cloudflow.hr.domain.vo.performance.HrPerfDistributionRuleVO;
import com.cloudflow.hr.domain.vo.performance.HrPerfDistributionValidateVO;
import com.cloudflow.hr.mapper.HrPerfDistributionRuleMapper;
import com.cloudflow.hr.service.IHrPerformanceDistributionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
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
public class HrPerformanceDistributionServiceImpl implements IHrPerformanceDistributionService {

    private static final long TENANT_ID = 100000L;

    private final HrPerfDistributionRuleMapper distributionRuleMapper;
    private final ObjectMapper objectMapper;

    @Override
    public List<HrPerfDistributionRuleVO> listRules(Long objectiveId) {
        LambdaQueryWrapper<HrPerfDistributionRule> qw = new LambdaQueryWrapper<HrPerfDistributionRule>()
                .eq(HrPerfDistributionRule::getTenantId, TENANT_ID)
                .eq(HrPerfDistributionRule::getDeleted, 0);
        if (objectiveId != null) {
            qw.and(w -> w.isNull(HrPerfDistributionRule::getObjectiveId)
                    .or().eq(HrPerfDistributionRule::getObjectiveId, objectiveId));
        }
        List<HrPerfDistributionRule> rows = distributionRuleMapper.selectList(qw);
        // 全局规则(objectiveId IS NULL) 排在前；同组按 id DESC
        rows.sort(Comparator
                .comparing((HrPerfDistributionRule r) -> r.getObjectiveId() != null)
                .thenComparing(HrPerfDistributionRule::getId, Comparator.reverseOrder()));
        List<Map<String, Object>> result = new ArrayList<>();
        for (HrPerfDistributionRule row : rows) {
            Map<String, Object> camel = objectMapper.convertValue(row,
                    new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() {});
            camel.put("distribution", row.getDistribution() == null ? List.of() : row.getDistribution());
            result.add(camel);
        }
        return MapConverters.toVOList(result, HrPerfDistributionRuleVO.class, objectMapper);
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
        String enforceMode = StringUtils.hasText(payload.getEnforceMode())
                ? payload.getEnforceMode().toUpperCase(Locale.ROOT) : "BLOCK";
        String status = StringUtils.hasText(payload.getStatus())
                ? payload.getStatus().toUpperCase(Locale.ROOT) : "ACTIVE";

        if (payload.getId() == null) {
            HrPerfDistributionRule entity = new HrPerfDistributionRule();
            entity.setTenantId(TENANT_ID);
            entity.setObjectiveId(payload.getObjectiveId());
            entity.setRuleName(payload.getRuleName());
            entity.setDistribution(payload.getDistribution());
            entity.setTotalPopulation(payload.getTotalPopulation());
            entity.setEnforceMode(enforceMode);
            entity.setStatus(status);
            entity.setRemark(payload.getRemark());
            entity.setCreateBy(defaultOperator());
            entity.setUpdateBy(defaultOperator());
            entity.setDeleted(0);
            distributionRuleMapper.insert(entity);
            return entity.getId();
        }
        HrPerfDistributionRule entity = distributionRuleMapper.selectOne(
                new LambdaQueryWrapper<HrPerfDistributionRule>()
                        .eq(HrPerfDistributionRule::getId, payload.getId())
                        .eq(HrPerfDistributionRule::getTenantId, TENANT_ID));
        if (entity == null) {
            throw new IllegalArgumentException("规则不存在：" + payload.getId());
        }
        entity.setObjectiveId(payload.getObjectiveId());
        entity.setRuleName(payload.getRuleName());
        entity.setDistribution(payload.getDistribution());
        entity.setTotalPopulation(payload.getTotalPopulation());
        entity.setEnforceMode(enforceMode);
        entity.setStatus(status);
        entity.setRemark(payload.getRemark());
        entity.setUpdateBy(defaultOperator());
        distributionRuleMapper.updateById(entity);
        return payload.getId();
    }

    @Override
    @Transactional
    public void deleteRule(Long id) {
        HrPerfDistributionRule entity = distributionRuleMapper.selectOne(
                new LambdaQueryWrapper<HrPerfDistributionRule>()
                        .eq(HrPerfDistributionRule::getId, id)
                        .eq(HrPerfDistributionRule::getTenantId, TENANT_ID));
        if (entity == null) {
            return;
        }
        entity.setDeleted(1);
        entity.setUpdateBy(defaultOperator());
        distributionRuleMapper.updateById(entity);
    }

    @Override
    public HrPerfDistributionValidateVO validate(HrPerfDistributionCheckPayload payload) {
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
        HrPerfDistributionRule rule = distributionRuleMapper.selectOne(
                new LambdaQueryWrapper<HrPerfDistributionRule>()
                        .eq(HrPerfDistributionRule::getTenantId, TENANT_ID)
                        .eq(HrPerfDistributionRule::getDeleted, 0)
                        .eq(HrPerfDistributionRule::getStatus, "ACTIVE")
                        .eq(HrPerfDistributionRule::getObjectiveId, payload.getObjectiveId())
                        .orderByDesc(HrPerfDistributionRule::getId)
                        .last("LIMIT 1"));
        if (rule == null) {
            rule = distributionRuleMapper.selectOne(
                    new LambdaQueryWrapper<HrPerfDistributionRule>()
                            .eq(HrPerfDistributionRule::getTenantId, TENANT_ID)
                            .eq(HrPerfDistributionRule::getDeleted, 0)
                            .eq(HrPerfDistributionRule::getStatus, "ACTIVE")
                            .isNull(HrPerfDistributionRule::getObjectiveId)
                            .orderByDesc(HrPerfDistributionRule::getId)
                            .last("LIMIT 1"));
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("total", total);
        response.put("countsByGrade", counts);
        if (rule == null) {
            response.put("valid", true);
            response.put("hasRule", false);
            return objectMapper.convertValue(response, HrPerfDistributionValidateVO.class);
        }
        List<Map<String, Object>> distribution = rule.getDistribution() == null ? List.of() : rule.getDistribution();
        String enforceMode = String.valueOf(rule.getEnforceMode() == null ? "BLOCK" : rule.getEnforceMode()).toUpperCase(Locale.ROOT);

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
        response.put("ruleId", rule.getId());
        response.put("ruleName", rule.getRuleName());
        response.put("enforceMode", enforceMode);
        response.put("quotaByGrade", quotaByGrade);
        response.put("violations", violations);
        return objectMapper.convertValue(response, HrPerfDistributionValidateVO.class);
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

    private String defaultOperator() {
        String name = UserContext.getUserName();
        return StringUtils.hasText(name) ? name : "system";
    }
}
