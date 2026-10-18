# 批次 G 技术设计（体验与集成）

| 项 | 内容 |
| --- | --- |
| 覆盖 | G1（移动端）· G2（Excel 导入）· G3（文件存储+可观测）· G5（打印模板）· G4 已延后 |
| 表改动 | **新增 8 张**，改 3 张 |
| 版本 | v1 · 2026-08-31 |

## 0. 设计前补查的两个未查项（又修正两处）

### 0.1 🔴 SYS-04 的越权面**定位有误但问题更实**

**G3 的 PRD 写**：
> "`sys_file.url` 字段若为直链，任何拿到 URL 的人都能访问文件"

**实测的真实访问链路**：
```
GET /system/file/access?path=xxx
  @SaCheckPermission("system:file:list")          ← 只需这一个权限
    ↓
SysFileServiceImpl.accessFile(reference, response)
    ↓
requireAccessibleFile(reference)
    ├─ 校验 tenant_id = 当前租户        ✅ 租户隔离有
    ├─ 校验 deleted = 0                 ✅
    └─ 无任何业务级权限校验            ❌ ← 真实问题在此
    ↓
LOCAL → writeLocalFile（服务端流式输出）
其他   → redirectToRemoteFile（重定向到对象存储）
```

**精确结论**：
| 判断 | 实际 |
| --- | --- |
| "url 是直链" | ❌ **错** —— 有服务端访问端点，`buildAccessUrl()` 生成的是 `/system/file/access?path=` 形式 |
| 租户隔离 | ✅ 有 |
| **业务级权限** | ❌ **无** —— 有 `system:file:list` 权限的用户可访问**本租户任意文件** |

**这意味着**：员工只要有文件列表权限，就能访问他人的工资条 PDF、合同扫描件、身份证、供应商资质、履约证据。**问题比 PRD 描述的更具体也更实**。

**修正后的 SYS-04 核心价值**：不是"把直链改签名 URL"，而是**"给文件访问加业务级权限校验"**（`FileAccessChecker` 按 `biz_type` 分派）。签名 URL 是次要收益（用于对象存储场景避免服务端中转流量）。

另：`redirectToRemoteFile` 说明非 LOCAL 存储是**重定向到对象存储 URL** —— 若该 URL 是公开可读的，则确实存在直链泄露。需确认 OSS bucket 的读权限配置。

### 0.2 🟡 前端公共组件的响应式覆盖率很低

实测 `components/common/` 下 **65 个组件，仅 9 个含响应式断点**（约 14%）。

**修正 G1 的判断**：摸排报告说"响应式已用 779 处"，但那些**集中在页面层**（`src/pages`），公共组件层基本没有响应式。

**影响**：G1 的 FR-4（现有公共组件响应式增强）**工作量比预估高** —— 65 个组件里 56 个需要评估是否要加断点。但好消息是：多数组件（如 `Toast`、`Tooltip`、`LoadingSpinner`）本身不需要响应式，真正需要改的是布局类（`table`、`dialog`、各 Selector、`DateRangePicker`、`tabs`）—— 约 12 个。

### 0.3 ✅ OSS 默认公共读 —— 已查明并定为强制私有

**查明的事实**：
```java
// OssProperties 基类
/** 0=private（私有），1=public（公共读），2=custom（自定义） */
private String accessPolicy = "1";        // ← 默认公共读

// AuthOssProperties
private Boolean enabled = false;           // ← 默认不启用
```
全仓 `config/*.yaml` 与 `application.yml` **无任何 OSS 配置**，即 `enabled=false`，**当前只用 LOCAL 存储**。

**结论**：
| 时点 | 风险 |
| --- | --- |
| 当前 | ✅ **无直链泄露** —— OSS 未启用，文件走 `writeLocalFile` 服务端流式输出 |
| 一旦启用 OSS 且不改默认值 | ❌ `accessPolicy="1"` 公共读 → 合同、工资条、身份证扫描件**公网可直接访问** |

**已定决策（2026-08-31）：强制私有，配错就启动失败**

