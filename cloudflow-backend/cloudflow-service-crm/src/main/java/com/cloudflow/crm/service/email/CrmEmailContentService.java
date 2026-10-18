package com.cloudflow.crm.service.email;

import com.cloudflow.common.message.api.MessageEmailTemplate;
import com.cloudflow.common.message.security.MessageHtmlContent;
import com.cloudflow.crm.domain.CrmMassEmail;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.UnaryOperator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CrmEmailContentService {
    private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{([A-Za-z][A-Za-z0-9_]*)\\}|\\{\\{([A-Za-z][A-Za-z0-9_]*)}}" );
    private static final Set<String> VARIABLES = Set.of("contactName", "companyName", "campaignName");
    private final ObjectMapper json;

    public record Rendered(String subject, String html, List<String> images) {
        public Rendered { images = List.copyOf(images); }
        @Override public String toString() { return "Rendered[images=" + images.size() + "]"; }
    }

    public Rendered render(CrmMassEmail task, MessageEmailTemplate template, Map<String, String> variables,
            CrmEmailPolicyService.Policy policy, UnaryOperator<String> links) {
        if (template == null || template.templateId() == null || template.content() == null || template.content().isBlank()) {
            throw new CrmBusinessException("MAIL_TEMPLATE_UNAVAILABLE: 请先配置CRM邮件模板");
        }
        if (template.parameters() != null && !template.parameters().isBlank()) {
            try {
                JsonNode definitions = json.readTree(template.parameters());
                if (!definitions.isArray()) throw new IllegalArgumentException();
                for (JsonNode definition : definitions) {
                    String name = definition.path("name").asText();
                    if (!VARIABLES.contains(name) || definition.path("required").asBoolean(false)
                            && (variables.get(name) == null || variables.get(name).isBlank())) throw new IllegalArgumentException();
                }
            } catch (Exception invalid) { throw new CrmBusinessException("MAIL_TEMPLATE_PARAMS_INVALID: 模板仅支持联系人、公司和活动名称，必填变量不可为空"); }
        }
        String subject = substitute(task.getSubject(), variables, false);
        header(subject, 200, true);
        String body = substitute(template.content(), variables, true);
        Set<String> images = new LinkedHashSet<>();
        try {
            String html = MessageHtmlContent.rewrite(body, value -> links.apply(policy.destination(value)), value -> {
                String target = policy.destination(value);
                images.add(target);
                return target;
            });
            return new Rendered(subject, html, List.copyOf(images));
        } catch (IllegalArgumentException invalid) { throw new CrmBusinessException("MAIL_TEMPLATE_LINK_INVALID: 模板链接或图片须使用允许域名的HTTPS地址"); }
    }

    public static String header(String value, int maximum, boolean required) {
        if (value == null || value.isBlank()) {
            if (required) throw new CrmBusinessException("MAIL_HEADER_INVALID: 邮件主题不能为空");
            return null;
        }
        if (value.length() > maximum || value.chars().anyMatch(character -> character < 32 || character == 127)) {
            throw new CrmBusinessException("MAIL_HEADER_INVALID: 邮件头部含非法字符或超过长度限制");
        }
        return value.trim();
    }

    private String substitute(String template, Map<String, String> variables, boolean html) {
        if (template == null) return "";
        Matcher matcher = PLACEHOLDER.matcher(template);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            String name = matcher.group(1) == null ? matcher.group(2) : matcher.group(1);
            if (!VARIABLES.contains(name)) throw new CrmBusinessException("MAIL_TEMPLATE_PARAMS_INVALID: 邮件模板含不支持的变量");
            String value = variables.getOrDefault(name, "");
            matcher.appendReplacement(result, Matcher.quoteReplacement(html ? CrmEmailSecurity.escape(value) : value));
        }
        matcher.appendTail(result);
        return result.toString();
    }
}
