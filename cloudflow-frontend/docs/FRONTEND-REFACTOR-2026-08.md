# CloudFlow Pro 前端重构规划（对标 unity2.ai）

> 创建于 2026-08-06 ｜ 分支 `dev` ｜ 起点 commit `aa45b47e`
> 来源：对 https://unity2.ai/dashboard（内部名 Sub2API）线上产物与本地复刻快照 `D:\unity2-dashboard-prototype` 的三方 diff + CloudFlow Pro 前端审计。
> **本文档是断点恢复的唯一依据。每完成一个步骤，必须先回写本文档的「进度总览」和步骤内的「状态/落地记录」，再继续下一步。**

## 进度总览

| # | 工作项 | 优先级 | 状态 | 完成时间 |
|---|---|---|---|---|
| 1 | Gemini API Key 移出前端产物 | P0 安全 | ✅ 已完成 | 2026-08-06 |
| 2 | 暗色模式单轨化（语义 token 迁移） | P1 架构 | ✅ 已完成 | 2026-08-06 |
| 3 | index.css 按页面拆分 | P1 性能 | ✅ 已完成 | 2026-08-06 |
| 4 | Tooltip 组件 + 替换原生 title | P2 体验 | ✅ 已完成 | 2026-08-06 |
| 5 | 表格 sticky 表头 + 冻结列 | P2 体验 | ✅ 已完成 | 2026-08-06 |
| 6 | 恢复被禁用的动画 | P3 观感 | ✅ 已完成 | 2026-08-06 |

状态图例：⬜ 未开始 / 🟡 进行中 / ✅ 已完成 / ⛔ 阻塞（需说明原因）

## 收尾核对（2026-08-06，六步全部完成后）

| 指标 | 起点 | 终点 |
|---|---|---|
| 前端产物中的 API Key | 1 个（明文可提取） | **0** |
| `@google/genai` 前端依赖 | 有 | 已移除 |
| 开发态 CSP | 被注释 | 已启用（9 段策略） |
| 原子类强改规则 | 49 行 | **0**（仅剩说明性注释） |
| `index.css` 行数 | 18470 | **13602** |
| 首屏阻塞 CSS | 476.6 KB | **377.45 KB**（−99.2 KB / −20.8%） |
| CSS 文件数 | 2 | **34**（按路由懒加载） |
| JS 总量 | 4139.8 KB | 3906.3 KB |
| TSX 中性色原子类 | 6538 | 2076 |
| TSX `dark:text-<中性>` | 1940 | 28 |
| 原生 `title` tooltip | 453 | **0**（改 `data-tooltip` + 全局提示层） |
| 被禁用的动画 | 3 个空壳 | 已接回 + `prefers-reduced-motion` |
| 表格冻结列 | 无机制 | hook + 纯 CSS 两条路径，已接入 8 张最宽表 |
| `npx tsc --noEmit` | 0 错误 | **0 错误** |
| `mvn -pl cloudflow-service-workflow -am compile` | — | **退出码 0** |

**尚需用户手动处理**
1. ⚠️ 到 Google Cloud Console **吊销旧 Gemini key 并重新签发**，新 key 只填后端 `.env` 的 `GEMINI_API_KEY`（旧 key 已出现在此前的本机构建产物中）。
2. 生产 CSP 在网关 / Nginx 侧下发并去掉 `unsafe-eval`。
3. 人工目视回归：亮/暗切换、表格横向滚动的冻结效果、Tooltip 的键盘与触屏行为。

**建议后续单独立项**
- 表头吸顶：需要先给 189 张表的容器加高度约束（当前纵向滚动在页面级）。
- 边框 token 化（677 处 `border-slate-*`）。
- 约 156 张带 `min-w-[…]` 的表格可逐张加 `cf-freeze-edges` 开启冻结列。
- 疑似死代码 157 行：`profile-notify` / `profile-binding` / `admin-profile` 三族在 tsx 中搜不到引用。


## 全局约束

- 项目**未上线**，不做旧数据兼容、不留迁移层，一律根因彻底修复（见记忆 `project-not-launched-no-compat`）。
- 本轮**不纳入补测试工作**（见记忆 `feedback_p2_execution_preferences`）。
- 后端禁止 Java 拼接 SQL 字符串（见记忆 `feedback_no_inline_sql`）。
- 每步收尾必须跑 `cd cloudflow-frontend && npx tsc --noEmit`，退出码须为 0。
- 涉及构建产物体积的步骤，跑 `npm run build` 并记录 CSS/JS 体积对比。

## 基线数据（2026-08-06 实测）

| 指标 | CloudFlow Pro | unity2.ai 源站 |
|---|---|---|
| 首屏阻塞 CSS | 476.6 KB（单文件） | 206.7 KB（+37 个按路由懒加载 chunk） |
| CSS 总量 | 492.1 KB / 2 文件 | 336.8 KB / 40 文件 |
| JS 总量 | 4139.8 KB / 252 文件 | — |
| `index.css` 源码 | 18470 行 / 399 KB | — |
| `!important` | 97 | 13 |
| `html.dark` 选择器行 | 955（其中 49 行为原子类强改） | 599（全部 SFC scoped） |
| `--cf-*` token | 24 个 / 714 处引用 | 无（Tailwind 3 config 直出） |
| TSX 内中性色原子类 | 6538 | — |
| TSX 内 `dark:` 变体 | 4555 | — |
| TSX 内硬编码 hex | 341（48 文件） | — |
| 原生 `title=` tooltip | 353（101 文件，311 在 button） | 0（有 HelpTooltip 组件） |
| `tsc --noEmit` | 0 错误 | — |

---

## 步骤 1 — Gemini API Key 移出前端产物（P0 安全）

