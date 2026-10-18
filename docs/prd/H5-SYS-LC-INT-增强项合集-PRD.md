# PRD：平台层增强项合集（SYS-03/06/08 · LC-06 · INT-05/06）

| 项 | 内容 |
| --- | --- |
| 条目编号 | SYS-03 OAuth2 服务端 · SYS-06 租户套餐 · SYS-08 多数据源配置 · LC-06 自助报表（受限版）· INT-05 文件预览 · INT-06 全局搜索 |
| 所属批次 | 批次 H（P2 增强项） |
| 对标依据 | `docs/benchmark/05-system-系统治理对标.md`、`06-lowcode-bi`、`07-integration` |
| 优先级 | P2 |
| 预估工作量 | 见各节 |
| 版本 | v1 · 2026-08-31 |

## 0. 定位与优先级建议

| 顺序 | 条目 | 工作量 | 理由 |
| --- | --- | --- | --- |
| 1 | **INT-06 菜单搜索**（S） | S | **低成本快赢**，纯前端读现有菜单树，可提前到任意批次 |
| 2 | **SYS-06 租户套餐**（S） | S | SaaS 化时新建租户效率提升明显 |
| 3 | **LC-06 自助报表受限版**（M） | M | 已定决策为受限版（无自由 SQL），风险已消除 |
| 4 | **INT-05 文件预览**（M） | M | 审批体验收益明确；建议只做 PDF+图片 |
| 5 | **SYS-08 多数据源配置**（S） | S | 纯运维便利，收益低 |
| 6 | **SYS-03 OAuth2 服务端**（L） | L | 我们做别人的接入方，优先级最低（G4 已做完我们接入 IM 的部分） |

---

# INT-06 全局搜索

## 1. 背景
69 个顶层页面、153 个 TSX 文件、121 个 Controller 的功能量级下，用户找功能靠菜单逐层点。

## 2. 分两期

### 一期：菜单与功能搜索（S，**纯前端零后端成本**）
- FR-1 快捷键唤起（Cmd/Ctrl+K）
- FR-2 数据源：**前端已加载的菜单树**（`sys_menu`，登录后已有），零额外接口
- FR-3 支持中文名、拼音首字母、路径匹配
- FR-4 展示最近访问（localStorage）与常用功能
- FR-5 键盘上下选择 + 回车跳转
- FR-6 只搜索当前用户有权限的菜单（菜单树本身已按权限过滤）

### 二期：业务数据搜索（M）
- FR-7 跨模块搜索：客户、合同、员工、流程实例、工单、资产
- FR-8 **必须带权限过滤**（搜索结果不能越权暴露）
- FR-9 实现方式：**不引入 ES**，各服务提供 `@Inner` 搜索接口，网关或前端聚合
  - 每个服务返回自己模块内、当前用户有权访问的前 N 条
- FR-10 结果按模块分组展示，可点击跳转
- FR-11 搜索关键词长度下限（≥2 字符）防全表扫描
- FR-12 各服务搜索接口需限流

## 3. 验收标准
| # | 验收项 |
| --- | --- |
| AC-1 | Cmd/Ctrl+K 唤起搜索面板 |
| AC-2 | 中文名与拼音首字母均可匹配菜单 |
| AC-3 | **只显示当前用户有权限的菜单** |
| AC-4 | 最近访问与常用功能正确展示 |
| AC-5 | 键盘操作可用 |
| AC-6 | 二期：跨六个模块搜索有结果并按模块分组 |
| AC-7 | **二期：搜索结果经过权限过滤，无权访问的数据不出现** |
| AC-8 | 关键词少于 2 字符时不发起搜索 |
| AC-9 | 搜索接口限流生效 |

## 4. 依赖与风险
- 依赖：现有菜单树（一期零依赖）；二期需各服务提供搜索接口
- 风险：**二期的权限过滤是关键**，搜索是最容易造成越权数据暴露的入口；每个服务的搜索接口必须复用该模块的数据权限逻辑

---

# SYS-06 租户套餐

## 1. 背景
`sys_tenant`（20 列）已有 `user_limit` / `storage_limit` / `storage_used` / `expire_time` / `allowed_email_domains` / `domain`（**配额管理比对标项目细**），但**功能集是逐租户配菜单** —— SaaS 化时新建租户要手工授权全部菜单。