```java
@Component
public class OssAccessPolicyValidator {

    @EventListener(ApplicationReadyEvent.class)
    public void validateOnStartup() {
        // 遍历所有已启用的对象存储配置（含 properties 与 sys_file_config 两个来源）
        for (StorageConfig cfg : storageRegistry.listEnabledRemoteConfigs()) {
            if (!"0".equals(cfg.getAccessPolicy())) {
                throw new IllegalStateException(String.format(
                    "对象存储配置 [%s] 的 accessPolicy=%s（非私有）。" +
                    "系统存储合同、工资条、身份证等敏感文件，必须配置为 0（私有）+ 签名访问。" +
                    "请修改配置后重启。", cfg.getConfigCode(), cfg.getAccessPolicy()));
            }
        }
    }
}
```

**同时改默认值**：`OssProperties.accessPolicy` 默认 `"1"` → `"0"`

**为何选强制而非告警**：默认值现在是公共读，一旦有人启用 OSS 而没注意这个值，敏感文件立刻公网可达。启动失败会立即暴露配置错误，而 WARN 日志大概率被忽略。**代价是启用 OSS 时必须显式配对，这个摩擦是值得的。**

**`sys_file_config` 表同步约束**：新增配置时校验 `storage_type != 'LOCAL'` 且 `access_policy != '0'` 则保存失败（不只在启动时拦）。

---

## 1. G3 文件存储与可观测（3 新表 + 3 改表）

### 1.1 `sys_file_config`

```sql
-- 45. 文件存储配置表
DROP TABLE IF EXISTS sys_file_config;
CREATE TABLE sys_file_config (
  config_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID（0为平台级）',
  config_code       VARCHAR(50)     NOT NULL COMMENT '配置编码',
  config_name       VARCHAR(100)    NOT NULL COMMENT '配置名称',
  storage_type      VARCHAR(20)     NOT NULL COMMENT 'LOCAL/MINIO/S3/OSS/COS',
  master_flag       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否主用',
  endpoint          VARCHAR(300)    DEFAULT NULL COMMENT '端点',
  region            VARCHAR(50)     DEFAULT NULL COMMENT '区域',
  bucket            VARCHAR(100)    DEFAULT NULL COMMENT '桶名',
  access_key        VARCHAR(200)    DEFAULT NULL COMMENT 'AccessKey',
  secret_key_cipher VARCHAR(500)    DEFAULT NULL COMMENT 'SecretKey（加密存储）',
  base_path         VARCHAR(300)    DEFAULT NULL COMMENT '基础路径',
  domain            VARCHAR(300)    DEFAULT NULL COMMENT '访问域名',
  max_file_size     BIGINT(20)      DEFAULT 52428800 COMMENT '单文件上限（字节，默认50MB）',
  allowed_extensions VARCHAR(1000)  DEFAULT NULL COMMENT '允许扩展名（逗号分隔，空=用系统默认白名单）',
  signed_url_expire_seconds INT     NOT NULL DEFAULT 300 COMMENT '签名URL有效期（秒）',
  access_policy     VARCHAR(10)     NOT NULL DEFAULT '0' COMMENT '0=私有 1=公共读 2=自定义（非LOCAL时强制为0，见§0.3）',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ENABLED' COMMENT 'ENABLED/DISABLED',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version           INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (config_id),
  UNIQUE KEY uk_sfc_code (tenant_id, config_code),
  KEY idx_sfc_master (tenant_id, master_flag, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='文件存储配置表';
```

### 1.2 `sys_file` 增 7 列

```sql
  config_id         BIGINT(20)      DEFAULT NULL COMMENT '所用存储配置ID',
  file_hash         VARCHAR(64)     DEFAULT NULL COMMENT 'SHA256（去重用）',
  bucket            VARCHAR(100)    DEFAULT NULL COMMENT '桶名',
  object_key        VARCHAR(500)    DEFAULT NULL COMMENT '对象键',
  access_type       VARCHAR(20)     NOT NULL DEFAULT 'PRIVATE' COMMENT 'PRIVATE/PUBLIC',
  biz_type          VARCHAR(50)     DEFAULT NULL COMMENT '业务类型（权限校验分派用）',
  biz_id            VARCHAR(64)     DEFAULT NULL COMMENT '业务ID',
  ref_count         INT             NOT NULL DEFAULT 1 COMMENT '引用计数（去重后多处引用）',
```

索引：`KEY idx_sf_hash (tenant_id, file_hash)`、`KEY idx_sf_biz (biz_type, biz_id)`

### 1.3 ⚠️ 业务级权限校验（本批最重要的安全改造）

**按 §0.1 的精确定位，核心是加 `FileAccessChecker`**：

