# 系统治理层对标调研

> 本文档独立可用。调研时间 2026-08-31，对标源已克隆源码并读取建表 SQL 字段定义。

## 一、许可证规则

| 分类 | 项目 | 使用方式 |
| --- | --- | --- |
| 可读可借鉴实现 | ruoyi-vue-pro(MIT, 39.1k)、yudao-cloud(MIT, 19.5k)、RuoYi-Vue-Plus(MIT, 2.6k)、JeecgBoot(Apache-2.0, 47.6k)、jeesite5(Apache-2.0)、keycloak(Apache-2.0, 36.5k)、PowerJob(Apache-2.0)、javers(Apache-2.0)、mybatis-plus(Apache-2.0) | 可参照实现思路与代码结构 |
| 仅借鉴业务设计 | xxl-job(GPL-3.0)、zitadel(AGPL-3.0) | 只提取设计，禁止复制代码 |
| 需逐项复核 | casbin(Apache-2.0，仓库已改名需确认新地址) | 使用前确认 |

**ruoyi-vue-pro / RuoYi-Vue-Plus 是 MIT 且技术栈最接近我们（Spring Boot 3 + MyBatis-Plus + Sa-Token），本模块可直接参照其代码实现。**

## 二、我们的现状基线（实测）

- `cloudflow-auth`：Controller 24 个，HTTP 端点 183 个
- 结构表 **32 张**（`DB/01.cloudflow-common.sql`）
- 对标 ruoyi-vue-pro：system + infra 共 **44 张**（不含 demo 表）

已有 32 张表：
- 组织身份：`sys_tenant`(20列，含 user_limit/storage_limit/storage_used/allowed_email_domains/domain)、`sys_dept`、`sys_user`(21列，含 pwd_reset_required)、`sys_user_login_history`、`sys_user_totp`、`sys_role`(16列，含 data_scope/ds_type/ds_scope)、`sys_menu`、`sys_user_role`、`sys_role_menu`、`sys_role_mutex`（角色互斥，参考项目没有）、`sys_post`、`sys_user_post`
- 日志审计：`sys_log`、`sys_audit_log`、`sys_audit_archive_policy`（审计归档策略，参考项目没有）
- 字典：`sys_dict_type`、`sys_dict_data`、`sys_dict_version`、`sys_dict_change_approval`（字典变更审批，参考项目没有）、`sys_dict_orphan_alert`（孤儿字典告警，参考项目没有）
- 配置规则：`sys_config`、`sys_business_rule` + `_version` + `_hit_record`（规则中心带版本与命中记录，参考项目没有）
- 安全：`sys_api_ratelimit_rule`(21列)、`sys_ip_acl`、`sys_user_blacklist`
- 合规：`sys_legal_release`、`sys_legal_document`、`sys_legal_consent`（法律协议版本与用户同意留痕，参考项目没有）
- 可靠性：`outbox_event`(15列，含 locked_by/locked_until/next_retry_at，事务消息表)
- 文件：`sys_file`(12列)

**结论：我们在"治理深度"上明显领先参考项目（规则中心带版本回滚、字典变更审批、审计归档策略、法律协议留痕、角色互斥、事务发件箱都是参考项目没有的）。缺口集中在"基础设施能力"——OAuth2/SSO、消息通道、任务调度、多存储配置这些"标配但我们没做"的部分。**

## 三、功能深度差距矩阵

深度等级：`0`=无 / `1`=有雏形 / `2`=可用 / `3`=完整

