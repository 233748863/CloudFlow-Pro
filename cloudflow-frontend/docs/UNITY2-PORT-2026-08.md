# CloudFlow Pro 移植 unity2 原型增量（批次 21）

> 创建于 2026-08-06 ｜ 分支 `dev` ｜ 起点 commit `aa45b47e`
> **批次 21 已于 2026-08-09 全部完成并提交**，落在三个 commit：
> `370cb457`（前端六项重构 + unity2 移植）、`d1003c7c`（TOTP 全栈）、`4465ebd8`（AI 后端代理）。
> 来源：`D:\unity2-dashboard-prototype` 的上游复刻（批次 0-20 已全部完成）与 CloudFlow Pro 前端/后端审计的差距比对。
> 上游复刻侧的权威记录在 `D:\unity2-dashboard-prototype\docs\UPSTREAM-SYNC-2026-08.md`，本文件只管「移植进 CloudFlow Pro」这一段。
> **本文档是断点恢复的唯一依据。每完成一个步骤，必须先回写本文档的「进度总览」和步骤内的「状态/落地记录」，再继续下一步。**

## 进度总览

| # | 工作项 | 优先级 | 状态 | 完成时间 |
|---|---|---|---|---|
| P0-1 | 图表色板换成 dataviz 校验过的 8 槽 | P1 观感/可达性 | ✅ 已完成 | 2026-08-07 |
| P0-2 | 主题初始化时序核查 | P2 体验 | ✅ 已完成（结论：已符合，未改码） | 2026-08-06 |
| P1 | 补 5 个缺失原语（React 重写） | P1 能力 | ✅ 已完成 | 2026-08-07 |
| P2 | 表格吸顶收尾（接 3-5 张最长的表） | P2 体验 | ✅ 已完成 | 2026-08-07 |
| P3 | TOTP 两步验证（全栈） | P0 安全 | ✅ 已完成 | 2026-08-08 |
| 审计 | 全批次交叉审计 + 缺陷修复 | P0 安全 | ✅ 已完成 | 2026-08-09 |

状态图例：⬜ 未开始 / 🟡 进行中 / ✅ 已完成 / ⛔ 阻塞（需说明原因）

## 这批的性质：跨框架移植，不是文件拷贝

> **原型是 Vue 3，CloudFlow Pro 前端是 React 19。**
> `cloudflow-frontend/package.json`：react 19.2 / react-dom 19.2 / react-router-dom 7.13 /
> zustand 5 / @tanstack/react-query 5 / tailwindcss 4.1 / lucide-react / vite 6 / Tauri 2。
> 原型是 vue 3 + vue-router + vue-i18n + tailwind 3 + lucide-vue-next + chart.js。

只有三种形态可移植：**设计 token 直接搬 / 行为规格照着重写 / 组件按 React 重新实现**。

另一个已核实的前提：CloudFlow 的品牌色 `--cf-primary: #0d95b5` 与 unity2 **完全一致**，
2026-08 那轮六项前端重构也已经把暗色单轨化、CSS 拆分、Tooltip、动画做完了
（见 `FRONTEND-REFACTOR-2026-08.md`）。所以这批不是重新贴皮，而是**按差距补能力**。

## 已核实的现状（都带路径，别重新摸）