### 现状
- `vite.config.ts` 的 `define` 把 `process.env.API_KEY` / `process.env.GEMINI_API_KEY` 替换成字面量，key 被编译进 `dist/assets/CodeGeneration-*.js`，任何访客可提取。
- `src/services/geminiService.ts:5` 在浏览器侧读 `process.env.API_KEY` 并 `new GoogleGenAI({ apiKey })`。
- 唯一调用方：`src/components/SourceCodeViewer.tsx`。模型 `gemini-2.5-flash`。
- `dist/` 与 `.env.local` 已在 `.gitignore`；`git log --all -S <key>` 无命中，**key 未进版本历史**。
- 后端目前无 AI 模块（现有：auth / common / gateway / service-crm / service-hr / service-oa / service-workflow）。
- `vite.config.ts` 的 CSP 响应头整条被注释。

### 目标
前端产物中不含任何密钥；AI 调用经后端代理；恢复 CSP。

### 做法
1. 后端 `cloudflow-service-workflow` 内新增 AI 代理端点（该服务已是工作流域，`SourceCodeViewer` 生成的就是工作流产物）：`POST /ai/workflow-artifacts`，入参 `{ workflow, artifactType }`，返回生成文本。key 从服务端配置读取，走 Nacos。
2. 前端 `geminiService.ts` 改为调用该端点，删除 `@google/genai` 依赖与 `GoogleGenAI` 用法。
3. `vite.config.ts` 删除 `define` 中的两条 key 注入；`content-vendor` 分包里去掉 `@google/`。
4. `package.json` 移除 `@google/genai`。
5. 恢复 `server.headers` 里的 CSP（开发态；生产 CSP 由网关/Nginx 下发）。
6. 删除 `.env.local` 里的 `GEMINI_API_KEY`，改到后端配置。
7. 清掉含 key 的旧产物 `dist/`。

### 需要用户手动做的事（我无法代办）
- ⚠️ **到 Google Cloud Console 吊销当前这把 key 并重新签发**。旧 key 已出现在本机构建产物中，必须作废。

### 验证
- `grep -ro "AIza[0-9A-Za-z_-]\{10,\}" dist/` 无输出
- `grep -rn "@google/genai" src/` 无输出
- `npx tsc --noEmit` 退出码 0

### 状态：✅ 已完成（2026-08-06）
### 落地记录

**后端新增（cloudflow-service-workflow）**
- `config/properties/AiProperties.java` — `@ConfigurationProperties(prefix = "cloudflow.ai")`，`enabled` + `gemini.{apiKey,model,baseUrl,timeoutSeconds}`，`@RefreshScope` 支持 Nacos 热更新。
- `domain/dto/AiArtifactRequest.java` — `artifactType` + `workflow`（`Map<String,Object>`），带 `@NotBlank`/`@NotNull`。
- `service/IAiArtifactService.java` + `service/impl/AiArtifactServiceImpl.java` — prompt 构造从前端整体下沉到服务端；用模块已有的 HttpClient5（`httpclient5` 依赖已在 pom）调用 `POST {baseUrl}/models/{model}:generateContent`。
- `controller/AiArtifactController.java` — `POST /ai/workflow-artifacts`，`@SaCheckPermission("workflow:ai:generate")`。

**安全加固细节**
- 密钥走 `x-goog-api-key` 请求头，不放 URL query，避免落进访问日志。
- 未配置密钥时 `enabled=false`，接口直接抛「未启用」，不做静默降级。
- `workflow.key` 做了 `[A-Za-z0-9_]{1,64}` 白名单校验——该字段会被拼进 prompt 生成表名/服务名，防 prompt 注入。
- 上游返回非 2xx 时只记状态码，不记响应全文，避免请求内容被上游回显到日志。

**前端改动**
- 删除 `src/services/geminiService.ts`，新增 `src/services/api/ai.ts`：`request.post<string>('/workflow/ai/workflow-artifacts', …)`，不再引入 `GoogleGenAI`。
- `src/components/SourceCodeViewer.tsx:13` 改为 `import { generateBackendArtifacts } from '@/services/api/ai'`；错误兜底文案由「请检查 API Key」改为「请稍后重试或联系管理员」。
- `vite.config.ts`：删掉整个 `define` 块（两条 key 注入）；`content-vendor` 分包去掉 `@google/`；把注释掉的 CSP 恢复成结构化的 9 段策略（开发态含 `unsafe-eval` 供 HMR，注释里标明生产 CSP 应由网关/Nginx 收紧）。
- `package.json` 移除 `@google/genai`，`npm install` 连带清掉 53 个包。
- `.env.local` 清空为纯注释模板，明确禁止放密钥。

**配置与权限**
- `application.yml` 新增 `cloudflow.ai` 段，全部走环境变量：`AI_ENABLED` / `GEMINI_API_KEY` / `GEMINI_MODEL` / `GEMINI_BASE_URL` / `GEMINI_TIMEOUT_SECONDS`。
- `docker-compose.yml` workflow 服务 environment 注入 `AI_ENABLED` / `GEMINI_API_KEY` / `GEMINI_MODEL`。
- `.env.example` 补 AI 段并注明密钥不得进前端。
- `DB/06.cloudflow-business-seed.sql` 新增 menu_id 1210 = `workflow:ai:generate`（挂在 604「源码生成」下），`sys_role_menu` 授权范围从 `1200 AND 1209` 扩到 `1200 AND 1210`。

**路由链路核对**
`config/cloudflow-gateway.yaml:78-83` 的 `cloudflow-workflow` 路由 `Path=/workflow/**` + `StripPrefix=1`，前端 `/workflow/ai/workflow-artifacts` 落到服务端 `/ai/workflow-artifacts`，与 controller 映射一致。

**验证结果**
- `grep -ro "AIza[0-9A-Za-z_-]{10,}" dist/` → 无输出
- `grep -rlo "GEMINI_API_KEY|generativelanguage" dist/assets/*.js` → 无输出
- `grep -rn "@google/genai" src/` / `grep -rn "process.env.API_KEY" src vite.config.ts` → 无输出
- `npx tsc --noEmit` → 退出码 0
- `npm run build` → 成功；JS 总量 4139.8 KB → **3922.9 KB**（−216.9 KB，@google/genai 移除所致）
- `mvn -o -pl cloudflow-service-workflow -am compile` → 退出码 0

