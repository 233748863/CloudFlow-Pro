# PRD：企业 IM 集成（INT-02）

| 项 | 内容 |
| --- | --- |
| 条目编号 | INT-02（含 SYS-03 社交登录部分） |
| 所属批次 | 批次 G（第 4 份） |
| 对标依据 | `docs/benchmark/07-integration-集成与前端体验对标.md`、`docs/benchmark/05-system-系统治理对标.md` |
| 优先级 | P1 —— 体验收益极高 |
| 预估工作量 | L |
| 版本 | v2 · 2026-08-31 |
| ⏸ **排期状态** | **已决定延后**（2026-08-31）。IM 厂商未选定，且需先确认部署环境有公网入口。批次 G 先执行 G1（移动端）、G2（导入框架）、G3（存储与可观测）、G5（打印模板）四项 —— 这四项无外部依赖。→ 见 §0 |

## 0. ⏸ 延后说明与启动条件

本 PRD 内容完整可用，但**排期延后**。启动前需满足三个条件：

| # | 启动条件 | 说明 |
| --- | --- | --- |
| 1 | **确定 IM 厂商** | 企业微信 / 钉钉 / 飞书。PRD §1.3 已明确"先做一家验证抽象层"。建议企业微信（WxJava 为 Apache-2.0、覆盖最全、中文文档最好） |
| 2 | **确认公网入口** | **硬前置条件**：扫码登录与待办回调都需 IM 服务器能访问到我们。纯内网部署时只能做单向推送（组织同步 + 应用消息），扫码登录与 IM 内审批无法实现 |
| 3 | **企业管理员配合** | 需在 IM 后台创建应用、配置回调地址、审核通过 |

**延后的影响**：
- 批次 G 剩余四项（G1/G2/G3/G5）**无外部依赖，可正常执行**
- 批次 H 的 H3 客户门户与本 PRD 共享"公网入口"这一前置条件，同样受影响
- SYS-03 社交登录部分随本 PRD 延后；`sys_im_user_mapping` 与 `sys_social_user_bind` 的收敛问题（§9-3）暂不需决策

## 1. 背景与目标

### 1.1 问题：零 IM 集成，用户必须打开我们的系统才能审批

**实际企业里 90% 的审批发生在 IM 里**（企微/钉钉/飞书）。当前用户要审批必须打开系统 —— 这是企业 OA 落地最大的体验缺口。

现状：**零集成**（无企微/钉钉/飞书任何痕迹）。

### 1.2 目标（四类能力）
1. **组织同步**：拉取 IM 部门树与成员，与 `sys_dept` / `sys_user` 同步
2. **扫码登录 / 免登**：企微内嵌页面静默获取身份
3. **消息推送**：应用消息与模板卡片
4. **待办同步**：审批任务推到 IM 待办，用户在 IM 里直接审批

### 1.3 关键范围决策：**先做一家**

对标文档已明确建议"先做一家（按实际使用的 IM 选），验证抽象层再扩展"。理由：抽象层未验证前同时做三家会导致抽象错误，返工成本高。

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| IM 集成 | **零** |
| 认证 | Sa-Token 1.45.0 + `TokenService` + 网关 `AuthFilter` + `sys_user_totp`（TOTP 双因素） |
| 消息中心 | **批次 A SYS-01 已交付**：`sys_message_channel` 已预留 `WECOM` / `DINGTALK` / `FEISHU` 渠道类型；渠道适配层用策略模式（SYS-01 FR-1.1B），新增渠道只需注册一个 `MessageChannelSender` |
| 任务平台 | 批次 A SYS-02 已交付（组织同步定时任务可用） |
| 组织 | `sys_dept`、`sys_user`、`sys_post`、`sys_role` |
| 待办 | `wf_task`、`/wf/todo` |
| 可用 SDK | WxJava（Apache-2.0，企微+公众号+小程序全覆盖，**可直接作为 Maven 依赖**）、`larksuite/oapi-sdk-java`（Apache-2.0，飞书官方）、钉钉官方 SDK |

## 3. 范围

