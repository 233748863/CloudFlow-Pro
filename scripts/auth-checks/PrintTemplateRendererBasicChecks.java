package com.cloudflow.auth.checks;

import com.cloudflow.auth.printing.PrintTemplateRenderer;
import com.cloudflow.common.core.exception.ServiceException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** 直接执行正式渲染组件；无数据库、网络、HTTP 或浏览器。 */
public final class PrintTemplateRendererBasicChecks {
    private static final PrintTemplateRenderer RENDERER = new PrintTemplateRenderer();
    private static int checks;

    public static void main(String[] arguments) {
        equal("<p>张三 研发部</p>", render("<p>{{name}} {{department.name}}</p>",
                Map.of("name", "张三", "department", Map.of("name", "研发部"))), "nested variable");
        equal("<p>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;&quot;</p>",
                render("<p>{{name}}</p>", Map.of("name", "<script>alert('x')</script>&" + (char) 34)), "HTML values escaped");
        equal("缺失：/", render("缺失：{{absent}}/{{absent.child}}", Map.of()), "filtered or missing fields blank");
        equal("<b>机票:800</b><b>住宿:400</b>", render("{{#each items}}<b>{{name}}:{{amount}}</b>{{/each}}",
                Map.of("items", List.of(Map.of("name", "机票", "amount", 800), Map.of("name", "住宿", "amount", 400)))), "detail loop");
        equal("无明细", render("{{#each items}}{{this}}{{else}}无明细{{/each}}", Map.of("items", List.of())), "empty loop alternative");
        equal("A/B/", render("{{#each items}}{{this}}/{{/each}}", Map.of("items", List.of("A", "B"))), "scalar loop");
        equal("0:张三:Acme:12;", render("{{#each users}}{{@index}}:{{name}}:{{@root.company}}:{{#each scores}}{{this}}{{/each}};{{/each}}",
                Map.of("company", "Acme", "users", List.of(Map.of("name", "张三", "scores", List.of(1, 2))))), "nested loops and root scope");
        equal("yes", render("{{#if approved}}yes{{else}}no{{/if}}", Map.of("approved", true)), "true condition");
        equal("no", render("{{#if approved}}yes{{else}}no{{/if}}", Map.of("approved", false)), "false condition");
        equal("no", render("{{#if amount}}yes{{else}}no{{/if}}", Map.of("amount", 0)), "zero is false");
        equal("1,234.57/12.35%", render("{{formatAmount amount}}/{{formatPercent rate}}",
                Map.of("amount", new BigDecimal("1234.565"), "rate", new BigDecimal("0.12345"))), "decimal rounding and percent");
        equal("壹仟贰佰叁拾肆元伍角陆分", render("{{amountToChinese amount}}", Map.of("amount", new BigDecimal("1234.56"))), "Chinese amount");
        equal("零元整", render("{{amountToChinese amount}}", Map.of("amount", 0)), "Chinese zero amount");
        equal("负壹佰元零伍分", render("{{amountToChinese amount}}", Map.of("amount", new BigDecimal("-100.05"))), "negative Chinese amount");
        equal("零元伍分", render("{{amountToChinese amount}}", Map.of("amount", new BigDecimal("0.05"))), "fraction only Chinese amount");
        equal("壹拾元整", render("{{amountToChinese amount}}", Map.of("amount", new BigDecimal("9.995"))), "Chinese amount decimal carry");
        equal("2026/10/17", render("{{formatDate day 'yyyy/MM/dd'}}", Map.of("day", LocalDate.of(2026, 10, 17))), "date pattern");
        equal("2026-10-17 09:30", render("{{formatDate time 'yyyy-MM-dd HH:mm'}}",
                Map.of("time", LocalDateTime.of(2026, 10, 17, 9, 30))), "local date time");
        equal("2026-10-17 08:00", render("{{formatDate time 'yyyy-MM-dd HH:mm'}}",
                Map.of("time", Date.from(Instant.parse("2026-10-17T00:00:00Z")))), "fixed print timezone");
        equal("2026-10-17", render("{{formatDate day}}", Map.of("day", "2026-10-17")), "default date format");
        equal("/", render("{{formatAmount missing}}/{{formatDate missing}}", Map.of()), "missing formatter values blank");
        rejected("{{name.getClass()}}", Map.of(), "method access rejected");
        rejected("{{user.class.classLoader}}", Map.of(), "class access rejected");
        rejected("$" + "{'freemarker.template.utility.Execute'?new()('whoami')}", Map.of(), "native class construction rejected before execution");
        rejected("$" + "{user?api}", Map.of(), "native API access rejected");
        rejected("<#include 'file:///private'>", Map.of(), "native include rejected");
        rejected("{{evaluate value}}", Map.of("value", "anything"), "unlisted helper rejected");
        rejected("{{#if enabled}}x{{/each}}", Map.of(), "mismatched block rejected");
        rejected("{{formatDate day 'bad-pattern'}}", Map.of("day", "2026-10-17"), "invalid formatter rejected");
        rejected("{{#each items}}{{this}}{{/each}}", Map.of("items", 1), "wrong loop type rejected");
        rejected("{{value}}", Map.of("value", new Object()), "arbitrary object rejected");
        Map<String, Object> cyclic = new LinkedHashMap<>(); cyclic.put("cycle", cyclic);
        rejected("{{value}}", cyclic, "cyclic input bounded");
        System.out.println("PrintTemplateRendererBasicChecks PASS checks=" + checks);
    }

    private static String render(String source, Map<String, Object> data) { return RENDERER.render(source, data); }
    private static void equal(String expected, String actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + " expected=" + expected + " actual=" + actual);
        checks++;
    }
    private static void rejected(String source, Map<String, Object> data, String label) {
        try { render(source, data); } catch (ServiceException expected) { checks++; return; }
        throw new AssertionError(label);
    }
}
