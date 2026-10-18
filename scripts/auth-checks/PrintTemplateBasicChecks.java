package com.cloudflow.auth.checks;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.auth.config.properties.FileStorageProperties;
import com.cloudflow.auth.controller.SysPrintTemplateController;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.SysPrintTemplate;
import com.cloudflow.auth.domain.dto.PrintTemplateDTO;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.mapper.SysPrintTemplateMapper;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.auth.service.SysFileConfigService;
import com.cloudflow.auth.service.SysPrintTemplateService;
import com.cloudflow.auth.service.impl.SysFileServiceImpl;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.auth.storage.FileStorageService;
import com.cloudflow.auth.storage.model.StoredFileInfo;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.common.tenant.quota.TenantQuotaService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.beans.BeanUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

/** 正式服务 + 受控持久化/存储；不替代真实数据库、HTTP 或页面验收。 */
public final class PrintTemplateBasicChecks {
    private static int checks;

    public static void main(String[] args) throws Exception {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), SysPrintTemplate.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), SysFile.class);
        UserContext.setUserId(701L); UserContext.setUserName("print-basic-admin"); UserContext.setTenantId(100000L);
        try {
            Harness harness = new Harness();
            SysPrintTemplate created = harness.service.save(dto("FIRST"), null, true);
            check(created.getVersion() == 0 && created.getTenantId() == 100000L
                    && "print-basic-admin".equals(created.getCreateBy()) && BigDecimal.TEN.equals(created.getMarginTop()), "create with server-owned metadata");
            PrintTemplateDTO edit = edit(created); edit.setTemplateName("Updated");
            SysPrintTemplate changed = harness.service.save(edit, null, false);
            check(changed.getVersion() == 1 && "Updated".equals(harness.service.detail(created.getTemplateId()).getTemplateName()), "edit increments version");
            expect(409, () -> harness.service.save(edit, null, false), "stale edit rejected");
            PrintTemplateDTO firstDefault = edit(changed); firstDefault.setDefaultFlag(1);
            SysPrintTemplate originalDefault = harness.service.save(firstDefault, null, false);
            PrintTemplateDTO second = dto("SECOND"); second.setDefaultFlag(1);
            SysPrintTemplate replacementDefault = harness.service.save(second, null, true);
            SysPrintTemplate formerDefault = harness.service.detail(created.getTemplateId());
            check(formerDefault.getDefaultFlag() == 0 && formerDefault.getVersion() == originalDefault.getVersion() + 1
                    && replacementDefault.getDefaultFlag() == 1, "default switch invalidates prior version");
            expect(409, () -> harness.service.save(dto("FIRST"), null, true), "duplicate code rejected");
            PrintTemplateDTO invalid = dto("BAD_OUTPUT"); invalid.setOutputFormat("EXCEL");
            expect(400, () -> harness.service.save(invalid, null, true), "HTML output combination checked");
            PrintTemplateDTO margins = dto("BAD_MARGIN"); margins.setMarginLeft(new BigDecimal("210"));
            expect(400, () -> harness.service.save(margins, null, true), "printable paper area required");
            PrintTemplateDTO json = dto("BAD_JSON"); json.setVariablesDeclare("true");
            expect(400, () -> harness.service.save(json, null, true), "variable declaration shape checked");
            PrintTemplateDTO disabled = dto("BAD_DEFAULT"); disabled.setDefaultFlag(1); disabled.setStatus("DISABLED");
            expect(400, () -> harness.service.save(disabled, null, true), "disabled default rejected");
            UserContext.setTenantId(200000L);
            expect(404, () -> harness.service.detail(created.getTemplateId()), "cross-tenant detail rejected");
            expect(404, () -> harness.service.remove(created.getTemplateId(), formerDefault.getVersion()), "cross-tenant removal rejected");
            UserContext.setTenantId(100000L);
            PrintTemplateDTO excel = dto("WORKBOOK"); excel.setTemplateFormat("EXCEL"); excel.setOutputFormat("EXCEL");
            SysPrintTemplate workbook = harness.service.save(excel, upload("template.xls"), true);
            check("sys_file:100".equals(workbook.getTemplateFileUrl()) && harness.bound == 1, "Excel uploaded and privately bound");
            SysPrintTemplate retained = harness.service.save(edit(workbook), null, false);
            check(harness.released.isEmpty(), "unchanged Excel attachment retained");
            SysPrintTemplate replaced = harness.service.save(edit(retained), upload("replacement.xlsx"), false);
            check(harness.released.equals(List.of(100L)) && "sys_file:101".equals(replaced.getTemplateFileUrl()), "replacement releases prior attachment");
            PrintTemplateDTO html = edit(replaced); html.setTemplateFormat("HTML"); html.setOutputFormat("PDF"); html.setTemplateContent("<p>{{name}}</p>");
            SysPrintTemplate converted = harness.service.save(html, null, false);
            check(converted.getTemplateFileUrl() == null && harness.released.equals(List.of(100L, 101L)), "format change releases attachment");
            PrintTemplateDTO injected = edit(retained); injected.setVersion(converted.getVersion()); injected.setTemplateFileUrl("https://example.invalid/template.xlsx");
            expect(400, () -> harness.service.save(injected, null, false), "external file reference rejected");
            PrintTemplateDTO other = dto("DELETE_EXCEL"); other.setTemplateFormat("EXCEL"); other.setOutputFormat("EXCEL");
            SysPrintTemplate deleting = harness.service.save(other, upload("delete.xlsx"), true);
            expect(409, () -> harness.service.remove(deleting.getTemplateId(), 999), "stale removal rejected");
            harness.service.remove(deleting.getTemplateId(), deleting.getVersion());
            check(harness.released.equals(List.of(100L, 101L, 102L)), "template removal releases private attachment");
            expect(404, () -> harness.service.detail(deleting.getTemplateId()), "removed template hidden");
            expect(409, () -> harness.service.save(other, upload("duplicate.xlsx"), true), "deleted template code remains reserved");
            UserContext.clear();
            expect(403, () -> harness.service.detail(created.getTemplateId()), "missing identity rejected");
            UserContext.setUserId(701L); UserContext.setUserName("print-basic-admin"); UserContext.setTenantId(100000L);
            for (Method method : SysPrintTemplateController.class.getDeclaredMethods()) {
                SaCheckPermission permission = method.getAnnotation(SaCheckPermission.class);
                String required = List.of("add", "edit", "remove").contains(method.getName()) ? "system:print:template:edit" : "system:print:template:list";
                check(permission != null && List.of(permission.value()).contains(required), "controller permission: " + method.getName());
            }
            check(SysPrintTemplateService.class.getMethod("save", PrintTemplateDTO.class, MultipartFile.class, boolean.class).getAnnotation(Audit.class).highRisk()
                    && SysPrintTemplateService.class.getMethod("remove", Long.class, Integer.class).getAnnotation(Audit.class).highRisk()
                    && SysFileServiceImpl.class.getMethod("removePrintTemplateFile", Long.class, Long.class).getAnnotation(Audit.class).highRisk(), "mutations retain high-risk audit annotations");
            attachmentLifecycle();
        } finally { UserContext.clear(); }
        System.out.println("PRINT_TEMPLATE_BASIC_CHECKS: passed=" + checks + "; scope=production-services-with-controlled-mappers-and-storage; database=false; http=false; browser=false");
    }

    private static void attachmentLifecycle() {
        List<String> removedPaths = new ArrayList<>();
        int[] references = {0}; int[] deleted = {0}; int[] quota = {0};
        SysFile file = new SysFile(); file.setFileId(901L); file.setTenantId(100000L); file.setBizType("PRINT_TEMPLATE");
        file.setBizId("90"); file.setAccessType("PRIVATE"); file.setDeleted(0); file.setStorageType("LOCAL"); file.setFilePath("/controlled/template.xlsx");
        SysFileMapper mapper = (SysFileMapper) Proxy.newProxyInstance(SysFileMapper.class.getClassLoader(), new Class<?>[]{SysFileMapper.class},
                (Object proxy, Method method, Object[] values) -> {
                    switch (method.getName()) {
                        case "selectOne": {
                            AbstractWrapper<?, ?, ?> wrapper = (AbstractWrapper<?, ?, ?>) values[0];
                            return Objects.equals(eq(wrapper, "file_id"), file.getFileId()) && Objects.equals(eq(wrapper, "tenant_id"), file.getTenantId())
                                    && Objects.equals(eq(wrapper, "biz_id"), file.getBizId()) && Objects.equals(eq(wrapper, "biz_type"), file.getBizType())
                                    && Objects.equals(eq(wrapper, "access_type"), file.getAccessType()) && Objects.equals(eq(wrapper, "deleted"), 0) ? file : null;
                        }
                        case "deleteById": deleted[0]++; return 1;
                        case "countReferences": return (long) references[0];
                        case "updateReferenceCount": return 1;
                        default: throw new UnsupportedOperationException(method.getName());
                    }
                });
        SysFileConfigService configurations = new SysFileConfigService(null, null, null) {
            @Override public void lockTenant(Long tenantId) { if (!Long.valueOf(100000L).equals(tenantId)) throw new AssertionError("tenant lock"); }
        };
        TenantQuotaService quotas = new TenantQuotaService(null) {
            @Override public void refreshStorage(Long tenantId) { quota[0]++; }
        };
        FileStorageService storage = new FileStorageService() {
            @Override public FileStorageType getStorageType() { return FileStorageType.LOCAL; }
            @Override public StoredFileInfo store(FileUploadUtils.ValidatedFile input) { throw new UnsupportedOperationException(); }
            @Override public void delete(String path) { removedPaths.add(path); }
            @Override public String resolveUrl(String path) { return path; }
            @Override public InputStream open(String path) { return new ByteArrayInputStream(new byte[0]); }
        };
        FileStorageRegistry registry = new FileStorageRegistry(List.of(storage), new FileStorageProperties(), configurations);
        SysFileServiceImpl service = new SysFileServiceImpl(mapper, registry, null, null, configurations, quotas, null);
        expect(403, () -> service.removePrintTemplateFile(91L, 901L), "attachment binding scope enforced");
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.removePrintTemplateFile(90L, 901L);
            check(deleted[0] == 1 && quota[0] == 1 && removedPaths.isEmpty(), "record removed and quota refreshed before physical cleanup");
            List<TransactionSynchronization> callbacks = TransactionSynchronizationManager.getSynchronizations();
            check(callbacks.size() == 1, "physical deletion scheduled after commit");
            for (TransactionSynchronization callback : callbacks) callback.afterCommit();
            check(removedPaths.equals(List.of(file.getFilePath())), "unreferenced content removed after commit");
        } finally { TransactionSynchronizationManager.clearSynchronization(); }
        references[0] = 1; removedPaths.clear();
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.removePrintTemplateFile(90L, 901L);
            check(TransactionSynchronizationManager.getSynchronizations().isEmpty() && removedPaths.isEmpty(), "shared physical content retained");
        } finally { TransactionSynchronizationManager.clearSynchronization(); }
    }

    private static final class Harness {
        private final Map<Long, SysPrintTemplate> rows = new LinkedHashMap<>();
        private final List<Long> released = new ArrayList<>();
        private long nextId = 1;
        private long nextFileId = 100;
        private int bound;
        private final SysPrintTemplateService service;

        private Harness() {
            SysPrintTemplateMapper mapper = (SysPrintTemplateMapper) Proxy.newProxyInstance(SysPrintTemplateMapper.class.getClassLoader(), new Class<?>[]{SysPrintTemplateMapper.class},
                    (Object proxy, Method method, Object[] values) -> {
                        switch (method.getName()) {
                            case "lockTenant": return values[0];
                            case "countCode": return rows.values().stream().filter(row -> Objects.equals(row.getTenantId(), values[0])
                                    && Objects.equals(row.getTemplateCode(), values[1]) && !Objects.equals(row.getTemplateId(), values[2])).count();
                            case "insert": { SysPrintTemplate row = (SysPrintTemplate) values[0]; row.setTemplateId(nextId++); rows.put(row.getTemplateId(), copy(row)); return 1; }
                            case "selectOne": {
                                AbstractWrapper<?, ?, ?> wrapper = (AbstractWrapper<?, ?, ?>) values[0];
                                SysPrintTemplate row = rows.get(eq(wrapper, "template_id"));
                                return row != null && matches(row, wrapper) ? copy(row) : null;
                            }
                            case "update": {
                                AbstractWrapper<?, ?, ?> wrapper = (AbstractWrapper<?, ?, ?>) values[1];
                                SysPrintTemplate row = rows.get(eq(wrapper, "template_id"));
                                if (row == null || !matches(row, wrapper) || !Objects.equals(row.getVersion(), eq(wrapper, "version"))) return 0;
                                if (values[0] instanceof SysPrintTemplate next) rows.put(next.getTemplateId(), copy(next));
                                else { row.setDeleted(1); row.setDefaultFlag(0); row.setVersion(row.getVersion() + 1); }
                                return 1;
                            }
                            case "clearOtherDefaults": {
                                for (SysPrintTemplate row : rows.values()) if (Objects.equals(row.getTenantId(), values[0]) && Objects.equals(row.getBizType(), values[1])
                                        && !Objects.equals(row.getTemplateId(), values[2]) && row.getDeleted() == 0 && row.getDefaultFlag() == 1) {
                                    row.setDefaultFlag(0); row.setVersion(row.getVersion() + 1);
                                }
                                return 1;
                            }
                            default: throw new UnsupportedOperationException(method.getName());
                        }
                    });
            SysFileMapper files = (SysFileMapper) Proxy.newProxyInstance(SysFileMapper.class.getClassLoader(), new Class<?>[]{SysFileMapper.class},
                    (Object proxy, Method method, Object[] values) -> {
                        if ("update".equals(method.getName())) {
                            LambdaUpdateWrapper<?> wrapper = (LambdaUpdateWrapper<?>) values[1];
                            if (!Objects.equals(eq(wrapper, "tenant_id"), 100000L) || !wrapper.getSqlSet().contains("access_type=")) throw new AssertionError("private binding");
                            bound++; return 1;
                        }
                        if ("selectOne".equals(method.getName())) {
                            AbstractWrapper<?, ?, ?> wrapper = (AbstractWrapper<?, ?, ?>) values[0];
                            if (!Objects.equals(eq(wrapper, "tenant_id"), 100000L) || !Objects.equals(eq(wrapper, "biz_type"), "PRINT_TEMPLATE")
                                    || !Objects.equals(eq(wrapper, "access_type"), "PRIVATE") || eq(wrapper, "biz_id") == null) throw new AssertionError("file read scope");
                            return new SysFile();
                        }
                        throw new UnsupportedOperationException(method.getName());
                    });
            ISysFileService fileService = (ISysFileService) Proxy.newProxyInstance(ISysFileService.class.getClassLoader(), new Class<?>[]{ISysFileService.class},
                    (Object proxy, Method method, Object[] values) -> {
                        if ("uploadFile".equals(method.getName())) {
                            SysFile file = new SysFile(); file.setFileId(nextFileId++); file.setTenantId(100000L); file.setDeleted(0); return file;
                        }
                        if ("removePrintTemplateFile".equals(method.getName())) { released.add((Long) values[1]); return null; }
                        throw new UnsupportedOperationException(method.getName());
                    });
            service = new SysPrintTemplateService(mapper, files, fileService, null, new ObjectMapper());
        }
    }

    private static Object eq(AbstractWrapper<?, ?, ?> wrapper, String column) {
        String sql = wrapper.getSqlSegment();
        Matcher match = Pattern.compile("(?<![a-z_])" + Pattern.quote(column) + " = #\\{ew.paramNameValuePairs\\.(MPGENVAL[0-9]+)\\}").matcher(sql);
        if (!match.find()) throw new AssertionError("missing scoped condition: " + column + " in " + sql);
        return wrapper.getParamNameValuePairs().get(match.group(1));
    }
    private static boolean matches(SysPrintTemplate row, AbstractWrapper<?, ?, ?> wrapper) {
        return Objects.equals(row.getTenantId(), eq(wrapper, "tenant_id")) && Objects.equals(row.getDeleted(), eq(wrapper, "deleted"));
    }
    private static SysPrintTemplate copy(SysPrintTemplate source) { SysPrintTemplate result = new SysPrintTemplate(); BeanUtils.copyProperties(source, result); return result; }
    private static PrintTemplateDTO edit(SysPrintTemplate source) { PrintTemplateDTO result = new PrintTemplateDTO(); BeanUtils.copyProperties(source, result); return result; }
    private static PrintTemplateDTO dto(String code) {
        PrintTemplateDTO result = new PrintTemplateDTO(); result.setTemplateCode(code); result.setTemplateName(code); result.setBizType("SALARY_SLIP");
        result.setTemplateFormat("HTML"); result.setOutputFormat("PDF"); result.setTemplateContent("<p>{{name}}</p>"); result.setVariablesDeclare("[]"); return result;
    }
    private static MultipartFile upload(String name) {
        return (MultipartFile) Proxy.newProxyInstance(MultipartFile.class.getClassLoader(), new Class<?>[]{MultipartFile.class},
                (Object proxy, Method method, Object[] values) -> switch (method.getName()) {
                    case "isEmpty" -> false;
                    case "getOriginalFilename" -> name;
                    default -> throw new UnsupportedOperationException(method.getName());
                });
    }
    private static void expect(int code, Runnable operation, String label) {
        try { operation.run(); } catch (ServiceException failure) { check(Objects.equals(failure.getCode(), code), label + ": " + failure.getMessage()); return; }
        throw new AssertionError(label + ": expected rejection");
    }
    private static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
}