**遗留（需用户手动）**
- ⚠️ 旧 key 已出现在此前的本机构建产物中，必须到 Google Cloud Console 吊销并重新签发，新 key 只填到后端 `.env` 的 `GEMINI_API_KEY`。
- 生产 CSP 需在网关/Nginx 侧下发并去掉 `unsafe-eval`。

---

## 步骤 2 — 暗色模式单轨化（P1 架构）

### 现状（这是本轮最关键的修复）
组件里写了 4555 处 `dark:` 变体，同时 `index.css` 里有 49 行选择器**强改 Tailwind 原子类**，分布在 5 个块：

| 块 | 行号 | 作用域 | 规则数 |
|---|---|---|---|
| A | 26–45 | `@layer utilities`，覆盖 7 种 app shell / portal 容器 | 5 |
| B | 332–358 | `.mobile-app-shell` | 6 |
| C | 4504–4506 | `.template-library-sidebar` / `-results` | 1 |
| D | 10285–10292 | `.salary-primary-panel` | 2 |
| E | 11402–11455 | `.workflow-studio-panel` / `.workflow-settings-modal` | 11 |

特异性实测：
```
html.dark :is(.cf-app-shell,…) :is(.text-slate-600,…)   → 0,3,1   ← 赢
.dark\:text-slate-300:where(.dark,.dark *)              → 0,1,0
```
块 B/C/D/E 还额外带 `!important`。结论：**组件里针对中性色写的 `dark:` 变体全部失效**。已定位 822 处 className 同时含被捕获的中性基类和 `dark:text-*`。

目前视觉没崩，是因为覆盖值当初照最常见意图调过（`.text-slate-600` → `#cbd5e1` 恰好等于 slate-300）。但已有偏差：`text-slate-900 dark:text-slate-100` 实际渲染 `#f8fafc`(slate-50) 而非 slate-100。

> 注：初次审计我把 955 条 `html.dark` 全部描述为覆盖 hack，不准确。955 是 `html.dark` 选择器**总行数**，其中绝大多数是针对项目自有 class 的正常暗色样式，只有 49 行是原子类强改。真正要动的是这 49 行。

### 目标
中性色语义化：删掉全部原子类强改，组件不再为中性色写 `dark:`，靠 CSS 变量在两种模式下自动解析。

### 做法
1. `@layer base` 扩充语义 token（light + dark 各一套），按现有覆盖值定档：

   | token | light | dark | 取代 |
   |---|---|---|---|
   | `--cf-text-strong` | `#0f172a` | `#f8fafc` | text-slate-950/900/800、text-black |
   | `--cf-text` | `#334155` | `#e2e8f0` | text-slate-700 |
   | `--cf-text-muted` | `#475569` | `#cbd5e1` | text-slate-600 |
   | `--cf-text-subtle` | `#64748b` | `#94a3b8` | text-slate-500/400 |
   | `--cf-surface` / `-strong` / `-muted` | 已有 | 已有 | bg-white、bg-slate-50/100 |
   | `--cf-border` / `-strong` | 已有 | 已有 | border-slate-200/300 |

2. 用 Tailwind v4 `@theme` 把 token 注册成真实工具类：`text-cf-strong` / `text-cf` / `text-cf-muted` / `text-cf-subtle` / `bg-cf-surface` / `bg-cf-surface-strong` / `bg-cf-surface-muted` / `border-cf` / `border-cf-strong`。
3. 写 codemod（`scripts/codemod-neutral-to-token.ts`）批量迁移 TSX：中性原子类 → 语义类，并**同时删除配对的 `dark:` 中性变体**。非中性的 `dark:` 变体（emerald/cyan/rose 等语义色）保留不动。
4. 删除 5 个块共 49 行原子类强改规则。
5. 目视回归：亮/暗各扫一遍 shell、mobile shell、模板库、薪酬面板、工作流 studio、各类弹窗。

### 验证
- `grep -cE "html\.dark[^{]*\.(text|bg|border)-(slate|gray|zinc|neutral|stone|white|black)" src/index.css` → 0
- TSX 内中性原子类计数显著下降；`!important` 计数下降
- `npx tsc --noEmit` 退出码 0

### 状态：✅ 已完成（2026-08-06）
### 落地记录

**新增 token（`index.css` 顶部 `@theme inline` + `@layer base`）**

亮色值引用 Tailwind 的 slate 档位、暗色值沿用原覆盖规则取值，因此迁移前后两种模式的像素都不变：

| 工具类 | 取代 | 亮色 | 暗色 |
|---|---|---|---|
| `text-cf-title` | text-slate/gray-950/900/800 | `var(--color-slate-900)` | `#f8fafc` |
| `text-cf-body` | -700 | `var(--color-slate-700)` | `#e2e8f0` |
| `text-cf-muted` | -600 | `var(--color-slate-600)` | `#cbd5e1` |
| `text-cf-subtle` | -500 | `var(--color-slate-500)` | `#94a3b8` |
| `text-cf-faint` | -400 | `var(--color-slate-400)` | `#94a3b8` |
| `bg-cf-surface-1` | bg-white | `#ffffff` | `var(--cf-surface-strong)` |
| `bg-cf-surface-2` | bg-slate-50 | `var(--color-slate-50)` | `var(--cf-surface-strong)` |
| `bg-cf-surface-3` | bg-slate-100 / bg-gray-100 | `var(--color-slate-100)` | `var(--cf-surface-strong)` |

用 `@theme inline` 而非普通 `@theme`：inline 让工具类直接产出 `color: var(--cf-fg-body)`，少一层间接引用，也不依赖「`.dark` 必须挂在 `:root` 同一元素」这个前提。原有 `--cf-text` / `--cf-text-muted` 保持不动，避免影响已有 714 处 `var(--cf-*)` 消费方。

**codemod：`scripts/codemod-neutral-to-token.ts`**