### 3.1 做
1. 新增 `sys_im_config`（IM 应用配置）
2. 新增 `sys_im_user_mapping`（用户映射）
3. 新增 `sys_im_dept_mapping`（部门映射）
4. IM 适配层抽象（组织/消息/待办/身份四类能力）
5. **先实现一家**（按 §9-1 确定）
6. 组织单向同步（IM → 本地）
7. 扫码登录与内嵌免登
8. 消息推送（注册为 SYS-01 的渠道实现）
9. 待办卡片推送与状态更新
10. 回调验签与安全加固

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 同时做三家 IM | §1.3 已说明，先验证抽象层 |
| 双向组织同步 | 见 §9-2（建议 IM 为主单向，避免覆盖冲突） |
| IM 群机器人 | 优先做应用消息与待办；群机器人可后续低成本补 |
| 在 IM 内完整操作系统（小程序/工作台应用） | 本期只做待办卡片审批 + 内嵌页面免登 |
| OAuth2 授权服务端 | SYS-03 的 OAuth2 服务端部分留批次 H（我们做别人的接入方，优先级低于我们接入 IM） |

## 4. 功能需求

### FR-1 IM 配置
- FR-1.1 新增 `sys_im_config`：
  | 字段 | 说明 |
  | --- | --- |
  | config_id | PK |
  | tenant_id | 租户 |
  | im_type | WECOM 企业微信 / DINGTALK 钉钉 / FEISHU 飞书 |
  | corp_id | 企业 ID |
  | agent_id | 应用 ID |
  | app_key | 应用 Key |
  | app_secret_encrypted | **应用密钥（加密）** |
  | token_encrypted | 回调 Token（加密） |
  | aes_key_encrypted | 回调加密密钥（加密） |
  | callback_url | 回调地址 |
  | sync_enabled | 是否启用组织同步 |
  | sync_cron | 同步周期 |
  | login_enabled | 是否启用扫码登录 |
  | message_enabled | 是否启用消息推送 |
  | todo_enabled | 是否启用待办同步 |
  | last_sync_time | 最近同步时间 |
  | status | ENABLED / DISABLED |
  | + 审计列 | |
- FR-1.2 **四个密钥字段全部加密存储**，接口返回脱敏，日志不打印
- FR-1.3 配置连通性测试（调 IM 接口获取 access_token 验证）

### FR-2 用户与部门映射
- FR-2.1 新增 `sys_im_user_mapping`：`mapping_id, tenant_id, user_id, im_type, im_user_id, im_open_id, im_union_id, im_name, im_avatar, bind_type(AUTO_SYNC 同步创建 / MANUAL_BIND 手工绑定 / SCAN_BIND 扫码绑定), bind_time, last_sync_time, status` + 审计列
  - 唯一索引 `uk_user_im(tenant_id, user_id, im_type)` 与 `uk_im_user(tenant_id, im_type, im_user_id)`
- FR-2.2 新增 `sys_im_dept_mapping`：`mapping_id, tenant_id, dept_id, im_type, im_dept_id, im_dept_name, im_parent_dept_id, sync_time, status` + 审计列
- FR-2.3 **与 SYS-03 社交登录的关系**：对标文档提示"共用 `sys_social_*` 表，不要建两套绑定关系"。本 PRD 决策见 §9-3

### FR-3 IM 适配层抽象
- FR-3.1 定义四个接口，各 IM 实现之：
  ```java
  interface ImOrgProvider {      // 组织
      List<ImDept> fetchDepts();
      List<ImUser> fetchUsers(String imDeptId);
  }
  interface ImIdentityProvider { // 身份
      ImUserIdentity getByCode(String code);        // 扫码/免登 code 换身份
      String buildAuthUrl(String redirectUri, String state);
  }
  interface ImMessageSender {     // 消息（注册为 SYS-01 的 MessageChannelSender）
      void sendText(List<String> imUserIds, String content);
      void sendCard(List<String> imUserIds, ImCard card);
  }
  interface ImTodoProvider {      // 待办
      String createTodo(ImTodo todo);
      void updateTodo(String imTodoId, ImTodoStatus status);
      void cancelTodo(String imTodoId);
  }
  ```