| 事实 | 依据 |
|---|---|
| 前端 326 个 tsx + 200 个 ts，`components/` 13 个子目录，`pages/` 184 个文件 | `cloudflow-frontend/src/` |
| 设计 token 已语义化：`--cf-fg-{title,body,muted,subtle,faint}` + `--cf-surface-{1,2,3}`，用 `@theme inline` 注册成 `text-cf-*`/`bg-cf-*` | `src/index.css` 头部 |
| 表格冻结列已有 hook + CSS：z-index 30(表头)/20(冻结体格)/40(表头∩冻结)，`isolation:isolate`，冻结边界 box-shadow | `src/hooks/useFrozenColumns.ts`、`src/index.css` `.cf-table-sticky*` |
| **表头吸顶 CSS 已就绪但没接**：`.cf-table-sticky-header > thead > tr > th { position:sticky; top:0 }` 缺一个有高度约束的滚动视口——现结构是 `.table-scroll-container(overflow:visible)` → `.table-wrapper(overflow-x:auto)`，纵向滚动在页面上 | 重构文档第 5 项「表头吸顶未接入」 |
| Tooltip 已用视口坐标 + `position:fixed`，**没有**上游 `HelpTooltip` 那个 `rect.top + scrollY` 的错 | `src/components/common/Tooltip.tsx:32` |
| 图表全是手写 svg，无图表库；用色只有 6 个 ad-hoc 值（`#0d95b5 #0b7894 #10b981 #f59e0b #64748b #d8f3fa`） | `src/components/user/dashboard/UserDashboardCharts.tsx` 等 4 处 |
| 公告体系比原型完整（Bell/Hub/Popup/DetailModal/ListItem/ManageTable/ReadStatus） | `src/components/common/Announcement*.tsx` |
| 条款协议是**服务端版本化发布**机制，比上游的前端 revision 拼串更规范 | `cloudflow-auth` `LegalAgreementController`、`sys_legal_release` |
| 认证走 sa-token；`sys_user` 无任何两步验证字段；后端无 codec/otp/zxing 依赖；前端无二维码库 | `cloudflow-auth/pom.xml`、`DB/01.cloudflow-common.sql:79` |
| 缺失的原语（全库 0 命中）：`DefaultAvatar` `AmountInput` `AutoRefreshButton` `NavigationProgress` `ImageUpload`；`date-picker.tsx` **不支持区间** | 逐个 grep `src/` |

## 范围（已确认）

- 做：**P0 设计体系对齐 + P1 缺失原语 + P2 表格吸顶收尾 + P3 TOTP（含后端）**
- 表格吸顶：**先接 3-5 张最长的表验证**，不推广到 189 张裸 table
- 新手引导（driver.js）：本批不做

## 工作项

顺序即建议执行顺序：P0 影响面最广且零回归，P1 纯新增，P2 动布局，P3 全栈。

### P0-1 图表色板换成校验过的 8 槽

**状态：✅ 已完成（2026-08-07）**

#### 先纠正规划里的一个错

规划写「4 处手写图表」，那是我最初 grep `chart|Chart` 的假阳性。
按「真的含 `<svg>` 且含 hex 色」重扫全库，实际只有 **2 个文件**：
`UserDashboardCharts.tsx` 与 `PerformanceStats.tsx`。
`DeployStatistics.tsx` 与 `HrPerformancePage.tsx` 里根本没有 SVG 图表元素，
命中只是因为文案/类名里出现了 "chart" 三次。

#### 落地的 token

`src/index.css` 加了两组，都用 `@theme inline` 注册成工具色（`bg-cf-chart-1` 等）：

| token | 用途 | 亮/暗 |
|---|---|---|
| `--cf-chart-1..8` | **分类槽**，答"这是哪个系列" | 两套 |
| `--cf-chart-{good,warning,critical}` | **状态色**，答"这个值什么状态" | **同值** |

分类槽取值就是原型算过的那两套（亮 `#0d95b5,#eb6834,#4a3aa7,#eda100,#e87ba4,#008300,#2a78d6,#e34948`；
暗 `#22a2bf,#d95926,#9085e9,#c98500,#d55181,#008300,#3987e5,#e66767`），
**暗色槽 1 不能用品牌浅色 `#38b8d4`**（OKLCH L=0.726 超出暗色带上限 0.67）。

状态色亮暗同值是有意的：状态语义固定，换主题跟着变色会让「红=严重」这种约定不稳。
三个值在白底与暗底 `#0f172a` 都过 3:1，实测通过。

#### 改到的地方

**`UserDashboardCharts.tsx` + `Dashboard.tsx`**：`DashboardTone`（`'cyan'|'emerald'|'amber'|'slate'`）
换成 `ChartSlot`（`1..8`）。改名的原因是新色板下槽 2 是橙、槽 3 是紫，
继续叫 emerald/amber 会变成误导。顺带删掉 `toneStyles` 里从来没人用的
`soft` 与 `text` 两个字段。四个系列按固定顺序占槽 1-4。

**`PerformanceStats.tsx`**：三个图分别处理

| 图 | 处理 |
|---|---|
| 流程总量/完成数/平均时长（柱+线） | 三系列 → 分类槽 1/2/3 |
| 超时率/异常率（双线） | 系列本身带状态语义 → 走 `warning`/`critical` 状态色，**不占分类槽** |
| 风险气泡图 | 填充按风险三档走 `good`/`warning`/`critical`；描边见下 |