```java
public interface FileAccessChecker {
    /** 支持的业务类型 */
    String bizType();
    /** 当前用户能否访问该文件 */
    boolean canAccess(SysFile file, Long userId);
}

@Service
public class FileAccessGuard {
    private final Map<String, FileAccessChecker> checkers;   // Spring 注入全部实现

    public void assertCanAccess(SysFile file, Long userId) {
        // PUBLIC 类文件直接放行（头像、公开公告附件）
        if ("PUBLIC".equals(file.getAccessType())) return;

        String bizType = file.getBizType();
        if (!StringUtils.hasText(bizType)) {
            // ★ 无 biz_type 的历史文件：默认只允许上传者本人访问
            if (!Objects.equals(file.getCreateBy(), currentUserName())) {
                throw new PermissionDeniedException("无权访问该文件");
            }
            return;
        }
        FileAccessChecker checker = checkers.get(bizType);
        if (checker == null) {
            // ★ 未注册校验器 → 默认拒绝（安全默认，G3 的 FR-3.5）
            log.warn("文件类型未注册权限校验器，默认拒绝: bizType={}, fileId={}", bizType, file.getFileId());
            throw new PermissionDeniedException("该类型文件暂不支持访问");
        }
        if (!checker.canAccess(file, userId)) {
            auditLog.record("FILE_ACCESS_DENIED", file.getFileId(), userId);
            throw new PermissionDeniedException("无权访问该文件");
        }
    }
}
```

**必须注册的校验器清单**（M3 阶段，这是本批最大工作量）：

| # | bizType | 校验规则 | 来源 |
| --- | --- | --- | --- |
| 1 | `SALARY_SLIP` | 仅本人 或 有 `hr:salary:manage` 权限 | D3 |
| 2 | `HR_CONTRACT` | 仅本人 或 HR 角色 | HR |
| 3 | `HR_DOCUMENT` | 仅本人 或 HR 角色（身份证等） | HR |
| 4 | `GRIEVANCE` | 申诉人 或 HR 或 指定处理人 | D4 |
| 5 | `ATTENDANCE_PHOTO` | 仅本人 或 HR | D2 |
| 6 | `OA_CONTRACT` | 合同负责人 / 同部门 / 有 `oa:contract:list` | F4 |
| 7 | `CONTRACT_FULFILMENT` | 同上 | F4 |
| 8 | `SUPPLIER_QUALIFICATION` | 有 `oa:supplier:list` | F2 |
| 9 | `RFQ_QUOTATION` | 采购负责人 或 审批人（**报价保密**） | F5 |
| 10 | `ASSET` | 有 `oa:asset:list` | F1 |
| 11 | `KNOWLEDGE` | 按知识库可见范围 | OA |
| 12 | `EXPENSE_CLAIM` | 申请人 / 审批人 / 财务 | OA |
| 13 | `RESUME` | 有 `hr:candidate:list` | HR |
| 14 | `IMPORT_FILE` | 仅导入操作人 | G2 |
| 15 | `AVATAR` | PUBLIC，放行 | 通用 |
| 16 | `ANNOUNCEMENT` | PUBLIC 或按公告范围 | OA |
| 17 | `WORKFLOW_FORM` | 按流程实例可见性 + **C3 字段权限** | B/C |

**上线前必须完成清单梳理**，否则未注册的 bizType 会全部拒绝导致功能不可用（这是"安全默认拒绝"的必然代价）。

### 1.4 签名 URL（次要收益）

```java
public String buildAccessUrl(SysFile file, Long userId) {
    fileAccessGuard.assertCanAccess(file, userId);       // ★ 先校验

    if ("PUBLIC".equals(file.getAccessType())) {
        return file.getDomain() + "/" + file.getObjectKey();   // 公开直链
    }
    SysFileConfig cfg = configService.getById(file.getConfigId());
    return switch (cfg.getStorageType()) {
        // 对象存储：用原生签名（避免服务端中转流量）
        case "OSS", "S3", "MINIO", "COS" ->
                storageAdapter(cfg).presignedGetUrl(file, cfg.getSignedUrlExpireSeconds());
        // 本地：短期 token 存 Redis
        case "LOCAL" -> {
            String token = RandomUtil.randomString(32);
            redisCache.set("file:token:" + token, file.getFileId(), cfg.getSignedUrlExpireSeconds());
            yield "/system/file/download?token=" + token;
        }
        default -> throw new IllegalStateException();
    };
}
```