- FR-3.2 按 `im_type` 分派实现（工厂模式，与现有 `AssignUserStrategyFactory` 模式一致）
- FR-3.3 消息能力**注册为 SYS-01 的渠道实现**（SYS-01 FR-1.1B 的策略模式已预留），不另建发送体系

### FR-4 组织同步
- FR-4.1 定时同步（批次 A SYS-02 纳管，周期由 `sync_cron` 配置）
- FR-4.2 **单向同步：IM → 本地**（决策见 §9-2）
- FR-4.3 同步部门：按 IM 部门树创建/更新 `sys_dept`，维护 `sys_im_dept_mapping`
- FR-4.4 同步成员：按 IM 成员创建/更新 `sys_user`，维护 `sys_im_user_mapping`
  - 新用户默认无角色（需管理员分配），避免自动获得权限
  - 已离职（IM 中删除）的用户置 `sys_user.status=禁用`，**不物理删除**
- FR-4.5 同步结果报告：新增/更新/禁用各多少，冲突项清单
- FR-4.6 **同步不覆盖本地手工维护的字段**（如角色、岗位、数据权限），只同步 IM 权威字段（姓名、部门、手机、邮箱、头像）
- FR-4.7 首次同步支持"预览模式"（只看将产生什么变更，不实际执行）

### FR-5 扫码登录与免登
- FR-5.1 扫码登录：
  1. 前端登录页显示 IM 扫码入口，调 `GET /auth/im/{imType}/auth-url` 获取授权 URL
  2. 用户扫码授权后 IM 回调到 `GET /auth/im/{imType}/callback?code=xxx&state=xxx`
  3. 后端用 code 换 IM 身份 → 查 `sys_im_user_mapping` 找本地用户 → **签发 Sa-Token 会话**
  4. 未绑定时：引导绑定（输入账号密码完成绑定）或拒绝（按配置）
- FR-5.2 内嵌免登：在 IM 内打开系统页面时，通过 IM 的 JS-SDK 或 URL code 静默获取身份并登录
- FR-5.3 **不重写认证框架**：Sa-Token 保留为会话底座，IM 只是额外的身份来源（与 PLAN.md 的"不引入第二套权限平台"一致）
- FR-5.4 `state` 参数防 CSRF（随机值存 Redis，回调时校验）
- FR-5.5 扫码登录同样受现有安全策略约束（IP 黑白名单 `sys_ip_acl`、用户黑名单 `sys_user_blacklist`）

### FR-6 消息推送
- FR-6.1 实现 `ImMessageSender` 并注册为 SYS-01 的 `MessageChannelSender`
- FR-6.2 支持文本消息与模板卡片
- FR-6.3 接收人：本地 `user_id` → 查映射 → IM `im_user_id`；无映射时跳过并记录（`sys_message_record.skip_reason=NO_IM_MAPPING`）
- FR-6.4 消息模板复用 SYS-01 的 `sys_message_template`（新增 IM 渠道模板）

### FR-7 待办同步（**核心价值**）
- FR-7.1 工作流产生任务时（`wf_task` 创建），若 `todo_enabled=1`，推送 IM 待办卡片
- FR-7.2 卡片内容：流程标题、发起人、关键表单字段、同意/驳回按钮、查看详情链接
- FR-7.3 新增 `sys_im_todo_mapping`：`mapping_id, tenant_id, task_id, im_type, im_todo_id, im_user_id, status, create_time, update_time`
- FR-7.4 用户在 IM 内点"同意/驳回"：
  1. IM 回调到我们的接口
  2. **验签**（各 IM 签名算法不同）
  3. 查 `sys_im_todo_mapping` 找到 `task_id`
  4. 校验该 IM 用户对应的本地用户是否为该任务处理人
  5. 调用现有 `POST /wf/complete` 或 `/wf/reject`
- FR-7.5 任务在系统内被处理后，同步更新/撤回 IM 待办卡片（避免 IM 里残留已处理待办）
- FR-7.6 IM 内审批的意见字段有限时，复杂审批引导点"查看详情"到内嵌页面（配合 FR-5.2 免登）

