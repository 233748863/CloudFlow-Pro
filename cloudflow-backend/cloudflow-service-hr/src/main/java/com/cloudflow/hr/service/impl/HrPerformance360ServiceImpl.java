package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.hr.domain.dto.Hr360EvaluatorInvitePayload;
import com.cloudflow.hr.domain.dto.Hr360EvaluatorResponsePayload;
import com.cloudflow.hr.domain.entity.HrPerfEvaluator;
import com.cloudflow.hr.domain.entity.HrPerfEvaluatorResponse;
import com.cloudflow.hr.domain.entity.HrPerformanceResult;
import com.cloudflow.hr.domain.vo.performance.Hr360AggregateVO;
import com.cloudflow.hr.domain.vo.performance.Hr360EvaluatorRowVO;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrPerfEvaluatorMapper;
import com.cloudflow.hr.mapper.HrPerfEvaluatorResponseMapper;
import com.cloudflow.hr.mapper.HrPerformanceResultMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.hr.service.HrPerformance360Service;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
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

    private final HrPerfEvaluatorMapper evaluatorMapper;
    private final HrPerfEvaluatorResponseMapper responseMapper;
    private final HrPerformanceResultMapper performanceResultMapper;
    private final HrAuditLogMapper auditLogMapper;
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

            HrPerfEvaluator existing = evaluatorMapper.selectOne(
                    new LambdaQueryWrapper<HrPerfEvaluator>()
                            .eq(HrPerfEvaluator::getTenantId, TENANT_ID)
                            .eq(HrPerfEvaluator::getObjectiveId, payload.getObjectiveId())
                            .eq(HrPerfEvaluator::getEvaluateeId, payload.getEvaluateeId())
                            .eq(HrPerfEvaluator::getEvaluatorId, item.getEvaluatorId())
                            .eq(HrPerfEvaluator::getEvaluatorSource, source)
                            .eq(HrPerfEvaluator::getDeleted, 0));
            if (existing != null) {
                existing.setWeight(weight);
                existing.setStatus("PENDING");
                existing.setInviteTime(LocalDateTime.now());
                existing.setUpdateBy(defaultOperator());
                evaluatorMapper.updateById(existing);
                ids.add(existing.getId());
                continue;
            }

            HrPerfEvaluator entity = new HrPerfEvaluator();
            entity.setTenantId(TENANT_ID);
            entity.setObjectiveId(payload.getObjectiveId());
            entity.setAssignmentId(payload.getAssignmentId());
            entity.setEvaluateeId(payload.getEvaluateeId());
            entity.setEvaluateeName(payload.getEvaluateeName());
            entity.setEvaluatorId(item.getEvaluatorId());
            entity.setEvaluatorName(item.getEvaluatorName());
            entity.setEvaluatorSource(source);
            entity.setWeight(weight);
            entity.setStatus("PENDING");
            entity.setInviteTime(LocalDateTime.now());
            entity.setRemindCount(0);
            entity.setCreateBy(defaultOperator());
            entity.setUpdateBy(defaultOperator());
            entity.setDeleted(0);
            evaluatorMapper.insert(entity);
            ids.add(entity.getId());
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
        HrPerfEvaluator evaluator = evaluatorMapper.selectOne(
                new LambdaQueryWrapper<HrPerfEvaluator>()
                        .eq(HrPerfEvaluator::getId, payload.getEvaluatorId())
                        .eq(HrPerfEvaluator::getTenantId, TENANT_ID)
                        .eq(HrPerfEvaluator::getDeleted, 0));
        if (evaluator == null) {
            throw new IllegalArgumentException("评估邀请不存在");
        }
        if (!"PENDING".equalsIgnoreCase(evaluator.getStatus())) {
            throw new IllegalStateException("评估邀请状态非 PENDING，不可再提交");
        }
        List<Map<String, Object>> dimensionScores = payload.getDimensionScores() == null
                ? List.of() : payload.getDimensionScores();

        HrPerfEvaluatorResponse existingResp = responseMapper.selectOne(
                new LambdaQueryWrapper<HrPerfEvaluatorResponse>()
                        .eq(HrPerfEvaluatorResponse::getTenantId, TENANT_ID)
                        .eq(HrPerfEvaluatorResponse::getEvaluatorId, payload.getEvaluatorId())
                        .eq(HrPerfEvaluatorResponse::getDeleted, 0));
        if (existingResp == null) {
            HrPerfEvaluatorResponse resp = new HrPerfEvaluatorResponse();
            resp.setTenantId(TENANT_ID);
            resp.setEvaluatorId(payload.getEvaluatorId());
            resp.setObjectiveId(evaluator.getObjectiveId());
            resp.setEvaluateeId(evaluator.getEvaluateeId());
            resp.setEvaluatorSource(evaluator.getEvaluatorSource());
            resp.setScore(payload.getScore());
            resp.setDimensionScores(dimensionScores);
            resp.setCommentText(payload.getCommentText());
            resp.setSubmitTime(LocalDateTime.now());
            resp.setCreateBy(defaultOperator());
            resp.setUpdateBy(defaultOperator());
            resp.setDeleted(0);
            responseMapper.insert(resp);
        } else {
            existingResp.setScore(payload.getScore());
            existingResp.setDimensionScores(dimensionScores);
            existingResp.setCommentText(payload.getCommentText());
            existingResp.setSubmitTime(LocalDateTime.now());
            existingResp.setUpdateBy(defaultOperator());
            responseMapper.updateById(existingResp);
        }

        evaluator.setStatus("SUBMITTED");
        evaluator.setUpdateBy(defaultOperator());
        evaluatorMapper.updateById(evaluator);

        writeAuditLog("hr_perf_evaluator_response", payload.getEvaluatorId(), "SUBMIT",
                Map.of(),
                Map.of("score", payload.getScore()));
    }

    @Override
    @Transactional
    public void cancelEvaluator(Long evaluatorId) {
        evaluatorMapper.update(null, new LambdaUpdateWrapper<HrPerfEvaluator>()
                .eq(HrPerfEvaluator::getId, evaluatorId)
                .eq(HrPerfEvaluator::getTenantId, TENANT_ID)
                .set(HrPerfEvaluator::getStatus, "CANCELLED")
                .set(HrPerfEvaluator::getUpdateBy, defaultOperator()));
    }

    @Override
    public List<Hr360EvaluatorRowVO> listEvaluators(Long objectiveId, Long evaluateeId) {
        List<Map<String, Object>> rows = evaluatorMapper.selectEvaluatorsWithResponse(TENANT_ID, objectiveId, evaluateeId);
        return MapConverters.toVOList(rows, Hr360EvaluatorRowVO.class, objectMapper);
    }

    @Override
    public List<Hr360EvaluatorRowVO> listPendingForEvaluator(Long evaluatorId) {
        List<Map<String, Object>> rows = evaluatorMapper.selectPendingForEvaluator(TENANT_ID, evaluatorId);
        return MapConverters.toVOList(rows, Hr360EvaluatorRowVO.class, objectMapper);
    }

    @Override
    @Transactional
    public Hr360AggregateVO aggregate(Long objectiveId, Long evaluateeId) {
        List<Map<String, Object>> rows = evaluatorMapper.selectAggregationRows(TENANT_ID, objectiveId, evaluateeId);
        if (rows.isEmpty()) {
            throw new IllegalStateException("尚无任何评估人提交打分，无法聚合");
        }

        Map<String, List<BigDecimal>> bySource = new LinkedHashMap<>();
        Map<String, BigDecimal> weightBySource = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String source = String.valueOf(row.get("evaluatorSource")).toUpperCase(Locale.ROOT);
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

        HrPerformanceResult existingResult = performanceResultMapper.selectOne(
                new LambdaQueryWrapper<HrPerformanceResult>()
                        .eq(HrPerformanceResult::getTenantId, TENANT_ID)
                        .eq(HrPerformanceResult::getObjectiveId, objectiveId)
                        .eq(HrPerformanceResult::getEmployeeId, evaluateeId)
                        .orderByDesc(HrPerformanceResult::getId)
                        .last("LIMIT 1"));
        Long resultId;
        if (existingResult == null) {
            HrPerformanceResult entity = new HrPerformanceResult();
            entity.setTenantId(TENANT_ID);
            entity.setObjectiveId(objectiveId);
            entity.setEmployeeId(evaluateeId);
            entity.setScore(aggregated);
            entity.setGrade(grade);
            entity.setStatus("DRAFT");
            performanceResultMapper.insert(entity);
            resultId = entity.getId();
        } else {
            existingResult.setScore(aggregated);
            existingResult.setGrade(grade);
            performanceResultMapper.updateById(existingResult);
            resultId = existingResult.getId();
        }
        evaluatorMapper.update(null, new LambdaUpdateWrapper<HrPerfEvaluator>()
                .eq(HrPerfEvaluator::getTenantId, TENANT_ID)
                .eq(HrPerfEvaluator::getObjectiveId, objectiveId)
                .eq(HrPerfEvaluator::getEvaluateeId, evaluateeId)
                .set(HrPerfEvaluator::getResultId, resultId));

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
        return objectMapper.convertValue(result, Hr360AggregateVO.class);
    }

    // ============= helpers =============

    private String normalizeSource(String source) {
        String value = source == null ? "" : source.trim().toUpperCase(Locale.ROOT);
        if (!ALLOWED_SOURCES.contains(value)) {
            throw new IllegalArgumentException("evaluatorSource 非法: " + source);
        }
        return value;
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
            auditLogMapper.insertLog(
                    TENANT_ID, tableName, businessId, operationType,
                    UserContext.getUserId(), UserContext.getUserName(),
                    writeJson(before == null ? Map.of() : before),
                    writeJson(after == null ? Map.of() : after));
        } catch (Exception ignored) {
        }
    }
}
