# 费用报销标准结构统一

## 已确认业务

用户确认沿用当前页面约定：按具体城市设置，支持每笔、每天、每月、每年限额。现有测试数据全量重建，不迁移旧结构。

| 字段用途 | 当前代码与接口 | 当前建表 | 处理 |
| --- | --- | --- | --- |
| 主键 | standardId / standard_id | id | 统一 standard_id |
| 职级 | positionLevel / position_level | job_level | 统一 position_level |
| 城市 | city，具体城市，可空表示通用 | city_tier，城市等级 | 统一 city |
| 限额周期 | limitType / limit_type，PER_ITEM/DAILY/MONTHLY/YEARLY | limit_period，PER_CLAIM/PER_DAY/PER_MONTH | 统一 limit_type |
| 标准编码、名称、币种 | 无实体、请求、查询或响应字段 | standard_code、standard_name、limit_currency | 当前模型未使用，删除遗留列及编码索引 |

## 实施状态

已完成字段统一、数据库重建、模块构建与实际接口验收；逐项证据见后文。

## 额外业务事实

当前 OaExpenseStandardServiceImpl.validateExceed 仅读取匹配标准后逐条比较金额，limitType 只写入返回结果，尚没有按日/月/年汇总历史单据的实现。本次字段统一不擅自决定跨单累计范围（哪些单据状态计入、按发生日期还是提交日期计入）；此缺口向主代理报告，避免将“可设置周期”描述为已完整执行周期累计。

## 已实施与验证

- 04 建表已统一为 standard_id、position_level、city、limit_type，移除 standard_code、standard_name、limit_currency 三个遗留字段及标准编码唯一索引；匹配索引使用当前字段。
- 07 仅替换费用标准的删除条件、INSERT 列表与生成表达式，未覆盖其他表的并行修改；06 无费用标准 INSERT，无须改动。生成器显式输出职级、具体城市以及四种限额周期，空职级/城市继续表示通用标准。
- 实体注释已同步具体城市和限额周期；现有实体/API 名称保持当前业务约定，无需新增兼容映射。
- `scripts/generate-demo-seed.ps1 -OutputPath <临时文件>` 成功生成 244 张表的数据。脚本校验费用标准 15 列与生成 INSERT 顺序完全相同，四类周期均存在，旧字段未残留。
- 未自行运行 Maven/npm。主代理待验收：OA 模块 verify、隔离数据库 01—07 导入，以及费用标准分页/创建/修改 SQL 不再引用不存在列。

当前费用超标入口还固定传入空职级/空城市，因此只匹配通用规则。该项与跨日/月/年累计均为既有业务接入缺口；已在报告明确，不以删兼容字段的任务擅自补写不明确的金额累计规则。

## 创建租户归属专项核实（修复前证据）

结论：已确认存在源码级缺陷。当前租户为 100001 等非默认租户、创建请求正文不传 tenantId 时，服务主动写入 100000，后续自动填充与租户 SQL 插件均不会覆盖；因此创建成功后，数据归属默认租户，原租户查询也会因租户过滤而看不到该记录。此结论来自完整写入链路；实际 HTTP 请求与数据库落库验收由主代理执行，本分工未操作服务器、未修改业务代码或 SQL、未运行构建。

| 环节 | 证据 | 对结果的影响 |
| --- | --- | --- |
| 前端请求 | `cloudflow-frontend/src/services/api/expense.ts:47` 的 ExpenseStandard 将 tenantId 定义为可选；`:192` 的 add 原样发送 data。`src/services/api/request.ts:246`—`:249` 只把当前用户租户写到 `X-Tenant-Id` 请求头，没有给请求正文补 tenantId | 不传 tenantId 是接口允许的调用方式；请求头正确也无法消除服务内的硬编码赋值 |
| Controller | `cloudflow-service-oa/src/main/java/com/cloudflow/oa/controller/OaExpenseStandardController.java:54`—`:56` 直接把请求实体交给 save | 无租户覆盖或请求租户校验 |
| Service | `cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaExpenseStandardServiceImpl.java:32` 固定 DEFAULT_TENANT_ID=100000；`:80`—`:82` 在 tenantId 为空时设置该常量；`:91` 调用 insert | 非默认租户创建被主动改为默认租户；请求正文显式传其他租户值时同样原样保留 |
| 实体及 Mapper | `cloudflow-service-oa/src/main/java/com/cloudflow/oa/domain/OaExpenseStandard.java:25` 的 tenantId 是普通持久化属性；OaExpenseStandardMapper 直接继承 BaseMapper，无自定义 insert | 非空 tenantId 会出现在 INSERT 的 tenant_id 列中 |
| 自动填充 | `cloudflow-common/cloudflow-common-data/src/main/java/com/cloudflow/common/handler/MyMetaObjectHandler.java:51`—`:53` 仅在实体 tenantId 为空时尝试填入 TenantContext 的当前租户 | Service 已设置非空值，此条件不成立；不会纠正 100000 或正文指定值 |
| 租户 SQL 插件 | `cloudflow-common/cloudflow-common-data/src/main/java/com/cloudflow/common/config/MybatisPlusConfig.java:54`—`:83` 注册 TenantLineInnerInterceptor，未覆盖 ignoreInsert；默认租户列为 tenant_id，费用标准表不在默认忽略表中 | MyBatis Plus 3.5.7 默认 ignoreInsert 在 INSERT 已含租户列时跳过注入，并不会校验/覆盖该值 |