#### 顺带修掉的三个真 bug

1. **图例色块与图表标记不是同一个颜色**。改造前图例用 Tailwind 类（`bg-cyan-500`）、
   标记用写死的 hex（`#06b6d4`），而项目已升到 **Tailwind v4**，v4 的色值是 OKLCH：

   | 类名 | v4 实际值 | 代码里写的 hex |
   |---|---|---|
   | `cyan-500` | `#00b8db` | `#06b6d4` |
   | `emerald-500` | `#00bc7d` | `#10b981` |
   | `amber-500` | `#fe9a00` | `#f59e0b` |
   | `rose-500` | `#ff2056` | `#f43f5e` |

   四对全部不一致 —— 每个图例色块跟它对应的标记显示的都不是一个色。
   现在两侧都指向同一个 token，这类漂移从根上没了。

2. **气泡图未选中态的描边在暗色下失效**。原来写死 `#0f172a`，暗色下这圈会糊进背景，
   而气泡是重叠的、这圈正是规范要求的「重叠标记表面色分隔环」。改成 `var(--cf-surface-1)`
   跟着主题走；选中态改用品牌主色，与三档风险色都不同色，不会被误读成风险等级。

3. **异常类型分布条按名次上色**。原来 `index % 5` 轮着发 5 个色，两个问题：
   颜色跟的是名次不是实体（筛选/排序一变，所有条的颜色重排，读者会以为分类变了），
   且首位用的是状态色 rose，会被误读成"这类最严重"。这本来是单系列量级比较、
   每条旁边已有类型名+数量+占比三个可见标签，颜色不携带信息。改成单色。

#### 一处自我纠正

我一度加了第四个状态档 `--cf-chart-normal`（青，给超时等级的「正常」档），
并给状态色也做了暗色覆盖。跑校验后都撤了：

- `good`(绿) 与 `normal`(青) 常视力 ΔE 只有 **12.5**，低于 15 的硬底线，并列时分不开。
  「没超时」本身就是好状态，直接用 `good`，不需要第四档。
- dataviz 规范里状态色是 **good/warning/serious/critical 四角色且 "never themed"**，
  我那套暗色 400 档还全部超出暗色亮度带。撤成亮暗同值。

#### 验证

- `npx tsc --noEmit` 退出码 **0**
- `npm run build` 成功；产物里分类槽亮暗各一套、状态色各只出现一次（确认没被 `html.dark` 覆盖）
- 分类色板对 CloudFlow 实际 surface 复算：亮色（`#ffffff`）与暗色（`#0f172a`）
  **六项检查全 PASS**，唯一 WARN 是槽 4 (2.17:1) 与槽 5 (2.69:1) 低于 3:1，
  规范要求「可见标签或表格视图」补偿 —— 用到这两槽的协同趋势图有图例色块+文字、
  hover tooltip 带系列名与数值，补偿条件满足
- 状态色**不适用**分类色板检查：规范自己那四色跑同一个检查也 FAIL
  （warning↔serious ΔE 13.6），因为状态色的补偿手段是「图标+文字标签」而不是色相。
  已逐处确认带标签：超时等级分布每档有等级名+数量+占比；风险气泡图有 tooltip 与坐标轴

浏览器目视验收已完成：协同趋势与效能统计在亮色、暗色主题下均符合预期，
图例和图形颜色一致，标签无碰撞，暗色表面无透光；用户确认整体审美符合要求。

### P0-2 主题初始化时序核查

**状态：✅ 已完成（2026-08-06）—— 核查结论「已符合」，未改任何代码**

原型的教训：主题必须**在挂载应用之前**定好，否则首帧闪白；且全站只能有一个 localStorage 键
（原型早前落地页与控制台各存一份、互不认账，已收口到 `src/theme.ts`）。

CloudFlow 这边实现在 `src/context/ThemeContext.tsx`（前一轮搜 `theme-mode-switcher.tsx` /
`App.tsx` / `src/stores/` 都没命中，是因为它在 `src/context/` 下）。逐条核对结果：