| 能力项 | 我们 | ruoyi-vue-pro | keycloak | 差距判定 |
| --- | --- | --- | --- | --- |
| OAuth2 授权服务端 | **0** | 3（oauth2_client 21字段 + access_token + refresh_token + code + approve 共 5 表） | 3 | **重点缺口** |
| 第三方/社交登录 | **0** | 3（social_client + social_user + social_user_bind） | 3 | **重点缺口** |
| SSO 单点登录 | **0** | 2 | 3 | 缺口 |
| 短信通道与模板 | **0** | 3（sms_channel + sms_template + sms_log + sms_code 共 4 表） | 0 | **重点缺口** |
| 邮件账号与模板 | **0** | 3（mail_account + mail_template + mail_log） | 0 | **重点缺口** |
| 站内通知模板 | 1（OA 有 `oa_announcement`/`SysNoticeController`） | 3（notify_template + notify_message） | 0 | 缺口 |
| 定时任务调度 | **0**（应为代码内 @Scheduled） | 2（infra_job + infra_job_log，基于 Quartz） | 0 | **重点缺口** |
| 多数据源配置 | 1（依赖 dynamic-datasource 但无配置表） | 2（infra_data_source_config） | 0 | 小缺口 |
| 文件存储多后端配置 | 1（`sys_file.storage_type` 单字段） | 3（file_config + file_content，支持本地/S3/OSS/DB 且可设 master） | 缺口 |
| 代码生成器 | **0** | 3（codegen_table + codegen_column） | 0 | 缺口 |
| API 访问日志 | 1（`sys_log`） | 3（api_access_log 25字段含 trace_id/duration/result_code） | 缺口 |
| API 错误日志 | 1（混在 `sys_log`） | 2（api_error_log 独立表） | 缺口 |
| 租户套餐 | **0**（`sys_tenant` 有 user_limit/storage_limit 但无套餐模板） | 2（tenant_package：菜单集打包） | 缺口 |
| 数据权限 | **2**（`sys_role.data_scope/ds_type/ds_scope`） | 2 | 相当 |
| 多租户隔离 | **2** | 2 | 相当 |
| 规则中心（版本/回滚/命中） | **3（我们领先）** | 0 | 我们领先 |
| 字典变更审批 | **3（我们领先）** | 0 | 我们领先 |
| 审计归档策略 | **2（我们领先）** | 0 | 我们领先 |
| 法律协议版本与同意留痕 | **2（我们领先）** | 0 | 我们领先 |
| 角色互斥 | **2（我们领先）** | 0 | 我们领先 |
| 事务发件箱（outbox） | **2（我们领先）** | 0 | 我们领先 |
| TOTP 双因素 | **2（我们有）** | 0 | 我们领先 |
| API 限流规则表 | **2（我们领先，21字段可配）** | 0（靠网关配置） | 我们领先 |
| IP 黑白名单 | **2（我们有）** | 0 | 我们领先 |

## 四、可移植条目

### [SYS-01] 统一消息通道（短信 / 邮件 / 站内 / 企业 IM）
- **参考来源**：`YunaiV/ruoyi-vue-pro`（MIT，可直接参照代码）→ `sql/mysql/ruoyi-vue-pro.sql` 中 `system_sms_channel`(13字段)、`system_sms_template`、`system_sms_log`、`system_sms_code`、`system_mail_account`(13字段)、`system_mail_template`、`system_mail_log`、`system_notify_template`(14字段)、`system_notify_message`；`ZhongFuCheng3y/austin`（Apache-2.0，消息推送平台完整实现，支持邮件/短信/微信服务号/小程序/企微/钉钉）
- **参考实现怎么做的**：
  - `system_sms_channel`：`signature, code, status, api_key, api_secret, callback_url` —— 通道是数据（可配多家短信商），不是硬编码
  - `system_mail_account`：`mail, username, password, host, port, ssl_enable, starttls_enable`
  - `system_notify_template`：`name, code, nickname, content, type, params(参数占位符声明), status`
  - 三类通道各自有 `_log` 表记录发送结果，`sms_code` 单独管验证码（含过期与重发限制）
  - austin 的做法：统一消息模型 + 渠道适配层 + 去重/限流/夜间免打扰