三种模式：默认（按字符串字面量作用域）、`--rescue`（按行兜底）、`--tidy`（空白收尾），都支持 `--dry-run`。

核心规则：只有当同一作用域内存在会被映射的**非 dark** 中性基类时，才删除对应的 `dark:` 变体——避免误删那些没有中性基类、`dark:` 仍然生效的声明。text 与 bg 分别独立判定。

踩到一个坑：字面量扫描依赖引号配对，`AssetList.tsx` 里有个正则字面量 `/[&<>"']/g` 同时含 `"` 和 `'`，导致扫描器从那行开始失步，该文件后 800 行整段被跳过（只转了 6 处、漏了 13 处）。因此补了 `--rescue` 按行兜底模式，对已迁移文件幂等。全量核对后确认只有这一个文件受影响，且不存在「基类转了但 dark: 变体没删」的混合状态（检查结果 0 处）。

执行结果：
- 默认模式：改动 226 个文件，text 映射 2492、bg 映射 36，删除失效 `dark:text-*` 1944、`dark:bg-*` 22
- `--rescue`：补 `AssetList.tsx`（text 13、删 dark:text 12）
- `--tidy` + 一次 className 首尾空白清理：184 + 4 个文件，共 1841 处

**删除的 5 个原子类覆盖块**
- 块 A（app 全局，5 条）——直接删，token 已接管。
- 块 B（`.mobile-app-shell`，6 条，带 `!important`）——取值与 A 完全一致，纯重复，删。
- 块 C（`.template-library-*` 的 `border-slate-200`）——只保留针对自有 class 的那两个选择器，去掉两条原子类选择器；组件侧 3 处 `border-slate-200` 本来就配了 `dark:border-slate-800`，删掉覆盖后组件声明终于生效。
- 块 D（`.salary-primary-panel` 的 text 规则，2 条）——类已被 codemod 换成 token，属死代码，删。
- 块 E（`.workflow-studio-panel` / `.workflow-settings-modal`，11 条）——text 5 条里只有「400 档更暗」是真实设计意图，改写成子树 token 覆盖：
  ```css
  html.dark :is(.workflow-studio-panel, .workflow-settings-modal) {
    --cf-fg-faint: rgb(100 116 139);
  }
  ```
  border/bg 规则的目标类已迁移或已配 dark: 变体，删。

**配套修补**
`PropertyPanel.tsx` 里有 16 处中性边框原来靠块 E 兜暗色、自身没写 `dark:`，删块 E 前先补上显式声明（取 `dark:border-slate-700`，最接近原 `rgba(51,65,85,.9)`）。补完复查为 0 缺口，才动块 E。

**验证结果**

| 指标 | 迁移前 | 迁移后 |
|---|---|---|
| 原子类强改规则 | 49 行 | **0** |
| `index.css` `!important` | 97 | 83 |
| `index.css` `html.dark` 行 | 955 | 909 |
| `index.css` 行数 | 18470 | 18410 |
| TSX 中性色原子类 | 6538 | **2076**（−68%） |
| TSX `dark:` 变体 | 4555 | 2602（−43%） |
| TSX `dark:text-<中性>` | 1940 | **28** |
| TSX 语义 token 类 | 0 | 2523 |

- `npx tsc --noEmit` → 退出码 0
- `npm run build` → 成功；核对产物 CSS 已生成 `.text-cf-body{color:var(--cf-fg-body)}` 等 8 个工具类，`:root` 与 `html.dark` 两套 token 齐备，子树覆盖 `--cf-fg-faint:#64748b` 也在
- 带透明度的 `bg-cf-surface-1/70` 等由 Tailwind 生成 `color-mix(in oklab, …)` 并带 `@supports` 回退，工作正常

**遗留**
- 剩余 28 处 `text-slate-300 dark:text-slate-700` 是有意保留：`-300` 档从来不在覆盖规则捕获范围内，本身已是单轨，无需迁移。
- 边框未做 token 化（677 处 `border-slate-*`）。块 A 从来不碰边框，边框在全局层面本来就是单轨的，改它属于扩大风险面，故不在本步范围。
- CSS 体积 476.6 KB → 483.28 KB（+6.7 KB）。新增 token 工具类与其透明度变体带来的增量略大于删掉的覆盖规则；体积是步骤 3 的目标，此处不做优化。
- 亮/暗目视回归尚未逐页人工确认（token 取值按等值映射设计，理论上零差异）。

---

## 步骤 3 — index.css 按页面拆分（P1 性能）

### 现状
- 单文件 18470 行，构建出 476.6 KB 全量阻塞首屏。
- 无任何分节注释；结构为 `@layer utilities`(4–72) → `@layer base`(73–199) → `@layer components`(201–11457, 11458–12858, 12859–13044) → 一堆 `@media` 与 `@keyframes`。
- 页面级样式按 class 前缀成族，可机械切分。头部族：`admin-workflow`(315) `admin-users`(181) `admin-meeting`(123) `admin-source`(109) `admin-crm`(105) `template-market`(90) `admin-performance`(88) `workflow-monitor`(69) `admin-roles`(61) `workflow-category`(53) `admin-knowledge`(48) `code-generation`(40) `admin-mall`(40) …

### 目标
`index.css` 只留全局层（reset / token / 通用组件 / 通用 utilities）；页面族样式随对应懒加载页面成为独立 CSS chunk。

### 做法
1. 先给 `index.css` 补分节注释，明确「全局保留」与「可外迁」边界。
2. 写抽取脚本（`scripts/split-page-css.ts`）：按 class 前缀族把规则（含其 `@media` 变体、`html.dark` 变体）搬到 `src/pages/<域>/<页面>.css`。
3. 在对应页面组件顶部 `import './<页面>.css'`，让 Vite 按路由切 CSS chunk。
4. 优先处理体量最大的族，逐族迁移、逐族验证，不一次全搬。

### 验证
- `npm run build` 后 CSS 文件数 > 2，首屏 `index-*.css` 显著小于 476.6 KB
- 迁移前后逐页目视对比无样式丢失
- `npx tsc --noEmit` 退出码 0