| 原型的教训 | CloudFlow 现状 | 结论 |
|---|---|---|
| 挂载前初始化 | `src/index.tsx:12` 在 `ReactDOM.createRoot` **之前**调 `initializeTheme()` | ✅ 已符合 |
| 只有一个键 | `STORAGE_KEY = 'unity2-theme'`；另有 `LEGACY_STORAGE_KEY = 'cf-theme'` 但只做「读时回退 + 写时删除」的一次性迁移 | ✅ 已符合 |
| 同步 colorScheme | `applyResolvedTheme` 同时写 `html.dark` class、`data-theme`、`style.colorScheme` | ✅ 比原型更完整 |

而且 CloudFlow 这套比原型多一档能力：`ThemeMode` 是 `light | dark | **system**` 三态，
`system` 档会监听 `prefers-color-scheme` 的 `change` 事件跟着变（原型只在初始化时读一次系统偏好，
之后就固定了）。**这一项无需从原型移植任何东西，反倒是原型该反向学 CloudFlow。**

一处仅供交叉参考、不构成待办：原型侧的键名我在批次 20 统一成了上游用的 `theme`，
CloudFlow 用的是 `unity2-theme`（正好是原型快照迁移前的旧名）。两个项目 localStorage 互不相干，
**不需要对齐**，只是以后翻这两份文档时别以为哪边写错了。

### P1 补 5 个缺失原语（React 重写，纯新增，零回归面）

**状态：✅ 已完成（2026-08-07）**

都放 `src/components/common/`，并在 `src/components/common/index.ts` 导出。
每个都带原型里已经验证过的行为细节，不是照着名字重造：

| 组件 | 原型参考 | 必须保留的行为 |
|---|---|---|
| `DefaultAvatar` | `components/DefaultAvatar.vue` (38 行) | 无头像时按名字首字取色块，色由名字哈希稳定决定（同一个人每次同色） |
| `AmountInput` | `components/AmountInput.vue` (90 行) | 千分位显示 + 受控精度；**编辑时保持光标位置**（插逗号后光标不能跳到末尾）；粘贴带货币符号要清洗 |
| `AutoRefreshButton` | `components/AutoRefreshButton.vue` (86 行) | 可选间隔 + 倒计时显示；标签页隐藏时暂停（`visibilitychange`），回来立即补一次；卸载清定时器 |
| `NavigationProgress` | `components/NavigationProgress.vue` (75 行) | 路由切换顶部进度条；**短切换不闪**（延迟 ~150ms 才显示）；接 react-router 的 navigation 状态 |
| `DateRangePicker` | `components/DateRangePicker.vue` | 区间选择 + 快捷档（今日/7天/30天/自定义）；`date-picker.tsx` 现在只有单日，OA 的筛选与报表到处需要区间 |

`ImageUpload` 单列一句：原型那版的价值在**头像 20KB 硬压缩**（256→96px × 0.8→0.3 质量逐档降，
按 dataURL base64 长度 ×0.75 估字节，压不下去报错而不是静默截断）。CloudFlow 有没有上传组件
要先查（`grep -rl 'type="file"' src/`）；若已有则只把压缩逻辑抽成 `utils/compressImage.ts` 复用。

验证：每个组件接进一个真实调用点（`AmountInput` → 合同金额、`DateRangePicker` → 一个报表筛选、
`NavigationProgress` → `App.tsx`），浏览器里点一遍。

#### 落地记录

新增 `DefaultAvatar.tsx`、`AmountInput.tsx`、`AutoRefreshButton.tsx`、
`NavigationProgress.tsx`、`DateRangePicker.tsx`，统一由 `components/common/index.ts` 导出；
共享交互样式放在 `common-primitives.css`，默认头像尺寸与稳定哈希色补到原有
`styles/features/default-avatar.css`。

| 组件 | 实际接入 | 保留的关键行为 |
|---|---|---|
| `DefaultAvatar` | `HeaderUserMenu.tsx`、`ProfilePage.tsx` | 姓名首字 + FNV-1a 稳定哈希取 8 色；同名同色，补齐 xs-xl 五档 |
| `AmountInput` | `ContractPage.tsx` 的合同金额 | 千分位、0-20 位受控精度、货币符号粘贴清洗；用“光标前可编辑字符数”映射格式化后的新位置 |
| `AutoRefreshButton` | `PerformanceStats.tsx` | 30/60/300 秒档、倒计时、隐藏暂停、恢复立即补刷、卸载清计时器、防并发刷新 |
| `NavigationProgress` | `App.tsx` | 直接订阅 data router 状态；150ms 后才显示，完成到 100% 后 220ms 淡出 |
| `DateRangePicker` | `PerformanceStats.tsx` | 今日/最近 7 天/最近 30 天/自定义；区间校验、Esc/点外关闭、视口内自动上下定位 |