- **我们现状**：**完全没有消息通道**。`SecurityChangeNoticeService`（当前工作区有改动）等安全通知、`CrmNotificationController` 的 5 个 dispatch 接口、`wf_notification_log`/`wf_notification_config`（工作流通知）、`hr_self_service_message`、`oa_announcement` —— 各模块**各自实现各自的通知**，没有统一底座。CRM 营销（CRM-02）与 RFQ 邀请（OA-03）都卡在这里。
- **落地改动**：
  - 建议放在 `cloudflow-auth` 或新建 `cloudflow-common-message` 公共模块（已有 16 个 `cloudflow-common-*` 子模块，加一个符合现有结构）
  - 新增 `sys_message_channel`：`channel_id, channel_type(SMS/EMAIL/INTERNAL/WECOM/DINGTALK/FEISHU/WEBHOOK), channel_code, channel_name, provider, signature, api_key, api_secret_encrypted, endpoint, callback_url, status, priority, rate_limit_per_minute` —— **密钥必须加密存储，不落明文**
  - 新增 `sys_message_template`：`template_id, template_code, template_name, channel_type, title_template, content_template, params_declare(JSON), status, version`
  - 新增 `sys_message_record`：`record_id, template_code, channel_type, channel_id, receiver_type(USER/PHONE/EMAIL/GROUP), receiver_id, receiver_addr, title, content, biz_type, biz_id, send_status(PENDING/SENDING/SUCCESS/FAILED/CANCELLED), retry_count, error_msg, send_time, callback_status, trace_id`
  - 新增 `sys_message_subscribe`：用户级订阅与免打扰（`user_id, message_type, channel_type, enabled, quiet_start, quiet_end`）
  - 新增 `sys_sms_code`：`phone, code_hash, biz_scene, expire_time, used_flag, send_ip, retry_count`（**验证码存哈希不存明文**）
  - 发送走 `outbox_event`（现有事务发件箱表，天然适配"业务提交后可靠发消息"）
  - 各模块改为调统一发送接口；`wf_notification_config`、`CrmNotificationController` 逐步收口
  - API：`/system/message/channel`、`/system/message/template`、`/system/message/send`、`/system/message/record`
- **工作量**：L（5 表 + 渠道适配层 + 各模块收口）
- **优先级**：P0 —— **这是跨模块阻塞点**：CRM-02 营销、OA-03 询价邀请、HR 各类提醒、工作流通知全部依赖它。当前"每个模块自己发通知"是最大的架构债

### [SYS-02] 定时任务调度平台化
- **参考来源**：`YunaiV/ruoyi-vue-pro`（MIT）→ `infra_job`(14字段：`name, status, handler_name, handler_param, cron_expression, retry_count, retry_interval, monitor_timeout`) + `infra_job_log`；`PowerJob/PowerJob`（Apache-2.0，7.8k，分布式计算能力）；`xuxueli/xxl-job`（GPL-3.0，仅借鉴设计）
- **参考实现怎么做的**：任务是**数据不是代码** —— cron 表达式、处理器名、参数、重试次数、重试间隔、超时监控都可在界面改；每次执行落 `job_log`（含开始/结束时间、耗时、结果、异常栈）。PowerJob 额外支持 MapReduce 式分片与工作流编排。
- **我们现状**：无任务表。从代码结构看应是 `@Scheduled` 硬编码。当前已有大量需要定时的场景：工作流超时扫描（`wf_timeout_alert`）、印章证照到期提醒（`oa_seal_expiry_reminder_log`/`oa_license_expiry_reminder_log`）、客户公海自动释放（`POST /customer-pool/auto-release`）、`outbox_event` 重试、审计归档（`sys_audit_archive_policy`）、DLQ 重放。**这些任务改一次周期就要重新发布，且执行历史无处查。**
- **落地改动**：
  - 新增 `sys_job`：`job_id, job_name, job_group, handler_name, handler_param, cron_expression, status, concurrent_flag, misfire_strategy(IGNORE/FIRE_ONCE/FIRE_ALL), retry_count, retry_interval_seconds, timeout_seconds, alarm_on_fail_flag, alarm_receiver, last_fire_time, next_fire_time, remark`
  - 新增 `sys_job_log`：`log_id, job_id, job_name, execute_no, start_time, end_time, duration_ms, execute_status(RUNNING/SUCCESS/FAILED/TIMEOUT), result_msg, exception_stack, executor_ip, trigger_type(CRON/MANUAL/RETRY)`
  - **分布式重复执行是关键问题**：现有 Redisson(3.27.0) 已在依赖里，用分布式锁保证多实例只执行一次；或引入 PowerJob（Apache-2.0 可用）做独立调度中心
  - 现有 `@Scheduled` 任务逐个迁移为 handler 注册制
  - API：`/system/job` CRUD + `/system/job/{id}/trigger`（手动触发）+ `/system/job/{id}/logs`
