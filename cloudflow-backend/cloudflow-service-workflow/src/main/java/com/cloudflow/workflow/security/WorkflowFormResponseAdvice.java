package com.cloudflow.workflow.security;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.util.SysLogUtils;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.service.FormDataPermissionFilter;
import com.cloudflow.workflow.service.WorkflowDraftJson;
import com.cloudflow.workflow.service.WorkflowFormAccessService;
import com.cloudflow.workflow.service.WorkflowFormAccessService.ReadContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestControllerAdvice(basePackages = "com.cloudflow.workflow.controller")
@RequiredArgsConstructor
public class WorkflowFormResponseAdvice implements ResponseBodyAdvice<Object> {
    private static final Set<String> VALUE_PROPERTIES = Set.of("variables", "formData", "variablesChanged", "formDataSnapshot");
    private static final Set<String> JSON_PROPERTIES = Set.of("modelJson", "snapshotJson", "snapshotData", "activeTasks");
    private final WorkflowFormAccessService access;
    private final WorkflowDraftJson json;
    private final ObjectMapper mapper;

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return MappingJackson2HttpMessageConverter.class.isAssignableFrom(converterType)
                && !returnType.hasMethodAnnotation(Inner.class) && !returnType.getContainingClass().isAnnotationPresent(Inner.class);
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType selectedContentType,
                                  Class<? extends HttpMessageConverter<?>> selectedConverterType, ServerHttpRequest request,
                                  ServerHttpResponse response) {
        if (body == null || !(request instanceof ServletServerHttpRequest servlet)) return body;
        if (body instanceof R<?> result) {
            servlet.getServletRequest().setAttribute(SysLogUtils.RESULT_CODE, result.getCode());
            if (result.getCode() != R.SUCCESS || result.getData() == null) return body;
            R<JsonNode> safe = new R<>();
            safe.setCode(result.getCode());
            safe.setMsg(result.getMsg());
            safe.setData(new Session(servlet.getServletRequest()).project(mapper.valueToTree(result.getData()), null));
            return safe;
        }
        return new Session(servlet.getServletRequest()).project(mapper.valueToTree(body), null);
    }

    private final class Session {
        private final HttpServletRequest request;
        private final Map<String, ReadContext> contexts = new HashMap<>();
        private Boolean designer;

        private Session(HttpServletRequest request) { this.request = request; }

        private JsonNode project(JsonNode value, ReadContext inherited) {
            if (value == null || value.isNull() || value.isValueNode()) return value;
            if (value.isArray()) {
                for (JsonNode child : value) project(child, inherited);
                return value;
            }
            ObjectNode object = (ObjectNode) value;
            ReadContext context = inherited;
            String instanceId = text(object, "instanceId");
            if (instanceId == null && context == null) instanceId = parameter("instanceId");
            boolean protectedPayload = containsProtectedData(object);
            if (instanceId != null && protectedPayload) {
                String requestedTask = parameter("taskId");
                String key = "instance:" + instanceId + ":" + requestedTask;
                String selectedInstance = instanceId;
                context = contexts.computeIfAbsent(key, ignored -> access.instance(selectedInstance, requestedTask));
            }
            boolean formPayload = object.has("fieldsJson") || object.has("formSchema") || object.has("fields") && object.has("id");
            String definitionId = text(object, "definitionId");
            if (context == null && definitionId != null && protectedPayload && (!isDesigner() || hasValues(object) || object.has("assigneeNodes"))) {
                try {
                    context = contexts.computeIfAbsent("definition:" + definitionId, ignored -> access.start(definitionId));
                } catch (WorkflowException unavailable) {
                    if (!object.has("draftId")) throw unavailable;
                    object.set("formData", mapper.createObjectNode());
                    object.remove("formDefinition");
                    return object;
                }
            }
            if (context == null && formPayload && !isDesigner()) {
                String formId = text(object, "formId");
                if (formId == null) formId = text(object, "id");
                if (formId == null) throw WorkflowException.permissionDenied("表单响应缺少权限上下文");
                context = access.form(formId, parameter("instanceId"), parameter("definitionId"), parameter("taskId"));
            }
            if (context == null && object.hasNonNull("formDefinition") && !isDesigner()) {
                JsonNode nested = object.path("formDefinition");
                String formId = nested.path("formId").asText(nested.path("id").asText());
                context = access.form(formId, parameter("instanceId"), parameter("definitionId"), parameter("taskId"));
            }
            Map<String, Object> rawValues = context == null ? Map.of() : context.rawValues();
            for (String property : VALUE_PROPERTIES) {
                JsonNode data = object.get(property);
                if (data == null || data.isNull()) continue;
                if (context == null) throw WorkflowException.permissionDenied("表单数据响应缺少权限上下文");
                Map<String, Object> raw = data.isTextual() ? data.asText().isBlank() ? Map.of() : json.readData(data.asText()) : map(data);
                Map<String, Object> safe = access.getVisibleVariables(context, raw);
                if ("variables".equals(property) || "formData".equals(property)) rawValues = raw;
                if (data.isTextual()) object.put(property, json.canonical(safe));
                else object.set(property, mapper.valueToTree(safe));
            }
            if (context != null && context.form() != null) {
                FormDataPermissionFilter.Projection projected = access.projection(context, rawValues);
                if (object.has("fieldsJson")) object.put("fieldsJson", projected.fields().toString());
                if (object.has("formSchema")) object.put("formSchema", projected.fields().toString());
                if (formPayload && object.has("fields")) object.set("fields", projected.fields());
                if (formPayload) {
                    object.put("version", context.form().getVersion());
                    object.put("versionLock", context.form().getVersionLock());
                    object.put("versionUnknownFlag", context.versionUnknown());
                }
                if (object.has("fieldPermissions")) object.set("fieldPermissions", mapper.valueToTree(projected.permissions()));
                if (object.has("variables") || object.has("formData") || object.has("formDefinition")) {
                    object.put("formId", context.form().getFormId());
                    object.put("formNodeKey", context.nodeKey());
                    object.set("formDefinition", mapper.valueToTree(access.visibleForm(context, projected)));
                    object.set("fieldPermissions", mapper.valueToTree(projected.permissions()));
                }
            }
            List<Map.Entry<String, JsonNode>> entries = new ArrayList<>();
            object.fields().forEachRemaining(entries::add);
            for (Map.Entry<String, JsonNode> entry : entries) {
                String property = entry.getKey();
                if (VALUE_PROPERTIES.contains(property) || Set.of("fieldsJson", "formSchema", "fields", "fieldPermissions", "formDefinition").contains(property)) continue;
                JsonNode child = entry.getValue();
                if (JSON_PROPERTIES.contains(property) && child.isTextual() && !child.asText().isBlank()) {
                    object.put(property, project(json.tree(child.asText()), context).toString());
                } else project(child, context);
            }
            return object;
        }

        private boolean isDesigner() { if (designer == null) designer = access.designer(); return designer; }
        private boolean hasValues(ObjectNode object) { return VALUE_PROPERTIES.stream().anyMatch(object::has); }

        private boolean containsProtectedData(JsonNode value) {
            if (value == null || !value.isContainerNode()) return false;
            if (value.isObject()) {
                if (VALUE_PROPERTIES.stream().anyMatch(value::hasNonNull) || value.hasNonNull("fieldsJson") || value.hasNonNull("formSchema") || value.hasNonNull("formDefinition")) return true;
                if (value.has("fields") && value.has("id")) return true;
                for (String property : JSON_PROPERTIES) if (value.path(property).isTextual() && !value.path(property).asText().isBlank()
                        && containsProtectedData(json.tree(value.path(property).asText()))) return true;
            }
            for (JsonNode child : value) if (containsProtectedData(child)) return true;
            return false;
        }

        private Map<String, Object> map(JsonNode value) {
            if (!value.isObject()) throw WorkflowException.invalidState("表单响应数据格式无效");
            return json.readData(value.toString());
        }

        private String parameter(String name) {
            Object attributes = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
            if (attributes instanceof Map<?, ?> path && path.get(name) instanceof String value && StringUtils.hasText(value)) return value;
            String value = request.getParameter(name);
            return StringUtils.hasText(value) ? value : null;
        }

        private String text(ObjectNode value, String name) { return value.path(name).isTextual() && !value.path(name).asText().isBlank() ? value.path(name).asText() : null; }
    }
}
