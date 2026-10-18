package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.StorageCapacityError;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.WorkflowFormFileMapper;
import com.cloudflow.workflow.service.WorkflowFormAccessService.ReadContext;
import com.cloudflow.workflow.service.remote.RemoteWorkflowFormFileService;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletResponse;
import java.io.InputStream;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.cloud.client.circuitbreaker.NoFallbackAvailableException;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkflowFormFileService {
    private final WorkflowFormAccessService access;
    private final WorkflowFormFileMapper files;
    private final WfTaskMapper tasks;
    private final RemoteWorkflowFormFileService storage;
    private final JsonSchemaValidator validator;
    private final WorkflowDraftJson json;

    public Map<String, Object> upload(MultipartFile upload, String definitionId, String instanceId, String taskId, String requestedField) {
        ReadContext context = context(definitionId, instanceId, taskId);
        String fieldPath = fieldPath(requestedField);
        JsonNode field = readableField(context, fieldPath);
        if (field.path("readonly").asBoolean() || instanceId != null && !writableTask(instanceId, taskId)) throw denied();
        try {
            long maximum = new BigDecimal(field.path("maxSize").asText("10")).multiply(BigDecimal.valueOf(1_048_576)).longValueExact();
            FileUploadUtils.ValidatedFile checked = FileUploadUtils.validate(upload, Math.min(maximum, FileUploadUtils.DEFAULT_MAX_SIZE), null);
            JsonSchemaValidator.FormValidationResult values = validator.validateValues(json.tree("[" + field + "]"), Map.of(field.path("id").asText(), List.of("1")), false, new JsonSchemaValidator.ValueLookup() {
                public Set<String> dictionaryValues(String type) { return Set.of(); }
                public boolean referenceAllowed(String type, long referenceId, JsonNode configured) { return false; }
                public JsonSchemaValidator.FileValue file(long fileId) { return new JsonSchemaValidator.FileValue(upload.getSize(), checked.extension()); }
            });
            values.throwIfInvalid();
            R<Map<String, Object>> result = storage.upload(upload, context.definition().getDefinitionId(), context.instanceId(), fieldPath);
            if (result == null || !result.isSuccess() || result.getData() == null || result.getData().get("fileId") == null) throw unavailable();
            return result.getData();
        } catch (WorkflowException exception) { throw exception; }
        catch (feign.FeignException | NoFallbackAvailableException exception) {
            Throwable cause = NestedExceptionUtils.getMostSpecificCause(exception);
            if (cause instanceof feign.FeignException upstream && StorageCapacityError.matches(upstream.status(), upstream.contentUTF8())) {
                throw StorageCapacityError.exception();
            }
            throw unavailable();
        }
        catch (Exception exception) { throw WorkflowException.validationError("附件大小、扩展名或实际内容不符合字段要求"); }
    }

    public Map<String, Object> metadata(Long fileId, String definitionId, String instanceId, String taskId, String requestedField) {
        ReadContext context = context(definitionId, instanceId, taskId);
        String path = fieldPath(requestedField);
        JsonNode field = readableField(context, path);
        Map<String, Object> file = files.findFile(WorkflowLaunchContextService.requireTenant(), fileId);
        if (file == null || !Objects.equals(file.get("definitionId"), context.definition().getDefinitionId())
                || !Objects.equals(file.get("fieldPath"), path) || !Objects.equals(file.get("instanceId"), context.instanceId())
                || !Objects.equals(file.get("businessId"), context.instanceId() == null ? context.definition().getDefinitionId() : context.instanceId())
                || context.instanceId() == null && !Objects.equals(file.get("owner"), UserContext.getUserName())) throw denied();
        if (context.instanceId() != null && !visibleFile(access.getVisibleVariables(context, context.rawValues()), path, fileId)
                && !(Objects.equals(file.get("owner"), UserContext.getUserName()) && !field.path("readonly").asBoolean() && writableTask(context.instanceId(), taskId))) throw denied();
        return Map.of("fileId", String.valueOf(fileId), "fileName", file.get("fileName"), "size", file.get("size"), "extension", file.get("extension"));
    }

    public void download(Long fileId, String definitionId, String instanceId, String taskId, String fieldPath, HttpServletResponse response) {
        Map<String, Object> file = metadata(fileId, definitionId, instanceId, taskId, fieldPath);
        try (feign.Response upstream = storage.content(fileId)) {
            if (upstream == null || upstream.status() != 200 || upstream.body() == null) throw unavailable();
            response.setContentType("application/octet-stream");
            response.setHeader("Content-Disposition", ContentDisposition.attachment().filename(String.valueOf(file.get("fileName")), StandardCharsets.UTF_8).build().toString());
            response.setHeader("Cache-Control", "private, no-store"); response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Referrer-Policy", "no-referrer");
            try (InputStream content = upstream.body().asInputStream()) { content.transferTo(response.getOutputStream()); }
        } catch (IOException | feign.FeignException exception) { throw unavailable(); }
    }

    @Transactional(rollbackFor = Exception.class)
    public void bindStart(WfProcessInstance instance) {
        ReadContext context = access.instance(instance.getInstanceId(), null);
        if (context.form() == null) return;
        Map<String, Set<Long>> bindings = new LinkedHashMap<>();
        collectFiles(validator.parseFields(context.form().getFieldsJson()), access.getRawVariables(instance), "", bindings);
        for (Map.Entry<String, Set<Long>> binding : bindings.entrySet()) {
            List<Long> identifiers = new ArrayList<>(binding.getValue());
            if (!identifiers.isEmpty() && files.bindFiles(WorkflowLaunchContextService.requireTenant(), instance.getDefinitionId(), instance.getInstanceId(),
                    UserContext.getUserName(), binding.getKey(), identifiers) != identifiers.size()) throw WorkflowException.invalidState("附件已被其他申请使用，请重新上传");
        }
    }

    private ReadContext context(String definitionId, String instanceId, String taskId) {
        if (StringUtils.hasText(instanceId)) {
            ReadContext context = access.instance(instanceId, taskId);
            if (StringUtils.hasText(definitionId) && !Objects.equals(context.definition().getDefinitionId(), definitionId)) throw denied();
            return context;
        }
        if (!StringUtils.hasText(definitionId) || StringUtils.hasText(taskId)) throw denied();
        return access.start(definitionId);
    }

    private boolean writableTask(String instanceId, String taskId) {
        if (!StringUtils.hasText(taskId)) return false;
        WfTask task = tasks.selectById(taskId);
        if (task == null || !Objects.equals(task.getInstanceId(), instanceId)
                || !Objects.equals(task.getTenantId(), WorkflowLaunchContextService.requireTenant()) || !"TODO".equals(task.getStatus())) return false;
        access.assertTaskWrite(task);
        return true;
    }

    private JsonNode readableField(ReadContext context, String path) {
        if (context.form() == null) throw denied();
        JsonNode field = findField(access.projection(context, context.rawValues()).fields(), path, "");
        if (field == null || !Set.of("UPLOAD_FILE", "UPLOAD_IMAGE").contains(field.path("type").asText())) throw denied();
        return field;
    }

    private JsonNode findField(JsonNode fields, String path, String prefix) {
        for (JsonNode field : fields) {
            String fieldId = field.path("id").asText();
            if (path.equals(prefix + fieldId)) return field;
            JsonNode nested = JsonSchemaValidator.LAYOUT_TYPES.contains(field.path("type").asText()) ? findField(field.path("children"), path, prefix)
                    : "SUB_TABLE".equals(field.path("type").asText()) ? findField(field.path("columns"), path, fieldId + ".") : null;
            if (nested != null) return nested;
        }
        return null;
    }

    private boolean visibleFile(Map<String, Object> data, String path, Long fileId) {
        int separator = path.indexOf('.');
        if (separator < 0) return data.get(path) instanceof List<?> identifiers && identifiers.stream().anyMatch(value -> String.valueOf(fileId).equals(String.valueOf(value)));
        Object rows = data.get(path.substring(0, separator));
        if (rows instanceof List<?> values) for (Object value : values) {
            if (value instanceof Map<?, ?> row && row.get(path.substring(separator + 1)) instanceof List<?> identifiers
                    && identifiers.stream().anyMatch(identifier -> String.valueOf(fileId).equals(String.valueOf(identifier)))) return true;
        }
        return false;
    }

    private void collectFiles(JsonNode fields, Map<String, Object> data, String prefix, Map<String, Set<Long>> bindings) {
        for (JsonNode field : fields) {
            String fieldId = field.path("id").asText(); String type = field.path("type").asText();
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(type)) collectFiles(field.path("children"), data, prefix, bindings);
            else if ("SUB_TABLE".equals(type) && data.get(fieldId) instanceof List<?> rows) {
                for (Object row : rows) if (row instanceof Map<?, ?> values) collectFiles(field.path("columns"), json.readData(json.canonical(values)), fieldId + ".", bindings);
            } else if (type.startsWith("UPLOAD_") && data.get(fieldId) instanceof List<?> values) {
                Set<Long> identifiers = bindings.computeIfAbsent(prefix + fieldId, ignored -> new LinkedHashSet<>());
                for (Object value : values) identifiers.add(new BigDecimal(String.valueOf(value)).longValueExact());
            }
        }
    }

    private String fieldPath(String requested) {
        if (requested == null || requested.length() > 120) throw denied();
        String normalized = requested.replaceAll("\\[\\d{1,3}\\]", "");
        if (normalized.length() > 100 || !normalized.matches("[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)?")) throw denied();
        return normalized;
    }

    private WorkflowException denied() { return WorkflowException.permissionDenied("附件不在当前流程字段的授权范围内"); }
    private WorkflowException unavailable() { return new WorkflowException("FORM_FILE_UNAVAILABLE", "附件存储暂不可用，请稍后重试"); }
}