- **工作量**：M（2 表 + 调度框架接入 + 现有任务迁移）
- **优先级**：P0 —— 定时任务已在大量使用但完全不可运维，属于生产可靠性缺口

### [SYS-03] OAuth2 授权服务端与第三方登录
- **参考来源**：`YunaiV/ruoyi-vue-pro`（MIT）→ `system_oauth2_client`(21字段：`client_id, secret, access_token_validity_seconds, refresh_token_validity_seconds, redirect_uris, authorized_grant_types, scopes, auto_approve_scopes, authorities, resource_ids`) + `system_oauth2_access_token/refresh_token/code/approve`；`system_social_client` + `system_social_user`(16字段：`type, openid, token, raw_token_info, nickname, avatar, raw_user_info, code, state`) + `system_social_user_bind`；`keycloak/keycloak`（Apache-2.0，完整 IAM 实现可参照）
- **参考实现怎么做的**：OAuth2 客户端是数据（可注册多个接入方，各自 scope 与授权类型）；社交登录把"第三方身份"与"系统用户"解耦成三张表（客户端配置 / 第三方身份 / 绑定关系），支持一个用户绑多个第三方账号。
- **我们现状**：Sa-Token(1.45.0) + `TokenService` + 网关 `AuthFilter`，只支持账号密码登录 + TOTP 双因素（`sys_user_totp`）。无法：① 让第三方系统通过 OAuth2 接入我们；② 用企微/钉钉/飞书扫码登录（这是企业 OA 的高频诉求）。
- **落地改动**：
  - 新增 `sys_oauth2_client`：`client_id, client_secret_encrypted, client_name, status, access_token_validity_seconds, refresh_token_validity_seconds, redirect_uris(JSON), grant_types(JSON), scopes(JSON), auto_approve_scopes(JSON), authorities(JSON), resource_ids(JSON)`
  - 新增 `sys_oauth2_access_token` + `sys_oauth2_refresh_token` + `sys_oauth2_code` + `sys_oauth2_approve`（**token 存哈希，不存明文**）
  - 新增 `sys_social_client`：`social_type(WECOM/DINGTALK/FEISHU/WECHAT_MP/WECHAT_OPEN), client_key, client_secret_encrypted, agent_id, status`
  - 新增 `sys_social_user`：`social_type, openid, unionid, nickname, avatar, raw_user_info, access_token_encrypted, expire_time`
  - 新增 `sys_social_user_bind`：`user_id, social_type, social_user_id, bind_time`
  - **不重写认证框架**：Sa-Token 保留为会话底座，OAuth2 作为额外的授权入口，token 最终仍换成 Sa-Token 会话（与既有 PLAN.md 的"不引入第二套权限平台"约束一致）
  - 扫码登录依赖企业 IM SDK（见 07 文档 INT-02）
- **工作量**：L（8 表 + OAuth2 授权码流程 + 扫码登录）
- **优先级**：P1 —— 企微/钉钉扫码登录是企业落地的高频诉求；OAuth2 服务端优先级可低于社交登录

