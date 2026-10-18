# PRD：文件存储多后端与 trace_id 全链路（SYS-04 + SYS-05）

| 项 | 内容 |
| --- | --- |
| 条目编号 | SYS-04 文件存储多后端 · SYS-05 API 日志与 trace_id |
| 所属批次 | 批次 G（第 3 份，两项都是基础设施改造，合并交付） |
| 对标依据 | `docs/benchmark/05-system-系统治理对标.md` |
| 优先级 | P1 —— **SYS-04 含一个实际的越权风险修复** |
| 预估工作量 | M+M |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 SYS-04：私有文件可能存在直链越权

`sys_file`（12 列）有 `storage_type` 字段但**没有存储配置表**，配置在 yml 里。更重要的是：`sys_file.url` 字段若为直链，任何拿到 URL 的人都能访问文件 —— **合同、薪资单、身份证扫描件、供应商资质、履约证据都在其中**。

本系列多个 PRD 都涉及敏感附件：
| 附件类型 | 来源 PRD |
| --- | --- |
| 履约证据 | F4 OA-06 |
| 供应商资质 | F2 OA-02 |
| 工资条 PDF | D3 |
| 申诉附件 | D4 |
| 打卡照片 | D2 / G1 |
| 导入文件（含个人信息） | G2 |

这些 PRD 都在依赖章节写了"配合批次 G SYS-04 签名 URL 改造"。

### 1.2 SYS-05：微服务无 trace_id，排查困难

现有 `sys_log` + `sys_audit_log` + `sys_login_log`（三个 Controller），已有 `sys_audit_archive_policy` 归档（这点领先参考项目）。但：
- **无 `trace_id` 全链路串联** —— 六个服务间调用无法串起来
- 无 `duration` 慢接口分析
- 错误日志混在 `sys_log` 里（量级与保留期需求不同）
- 前端已有 `oa_frontend_error_log`（前端错误上报）但与后端日志无法关联

### 1.3 目标
1. 存储后端配置化（本地/MinIO/S3/OSS/COS），可按租户区分
2. **私有文件改签名 URL 访问**（修越权面）
3. 文件去重（SHA256）
4. `trace_id` 贯穿网关与六个服务
5. 错误日志独立表
6. 慢接口分析
7. 前后端错误通过 trace_id 关联

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| `sys_file` | 12 列：`file_id, tenant_id, file_name, file_path, url, storage_type, file_size, file_type, create_by, create_time, deleted, remark` |
| 存储配置 | **无配置表**，在 yml |
| **存储枚举（摸排新发现）** | `enums/FileStorageType.java` **已存在，但仅 `LOCAL` / `OSS` 两值**（本 PRD 目标 5 值：LOCAL/MINIO/S3/OSS/COS） |
| **存储配置类（摸排新发现）** | `config/properties/AuthOssProperties.java` + `config/properties/FileStorageProperties.java` 已存在 |
| **上传校验（摸排新发现）** | `SysFileServiceImpl` 已有**文件类别与扩展名白名单**（image/pdf/word/excel/ppt/text/archive 分类），G2 导入框架的类型校验可复用 |
| `sys_tenant` | 有 `storage_limit` / `storage_used`（配额字段已有） |
| `sys_log` | 操作日志 |
| `sys_audit_log` | 审计日志 |
| `sys_login_log` | 登录日志 |
| `sys_audit_archive_policy` | 归档策略（**已有，可复用**） |
| `oa_frontend_error_log` | 前端错误上报 |
| 网关 | `cloudflow-gateway`（`AuthFilter` 已有，可挂 trace_id 生成） |
| 服务数 | 6 个（gateway / auth / workflow / oa / crm / hr） |
| 前端 | `services/errorReporter.ts`（错误上报） |

## 3. 范围

### 3.1 做（SYS-04）
1. 新增 `sys_file_config`（存储配置）—— 现有配置在 properties 里，改为配置表驱动
2. `sys_file` 增字段（config_id / hash / bucket / object_key / access_type）
3. 多存储后端适配：**扩展现有 `FileStorageType` 枚举**（LOCAL/OSS → 加 MINIO/S3/COS），现有 `AuthOssProperties` 与 `FileStorageProperties` 的配置项迁到配置表
4. **复用现有扩展名白名单校验**（`SysFileServiceImpl` 已有 7 类文件分类）
4. **私有文件签名 URL**
5. 文件去重
6. 租户配额联动（`storage_used` 回填）

### 3.2 做（SYS-05）
1. `trace_id` 生成与透传（网关 → 六服务）
2. `sys_log` 增 trace_id / duration / 服务名等
3. 新增 `sys_api_error_log`
4. 慢接口统计
5. 前后端错误关联