**签名 URL 不入日志**（G3 的 NFR）：`sys_log` 的 `request_url` 需对 `token=` 与 `Signature=` 参数做脱敏。

### 1.5 `sys_api_error_log` + trace_id

```sql
-- 46. API 错误日志表
DROP TABLE IF EXISTS sys_api_error_log;
CREATE TABLE sys_api_error_log (
  error_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  trace_id          VARCHAR(64)     DEFAULT NULL COMMENT '链路追踪ID',
  service_name      VARCHAR(50)     DEFAULT NULL COMMENT '服务名',
  user_id           BIGINT(20)      DEFAULT NULL COMMENT '用户ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '用户名',
  request_method    VARCHAR(10)     DEFAULT NULL COMMENT '请求方法',
  request_url       VARCHAR(500)    DEFAULT NULL COMMENT '请求URL',
  request_params    TEXT            DEFAULT NULL COMMENT '请求参数（已脱敏）',
  exception_class   VARCHAR(200)    DEFAULT NULL COMMENT '异常类',
  exception_message VARCHAR(2000)   DEFAULT NULL COMMENT '异常消息',
  exception_stack   TEXT            DEFAULT NULL COMMENT '异常栈',
  client_ip         VARCHAR(64)     DEFAULT NULL COMMENT '客户端IP',
  user_agent        VARCHAR(500)    DEFAULT NULL COMMENT 'UserAgent',
  occur_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
  process_status    VARCHAR(20)     NOT NULL DEFAULT 'TODO' COMMENT 'TODO/PROCESSING/DONE/IGNORED',
  process_by        VARCHAR(64)     DEFAULT NULL COMMENT '处理人',
  process_time      DATETIME        DEFAULT NULL COMMENT '处理时间',
  process_remark    VARCHAR(500)    DEFAULT NULL COMMENT '处理说明',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (error_id),
  KEY idx_sael_trace (trace_id),
  KEY idx_sael_time (occur_time),
  KEY idx_sael_status (process_status, occur_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='API错误日志表';
```

`sys_log` 增 8 列：`trace_id` / `service_name` / `request_method` / `request_url` / `duration_ms` / `result_code` / `user_agent` / `client_ip` / `slow_flag`
`oa_frontend_error_log` 增 `trace_id`

**trace_id 透传的四个环节**：
```java
// ① 网关生成
String traceId = request.getHeaders().getFirst("X-Trace-Id");
if (!StringUtils.hasText(traceId)) traceId = IdUtil.fastSimpleUUID();
exchange.getRequest().mutate().header("X-Trace-Id", traceId);
response.getHeaders().add("X-Trace-Id", traceId);          // 返回给前端

// ② 各服务拦截器放 MDC
MDC.put("traceId", request.getHeader("X-Trace-Id"));
try { chain.doFilter(...); } finally { MDC.remove("traceId"); }   // ★ 必须清理

// ③ Feign 透传
@Component
public class TraceIdFeignInterceptor implements RequestInterceptor {
    public void apply(RequestTemplate t) { t.header("X-Trace-Id", MDC.get("traceId")); }
}

// ④ 异步线程池装饰器（AC-18：防串号）
@Bean
public TaskDecorator mdcTaskDecorator() {
    return runnable -> {
        Map<String,String> ctx = MDC.getCopyOfContextMap();
        return () -> {
            try { if (ctx != null) MDC.setContextMap(ctx); runnable.run(); }
            finally { MDC.clear(); }
        };
    };
}
```

**参数脱敏白名单**（AC-21）：`password` / `pwd` / `secret` / `token` / `accessKey` / `secretKey` / `idCard` / `bankAccount` / `phone` / `email` / `code`

---

## 2. G2 Excel 导入框架（2 新表）

```
sys_import_task   biz_type/file_name/file_url/total_rows/valid_rows/invalid_rows/
                  success_rows/fail_rows/status/error_file_url/operator_id/duration_ms/job_log_id
sys_import_error  task_id/row_no/column_name/cell_value/error_type/error_message
```

### 2.1 接入接口（各业务只实现两个）

```java
public interface ImportDefinition<T> {
    String bizType();
    String bizName();
    Class<T> rowClass();
    List<ImportColumn> columns();
    default int maxRows() { return 10000; }
}

public interface ImportHandler<T> {
    String bizType();
    /** BUSINESS 类校验（框架已做必填/格式/范围/重复/引用五类） */
    List<ImportError> validateRow(T row, int rowNo, ImportContext ctx);
    /** 落库（单行一事务，由框架包裹） */
    void importRow(T row, int rowNo, ImportContext ctx);
}
```