依赖行为已使用本机 Maven 缓存中的 `mybatis-plus-extension-3.5.7.jar` 执行 `javap -c` 只读核实：TenantLineHandler.ignoreInsert 检测租户列是否已经存在；TenantLineInnerInterceptor.processInsert 调用该方法后立即按结果返回，未进入当前租户的添加流程。这不是依赖自动覆盖值的场景。

前端证据边界：对整个 `cloudflow-frontend/src` 搜索 `expenseStandardApi`、`ExpenseStandard` 和 `/expense/standard`，结果仅有上述 API 定义文件，未发现可核实的页面调用方。因此本报告确认的是“通过此 API 省略 tenantId 会误写”，不声称已经观察到页面实际提交的数据。主代理应使用非默认租户登录请求完成运行复现。

相关风险：update 在同一 Service 的 `:97`—`:103` 直接将请求实体传入 updateById，没有锁定 tenantId；普通租户过滤只约束被更新行的原租户，不能代替对 SET tenant_id 的保护。建议创建与修改统一从可信当前租户确定归属，移除默认租户硬编码，禁止请求正文迁移记录所属租户；缺失可信租户时明确失败。此项仅记录修复方向，交主代理实施并验收。

建议运行验收覆盖：非默认租户省略 tenantId 创建后仍能读取；显式传入其他 tenantId 不能跨租户写入；修改自己的记录并传入其他 tenantId 不能改变归属。上述三项本分工未执行。

## 租户归属修复决策（实施前）

主代理已授权本分工修复上述缺陷。创建和修改均以 `UserContext.getTenantId()` 取得的当前登录租户为唯一写入归属，覆盖请求正文的 tenantId；删除默认 100000 兜底。沿用同模块 ExpenseClaimServiceImpl 的 requireTenantId 方式，缺失当前租户时抛出 IllegalArgumentException，写入前终止；Controller 已有对应失败响应。修改继续使用现有租户 SQL 插件限制被更新行，不添加重复查询。

本项只修改 OaExpenseStandardServiceImpl，新增独立租户归属测试，覆盖非默认租户省略正文租户、正文伪造其他租户以及缺失上下文时拒绝持久化。构建、部署和实际接口验收由主代理串行执行；费用累计规则、SQL 和其他业务文件不在本次改动范围。

## 租户归属修复实施结果

- OaExpenseStandardServiceImpl 已删除 DEFAULT_TENANT_ID，save/update 均先执行 `standard.setTenantId(requireTenantId())`；requireTenantId 只读取 UserContext，缺失时明确报错。创建仍执行一次 insert，修改仍执行一次 updateById，未新增数据库查询。
- 新增 `cloudflow-service-oa/src/test/java/com/cloudflow/oa/service/impl/OaExpenseStandardTenantTest.java`，共 6 项测试：非默认租户省略正文租户的创建/修改，正文伪造其他租户的创建/修改，缺失登录上下文但正文携带租户的创建/修改。前四项验证传入 Mapper 的归属始终为当前租户，后两项验证明确失败且 Mapper 没有被调用。
- 本分工已通过所改文件的 `git diff --check` 和源码静态核对；未执行 Maven/npm、未修改 SQL、未操作服务器。主代理待统一执行：在 cloudflow-backend 下运行 `mvn -pl cloudflow-service-oa -am -Dtest=OaExpenseStandardTenantTest -Dsurefire.failIfNoSpecifiedTests=false test`，以及最新 OA 构建/部署与非默认租户接口验收。单元测试只验证服务写入参数，真实 SQL 的行级租户隔离仍需运行验收覆盖。

## 主代理运行验收

非默认租户100001实际请求已复现原缺陷：省略tenantId创建返回成功，数据库归属100000；该探测记录已精确删除。修复后OA verify全部通过（新增6项租户测试），重新打包部署且健康检查UP。实际创建四种周期PER_ITEM/DAILY/MONTHLY/YEARLY并保存具体城市成功；省略tenantId及正文伪造100000都归属当前100001；修改正文租户不能迁移归属，跨租户读取为空、修改拒绝且原行未变；删除通过。仅清理本次专用验收记录，业务审计日志保留。

本验收证明配置的创建/修改/读取/删除及租户隔离正确，不表示日/月/年累计和城市/职级业务接入缺口已补齐。
