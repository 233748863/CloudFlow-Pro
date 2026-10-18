# H 批次第五节交付自检记录

执行日期：2026-09-15。依据 `04-编码任务通用约束.md:245` 的14项清单逐项重新执行；本记录不把此前会话的通过结论当作本轮执行结果。

本批43项正式菜单均在批准段位内；EMPLOYEE（role_id=5）完整173项授权与正式种子一致，本批12项本人业务写权限之外的新增写权限为0；完整29模块 `mvn -DskipTests install` 于10:45:40通过，validate阶段执行10条静态规则，finding为0。

本机完整日志及辅助检查程序位于 `.cloudflow-runtime/batch-h-delivery-selfcheck-20260915`，该目录不纳入版本管理。下文输出为本轮日志原文节选；数据库和日志检查只输出计数、权限标识及结果，不输出凭据、令牌、工资金额或表单正文。

## 1. 构建与代码检查

### 清单1：完整后端 install 与10条规则

工作目录：`cloudflow-backend`。

```text
> mvn -DskipTests install
[INFO] --- exec:3.5.0:java (validate-static-rules) @ cloudflow-common-static-rules ---
[static-rules] no findings
[INFO] BUILD SUCCESS
[INFO] Total time:  01:29 min
[INFO] Finished at: 2026-09-15T10:45:40+08:00
```

对真实日志、Maven绑定和扫描器规则的核对输出：

```text
WHITELIST_RESOURCE_CURRENT=True
STATIC_RULE_PHASE=validate
STATIC_RULE_COUNT=10
REACTOR_MODULES_SUCCESS=29
EXIT_CODE=0
```

独立负例验证确认10条规则均能拒绝违规输入，包含8种SQL注解的24种书写形式，以及同一行书写方法体的权限检查：

```text
Static rule scanner checks passed: 36; rules=10; annotation variants=24
Verified rules: AUDIT_LOG_DELETE_CALL,AUTH_NO_RATE,HIGH_RISK_AUDIT_REQUIRED,MP_SQL_APPLY,MP_SQL_LAST,MYBATIS_ANNOTATION_SQL,PERMISSION_GUARD,POST_NO_REPEAT,SQL_CONCAT,TXN_WORKFLOW
```

日志：`01-maven-install-final.log`、`01-maven-summary.log`、`platform-regressions.log`。

### 清单2、3：前端类型检查与构建

工作目录：`cloudflow-frontend`。

```text
> npm run type-check
> cloudflow-pro-v2-(react)@0.0.0 type-check
> tsc --noEmit
EXIT_CODE=0

> npm run build
✓ 4151 modules transformed.
✓ built in 18.13s
PWA v1.2.0
mode      generateSW
precache  387 entries (5847.46 KiB)
EXIT_CODE=0
```

原有警告仍保留：存在压缩后超过500 kB的分块，Browserslist提示浏览器数据已有8个月；两者均未导致构建失败。日志：`02-type-check.log`、`03-frontend-build.log`及各自退出码文件。

### 清单7、8、9、10、11：全仓源码检索及权限前缀

工作目录：仓库根目录。

```text
> node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs
JAVA_SOURCE_FILES=2610; scope=repository Java sources including verification scripts
COMMAND: rg "-n" "--pcre2" "-g" "*.java" "-g" "!**/artifacts/**" "(?:SELECT|UPDATE|DELETE|INSERT) [^\"]*\"\\s*\\+" "."
JAVA_SQL_CONCAT: matches=0; rg_exit=1
COMMAND: rg "-n" "--pcre2" "-g" "*.java" "-g" "!**/artifacts/**" "-g" "!**/StaticRuleScanner.java" "\\.last\\(|\\.apply\\(\\x22" "."
MP_SQL_LAST_APPLY: matches=0; rg_exit=1
COMMAND: rg "-n" "--pcre2" "-g" "*.java" "-g" "!**/artifacts/**" "^\\s*@(?:org\\.apache\\.ibatis\\.annotations\\.)?(Select|Update|Insert|Delete)(Provider)?\\s*\\(" "."
MYBATIS_ANNOTATION_SQL: matches=0; rg_exit=1
SA_CHECK_LOGIN: declarations=21; mapped_endpoints_checked=117; login_only_external_endpoints=0
JAVA_PERMISSION_PREFIXES: annotations=1462; values=1480; invalid=0; allowed=system,oa,crm,hr,workflow
FRONTEND_PERMISSION_LITERALS: files=681; allowed_values=637; invalid=0; reviewed_date_message_cache_literals=5
EXIT_CODE=0
```

