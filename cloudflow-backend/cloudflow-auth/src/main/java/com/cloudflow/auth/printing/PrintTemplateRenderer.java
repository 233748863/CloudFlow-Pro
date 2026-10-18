package com.cloudflow.auth.printing;

import cn.hutool.core.convert.NumberChineseFormatter;
import com.cloudflow.common.core.exception.ServiceException;
import freemarker.core.HTMLOutputFormat;
import freemarker.core.PlainTextOutputFormat;
import freemarker.core.TemplateClassResolver;
import freemarker.template.Configuration;
import freemarker.template.SimpleObjectWrapper;
import freemarker.template.Template;
import freemarker.template.TemplateBooleanModel;
import freemarker.template.TemplateDateModel;
import freemarker.template.TemplateException;
import freemarker.template.TemplateExceptionHandler;
import freemarker.template.TemplateHashModelEx;
import freemarker.template.TemplateMethodModelEx;
import freemarker.template.TemplateModel;
import freemarker.template.TemplateModelException;
import freemarker.template.TemplateNumberModel;
import freemarker.template.TemplateScalarModel;
import freemarker.template.TemplateSequenceModel;
import java.io.IOException;
import java.io.StringReader;
import java.io.Writer;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import org.springframework.stereotype.Component;

/**
 * G5 HTML 渲染入口。只接受 PRD 的 {{ }} 白名单语法；不提供原生 FreeMarker 执行入口。
 * 数据须由已完成业务及字段权限校验的调用方传入，仅允许 Map/List/标量/日期，禁止实体和引擎对象。
 * 此层只生成 HTML；PDF 资源隔离、业务鉴权及输出留痕分别由后续打印管线负责。
 */
@Component
public final class PrintTemplateRenderer {
    private static final ZoneId PRINT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final int MAX_DATA_VALUES = 100000;
    private static final int MAX_OUTPUT_CHARS = 4194304;
    private final Configuration configuration;
    private final Configuration textConfiguration;

    public PrintTemplateRenderer() {
        configuration = new Configuration(Configuration.VERSION_2_3_32);
        configuration.setNewBuiltinClassResolver(TemplateClassResolver.ALLOWS_NOTHING_RESOLVER);
        configuration.setAPIBuiltinEnabled(false);
        configuration.setObjectWrapper(new SimpleObjectWrapper(Configuration.VERSION_2_3_32));
        configuration.setTemplateLoader(null);
        configuration.setDefaultEncoding("UTF-8");
        configuration.setLocale(Locale.CHINA);
        configuration.setTimeZone(TimeZone.getTimeZone(PRINT_ZONE));
        configuration.setOutputFormat(HTMLOutputFormat.INSTANCE);
        configuration.setAutoEscapingPolicy(Configuration.ENABLE_IF_SUPPORTED_AUTO_ESCAPING_POLICY);
        configuration.setTemplateExceptionHandler(TemplateExceptionHandler.RETHROW_HANDLER);
        configuration.setLogTemplateExceptions(false);
        configuration.setWrapUncheckedExceptions(true);
        configuration.setFallbackOnNullLoopVariable(false);
        configuration.setNumberFormat("computer");
        configuration.setBooleanFormat("c");
        textConfiguration = (Configuration) configuration.clone();
        textConfiguration.setOutputFormat(PlainTextOutputFormat.INSTANCE);
    }

    public String render(String templateContent, Map<String, Object> data) {
        return render(templateContent, data, configuration);
    }

    /** Excel 字符串单元格使用相同白名单语法，按文本输出，不添加 HTML 实体。 */
    public String renderText(String templateContent, Map<String, Object> data) {
        return render(templateContent, data, textConfiguration);
    }

    private String render(String templateContent, Map<String, Object> data, Configuration engine) {
        String compiled = PrintTemplateSyntax.compile(templateContent);
        return process(compiled, normalize(data == null ? Map.of() : data, 0, new DataBudget()), null, engine);
    }

    /** 单次工作簿填充只校验及复制一次数据，避免每个单元格重复遍历整个业务对象。 */
    TextContext prepareText(Map<String, Object> data) {
        return new TextContext(normalize(data, 0, new DataBudget()));
    }