### 2.2 六类通用校验（框架实现，业务不重复写）

```java
public class ImportValidatorChain {
    // 1. REQUIRED   必填
    // 2. FORMAT     日期/数字/邮箱/手机/身份证（正则 + 解析双验）
    // 3. RANGE      数值范围、字符长度
    // 4. DUPLICATE  文件内重复（HashSet 累积）+ 库内重复（按唯一键查）
    // 5. REFERENCE  引用存在性 + ★ 按名称匹配 ID
    // 6. BUSINESS   委托给 ImportHandler.validateRow
}

/** 引用按名称匹配（FR-3.3） */
private Long resolveRefByName(ImportColumn col, String name, ImportContext ctx) {
    List<Long> ids = ctx.lookupCache(col.getRefType(), name);   // 预加载缓存，避免逐行查库
    if (ids.isEmpty()) {
        throw new ImportCellException("REFERENCE", col.getName() + " 不存在：" + name);
    }
    if (ids.size() > 1) {
        // 重名（如两个"研发部"）→ 要求用编号
        throw new ImportCellException("REFERENCE", col.getName() + " 存在重名，请改用编号：" + name);
    }
    return ids.get(0);
}
```

`ImportContext` **预加载引用数据**（部门树、字典、职级等）到内存 Map，避免 1 万行逐行查库。

### 2.3 逐行读取防 OOM（AC-12）

```java
// FastExcel 的监听器模式（不全量载入内存）
FastExcel.read(inputStream, definition.rowClass(), new ReadListener<T>() {
    private final List<T> batch = new ArrayList<>(BATCH_SIZE);

    @Override public void invoke(T row, AnalysisContext ctx) {
        batch.add(row);
        if (batch.size() >= BATCH_SIZE) { flush(); }      // 每 200 行处理一次
    }
    @Override public void doAfterAllAnalysed(AnalysisContext ctx) { flush(); }
}).sheet().doRead();
```

### 2.4 错误标注文件（AC-8）

```java
/** 复制原文件，每行末尾追加"错误说明"列并标红 */
public String generateErrorFile(Long taskId) {
    // 仅对 xlsx 生成标注文件（§9-6：xls 与 csv 输出纯文本错误清单）
    try (Workbook wb = WorkbookFactory.create(originalStream)) {
        Sheet sheet = wb.getSheetAt(0);
        int errCol = sheet.getRow(0).getLastCellNum();
        sheet.getRow(0).createCell(errCol).setCellValue("错误说明");

        Map<Integer, List<SysImportError>> byRow = errorMapper.selectByTask(taskId)
                .stream().collect(groupingBy(SysImportError::getRowNo));
        CellStyle redStyle = buildRedStyle(wb);

        byRow.forEach((rowNo, errs) -> {
            Row row = sheet.getRow(rowNo);
            row.createCell(errCol).setCellValue(
                    errs.stream().map(SysImportError::getErrorMessage).collect(joining("；")));
            errs.forEach(e -> markRed(row, e.getColumnName(), redStyle));
        });
        return uploadToFileService(wb, "错误_" + originalName);
    }
}
```

---

## 3. G5 打印模板（2 新表）

```
sys_print_template  template_code/template_name/biz_type/template_format(HTML/EXCEL)/
                    output_format(PDF/EXCEL/HTML)/template_content/template_file_url/
                    paper_size/orientation/margin_*/variables_declare/default_flag/version/status
sys_print_record    template_id/biz_type/biz_id/output_format/file_url/operator_id/print_time/ip_address
```

### 3.1 HTML→PDF 用 OpenHTMLtoPDF（G5 的 §10-2 建议方案 A）

```java
@Service
public class HtmlToPdfRenderer {
    public byte[] render(String html, PrintTemplate tpl) {
        try (ByteArrayOutputStream os = new ByteArrayOutputStream()) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            // ★ 内置中文字体（Docker 容器常缺字体导致乱码，AC-5）
            builder.useFont(() -> getClass().getResourceAsStream("/fonts/NotoSansSC-Regular.ttf"),
                            "Noto Sans SC");
            // ★ 禁外部资源加载（防 SSRF 与信息泄露，AC-14）
            builder.useProtocolsStreamImplementation(new NoOpStreamFactory(), "http", "https", "file");
            builder.withHtmlContent(html, null);
            builder.toStream(os);
            builder.run();
            return os.toByteArray();
        }
    }
}
```