### [SYS-04] 文件存储多后端与文件配置
- **参考来源**：`YunaiV/ruoyi-vue-pro`（MIT）→ `infra_file_config`(11字段：`name, storage, remark, master, config(JSON)`) + `infra_file` + `infra_file_content`
- **参考实现怎么做的**：存储后端是配置记录（本地/S3/OSS/七牛/DB），`master` 标记当前主用；`config` JSON 存各后端差异化参数；`infra_file_content` 支持把文件直接存库（小文件或无对象存储环境）。切换存储不改代码。
- **我们现状**：`sys_file`(12列) 有 `storage_type` 字段但没有存储配置表，配置应在 yml 里。换存储或多租户用不同存储桶都要改配置发布。
- **落地改动**：
  - 新增 `sys_file_config`：`config_id, config_name, storage_type(LOCAL/MINIO/S3/OSS/COS), master_flag, config_json(端点/桶名/AK-SK 加密), max_file_size, allowed_extensions, status` —— **AK/SK 加密存储**
  - `sys_file` 增 `config_id, file_hash(SHA256 去重), bucket, object_key, access_type(PRIVATE/PUBLIC)`
  - 文件访问改为签名 URL（当前 `url` 字段若是直链，私有文件有越权风险，**这是一个安全改进点**）
  - 多租户可按 `sys_tenant` 指定不同 config（配合已有 `storage_limit`/`storage_used` 做配额）
- **工作量**：M
- **优先级**：P1 —— 顺带修掉私有文件直链的潜在越权面

### [SYS-05] API 访问日志与错误日志分离
- **参考来源**：`YunaiV/ruoyi-vue-pro`（MIT）→ `infra_api_access_log`(25字段：`trace_id, user_id, user_type, application_name, request_method, request_url, request_params, response_body, user_ip, user_agent, operate_module, operate_name, operate_type, begin_time, end_time, duration, result_code, result_msg`) + `infra_api_error_log`
- **参考实现怎么做的**：访问日志与错误日志分表（错误日志量小但要长期保留、访问日志量大需定期清理），都带 `trace_id` 串联全链路，`duration` 直接落库便于慢接口分析。
- **我们现状**：`sys_log` + `sys_audit_log` + `sys_login_log`（Controller 层有 `SysLogController`/`SysAuditLogController`/`SysLoginLogController`）。已有 `sys_audit_archive_policy` 做归档（这点领先）。缺：无 `trace_id` 全链路串联、无 duration 慢接口分析、错误日志未独立。微服务架构下没有 trace_id 是排查瓶颈。
- **落地改动**：
  - `sys_log` 增：`trace_id, service_name, request_method, request_url, duration_ms, result_code, user_agent, client_ip`
  - 新增 `sys_api_error_log`：`trace_id, service_name, user_id, request_url, request_params, exception_class, exception_message, exception_stack, occur_time, process_status(TODO/PROCESSING/DONE/IGNORED), process_by, process_time`
  - 网关生成 `trace_id` 透传各服务（网关已存在，改造成本低）
  - 与现有 `oa_frontend_error_log`（前端错误上报）打通 trace_id，前后端错误可串联
  - 归档复用现有 `sys_audit_archive_policy` 机制
- **工作量**：M
- **优先级**：P1