`rg_exit=1`表示没有匹配项，检查程序自身退出码为0。源码检索包含隔离验收Java程序，不包含生成的构建产物；`.last`/`.apply`排除扫描器自身用于识别违规的字符串。SQL拼接项按文档静态规则的SELECT/UPDATE/DELETE/INSERT模式检查；隔离建库的CREATE/DROP/故障触发器标识仍受随机库名、固定枚举和所有权检查约束，不以此检索宣称任意SQL动词均经过Java语法树证明。

21处登录注解不等于21处越权：逐一关联到117个映射方法后，仅登录而无业务保护的外部接口为0。前端另5处为时间值、示例消息和Redis键，已核对其用途，不当作权限码。

运行库也单独检查了全部非空菜单权限，包括原有停用演示菜单：

```text
MENU_PERMISSION_PREFIXES: checked=810; invalid=0; allowed=system,oa,crm,hr,workflow
```

日志：`07-11-13-source-checks.log`、`05-06-live-menus-employee.log`。

### 清单13：认证控制器白名单行号

同一源码检查程序逐项读取真实行内容，输出如下：

```text
WHITELIST cloudflow-auth/src/main/java/com/cloudflow/auth/controller/AuthController.java:141 => public R<DynamicMapVO> login(@RequestBody @Validated LoginBody form, HttpServletRequest request, HttpServletResponse response) {
WHITELIST cloudflow-auth/src/main/java/com/cloudflow/auth/controller/CaptchaController.java:27 => public R<DynamicMapVO> getSliderCaptcha(HttpServletRequest request) {
WHITELIST cloudflow-auth/src/main/java/com/cloudflow/auth/controller/CaptchaController.java:39 => public R<DynamicMapVO> checkCaptcha(@RequestBody CaptchaCheckDTO dto, HttpServletRequest request) {
WHITELIST cloudflow-auth/src/main/java/com/cloudflow/auth/controller/BusinessRuleController.java:44 => public R<BusinessRule> getEffectiveRule(@PathVariable String ruleCode) {
STATIC_WHITELIST: entries=9; unique_locations=4; stale_lines=0
```

最终完整构建前额外校验了源码白名单与验证类路径中的资源字节一致，未依赖旧资源通过。

## 2. 数据、菜单与员工权限

### 清单4：空库执行01—06

检查程序将脚本中的数据库限定名重定向至本次随机独立库，其他初始化逻辑不变；没有重导运行库。

```text
> node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-database.mjs --empty-db
EMPTY_DATABASE=h_delivery_c9dee5dea4c040489dcdeb4ba793eec5; initial_tables=0; runtime_database_unchanged=true
01.cloudflow-common.sql: mysql_exit=0; tables=50; expected=50
02.cloudflow-workflow.sql: mysql_exit=0; tables=95; expected=95
03.cloudflow-hr.sql: mysql_exit=0; tables=198; expected=198
04.cloudflow-oa.sql: mysql_exit=0; tables=288; expected=288
05.cloudflow-crm.sql: mysql_exit=0; tables=323; expected=323
06.cloudflow-business-seed.sql: mysql_exit=0; tables=323; expected=323
FORMAL_TABLE_NAMES: expected=323; actual=323; missing=0; unexpected=0
TEMPORARY_DATABASE_REMOVED=true; RUNTIME_WRITES=0
EXIT_CODE=0
```

日志：`04-empty-database.log`。

### 清单5：menu_id段位与插入前冲突

空库重放在06脚本真正插入首个H菜单之前执行原始冲突查询：

```text
PREINSERT_SQL: SELECT menu_id,menu_name,perms FROM sys_menu WHERE menu_id BETWEEN 1800 AND 1859;
{"rows":0,"check":"H_PREINSERT_CONFLICTS"}
```

当前运行库已有正式H菜单，单独只读核对结果如下；没有把现库已有43行宣称为0行：