### 3.3 不做
| 项 | 原因 |
| --- | --- |
| 引入 Elasticsearch | 先把 trace_id 与 duration 落库，MySQL 足够；量级成瓶颈再评估 |
| 引入 SkyWalking / Zipkin 全链路追踪 | 成本高；本期只做 trace_id 串联日志（轻量方案） |
| 文件在线预览 | INT-05（批次 H） |
| 文件版本管理 | 无需求 |
| CDN 加速 | 内网系统无需求 |

## 4. 功能需求（SYS-04 文件存储）

### FR-1 存储配置
- FR-1.1 新增 `sys_file_config`：
  | 字段 | 说明 |
  | --- | --- |
  | config_id | PK |
  | tenant_id | 租户（0 表示平台级） |
  | config_code / config_name | 编码与名称 |
  | storage_type | LOCAL / MINIO / S3 / OSS / COS |
  | master_flag | 是否主用 |
  | endpoint | 端点 |
  | region | 区域 |
  | bucket | 桶名 |
  | access_key | AK |
  | secret_key_encrypted | **SK 加密存储** |
  | base_path | 基础路径 |
  | domain | 访问域名 |
  | max_file_size | 单文件上限 |
  | allowed_extensions | 允许扩展名 |
  | signed_url_expire_seconds | 签名 URL 有效期（默认 300） |
  | status | ENABLED / DISABLED |
  | remark | 备注 |
  | + 审计列 | |
- FR-1.2 同一租户仅一条 `master_flag=1`
- FR-1.3 配置连通性测试接口（上传一个测试文件并删除）
- FR-1.4 **SK 加密存储，接口返回脱敏**（只回显后 4 位），日志不打印

### FR-2 `sys_file` 改造
- FR-2.1 增字段：
  ```
  config_id       所用存储配置
  file_hash       SHA256（去重用）
  bucket          桶名
  object_key      对象键（存储路径）
  access_type     PRIVATE 私有 / PUBLIC 公开
  biz_type        业务类型（CONTRACT/SALARY/QUALIFICATION/AVATAR/...）
  biz_id          业务 ID
  ref_count       引用计数（去重后多处引用同一文件）
  ```
- FR-2.2 `url` 字段语义改为：`PUBLIC` 时存直链，`PRIVATE` 时**不存 URL**（每次访问动态生成签名 URL）

### FR-3 私有文件签名 URL（**核心安全修复**）
- FR-3.1 文件访问统一走 `GET /system/file/{fileId}/url`：
  1. 校验当前用户对该文件的访问权限（按 `biz_type` + `biz_id` 查业务权限）
  2. 生成有效期内的签名 URL（对象存储原生签名，或本地存储的临时 token）
  3. 返回签名 URL
- FR-3.2 `PUBLIC` 类文件（如头像、公开公告附件）直接返回直链
- FR-3.3 权限校验规则由各业务注册（`FileAccessChecker` 接口，按 `biz_type` 分派）
- FR-3.4 本地存储的签名实现：生成短期 token 存 Redis，访问 `/system/file/download?token=xxx` 时校验
- FR-3.5 **未注册权限校验器的 `biz_type` 默认拒绝**（安全默认拒绝，而非默认允许）
- FR-3.6 签名 URL 不记入日志（避免日志泄露访问凭据）

### FR-4 文件去重
- FR-4.1 上传时计算 SHA256，同租户内已存在相同 hash 且同 config 的文件时复用（不重复存储），`ref_count+1`
- FR-4.2 删除文件时 `ref_count-1`，为 0 时才真正删除存储对象
- FR-4.3 去重仅在同租户内（跨租户不共享，避免数据隔离问题）

### FR-5 租户配额
- FR-5.1 上传前校验 `sys_tenant.storage_limit`（字段已有）
- FR-5.2 上传成功后回写 `storage_used`
- FR-5.3 超配额时拒绝上传并提示
- FR-5.4 配额统计以去重后的实际存储量计

## 5. 功能需求（SYS-05 可观测）

### FR-6 trace_id 生成与透传
- FR-6.1 网关（`cloudflow-gateway`）为每个请求生成 `trace_id`（UUID 或雪花 ID），放入请求头 `X-Trace-Id`
- FR-6.2 若请求已带 `X-Trace-Id`（前端传入或上游服务传入），沿用不重新生成
- FR-6.3 各服务通过拦截器读取并放入 MDC（日志上下文），日志格式加入 trace_id
- FR-6.4 服务间调用（Feign）自动透传 `X-Trace-Id`
- FR-6.5 异步线程与定时任务需手动传递 MDC（线程池装饰器）
- FR-6.6 响应头返回 `X-Trace-Id`，便于前端与用户报错时提供

