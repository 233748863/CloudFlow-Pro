# 演示基础设施记录运行审计

## 范围与原则

全量重建仍保留每租户每表 50 条演示数据；消息、重试记录采用已完成历史样例，避免启动后台服务后实际执行伪造任务。真实业务展示中的待办和审批状态不在本项统一改终态。只修改 outbox_event、wf_transaction_message 对应生成规则及 06/07 片段，不操作服务器、不运行构建。

## 已确认问题

| 表 | 后台执行条件 | 演示问题 | 处理 |
| --- | --- | --- | --- |
| outbox_event | OutboxEventMapper.claimBatch 扫 PENDING/FAILED 且 next_retry_at 到期 | 07 按状态注释随机生成待发布/失败，载荷为普通业务文本；06 第二条也是未来待发布且旧信封结构 | 统一生成 PUBLISHED 历史记录，事件编号与标准 JSON 信封一致，清除锁与错误字段 |
| wf_transaction_message | TransactionConsistencyService 每 60 秒扫到期 PENDING | 07 泛化状态含 PENDING/未知 ACTIVE，内容普通文本；06 多条待重试且业务类型不属于现有四种处理器 | 历史样例统一 SUCCESS、无下次重试时间，生成内容为合法 JSON |

回调死信表只有管理员手动重放入口，未发现扫描数据库自动重放；保留其错误处置展示样例。定时任务实际读取 Redis ZSet，建表样例不会直接产生定时执行；不得清空其他应用 Redis。超时告警表只作结果记录/人工处置，原审批待办仍可能按真实业务规则产生提醒，保持该功能。

## 状态

代码、初始化及正式数据库验收完成；补充运行发现也已修正并验证，见末尾。

- 生成器增加两张基础设施表的明确规则：Outbox 为 PUBLISHED，事务消息为 SUCCESS；时间采用已发生历史时间，无重试错误和抢占锁。
- Outbox 的 eventId 列与信封 eventId 同源生成，occurredAt 为 ISO 本地时间，payload 为 JSON 字符串，符合 BusinessEventEnvelope；事务消息使用现有 NOTIFICATION 类型与合法 recipientId/title/content 载荷。
- 06 精确修改 2 条 Outbox 与 20 条事务消息样例；只对这些 INSERT 解析列与值，不修改其他表。07 从生成器临时输出中仅替换这两表 INSERT，保留并行分工的其他表内容。
- `scripts/generate-demo-seed.ps1 -OutputPath <临时文件>` 成功生成 244 张表；静态检查两表状态表达式不含 PENDING/FAILED，载荷均为 JSON_OBJECT，06 列和值数量匹配。
- 本分工没有运行 Maven/npm，也未操作数据库或 Redis。

## 数据库验收 SQL

以下两条在刚初始化、服务尚未启动时均应为 0：

```sql
SELECT COUNT(*) FROM outbox_event WHERE status IN ('PENDING','FAILED');
SELECT COUNT(*) FROM wf_transaction_message WHERE status IN ('PENDING','PROCESSING');
```

以下两条均应为 0，确认消息格式和编号一致：

```sql
SELECT COUNT(*) FROM outbox_event
WHERE NOT JSON_VALID(payload_json)
   OR JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.eventId')) <> event_id
   OR JSON_TYPE(JSON_EXTRACT(payload_json, '$.payload')) <> 'STRING';
SELECT COUNT(*) FROM wf_transaction_message WHERE NOT JSON_VALID(content);
```

新建的真实业务消息不受这些历史演示记录约束，运行时仍按原有状态进入后台扫描。


## 主代理运行续查
2026-11-02 正式库重建后，xinghe 租户 admin 登录返回账号已被限制登录。请 seed_runtime_review 只读检查 sys_user_blacklist 演示种子及登录匹配链路，写明最小修复建议；暂不改代码/SQL、不执行构建、不操作服务器。

### 黑名单续查结论（只读，2026-11-02）

已从当前生成器、06/07 SQL 和登录服务确认：07 的通用关联规则将每个租户第 1 条黑名单关联到该租户 admin，同时生成 ACTIVE、未过期、deleted=0；因此 50 个租户管理员全部满足数据库封禁条件。xinghe 对应 tenant_id=100001、user_id=20301001、黑名单 id=20401001。这里是演示数据实际生效造成的登录拦截，最小修复落在生成规则和对应演示行，登录安全校验继续保留。

