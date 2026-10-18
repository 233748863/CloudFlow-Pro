package com.cloudflow.workflow.handler.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.handler.INodeHandler;
import com.cloudflow.workflow.service.TimerSchedulerService;
import com.cloudflow.workflow.service.WorkflowProcessStateService;
import com.cloudflow.workflow.service.WorkflowVariableSubstitution;
import com.cloudflow.workflow.service.WorkflowWaitState;
import com.cloudflow.workflow.service.remote.RemoteHrApprovalService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class TimerNodeHandler implements INodeHandler {
    private final TimerSchedulerService timerScheduler;
    private final HolidayCalendarService calendarService;
    private final RemoteHrApprovalService hrService;
    private final WorkflowProcessStateService stateService;

    @Override
    public String getNodeType() {
        return "TIMER";
    }

    @Override
    public boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        if (shouldSkipTimer(variables) || node.getProps() == null) {
            return true;
        }
        Map<String, Object> props = node.getProps();
        Long expireAt = calculateExpiry(props, instance, variables, LocalDateTime.now());
        if (expireAt == null) {
            return true;
        }
        if (expireAt <= System.currentTimeMillis()) {
            if (!props.containsKey("timerAction") && !"FIXED_TIME".equals(props.get("timerType"))) return true;
            expireAt = System.currentTimeMillis();
        }
        String generation = UUID.randomUUID().toString();
        Map<String, Object> timerData = new HashMap<>();
        timerData.put("timerType", props.getOrDefault("timerType", "DELAY"));
        timerData.put("timerAction", props.getOrDefault("timerAction", "AUTO_PASS"));
        timerData.put("expireAt", expireAt);
        timerData.put("retryCount", 0);
        WorkflowWaitState.Pending pending = WorkflowWaitState.register(instance, variables, generation, "TIMER", node.getId(), timerData);
        stateService.transition(instance, WfProcessStatus.PENDING);
        timerScheduler.scheduleAfterCommit(instance, pending);
        log.info("定时节点等待中: instanceId={}, nodeKey={}, expireAt={}", instance.getInstanceId(), node.getId(), expireAt);
        return false;
    }

    public Long calculateExpiry(Map<String, Object> props, WfProcessInstance instance,
                                 Map<String, Object> variables, LocalDateTime now) {
        String timerType = String.valueOf(props.getOrDefault("timerType", "DELAY"));
        if ("SCHEDULE".equals(timerType)) {
            Object rawTime = props.get("scheduleTime");
            if (rawTime == null || !StringUtils.hasText(String.valueOf(rawTime))) {
                return null;
            }
            try {
                return epoch(parseTime(String.valueOf(rawTime)));
            } catch (RuntimeException ignored) {
                return null;
            }
        }
        if ("FIXED_TIME".equals(timerType)) {
            String fixed = WorkflowVariableSubstitution.replace(String.valueOf(props.get("fixedTime")), variables,
                    props.get("allowedVariables"));
            try {
                return epoch(parseTime(fixed));
            } catch (RuntimeException failure) {
                throw WorkflowException.validationError("固定时间格式应为yyyy-MM-dd HH:mm:ss");
            }
        }
        if ("CRON_ONCE".equals(timerType)) {
            LocalDateTime next = CronExpression.parse(String.valueOf(props.get("cronExpression"))).next(now);
            if (next == null) {
                throw WorkflowException.validationError("定时表达式没有下一次执行时间");
            }
            return epoch(next);
        }
        if (!props.containsKey("delayValue")) {
            try {
                Object value = props.get("delayMinutes");
                int minutes = value instanceof Number number ? number.intValue() : Integer.parseInt(String.valueOf(value));
                return minutes <= 0 ? null : epoch(now.plusMinutes(minutes));
            } catch (RuntimeException ignored) {
                return null;
            }
        }
        int amount = delayValue(props);
        String unit = String.valueOf(props.getOrDefault("delayUnit", "HOUR"));
        LocalDateTime target = switch (unit) {
            case "MINUTE" -> now.plusMinutes(amount);
            case "HOUR" -> now.plusHours(amount);
            case "DAY" -> now.plusDays(amount);
            case "WORKDAY" -> calendarService.nextWorkday(resolveCalendarId(props, instance, now), now.toLocalDate(), amount)
                    .atTime(now.toLocalTime());
            default -> throw WorkflowException.validationError("未知延迟单位: " + unit);
        };
        return epoch(target);
    }

    public static void validate(WfNodeConfig node) {
        if (!"TIMER".equals(node.getType()) || node.getProps() == null) {
            return;
        }
        Map<String, Object> props = node.getProps();
        if (!Set.of("AUTO_PASS", "AUTO_REJECT", "NOTIFY_ONLY").contains(String.valueOf(props.getOrDefault("timerAction", "AUTO_PASS")))) {
            throw WorkflowException.validationError("未知定时到期动作");
        }
        if (props.containsKey("delayValue")) {
            delayValue(props);
            if (!Set.of("MINUTE", "HOUR", "DAY", "WORKDAY").contains(String.valueOf(props.getOrDefault("delayUnit", "HOUR")))) {
                throw WorkflowException.validationError("未知定时延迟单位");
            }
        }
        if ("CRON_ONCE".equals(props.get("timerType")) && !CronExpression.isValidExpression(String.valueOf(props.get("cronExpression")))) {
            throw WorkflowException.validationError("定时表达式无效");
        }
    }

    private Long resolveCalendarId(Map<String, Object> props, WfProcessInstance instance, LocalDateTime now) {
        if (props.get("calendarId") != null) {
            return new BigDecimal(String.valueOf(props.get("calendarId"))).longValueExact();
        }
        if (instance.getStartUserId() == null) {
            throw WorkflowException.validationError("工作日定时需要发起人的员工档案");
        }
        R<List<Map<String, Object>>> response = hrService.listJobLevels(instance.getTenantId(), List.of(instance.getStartUserId()));
        if (response == null || response.getCode() != 200 || response.getData() == null || response.getData().size() != 1) {
            throw WorkflowException.invalidState("无法查询发起人的员工日历归属");
        }
        Map<String, Object> employee = response.getData().get(0);
        Long tenantId = new BigDecimal(String.valueOf(employee.get("tenantId"))).longValueExact();
        Long userId = new BigDecimal(String.valueOf(employee.get("userId"))).longValueExact();
        if (!Objects.equals(instance.getTenantId(), tenantId) || !Objects.equals(instance.getStartUserId(), userId)) {
            throw WorkflowException.permissionDenied("员工日历归属租户或用户不匹配");
        }
        Long employeeId = new BigDecimal(String.valueOf(employee.get("employeeId"))).longValueExact();
        return calendarService.resolveCalendarId(employeeId, now.toLocalDate());
    }

    private static int delayValue(Map<String, Object> props) {
        try {
            int amount = new BigDecimal(String.valueOf(props.get("delayValue"))).intValueExact();
            if (amount > 0 && amount <= 36500) {
                return amount;
            }
        } catch (RuntimeException ignored) {
        }
        throw WorkflowException.validationError("延迟值必须为1至36500之间的整数");
    }

    private static LocalDateTime parseTime(String value) {
        return LocalDateTime.parse(value, value.contains("T") ? DateTimeFormatter.ISO_LOCAL_DATE_TIME
                : DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    private static long epoch(LocalDateTime time) {
        return time.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private boolean shouldSkipTimer(Map<String, Object> variables) {
        Object value = variables == null ? null : variables.get("_skipTimers");
        if (value instanceof Boolean bool) return bool;
        if (value instanceof Number number) return number.intValue() != 0;
        return value instanceof String text && ("true".equalsIgnoreCase(text.trim()) || "1".equals(text.trim()));
    }
}