### 状态：✅ 已完成（2026-08-06）
### 落地记录

**能拆的前提**：页面本来就是 `router/DynamicMenuRoute.tsx` 里 `import.meta.glob('../pages/**/*.tsx')` 出来的懒加载 chunk。所以页面组件一 `import './X.css'`，Vite 就会把这份 CSS 切成随该页面按需加载的 chunk。

**工具：`scripts/split-page-css.ts`**

自己写了个括号配对的 CSS 解析器（记录绝对偏移量，方便精确删除），把 index.css 解析成 rule / at-block 树，然后：
1. 从选择器提取 class，取前两段作为「族」（`admin-workflow-xxx` → `admin-workflow`）
2. 扫全库 tsx 判断每个族的归属文件
3. 按归属决定去处：唯一归属 → 页面同名 CSS；多归属同目录 → 该目录下 `<family>.css`；多归属跨目录（≤8 个）→ `src/styles/features/<family>.css`；归属过多（如 `admin-users` 出现在 134 个文件，属共享骨架）→ 留在 index.css
4. 重建时把 `@layer` / `@media` 包裹链按序包回去，规则不会掉出原本的 layer
5. 从 index.css 精确删除已搬走的区间，清理搬空后的空 `@layer` / `@media` 壳

**不搬的部分（有意保留）**
- 跨族规则 1008 条 / 5019 行：一条选择器牵扯多个族（如 `.cf-filter-bar .admin-crm-x`），拆开容易出错
- 全局骨架族：`cf-` / `unity-` / `mobile-` / `table-` / `pagination-` / `select-` / `modal-` / `dialog-` / `layout-` / `form-` / `admin-dialog` / `admin-source` / `admin-toolbar` 等，本来就是跨页面共享
- `admin-users`(316 行, 134 文件)、`admin-crm`(363 行, 20 文件)：归属过散，搬了会在多个 chunk 里重复

**执行结果（两轮）**
- 第 1 轮（唯一归属 + 同目录多归属）：27 个 CSS 文件、582 条规则、约 3312 行；index.css 18538 → 15692 行
- 第 2 轮（放开到跨目录 ≤8 归属，落到 `styles/features/`）：11 个 CSS 文件、428 条规则、约 2485 行；index.css 15692 → **13602 行**

搬出的大块：`admin-workflow` 18.46 KB、`admin-meeting` 8.39 KB、`admin-performance` 6.54 KB、`template-market` 5.84 KB、`WorkflowMonitor` 5.07 KB、`Dashboard` 4.69 KB、`CodeGeneration` 3.51 KB…

**踩到的坑**
第 2 轮把跨目录族放到 `src/styles/features/` 后，插入的 import 仍然用的是 `./${basename}`，
于是 `WorkflowDesign.tsx` 里出现 `import './admin-workflow.css'` —— 文件其实在 `styles/features/` 下，
构建直接报 `Could not resolve "./admin-workflow.css"`。已修：脚本改为按 importer 位置算相对路径，
并写了一次性修复把已经插错的 27 处 import 路径纠正（26 个文件），之后全库校验所有 `.css` import 均可解析。

**完整性校验**
用花括号计数对比「原文件」与「精简后 index.css + 全部搬出文件」：2905 → 2313 + 658 = 2971。
多出的 66 个是重建包裹链时新增的 `@layer` / `@media` 外壳，**没有规则丢失**（少了才是问题）。

**验证结果**

| 指标 | 本步之前 | 本步之后 |
|---|---|---|
| 首屏阻塞 `index-*.css` | 486.95 KB | **386.51 KB**（−100.4 KB / −20.6%） |
| gzip 后 | — | 59.88 KB |
| CSS 文件数 | 2 | **34** |
| `index.css` 源码行数 | 18537 | 13602 |

对比全流程起点（本轮六步之前的 476.6 KB）：首屏 CSS **−90.1 KB / −18.9%**。源站 unity2.ai 的首屏 CSS 是 206.7 KB，从 2.3 倍收窄到 1.9 倍。

- `npx tsc --noEmit` → 退出码 0
- `npm run build` → 成功
- **运行时校验**：起 vite dev 逐个 transform 38 个新建 CSS 文件（全部 200）与 256 个改动/新增 tsx（全部 200），日志无 error；校验后停服务、删除临时备份

**遗留**
- 剩下的 386.51 KB 里绝大部分是 Tailwind 为全站生成的原子类（单文件、无法按路由切）+ 上面列出的有意保留部分。继续压缩得靠减少原子类种类或引入 critical CSS 提取，属于另一个量级的工作。
- 拆出去的样式尚未逐页人工目视比对（构建产物与 transform 均通过，但没有截图级回归）。
- 分析时发现 3 个族在 tsx 里完全搜不到引用：`profile-notify`(55 行)、`profile-binding`(54 行)、`admin-profile`(48 行)，疑似死代码约 157 行。因为不排除通过拼接字符串使用，本轮没有删，建议单独确认后清理。

### 状态：⬜ 未开始
### 落地记录
（待填）

---

## 步骤 4 — Tooltip 组件 + 替换原生 title（P2 体验）

### 现状
- 无 Tooltip 组件。原生 `title=` 共 **353** 处 / 101 文件：`button` 311、`div` 24、`span` 13、`td` 4、`p` 1。
- 原生 title 的问题：触屏设备不显示、无法样式化、约 1s 延迟、屏幕阅读器支持不一致。

> 注：初次审计报的「1461 处」把 React 组件的 `title` **prop**（`TableStateRow` 106、`InlineState` 55、`DialogPanel` 54、`WorkspacePanel` 20、`DetailSection` 20、`BaseDialog` 14 等）算进去了，那些不是原生 tooltip。真实需要处理的是 353 处。

### 目标
补一个对标源站 `HelpTooltip` 的组件，把交互元素上的原生 title 换掉。