| 字段/条件 | 可登录管理员应有状态 | 07 当前生成结果（r.n=0） |
| --- | --- | --- |
| sys_user.user_name | admin | admin |
| sys_user.status / deleted | 0 / 0 | 0 / 0 |
| sys_user_blacklist.user_id | 可以有已解除历史记录 | 与 admin 的 user_id 相同；默认租户指向用户 1 |
| sys_user_blacklist.status | INACTIVE | ACTIVE |
| sys_user_blacklist.expire_at | 状态已解除时不参与封禁判断 | 导入时间加 1 天 |
| sys_user_blacklist.deleted | 0，保留演示历史 | 0 |

证据链：

- `scripts/generate-demo-seed.ps1:353` 将每租户 r.n=0 用户命名为 admin；`Get-TargetIdExpression`（第 262 行起）按相同 t.n/r.n 关联用户，默认租户首行特殊指向既有用户 1。`Get-StatusExpression`（第 301 行起）解析建表注释 ACTIVE/INACTIVE，r.n=0 取 ACTIVE；第 679 行起日期规则生成未来 expire_at。
- `DB/07.cloudflow-demo-seed.sql:273` 为用户 INSERT，`:659` 为黑名单 INSERT，`:660` 的关键表达式为 `ELT(MOD(r.n,2)+1,'ACTIVE','INACTIVE')` 和 `DATE_ADD(CURRENT_TIMESTAMP, INTERVAL MOD(r.n,90)+1 DAY)`。每租户 50 条中有 25 条生效，包含管理员；刚导入时共 1250 条生成记录生效。
- `AuthController.java:245` 在密码验证后调用 `isBanned(user.getUserId())`；动态验证码登录在第 288 行再次调用。`SysUserBlacklistServiceImpl.java:142` 先检查 `acl:user:black:{userId}`，未命中则按用户编号、deleted=0、ACTIVE、未过期查数据库。数据库查到封禁后直接返回，不写入 Redis，因此清缓存无法解除这批数据库记录。
- `DB/06.cloudflow-business-seed.sql:13640` 的单条黑名单关联 user_id=9999、用户名 demo_locked_user，与 xinghe 管理员编号不同，不是本次管理员拦截来源。07 的 user_name 是泛化公司事项文本，并未与 admin 同步；登录按 user_id 匹配，因此该显示文字不能证明未命中管理员。

### 最小修复建议（尚未执行）

1. 在生成器的 sys_user_blacklist 专项规则中，将 status 改为 `IF(r.n=0,'INACTIVE',ELT(MOD(r.n,2)+1,'ACTIVE','INACTIVE'))`，并只同步替换 07 对应 INSERT 的 status 表达式。这样只解除 50 条管理员演示记录，仍保留每租户 24 条有效封禁样例和每表 50 条演示记录；不增加管理员豁免或修改登录判断。
2. 对已导入目标库，主代理可按下方精确范围将对应 50 条生成记录设为 INACTIVE。数据库范围必须同时约束租户、生成主键、关联用户和用户名，不应批量解除所有真实黑名单。若同用户另有 Redis 封禁键，应在已核实的 CloudFlow Redis 10 库检查，仅清理由本次测试遗留的对应键；本代理未检查服务器缓存。
3. 重新执行 xinghe/admin 登录，并核对 50 个管理员的有效数据库封禁数为 0；非管理员有效封禁样例仍保留。生成器重新输出后仅提取黑名单 INSERT，避免覆盖其他代理已经更新的 07 表片段。

给主代理的定位与验收 SQL（本代理未连接数据库、未执行）：

```sql
-- 定位精确生成记录：应返回 50 行，包含 xinghe 的 20401001 / 20301001。
SELECT b.id, b.tenant_id, b.user_id, u.user_name, b.status, b.expire_at
FROM sys_user_blacklist b
JOIN sys_user u ON u.user_id=b.user_id AND u.tenant_id=b.tenant_id
WHERE b.tenant_id BETWEEN 100000 AND 100049
  AND b.id=20400001+(b.tenant_id-100000)*1000
  AND u.user_name='admin'
  AND b.deleted=0;

-- 仅修改上面定位到的管理员生成记录；供主代理实施，不代表已执行。
UPDATE sys_user_blacklist b
JOIN sys_user u ON u.user_id=b.user_id AND u.tenant_id=b.tenant_id
SET b.status='INACTIVE', b.update_time=CURRENT_TIMESTAMP
WHERE b.tenant_id BETWEEN 100000 AND 100049
  AND b.id=20400001+(b.tenant_id-100000)*1000
  AND u.user_name='admin'
  AND b.deleted=0 AND b.status='ACTIVE';

-- 刚重建且未手动添加封禁时：修改前 50，修改后 0。
SELECT COUNT(*) AS active_admin_bans
FROM sys_user_blacklist b
JOIN sys_user u ON u.user_id=b.user_id AND u.tenant_id=b.tenant_id
WHERE b.tenant_id BETWEEN 100000 AND 100049
  AND u.user_name='admin' AND u.deleted=0
  AND b.deleted=0 AND b.status='ACTIVE'
  AND (b.expire_at IS NULL OR b.expire_at>CURRENT_TIMESTAMP);
```

