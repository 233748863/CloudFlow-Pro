# 集成能力与前端体验对标调研

> 本文档独立可用。调研时间 2026-08-31，我方基线为实测前端源码、依赖清单与后端 Controller 清单。

## 一、许可证规则

| 分类 | 项目 | 使用方式 |
| --- | --- | --- |
| 可读可借鉴实现 | WxJava(Apache-2.0，仓库已改名需确认新地址)、larksuite/oapi-sdk-java(Apache-2.0)、austin(Apache-2.0)、easyexcel(Apache-2.0)、vue-vben-admin(MIT)、ant-design-pro(MIT) | 可直接依赖或参照 |
| 需逐项复核 | novu(NOASSERTION) | 使用前确认 |
| 我们已在用 | FastExcel 1.0.0（easyexcel 后继）、Apache POI 5.2.5 | — |

**企业 IM SDK 是可以直接作为 Maven 依赖引入的**（WxJava 与飞书 SDK 均 Apache-2.0），不是"借鉴设计"，这与其他文档不同。

## 二、我们的现状基线（实测）

### 集成能力
- **消息推送**：无统一通道（详见 `05-system` 文档 SYS-01）。各模块自行实现：`wf_notification_log`/`wf_notification_config`、`CrmNotificationController`（5 个 dispatch 接口）、`hr_self_service_message`、`oa_announcement`、`SecurityChangeNoticeService`
- **企业 IM**：**完全没有**（无企微/钉钉/飞书任何集成）
- **导入导出**：后端 FastExcel 1.0.0 + POI 5.2.5，`ImportExportController`（工作流导入导出）、CSV 导出（审计台账）
- **对象存储**：`sys_file.storage_type` 字段存在但无多后端配置
- **AI 能力**：`AiArtifactController`（`POST /ai/workflow-artifacts`，已改由后端代理，见 commit `4465ebd8`）；前端 `GEMINI_API_KEY` 通过 Vite define 注入
- **离线同步**：`SyncController` + `oa_sync_device`（这是我们特有的能力）
- **实时推送**：公共 SSE Controller 1 个；网关路由 `/ws`

### 前端体验
- React 19.2.0 + Vite 6.4.1 + Tailwind CSS 4.1.18 + React Router 7.13.0 + TanStack Query 5.90.20 + Zustand 5.0.11
- **页面 69 个**（`src/pages` 顶层，含 admin/hr/oa/system 子目录）
- **公共组件约 70 个**（`src/components/common`）：已有完整原语（button/card/dialog/input/select/switch/table/tabs/textarea/date-picker/segmented-control/side-nav/theme-mode-switcher）+ 业务组件（`DeptSelector`/`EmployeeSelector`/`PositionSelector`/`PostSelector`/`RoleSelector`/`UserSelector`/`MeetingRoomSelector`/`DictSelect`/`DictBadge`/`BusinessTimeline`/`StatCard`/`VirtualList`/`PermissionGuard`/`RouteGuard`/`ConflictResolutionDialog`）
- **移动端组件仅 3 个**：`MobileFormRenderer`、`MobileProcessTrace`、`MobileTaskHandler`
- PWA 已启用（`vite-plugin-pwa` 1.2.0）；Tauri 桌面壳已配置
- unity2 原型移植已完成（批次 21，2026-08-09，含 dataviz 8 槽色板、5 个补齐原语、表格吸顶、主题初始化）

**结论：前端组件体系与主题体系已相当完整（unity2 移植已收口），缺口在"移动端只有 3 个组件"和"零企业 IM 集成"两处。**

## 三、功能深度差距矩阵

深度等级：`0`=无 / `1`=有雏形 / `2`=可用 / `3`=完整

