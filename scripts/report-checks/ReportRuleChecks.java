package com.cloudflow.report.checks;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.controller.ReportQueryController;
import com.cloudflow.auth.domain.report.ReportDefinitionInput;
import com.cloudflow.auth.domain.report.SysReportDataset;
import com.cloudflow.auth.service.report.ReportDatasetService;
import com.cloudflow.auth.service.report.ReportDefinitionRules;
import com.cloudflow.auth.service.report.ReportFeignConfiguration;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportDataset;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportRegistry;
import com.cloudflow.common.core.report.ReportResult;
import com.cloudflow.common.core.report.ReportRow;
import com.cloudflow.common.core.report.ReportValidation;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.report.ReportAccess;
import com.cloudflow.crm.controller.CrmReportController;
import com.cloudflow.hr.controller.HrReportController;
import com.cloudflow.oa.controller.OaReportController;
import com.cloudflow.workflow.controller.WorkflowReportController;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import feign.Retryer;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;
import org.springframework.web.bind.annotation.PostMapping;

public final class ReportRuleChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 28);
    private static final Set<String> PERMISSIONS = new HashSet<>();
    private static int assertions;

    public static void main(String[] arguments) throws Exception {
        StpLogic previous = StpUtil.getStpLogic();
        StpUtil.setStpLogic(new StpLogic("report-checks") {
            @Override public void checkLogin() { }
            @Override public long getLoginIdAsLong() { return 501L; }
            @Override public boolean hasPermission(String permission) { return PERMISSIONS.contains(permission); }
            @Override public void checkPermission(String permission) { if (!hasPermission(permission)) throw new ServiceException("denied", 403); }
        });
        try {
            identity(); registry(); queries(); filters(); layouts(); results(); permissions(); registrations(); endpoints(); strictInput();
            System.out.println("REPORT_RULE_CHECKS: assertions=" + assertions + "; failed=0; real_rule_classes=true; identity_double=true; mysql=false; http=false");
        } finally { UserContext.clear(); PERMISSIONS.clear(); StpUtil.setStpLogic(previous); }
    }

    private static void registry() {
        equal(9, ReportRegistry.datasets().size(), "exact fixed datasets");
        for (ReportDataset dataset : ReportRegistry.datasets()) {
            equal(dataset, ReportRegistry.require(dataset.code()), "registered code resolves");
            equal(dataset.fields().size(), new HashSet<>(dataset.fields().stream().map(ReportDataset.Field::code).toList()).size(), "unique fields");
            rejects(() -> ReportRegistry.require(dataset.code().toLowerCase()), "case is not guessed");
            for (ReportDataset.Field field : dataset.fields()) equal(field, dataset.field(field.code()), "exact field lookup");
        }
        for (String code : List.of("", "WF_INSTANCE ", "class.forName", "../../HR_LEAVE", "WF_INSTANCE;DELETE")) rejects(() -> ReportRegistry.require(code), "unregistered dataset");
        rejects(() -> ReportRegistry.require(null), "null dataset");
    }

    private static ReportQuery basic(String code) {
        ReportDataset dataset = ReportRegistry.require(code);
        ReportDataset.Field field = dataset.fields().stream().filter(candidate -> !candidate.aggregates().isEmpty()).findFirst().orElseThrow();
        return new ReportQuery(dataset.unitPartition() == null ? List.of() : List.of(dataset.unitPartition()), List.of(new ReportQuery.Measure(field.code(), field.aggregates().get(0))), null, List.of(), 500, null, null);
    }

    private static PreparedReportQuery prepare(String code, ReportQuery query) { return ReportValidation.prepare(ReportRegistry.require(code), query, TODAY); }
    private static ReportQuery withFilters(String code, ReportQuery.FilterGroup group) {
        ReportQuery query = basic(code);
        return new ReportQuery(query.dimensions(), query.measures(), group, query.sorts(), query.limitRows(), null, null);
    }
    private static ReportQuery.Filter condition(String field, String operator, Object... values) {
        List<JsonNode> nodes = new ArrayList<>();
        for (Object value : values) nodes.add(JSON.valueToTree(value));
        return new ReportQuery.Filter(field, operator, nodes);
    }
    private static ReportQuery.FilterGroup group(String junction, ReportQuery.Filter... conditions) { return new ReportQuery.FilterGroup(junction, List.of(conditions), List.of()); }

    private static void queries() {
        for (ReportDataset dataset : ReportRegistry.datasets()) {
            PreparedReportQuery query = prepare(dataset.code(), basic(dataset.code()));
            equal(501, query.fetchRows(), "one extra database row");
            equal(dataset.timeBased() ? TODAY.minusDays(89) : null, query.startDate(), "ninety inclusive days or complete snapshot");
            equal(dataset.timeBased() ? TODAY : null, query.endDate(), "time-based endpoint");
            for (ReportDataset.Field field : dataset.fields()) {
                for (String aggregate : field.aggregates()) {
                    ReportQuery measure = new ReportQuery(query.dimensions(), List.of(new ReportQuery.Measure(field.code(), aggregate)), null, List.of(), 2000, null, null);
                    equal(2001, prepare(dataset.code(), measure).fetchRows(), "all registered aggregates work");
                }
            }
        }
        ReportQuery base = basic("WF_INSTANCE");
        for (int limit : List.of(0, -1, 2001, Integer.MAX_VALUE)) rejects(() -> prepare("WF_INSTANCE", new ReportQuery(null, base.measures(), null, null, limit, null, null)), "limit boundary");
        rejects(() -> prepare("WF_INSTANCE", new ReportQuery(List.of("STATUS", "STATUS"), base.measures(), null, null, 1, null, null)), "duplicate dimensions");
        rejects(() -> prepare("WF_INSTANCE", new ReportQuery(List.of("STATUS", "BUSINESS_DATE", "DEFINITION"), base.measures(), null, null, 1, null, null)), "three dimensions");
        for (String dimension : List.of("status", "STATUS,tenant_id", "INSTANCE_COUNT", "tenant_id")) rejects(() -> prepare("WF_INSTANCE", new ReportQuery(List.of(dimension), base.measures(), null, null, 1, null, null)), "unregistered dimension");
        rejects(() -> prepare("WF_INSTANCE", new ReportQuery(null, List.of(), null, null, 1, null, null)), "zero measures");
        rejects(() -> prepare("WF_INSTANCE", new ReportQuery(null, List.of(base.measures().get(0), base.measures().get(0)), null, null, 1, null, null)), "duplicate measures");
        rejects(() -> prepare("WF_INSTANCE", new ReportQuery(null, List.of(new ReportQuery.Measure("INSTANCE_COUNT", "SUM")), null, null, 1, null, null)), "count field cannot use sum");
        rejects(() -> prepare("WF_INSTANCE", new ReportQuery(null, base.measures(), null, List.of(new ReportQuery.Sort("measure2", "ASC")), 1, null, null)), "sort must be an output column");
        rejects(() -> prepare("WF_INSTANCE", new ReportQuery(null, base.measures(), null, List.of(new ReportQuery.Sort("measure1", "asc")), 1, null, null)), "sort case is exact");
        for (String date : List.of("2026-02-29", "2026-9-01", "0999-01-01", "9999-01-01")) rejects(() -> prepare("WF_INSTANCE", new ReportQuery(null, base.measures(), null, null, 1, date, date)), "invalid date");
        equal(LocalDate.of(2024, 1, 1), prepare("WF_INSTANCE", new ReportQuery(null, base.measures(), null, null, 1, "2024-01-01", "2024-12-31")).startDate(), "366 inclusive days accepted");
        rejects(() -> prepare("WF_INSTANCE", new ReportQuery(null, base.measures(), null, null, 1, "2024-01-01", "2025-01-01")), "367 inclusive days rejected");
        rejects(() -> prepare("WF_INSTANCE", new ReportQuery(null, base.measures(), null, null, 1, "2026-09-28", null)), "half date range rejected");
        rejects(() -> prepare("OA_ASSET", new ReportQuery(null, basic("OA_ASSET").measures(), null, null, 1, "2026-09-28", "2026-09-28")), "no invented historical snapshot");
    }

    private static void filters() {
        PreparedReportQuery literal = prepare("WF_INSTANCE", withFilters("WF_INSTANCE", group("AND", condition("STATUS", "LIKE", "x!%_' OR 1=1"))));
        equal("%x!!!%!_' OR 1=1%", literal.filters().conditions().get(0).values().get(0), "LIKE escapes wildcard and escape character");
        for (String operator : List.of("EQ", "NE", "GT", "GE", "LT", "LE")) prepare("CRM_FUNNEL", withFilters("CRM_FUNNEL", group("AND", condition("EXPECTED_AMOUNT", operator, "12.340000"))));
        for (Object value : List.of(true, List.of("x"), java.util.Map.of("x", "y"), 42)) rejects(() -> prepare("WF_INSTANCE", withFilters("WF_INSTANCE", group("AND", condition("STATUS", "EQ", value)))), "TEXT requires string");
        for (String value : List.of("1e3", "00", "1.0000001", "123456789012345678901", "NaN")) rejects(() -> prepare("CRM_FUNNEL", withFilters("CRM_FUNNEL", group("AND", condition("EXPECTED_AMOUNT", "EQ", value)))), "decimal constraints");
        for (String value : List.of("0", "-1", "1.5", "9223372036854775808")) rejects(() -> prepare("WF_INSTANCE", withFilters("WF_INSTANCE", group("AND", condition("DEPARTMENT", "EQ", value)))), "ID positive long");
        rejects(() -> prepare("WF_INSTANCE", withFilters("WF_INSTANCE", group("AND", condition("BUSINESS_DATE", "BETWEEN", "2026-09-28", "2026-09-27")))), "range order");
        rejects(() -> prepare("CRM_FUNNEL", withFilters("CRM_FUNNEL", group("AND", condition("EXPECTED_AMOUNT", "LIKE", "12")))), "number LIKE rejected");
        rejects(() -> prepare("WF_INSTANCE", withFilters("WF_INSTANCE", group("and", condition("STATUS", "EQ", "PASSED")))), "junction exact");
        rejects(() -> prepare("WF_INSTANCE", withFilters("WF_INSTANCE", group("AND"))), "empty group rejected");
        equal(0, prepare("WF_INSTANCE", withFilters("WF_INSTANCE", group("AND", condition("STATUS", "IS_NULL")))).filters().conditions().get(0).values().size(), "IS_NULL has no value");
        rejects(() -> prepare("WF_INSTANCE", withFilters("WF_INSTANCE", group("AND", condition("STATUS", "IS_NULL", "x")))), "IS_NULL rejects value");
        List<JsonNode> values = new ArrayList<>(); for (int index = 0; index < 100; index++) values.add(JSON.valueToTree("value-" + index));
        equal(100, prepare("WF_INSTANCE", withFilters("WF_INSTANCE", group("AND", new ReportQuery.Filter("STATUS", "IN", values)))).filters().conditions().get(0).values().size(), "100 IN entries");
        values.add(JSON.valueToTree("excess")); rejects(() -> prepare("WF_INSTANCE", withFilters("WF_INSTANCE", group("AND", new ReportQuery.Filter("STATUS", "IN", values)))), "101 IN entries rejected");
        ReportQuery.FilterGroup child = group("OR", condition("STATUS", "EQ", "PASSED"), condition("STATUS", "EQ", "REJECTED"));
        ReportQuery.FilterGroup parent = new ReportQuery.FilterGroup("AND", List.of(), List.of(child));
        equal(1, prepare("WF_INSTANCE", withFilters("WF_INSTANCE", parent)).filters().groups().size(), "two layers accepted");
        rejects(() -> prepare("WF_INSTANCE", withFilters("WF_INSTANCE", new ReportQuery.FilterGroup("AND", List.of(), List.of(parent)))), "third layer rejected");
        List<ReportQuery.Filter> twenty = new ArrayList<>(); for (int index = 0; index < 20; index++) twenty.add(condition("STATUS", "NE", "status-" + index));
        equal(20, prepare("WF_INSTANCE", withFilters("WF_INSTANCE", new ReportQuery.FilterGroup("AND", twenty, List.of()))).filters().conditions().size(), "twenty conditions accepted");
        rejects(() -> prepare("WF_INSTANCE", withFilters("WF_INSTANCE", new ReportQuery.FilterGroup("AND", twenty, List.of(child)))), "total conditions across groups bounded");
        ReportQuery leave = basic("HR_LEAVE");
        rejects(() -> prepare("HR_LEAVE", new ReportQuery(List.of(), leave.measures(), null, null, 1, null, null)), "units never mixed");
        equal(List.of(), prepare("HR_LEAVE", new ReportQuery(List.of(), leave.measures(), group("AND", condition("UNIT", "EQ", "DAY")), null, 1, null, null)).dimensions(), "single unit permits no group");
        rejects(() -> prepare("HR_LEAVE", new ReportQuery(List.of(), leave.measures(), group("OR", condition("UNIT", "EQ", "DAY"), condition("EMPLOYEE", "EQ", 501)), null, 1, null, null)), "OR cannot widen a unit constraint");
        rejects(() -> prepare("HR_LEAVE", withFilters("HR_LEAVE", group("AND", condition("UNIT", "EQ", "WEEK")))), "only DAY and HOUR");
    }

    private static void layouts() {
        equal(0, ReportDefinitionRules.layout(List.of()).size(), "empty dashboard allowed");
        List<ReportDefinitionInput.Item> items = new ArrayList<>();
        for (int index = 0; index < 30; index++) items.add(new ReportDefinitionInput.Item(Integer.toString(index + 1), 0, index, 12, 1));
        equal(30, ReportDefinitionRules.layout(items).size(), "30 charts accepted");
        items.add(new ReportDefinitionInput.Item("31", 0, 30, 12, 1)); rejects(() -> ReportDefinitionRules.layout(items), "31 charts rejected");
        ReportDefinitionInput.Item first = new ReportDefinitionInput.Item("1", 0, 0, 6, 10);
        equal(2, ReportDefinitionRules.layout(List.of(first, new ReportDefinitionInput.Item("2", 6, 0, 6, 10))).size(), "adjacent charts accepted");
        rejects(() -> ReportDefinitionRules.layout(List.of(first, new ReportDefinitionInput.Item("2", 5, 0, 6, 10))), "overlap rejected");
        rejects(() -> ReportDefinitionRules.layout(List.of(first, new ReportDefinitionInput.Item("1", 6, 0, 6, 10))), "duplicate reference rejected");
        for (ReportDefinitionInput.Item item : List.of(new ReportDefinitionInput.Item("1", -1, 0, 1, 1), new ReportDefinitionInput.Item("1", 11, 0, 2, 1), new ReportDefinitionInput.Item("1", 0, 1001, 1, 1), new ReportDefinitionInput.Item("1", 0, 0, 1, 101), new ReportDefinitionInput.Item("1", 0, 0, 0, 1))) rejects(() -> ReportDefinitionRules.layout(List.of(item)), "grid boundary rejected");
        for (String palette : List.of("#123456", "url(https://example.invalid)", "<script>", "primary")) rejects(() -> ReportDefinitionRules.style(new ReportDefinitionInput.Style(palette, true, false)), "only semantic palette");
        ReportQuery count = basic("WF_INSTANCE");
        ReportDefinitionRules.chartType("METRIC", count);
        rejects(() -> ReportDefinitionRules.chartType("PIE", count), "pie requires dimension");
        rejects(() -> ReportDefinitionRules.chartType("BAR", count), "bar requires dimension");
        rejects(() -> ReportDefinitionRules.chartType("HTML", count), "unregistered visualization");
        rejects(() -> ReportDefinitionRules.name("bad\nname", 100), "control character rejected");
        equal("图表", ReportDefinitionRules.name(" 图表 ", 100), "name trim");
        rejects(() -> ReportDefinitionRules.version(-1), "negative version rejected");
    }

    private static void results() throws Exception {
        PreparedReportQuery query = prepare("CRM_FUNNEL", new ReportQuery(List.of("STAGE"), List.of(new ReportQuery.Measure("EXPECTED_AMOUNT", "SUM")), null, null, 1, null, null));
        ReportRow first = new ReportRow(); first.setDimension1("LEAD"); first.setMeasure1(new BigDecimal("9999999999999.99")); first.setSourceRows(1L); first.setIntegrityError(0L);
        ReportRow second = new ReportRow(); second.setDimension1("WON"); second.setMeasure1(BigDecimal.ONE); second.setSourceRows(1L); second.setIntegrityError(0L);
        ReportResult result = ReportResult.from(ReportRegistry.require("CRM_FUNNEL"), query, List.of(first, second));
        equal(true, result.truncated(), "extra row announces truncation"); equal(1, result.rows().size(), "result limit retained");
        JsonNode serialized = JSON.valueToTree(first);
        equal(true, serialized.get("measure1").isTextual(), "money is serialized as decimal text");
        equal("9999999999999.99", serialized.get("measure1").asText(), "money precision retained");
        equal(false, serialized.has("integrityError"), "internal integrity not exposed"); equal(false, serialized.has("sourceRows"), "internal row count not exposed");
        second.setIntegrityError(1L); rejects(() -> ReportResult.from(ReportRegistry.require("CRM_FUNNEL"), query, List.of(first, second)), "invalid extra row cannot hide behind truncation");
        first.setSourceRows(0L); equal(0, ReportResult.from(ReportRegistry.require("CRM_FUNNEL"), query, List.of(first)).rows().size(), "empty aggregate not fake business row");
        ReportRow summary = new ReportRow(); summary.setMissingDateSummary(true); summary.setMeasure1(new BigDecimal("2.00"));
        summary.setMeasure2(new BigDecimal("100.10")); summary.setMeasure3(new BigDecimal("30.03")); summary.setMeasure4(new BigDecimal("20.02")); summary.setSourceRows(2L);
        PreparedReportQuery expense = prepare("OA_EXPENSE", basic("OA_EXPENSE"));
        ReportResult expenseResult = ReportResult.from(ReportRegistry.require("OA_EXPENSE"), expense, List.of(summary));
        equal(0, expenseResult.rows().size(), "undated amounts never become dated chart rows"); equal(false, expenseResult.truncated(), "summary does not consume chart row limit");
        equal(new ReportResult.MissingDates("2", "100.10", "30.03", "20.02"), expenseResult.missingDates(), "undated decimal amounts retained separately");
        equal(false, JSON.valueToTree(summary).has("missingDateSummary"), "internal summary marker not exposed");
        rejects(() -> ReportResult.from(ReportRegistry.require("CRM_FUNNEL"), query, List.of(summary)), "other datasets cannot attach undated amounts");
        rejects(() -> ReportResult.from(ReportRegistry.require("OA_EXPENSE"), expense, List.of(summary, summary)), "duplicate summaries rejected");
        summary.setMeasure1(new BigDecimal("1.5")); rejects(() -> ReportResult.from(ReportRegistry.require("OA_EXPENSE"), expense, List.of(summary)), "fractional missing claim count rejected");
        summary.setMeasure1(new BigDecimal("-1")); rejects(() -> ReportResult.from(ReportRegistry.require("OA_EXPENSE"), expense, List.of(summary)), "negative missing claim count rejected");
        summary.setMeasure1(BigDecimal.ZERO); summary.setMeasure2(null); rejects(() -> ReportResult.from(ReportRegistry.require("OA_EXPENSE"), expense, List.of(summary)), "missing summary amount rejected");
    }

    private static void permissions() {
        ReportDataset dataset = ReportRegistry.require("HR_LEAVE");
        PERMISSIONS.clear(); equal(false, ReportAccess.allowed(dataset), "no dataset grant");
        PERMISSIONS.add(dataset.permission()); equal(false, ReportAccess.allowed(dataset), "dataset grant does not imply business read");
        PERMISSIONS.add("hr:leave:mine"); equal(true, ReportAccess.allowed(dataset), "self source read allowed"); ReportAccess.requireDataset(dataset);
        UserContext.setAuthToken(""); rejects(ReportAccess::requireContext, "missing internal token"); identity();
        UserContext.setUserId(502L); rejects(ReportAccess::requireContext, "session and user must match"); identity();
        UserContext.setTenantId(null); rejects(ReportAccess::requireContext, "tenant required"); identity();
    }

    private static void registrations() throws Exception {
        ReportDatasetService service = new ReportDatasetService(null, JSON);
        for (ReportDataset dataset : ReportRegistry.datasets()) {
            SysReportDataset record = registration(dataset); service.validateRegistration(record, dataset);
            for (Consumer<SysReportDataset> change : List.<Consumer<SysReportDataset>>of(value -> value.setMapperMethod("evil.Mapper.run"), value -> value.setPermissionCode("system:report:chart:list"), value -> value.setTenantId(999L), value -> value.setTenantIsolatedFlag(0), value -> value.setDataScopeFlag(0), value -> value.setFieldMeta("{}"), value -> value.setDefaultFilters("{\"rollingDays\":999}"))) {
                SysReportDataset modified = registration(dataset); change.accept(modified); rejects(() -> service.validateRegistration(modified, dataset), "tampered registration rejected");
            }
        }
    }
    private static SysReportDataset registration(ReportDataset definition) throws Exception {
        SysReportDataset record = new SysReportDataset(); record.setTenantId(UserContext.getTenantId()); record.setDatasetCode(definition.code()); record.setDatasetName(definition.name()); record.setModule(definition.module()); record.setMapperMethod(definition.mapperMethod()); record.setPermissionCode(definition.permission()); record.setTenantIsolatedFlag(1); record.setDataScopeFlag(1); record.setDeleted(0); record.setStatus("ACTIVE");
        record.setFieldMeta(JSON.writeValueAsString(definition)); record.setDefaultFilters(JSON.writeValueAsString(JSON.createObjectNode().put("rollingDays", definition.timeBased() ? 90 : 0))); return record;
    }

    private static void endpoints() {
        int queryEndpoints = 0;
        int rejectionEndpoints = 0;
        for (Method method : ReportQueryController.class.getDeclaredMethods()) {
            PostMapping route = method.getAnnotation(PostMapping.class); if (route == null) continue;
            RateLimiter rate = method.getAnnotation(RateLimiter.class); equal("report-query", rate.key(), "all dataset queries share limiter"); equal(30, rate.count(), "thirty queries"); equal(60, rate.time(), "per minute"); equal(LimitType.USER, rate.limitType(), "per user");
            String code = route.value()[0].split("/")[1];
            if ("{code}".equals(code)) {
                equal(List.of("system:report:dataset:list"), List.of(method.getAnnotation(SaCheckPermission.class).value()), "unknown dataset rejection is permission protected");
                rejectionEndpoints++;
                continue;
            }
            ReportDataset dataset = ReportRegistry.require(code);
            equal(List.of(dataset.permission()), List.of(method.getAnnotation(SaCheckPermission.class).value()), "exact dataset permission annotation");
            queryEndpoints++;
        }
        equal(9, queryEndpoints, "nine fixed external query endpoints");
        equal(1, rejectionEndpoints, "one rejection-only fallback");
        try {
            new ReportQueryController(null, JSON).unsupportedDataset();
            throw new AssertionError("unregistered dataset must not execute a query");
        } catch (ServiceException exception) { equal(404, exception.getCode(), "unregistered dataset always returns not found"); }
        for (Class<?> controller : List.of(CrmReportController.class, HrReportController.class, OaReportController.class, WorkflowReportController.class)) {
            for (Method method : controller.getDeclaredMethods()) if (method.isAnnotationPresent(PostMapping.class)) equal(List.of("cloudflow-auth"), List.of(method.getAnnotation(Inner.class).allowedServices()), "source accepts only auth service");
        }
        ReportFeignConfiguration configuration = new ReportFeignConfiguration(); equal(1000, configuration.reportOptions().connectTimeoutMillis(), "bounded connect timeout"); equal(6500, configuration.reportOptions().readTimeoutMillis(), "bounded source read timeout"); equal(Retryer.NEVER_RETRY, configuration.reportRetryer(), "no hidden query retries");
    }

    private static void strictInput() throws Exception {
        ReportValidation.read(JSON, JSON.valueToTree(basic("WF_INSTANCE")), ReportQuery.class);
        ObjectNode unknown = JSON.valueToTree(basic("WF_INSTANCE")); unknown.put("mapperMethod", "anything"); rejects(() -> ReportValidation.read(JSON, unknown, ReportQuery.class), "client cannot register mapper");
        ObjectNode fractional = JSON.valueToTree(basic("WF_INSTANCE")); fractional.put("limitRows", 1.5); rejects(() -> ReportValidation.read(JSON, fractional, ReportQuery.class), "fractional row limit rejected");
        ObjectNode coerced = JSON.valueToTree(basic("WF_INSTANCE")); coerced.put("limitRows", "20"); rejects(() -> ReportValidation.read(JSON, coerced, ReportQuery.class), "numeric strings cannot coerce row limit");
        ObjectNode wrongName = JSON.createObjectNode().put("name", 123); rejects(() -> ReportValidation.read(JSON, wrongName, ReportDefinitionInput.Dashboard.class), "numbers cannot coerce names");
        ObjectNode style = JSON.createObjectNode().put("palette", "PRIMARY").put("showLegend", "true"); rejects(() -> ReportValidation.read(JSON, style, ReportDefinitionInput.Style.class), "boolean strings rejected");
    }

    private static void identity() { UserContext.setTenantId(100000L); UserContext.setUserId(501L); UserContext.setDeptId(201L); UserContext.setAuthToken("report-unit-token"); }
    private static void equal(Object expected, Object actual, String label) { if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + "; actual=" + actual); assertions++; }
    private static void rejects(Runnable operation, String label) { try { operation.run(); } catch (ServiceException expected) { assertions++; return; } throw new AssertionError(label + ": operation unexpectedly accepted"); }
}
