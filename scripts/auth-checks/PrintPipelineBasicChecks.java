package com.cloudflow.auth.checks;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckLogin;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.controller.SysPrintController;
import com.cloudflow.auth.controller.SysPrintTemplateController;
import com.cloudflow.auth.domain.SysPrintRecord;
import com.cloudflow.auth.domain.SysPrintTemplate;
import com.cloudflow.auth.mapper.SysPrintRecordMapper;
import com.cloudflow.auth.mapper.SysPrintTemplateMapper;
import com.cloudflow.auth.printing.*;
import com.cloudflow.auth.service.SysPrintRecordService;
import com.cloudflow.auth.service.SysPrintService;
import com.cloudflow.auth.service.SysPrintTemplateService;
import com.cloudflow.auth.service.printing.WorkflowPrintFieldFilter;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.printing.PrintData;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.hr.controller.HrPrintDataController;
import com.cloudflow.oa.controller.OaPrintDataController;
import com.cloudflow.workflow.controller.WorkflowPrintController;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.service.FormDataPermissionFilter;
import com.cloudflow.workflow.service.WorkflowFormAccessService;
import com.cloudflow.workflow.service.WorkflowPrintService;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 本轮统一打印基本检查：正式管线/过滤器，受控持久化和对象授权替身。 */
public final class PrintPipelineBasicChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), SysPrintTemplate.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), SysPrintRecord.class);
        UserContext.setUserId(701L); UserContext.setUserName("print-basic-user"); UserContext.setTenantId(100000L);
        try {
            if (arguments.length == 1 && "extension".equals(arguments[0])) {
                extensionChecks();
                System.out.println("PrintExtensionBasicChecks PASS checks=" + checks);
                return;
            }
            Harness harness = new Harness();
            SysPrintService.PrintOutput output = harness.service.print("expense_claim", 9L, null, "HTML", "127.0.0.1");
            String content = new String(output.bytes(), StandardCharsets.UTF_8);
            check(content.contains("PUBLIC") && !content.contains("HIDDEN") && !content.contains("ALIAS_SECRET"), "hidden and undeclared fields absent from final output");
            check(harness.events.equals(List.of("authorize", "template", "filter", "record")), "authorize, select, filter, persist before delivery");
            check(harness.saved.size() == 1 && harness.saved.get(0).getTenantId() == 100000L
                    && harness.saved.get(0).getOperatorId() == 701L && harness.saved.get(0).getFileSize() == output.bytes().length
                    && harness.saved.get(0).getFileUrl() == null, "server-owned record metadata and no duplicate output file");
            check(!content.contains("<script") && !content.contains("onclick=") && content.contains("Content-Security-Policy"), "safe HTML response");
            ResponseEntity<byte[]> response = SysPrintController.response(output);
            check("private, no-store".equals(response.getHeaders().getFirst("Cache-Control"))
                    && response.getHeaders().getFirst("Content-Disposition").contains("attachment")
                    && response.getHeaders().getFirst("Content-Security-Policy").contains("sandbox"), "private attachment headers");
            harness.events.clear();
            check(harness.service.print("EXPENSE_CLAIM", 9L, "ALTERNATE", null, null).filename().endsWith(".html"), "explicit template selected");
            int recordsBefore = harness.saved.size();
            harness.denyObject = true; harness.events.clear();
            expect(403, () -> harness.service.print("EXPENSE_CLAIM", 9L, null, "HTML", null), "object permission rejection");
            check(harness.events.equals(List.of("authorize")) && harness.saved.size() == recordsBefore, "denied object never renders or records success");
            harness.denyObject = false; harness.wrongTenant = true;
            expect(403, () -> harness.service.print("EXPENSE_CLAIM", 9L, null, "HTML", null), "cross-tenant provider response rejected");
            harness.wrongTenant = false; harness.failRecord = true;
            expect(503, () -> harness.service.print("EXPENSE_CLAIM", 9L, null, "HTML", null), "record write failure blocks file delivery");
            harness.failRecord = false;
            expect(400, () -> harness.service.print("EXPENSE_CLAIM", 9L, null, "EXCEL", null), "incompatible output rejected");
            harness.rows.clear();
            expect(404, () -> harness.service.print("EXPENSE_CLAIM", 9L, null, "HTML", null), "missing default rejected");
            harness.rows.add(template(1L, "DEFAULT", 1)); harness.rows.add(template(2L, "SECOND_DEFAULT", 1));
            expect(409, () -> harness.service.print("EXPENSE_CLAIM", 9L, null, "HTML", null), "ambiguous default rejected");
            harness.rows.clear(); harness.rows.add(template(3L, "FOREIGN", 1)); harness.rows.get(0).setTenantId(200000L);
            expect(404, () -> harness.service.print("EXPENSE_CLAIM", 9L, null, "HTML", null), "template tenant scope enforced");
            PageResult<SysPrintRecord> page = harness.records.list("EXPENSE_CLAIM", "9", 701L, 0, 500);
            check(page.getPageNum() == 1 && page.getPageSize() == 200 && page.getRows().size() == harness.saved.size(), "record filters and bounded pagination");
            SysPrintRecord forged = new SysPrintRecord(); forged.setTenantId(200000L); forged.setOperatorId(701L);
            expect(403, () -> harness.records.save(forged), "record tenant cannot be forged");
            previewAndOptionChecks(); workflowChecks(); annotationChecks();
            System.out.println("PrintPipelineBasicChecks PASS checks=" + checks);
        } finally { UserContext.clear(); }
    }

    private static void extensionChecks() {
        Harness harness = new Harness("ASSET_LABEL", "asset_label:9");
        check(harness.service.options("asset_label", 9L).size() == 2, "fifth provider obtains its own templates");
        harness.events.clear();
        SysPrintService.PrintOutput output = harness.service.print("asset_label", 9L, null, "HTML", null);
        String content = new String(output.bytes(), StandardCharsets.UTF_8);
        check(content.contains("PUBLIC") && !content.contains("HIDDEN") && !content.contains("ALIAS_SECRET"), "fifth provider uses formal workflow field permissions");
        check(harness.events.equals(List.of("authorize", "template", "filter", "record")), "extension preserves authorization and record ordering");
        check(harness.saved.size() == 1 && "ASSET_LABEL".equals(harness.saved.get(0).getBizType())
                && "9".equals(harness.saved.get(0).getBizId()), "extension records its actual business identity");
        int saved = harness.saved.size();
        harness.claimedBusinessKey = "another_asset:9";
        expect(403, () -> harness.service.print("ASSET_LABEL", 9L, null, "HTML", null), "extension rejects mismatched persisted business key");
        harness.claimedBusinessKey = "asset_label:10";
        expect(403, () -> harness.service.print("ASSET_LABEL", 9L, null, "HTML", null), "extension rejects mismatched record ID in business key");
        harness.claimedBusinessKey = "asset_label:9"; harness.wrongTenant = true;
        expect(403, () -> harness.service.print("ASSET_LABEL", 9L, null, "HTML", null), "extension rejects foreign tenant data");
        harness.wrongTenant = false; harness.denyObject = true; harness.events.clear();
        expect(403, () -> harness.service.print("ASSET_LABEL", 9L, null, "HTML", null), "extension enforces provider object authorization");
        check(harness.events.equals(List.of("authorize")) && harness.saved.size() == saved, "denied extension returns no file or successful record");
        harness.denyObject = false; harness.failRecord = true;
        expect(503, () -> harness.service.print("ASSET_LABEL", 9L, null, "HTML", null), "extension blocks delivery when record write fails");
        workflowChecks();
    }

    private static void previewAndOptionChecks() {
        Harness harness = new Harness();
        SysPrintTemplate disabled = template(3L, "DISABLED", 0); disabled.setStatus("DISABLED");
        SysPrintTemplate foreign = template(4L, "FOREIGN", 0); foreign.setTenantId(200000L);
        SysPrintTemplate deleted = template(5L, "DELETED", 0); deleted.setDeleted(1);
        harness.rows.addAll(List.of(disabled, foreign, deleted));
        List<SysPrintTemplateService.PrintTemplateOption> options = harness.service.options("expense_claim", 9L);
        check(options.stream().map(SysPrintTemplateService.PrintTemplateOption::templateCode).toList().equals(List.of("DEFAULT", "ALTERNATE")), "options return only enabled undeleted current-tenant templates");
        check(options.get(0).defaultFlag() == 1 && options.get(1).defaultFlag() == 0, "options preserve default and alternate metadata");
        check(harness.events.equals(List.of("authorize", "template")) && harness.saved.isEmpty(), "option lookup authorizes object without printing");
        check(java.util.Arrays.stream(SysPrintTemplateService.PrintTemplateOption.class.getRecordComponents()).noneMatch(field -> List.of("templateContent", "templateFileUrl").contains(field.getName())), "business options expose no template body or private file");
        harness.denyObject = true; harness.events.clear();
        expect(403, () -> harness.service.options("EXPENSE_CLAIM", 9L), "option lookup denies inaccessible business object");
        check(harness.events.equals(List.of("authorize")), "denied option request cannot enumerate templates");
        harness.denyObject = false; harness.wrongTenant = true;
        expect(403, () -> harness.service.options("EXPENSE_CLAIM", 9L), "option lookup rejects foreign-tenant business response");
        harness.wrongTenant = false; harness.events.clear();
        SysPrintService.PrintOutput preview = harness.service.preview(1L, Map.of("name", "SAMPLE"), "HTML");
        String content = new String(preview.bytes(), StandardCharsets.UTF_8);
        check(content.contains("SAMPLE") && !content.contains("PUBLIC") && preview.filename().equals("template-preview-1.html"), "saved-template preview uses supplied sample and correct attachment name");
        check(harness.saved.isEmpty() && harness.events.equals(List.of("template")), "preview reads no business data and creates no business print record");
        expect(404, () -> harness.service.preview(4L, Map.of(), "HTML"), "preview enforces template tenant isolation");
        expect(400, () -> harness.service.preview(1L, null, "HTML"), "preview requires sample object");
        expect(400, () -> harness.service.preview(1L, Map.of(), "EXCEL"), "preview rejects incompatible output");
    }

    private static void workflowChecks() {
        Access access = new Access();
        WfProcessInstance instance = new WfProcessInstance(); instance.setTenantId(100000L); instance.setBusinessKey("expense_claim:9");
        WfProcessInstanceMapper mapper = proxy(WfProcessInstanceMapper.class, (Object object, Method method, Object[] args) -> {
            if (method.getName().equals("selectById")) return instance;
            throw new UnsupportedOperationException(method.getName());
        });
        WorkflowPrintService service = new WorkflowPrintService(access, mapper);
        PrintData data = new PrintData(100000L, "EXPENSE_CLAIM", "9", "instance-9", "expense_claim:9", businessValues());
        Map<String, Object> visible = service.filter(data);
        check(visible.keySet().equals(Set.of("name", "items"))
                && visible.get("items").equals(List.of(Map.of("name", "line"))), "real field filter removes hidden root, nested and unknown alias fields");
        instance.setBusinessKey("expense_claim:10");
        expect(403, () -> service.filter(data), "unrelated process cannot lend permissions");
        instance.setBusinessKey("expense_claim:9"); access.denied = true;
        expect(403, () -> service.filter(data), "process access rejection propagated"); access.denied = false;
        expect(403, () -> service.filter(new PrintData(200000L, "EXPENSE_CLAIM", "9", "instance-9", "expense_claim:9", businessValues())), "workflow tenant isolation");
        access.certificate = true; instance.setBusinessKey("HR_CERTIFICATE_REQUEST:9");
        check(!service.filter(new PrintData(100000L, "CERTIFICATE", "9", "instance-9", "HR_CERTIFICATE_REQUEST:9", Map.of("name", "PUBLIC", "body", "HIDDEN body"))).containsKey("body"), "preassembled certificate body cannot bypass field permissions");
        WorkflowPrintFieldFilter remote = new WorkflowPrintFieldFilter(request -> R.fail(403, "denied"));
        expect(403, () -> remote.filter(data), "remote permission rejection fails closed");
        WorkflowPrintFieldFilter noResponse = new WorkflowPrintFieldFilter(request -> null);
        expect(503, () -> noResponse.filter(data), "missing workflow response fails closed");
        check(noResponse.filter(new PrintData(100000L, "SALARY_SLIP", "9", null, null, Map.of("netTotal", 10))).get("netTotal").equals(10), "salary uses authorized business data without unrelated process");
    }

    private static void annotationChecks() throws Exception {
        Transactional transaction = SysPrintRecordService.class.getMethod("save", SysPrintRecord.class).getAnnotation(Transactional.class);
        check(transaction != null && transaction.propagation() == Propagation.REQUIRES_NEW, "record has independent commit boundary");
        check(SysPrintController.class.getMethod("records", String.class, String.class, Long.class, int.class, int.class)
                .getAnnotation(SaCheckPermission.class).value()[0].equals("system:print:record:list"), "record query permission required");
        check(SysPrintController.class.getMethod("templates", String.class, Long.class).isAnnotationPresent(SaCheckLogin.class), "business template lookup requires login");
        check(SysPrintTemplateController.class.getMethod("preview", Long.class, Map.class, String.class)
                .getAnnotation(SaCheckPermission.class).value()[0].equals("system:print:template:list"), "sample preview requires template viewing permission");
        for (Class<?> controller : List.of(HrPrintDataController.class, OaPrintDataController.class, WorkflowPrintController.class)) {
            for (Method method : controller.getDeclaredMethods()) if (java.lang.reflect.Modifier.isPublic(method.getModifiers())) {
                Inner inner = method.getAnnotation(Inner.class);
                check(inner != null && List.of(inner.allowedServices()).contains("cloudflow-auth"), "business data available only to auth: " + method.getName());
            }
        }
    }

    private static final class Access extends WorkflowFormAccessService {
        boolean denied; boolean certificate;
        Access() { super(null, null, null, null, null, null, null, null, null, null, null, null,
                new FormDataPermissionFilter(new ObjectMapper(), new JsonSchemaValidator())); }
        @Override public ReadContext instance(String instanceId, String taskId) {
            if (denied) throw new ServiceException("denied", 403);
            WfFormDefinition form = new WfFormDefinition();
            form.setFieldsJson("[{\"id\":\"name\",\"type\":\"INPUT\"},{\"id\":\"secret\",\"type\":\"INPUT\"},{\"id\":\"body\",\"type\":\"TEXTAREA\"},{\"id\":\"items\",\"type\":\"SUB_TABLE\",\"columns\":[{\"id\":\"name\",\"type\":\"INPUT\"},{\"id\":\"amount\",\"type\":\"AMOUNT\"}]}]");
            return new ReadContext(null, form, instanceId, Set.of("__START__"), true,
                    List.of(new FieldPermissionVO("__START__", "secret", false, false, false),
                            new FieldPermissionVO("__START__", "items.amount", false, false, false)), Map.of(), false);
        }
    }

    private static final class Harness {
        final List<SysPrintTemplate> rows = new ArrayList<>(List.of(template(1L, "DEFAULT", 1), template(2L, "ALTERNATE", 0)));
        final List<SysPrintRecord> saved = new ArrayList<>();
        final List<String> events = new ArrayList<>();
        boolean denyObject; boolean wrongTenant; boolean failRecord;
        String claimedBusinessKey;
        final SysPrintRecordService records; final SysPrintService service;
        Harness() { this("EXPENSE_CLAIM", "expense_claim:9"); }
        Harness(String suppliedType, String persistedBusinessKey) {
            claimedBusinessKey = persistedBusinessKey;
            rows.forEach(row -> row.setBizType(suppliedType));
            SysPrintTemplateMapper mapper = proxy(SysPrintTemplateMapper.class, (Object object, Method method, Object[] args) -> {
                if (method.getName().equals("selectOne")) {
                    events.add("template");
                    AbstractWrapper<?, ?, ?> query = (AbstractWrapper<?, ?, ?>) args[0];
                    return rows.stream().filter(row -> Objects.equals(row.getTenantId(), eq(query, "tenant_id"))
                            && Objects.equals(row.getDeleted(), eq(query, "deleted")) && Objects.equals(row.getTemplateId(), eq(query, "template_id"))).findFirst().orElse(null);
                }
                if (!method.getName().equals("selectList")) throw new UnsupportedOperationException(method.getName());
                events.add("template");
                AbstractWrapper<?, ?, ?> query = (AbstractWrapper<?, ?, ?>) args[0];
                Object code = optional(query, "template_code");
                return rows.stream().filter(row -> Objects.equals(row.getTenantId(), eq(query, "tenant_id"))
                        && Objects.equals(row.getBizType(), eq(query, "biz_type")) && Objects.equals(row.getStatus(), eq(query, "status"))
                        && Objects.equals(row.getDeleted(), eq(query, "deleted"))
                        && (code == null || code.equals(row.getTemplateCode()))
                        && (optional(query, "default_flag") == null || Objects.equals(row.getDefaultFlag(), optional(query, "default_flag")))).toList();
            });
            SysPrintTemplateService templates = new SysPrintTemplateService(mapper, null, null, null, new ObjectMapper());
            SysPrintRecordMapper recordMapper = proxy(SysPrintRecordMapper.class, (Object object, Method method, Object[] args) -> {
                if (method.getName().equals("insert")) {
                    events.add("record"); if (failRecord) return 0; saved.add((SysPrintRecord) args[0]); return 1;
                }
                if (method.getName().equals("selectPage")) {
                    @SuppressWarnings("unchecked") Page<SysPrintRecord> page = (Page<SysPrintRecord>) args[0];
                    AbstractWrapper<?, ?, ?> query = (AbstractWrapper<?, ?, ?>) args[1];
                    check(Objects.equals(eq(query, "tenant_id"), 100000L) && Objects.equals(eq(query, "biz_type"), "EXPENSE_CLAIM")
                            && Objects.equals(eq(query, "biz_id"), "9") && Objects.equals(eq(query, "operator_id"), 701L), "record query has tenant and explicit filters");
                    page.setRecords(saved); page.setTotal(saved.size()); return page;
                }
                throw new UnsupportedOperationException(method.getName());
            });
            records = new SysPrintRecordService(recordMapper);
            PrintDataProvider provider = new PrintDataProvider() {
                @Override public String bizType() { return suppliedType; }
                @Override public PrintData buildData(Long id, PrintContext context) {
                    events.add("authorize"); if (denyObject) throw new ServiceException("denied", 403);
                    return new PrintData(wrongTenant ? 200000L : context.tenantId(), bizType(), id.toString(), "instance-9", claimedBusinessKey, businessValues());
                }
            };
            Access access = new Access();
            WfProcessInstanceMapper instances = proxy(WfProcessInstanceMapper.class, (Object object, Method method, Object[] args) -> {
                WfProcessInstance instance = new WfProcessInstance(); instance.setTenantId(100000L); instance.setBusinessKey(persistedBusinessKey); return instance;
            });
            WorkflowPrintService workflow = new WorkflowPrintService(access, instances);
            PrintFieldFilter fields = data -> { events.add("filter"); return workflow.filter(data); };
            PrintTemplateRenderer html = new PrintTemplateRenderer(); PrintPdfRenderer pdf = new PrintPdfRenderer();
            service = new SysPrintService(List.of(provider), templates, records, fields, html, pdf, new PrintExcelRenderer(html), new PrintExcelPdfRenderer(pdf));
        }
    }

    private static SysPrintTemplate template(Long id, String code, int defaultFlag) {
        SysPrintTemplate template = new SysPrintTemplate(); template.setTemplateId(id); template.setTenantId(100000L);
        template.setBizType("EXPENSE_CLAIM"); template.setTemplateCode(code); template.setDefaultFlag(defaultFlag);
        template.setStatus("ENABLED"); template.setDeleted(0); template.setTemplateFormat("HTML"); template.setOutputFormat("HTML");
        template.setTemplateContent("<p onclick='alert(1)'>{{name}}/{{secret}}/{{alias}}</p><script>alert(1)</script>"); return template;
    }
    private static Map<String, Object> businessValues() {
        return Map.of("name", "PUBLIC", "secret", "HIDDEN", "alias", "ALIAS_SECRET", "items", List.of(Map.of("name", "line", "amount", 99, "privateAlias", "HIDDEN")));
    }
    @FunctionalInterface private interface Invocation { Object invoke(Object object, Method method, Object[] args) throws Throwable; }
    private static <T> T proxy(Class<T> type, Invocation invocation) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, invocation::invoke));
    }
    private static Object optional(AbstractWrapper<?, ?, ?> query, String column) {
        Matcher match = Pattern.compile("(?<![a-z_])" + Pattern.quote(column) + " = #\\{ew.paramNameValuePairs\\.(MPGENVAL[0-9]+)\\}").matcher(query.getSqlSegment());
        return match.find() ? query.getParamNameValuePairs().get(match.group(1)) : null;
    }
    private static Object eq(AbstractWrapper<?, ?, ?> query, String column) {
        Object value = optional(query, column); if (value == null) throw new AssertionError("missing condition: " + column); return value;
    }
    private static void expect(int code, Runnable operation, String label) {
        try { operation.run(); throw new AssertionError(label + " was accepted"); }
        catch (ServiceException rejected) { check(rejected.getCode() == code, label); }
    }
    private static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
}
