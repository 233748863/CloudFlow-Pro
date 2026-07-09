package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryContext;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryPublisher;
import com.cloudflow.oa.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowStartFallbackRetryConsumer implements BusinessEventConsumer {

    private static final String SOURCE_MODULE = "cloudflow-oa";
    private static final String UPDATE_BY = "workflow-fallback";
    private static final Map<String, BusinessBinding> BUSINESS_BINDINGS = buildBusinessBindings();

    private final ObjectMapper objectMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public String eventType() {
        return WorkflowFallbackRetryPublisher.EVENT_TYPE;
    }

    @Override
    @SuppressWarnings("unchecked")
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        Map<String, Object> payload = objectMapper.readValue(envelope.getPayload(), Map.class);
        if (!SOURCE_MODULE.equals(payload.get("sourceModule"))) {
            return;
        }
        String operation = String.valueOf(payload.get("operation"));
        Object request = payload.get("request");
        final R<?>[] result = new R<?>[1];
        String businessKey;
        if ("startProcess".equals(operation)) {
            WorkflowProcessStartDTO dto = objectMapper.convertValue(request, WorkflowProcessStartDTO.class);
            validateTenant(envelope, payload, dto.getTenantId());
            businessKey = dto.getBusinessKey();
            WorkflowFallbackRetryContext.runRetrying(() -> result[0] = remoteWorkflowService.startProcess(dto));
        } else {
            InternalWorkflowStartDTO dto = objectMapper.convertValue(request, InternalWorkflowStartDTO.class);
            validateTenant(envelope, payload, dto.getTenantId());
            businessKey = dto.getBusinessKey();
            WorkflowFallbackRetryContext.runRetrying(() -> result[0] = remoteWorkflowService.startProcessInternal(dto));
        }
        if (result[0] == null || !result[0].isSuccess()) {
            throw new IllegalStateException("workflow fallback retry failed: " + (result[0] == null ? "null" : result[0].getMsg()));
        }
        backfillBusinessInstanceId(businessKey, extractInstanceId(result[0].getData()));
        log.info("workflow fallback retry success, module={}, operation={}, eventId={}", SOURCE_MODULE, operation, envelope.getEventId());
    }

    private void validateTenant(BusinessEventEnvelope envelope, Map<String, Object> payload, Long requestTenantId) {
        Long payloadTenantId = parseTenantId(payload.get("tenantId"));
        Long contextTenantId = UserContext.getTenantId();
        if (requestTenantId == null || envelope.getTenantId() == null || contextTenantId == null
                || !requestTenantId.equals(envelope.getTenantId())
                || !requestTenantId.equals(payloadTenantId)
                || !requestTenantId.equals(contextTenantId)) {
            throw new IllegalStateException("workflow fallback retry tenantId mismatch");
        }
    }

    private Long parseTenantId(Object value) {
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }

    private void backfillBusinessInstanceId(String businessKey, String instanceId) {
        if (!StringUtils.hasText(businessKey) || !StringUtils.hasText(instanceId)) {
            return;
        }
        for (Map.Entry<String, BusinessBinding> entry : BUSINESS_BINDINGS.entrySet()) {
            String prefix = entry.getKey();
            if (!businessKey.startsWith(prefix)) {
                continue;
            }
            Long businessId = parseBusinessId(businessKey.substring(prefix.length()));
            if (businessId == null) {
                log.warn("skip workflow fallback backfill, invalid businessKey={}", businessKey);
                return;
            }
            BusinessBinding binding = entry.getValue();
            int updated = jdbcTemplate.update(binding.updateSql(), instanceId, UPDATE_BY, businessId);
            log.info("workflow fallback backfill finished, businessKey={}, instanceId={}, table={}, updated={}",
                    businessKey, instanceId, binding.tableName(), updated);
            return;
        }
        log.debug("skip workflow fallback backfill, no binding for businessKey={}", businessKey);
    }

    private String extractInstanceId(Object data) {
        if (data instanceof Map<?, ?> dataMap) {
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId == null ? null : String.valueOf(instanceId);
        }
        return null;
    }

    private Long parseBusinessId(String rawId) {
        try {
            return Long.parseLong(rawId);
        } catch (Exception e) {
            return null;
        }
    }

    private static Map<String, BusinessBinding> buildBusinessBindings() {
        Map<String, BusinessBinding> bindings = new HashMap<>();
        bindings.put("BUSINESS_TRIP:", new BusinessBinding("biz_business_trip", "id", "instance_id"));
        bindings.put("EXPENSE_CLAIM:", new BusinessBinding("biz_expense_claim", "id", "instance_id"));
        bindings.put("PAYMENT_REQUEST:", new BusinessBinding("biz_payment_request", "id", "instance_id"));
        bindings.put("PURCHASE_REQUEST:", new BusinessBinding("biz_purchase_request", "id", "instance_id"));
        bindings.put("VEHICLE_USAGE:", new BusinessBinding("oa_vehicle_usage", "usage_id", "process_instance_id"));
        bindings.put("SEAL_APPLICATION:", new BusinessBinding("oa_seal_application", "id", "instance_id"));
        bindings.put("SEAL_RENEWAL:", new BusinessBinding("oa_seal_renewal", "id", "instance_id"));
        bindings.put("LICENSE_BORROW:", new BusinessBinding("oa_license_borrow", "id", "instance_id"));
        bindings.put("LICENSE_RENEWAL:", new BusinessBinding("oa_license_renewal", "id", "instance_id"));
        bindings.put("KNOWLEDGE_DOCUMENT:", new BusinessBinding("oa_knowledge_document", "document_id", "instance_id"));
        bindings.put("CONTRACT:", new BusinessBinding("oa_contract", "contract_id", "instance_id"));
        bindings.put("PROJECT:", new BusinessBinding("oa_project", "project_id", "instance_id"));
        bindings.put("BUDGET_PLAN:", new BusinessBinding("oa_budget_plan", "budget_id", "instance_id"));
        bindings.put("BUDGET_ADJUSTMENT:", new BusinessBinding("oa_budget_adjustment", "adjustment_id", "instance_id"));
        return Map.copyOf(bindings);
    }

    private record BusinessBinding(String tableName, String idColumn, String instanceColumn) {
        private BusinessBinding {
            validateIdentifier(tableName);
            validateIdentifier(idColumn);
            validateIdentifier(instanceColumn);
        }

        private String updateSql() {
            return String.format(
                    "UPDATE %s SET %s = ?, update_by = ?, update_time = NOW() WHERE %s = ? AND (%s IS NULL OR %s = '')",
                    tableName, instanceColumn, idColumn, instanceColumn, instanceColumn
            );
        }

        private static void validateIdentifier(String identifier) {
            if (!identifier.matches("[A-Za-z0-9_]+")) {
                throw new IllegalArgumentException("非法 SQL 标识符: " + identifier);
            }
        }
    }
}