### [SYS-06] 租户套餐
- **参考来源**：`YunaiV/ruoyi-vue-pro`（MIT）→ `system_tenant_package`(10字段：`name, status, remark, menu_ids`)
- **参考实现怎么做的**：套餐打包一组菜单 ID，新建租户选套餐即自动获得对应功能集；改套餐可批量影响所有该套餐租户。
- **我们现状**：`sys_tenant`(20列) 已有 `user_limit, storage_limit, storage_used, expire_time, allowed_email_domains, domain`（配额管理比参考项目细），但**功能集是逐租户配菜单**，没有套餐模板。SaaS 化时新建租户要手工授权全部菜单。
- **落地改动**：
  - 新增 `sys_tenant_package`：`package_id, package_name, package_code, menu_ids(JSON), max_users, max_storage_mb, enabled_modules(JSON: WORKFLOW/OA/CRM/HR), status, remark`
  - `sys_tenant` 增 `package_id`
  - 新建租户按套餐初始化菜单授权；套餐变更时批量同步（需谨慎：**批量改租户权限是高影响操作，应走审批或至少二次确认**）
- **工作量**：S
- **优先级**：P2

### [SYS-07] 代码生成器
- **参考来源**：`YunaiV/ruoyi-vue-pro`（MIT）→ `infra_codegen_table` + `infra_codegen_column`；`JeecgBoot`（Apache-2.0）；`elunez/eladmin`（Apache-2.0）
- **参考实现怎么做的**：读数据库表元信息落库，配置每列的显示名/查询方式/表单类型，生成 Entity/Mapper/Service/Controller/前端页面全套。
- **我们现状**：无。当前 121 个 Controller、371+ 实体应都是手写。后续按本系列文档新增大量表（预估 50+ 张）时，手写 CRUD 是重复劳动。
- **落地改动**（**已确认范围：只做后端模板，前端页面继续手写**）：
  - 新增 `sys_codegen_table`：`table_id, table_name, table_comment, module_name(system/oa/crm/hr/workflow), business_name, class_name, function_name, author, tpl_category(CRUD/TREE/SUB), parent_menu_id, tenant_field_flag, logic_delete_flag, version_field_flag, remark`
  - 新增 `sys_codegen_column`：`table_id, column_name, column_comment, column_type, java_type, java_field, pk_flag, increment_flag, required_flag, insert_flag, edit_flag, list_flag, query_flag, query_type(EQ/NE/GT/LT/LIKE/BETWEEN), html_type(input/textarea/select/radio/checkbox/datetime/upload/editor), dict_type, sort_no`
  - **生成物（五件套）**：Entity / Mapper 接口 / **Mapper XML** / Service + ServiceImpl / Controller
  - **模板必须内置的既有规范**（这是本条最主要的价值 —— 保证 50+ 张新表规范一致，而非只省打字）：
    - MyBatis-Plus + **XML mapper，禁止 Java 拼接 SQL**（项目硬约束）
    - `@SaCheckPermission` 权限码固定为 `{module}:{resource}:{action}`，模块前缀只允许 `system`/`oa`/`crm`/`hr`/`workflow` 五类（与 PLAN.md 完成态一致）
    - 标准审计列：`deleted` / `version` / `create_by` / `create_time` / `update_by` / `update_time`
    - 租户字段 `tenant_id` 与多租户隔离
    - 内部接口走 `@Inner`，不产出"仅 `@SaCheckLogin` 的外部业务接口"（PLAN.md 的构建期扫描规则会阻断这类代码）
    - `dict_type` 字段对接现有 `sys_dict_type`
  - **不做前端模板**：参考项目（ruoyi-vue-pro / JeecgBoot）均为 Vue 模板，我们是 React 19 + TanStack Query + Zustand + 约 70 个自研公共组件，生成的页面风格难以贴合现有体系，且各模块页面差异大；前端继续手写
  - 可另生成建表 SQL 骨架与菜单/权限初始化 SQL 片段，减少 `06.cloudflow-business-seed.sql` 的手工维护
- **工作量**：M（缩到只做后端模板后，从 L 降为 M）
- **优先级**：**批次 A（已确认从 P2 提前）** —— 后续 50+ 张新表的后端 CRUD 由它产出，除省重复劳动外，更重要的是把权限码命名、审计列、租户字段、XML mapper 这些规范固化进模板，避免 50 张表手写出 50 种写法