本轮仅写入审计文档；没有修改 Java、生成器或 SQL 文件，没有运行构建或连接服务器。以上数量由当前生成表达式静态推导，实际库验收由主代理执行。

主代理已核实正式库50个租户admin均有ACTIVE黑名单，均为07生成的首行r.n=0；其他黑名单样例应保留。授权最小修复：生成器仅sys_user_blacklist.status在r.n=0输出INACTIVE，其余仍按原交替规则；07仅同步此表INSERT，06若涉及admin一并查证。请先写决策再修改，本次无需构建和全量重新生成覆盖。完成后报告。主代理负责正式库相应50条样例修正及缓存检查。

### 黑名单修复决策（实施前记录）

采用主代理已确认的最小范围：生成器仅为 sys_user_blacklist.status 增加 r.n=0 的 INACTIVE 分支，其他 49 行保持原交替规则；07 仅替换此表 INSERT 的状态表达式。06 的既有记录关联用户 9999，继续核对其是否属于 admin；不改登录服务、不操作服务器、不运行构建。修改后用静态表达式比对确认 2500 条生成记录中只有 50 条管理员状态改变，每租户仍有 24 条有效封禁样例。

### 黑名单修复结果

已按上述决策完成生成器和 07 的最小修改。`Get-StatusExpression` 仅对 sys_user_blacklist.status 增加管理员首行判断；07 仅替换该表 INSERT 中的一处表达式，按字节检查确认其余内容保持不变。06 共 41 条 sys_user INSERT 均不含用户编号 9999，该黑名单样例与管理员无关联，06 保持原样。

验证通过：PowerShell 脚本语法解析无错误；生成器与 07 的专用状态表达式一致；遍历 50 个租户 × 50 行确认恰有 50 个 r.n=0 的状态改变，剩余 2450 行状态完全保留，每租户仍有 24 条有效封禁样例。本代理未运行 Maven/npm、未重生成覆盖整份 07、未连接服务器。正式库 50 条记录修正、Redis 10 库检查及登录验收由主代理继续执行。

## JSON 列表样例修复决策（实施前记录）

按 13:43 派工，依据 `backend-simplification-json-seed-review.md` 已确认的 23 个 List 字段和 5 个业务要求数组的 JsonNode 字段，仅修正这 28 列的生成表达式。生成器维护一次初始化的表列对应表达式；工作日使用 `JSON_ARRAY(1,2,3,4,5)`，打卡方式使用 `JSON_ARRAY('GPS','WIFI','FACE')`，选项依据当前页面 `AttendanceRule.tsx:508`；其他 26 列使用 `JSON_ARRAY()` 表示无附件或无子项，不伪造业务内容。

先输出到 TEMP 临时 SQL，比对并只替换 07 中这 28 列的 SELECT 表达式，其他字节保持原样；核对 06 同列的现有值是否为数组或 NULL。表列与 SQL 表达式清单写至 `%TEMP%/cloudflow-json-array-fixes.json`，结构为对象数组，每项包含 `table`、`column`、`expression`，供主代理按本轮 demo50 样例范围校正正式库。本代理不运行 Maven/npm、不连接服务器。

### JSON 列表样例修复结果

生成器已增加 28 项明确的表列映射，覆盖 23 张表；考勤两列按上述合法选项生成，其余 26 列生成空数组。脚本输出至 `%TEMP%/cloudflow-json-array-seed-generated.sql` 成功，共 244 张表；逐列对照临时输出，仅替换 07 的 28 处目标表达式。对替换后的文本逆向恢复旧表达式并比较原字节，确认其余 07 内容完全未改变。PowerShell 语法解析通过。

06 采用按 SQL 引号、括号、注释拆分的只读检查，共定位 23 条相关 INSERT、332 行记录、376 个目标单元格，结果为 369 个数组、7 个 NULL，没有对象或非法 JSON。另 7 个目标列在 06 没有显式值：考勤申诉证据、绩效访谈改进项与附件、简历解析技能与经历、绩效分布、评价维度分值；未发现需要改动的 06 样例。检查明细保存在 `%TEMP%/cloudflow-json-array-06-review.json`。