浏览器行为验证通过：`¥ 12,345.67` 清洗为数值 `12345.67`；在 `12,345.67` 的第 2 个字符后
插入 `9` 后显示 `129,345.67`、光标停在第 3 位；最近 7 天得到
`2026-08-01 ~ 2026-08-07`；2 秒档在 2.4 秒内执行 2 次（开启立即 1 次 + 到期 1 次）；
导航切换 100ms 不显示、190ms 显示、结束 260ms 后隐藏；同名头像计算色完全一致。
亮/暗截图均检查过，货币前缀首位遮挡问题已在截图后修正。

`ImageUpload` 审计结论：项目已有通用 `FileUpload.tsx`，但当前没有头像上传 UI 与头像上传端点。
20KB/96px 的硬压缩规则只适用于头像，套到合同等业务附件会破坏原文件；因此本批不新增无调用点的
`ImageUpload` 或死工具函数，待头像编辑能力立项时与后端端点一起落地。

验证：`npx tsc --noEmit` 退出码 **0**；`npm run build` 成功（3354 modules）。

### P2 表格吸顶收尾（接上重构第 5 项的欠账）

**状态：✅ 已完成（2026-08-07）**

`.cf-table-sticky-header` 的 CSS 已经对了，缺的是**滚动视口**。交付一个
`components/common/TableScrollArea.tsx`：`max-height` + `overflow:auto` 的容器，
纵向滚动收进容器内，同时按原型 `DataTable.vue` 的做法补两个细节：

- **`.is-scrollable` 才出边界渐变**：不溢出时不画遮罩，否则短表格右侧凭空多一道阴影
- 冻结列的 `left/right` 偏移要在容器坐标系内算，和 `useFrozenColumns` 配合时别双算

接入范围：**挑 3-5 张数据行最多的表**先接。候选按「列表行数天然最多」筛：考勤记录、
审批流水、操作日志、缓存监控明细——具体挑哪几张开工时用
`grep -rln "<table" src/pages | xargs wc -l | sort -rn | head` 定。

验证：这一项**必须在浏览器里看**（吸顶 + 冻结列的交叉格层级、渐变遮罩、暗色底不透光），
纯类型检查看不出来。接完再决定是否单独立项推广到 189 张。

#### 落地记录

新增 `components/common/TableScrollArea.tsx` 与独立样式：短表保持自然高度，长表超过
`clamp(20rem, 52vh, 34rem)` 后在容器内滚动；用 `ResizeObserver + MutationObserver`
检测真实横向溢出，仅此时添加 `.is-scrollable` 与冻结边界渐变。

首批接入操作日志、登录日志、审计日志、缓存 Key 列表 4 张表，统一开启吸顶表头与首末列冻结。
`InnerTableSurface` 增加 `disableScrollWrapper`，避免页面默认滚动层与 `TableScrollArea`
形成双滚动坐标系；每张表保留原定最小宽度，窄视口下才能稳定触发横向滚动。

浏览器测试壳在 `scrollTop=260`、`scrollLeft=280` 时实测：表头偏移 `0px`、首列偏移
`0px`、末列偏移 `8px`（滚动条预留宽度），`.is-scrollable=true`；亮暗两套冻结表面均为
不透明背景。测试同时发现原有吸顶规则位于较低优先级 CSS layer，匹配选择器后计算结果仍是
`position: static; top: auto`，现已把完整层级规则收口到 `TableScrollArea.css` 并补颜色回退值。

验证：`npx tsc --noEmit` 退出码 **0**；`npm run build` 成功（3356 modules）。

### P3 TOTP 两步验证（全栈立项）

**状态：✅ 已完成（2026-08-08）**

原型已经从 i18n 逆出完整流程，直接照着实现，不用再猜：