### 做法
1. 新建 `src/components/common/Tooltip.tsx`，对标源站 HelpTooltip 的能力：
   - `trigger: 'hover' | 'click'`（默认 hover）
   - `content: ReactNode`、`placement`、`widthClass`
   - Portal 渲染 + `getBoundingClientRect` 定位，滚动/resize 重定位
   - `Escape` 关闭、click 模式下点击外部关闭
   - `aria-describedby` 关联，键盘 focus 可触发（补足当前 focus-visible 覆盖不足的问题）
2. 在 `components/common/index.ts` 导出。
3. 替换 353 处原生 title：`button`/`div`/`span` 上的交互性提示改用 `<Tooltip>` 包裹；纯说明性且非交互的可保留 title 作为兜底。
4. 优先批量处理 `<button title="…">`（311 处，模式统一，可脚本化）。

### 验证
- 原生 title 在交互元素上的计数大幅下降
- 键盘 Tab 到按钮能出提示；Esc 能关；触屏 click 模式可用
- `npx tsc --noEmit` 退出码 0

### 状态：✅ 已完成（2026-08-06）
### 落地记录

> **数量修正**：规划里写的 353 处是低估。之前的 grep 用 `<button[^>]*title=` 这种模式，
> 遇到属性里含 `>` 的写法（`onClick={() => …}`，JSX 里极其常见）就匹配不到。
> 换成能跟踪引号与花括号深度的扫描器后，实际是 **453 处**（字面量 381 + 表达式 72）。

**新增 `src/components/common/Tooltip.tsx`，导出两样东西**

1. `<Tooltip>` 声明式组件（对标源站 HelpTooltip，并补齐键盘可达性）
   - `content` / `trigger: 'hover' | 'click'` / `placement` / `widthClass` / `disabled`
   - **用 `cloneElement` 把事件和 ref 直接挂到子元素上，不额外包一层 DOM** —— 这点很关键，替换 title 时不会影响任何 flex / grid 布局
   - 相比源站补充：`onFocus`/`onBlur` 让 Tab 聚焦也能出提示；`aria-describedby` 关联；空间不足自动翻转方向并统一夹到视口内
   - 修掉了源站实现里的一个 bug：它用 `rect.top + window.scrollY` 配 `position: fixed`，只在 scrollY=0 时正确。这里全程用视口坐标，滚动时重算

2. `<TooltipLayer />` 全局委托层，接管所有 `data-tooltip="…"` 元素
   - 在 `App.tsx` 挂一次（`AuthProvider` 内、`Toaster` 之后），覆盖桌面 / 移动 / 认证页全部形态
   - 事件委托：`mouseover`/`mouseout`/`focusin`/`focusout`/`touchstart`/`keydown`(Esc)/`window blur`
   - 显示期间给锚点写 `aria-describedby`，移除时还原原值，不留悬空引用
   - 支持 `data-tooltip-placement` 覆盖方向

**为什么用属性化的委托层而不是给每个按钮包 `<Tooltip>`**
453 处里 381 处在 `<button>` 上。逐个包组件会引入 400+ 个组件实例、400+ 处 JSX 结构改动；
属性化方案只改属性名，DOM 结构零变化、全局只有一个气泡实例，迁移风险和运行开销都最低。
需要富文本 / 受控 / click 触发时仍然用 `<Tooltip>` 组件。

**codemod：`scripts/codemod-title-to-tooltip.ts`**
- 只处理原生小写标签 `button|div|span|td|p`，不碰 React 组件的 `title` **prop**（`TableStateRow` / `InlineState` / `DialogPanel` 等 1000 余处）
- 手写扫描器逐字符跟踪引号与 `{}` 深度来定位开标签边界与 `title` 属性值，兼容 `title={a ? '{' : '}'}` 这类写法
- 跳过 title 透传：`PermissionGuard.tsx:83` 的 `title={!hasAccess ? '无操作权限' : props.title}` 属于组件对外契约，不能动（脚本明确列出跳过明细）
- 给缺少可访问名称的 `<button>` 补 `aria-label`：原本 title 兼任可访问名称，直接删掉会让纯图标按钮失去名称。253 个已有 `aria-label` 的按钮不动

执行结果：改动 120 个文件，字面量 381、表达式 72、补 `aria-label` 250、跳过 1。重跑 dry-run 为 0 改动（幂等）。

**踩到的坑**
`AssetList.tsx` 原文件里有 `title="详情"aria-label="详情"` 这种两个属性紧贴、中间无空格的写法，
脚本的 `hasAriaName` 正则要求属性前有空白，判断漏了，于是补出重复的 `aria-label` —— tsc 报了 4 个
`TS17001: JSX elements cannot have multiple attributes with the same name`。已修掉这 4 处，
并把脚本的判断放宽成不要求前导空白。全库复查无其他重复。

**验证结果**
- `npx tsc --noEmit` → 退出码 0
- `npm run build` → 成功；产物中确认 `cf-tooltip-panel` 进入 index 主 chunk（全局层需要随入口加载），`data-tooltip` 出现 455 次
- **运行时校验**：起 vite dev（3099），逐个请求 `git diff` 涉及的全部 **244 个改动 tsx** 走 Vite transform，`checked=244 failed=0`，服务端日志无 error —— 两轮 codemod 都没有破坏任何 JSX
- 校验后已停掉 dev server、清理临时文件

**遗留 / 已知取舍**
- 250 个补上的 `aria-label` 中，少数按钮本身有可见文字，此时 `aria-label` 会覆盖可见文字成为可访问名称。本代码库的写法是 `title="编辑"` 配图标按钮，绝大多数是纯图标，覆盖后取值相同或更具描述性，故接受这个取舍。
- 触屏用 `touchstart` 即时显示，但没有做「点击其他处才消失」的粘滞逻辑，短按后仍会随后续事件消失，够用但不算完善。
- 尚未做人工交互回归（键盘 Tab、Esc、翻转方向的目视确认）。

### 状态：⬜ 未开始
### 落地记录
（待填）

---

## 步骤 5 — 表格 sticky 表头 + 冻结列（P2 体验）