## 2. 功能需求
- FR-13 新增 `sys_tenant_package`：`package_id, package_code, package_name, menu_ids(JSON), max_users, max_storage_mb, enabled_modules(JSON：WORKFLOW/OA/CRM/HR), price, billing_cycle, sort_no, status, remark` + 审计列
- FR-14 `sys_tenant` 增 `package_id`
- FR-15 新建租户选套餐后自动初始化菜单授权与配额
- FR-16 套餐变更时可批量同步已有租户
- FR-17 **批量同步是高影响操作**：需二次确认 + 影响范围预览（将影响 N 个租户）+ 审计
- FR-18 租户可在套餐基础上做个别菜单调整（`sys_tenant` 层覆盖），同步套餐时保留个别调整（或提示冲突）

## 3. 验收标准
| # | 验收项 |
| --- | --- |
| AC-10 | 套餐可维护，含菜单集与配额 |
| AC-11 | 新建租户选套餐后菜单授权与配额自动初始化 |
| AC-12 | **套餐变更批量同步前展示影响范围并二次确认** |
| AC-13 | 批量同步记审计 |
| AC-14 | 租户个别菜单调整在同步时被保留或明确提示冲突 |

## 4. 风险
批量改租户权限是高影响操作 → AC-12/13 的二次确认与审计是必需的

---

# LC-06 自助报表（受限版）

## 1. 已定决策回顾

用户 2026-08-31 决定：**采用受限版，只允许预置数据集，不开放自由 SQL**。

批次 A 的对标文档已更新记录：`sys_report_dataset` **不含 `source_sql` 字段**，数据集 SQL 由开发写在 XML mapper 里（符合项目"禁止 Java 拼接 SQL"约束），用户只能选预置数据集 + 配维度/度量/筛选。

## 2. 功能需求
- FR-19 新增 `sys_report_dataset`：`dataset_id, tenant_id, dataset_code, dataset_name, module(system/oa/crm/hr/workflow), mapper_method(指向 XML mapper 方法), field_meta(JSON：字段名/中文名/类型/维度或度量/是否可筛选), default_filters(JSON), tenant_isolated_flag, data_scope_flag(是否套用 sys_role 数据权限), permission_code, status, remark` + 审计列
  - **无 `source_sql` 字段**
- FR-20 新增 `sys_report_chart`：`chart_id, dataset_id, chart_name, chart_type(BAR/LINE/PIE/FUNNEL/TABLE/METRIC), dimensions(JSON), measures(JSON：字段 + 聚合方式 SUM/COUNT/AVG/MAX/MIN), filters(JSON：字段 + 操作符 + 值), sort_config, limit_rows, style_config(JSON), owner_id, share_scope(PRIVATE/DEPT/TENANT)` + 审计列
- FR-21 新增 `sys_report_dashboard` + `sys_report_dashboard_item`（`x, y, w, h, chart_id`）
- FR-22 **查询执行层安全约束**：
  - 维度/度量/筛选字段必须在 `field_meta` 白名单内，否则拒绝
  - 聚合方式与操作符走枚举白名单，不接受自由字符串
  - 参数全部 MyBatis `#{}` 绑定，**不用 `${}`**
  - 强制注入 `tenant_id`；`data_scope_flag=1` 时套用现有 `sys_role.data_scope/ds_type/ds_scope`
  - 结果行数上限 + 查询超时
  - 数据集访问按 `permission_code` 走 `@SaCheckPermission`
- FR-23 首批预置数据集（把现有写死报表改造为数据集）：
  流程实例与耗时 / 任务处理时效 / CRM 销售漏斗 / 回款账龄 / HR 考勤统计 / HR 假期统计 / OA 费用执行 / 预算执行 / 资产台账
- FR-24 图表渲染复用批次 A LC-05 的组件
- FR-25 仪表盘拖拽布局；可分享（按 `share_scope`）

## 3. 验收标准
| # | 验收项 |
| --- | --- |
| AC-15 | 预置数据集可选；维度与度量按 `field_meta` 正确列出 |
| AC-16 | 图表可配置并渲染（六种类型） |
| AC-17 | **传入 `field_meta` 之外的字段名被拒绝** |
| AC-18 | **传入白名单之外的聚合方式或操作符被拒绝** |
| AC-19 | 查询强制带 `tenant_id`；`data_scope_flag=1` 时数据权限生效 |
| AC-20 | 结果行数超上限时截断并提示；查询超时被中断 |
| AC-21 | 无 `permission_code` 权限时无法访问该数据集 |
| AC-22 | 仪表盘可拖拽布局与分享 |
| AC-23 | **SQL 注入测试：所有可控输入均无法注入**（字段名、操作符、值） |

