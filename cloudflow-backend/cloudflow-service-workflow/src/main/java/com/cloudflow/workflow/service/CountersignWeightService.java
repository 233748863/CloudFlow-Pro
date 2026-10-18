package com.cloudflow.workflow.service;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.monitor.AnomalyAlert;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.AnomalyAlertMapper;
import com.cloudflow.workflow.service.monitor.IAnomalyDetectionService;
import com.cloudflow.workflow.service.remote.RemoteHrApprovalService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class CountersignWeightService {
    private final RemoteHrApprovalService hrService;
    private final AnomalyAlertMapper alertMapper;
    private final IAnomalyDetectionService anomalyService;

    public static void validate(WfNodeConfig node) {
        if (node == null || !"WEIGHT".equals(node.getSignType())) {
            return;
        }
        decimal(node.getPassWeight(), "通过权重", new BigDecimal("99999999.99"), false);
        String source = source(node);
        if (!Set.of("EQUAL", "BY_CONFIG", "BY_JOB_LEVEL").contains(source)) {
            throw WorkflowException.validationError("未知权重来源: " + source);
        }
        if (!"EQUAL".equals(source)) {
            configuredWeights(node, "BY_CONFIG".equals(source) ? "userId" : "jobLevelId");
        }
    }

    public Map<Long, BigDecimal> resolve(WfNodeConfig node, WfProcessInstance instance, List<Long> voters) {
        validate(node);
        Map<Long, BigDecimal> result = new LinkedHashMap<>();
        Map<Long, BigDecimal> configured = "EQUAL".equals(source(node)) ? Map.of()
                : configuredWeights(node, "BY_CONFIG".equals(source(node)) ? "userId" : "jobLevelId");
        Map<Long, Long> levels = Map.of();
        boolean fallback = false;
        if ("BY_JOB_LEVEL".equals(source(node))) {
            try {
                R<List<Map<String, Object>>> response = hrService.listJobLevels(instance.getTenantId(), voters);
                if (response == null || response.getCode() != 200 || response.getData() == null) {
                    throw new IllegalStateException("HR职级查询未成功");
                }
                levels = new LinkedHashMap<>();
                for (Map<String, Object> row : response.getData()) {
                    if (!Objects.equals(instance.getTenantId(), identifier(row.get("tenantId")))) {
                        throw new IllegalStateException("HR职级返回租户不匹配");
                    }
                    Long voterId = identifier(row.get("userId"));
                    Long jobLevelId = identifier(row.get("jobLevelId"));
                    if (!voters.contains(voterId) || levels.putIfAbsent(voterId, jobLevelId) != null) {
                        throw new IllegalStateException("HR职级返回重复或未知用户");
                    }
                }
                if (!levels.keySet().containsAll(voters)) {
                    throw new IllegalStateException("HR职级数据不完整");
                }
            } catch (Exception failure) {
                fallback = true;
                warnFallback(instance, node);
            }
        }
        for (Long voterId : voters) {
            if (voterId == null || result.containsKey(voterId)) {
                throw WorkflowException.validationError("票签参与人无效或重复");
            }
            BigDecimal weight = BigDecimal.ONE;
            if (!fallback && !"EQUAL".equals(source(node))) {
                Long key = "BY_CONFIG".equals(source(node)) ? voterId : levels.get(voterId);
                weight = configured.get(key);
                if (weight == null) {
                    throw WorkflowException.validationError("参与人或其职级未配置票权: " + voterId);
                }
            }
            result.put(voterId, weight);
        }
        return result;
    }

    public static BigDecimal total(Map<Long, BigDecimal> weights, BigDecimal passWeight) {
        BigDecimal total = weights.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        decimal(total, "总权重", new BigDecimal("99999999.99"), false);
        if (passWeight.compareTo(total) > 0) {
            throw WorkflowException.validationError("通过权重不能超过参与人的总权重");
        }
        return total;
    }

    private static String source(WfNodeConfig node) {
        return node.getWeightSource() == null ? "EQUAL" : node.getWeightSource();
    }

    private static Map<Long, BigDecimal> configuredWeights(WfNodeConfig node, String key) {
        if (node.getAssigneeWeights() == null || node.getAssigneeWeights().isEmpty()) {
            throw WorkflowException.validationError("请配置人员或职级对应的票权");
        }
        Map<Long, BigDecimal> configured = new LinkedHashMap<>();
        for (Map<String, Object> entry : node.getAssigneeWeights()) {
            if (entry == null || !Set.of(key, "weight").equals(entry.keySet())) {
                throw WorkflowException.validationError("票权配置仅允许 " + key + " 和 weight");
            }
            Long identifier = identifier(entry.get(key));
            BigDecimal weight = decimal(entry.get("weight"), "单人权重", new BigDecimal("9999.99"), true);
            if (configured.putIfAbsent(identifier, weight) != null) {
                throw WorkflowException.validationError("票权配置编号重复: " + identifier);
            }
        }
        return configured;
    }

    private static Long identifier(Object value) {
        try {
            long identifier = new BigDecimal(String.valueOf(value)).longValueExact();
            if (identifier > 0) {
                return identifier;
            }
        } catch (RuntimeException ignored) {
        }
        throw WorkflowException.validationError("人员、职级或租户编号无效");
    }

    private static BigDecimal decimal(Object value, String label, BigDecimal maximum, boolean allowZero) {
        try {
            BigDecimal number = new BigDecimal(String.valueOf(value)).setScale(2, RoundingMode.UNNECESSARY);
            if (number.signum() >= (allowZero ? 0 : 1) && number.compareTo(maximum) <= 0) {
                return number;
            }
        } catch (RuntimeException ignored) {
        }
        throw WorkflowException.validationError(label + "必须为" + (allowZero ? "非负" : "正")
                + "数、最多两位小数且不超过" + maximum);
    }

    private void warnFallback(WfProcessInstance instance, WfNodeConfig node) {
        log.warn("职级读取失败，票签降级等权: instanceId={}, nodeKey={}", instance.getInstanceId(), node.getId());
        AnomalyAlert alert = new AnomalyAlert();
        alert.setTenantId(instance.getTenantId());
        alert.setInstanceId(instance.getInstanceId());
        alert.setProcessDefKey(instance.getProcessDefKey());
        alert.setProcessName(instance.getTitle());
        alert.setNodeKey(node.getId());
        alert.setNodeName(node.getTitle());
        alert.setAnomalyType("WEIGHT_FALLBACK");
        alert.setSeverity("MEDIUM");
        alert.setErrorMessage("HR职级读取失败，已降级为每人1票；通过阈值保持配置值");
        alert.setResolved("N");
        alert.setNotificationSent("N");
        alert.setAlertTime(LocalDateTime.now());
        alert.setCreateTime(LocalDateTime.now());
        alert.setUpdateTime(LocalDateTime.now());
        alertMapper.insert(alert);
        anomalyService.sendAnomalyAlert(alert);
    }
}
