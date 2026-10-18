package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class WorkflowProcessNumberService {
    private static final DefaultRedisScript<String> RESERVE = new DefaultRedisScript<>("""
            local current = redis.call('GET', KEYS[1])
            local minimum = ARGV[1]
            if current and not string.match(current, '^%d+$') then
                return redis.error_reply('Workflow sequence is not a nonnegative integer')
            end
            if not current or #current < #minimum or (#current == #minimum and current < minimum) then
                redis.call('SET', KEYS[1], minimum)
            end
            redis.call('INCR', KEYS[1])
            redis.call('EXPIRE', KEYS[1], ARGV[2])
            return redis.call('GET', KEYS[1])
            """, String.class);
    private final WfProcessInstanceMapper instances;
    private final StringRedisTemplate redis;
    private final PlatformTransactionManager transactions;

    public String next(Long tenantId, String processKey) {
        if (tenantId == null || !Objects.equals(tenantId, UserContext.getTenantId())
                || processKey == null || processKey.isBlank() || processKey.length() > 100) {
            throw WorkflowException.validationError("流程编号的租户或定义无效");
        }
        String code = processKey.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (code.length() > 6) code = code.substring(0, 6);
        String date = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        String prefix = code + date;
        TransactionTemplate sourceRead = new TransactionTemplate(transactions);
        sourceRead.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        sourceRead.setReadOnly(true);
        sourceRead.setTimeout(10);
        String latest = sourceRead.execute(status -> instances.selectLatestProcessNumber(tenantId, prefix));
        long minimum = latest == null ? 0 : Long.parseLong(latest.substring(prefix.length()));
        String sequence = redis.execute(RESERVE, List.of(tenantId + ":sys:wf:pno:" + code + ":" + date),
                Long.toString(minimum), "172800");
        if (sequence == null || !sequence.matches("[1-9][0-9]{0,18}")) {
            throw WorkflowException.validationError("流程编号预约失败，请重试");
        }
        return prefix + String.format(Locale.ROOT, "%06d", Long.parseLong(sequence));
    }
}