| 能力项 | 我们 | 参考项目 | 差距判定 |
| --- | --- | --- | --- |
| 统一消息中心 | **0**（各模块自实现） | austin 3 / novu 3 | **重点缺口**（见 SYS-01） |
| 企微集成 | **0** | WxJava 3 | **重点缺口** |
| 钉钉集成 | **0** | 官方 SDK 3 | 缺口 |
| 飞书集成 | **0** | oapi-sdk-java 3 | 缺口 |
| 扫码登录 | **0** | 3 | 缺口（见 SYS-03） |
| 待办同步到 IM 工作台 | **0** | 3 | **重点缺口** |
| 移动端组件覆盖 | **3 个组件** | — | **重点缺口** |
| 移动端页面适配 | 1（部分响应式） | — | 缺口 |
| Excel 导入（带校验报错） | 1（导出强，导入弱） | easyexcel 3 | 缺口 |
| 文件在线预览 | **0** | jeesite5 有在线预览 | 缺口 |
| 全局搜索 | **0** | 2 | 缺口 |
| 实时推送（SSE/WS） | 2（SSE + /ws 路由） | 2 | 相当 |
| 离线同步 | **2（我们领先）** | 0 | 我们领先 |
| PWA | **2（我们有）** | 0 | 我们领先 |
| 桌面端（Tauri） | **2（我们有）** | 0 | 我们领先 |
| 主题与暗色模式 | **2（已完成）** | 2 | 相当 |
| 组件原语完整度 | **2（约 70 个）** | ant-design-pro 3 | 相当 |
| AI 辅助（表单/流程生成） | **1（有 AI 产物生成）** | JeecgBoot 2 | 相当 |

## 四、可移植条目

### [INT-01] 统一消息中心
- **参考来源**：`ZhongFuCheng3y/austin`（Apache-2.0, 6.1k，可参照实现）—— 支持邮件/短信/微信服务号/小程序/企业微信/钉钉多渠道；`novuhq/novu`（NOASSERTION 需复核）
- **说明**：**本条与 `05-system` 文档的 SYS-01 是同一件事**，在本文档中不重复展开设计。austin 的额外参考价值在于：渠道适配层抽象、消息去重、发送限流、夜间免打扰、模板参数校验、发送结果回执处理。
- **优先级**：P0 —— 跨模块阻塞点（CRM-02 营销、OA-03 询价邀请、HR 提醒、工作流通知全部依赖）
- **落地位置**：建议 `cloudflow-common-message` 新公共模块（现有 16 个 `cloudflow-common-*` 子模块，加一个符合结构）

### [INT-02] 企业微信 / 钉钉 / 飞书集成
- **参考来源**：`Wechat-Group/WxJava`（Apache-2.0，企业微信 + 公众号 + 小程序 + 支付全覆盖，**可直接作为 Maven 依赖**）；`larksuite/oapi-sdk-java`（Apache-2.0, 309 star，飞书官方 SDK，可直接依赖）；钉钉官方 Java SDK
- **参考实现怎么做的**：三家 IM 的企业能力大同小异，可抽象为四类：
  1. **组织同步**：拉取部门树与成员，与本地 `sys_dept`/`sys_user` 双向同步
  2. **扫码登录 / 免登**：企微内嵌页面可静默获取用户身份（`code` → `userid`）
  3. **消息推送**：应用消息、模板卡片、待办卡片
  4. **待办同步**：把审批任务推到 IM 的待办/工作台（用户在 IM 里直接审批）
- **我们现状**：零集成。这是企业 OA 落地的最大体验缺口 —— 用户要审批必须打开我们的系统，而实际企业里 90% 的审批发生在 IM 里。
- **落地改动**：
  - 新增 `sys_im_config`：`im_type(WECOM/DINGTALK/FEISHU), corp_id, agent_id, app_key, app_secret_encrypted, token_encrypted, aes_key_encrypted, callback_url, sync_enabled, status`（**密钥加密存储**）
  - 新增 `sys_im_user_mapping`：`user_id, im_type, im_user_id, im_open_id, bind_time, sync_time`（与 SYS-03 的 `sys_social_user_bind` 可合并，建议合并避免两套绑定关系）
  - 新增 `sys_im_dept_mapping`：`dept_id, im_type, im_dept_id, sync_time`
  - **组织同步**：定时任务（依赖 SYS-02 任务平台）拉取 IM 组织树；**注意冲突策略**——本地为主还是 IM 为主必须明确，建议 IM 为主、本地只读同步，避免双向覆盖冲突
  - **待办推送**：工作流产生任务时推 IM 待办卡片，走 INT-01 消息通道；任务完成后撤回/更新卡片状态
  - **扫码登录**：与 SYS-03 社交登录共用 `sys_social_*` 表
  - **回调验签**：IM 回调必须验签（企微/钉钉/飞书各有签名算法），**回调端点是新增外网暴露面**，需限流（复用 `sys_api_ratelimit_rule`）
  - 建议**先做一家**（按实际使用的 IM 选，多数企业是企微或钉钉），验证抽象层再扩展
- **工作量**：L（单家 IM：4 表 + 组织同步 + 待办推送 + 扫码登录）
- **优先级**：P1 —— 体验收益极高，但依赖 INT-01/SYS-01 消息通道与 SYS-02 定时任务先落地