## 4. 依赖与风险
- 依赖：**批次 A LC-05（图表库）**、现有 `sys_role` 数据权限、批次 A SYS-07
- 风险：受限版已消除自由 SQL 风险；剩余风险是**字段名白名单校验被绕过**（如通过大小写或特殊字符），AC-17/23 需专项测试

---

# INT-05 文件在线预览

## 1. 背景
无预览。合同（`oa_contract.attachment_url`）、证照、知识库文档、报销发票、简历、履约证据、供应商资质全部只能下载后本地打开。**审批场景下"下载才能看附件"是明显的体验损耗**。

## 2. 范围决策：只做 PDF + 图片

对标文档已建议"先只做 PDF+图片"。Office 文档需服务端转换（LibreOffice 或 kkFileView），成本与风险高（kkFileView 为 AGPL 需复核）。

## 3. 功能需求
- FR-26 支持格式：PDF、PNG/JPG/GIF/WebP
- FR-27 PDF 预览：前端用 PDF.js（需新增依赖）渲染，支持翻页、缩放、搜索
- FR-28 图片预览：原生渲染 + 缩放旋转
- FR-29 预览走**签名 URL**（批次 G SYS-04 已交付），不暴露直链
- FR-30 预览需权限校验（复用 SYS-04 的 `FileAccessChecker`）
- FR-31 **安全**：SVG / HTML 类文件**不直接渲染**（XSS 风险），降级为下载
- FR-32 不支持的格式提示"暂不支持预览，请下载查看"
- FR-33 移动端适配预览（配合批次 G INT-03）
- FR-34 预览行为可选记录（敏感文档如工资条、合同的预览也应留痕）

## 4. 验收标准
| # | 验收项 |
| --- | --- |
| AC-24 | PDF 可预览，支持翻页缩放搜索 |
| AC-25 | 图片可预览，支持缩放旋转 |
| AC-26 | 预览走签名 URL，直链无法访问 |
| AC-27 | 无权限用户无法预览 |
| AC-28 | **SVG / HTML 文件不渲染，降级为下载**（XSS 防护） |
| AC-29 | 不支持格式有明确提示 |
| AC-30 | 移动端可预览 |
| AC-31 | 敏感文档预览留痕 |

## 5. 依赖与风险
- 依赖：**批次 G SYS-04（签名 URL + 权限校验器）**、PDF.js（新增前端依赖）、批次 G INT-03（移动端）
- 风险：
  - PDF.js 增加包体积（约 300KB gzip）→ 懒加载，只在预览时载入
  - **SVG/HTML 渲染是 XSS 面** → AC-28 明确降级
  - Office 预览需求可能被反复提出 → 需明确说明成本（引入 LibreOffice 转换服务）

---

# SYS-03 OAuth2 授权服务端

## 1. 背景与优先级说明

批次 G 的 G4（INT-02 企业 IM 集成）已完成"**我们接入 IM**"的部分（社交登录）。本条目是"**别人接入我们**" —— 让第三方系统通过 OAuth2 接入 CloudFlow。

**这是优先级最低的一项**：需要有明确的第三方接入需求才有价值。

## 2. 功能需求
- FR-35 新增 `sys_oauth2_client`：`client_id, tenant_id, client_secret_encrypted, client_name, logo, description, status, access_token_validity_seconds, refresh_token_validity_seconds, redirect_uris(JSON), grant_types(JSON), scopes(JSON), auto_approve_scopes(JSON), authorities(JSON), resource_ids(JSON)` + 审计列
- FR-36 新增 `sys_oauth2_access_token`、`sys_oauth2_refresh_token`、`sys_oauth2_code`、`sys_oauth2_approve`
  - **token 与 code 存哈希不存明文**
