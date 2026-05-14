package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrPosition;
import com.cloudflow.hr.mapper.HrLookupMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class HrViewSupport {

    private static final long DEFAULT_TENANT_ID = 100000L;
    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE = new TypeReference<>() {};
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

    private final HrTypedCrudService crudService;
    private final HrLookupMapper lookupMapper;
    private final ObjectMapper objectMapper;

    @SuppressWarnings("unchecked")
    public Map<String, Object> mapPage(Map<String, Object> page,
                                       java.util.function.Function<Map<String, Object>, Map<String, Object>> mapper) {
        List<Map<String, Object>> records = ((List<Map<String, Object>>) page.getOrDefault("records", List.of()))
                .stream()
                .map(mapper)
                .toList();
        Map<String, Object> result = new LinkedHashMap<>(page);
        result.put("records", records);
        result.put("rows", records);
        return result;
    }

    public void putStatusDesc(Map<String, Object> result) {
        Object status = result.get("status");
        result.put("statusDesc", STATUS_LABELS.getOrDefault(String.valueOf(status), String.valueOf(status == null ? "" : status)));
    }

    public String sourceDesc(Object source) {
        return SOURCE_LABELS.getOrDefault(String.valueOf(source), String.valueOf(source == null ? "" : source));
    }

    public String interviewRoundName(Object round) {
        return INTERVIEW_ROUND_LABELS.getOrDefault(String.valueOf(round), String.valueOf(round == null ? "" : round));
    }

    public String interviewTypeName(Object type) {
        return INTERVIEW_TYPE_LABELS.getOrDefault(String.valueOf(type), String.valueOf(type == null ? "" : type));
    }

    public void putDeptName(Map<String, Object> result) {
        Long deptId = toLong(result.get("deptId"));
        if (deptId == null || result.get("deptName") != null) {
            return;
        }
        result.put("deptName", lookupMapper.findDeptName(currentTenantId(), deptId));
    }

    public void putPostName(Map<String, Object> result) {
        Long postId = toLong(result.get("postId"));
        if (postId == null || result.get("postName") != null) {
            return;
        }
        result.put("postName", lookupMapper.findPostName(currentTenantId(), postId));
    }

    public void putPositionSnapshot(Map<String, Object> result) {
        Long positionId = toLong(result.get("positionId"));
        if (positionId == null) {
            return;
        }
        Map<String, Object> position = crudService.get(HrPosition.class, positionId);
        if (position.isEmpty()) {
            return;
        }
        result.putIfAbsent("positionName", position.get("positionName"));
        result.putIfAbsent("positionCode", position.get("positionCode"));
        result.putIfAbsent("postId", position.get("postId"));
    }

    public Map<String, Object> parseJsonObject(Object value) {
        if (value == null) {
            return Map.of();
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> result = new LinkedHashMap<>();
            map.forEach((key, item) -> result.put(String.valueOf(key), item));
            return result;
        }
        try {
            return objectMapper.readValue(String.valueOf(value), MAP_TYPE);
        } catch (JsonProcessingException ex) {
            return Map.of();
        }
    }

    public Object firstValue(Map<String, Object> source, String... keys) {
        for (String key : keys) {
            if (source.containsKey(key) && source.get(key) != null && StringUtils.hasText(String.valueOf(source.get(key)))) {
                return source.get(key);
            }
        }
        return null;
    }

    public String nextNo(String prefix) {
        return prefix + System.currentTimeMillis();
    }

    public Long toLong(Object value) {
        if (value == null || !StringUtils.hasText(String.valueOf(value))) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    public int toInt(Object value, int fallback) {
        if (value == null || !StringUtils.hasText(String.valueOf(value))) {
            return fallback;
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private long currentTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        tenantId = UserContext.getTenantId();
        return tenantId == null ? DEFAULT_TENANT_ID : tenantId;
    }
}