### FR-7 `sys_log` 增强
- FR-7.1 增字段：`trace_id`、`service_name`、`request_method`、`request_url`、`duration_ms`、`result_code`、`user_agent`、`client_ip`
- FR-7.2 慢接口标记：`duration_ms` 超阈值（可配，默认 1000ms）时标记 `slow_flag`

### FR-8 错误日志独立
- FR-8.1 新增 `sys_api_error_log`：
  ```
  error_id, tenant_id, trace_id, service_name
  user_id, user_name
  request_method, request_url, request_params(TEXT)
  exception_class, exception_message, exception_stack(TEXT)
  client_ip, user_agent
  occur_time
  process_status   TODO 待处理 / PROCESSING 处理中 / DONE 已处理 / IGNORED 已忽略
  process_by / process_time / process_remark
  + 审计列
  ```
- FR-8.2 全局异常处理器统一写入
- FR-8.3 错误日志保留期长于访问日志（默认 180 天 vs 30 天）
- FR-8.4 错误可标记处理状态（便于运维跟踪）
- FR-8.5 **请求参数需脱敏**（密码、token、身份证、银行卡等字段不落库）

### FR-9 前后端错误关联
- FR-9.1 前端 `errorReporter.ts` 上报时携带最近一次请求的 `trace_id`
- FR-9.2 `oa_frontend_error_log` 增 `trace_id` 字段
- FR-9.3 按 trace_id 可查询到该请求的完整链路：前端错误 + 网关日志 + 各服务日志 + 异常栈

### FR-10 查询与分析
- FR-10.1 按 trace_id 查全链路日志：`GET /system/log/trace/{traceId}`（聚合 `sys_log` + `sys_api_error_log` + `oa_frontend_error_log`）
- FR-10.2 慢接口 TOP 排行（按平均耗时、按调用量）
- FR-10.3 错误日志列表（按服务/异常类型/时间/处理状态筛选）
- FR-10.4 错误趋势图（用批次 A LC-05）

## 6. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `sys_file_config`、`sys_api_error_log` |
| 改造 | `sys_file`（增 7 字段） |
| 改造 | `sys_log`（增 8 字段） |
| 改造 | `oa_frontend_error_log`（增 `trace_id`） |
| 复用 | `sys_audit_archive_policy`（归档） |

`DB/01.cloudflow-common.sql`：+2 表

## 7. 非功能需求

| 项 | 要求 |
| --- | --- |
| **SK 加密** | 存储密钥加密存储、接口脱敏、日志不打印 |
| **默认拒绝** | 未注册权限校验器的文件类型默认拒绝访问（FR-3.5） |
| 签名 URL 有效期 | 默认 300 秒，最长 3600 秒 |
| 签名不入日志 | FR-3.6 |
| 参数脱敏 | 错误日志的请求参数需脱敏（FR-8.5） |
| trace_id 性能 | 拦截器开销 < 1ms；MDC 不泄露到其他请求（线程池复用需清理） |
| 日志量 | `sys_log` 高写入，需归档（复用现有策略，默认保留 30 天）；`sys_api_error_log` 保留 180 天 |
| 文件去重安全 | 仅同租户内去重（FR-4.3），防跨租户数据泄露 |
| 存储切换 | 切换主存储不影响已有文件访问（按 `config_id` 定位原存储） |
| 上传安全 | 类型按内容判断、大小限制、文件名重命名 |

## 8. 验收标准

### SYS-04
| # | 验收项 |
| --- | --- |
| AC-1 | 三种存储后端（本地 / MinIO / OSS）均可配置并上传成功 |
| AC-2 | 配置连通性测试可用 |
| AC-3 | SK 在数据库中为加密值；接口返回脱敏；日志无明文 |
| AC-4 | **私有文件必须通过签名 URL 访问；直接拼接对象存储 URL 无法访问** |
| AC-5 | 签名 URL 过期后失效 |
| AC-6 | **无权限用户申请签名 URL 被拒绝**（如普通员工申请他人工资条 PDF） |
| AC-7 | 未注册权限校验器的 `biz_type` 默认拒绝 |
| AC-8 | 签名 URL 不出现在应用日志中 |
| AC-9 | 相同文件重复上传时复用存储，`ref_count` 正确增减 |
| AC-10 | `ref_count=0` 时才删除存储对象 |
| AC-11 | 跨租户相同文件不去重 |
| AC-12 | 超租户配额时拒绝上传；`storage_used` 正确回写 |
| AC-13 | 切换主存储后，旧文件仍可正常访问 |

