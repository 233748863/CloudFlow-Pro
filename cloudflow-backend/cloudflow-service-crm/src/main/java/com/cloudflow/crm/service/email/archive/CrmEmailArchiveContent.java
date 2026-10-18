package com.cloudflow.crm.service.email.archive;

import com.cloudflow.common.message.api.MessageEmailTemplate;
import com.cloudflow.common.message.security.MessageHtmlContent;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.service.email.CrmEmailContentService;
import com.cloudflow.crm.service.email.CrmEmailSecurity;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.StringReader;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.swing.text.html.HTMLEditorKit;
import javax.swing.text.html.parser.ParserDelegator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CrmEmailArchiveContent {
    public static final int MAXIMUM_CONTENT = 1_040_000;
    private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{([A-Za-z][A-Za-z0-9_]*)\\}|\\{\\{([A-Za-z][A-Za-z0-9_]*)}}");
    private static final Set<String> VARIABLES = Set.of("contactName", "companyName", "customerName", "businessName", "content");
    private final ObjectMapper json;

    public record Body(String html, String summary) {
        @Override public String toString() { return "Body[characters=" + html.length() + "]"; }
    }

    public void template(MessageEmailTemplate template) {
        if (template == null || template.templateId() == null || template.content() == null || template.content().isBlank()) {
            throw new CrmBusinessException("MAIL_TEMPLATE_UNAVAILABLE: 请先配置客户业务邮件模板");
        }
        if (template.parameters() != null && !template.parameters().isBlank()) {
            try {
                JsonNode definitions = json.readTree(template.parameters());
                if (!definitions.isArray()) throw new IllegalArgumentException();
                for (JsonNode definition : definitions) if (!VARIABLES.contains(definition.path("name").asText())) throw new IllegalArgumentException();
            } catch (Exception invalid) { throw new CrmBusinessException("MAIL_TEMPLATE_PARAMS_INVALID: 业务邮件模板仅支持联系人、客户、公司、业务名称和正文变量"); }
        }
        Matcher placeholders = PLACEHOLDER.matcher(template.content());
        while (placeholders.find()) if (!VARIABLES.contains(variable(placeholders))) throw new CrmBusinessException("MAIL_TEMPLATE_PARAMS_INVALID: 业务邮件模板含不支持的变量");
    }

    public Body preview(MessageEmailTemplate template, CrmEmailArchiveAccess.Business business, CrmContact contact) {
        template(template);
        return render(template.content(), business, contact);
    }

    public Body render(String input, CrmEmailArchiveAccess.Business business, CrmContact contact) {
        if (input == null || input.isBlank() || input.length() > MAXIMUM_CONTENT) throw new CrmBusinessException("邮件正文不能为空且最多1040000字符");
        Map<String, String> values = new LinkedHashMap<>();
        values.put("contactName", contact == null ? "" : contact.getContactName());
        values.put("companyName", business.customer().getCustomerName());
        values.put("customerName", business.customer().getCustomerName());
        values.put("businessName", business.name());
        values.put("content", "");
        Matcher placeholders = PLACEHOLDER.matcher(input);
        StringBuilder rendered = new StringBuilder();
        while (placeholders.find()) {
            String name = variable(placeholders);
            if (!VARIABLES.contains(name)) throw new CrmBusinessException("MAIL_TEMPLATE_PARAMS_INVALID: 邮件正文含不支持的变量");
            placeholders.appendReplacement(rendered, Matcher.quoteReplacement(CrmEmailSecurity.escape(values.get(name))));
        }
        placeholders.appendTail(rendered);
        Body cleaned = clean(rendered.toString());
        if (cleaned.summary().isBlank()) throw new CrmBusinessException("邮件正文净化后为空，请填写可显示的文字");
        return cleaned;
    }

    public static Body clean(String input) {
        try {
            String html = MessageHtmlContent.rewrite(input, link -> null, image -> null);
            if (html.length() > MAXIMUM_CONTENT) throw new IllegalArgumentException();
            StringBuilder plain = new StringBuilder();
            new ParserDelegator().parse(new StringReader(html), new HTMLEditorKit.ParserCallback() {
                @Override public void handleText(char[] data, int position) {
                    if (plain.length() < 2000) plain.append(data, 0, Math.min(data.length, 2000 - plain.length()));
                    if (plain.length() < 2000) plain.append(' ');
                }
            }, true);
            if (!plain.isEmpty() && Character.isHighSurrogate(plain.charAt(plain.length() - 1))) plain.setLength(plain.length() - 1);
            return new Body(html, plain.toString().trim());
        } catch (Exception invalid) { throw new CrmBusinessException("MAIL_CONTENT_INVALID: 邮件正文无效或超过1040000字符"); }
    }

    public static String subject(String value) { return CrmEmailContentService.header(value, 200, true); }
    private static String variable(Matcher matcher) { return matcher.group(1) == null ? matcher.group(2) : matcher.group(1); }
}