### [SYS-08] 多数据源配置表
- **参考来源**：`YunaiV/ruoyi-vue-pro`（MIT）→ `infra_data_source_config`(10字段)；`baomidou/dynamic-datasource`（Apache-2.0，我们已在用 4.3.1）
- **参考实现怎么做的**：数据源作为记录管理，配合 dynamic-datasource 动态注册。
- **我们现状**：已依赖 dynamic-datasource 4.3.1，但配置在 Nacos yml。
- **落地改动**：新增 `sys_data_source_config`（`name, url, username, password_encrypted, status`）；**密码加密存储**；主要收益是运维可视化，优先级不高
- **工作量**：S
- **优先级**：P2

## 五、不建议移植

| 项 | 原因 |
| --- | --- |
| 替换 Sa-Token 为 keycloak / zitadel | PLAN.md 已明确约束"不引入第二套权限平台"；keycloak 的价值是参照其 OAuth2/OIDC 实现细节，不是替换我们的认证底座 |
| casbin 策略引擎 | 我们已有 `sys_role.data_scope/ds_type/ds_scope` 数据权限 + `@SaCheckPermission` 权限码体系 + `sys_business_rule` 规则中心；再加一套策略模型是重复建设 |
| xxl-job 代码 | GPL-3.0；且 SYS-02 优先用 Redisson 分布式锁 + 自建任务表，比引入独立调度中心轻 |
| JeecgBoot 的 AI 低代码 / 在线表单建模 | 那是"用配置生成系统"的产品形态，与我们已成型的 121 Controller 固定表结构架构冲突；表单能力见 06 文档 |
| ruoyi-vue-pro 的商城/支付/会员/IoT/MES 模块 | 与企业办公无关 |
| javers 对象审计框架 | 我们已依赖 javers 7.6.2 且有 `sys_audit_log` + `/oa/timeline/{id}/diff` 快照差异，能力已具备 |
| 引入 Elasticsearch 做日志检索 | SYS-05 先把 trace_id 与 duration 落库，MySQL 足够；日志量真正成为瓶颈再评估 |

## 六、建议批次

**批次 A（已确认为起始批次）**
1. SYS-07 代码生成器（只做后端模板）—— **本批先行**，后续新表由它产出且规范固化
2. SYS-01 统一消息通道 —— **CRM-02 营销、OA-03 询价、HR 提醒、工作流通知全部依赖，是本轮最关键的架构补齐**
3. SYS-02 定时任务平台化 —— 已有大量定时场景不可运维

**P1（基础设施与可观测）**
3. SYS-04 文件存储多后端（顺带修私有文件直链风险）
4. SYS-05 trace_id 全链路与错误日志分离
5. SYS-03 社交登录（企微/钉钉扫码）——OAuth2 服务端可拆到 P2

**P2（运维便利）**
6. SYS-06 租户套餐、SYS-08 多数据源配置表
7. SYS-03 的 OAuth2 授权服务端部分

依赖关系：**SYS-01 是全局前置**（CRM-02 / OA-03 / 各模块通知）；SYS-02 承接现有各模块定时逻辑；SYS-03 社交登录依赖 07 文档的企业 IM SDK。

## 七、安全注意事项（本模块特有）

本模块多个条目涉及凭据与外部暴露面，落地时必须遵守：
- 消息通道的 `api_secret`、OAuth2 的 `client_secret`、社交登录的 `client_secret`、存储的 AK/SK、数据源密码：**一律加密存储，不落明文，日志不打印**
- OAuth2 access/refresh token、短信验证码：**存哈希不存明文**
- SYS-04 私有文件改签名 URL 访问，避免直链越权
- SYS-03 新增 OAuth2 授权端点属于新增对外暴露面，上线前需限流（复用 `sys_api_ratelimit_rule`）与审计
- SYS-06 套餐变更会批量改租户权限，属高影响操作，需二次确认或走审批