### FR-8 安全加固（**本 PRD 重点**）
- FR-8.1 **回调验签**：所有 IM 回调必须验签，验签失败直接拒绝并记录
- FR-8.2 回调端点限流（复用 `sys_api_ratelimit_rule`）
- FR-8.3 回调端点是新增外网暴露面，需：不回显敏感信息、异常不暴露堆栈、记录来源 IP
- FR-8.4 IM 内审批需二次校验处理人身份（FR-7.4 第 4 步），**防越权审批**
- FR-8.5 `access_token` 缓存到 Redis（IM 接口有调用频率限制），过期前刷新
- FR-8.6 所有 IM 操作（同步、登录、审批）记 `sys_audit_log`

## 5. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `sys_im_config`、`sys_im_user_mapping`、`sys_im_dept_mapping`、`sys_im_todo_mapping` |
| 复用 | `sys_message_channel`（IM 渠道类型已预留）、`sys_message_template`、`sys_message_record` |
| 复用 | `sys_ip_acl`、`sys_user_blacklist`、`sys_api_ratelimit_rule` |

`DB/01.cloudflow-common.sql`：+4 表

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| **密钥加密** | `app_secret` / `token` / `aes_key` 加密存储、接口脱敏、日志不打印 |
| **回调验签** | 强制验签（FR-8.1），无例外 |
| **越权审批防护** | IM 审批必须校验处理人身份（FR-8.4） |
| CSRF 防护 | 扫码登录用 `state` 参数（FR-5.4） |
| 限流 | 回调端点限流；IM 接口调用遵守对方频率限制 |
| token 缓存 | `access_token` 缓存并自动刷新（FR-8.5） |
| 组织同步安全 | 新同步用户无角色（FR-4.4）；不覆盖本地手工字段（FR-4.6） |
| 同步幂等 | 重复同步结果一致 |
| 同步性能 | 1000 人组织同步 < 5 分钟（异步任务） |
| 降级 | IM 不可用时不影响系统正常使用（消息记 SKIPPED、待办不推送但系统内待办正常） |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | IM 配置可维护；连通性测试可用 |
| AC-2 | 四个密钥字段数据库中为加密值；接口脱敏；日志无明文 |
| AC-3 | 组织同步：部门树与成员正确同步，映射表正确建立 |
| AC-4 | 新同步的用户无角色（需管理员分配） |
| AC-5 | IM 中已删除的用户在本地被禁用而非删除 |
| AC-6 | **同步不覆盖本地手工维护的角色/岗位/数据权限** |
| AC-7 | 首次同步预览模式正确展示将产生的变更 |
| AC-8 | 重复同步幂等；同步报告正确 |
| AC-9 | 扫码登录成功签发 Sa-Token 会话；未绑定用户走绑定引导 |
| AC-10 | **`state` 参数缺失或不匹配时回调被拒绝**（CSRF 防护） |
| AC-11 | 扫码登录受 IP 黑白名单与用户黑名单约束 |
| AC-12 | IM 内嵌页面免登成功 |
| AC-13 | 消息通过 IM 渠道发送成功；无 IM 映射的用户记 SKIPPED |
| AC-14 | **待办卡片推送到 IM；卡片含流程信息与操作按钮** |
| AC-15 | **在 IM 内点同意后，系统内任务被正确完成** |
| AC-16 | 系统内处理任务后，IM 待办卡片被更新或撤回 |
| AC-17 | **回调验签失败被拒绝并记录** |
| AC-18 | **非任务处理人对应的 IM 用户点同意时被拒绝**（越权防护） |
| AC-19 | 回调端点限流生效 |
| AC-20 | `access_token` 缓存生效，不重复获取 |
| AC-21 | IM 服务不可用时系统正常使用，消息与待办降级不报错 |
| AC-22 | 同步、登录、IM 审批均记审计 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **批次 A SYS-01 消息中心** | 渠道适配层与模板；**强依赖**（IM 消息注册为其渠道实现） |
| **批次 A SYS-02 任务平台** | 组织同步定时任务 |
| IM SDK | WxJava(Apache-2.0) / oapi-sdk-java(Apache-2.0) / 钉钉 SDK，**可直接作为依赖引入** |
| 现有 Sa-Token | 会话底座（不重写） |
| 现有 `sys_ip_acl` / `sys_user_blacklist` / `sys_api_ratelimit_rule` | 安全策略复用 |
| 现有工作流接口 | `/wf/complete`、`/wf/reject` |
| **IM 应用注册** | 需在企微/钉钉/飞书后台创建应用并配置回调地址（业务前置条件，非技术依赖） |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **IM 回调是新增外网暴露面**（验签绕过、越权审批、限流缺失） | FR-8 全节 + AC-10/17/18/19。**这是本 PRD 最高风险项**：越权审批意味着任何人可代他人审批 |
| 组织同步覆盖本地数据导致权限错乱 | FR-4.4/4.6 只同步 IM 权威字段、新用户无角色、离职禁用不删除；AC-4/5/6 验证；预览模式（AC-7）降低首次同步风险 |
| 三家 IM 接口差异大，抽象层设计不当导致返工 | §1.3 先做一家；抽象层四接口（FR-3.1）按能力而非按厂商设计 |
| IM 待办卡片能力有限（字段数、按钮数限制） | 复杂审批引导到内嵌页面（FR-7.6） |
| IM 待办状态与系统状态不一致（IM 里已处理但系统未同步或反之） | FR-7.5 双向状态同步；建议加对账任务定期校验 |
| `access_token` 频率限制导致同步失败 | 缓存 + 自动刷新（FR-8.5 + AC-20） |
| IM 应用审核与配置需企业管理员配合 | 业务前置条件，需提前协调 |
| 回调地址需公网可访问 | 需确认部署环境是否有公网入口；无公网时 IM 集成无法完成（见 §9-4） |