- FR-37 支持授权码模式（`authorization_code`）与客户端凭证模式（`client_credentials`）；**不支持隐式模式与密码模式**（已被 OAuth2.1 废弃）
- FR-38 授权端点 `/oauth2/authorize`、令牌端点 `/oauth2/token`、用户信息端点 `/oauth2/userinfo`、令牌撤销 `/oauth2/revoke`
- FR-39 **不重写认证框架**：Sa-Token 保留为会话底座，OAuth2 token 换取的仍是 Sa-Token 会话（与 PLAN.md 的"不引入第二套权限平台"一致）
- FR-40 授权页展示申请的 scope 供用户确认；`auto_approve_scopes` 内的自动同意
- FR-41 PKCE 支持（公共客户端必需）
- FR-42 授权与令牌端点限流（复用 `sys_api_ratelimit_rule`）

## 3. 验收标准
| # | 验收项 |
| --- | --- |
| AC-32 | 客户端可注册；`client_secret` 加密存储且接口脱敏 |
| AC-33 | 授权码模式完整流程可用 |
| AC-34 | 客户端凭证模式可用 |
| AC-35 | **token 与 code 数据库中为哈希值** |
| AC-36 | `redirect_uri` 严格匹配（不匹配则拒绝，防开放重定向） |
| AC-37 | code 一次性使用，重复使用被拒绝 |
| AC-38 | PKCE 校验生效 |
| AC-39 | 授权页展示 scope；用户拒绝后不发 token |
| AC-40 | token 过期后无法使用；refresh token 可换新 token |
| AC-41 | 令牌撤销后立即失效 |
| AC-42 | 授权与令牌端点限流生效 |
| AC-43 | 隐式模式与密码模式请求被拒绝 |

## 4. 依赖与风险
- 依赖：现有 Sa-Token、`sys_api_ratelimit_rule`
- 风险：
  - **OAuth2 实现的安全细节多**（redirect_uri 匹配、code 一次性、PKCE、state），任一环出错即有严重漏洞。建议参照 `ruoyi-vue-pro`（MIT，可直接读代码）的实现
  - 新增对外授权端点是外网暴露面
  - 若无明确第三方接入需求，**建议不做**

---

# SYS-08 多数据源配置表

## 1. 背景
已依赖 `dynamic-datasource` 4.3.1，但配置在 Nacos yml。

## 2. 功能需求
- FR-43 新增 `sys_data_source_config`：`config_id, config_name, ds_key, url, driver_class, username, password_encrypted, init_size, max_active, status, remark` + 审计列
- FR-44 **密码加密存储**
- FR-45 支持动态注册数据源（`dynamic-datasource` 支持运行时添加）
- FR-46 连通性测试
- FR-47 仅超管可操作，全部操作记审计

## 3. 验收标准
| # | 验收项 |
| --- | --- |
| AC-44 | 数据源可配置并动态注册 |
| AC-45 | 密码加密存储且接口脱敏 |
| AC-46 | 连通性测试可用 |
| AC-47 | 仅超管可操作；操作记审计 |

## 4. 风险
**数据源配置是极高权限操作**（可指向任意数据库），必须限超管 + 审计；生产环境建议通过配置开关关闭该功能

---

## 综合依赖汇总

| 依赖 | 被哪几项用 |
| --- | --- |
| **批次 A LC-05 图表库** | LC-06 |
| **批次 G SYS-04 签名 URL** | INT-05 |
| **批次 G INT-03 移动端** | INT-05（移动端预览） |
| 现有菜单树 | INT-06 一期（零依赖） |
| 现有 `sys_role` 数据权限 | LC-06、INT-06 二期 |
| 现有 Sa-Token | SYS-03 |
| 现有 `sys_api_ratelimit_rule` | SYS-03、INT-06 |

## 综合待确认

| # | 问题 | 建议 |
| --- | --- | --- |
| 1 | 六项各自是否有真实诉求 | 优先级建议见 §0。**INT-06 一期建议提前做**（S 成本、零依赖、体验提升明显） |
| 2 | SYS-03 是否真有第三方接入需求 | **若无明确需求建议不做**。OAuth2 安全细节多，实现成本与风险不匹配收益 |
| 3 | INT-05 是否需要 Office 预览 | 建议先只做 PDF+图片。若 Office 需求强烈，需评估引入转换服务的成本（含 AGPL 许可证复核） |
| 4 | LC-06 的预置数据集由谁定 | 建议由各模块开发按 §FR-23 清单实现；后续按业务需求增量添加 |
| 5 | SYS-08 生产是否开放 | 建议生产环境配置开关关闭（与 SYS-07 代码生成器同一策略） |
