package com.cloudflow.common.core.report;

import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectReader;
import com.fasterxml.jackson.databind.cfg.CoercionAction;
import com.fasterxml.jackson.databind.cfg.CoercionInputShape;
import com.fasterxml.jackson.databind.type.LogicalType;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class ReportValidation {
    private ReportValidation() { }

    public static <Value> Value read(ObjectMapper mapper, JsonNode input, Class<Value> type) {
        if (input == null || !input.isObject()) throw invalid("报表参数必须为对象");
        try {
            return strictReader(mapper, mapper.constructType(type)).readValue(input);
        } catch (IOException | IllegalArgumentException exception) {
            throw invalid("报表参数包含未允许的字段或类型");
        }
    }

    public static ObjectReader strictReader(ObjectMapper mapper, JavaType type) {
        ObjectMapper strict = mapper.copy().disable(MapperFeature.ALLOW_COERCION_OF_SCALARS);
        for (CoercionInputShape shape : List.of(CoercionInputShape.Integer, CoercionInputShape.Float, CoercionInputShape.Boolean)) {
            strict.coercionConfigFor(LogicalType.Textual).setCoercion(shape, CoercionAction.Fail);
        }
        return strict.readerFor(type).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT);
    }

    public static PreparedReportQuery prepare(ReportDataset dataset, ReportQuery query, LocalDate today) {
        if (query == null || today == null) throw invalid("缺少报表查询配置");
        List<String> dimensions = query.dimensions() == null ? List.of() : query.dimensions();
        if (dimensions.size() > 2 || dimensions.stream().anyMatch(field -> field == null || !dataset.field(field).dimension())
                || new HashSet<>(dimensions).size() != dimensions.size()) throw invalid("最多选择两个不同的注册维度");
        List<ReportQuery.Measure> measures = query.measures();
        if (measures == null || measures.isEmpty() || measures.size() > 5) throw invalid("请选择一至五个度量");
        Set<ReportQuery.Measure> seen = new HashSet<>();
        for (ReportQuery.Measure measure : measures) {
            if (measure == null || measure.field() == null || measure.aggregate() == null
                    || !dataset.field(measure.field()).aggregates().contains(measure.aggregate()) || !seen.add(measure)) {
                throw invalid("度量字段、聚合方式或重复度量无效");
            }
        }
        PreparedReportQuery.FilterGroup filters = filters(dataset, query.filters(), 1, new Counter());
        if (dataset.unitPartition() != null && !dimensions.contains(dataset.unitPartition()) && !oneUnit(filters)) {
            throw invalid("假期须按单位分组，或用AND条件明确只选择DAY或HOUR");
        }
        List<ReportQuery.Sort> sorts = query.sorts() == null ? List.of() : query.sorts();
        Set<String> sortColumns = new HashSet<>();
        if (sorts.size() > dimensions.size() + measures.size()) throw invalid("排序项超过结果列数");
        for (ReportQuery.Sort sort : sorts) {
            if (sort == null || sort.column() == null || sort.direction() == null
                    || !List.of("ASC", "DESC").contains(sort.direction()) || !sortColumns.add(sort.column())
                    || !columnAllowed(sort.column(), dimensions.size(), measures.size())) throw invalid("排序列或方向未注册");
        }
        int limit = query.limitRows() == null ? 500 : query.limitRows();
        if (limit < 1 || limit > 2000) throw invalid("结果行数须在1至2000之间");
        LocalDate start = null;
        LocalDate end = null;
        if (dataset.timeBased()) {
            if ((query.startDate() == null) != (query.endDate() == null)) throw invalid("日期范围须同时填写开始和结束日期");
            end = query.endDate() == null ? today : date(query.endDate());
            start = query.startDate() == null ? end.minusDays(89) : date(query.startDate());
            long days = ChronoUnit.DAYS.between(start, end) + 1;
            if (days < 1 || days > 366) throw invalid("单次查询日期范围须在1至366天之间");
        } else if (query.startDate() != null || query.endDate() != null) {
            throw invalid("当前数据集使用完整周期或当前快照，不支持历史日期范围");
        }
        return new PreparedReportQuery(List.copyOf(dimensions), List.copyOf(measures), filters,
                List.copyOf(sorts), limit, limit + 1, start, end, today);
    }

    private static boolean columnAllowed(String column, int dimensions, int measures) {
        for (int index = 1; index <= dimensions; index++) if (column.equals("dimension" + index)) return true;
        for (int index = 1; index <= measures; index++) if (column.equals("measure" + index)) return true;
        return false;
    }

    private static PreparedReportQuery.FilterGroup filters(ReportDataset dataset, ReportQuery.FilterGroup group,
                                                           int depth, Counter counter) {
        if (group == null) return null;
        if (depth > 2 || group.junction() == null || !List.of("AND", "OR").contains(group.junction())) {
            throw invalid("筛选只允许AND或OR，最多嵌套两层");
        }
        List<ReportQuery.Filter> conditions = group.conditions() == null ? List.of() : group.conditions();
        List<ReportQuery.FilterGroup> children = group.groups() == null ? List.of() : group.groups();
        if (conditions.size() + children.size() == 0 || conditions.size() > 20 || children.size() > 20) throw invalid("筛选组为空或超出20项");
        List<PreparedReportQuery.Filter> prepared = new ArrayList<>();
        for (ReportQuery.Filter condition : conditions) {
            if (++counter.conditions > 20 || condition == null || condition.field() == null || condition.operator() == null) throw invalid("筛选项无效或超过20项");
            ReportDataset.Field field = dataset.field(condition.field());
            if (!field.operators().contains(condition.operator())) throw invalid("该字段不允许此筛选操作");
            List<JsonNode> values = condition.values() == null ? List.of() : condition.values();
            int count = values.size();
            boolean validCount = switch (condition.operator()) {
                case "IS_NULL" -> count == 0;
                case "IN" -> count >= 1 && count <= 100;
                case "BETWEEN" -> count == 2;
                default -> count == 1;
            };
            if (!validCount) throw invalid("筛选值数量无效，IN最多100个值");
            List<String> normalized = values.stream().map(value -> scalar(field, condition.operator(), value)).toList();
            if ("BETWEEN".equals(condition.operator()) && compare(field.type(), normalized.get(0), normalized.get(1)) > 0) {
                throw invalid("范围筛选的下界不能大于上界");
            }
            prepared.add(new PreparedReportQuery.Filter(field.code(), condition.operator(), normalized));
        }
        List<PreparedReportQuery.FilterGroup> groups = new ArrayList<>();
        for (ReportQuery.FilterGroup child : children) {
            if (child == null) throw invalid("筛选子组不能为空");
            groups.add(filters(dataset, child, depth + 1, counter));
        }
        return new PreparedReportQuery.FilterGroup(group.junction(), List.copyOf(prepared), List.copyOf(groups));
    }

    private static String scalar(ReportDataset.Field field, String operator, JsonNode value) {
        if (value == null || value.isNull() || value.isContainerNode() || value.isBoolean()) throw invalid("筛选值类型错误");
        String text = value.asText();
        switch (field.type()) {
            case "TEXT" -> {
                if (!value.isTextual() || text.codePointCount(0, text.length()) > 200 || text.codePoints().anyMatch(Character::isISOControl)) {
                    throw invalid("文本筛选值须为最多200字且无控制字符的文本");
                }
                if ("UNIT".equals(field.code()) && !List.of("DAY", "HOUR").contains(text)) throw invalid("假期单位只允许DAY或HOUR");
                if ("LIKE".equals(operator)) return "%" + text.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
                return text;
            }
            case "ID" -> {
                if (!text.matches("[1-9][0-9]{0,18}")) throw invalid("编号筛选值必须为正整数");
                try { return Long.toString(Long.parseLong(text)); }
                catch (NumberFormatException exception) { throw invalid("编号筛选值超出范围"); }
            }
            case "NUMBER" -> {
                if (!text.matches("-?(0|[1-9][0-9]{0,19})(\\.[0-9]{1,6})?")) throw invalid("数字筛选值须为最多20位整数及6位小数");
                return new BigDecimal(text).toPlainString();
            }
            case "DATE" -> {
                if (!value.isTextual()) throw invalid("日期筛选值须为yyyy-MM-dd文本");
                return date(text).toString();
            }
            default -> throw invalid("字段类型未注册");
        }
    }

    private static LocalDate date(String value) {
        if (value == null || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw invalid("日期格式须为yyyy-MM-dd");
        try {
            LocalDate parsed = LocalDate.parse(value);
            if (parsed.getYear() < 1000 || parsed.getYear() > 9998) throw invalid("日期年份须在1000至9998之间");
            return parsed;
        } catch (DateTimeException exception) { throw invalid("日期不存在"); }
    }

    private static int compare(String type, String left, String right) {
        return List.of("NUMBER", "ID").contains(type) ? new BigDecimal(left).compareTo(new BigDecimal(right)) : left.compareTo(right);
    }

    private static boolean oneUnit(PreparedReportQuery.FilterGroup group) {
        if (group == null || !"AND".equals(group.junction())) return false;
        return group.conditions().stream().anyMatch(filter -> "UNIT".equals(filter.field()) && "EQ".equals(filter.operator()))
                || group.groups().stream().anyMatch(ReportValidation::oneUnit);
    }

    public static ServiceException invalid(String message) { return new ServiceException(message, 400); }

    private static final class Counter { private int conditions; }
}