### 3.2 模板渲染安全（AC-13，最高风险）

> ✅ **已实测验证（2026-08-31）：改用 Freemarker 2.3.32 + 3 项加固配置**。
> ⚠️ **原设计的"用 Hutool 不新增依赖"前提不成立** —— 实测 Hutool 的模板引擎**全是适配器**（Beetl/Freemarker/Velocity/Enjoy/Jetbrick/Rythm/Thymeleaf/Wit 八个 Engine 类都需外部引擎 jar），Hutool 无内置引擎，项目当前也无任何模板引擎依赖。**无论如何都要引入一个引擎。**
> ⚠️ **原设计的 `assertNoDangerousSyntax()` 黑名单已删除** —— 黑名单可被大小写、Unicode 转义、字符串拼接绕过；加固配置从引擎层面阻断更可靠。
> 完整验证过程与 18 项用例结果见 **`02-安全验证报告.md` §3**。

```java
@Configuration
public class PrintTemplateEngineConfig {

    @Bean
    public freemarker.template.Configuration printFreemarkerConfig() {
        var cfg = new freemarker.template.Configuration(
                freemarker.template.Configuration.VERSION_2_3_32);

        // ① 禁 ?new —— 阻断经典 RCE 向量
        //    实测：不禁则 ${"freemarker.template.utility.Execute"?new()("whoami")} 会真的执行命令
        cfg.setNewBuiltinClassResolver(TemplateClassResolver.ALLOWS_NOTHING_RESOLVER);

        // ② 禁 ?api（默认已 false，显式声明以防未来版本变更默认值）
        cfg.setAPIBuiltinEnabled(false);

        // ③ 用 SimpleObjectWrapper —— 拒绝包装任意 POJO，阻断属性与方法访问
        //    实测：不设则 ${user.class.name} 与 ${user.getName()} 都能取到值
        cfg.setObjectWrapper(new SimpleObjectWrapper(
                freemarker.template.Configuration.VERSION_2_3_32));

        cfg.setDefaultEncoding("UTF-8");
        cfg.setLogTemplateExceptions(false);
        cfg.setWrapUncheckedExceptions(true);
        return cfg;
    }
}

@Service
@RequiredArgsConstructor
public class PrintTemplateRenderer {
    private final freemarker.template.Configuration freemarkerConfig;

    public String render(String templateContent, Map<String,Object> data) {
        Template tpl = new Template("print", new StringReader(templateContent), freemarkerConfig);
        StringWriter out = new StringWriter();
        tpl.process(data, out);          // 数据必须已转为 Map/List，见 §3.2B
        return out.toString();
    }
}
```

**实测确认加固后三项必需能力全部保留**：
```
${name} 报销 ${amount} 元                                    → 张三 报销 1,200 元
<#list items as it>${it.itemName}:${it.amount} </#list>      → 机票:800 住宿:400
<#if amount gt 1000>大额<#else>小额</#if>                     → 大额
```

### 3.2B ⚠️ `SimpleObjectWrapper` 带来的数据约束

`SimpleObjectWrapper` **拒绝包装任意 POJO**（这正是它阻断攻击的机制）。因此**模板数据必须是 `Map` / `List` / 基本类型 / `String` / 数字 / 日期，不能直接传实体对象**。

`PrintDataProvider.buildData()` 必须转 Map：

```java
// ❌ 渲染时会抛 TemplateModelException:
//    "SimpleObjectWrapper deliberately won't wrap this type"
data.put("employee", employeeEntity);

// ✅ 必须转 Map
data.put("employee", Map.of(
        "name",     emp.getName(),
        "empNo",    emp.getEmployeeNo(),
        "deptName", emp.getDeptName()));
data.put("items", itemList.stream()
        .map(i -> Map.of("itemName", i.getName(), "amount", i.getAmount()))
        .toList());
```

**这个约束是安全收益的一部分** —— 模板作者拿不到实体对象，就无法沿属性链攀爬到 `class.classLoader`。**必须在 `PrintDataProvider` 接口注释中写明，否则开发会直接传实体然后发现渲染失败。**

**内置格式化函数**（白名单）：`formatDate` / `formatAmount` / `amountToChinese`（金额大写，中式单据必需）/ `formatPercent`

### 3.3 打印数据必过字段权限（AC-10）