```text
> node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-database.mjs --live
PREEXISTING_07_DEMO_MENUS: range=3000-3049; rows=50; enabled=0; excluded_from_H=true
H_MENU_IDS: expected=43; actual=43; missing=0; unexpected=0
WF: reserved=1800-1809; actual=5; ids=1800,1801,1802,1803,1804
OA: reserved=1810-1829; actual=19; ids=1810,1811,1812,1813,1814,1815,1816,1817,1818,1820,1821,1822,1823,1824,1825,1826,1827,1828,1829
HR: reserved=1830-1859; actual=19; ids=1830,1831,1832,1833,1834,1835,1836,1837,1838,1839,1840,1841,1842,1843,1844,1845,1846,1847,1848
H_MENU_OUT_OF_RANGE=0; RESERVED_1819_ROWS=0
H_ROLE_PAIRS: expected=252; actual=252; missing=0; unexpected=0
```

50个3000—3049菜单来自既有07演示生成段，均保持停用，不属于本批新增43项正式菜单。本轮只纠正其权限字符串，没有新增这些菜单编号。

### 清单6：EMPLOYEE没有非预期写权限

运行库读取role_id=5的全部授权，与正式初始化及H确认稿的授权集合核对，未只看前端按钮是否隐藏。

```text
EMPLOYEE_ROLE={"roleId":5,"status":"0","deleted":0,"roleKey":"employee","tenantId":100000}
EMPLOYEE_ALL_GRANTS: expected=173; actual=173; missing=0; unexpected=0
EMPLOYEE_H_WRITES: expected=12; actual=12; missing=0; unexpected=0
EMPLOYEE_ALLOWED_SELF_SERVICE_WRITES:
1802	workflow:draft:save
1803	workflow:draft:remove
1804	workflow:draft:submit
1822	oa:consumable-request:add
1823	oa:consumable-request:edit
1824	oa:consumable-request:submit
1825	oa:consumable-request:cancel
1831	hr:overtime:apply
1832	hr:overtime:cancel
1844	hr:shift-request:apply
1845	hr:shift-request:cancel
1846	hr:shift-request:respond
EMPLOYEE_UNEXPECTED_WRITES=0; LEGACY_BUSINESS_ADDITIONS=0; DANGEROUS_936_939_OR_WILDCARD=0
EXIT_CODE=0
```

本人草稿、耗材申请、加班申请、调班申请及回应邀请的12项操作是批准的自助写权限；未授予发料、冲正、重算、人事核定、财务核价或管理重试权限。日志：`05-06-live-menus-employee.log`。

### 清单14：07由生成器重新生成

```text
> pwsh -NoProfile -File scripts/generate-demo-seed.ps1
Generated 1,729,529 bytes for 315 tables.
EXIT_CODE=0

> pwsh -NoProfile -File scripts/generate-demo-seed.ps1 -OutputPath .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/07-repro-generated.sql
Generated 1,729,529 bytes for 315 tables.
REGENERATED_BYTES=1729529
BYTE_IDENTICAL=True
SHA256=D1053DAEF76F24B984C6ED2EE3DC53EECC35552D4C966FD788DBDDED9BCAD8AF
EXIT_CODE=0
```

第二次生成至独立文件后进行了SHA256比对。315是通用演示数据覆盖表数；8张由真实业务或正式基础数据维护的表不伪造通用过程记录，正式建表数仍为323。日志：`14-generate-demo-seed.log`、`14-repro-generation.log`、`14-repro-hash.log`。

## 3. 密钥检查、整改与现场状态

### 清单12：加密存储、接口脱敏、日志无明文

```text
> pwsh -NoProfile -File scripts/verify-batch-h-encryption-codec.ps1 -WithDatabase
PASS codec offline assertions=450; actual current interceptors and HR payloads; no database access
PASS MySQL formal JSON columns and real Mapper round trips; assertions=41
PASS MySQL write and SQL failure transaction rollback; assertions=51
PASS MySQL legacy masking and explicit fixture replacement; assertions=27
PASS codec isolated MySQL assertions=130; copied two table definitions only; owned database dropped; total=580

> pwsh -NoProfile -File scripts/verify-batch-g.ps1 -SkipBuild
Batch G file storage checks passed: 35
Batch G observability checks passed: 49

> node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sensitive.mjs
H_PAY_AT_REST: rows=2; cipher_fields=4; plaintext_or_invalid_fields=0
RUNTIME_KEY_CONFIGURATION: {"activeTotpRows":0,"messageCipherFields":0,"storageCipherFields":0,"disabledTotpPlaceholders":2500}; placeholders_are_disabled_nonsecrets=true
HTTP_MASKING: route=/auth/system/message/channel/list?pageSize=100; status=200; records=53; populated_masked_fields=0; secret_or_cipher_leaks=0
EMPLOYEE_CONFIG_ACCESS: route=/auth/system/message/channel/list?pageSize=100; status=403
HTTP_MASKING: route=/auth/system/file/config/list?pageSize=100; status=200; records=50; populated_masked_fields=0; secret_or_cipher_leaks=0
EMPLOYEE_CONFIG_ACCESS: route=/auth/system/file/config/list?pageSize=100; status=403
SERVICE_LOG_SECRET_SCAN: files=76; bytes=174182740; known_credentials=28; plaintext_hits=0
EXIT_CODE=0
```