### SYS-05
| # | 验收项 |
| --- | --- |
| AC-14 | 网关生成 trace_id，六个服务日志均含同一 trace_id |
| AC-15 | Feign 服务间调用透传 trace_id |
| AC-16 | 异步线程与定时任务的日志也含 trace_id |
| AC-17 | 响应头返回 `X-Trace-Id` |
| AC-18 | 线程池复用时 MDC 不串（A 请求的 trace_id 不出现在 B 请求日志） |
| AC-19 | `sys_log` 记录 duration；超阈值标记 slow_flag |
| AC-20 | 异常统一写入 `sys_api_error_log`，含完整异常栈 |
| AC-21 | **错误日志的请求参数中密码、token 等敏感字段已脱敏** |
| AC-22 | 前端错误上报携带 trace_id，可与后端日志关联 |
| AC-23 | 按 trace_id 查询返回完整链路（前端 + 网关 + 各服务） |
| AC-24 | 慢接口 TOP 排行与错误趋势报表正确 |
| AC-25 | 归档策略生效（访问日志 30 天、错误日志 180 天） |

## 9. 依赖与风险

### 9.1 依赖
| 依赖 | 说明 |
| --- | --- |
| 现有 `cloudflow-gateway` | trace_id 生成点 |
| 现有 `sys_audit_archive_policy` | 归档机制复用 |
| 现有 `sys_tenant.storage_limit/storage_used` | 配额字段已有 |
| Redis（已有） | 本地存储签名 token |
| **批次 A SYS-07** | 两张表 CRUD |
| **批次 A LC-05** | 报表图表 |
| 各业务 PRD | 需注册 `FileAccessChecker`（F2/F4/D3/D4 等） |

### 9.2 风险

| 风险 | 应对 |
| --- | --- |
| **签名 URL 改造需各业务注册权限校验器，遗漏则默认拒绝导致功能不可用** | FR-3.5 的"默认拒绝"是安全正确的选择，但会导致未注册的业务附件访问失败。**需在改造时梳理全部现有附件使用点清单**（合同/证照/知识库/报销/简历/头像等），逐个注册校验器。这是本 PRD 最大工作量与风险点 |
| 存储切换后旧文件访问失败 | 按 `config_id` 定位原存储（AC-13） |
| trace_id 在异步与线程池场景丢失或串号 | AC-16/18 专项验证；用 `TaskDecorator` 传递 MDC 并在任务结束时清理 |
| 错误日志含敏感参数泄露 | AC-21 脱敏；脱敏字段名白名单需覆盖 password/token/secret/idCard/bankAccount 等 |
| 日志量增大影响数据库性能 | 归档策略（AC-25）；`sys_log` 可考虑异步批量写入 |
| 文件去重的 hash 计算增加上传耗时 | 流式计算 SHA256，与上传同时进行 |
| 现有 `sys_file.url` 语义变更影响前端 | 项目未上线；前端统一改为调 `/system/file/{id}/url` 获取访问地址 |

## 10. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | `sys_file_config` + 三种存储适配 + 连通性测试 + SK 加密 | AC-1/2/3 |
| M2 | `sys_file` 改造 + **签名 URL + 权限校验器框架** | AC-4/5/7/8 |
| M3 | **梳理并注册全部现有附件使用点的权限校验器** | AC-6 |
| M4 | 文件去重 + 配额 + 存储切换兼容 | AC-9~AC-13 |
| M5 | trace_id 生成透传（含 Feign / 异步 / 定时任务） | AC-14~AC-18 |
| M6 | `sys_log` 增强 + `sys_api_error_log` + 参数脱敏 | AC-19/20/21 |
| M7 | 前后端错误关联 + 全链路查询 + 报表 + 归档 | AC-22~AC-25 |

## 11. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 实际用哪个存储后端 | 建议本地开发用 LOCAL，生产用 MinIO（可自托管，S3 兼容）。适配层做好后切换成本低 |
| 2 | 签名 URL 有效期 | 建议 300 秒（5 分钟）。足够完成下载，又不会长期有效被转发滥用 |
| 3 | 是否引入 SkyWalking 等 APM | 建议本期不引入。trace_id 串联日志已能解决 80% 排查需求；引入 APM 需额外部署与运维成本。若后续性能问题突出再评估 |
| 4 | `sys_log` 是否异步写入 | 建议异步（用现有线程池 + 批量插入），避免日志写入影响接口耗时。但需保证服务关闭时刷盘 |
| 5 | 现有附件使用点清单由谁梳理 | 建议开发在 M3 阶段全仓搜 `sys_file` / `attachment_url` 引用点产出清单并逐个注册。这是安全改造的关键步骤，不能跳过 |