```java
public byte[] print(String bizType, Long bizId, String templateCode, String outputFormat) {
    PrintDataProvider provider = providers.get(bizType);
    Map<String,Object> data = provider.buildData(bizId, ctx);

    // ★ 必须走与页面相同的权限过滤链路（复用 C3 的过滤器）
    if (data.containsKey("formData")) {
        formDataPermissionFilter.filterOutbound(
                (Map<String,Object>) data.get("formData"),
                ctx.getDefinitionId(), ctx.getNodeKey(), UserContext.getUserId());
    }
    provider.assertCanPrint(bizId, UserContext.getUserId());   // 业务级权限（如仅本人工资条）
    ...
}
```

---

## 4. G1 移动端（0 新表，纯前端）

### 4.1 两套判断并存的实现（已定决策）

```ts
// 新建：布局用
// src/hooks/useBreakpoint.ts
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export const useBreakpoint = (): Breakpoint => {
  const [bp, setBp] = useState<Breakpoint>(() => resolve(window.innerWidth));
  useEffect(() => {
    const onResize = throttle(() => setBp(resolve(window.innerWidth)), 150);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return bp;
};
const resolve = (w: number): Breakpoint =>
  w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';

// 保留：功能降级用（utils/device.ts 的 isMobileDevice()，不改）
// 用法边界见 G1 的 FR-1.4 表格
```

### 4.2 复用现有 hooks（摸排修正）

| 需求 | 实现 |
| --- | --- |
| 下拉刷新 | **直接用 `usePullToRefresh`**（已有），不新建组件 |
| 手势（左滑操作） | **直接用 `useGestures`**（已有） |
| 输入框遮挡 | **直接用 `useKeyboardHeight`**（已有） |
| 上拉加载 | 用 `VirtualList`（已有 `react-window`） |
| 离线态 | 用 `useOffline`（已有） |

**只需新建 5 个组件**（原计划 6 个，下拉刷新已有）：
`MobileTabBar` / `MobileHeader` / `MobileFilterDrawer` / `MobileActionSheet` / `MobileListCard`

### 4.3 公共组件响应式改造（按 §0.2 精确到 12 个）

65 个组件里真正需要改的（其余如 `Toast`/`Tooltip`/`LoadingSpinner` 无需响应式）：

| 组件 | 改造 |
| --- | --- |
| `table.tsx` + `TableScrollArea.tsx` | 移动端降级为 `MobileListCard` 卡片列表 |
| `BaseDialog.tsx` / `ModalOverlay.tsx` / `dialog.tsx` | 移动端全屏 |
| `EmployeeSelector` / `DeptSelector` / `UserSelector` / `PostSelector` / `PositionSelector` / `RoleSelector` / `MeetingRoomSelector` / `SelectorShell` | 移动端全屏选择页（`SelectorShell` 是共用壳，**改它一处可覆盖 7 个**） |
| `DateRangePicker.tsx` | 移动端分步选择 |
| `tabs.tsx` | 横向滚动 |
| `side-nav.tsx` | 移动端抽屉式 |
| `Pagination.tsx` | 移动端简化为"上一页/下一页" |

**关键发现**：7 个 Selector 共用 `SelectorShell.tsx`，**改壳一处即可**，不需逐个改。

### 4.4 定位打卡（G1 的 FR-5.2）

```ts
export const useGeolocation = () => {
  const [state, setState] = useState<GeoState>({ status: 'idle' });

  const request = useCallback(async () => {
    if (!navigator.geolocation) {
      setState({ status: 'unsupported' });   // AC-10：明确降级
      return null;
    }
    setState({ status: 'requesting' });
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej,
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }));
      setState({ status: 'granted', coords: pos.coords });
      return pos.coords;
    } catch (e) {
      // 权限拒绝 / 超时 / 定位失败
      setState({ status: 'denied', reason: resolveGeoError(e) });
      return null;                          // ★ 返回 null，允许无位置打卡（标记 location_valid_flag=0）
    }
  }, []);
  return { ...state, request };
};
```

**打卡提交**：定位失败时仍可打卡，`latitude`/`longitude` 传空，后端 `location_valid_flag=0`（对接 D2 的字段）。

---

## 5. 表数变化

| 脚本 | 改前 | 改后 | 变化 |
| --- | --- | --- | --- |
| `01.cloudflow-common.sql` | 44（批次 A 后） | **50** | +6（G3 二 + G2 二 + G5 二） |
| 全库 | 314（批次 F 后） | **320** | +6 |