    final class TextContext {
        private final Object data;
        private TextContext(Object data) { this.data = data; }
        String render(String source, String collection, int index, int count) {
            Object item = data;
            if (index >= 0) {
                for (String key : collection.split("\\.")) {
                    item = item instanceof Map<?, ?> fields ? fields.get(key) : null;
                }
                item = item instanceof List<?> items ? items.get(index) : null;
            }
            return process(PrintTemplateSyntax.compileRow(source, index, count), data, item, textConfiguration);
        }
    }

    private String process(String compiled, Object data, Object row, Configuration engine) {
        Map<String, Object> model = new LinkedHashMap<>();
        model.put("__data", data);
        model.put("__row", row);
        RenderBudget budget = new RenderBudget();
        model.put("__step", (TemplateMethodModelEx) arguments -> { budget.step(); return 0; });
        model.put("__truth", (TemplateMethodModelEx) arguments -> truth((TemplateModel) arguments.get(0)));
        model.put("__list", (TemplateMethodModelEx) arguments -> {
            TemplateModel value = (TemplateModel) arguments.get(0);
            if (value instanceof TemplateScalarModel scalar && scalar.getAsString().isEmpty()) return List.of();
            if (!(value instanceof TemplateSequenceModel)) throw new TemplateModelException("each 变量须为数组");
            return value;
        });
        for (String helper : List.of("formatDate", "formatAmount", "amountToChinese", "formatPercent")) {
            model.put(helper, (TemplateMethodModelEx) arguments -> {
                try {
                    TemplateModel value = (TemplateModel) arguments.get(0);
                    if (value instanceof TemplateScalarModel scalar && scalar.getAsString().isEmpty()) return "";
                    return switch (helper) {
                        case "formatDate" -> formatDate(value, arguments.size() == 2
                                ? ((TemplateScalarModel) arguments.get(1)).getAsString() : "yyyy-MM-dd");
                        case "formatAmount" -> decimalFormat(number(value), "#,##0.00");
                        case "formatPercent" -> decimalFormat(number(value).multiply(new BigDecimal("100")), "0.00") + "%";
                        default -> chineseAmount(number(value));
                    };
                } catch (RuntimeException failure) {
                    throw new TemplateModelException("格式化参数无效：" + helper);
                }
            });
        }
        try {
            Template template = new Template("print", new StringReader(compiled), engine);
            LimitedWriter output = new LimitedWriter();
            template.process(model, output);
            return output.toString();
        } catch (IOException | TemplateException failure) {
            // 不向 HTTP、日志或审计透出模板源码和包含敏感字段的引擎异常。
            throw new ServiceException("打印模板渲染失败，请检查区块语法、字段类型及格式化参数", 400);
        }
    }

