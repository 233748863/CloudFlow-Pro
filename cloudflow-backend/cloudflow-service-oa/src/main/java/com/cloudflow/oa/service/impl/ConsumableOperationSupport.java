package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.domain.dto.ConsumableCommands;
import com.cloudflow.oa.domain.dto.ConsumableQuery;
import com.cloudflow.oa.mapper.OaConsumableRequestMapper;
import com.cloudflow.oa.mapper.OaTraceEventMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

@Component
@RequiredArgsConstructor
public class ConsumableOperationSupport {
    public static final String BUSINESS_TYPE = "OA_CONSUMABLE_REQUEST";
    private final ObjectMapper json;
    private final OaConsumableRequestMapper requests;
    private final OaTraceEventMapper traces;

    public static String key(String value) {
        if (value == null || !value.matches("[A-Za-z0-9:_-]{1,64}")) throw new IllegalArgumentException("operationKey格式无效");
        return value;
    }

    public static void operation(ConsumableCommands.Operation command) {
        OaRecordSupport.require(command, "请求不能为空");
        key(command.getOperationKey());
        command.setRemark(OaRecordSupport.text(command.getRemark(), 255, "操作原因"));
    }

    public static String optional(String value, int limit, String label) {
        if (value == null || value.isBlank()) return null;
        return OaRecordSupport.text(value, limit, label);
    }

    public static Long userId() {
        return OaRecordSupport.require(UserContext.getUserId(), "登录用户缺失");
    }

    public static void version(Integer expected, Integer current) {
        if (expected == null || expected < 0 || !expected.equals(current)) {
            throw new IllegalArgumentException("VERSION_CONFLICT: 数据已变更，请刷新后重试");
        }
    }

    public static void query(ConsumableQuery query, boolean report) {
        if (query.getPageNum() == null || query.getPageNum() < 1 || query.getPageSize() == null
                || query.getPageSize() < 1 || query.getPageSize() > 100) throw new IllegalArgumentException("页码从1开始，每页1至100条");
        if (report && query.getFrom() == null) query.setFrom(LocalDateTime.now().withDayOfMonth(1).toLocalDate().atStartOfDay());
        if (report && query.getTo() == null) query.setTo(LocalDateTime.now().plusNanos(1));
        if (query.getFrom() != null && query.getTo() != null && !query.getFrom().isBefore(query.getTo())) {
            throw new IllegalArgumentException("时间范围须含起点、不含终点且起点早于终点");
        }
    }

    public String hash(String entry, Long sourceId, Object body) {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("entry", entry);
        envelope.put("sourceId", sourceId);
        envelope.put("operatorId", userId());
        envelope.put("body", body);
        try {
            ObjectMapper canonical = json.copy().configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true)
                    .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.writeValueAsString(envelope).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("请求摘要计算失败", exception);
        }
    }

    public static void sameHash(String expected, String actual) {
        if (!Objects.equals(expected, actual)) throw new IllegalArgumentException("IDEMPOTENCY_CONFLICT: 请求键已用于不同内容或操作人");
    }

    public <T> T replay(Long id, String event, String key, String hash, Class<T> resultType) {
        OaTraceEvent trace = requests.operationTrace(OaRecordSupport.tenantId(), id, event, key);
        if (trace == null) return null;
        try {
            JsonNode snapshot = json.readTree(trace.getSnapshotJson());
            sameHash(snapshot.path("hash").asText(), hash);
            return json.treeToValue(snapshot.get("result"), resultType);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("请求重放记录无效", exception);
        }
    }

    public void record(Long id, String event, String key, String hash, Object result) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("hash", hash);
        snapshot.put("result", result);
        trace(BUSINESS_TYPE, id, event, key, snapshot);
    }

    public void trace(String businessType, Long id, String event, String content, Object snapshot) {
        try {
            OaTraceEvent trace = new OaTraceEvent();
            trace.setTenantId(OaRecordSupport.tenantId());
            trace.setBusinessType(businessType);
            trace.setBusinessId(id);
            trace.setEventType(event);
            trace.setEventTitle(event);
            trace.setEventContent(content);
            trace.setOperatorId(UserContext.getUserId());
            trace.setOperatorName(OaRecordSupport.userName());
            trace.setEventTime(LocalDateTime.now());
            trace.setCreateTime(LocalDateTime.now());
            trace.setSnapshotJson(json.writeValueAsString(snapshot));
            OaRecordSupport.saved(traces.insert(trace));
        } catch (Exception exception) {
            throw new IllegalStateException("耗材业务事件保存失败", exception);
        }
    }
}