## 9. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 四张表 + IM 配置管理 + 密钥加密 + 连通性测试 | AC-1/2 |
| M2 | 适配层四接口抽象 + 选定 IM 的实现骨架 + token 缓存 | AC-20 |
| M3 | 组织同步（含预览、幂等、不覆盖本地字段） | AC-3~AC-8 |
| M4 | 扫码登录 + 内嵌免登 + CSRF + 安全策略联动 | AC-9~AC-12 |
| M5 | 消息推送（注册为 SYS-01 渠道） | AC-13 |
| M6 | **待办卡片推送 + IM 内审批 + 验签 + 越权防护 + 状态同步** | AC-14~AC-19 |
| M7 | 降级 + 审计 + 对账任务 | AC-21/22 |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | **先做哪一家 IM** | **2026-08-31 暂不决定，本 PRD 延后**（见 §0）。启动时需确认；建议企业微信（WxJava 是 Apache-2.0 且功能覆盖最全、中文文档最好） |
| 2 | 组织同步方向 | 建议**IM → 本地单向**。理由：IM 是企业组织的权威源；双向同步需处理覆盖冲突（谁赢），实现复杂且易出错。本地只做角色岗位等系统内概念的维护 |
| 3 | `sys_im_user_mapping` 是否与 SYS-03 的 `sys_social_user_bind` 合并 | 对标文档提示"不要建两套"。**建议合并**：用 `sys_social_user` + `sys_social_user_bind`（SYS-03 定义）承载，`social_type` 取值含 `WECOM`/`DINGTALK`/`FEISHU`。但 SYS-03 在批次 H，若本 PRD 先落地，则先建 `sys_im_user_mapping`，SYS-03 落地时收敛为一套。**需在实施时明确顺序** |
| 4 | 部署环境是否有公网入口 | **这是本 PRD 的硬前置条件**：IM 回调需公网可访问。若为纯内网部署，扫码登录与待办回调均无法实现（只能做单向推送）。需提前确认 |
| 5 | 待办卡片的表单字段展示范围 | 建议只展示 3-5 个关键字段（IM 卡片空间有限）；敏感字段不在卡片展示（配合批次 C LC-04 的字段权限） |
| 6 | 是否需要 IM 群机器人 | 本期不做；后续可低成本补（复用 `ImMessageSender`） |