| 阶段 | 规则 |
|---|---|
| 启用 | 拉 setup 拿 secret + otpauth URI → 扫码（或手输密钥）→ 输 6 位 → 验证 → 启用成功 |
| 错误 | `setupFailed`（拉设置失败）与 `verifyFailed`（码错）是**两种不同错误**，不能合并成一个 toast |
| 前置 | 启用前要先验身份（输当前密码）；卡片有**三态**：功能未开放 / 未启用 / 已启用 |
| 禁用 | 明确警示会降低安全性 + **必须输当前密码** 才能关 |
| 登录 | 密码校验通过后发**临时凭证**，前端拿它 + 6 位码换正式会话；关掉弹窗等于放弃本次登录 |

**后端（`cloudflow-auth`）**

- 建表：新增 `sys_user_totp`（`user_id` 主键、`tenant_id`、`secret`、`enabled`、`enabled_time`、
  审计字段）。**不往 `sys_user` 里加字段**——密钥是敏感 1:1 数据，单表便于后续加恢复码/审计。
  项目未上线，按既有约定**直接改 `DB/01.cloudflow-common.sql` 的建表语句，不写迁移脚本**。
- 依赖：现在**没有**可用的 codec/otp 依赖。加 `commons-codec`（Base32，版本写死）后按
  RFC 6238 手写约 60 行 HMAC-SHA1 TOTP（时间步 30s、容忍 ±1 步）。别引来源不明的小众 totp 包。
- 端点：`POST /auth/totp/setup`、`POST /auth/totp/verify-setup`、`POST /auth/totp/disable`，
  以及登录链路改造：`/login` 在已启用 TOTP 时返回临时凭证（放 Redis，短 TTL），
  新增 `POST /auth/login/totp` 用临时凭证 + 6 位码换 sa-token 会话。
- 数据访问**必须走 XML mapper 或 MyBatis-Plus**，不许在 Java 里拼 SQL 字符串。
- secret 落库前加密（`cloudflow-common-config-secret` 已有能力，沿用它而不是自造）。

**前端**

- 三件套按 React 重写：`TotpSetupModal`（扫码/手输/验码三步）、`TotpDisableDialog`（要密码）、
  `TotpLoginModal`（6 个数字格、自动前进、满 6 位自动提交、失败清空并聚焦第一格），
  加一张 `ProfileTotpCard`（三态）挂到个人资料页。
- 二维码：两边都没有 QR 库。**推荐后端不返图**，前端加一个 `qrcode` npm 依赖把 otpauth URI
  渲染成 canvas/svg（版本写死）。同时保留「手输密钥」通道，扫不了码时可用。

验证：`npx tsc --noEmit` 0 错误；`mvn -pl cloudflow-auth -am compile` 退出码 0；
用真实 Authenticator App 走一遍启用→退出→登录→禁用全流程（模拟器测不出时间步问题）。

#### 落地记录

后端新增独立的 `sys_user_totp` 表与 MyBatis-Plus 数据访问层，密钥使用 AES-GCM 加密落库；
动态码遵循 RFC 6238（HMAC-SHA1、30 秒时间步、容忍前后各 1 步）。登录密码校验通过后仅签发
Redis 中有效期 300 秒、验证成功即删除的临时凭证，动态码验证成功后再签发正式会话。

个人中心新增双因素认证安全卡片与设置、启用、禁用流程，均要求当前密码；设置弹窗提供二维码与
手输密钥两种通道。登录页新增 6 位动态码弹窗，支持逐格输入、粘贴、自动提交、失败清空并回焦。
桌面端与移动端使用同一套真实接口和状态，不保留仅供演示的分支。

安全收尾包括：验证码空值校验、禁用操作审计、`/login/totp` 共享安全白名单、敏感字段脱敏、
临时凭证单次消费、`3099` 本地跨域白名单、动态限流计数丢失 TTL 后的自动修复，
以及删除 Java 查询中的 SQL 尾部拼接。

#### 验证记录

- 真实接口链路 8 项通过：设置、启用、密码登录触发 TOTP、签发临时凭证、动态码换正式会话、
  查询启用状态、禁用、恢复未启用状态
- `mvn -pl cloudflow-auth -am install -DskipTests` 与 `npx tsc --noEmit` 退出码均为 **0**；
  `npm run build` 成功
- Playwright 在 Chromium `139.0.7258.5` 下完成桌面 `1440×1000` 与手机 `390×844` 检查，
  两个视口横向溢出均为 **0**，二维码、卡片与移动弹窗显示正常；用户目视确认符合审美

### 全批次交叉审计与缺陷修复（2026-08-09）