    private static Object normalize(Object value, int depth, DataBudget budget) {
        budget.accept(depth);
        if (value == null || value instanceof Boolean) return value;
        if (value instanceof String text) { budget.text(text.length()); return text; }
        if (value instanceof Character character) return character.toString();
        if (value instanceof Number number) {
            Class<?> type = number.getClass();
            if (!(type == BigDecimal.class || type == BigInteger.class || type == Byte.class || type == Short.class
                    || type == Integer.class || type == Long.class || type == Float.class || type == Double.class)) {
                throw invalidData();
            }
            try {
                BigDecimal decimal = new BigDecimal(number.toString());
                if (decimal.precision() > 100 || decimal.scale() < -100 || decimal.scale() > 100) throw invalidData();
                return decimal;
            } catch (NumberFormatException failure) { throw invalidData(); }
        }
        if (value instanceof Date date) return new Date(date.getTime());
        if (value instanceof LocalDate date) return date.toString();
        if (value instanceof LocalDateTime date) return date.toString();
        if (value instanceof Instant instant) return instant.toString();
        if (value instanceof OffsetDateTime date) return date.toString();
        if (value instanceof ZonedDateTime date) return date.toOffsetDateTime().toString();
        if (value instanceof Map<?, ?> fields) {
            Map<String, Object> result = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : fields.entrySet()) {
                if (!(entry.getKey() instanceof String key) || key.length() > 256) throw invalidData();
                budget.text(key.length());
                result.put(key, normalize(entry.getValue(), depth + 1, budget));
            }
            return result;
        }
        if (value instanceof List<?> items) {
            List<Object> result = new ArrayList<>();
            for (Object item : items) result.add(normalize(item, depth + 1, budget));
            return result;
        }
        throw invalidData();
    }

    private static boolean truth(TemplateModel value) throws TemplateModelException {
        if (value instanceof TemplateBooleanModel bool) return bool.getAsBoolean();
        if (value instanceof TemplateNumberModel number) return new BigDecimal(number.getAsNumber().toString()).signum() != 0;
        if (value instanceof TemplateScalarModel scalar) return !scalar.getAsString().isEmpty();
        if (value instanceof TemplateSequenceModel sequence) return sequence.size() > 0;
        if (value instanceof TemplateHashModelEx fields) return !fields.isEmpty();
        return value instanceof TemplateDateModel;
    }

    private static BigDecimal number(TemplateModel value) throws TemplateModelException {
        if (value instanceof TemplateNumberModel number) return new BigDecimal(number.getAsNumber().toString());
        if (value instanceof TemplateScalarModel scalar && scalar.getAsString().length() <= 128) {
            BigDecimal parsed = new BigDecimal(scalar.getAsString());
            if (parsed.precision() <= 100 && parsed.scale() >= -100 && parsed.scale() <= 100) return parsed;
        }
        throw new TemplateModelException("金额须为数值");
    }

    private static String decimalFormat(BigDecimal value, String pattern) {
        DecimalFormat format = new DecimalFormat(pattern, DecimalFormatSymbols.getInstance(Locale.CHINA));
        format.setRoundingMode(RoundingMode.HALF_UP);
        return format.format(value);
    }

    private static String chineseAmount(BigDecimal value) {
        BigDecimal rounded = value.setScale(2, RoundingMode.HALF_UP);
        BigDecimal magnitude = rounded.abs();
        if (magnitude.compareTo(new BigDecimal("999999999999.99")) > 0) throw new IllegalArgumentException("金额超出支持范围");
        long integer = magnitude.longValue();
        int fraction = magnitude.remainder(BigDecimal.ONE).movePointRight(2).intValueExact();
        int jiao = fraction / 10;
        int fen = fraction % 10;
        String digits = "零壹贰叁肆伍陆柒捌玖";
        StringBuilder result = new StringBuilder(rounded.signum() < 0 ? "负" : "");
        result.append(integer == 0 ? "零" : NumberChineseFormatter.format(integer, true)).append("元");
        if (fraction == 0) return result.append("整").toString();
        if (jiao > 0) result.append(digits.charAt(jiao)).append("角");
        else if (integer > 0) result.append("零");
        if (fen > 0) result.append(digits.charAt(fen)).append("分");
        return result.toString();
    }

    private static String formatDate(TemplateModel value, String pattern) throws TemplateModelException {
        DateTimeFormatter format = DateTimeFormatter.ofPattern(pattern, Locale.CHINA).withZone(PRINT_ZONE);
        if (value instanceof TemplateDateModel date) return format.format(date.getAsDate().toInstant());
        if (!(value instanceof TemplateScalarModel scalar)) throw new TemplateModelException("日期类型无效");
        String source = scalar.getAsString();
        try { return format.format(Instant.parse(source)); } catch (DateTimeParseException ignored) { }
        try { return format.format(OffsetDateTime.parse(source)); } catch (DateTimeParseException ignored) { }
        TemporalAccessor parsed = source.length() == 10 ? LocalDate.parse(source)
                : LocalDateTime.parse(source.replace(' ', 'T'));
        return format.format(parsed);
    }

    private static ServiceException invalidData() {
        return new ServiceException("打印数据须为对象、数组、基础值或日期，并符合大小和嵌套限制", 400);
    }

    private static final class DataBudget {
        private int values;
        private int characters;
        private void accept(int depth) { if (depth > 32 || ++values > MAX_DATA_VALUES) throw invalidData(); }
        private void text(int count) { if (count > MAX_OUTPUT_CHARS - characters) throw invalidData(); characters += count; }
    }

    private static final class RenderBudget {
        private int iterations;
        private void step() throws TemplateModelException {
            if (++iterations > 100000) throw new TemplateModelException("循环总次数超过100000");
        }
    }

    private static final class LimitedWriter extends Writer {
        private final StringBuilder output = new StringBuilder();
        @Override public void write(char[] characters, int offset, int length) throws IOException {
            if (length > MAX_OUTPUT_CHARS - output.length()) throw new IOException("渲染输出超过4194304个字符");
            output.append(characters, offset, length);
        }
        @Override public void flush() { }
        @Override public void close() { }
        @Override public String toString() { return output.toString(); }
    }
}