交付正式库修正清单 `%TEMP%/cloudflow-json-array-fixes.json`（UTF-8，无 BOM），顶层为 28 项数组；每项为 `{"table":"hr_candidate","column":"resume_attachment_urls","expression":"JSON_ARRAY()"}` 结构。主代理应限制在本轮生成样例主键/租户范围且当前仍为 `source=demo50` 的对象值后修正，保留既有真实附件/子项；数据库写入及接口复验由主代理执行。本次未改 Java、未运行 Maven/npm、未连接服务器。

本项验收确认数组形状和读取约定一致；空题目、空绩效分布等样例只表示未配置子项，完整业务流程的可运行性不作为本次形状修复的已验证结论。简历 parsed_skills 前端字符串与后端数组的额外差异已由独立复核文档记录，仍由主代理安排。

## IP 规则样例修复决策（实施前记录）

按 14:25 派工，核实 sys_ip_acl.ip_pattern 当前落入通用中文文本生成规则，rule_type 却循环生成 EXACT/CIDR/RANGE；含连字符的中文文本进入网关区间地址解析后产生异常。`BlacklistFilter.ipMatches`、`SysIpAcl.ruleType` 及建表枚举均使用 EXACT 表示单 IP 精确匹配；任务所述 IP 类型落实为 EXACT，不引入新枚举。

最小修改限于生成器与 07 的两个列：`ip_pattern=CONCAT('192.0.2.',r.n+1)`，`rule_type='EXACT'`。每租户 50 行使用文档示例网段的 192.0.2.1 至 192.0.2.50；名单模式、状态、优先级、有效期等保持原值。06 的两条规则 `198.51.100.0/24`（CIDR）与 `203.0.113.10`（EXACT）类型匹配，保持原样。生成范围为 tenant_id=100000 至 100049，每租户主键 `19200001+(tenant_id-100000)*1000` 至 `19200050+(tenant_id-100000)*1000`；主代理负责正式库修正及现有 IP 规则缓存刷新，本代理不构建、不操作服务器。

### IP 规则样例修复结果

生成器与 07 已仅修改 ip_pattern、rule_type 两列；输出到 `%TEMP%/cloudflow-ip-acl-seed-generated.sql` 成功（244 张表），目标表达式逐项一致，逆向恢复后逐字节核对确认 07 其他内容完全保留。PowerShell 语法解析通过，Python 标准 ipaddress 验证 50 个地址均属于 192.0.2.0/24；06 两条原规则也通过对应 IPv4/CIDR 验证，没有修改 06。正式库修正清单另存 `%TEMP%/cloudflow-ip-acl-seed-fix.json`，包含生成表达式、租户与主键范围、无 r.n 依赖的 UPDATE 表达式。

供主代理使用的精确更新语句如下；本代理未执行，命中应为 2500 条演示记录。id=1、2 的 06 原规则不在范围内。修正后主代理需同步现有 `cloudflow:acl:ip:active` 缓存，并通过 `cloudflow:acl:ip` 的 RELOAD 通知网关读取新值，单独改数据库不能消除已有缓存中的中文表达式。

```sql
UPDATE cloud_flow_db.sys_ip_acl
SET ip_pattern=CONCAT('192.0.2.',id-(19200000+(tenant_id-100000)*1000)),
    rule_type='EXACT'
WHERE tenant_id BETWEEN 100000 AND 100049
  AND id BETWEEN 19200001+(tenant_id-100000)*1000
             AND 19200050+(tenant_id-100000)*1000;

-- 上述范围的无效表达式应为 0。
SELECT COUNT(*) AS invalid_demo_ip_rules
FROM cloud_flow_db.sys_ip_acl
WHERE tenant_id BETWEEN 100000 AND 100049
  AND id BETWEEN 19200001+(tenant_id-100000)*1000
             AND 19200050+(tenant_id-100000)*1000
  AND (rule_type<>'EXACT'
       OR ip_pattern<>CONCAT('192.0.2.',id-(19200000+(tenant_id-100000)*1000))
       OR INET_ATON(ip_pattern) IS NULL);
```

## 主代理最终数据库验收

最终07已重新导入本任务隔离库cloud_flow_audit_20261102_125404，244表4057列、50活跃租户/2540用户及241租户表每租户至少50行均通过。消息JSON/编号合法、演示待发/失败/执行中数量0，部门负责人引用合法。隔离库与正式库分别检查28列全部为数组或NULL、50个管理员无有效封禁、EXACT规则全部为合法IP。

正式库黑名单50条、JSON的70000个字段值、IP规则2500行及1250条对应缓存均在校正前备份，只处理明确的生成样例。真实候选人、面试、Offer、福利、商城及培训列表通过，费用与简历专项写入验收通过；具体备份目录和Redis0误清已恢复记录见主审计文档。