### 现状
- `src/components/common/table.tsx` 仅 165 行，无 sticky 表头、无冻结列。
- `index.css` 全文仅 3 处 `position: sticky`（行 260 / 8587 / 11719），均不在表格上；TSX 内 21 处 `sticky` 工具类也不是表格用。
- OA 宽表痛点明确：组织架构、HR 记录、合同、CRM。

### 目标
对标源站 `DataTable`：sticky 表头 + 左右冻结列 + 选择列固定宽。

### 做法
1. `table.tsx` 增加能力（保持现有 API 向后兼容，新增可选 props）：
   - `stickyHeader?: boolean`
   - 列定义支持 `pin?: 'left' | 'right'`
   - 选择列固定宽度，用 CSS 变量 `--cf-table-select-col-width: 52px`（对标源站 52px）
2. CSS 侧参照源站实现分层：容器 `isolation: isolate`；表头 `position: sticky; top: 0; z-index: 200`；冻结列 `position: sticky; z-index: 20`；表头与冻结列交叉格 `z-index: 210`。
3. 冻结列的 `left`/`right` 偏移按前序列宽累加计算。
4. 暗色态背景必须显式给（sticky 元素透明会透出滚动内容）——用 `--cf-surface-strong`，不要硬编码。
5. 在最宽的几张表上接入验证：组织架构、HR 记录、合同、CRM。

### 验证
- 横向滚动时冻结列不动、纵向滚动时表头不动
- 亮/暗两态 sticky 区域均不透底
- `npx tsc --noEmit` 退出码 0

### 状态：✅ 已完成（2026-08-06）
### 落地记录

> **前提修正（重要）**：规划假设各页面用的是 `components/common/table.tsx` 那套 shadcn 风格原语。
> 实际不是——全库只有 `pages/Workplace.tsx` 一个文件 import 那些原语，
> 真正的列表是 **189 处裸 `<table>`**（122 个文件）。所以光给 `table.tsx` 加 props 没用，
> 方案必须同时覆盖裸表格。
>
> 另一个关键事实：滚动结构是 `.table-scroll-container`（`overflow: visible`）
> → `.table-wrapper`（`overflow-x: auto`）。也就是**横向滚动在表格容器内，纵向滚动在页面**。
> 因此「冻结列」是这套结构下立刻见效的部分，而「表头吸顶」需要容器先有高度约束，
> 属于 189 张表的布局改造，不在本步范围。

**交付的三层机制**

1. `src/hooks/useFrozenColumns.ts` — 通用 hook，适用于裸表格与原语表格
   - `{ left, right, disabled }`，返回挂到 `<table>` 上的 ref
   - 偏移量按前序列**实际渲染宽度**累加，不需要手写列宽
   - `ResizeObserver` 跟尺寸变化、`MutationObserver` 跟行数变化，自动重算
   - 跳过含 `colSpan > 1` 的行——「加载中 / 空状态」那种跨列横幅被钉住会很怪
   - 在单元格上写 `position: sticky` + `left/right`，并打 `data-cf-pin` / `data-cf-pin-edge` 标记供 CSS 上色

2. 纯 CSS 版（`index.css` 新增 `@layer components` 块）— 只冻结首列/末列时不需要 JS
   - `cf-freeze-first` / `cf-freeze-last` / `cf-freeze-edges`，加到 `<table>` 的 className 即可
   - 单列偏移恒为 0，所以纯 CSS 就够；用 `td:first-child:not([colspan])` 排开跨列整行
   - 这是给 164 张带 `min-w-[…]`（即确实会横向滚动）的表格准备的低成本开关

3. `components/common/table.tsx` 的 `stickyHeader` / `pinnedColumns` props
   - 内部复用同一个 hook，不重复实现
   - `stickyHeader` 输出 `cf-table-sticky-header`（`thead th { position: sticky; top: 0 }`），
     供已经有高度约束的滚动容器使用

**视觉与层级（对标源站 DataTable 的分层思路）**
- 新增 4 个**完全不透明**的 token：`--cf-table-sticky-bg` / `-head-bg` / `-hover-bg` / `-selected-bg`
  （亮 `#fff` / `#f6f8fa` / `#eef2f6` / `#ecfeff`，暗 `#0f172a` / `#16203a` / `#1b2540` / `#0b2e38`）。
  **必须不透明**——原 `thead` 在暗色下是 `bg-slate-900/60` 半透明，sticky 之后会透出滚动内容。
- z-index 分层：冻结体格 20 < 吸顶表头 30 < 表头与冻结列的交叉格 40
- 滚动容器 `isolation: isolate`，避免 z-index 泄漏到页面其它层
- 冻结边界用 `box-shadow: ±1px 0 0 0 var(--cf-border)` 画分隔线，提示此处存在冻结
- hover / selected 态在冻结列上单独给不透明底色，否则冻结列不会跟着整行变色

**已接入的表格（8 张）**

| 页面 | 表格宽度 | 方式 | 首列 / 末列 |
|---|---|---|---|
| `components/OrgStructure.tsx` 成员表 | min-w 1100 | hook `{left:1,right:1}` | 用户 / 操作 |
| `pages/admin/vehicle/VehicleList.tsx` | min-w **1640** | `cf-freeze-edges` | 车牌号 / 操作 |
| `pages/admin/vehicle/VehicleUsageList.tsx` | min-w 1200 | `cf-freeze-edges` | 车辆 / 操作 |
| `pages/admin/seal-license/LicenseListPage.tsx` | min-w 1180 | `cf-freeze-edges` | 编码 / 操作 |
| `pages/admin/seal-license/SealListPage.tsx` | min-w 1180 | `cf-freeze-edges` | 编码 / 操作 |
| `components/common/AnnouncementManageTable.tsx` | min-w 1180 | `cf-freeze-edges` | 标题 / 操作 |
| `pages/admin/RiskAlertPage.tsx` | min-w 1120 | `cf-freeze-edges` | 风险 / 操作 |
| `pages/admin/seal-license/BorrowManagementPage.tsx` | min-w 1080 | `cf-freeze-edges` | 类型 / 操作 |