### [INT-03] 移动端组件与页面适配
- **参考来源**：本条主要是内部补齐；可参照 `vbenjs/vue-vben-admin`（MIT）与 `ant-design/ant-design-pro`（MIT）的响应式断点策略
- **我们现状**：移动端组件**只有 3 个**（`MobileFormRenderer`、`MobileProcessTrace`、`MobileTaskHandler`）—— 恰好覆盖"移动端审批"这一条核心链路，说明设计时是有意为之。但 69 个页面里大部分没有移动端适配。PWA 已启用意味着用户会把它当 App 用，页面不适配会直接暴露。
- **落地改动**：
  - 明确移动端**能力边界**：不是所有页面都要适配。建议只覆盖高频移动场景：待办审批（已有）、考勤打卡、请假加班申请、公告查看、日程、客户跟进录入、工单处理
  - 复用现有 70 个公共组件的响应式能力（Tailwind 4 断点已在用）
  - 补移动端专用组件：底部导航（`side-nav` 的移动端形态）、下拉刷新、上拉加载（`VirtualList` 已有可复用）、移动端筛选抽屉、移动端日期选择
  - 打卡场景需要定位（配合 HR-05 的经纬度打卡字段）与拍照上传
  - **不建议引入 Vant/NutUI**（Vue 生态）；React 侧自研，与现有组件体系一致
- **工作量**：L（按覆盖页面数量线性增长）
- **优先级**：P1 —— PWA 已启用但移动适配不足，属于"已暴露的体验缺口"

### [INT-04] Excel 导入带校验与错误回传
- **参考来源**：`alibaba/easyexcel`（Apache-2.0, 33.7k；我们已在用其后继 FastExcel 1.0.0）
- **参考实现怎么做的**：easyexcel 的标准做法是逐行监听读取（不全量载入内存），每行校验后收集错误，最后回传"带错误标注的 Excel"让用户改完重传。这对 HR 批量导入员工、CRM 批量导入客户是刚需。
- **我们现状**：导出能力强（FastExcel + POI + CSV 导出已实现），**导入弱**。按 Controller 清单看，批量导入入口很少。而本系列文档规划的新表（如 HR 假期政策批量分配、CRM 线索批量导入）都需要导入。
- **落地改动**：
  - 建统一导入框架：`sys_import_task`（`task_id, biz_type, file_url, total_rows, success_rows, fail_rows, status(PENDING/PROCESSING/SUCCESS/PARTIAL/FAILED), error_file_url, operator_id, start_time, end_time`）
  - 逐行校验 + 错误收集 + 生成错误标注文件（错误列追加在原文件右侧）
  - 大文件异步处理（依赖 SYS-02 任务平台）
  - 高频场景优先：HR 员工/薪资/考勤导入、CRM 客户/线索导入、OA 资产导入
  - **安全**：导入文件大小限制、行数上限、类型按内容校验；导入操作必须审计（`sys_audit_log`）
- **工作量**：M（框架 + 3-5 个业务场景接入）
- **优先级**：P1

### [INT-05] 文件在线预览
- **参考来源**：`thinkgem/jeesite5`（Apache-2.0）—— 其"在线预览文件"是明确列出的特性
- **参考实现怎么做的**：常见做法是服务端转换（LibreOffice 转 PDF）+ 前端 PDF.js 渲染，或接入 kkFileView 类服务。
- **我们现状**：无预览。合同（`oa_contract.attachment_url`）、证照、知识库文档、报销发票、简历（`hr_resume_parsed_fields` 说明有简历解析但无预览）全部只能下载后本地打开。审批场景下"下载才能看附件"是明显的体验损耗。
- **落地改动**：
  - 优先支持 PDF + 图片（前端直接渲染，零服务端成本）
  - Office 文档需服务端转换，成本较高；可评估独立预览服务（kkFileView 为 AGPL，需复核许可证）或只支持"转 PDF 后预览"
  - 配合 SYS-04 的签名 URL（私有文件预览不能用直链）
  - **安全**：预览渲染需防 XSS（SVG/HTML 类文件不直接渲染）
- **工作量**：M（PDF+图片）/ L（含 Office 转换）
- **优先级**：P2 —— 审批体验收益明确，但 Office 转换引入新服务，建议先只做 PDF+图片