**改动表**：`sys_file`(+7列) / `sys_log`(+9列) / `oa_frontend_error_log`(+trace_id)

## 6. 新增权限码（12 个）

```
system:file:config:{list,add,edit,remove}      文件存储配置
system:import:{list,execute}                    导入任务
system:print:template:{list,add,edit,remove}   打印模板
system:print:record:list                        打印记录
system:log:error:{list,process}                 错误日志
```

---

## 7. 实施顺序

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| M1 | G3 `sys_file_config` + 扩展 `FileStorageType`（LOCAL/OSS → +MINIO/S3/COS）+ SK 加密 | 批次 A |
| M2 | G3 `sys_file` 7 列 + 去重（SHA256）+ 配额回写 | M1 |
| M3 | **G3 `FileAccessChecker` 框架 + 17 个校验器注册** ← 本批最大工作量与最高价值 | M2、各业务批次 |
| M4 | G3 签名 URL（对象存储原生 + 本地 token） | M3 |
| M5 | G3 trace_id 四环节透传 + `sys_log` 增强 + `sys_api_error_log` + 参数脱敏 | 批次 A |
| M6 | G3 前后端错误关联 + 全链路查询 + 报表 | M5、批次 A LC-05 |
| M7 | G2 两表 + 框架骨架 + 六类校验 + 逐行读取 | 批次 A SYS-02 |
| M8 | G2 错误标注文件 + 异步 + 五个业务接入 | M7 |
| M9 | G5 两表 + Hutool 模板渲染 + **安全加固** + OpenHTMLtoPDF + 中文字体 | M4（签名 URL 存输出文件） |
| M10 | G5 Excel 模板填充 + 字段权限过滤 + 四场景接入 | M9、批次 C（C3 过滤器） |
| M11 | G1 `useBreakpoint` + 布局壳 + 5 个新组件 | — |
| M12 | G1 `SelectorShell` 等 12 个组件响应式改造 | M11 |
| M13 | G1 8 场景适配 + 定位打卡 + PWA 增强 | M12、批次 D（D2 打卡字段）、批次 E（E1 活动） |

**M3 是本批关键路径**：17 个校验器依赖各业务批次的表都已建好，所以 G3 的 M3 实际要等 D/E/F 完成。**建议 M1/M2/M5-M8 先做（不依赖业务批次），M3/M4/M9/M10 后做**。

---

## 8. 待确认

| # | 问题 | 建议 |
| --- | --- | --- |
**全部 5 项已定案**（见 `01-决策汇总.md` §6）：

| # | 问题 | ✅ 决策 |
| --- | --- | --- |
| 1 | OSS bucket 读权限 | **已查明**：`accessPolicy` 默认 `"1"`（公共读）但 OSS 未启用，当前无风险。**决策：强制私有，配错启动失败** + 默认值改 `"0"`，见 §0.3 |
| 2 | 17 个 `FileAccessChecker` 规则 | **按设计建议先实现，上线前逐项 review**。§1.3 的清单即初始规则；review 时由各业务模块负责人确认自己那类文件的可见范围 |
| 3 | 无 `biz_type` 历史文件 | **仅上传者本人可访问**（按 `create_by` 判定）。⚠️ 若历史文件需团队共享，会出现"本来能看现在看不了"的回归 —— 上线前需评估历史文件量与共享需求 |
| 4 | 打印模板引擎 | **用现有 Hutool 模板引擎**（不新增依赖）。⚠️ **实施前必须先确认底层实际引擎并验证 5 条危险语法禁用**（类加载/反射/系统调用/脚本块/黑名单绕过），见 `01-决策汇总.md` §5.2。**黑名单本身不可靠，若引擎不支持白名单模式则退回自己做受限字符串替换** |
| 5 | 中文字体部署 | **打包进 jar**（`resources/fonts/NotoSansSC-Regular.ttf`，OFL 许可可商用），jar 体积 +约 10MB。理由：不依赖宿主环境，Docker 容器常缺中文字体 |

2026-10-16过期产物清理约定：本记录中的已完成历史轮次保留版本、检查范围、结果及未解决边界；过期服务包、独立环境、截图、输入快照及脚本副本按用户授权移除。当前运行和未完成验收依赖单独保护，历史失败不改写为通过；实际删除范围与空间结果见《开发测试过期文件清理-20261016.md》。