**状态：✅ 已完成**

五项全部落地后做了一轮独立审计（后端 TOTP 安全 / 后端网关配置 / 前端六项重构 / unity2 四项），
再逐条复核审计结论。**审计报的问题里有 6 条经复核不成立**，教训见下方「审计本身的教训」。

#### 确认并已修复的 6 项

| # | 问题 | 位置 | 修法 |
|---|---|---|---|
| 1 | 验证码可重放：`verifyCode` 只算不记，被消费的是 tempToken 不是码，同一码在 ±1 步窗口（最长 90 秒）内可反复用 | `TotpService.java` | 加 `last_used_step` 列，`matchStep` 返回步长 + `consumeStep` 条件更新原子消费 |
| 2 | 验证码错误不消费凭证 + 无账号锁定，单凭证可在 300 秒 TTL 内枚举；IP 限流换 IP 即失效 | `AuthController.java` | 失败即 `discardLoginChallenge` + `loginLockService.recordFailure` |
| 3 | `beginSetup` 静默覆盖未启用 secret，多端并发设置时先扫的设备拿失效密钥反复报错 | `TotpService.java` | 覆盖时清 `enabledAt`/`lastUsedStep`，`TotpSetupVO` 返 `regenerated` 让前端提示 |
| 4 | 关闭 2FA 无任何通知（异地登录反而有），攻击者可静默削弱账号防护 | 新增 `SecurityChangeNoticeService` | 启用/禁用都发站内提醒，沿用 outbox 事件模式 |
| 5 | 密钥无法灰度轮换，`v1:` 只标密文格式不标密钥版本，轮换将致全部 2FA 用户 500 | `TotpSecretCipher.java` | 加 `previous-encryption-keys`，解密依次试当前与历史密钥（GCM tag 保证不会解出错误明文） |
| 6 | `index.html` importmap 残留 `@google/genai` CDN 映射，与 CSP 收紧冲突 | `index.html` | 删掉整块 importmap（Vite 已打包，属死配置） |

顺带修：`TotpSetupModal` 的 `copySecret` 缺异常处理（非 HTTPS 时按钮「点了没反应」）；
`AuthPage` 的 `setTotpChallenge(null)` 从 `await login()` 之前移到之后（原来网络抖动会让弹窗关闭且错误无处显示）。

#### 复核后推翻的 6 条误报（**别再重复调查**）

| 误报 | 为何不成立 |
|---|---|
| Tooltip 悬停内部 svg 导致「永不消失」 | `Tooltip.tsx:402` 用的是 `target.closest('[data-tooltip]')` 而非裸 `event.target`，`closest()` 正常上溯到 anchor |
| `table.tsx` 包裹层无高度约束致吸顶失效 | 四个 `stickyHeader` 调用方**全传了 `disableScrollWrapper`**，该 div 根本不渲染 |
| `cf-table-sticky` 被 hook 摘掉致 `border-collapse` 丢失 | 四个调用方**全传了 `pinnedColumns={{left:1,right:1}}`**，`left===0&&right===0` 条件不成立 |
| `useFrozenColumns` ResizeObserver 无限回调 | 类名根本不会变，这条链的起点不存在（原报告自己也写了「侥幸不成立」） |
| 依赖数组缺 columns 致列数变化不重算 | MutationObserver 的 `childList` 已兜底（原报告自己也承认「实际被覆盖了」） |
| `safe-area-bottom` 拆分丢失 | 旧 `index.css:182` 那段是 `.pb-safe`（一路健在）；`.safe-area-bottom` 只在 `styles/responsive.css`，而该文件**在本批改动之前就没被 import**，是历史遗留 |

另有一条**下调定性**：`@Audit` 静默丢弃审计日志（无 `spel` → `oldVal=null` → `changes.isEmpty()` 短路）。
链路属实，但 `SysConfigServiceImpl:155`、`SysFileServiceImpl:199` 等既有删除操作全是同一写法，
属既有审计基盘的固有行为，**不是这批引入的**，要修是独立立项。

#### 审计本身的教训

三个审计 agent 报的问题里 6 条经复核不成立，比例过半。两类典型：
1. **读了一半就下结论** —— Tooltip 那条看了 `el === anchor` 就报，没往上看 `resolve()` 用的是 `closest()`。
2. **不看实际调用方** —— sticky 的两条都是「组件默认行为有问题」，但四个调用方全都传了规避该默认值的 props。