### [INT-06] 全局搜索
- **参考来源**：`ant-design/ant-design-pro`（MIT）的全局搜索交互模式
- **我们现状**：无。69 个页面、121 个 Controller 的功能量级下，用户找功能靠菜单逐层点。
- **落地改动**：
  - 一期做**菜单与功能搜索**（纯前端，读已有菜单树 `sys_menu`，零后端成本）
  - 二期做**业务数据搜索**（跨客户/合同/员工/流程实例）—— 需后端聚合接口；**必须带权限过滤**（搜索结果不能越权暴露），且不引入 ES，用各服务分别查询 + 网关聚合
  - 快捷键唤起（Cmd/Ctrl+K）
- **工作量**：S（菜单搜索）/ M（业务搜索）
- **优先级**：P2（菜单搜索可作为低成本快赢，实际可提前做）

### [INT-07] 消息中心前端统一收口
- **参考来源**：本条是内部一致性对齐
- **我们现状**：前端已有 `AnnouncementBell`、`NoticeBell`、`UnifiedMessageBell` 三个铃铛组件（`components/common/`）—— `UnifiedMessageBell` 的存在说明已经在做收口，但三个并存说明收口未完成。后端同样分散（公告/通知/待办/抄送/HR 自助消息各自一套）。
- **落地改动**：
  - 后端随 SYS-01 统一到 `sys_message_record`，提供统一的未读数与消息列表接口
  - 前端保留 `UnifiedMessageBell` 单一入口，下线 `AnnouncementBell`/`NoticeBell`（或降级为内部实现）
  - 消息分类页签：待办 / 抄送 / 公告 / 系统 / 业务提醒
- **工作量**：M（依赖 SYS-01）
- **优先级**：P1（跟随 SYS-01 一起交付）

## 五、不建议移植

| 项 | 原因 |
| --- | --- |
| 引入 Vant / NutUI / Taro | Vue 生态或独立跨端框架；我们是 React 19 + PWA + Tauri，移动端应在现有体系内自研（INT-03） |
| novu 作为消息基础设施 | 许可证 NOASSERTION 需复核 + 引入独立 Node 服务的运维成本；INT-01 用 austin 思路自建更贴合（我们已有 `outbox_event` 事务发件箱做底座） |
| 引入 Elasticsearch 做全局搜索 | INT-06 二期用各服务分别查询 + 网关聚合即可；数据量未到需要 ES 的量级 |
| 微信小程序端 | 已有 PWA + Tauri 双端，再加小程序是第三套壳；若要移动端优先，INT-03 的收益更直接 |
| kkFileView 直接引入 | AGPL 许可证需复核；INT-05 建议先只做 PDF+图片预览 |
| 三家 IM 同时集成 | 抽象层未验证前同时做三家会导致抽象错误；INT-02 明确建议先做一家 |
| chatwoot 全渠道客服 | 独立问题域（见 03-crm 文档的不建议移植） |

## 六、建议批次

**P0（跨模块阻塞点）**
1. INT-01 统一消息中心（**= SYS-01，是本系列文档的头号前置项**）

**P1（体验与集成主线）**
2. INT-07 消息中心前端收口（随 SYS-01 交付）
3. INT-03 移动端适配（PWA 已启用，缺口已暴露）
4. INT-04 Excel 导入框架（后续大量新表都需要）
5. INT-02 企业 IM 集成（**先做一家**，依赖 INT-01 + SYS-02）

**P2（增强）**
6. INT-06 菜单搜索（S，低成本快赢，可提前）
7. INT-05 文件预览（先 PDF+图片）
8. INT-06 业务数据搜索（需权限过滤）

依赖关系：INT-01 → INT-02 / INT-07；SYS-02 定时任务 → INT-02 组织同步 / INT-04 异步导入；SYS-04 签名 URL → INT-05 预览；SYS-03 社交登录 ↔ INT-02 扫码登录（**共用 `sys_social_*` 表，不要建两套绑定关系**）。

## 七、安全注意事项（本模块特有）

- **IM 密钥**：`app_secret`、`token`、`aes_key` 一律加密存储，日志不打印
- **IM 回调验签**：企微/钉钉/飞书回调必须验签，回调端点是新增外网暴露面，需限流（复用 `sys_api_ratelimit_rule`）
- **组织同步冲突**：必须明确"以 IM 为准"还是"以本地为准"，建议 IM 为主单向同步，避免双向覆盖导致组织数据错乱
- **导入安全**：文件大小与行数上限、类型按内容判断、导入操作全量审计
- **预览安全**：SVG/HTML 类文件不直接渲染（XSS）；私有文件走签名 URL
- **全局搜索**：业务数据搜索必须做权限过滤，否则成为越权查询入口