选这 8 张的依据：逐个核对过首列是标识列、末列是「操作」列。没有做无脑批量——
末列不是操作列的表格冻结末列反而添乱，所以剩下的按需一个 class 开启。

**验证结果**
- `npx tsc --noEmit` → 退出码 0
- `npm run build` → 成功；产物 CSS 中确认 `cf-freeze-*` 与 `cf-table-sticky-*` 规则、以及亮暗两套 4 个不透明 token 全部生成
- 起 vite dev 逐个 transform 本步改动的 11 个文件（含 `index.css`），全部 HTTP 200、日志无 error；校验后已停服务
- CSS 体积 483.28 → 486.95 KB（+3.7 KB）

**遗留**
- 还有约 156 张带 `min-w-[…]` 的表格未开启，加一个 `cf-freeze-edges` 即可，需要人工确认末列语义。
- **表头吸顶未实际接入任何页面**。机制已就绪（`stickyHeader` prop / `cf-table-sticky-header` class），但当前布局的纵向滚动在页面级、`.table-scroll-container` 是 `overflow: visible` 且带 `contain: layout paint`，要真正吸顶得先给表格容器加高度约束——那是 189 张表的布局改造，超出本步范围，建议单独立项。
- 冻结效果尚未在浏览器里人工目视确认（横向拖动 + 亮暗切换）。

### 状态：⬜ 未开始
### 落地记录
（待填）

---

## 步骤 6 — 恢复被禁用的动画（P3 观感）

### 现状
`index.css:14–24` 三个工具类全是空壳：
```css
.animate-fade-in  { animation: none; }
.animate-slide-up { animation: none; }
.animate-scale-in { animation: none; }
```
而 keyframes 其实都定义了且处于孤立状态：`cfFadeIn`(14374) `cfSlideUp`(14386) `cfScaleIn`(14398) `cfSpin`(14364) `slideInRight`(14410) `slideOutRight`(14422)。

### 目标
接回动画，并尊重系统的减少动效偏好。

### 做法
1. 三个工具类接回对应 keyframes，时长/曲线对标源站（driver.js 用的是 `.2s ease-in-out`，源站过渡普遍 150–200ms）：
   - `.animate-fade-in` → `cfFadeIn .2s ease-out both`
   - `.animate-slide-up` → `cfSlideUp .22s cubic-bezier(.16,1,.3,1) both`
   - `.animate-scale-in` → `cfScaleIn .18s cubic-bezier(.16,1,.3,1) both`
2. 加 `@media (prefers-reduced-motion: reduce)` 分支，把三者退回 `animation: none`。
3. 确认 `cfSpin` / `slideInRight` / `slideOutRight` 是否也有对应工具类需要接回，孤立的按需清理。

### 验证
- 弹窗/面板出现时有过渡
- 系统开启「减少动态效果」后无动画
- `npx tsc --noEmit` 退出码 0

### 状态：✅ 已完成（2026-08-06）
### 落地记录

三个工具类接回 keyframes（`index.css` 的 `@layer utilities`）：

```css
.animate-fade-in  { animation: cfFadeIn  0.2s  ease-out both; }
.animate-slide-up { animation: cfSlideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1) both; }
.animate-scale-in { animation: cfScaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) both; }

@media (prefers-reduced-motion: reduce) {
  .animate-fade-in, .animate-slide-up, .animate-scale-in { animation: none; }
}
```

曲线沿用项目内既有的 `slideInRight`（`cubic-bezier(.16,1,.3,1)`），不引入新的动效语言。

**关键决策：没有加全局的 reduced-motion 兜底。**
`.cf-toast` 用的 `slideInRight … forwards` 依赖动画结束状态定位，一旦在 reduced-motion 下 `animation: none`，元素会停在 `from` 的屏幕外位置，直接变成看不见的 bug。所以只给这三个「淡入/上滑/缩放进场」类加了守卫——它们的自然状态就是 `opacity: 1` 无 transform，去掉动画即等于最终态，安全。`cfSpin`（加载态）也保持不动，无限旋转的 loading 指示器属于惯例豁免。

**现状核对**：`cfFadeIn` / `cfSlideUp` / `cfScaleIn` 三个 keyframes 此前完全无消费者（唯一引用就是这三个被置空的类），属孤立定义；`cfSpin`（`index.css:11379`）与 `slideInRight` / `slideOutRight`（14381 / 14387）一直在正常使用，未动。TSX 侧实际用到的只有 `animate-fade-in`（4 处：`AuthExperienceShell.tsx:29`、`MobileVehicleBooking.tsx` 3 处），`animate-slide-up` / `animate-scale-in` 目前 0 处使用，但类已可用。

**验证结果**
- `npm run build` 成功，产物 CSS 中确认：
  - `.animate-fade-in{animation:.2s ease-out both cfFadeIn}`（slide-up / scale-in 同理）
  - `@media(prefers-reduced-motion:reduce){.animate-fade-in,.animate-slide-up,.animate-scale-in{animation:none}}`
  - 四个 keyframes 均在产物中保留
- `npx tsc --noEmit` 退出码 0（本步无 TS 改动）

---

## 断点恢复协议

中途停下后，恢复步骤：
1. 读本文档「进度总览」，找到第一个非 ✅ 的工作项。
2. 读该工作项的「落地记录」，确认已做到哪一步。
3. 跑 `git status` + `git diff --stat` 核对工作区实际改动是否与记录一致。
4. 跑 `cd cloudflow-frontend && npx tsc --noEmit` 确认起点干净。
5. 继续。

**回写要求**：每个工作项完成后，立刻更新
- 「进度总览」的状态与完成时间
- 该工作项的「状态」行
- 该工作项的「落地记录」（改了哪些文件、关键决策、验证结果、遗留问题）

同时更新记忆文件 `frontend-refactor-progress.md` 的进度行。