运行环境没有已配置的消息渠道、文件存储或启用的TOTP真实密钥；2500个`DEMO_DISABLED`是停用演示占位值。非空密钥的加密、序列化隐藏、仅显示末四位、短密钥全隐藏由真实加密器和序列化回归覆盖，没有往运行库植入测试密钥。运行PAY记录的4个金额字段均为密文形态；真实加密写入、解密回读和失败回滚另在独立MySQL中执行。

日志检查在内存中使用当前连接凭据、验收账号/会话及受Windows保护的临时加密密钥作为28个匹配值；仅输出计数，不把解密后的密钥写入文件或控制台。该结果对应本次读取的76份服务输出/错误日志，不扩大为未知凭据或未来日志的保证。运行HR临时加密配置未重新启用。

### 本轮发现并修正的问题

- 日历写入Mapper残留两处注解式SQL；扫描器先跳过注解行造成漏检，单行方法体也可能漏检。SQL已移至`HolidayDateWriteMapper.xml`，扫描顺序及方法匹配修正，补充36项扫描器负例/正例及日历XML参数绑定验证；认证服务已重启并通过健康检查。
- 四套隔离验证涉及的5个Java文件存在17处SELECT/INSERT等查询或写值拼接；改用参数绑定、固定语句及共享只读XML，保留表名校验、隔离连接和删除前所有权校验。同步修正认证白名单9条记录的4个实际方法位置。
- 生成器给50个停用演示菜单生成了业务描述而非权限码；现生成`system:demo-menu:view-001`至`view-050`，07完整重新生成。运行库只更新3000—3049的`perms`列，更新前数据保存在本机证据目录，角色绑定、H菜单和业务事实均未改动。

```text
DISABLED_DEMO_MENU_PREFIX_REPAIR: rows=50; columns=perms; range=3000-3049; roles_unchanged=true; H_menus_unchanged=true
Fixture inspection SQL checks passed: 16
PASS WF11 database scenarios=10 checks=151
OA08 RESULT: groups=27/27; assertions=7491/7491; real-db-races=4; observed-InnoDB-row-waits=5; actual-MySQL-faults=11; zero-row-write-faults=1; scanner-deadlock-victims=1; failed-groups=; exit=0
PASS HR09 groups=16 assertions=861 real-db-races=18 database-dropped=true
PASS H运行库一致性 23 项；业务样本数 {"settledPay":2,"appliedShift":2,"settledCompensatory":10,"consumableLedgerRows":69,"settledPayCorrections":1}
REMAINING_H_VERIFICATION_DATABASES=0
```

平台回归14组606项、H静态契约35项及其自测20项通过。OA当前源码指纹为`1b19963818edf244684d9c7fc7d174c252e7e5b679229cf8836e2d37209eee19`；HR为`01a07417ea05e0835610cc4cc0ad06b324cf92a29956694a7d8417c05b3a06a1`；草稿为`f4985a5bbe6b0e44e92711eb32f6e90bb79fa2224ec502912520d1e2a22ba9a8`。这些隔离数据库检查不冒充真实外部通知投递、在线审批或30天自然等待。

本轮未清理Redis，未重导运行库或删除验收业务事实。未核定的正式政策继续保持停用/空值，前期保留范围仍以`H-首轮实施与验收记录.md`第4节为准。

2026-10-16过期产物清理约定：本记录中的已完成历史轮次保留版本、检查范围、结果及未解决边界；过期服务包、独立环境、截图、输入快照及脚本副本按用户授权移除。当前运行和未完成验收依赖单独保护，历史失败不改写为通过；实际删除范围与空间结果见《开发测试过期文件清理-20261016.md》。