**结论：审计报告必须逐条复核到实际代码与实际调用点，不能直接采信。**

#### 量化核实（文档声明 vs 实测，全部属实）

| 声明 | 实测 |
|---|---|
| 原生 `title` 453 → 0 | **0**（454 处 `data-tooltip`；另有 731 处 `title=` 全是 React 组件 props，codemod 未误伤） |
| `dark:text-<中性>` 1940 → 28 | **28** |
| 中性色原子类 → 2076 | **2080** |
| `index.css` → 13602 行 | 13697 |
| CSS 2 → 34 个 | 产物 **34** |
| 产物 API key → 0 | **0** |
| 暗色槽 1 ≠ `#38b8d4` | `#22a2bf`；`38b8d4` 仅存于注释警示 |

`src/` 下有 47 个 CSS 文件而非 34 —— 差额是 `styles/features/` 等非路由级文件，产物侧确为 34，不矛盾。

## 明确不移植（及理由）

原型侧一共复刻了 174 个上游组件，其中绝大多数对 OA 没有意义，逐类说明避免以后重新纠结：

| 不移植 | 数量 | 理由 |
|---|---|---|
| AI 网关业务组件（配额/用量/分组/模型/支付订单/用户/账号池/监控/运维/数据备份） | 107 | CloudFlow 是 OA，没有对应业务对象，搬过来是死代码 |
| OAuth 第三方登录 + 条款同意机制 | 13 | 内网 OA 走统一登录；条款 CloudFlow 已有**服务端版本化发布**（`sys_legal_release`），比上游的前端拼 revision 更规范 |
| 公告/横幅 | 5 | CloudFlow 现有公告体系（Bell/Hub/Popup/DetailModal/ManageTable/ReadStatus）比上游完整 |
| `HelpTooltip` | 1 | CloudFlow 的 `Tooltip.tsx` 已用视口坐标 + fixed，**正确性优于上游**（上游那版混用 `scrollY`，只在 scrollY=0 时对） |
| `Icon` 语义名表（82 条 Heroicons 名） | 1 | 326 个 tsx 直接用 lucide-react；包一层要全库 codemod，收益不明 |
| vue-i18n / 6632 条 locale | — | CloudFlow 中文单语；引 react-i18next 是独立立项，不塞进这批 |
| driver.js 新手引导 | — | 本批不做（步骤内容需要业务方给）；原型侧已有完整步骤模型可随时取用 |

## 全局约束

- 项目**未上线**，不做旧数据兼容、不留迁移层，一律根因彻底修复（见记忆 `project-not-launched-no-compat`）。
- 本轮**不纳入补测试工作**（见记忆 `feedback_p2_execution_preferences`）。
- 后端禁止 Java 拼接 SQL 字符串（见记忆 `feedback_no_inline_sql`）。
- 每步收尾必须跑 `cd cloudflow-frontend && npx tsc --noEmit`，退出码须为 0；涉及后端的跑 `mvn -pl cloudflow-auth -am compile`。
- 色板类改动一律跑 dataviz 的 `validate_palette.js` 复算，**不手调**。
- 每完成一项：先回写本文档「进度总览」+ 该项「状态/落地记录」，再做下一项；同时更新记忆文件 `upstream-sync-progress.md` 的批次 21 状态。

## 风险与注意

1. **P2 会改变列表页的滚动手感**（纵向滚动从页面移进容器）。只接 3-5 张，接完先看，
   不满意就退回——所以这几张要挑得有代表性，别一上手就挑最重要的业务页。
2. **TOTP 改登录链路**是这批唯一碰到关键路径的改动。临时凭证的 TTL、重放防护、
   与 sa-token 现有会话的衔接要单独想清楚，别顺手改成「登录接口多返一个字段」了事。
3. Tailwind 版本差异：原型是 v3（`tailwind.config.js`），CloudFlow 是 v4（CSS-first `@theme`）。
   搬 token 时**不要**把原型的 config 片段直接抄进来，要翻译成 v4 的写法。
4. 原型的组件都是 emit-up 风格（页面处理副作用），CloudFlow 用 zustand + react-query。
   重写时按 CloudFlow 的数据流走，不要把 Vue 的 props/emit 结构照搬成一堆回调 prop。
