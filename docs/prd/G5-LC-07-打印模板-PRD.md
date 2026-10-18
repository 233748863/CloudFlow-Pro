# PRD：打印模板（LC-07 打印部分）

| 项 | 内容 |
| --- | --- |
| 条目编号 | LC-07（**只做打印模板，复杂报表引擎留批次 H**） |
| 所属批次 | 批次 G（第 5 份） |
| 对标依据 | `docs/benchmark/06-lowcode-bi-表单报表对标.md` |
| 优先级 | P1 —— 合同、工资条、offer 都要打印，是真实高频缺失 |
| 预估工作量 | M |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 问题：多个业务需要固定格式打印，当前只能浏览器直接打印页面

需要打印/导出固定格式文档的场景（都是已有或本系列规划的功能）：

| 场景 | 现状 | 来源 |
| --- | --- | --- |
| 工资条 | 有 `HrPdfRenderer` 但无模板管理 | D3 |
| 员工 offer | 无 | HR 招聘（已有 `hr_offer` 表） |
| 劳动合同 | 无 | HR（已有 `hr_employee_contract`） |
| 在职证明/离职证明 | 有 `hr_certificate_request` 但无模板 | HR ESS |
| 商务合同 | 无 | F4 OA-06 |
| 报销单 | 无 | OA（已有 `biz_expense_claim`） |
| 采购单 | 无 | OA / F5 |
| 比价表 | F5 已要求 Excel 导出 | F5 |
| 资产标签 | 无 | F1 |

**现状**：后端有 FastExcel 1.0.0 + POI 5.2.5（导出能力具备）+ `HrPdfRenderer`（HR 侧 PDF 渲染），但**没有模板管理** —— 每个打印需求都要写死一份代码。

### 1.2 目标
1. 统一打印模板管理（模板可配置，不写死在代码里）
2. 支持两种模板形态：HTML（转 PDF）与 Excel（POI 填充）
3. 变量替换与子表循环
4. 各业务接入成本低
5. 打印记录与权限控制

### 1.3 非目标
- 不做可视化模板设计器（本期用 HTML/Excel 文件上传，见 §9-1）
- 不做套打定位（针对预印刷纸张的精确定位，需求不明确）
- 不做复杂中式报表（分组小计、交叉表 —— 留批次 H 的 ureport 评估）
- 不做批量打印合并（多份合并为一个 PDF，见 §9-3）

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| Excel | FastExcel 1.0.0 + Apache POI 5.2.5 |
| PDF | `HrPdfRenderer`（HR 侧，**可参照并扩展为公共能力**） |
| 导出 | CSV 导出已实现 |
| 打印模板 | **无** |
| 文件存储 | 批次 G SYS-04 已改造（多存储 + 签名 URL） |
| 表单 | 批次 C 已扩展（模板可引用表单字段） |
| 字段权限 | 批次 C LC-04（打印内容需遵守字段权限） |

## 3. 范围

### 3.1 做
1. 新增 `sys_print_template`（打印模板）
2. 新增 `sys_print_record`（打印记录）
3. HTML 模板 → PDF 渲染
4. Excel 模板 → POI 填充
5. 变量替换与子表循环
6. 各业务接入接口
7. 首批 4 个场景接入
8. 打印权限与审计

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 可视化模板设计器 | 见 §9-1（本期上传 HTML/Excel 文件，成本低见效快） |
| 套打定位 | 需求不明确 |
| 复杂中式报表 | 批次 H 评估 ureport |
| 电子签章嵌入 | F4 OA-06 已说明本期不做第三方签章 |
| 批量合并打印 | §9-3 |

## 4. 功能需求

### FR-1 模板管理
- FR-1.1 新增 `sys_print_template`：
  | 字段 | 说明 |
  | --- | --- |
  | template_id | PK |
  | tenant_id | 租户 |
  | template_code | 模板编码（业务引用） |
  | template_name | 模板名称 |
  | biz_type | 业务类型（SALARY_SLIP / OFFER / LABOR_CONTRACT / CERTIFICATE / BUSINESS_CONTRACT / EXPENSE_CLAIM / PURCHASE_ORDER / ASSET_LABEL 等） |
  | template_format | HTML / EXCEL |
  | output_format | PDF / EXCEL / HTML |
  | template_content | 模板内容（HTML 时存文本） |
  | template_file_url | 模板文件（EXCEL 时存 `sys_file`） |
  | paper_size | A4 / A5 / LETTER / CUSTOM |
  | orientation | PORTRAIT 纵向 / LANDSCAPE 横向 |
  | margin_top / margin_bottom / margin_left / margin_right | 页边距（mm） |
  | variables_declare | 可用变量声明（JSON，供配置时参考） |
  | default_flag | 是否该业务类型的默认模板 |
  | version | 版本号 |
  | status | ENABLED / DISABLED |
  | remark | 备注 |
  | + 审计列 | |
- FR-1.2 同一 `biz_type` 可有多个模板（如不同分公司不同合同模板），一个为默认
- FR-1.3 模板可预览（用示例数据渲染）
- FR-1.4 模板有版本号，修改产生新版本（简化版：只记版本号递增，不做完整版本管理）

### FR-2 HTML 模板 → PDF
- FR-2.1 HTML 模板支持：
  - 变量替换：`{{fieldName}}`
  - 子表循环：`{{#each items}}...{{/each}}`
  - 条件：`{{#if condition}}...{{/if}}`
  - 格式化：`{{formatDate createTime 'yyyy-MM-dd'}}`、`{{formatAmount amount}}`、`{{amountToChinese amount}}`（金额大写，中文单据常需）
- FR-2.2 渲染引擎：模板语法用 Hutool 或 Freemarker（**受限模式，禁用脚本执行**，见 §6）
- FR-2.3 HTML → PDF 转换：见 §9-2（选型待确认）
- FR-2.4 支持页眉页脚、页码、分页控制（CSS `page-break`）
- FR-2.5 支持中文字体（需内置字体文件，避免服务器无字体导致乱码）

### FR-3 Excel 模板 → 填充
- FR-3.1 Excel 模板中用 `{{fieldName}}` 占位
- FR-3.2 子表循环用特殊标记（如 `{{#items}}` 所在行作为模板行，按数据行数展开）
- FR-3.3 用 POI 填充并保留原有样式、公式、合并单元格
- FR-3.4 输出 Excel 或转 PDF

### FR-4 业务接入
- FR-4.1 各业务实现 `PrintDataProvider`：
  ```java
  interface PrintDataProvider {
      String bizType();
      Map<String, Object> buildData(Long bizId, PrintContext ctx);
      // 返回模板可用的变量数据，含子表数组
  }
  ```
- FR-4.2 统一打印接口：`POST /system/print/{bizType}/{bizId}?templateCode=xxx&outputFormat=PDF`
  1. 校验用户对该业务对象的访问权限
  2. 取模板（未指定时用默认模板）
  3. 调 `PrintDataProvider` 取数据
  4. **按字段权限过滤数据**（批次 C LC-04）
  5. 渲染并返回文件流或存 `sys_file` 后返回签名 URL
- FR-4.3 前端统一打印按钮组件 `<PrintButton bizType bizId />`

### FR-5 打印记录
- FR-5.1 新增 `sys_print_record`：`record_id, tenant_id, template_id, template_code, biz_type, biz_id, output_format, file_url, operator_id, operator_name, print_time, ip_address, file_size` + 审计列
- FR-5.2 敏感文档（工资条、劳动合同、证明）打印必须留记录
- FR-5.3 打印记录可查询（谁在什么时候打印了什么）

### FR-6 首批接入场景（4 个）
| # | 场景 | biz_type | 模板格式 | 来源 |
| --- | --- | --- | --- | --- |
| 1 | 工资条 | SALARY_SLIP | HTML→PDF | D3（已有 `HrPdfRenderer` 可复用） |
| 2 | 在职/离职证明 | CERTIFICATE | HTML→PDF | HR ESS（已有 `hr_certificate_request`） |
| 3 | 报销单 | EXPENSE_CLAIM | HTML→PDF | OA（已有 `biz_expense_claim`） |
| 4 | 采购单 | PURCHASE_ORDER | EXCEL | OA / F5 |

## 5. 数据模型

| 操作 | 表 |
| --- | --- |
| 新增 | `sys_print_template`、`sys_print_record` |
| 复用 | `sys_file`（模板文件与输出文件） |

`DB/01.cloudflow-common.sql`：+2 表

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| **模板渲染安全** | 模板由管理员上传，但仍需防注入：Freemarker 必须**禁用 `?api` 与类加载**（防 RCE）；Hutool 模板需确认无脚本执行能力。**不允许模板中执行任意代码** |
| **HTML 转 PDF 安全** | 若用无头浏览器方案，需禁用 JS 执行、禁用外部资源加载（防 SSRF 与信息泄露） |
| **字段权限** | 打印数据必须过字段权限过滤（FR-4.2 第 4 步），不能绕过 LC-04 的权限控制 |
| **访问权限** | 打印前校验用户对业务对象的权限（如员工只能打印自己的工资条） |
| 敏感文档留痕 | 工资条、合同、证明类打印必须记录（FR-5.2） |
| 中文字体 | 内置字体文件，避免服务器缺字体导致乱码 |
| 性能 | 单份 PDF 渲染 < 3s；批量打印走异步 |
| 输出文件清理 | 临时输出文件定期清理（默认 7 天，配合 SYS-02 任务） |
| 模板文件安全 | 上传模板需 `system:print:template:edit` 权限（模板可读取数据，权限敏感） |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | HTML 模板可上传/编辑，变量替换、子表循环、条件、格式化函数均生效 |
| AC-2 | 金额大写（`amountToChinese`）正确 |
| AC-3 | Excel 模板填充保留原有样式、公式、合并单元格 |
| AC-4 | Excel 子表循环按数据行数正确展开 |
| AC-5 | HTML→PDF 输出正确，中文不乱码，页边距与纸张符合配置 |
| AC-6 | 页眉页脚与页码正确；长内容正确分页 |
| AC-7 | 模板可预览（示例数据渲染） |
| AC-8 | 同一业务类型多模板可切换；默认模板生效 |
| AC-9 | **员工打印他人工资条被拒绝**（访问权限） |
| AC-10 | **打印数据经过字段权限过滤**（LC-04 中不可见字段不出现在打印件中） |
| AC-11 | 敏感文档打印留记录（操作人、时间、IP） |
| AC-12 | 打印记录可查询 |
| AC-13 | **模板中嵌入脚本或类加载语句无法执行**（RCE 防护） |
| AC-14 | HTML→PDF 渲染时不加载外部资源（SSRF 防护） |
| AC-15 | 四个首批场景端到端打印成功 |
| AC-16 | 新增第五个业务接入只需实现 `PrintDataProvider`，不改框架 |
| AC-17 | 单份 PDF 渲染 < 3s |
| AC-18 | 临时输出文件按期清理 |
| AC-19 | 上传模板需对应权限 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| Apache POI 5.2.5（已有） | Excel 模板填充 |
| 现有 `HrPdfRenderer` | PDF 能力参照与扩展 |
| **批次 G SYS-04** | 输出文件存储与签名 URL |
| **批次 C LC-04** | 字段权限过滤 |
| **批次 A SYS-02** | 临时文件清理任务、批量打印异步 |
| **批次 D D3** | 工资条场景 |
| HTML→PDF 方案 | §9-2 待确认（可能需新增依赖） |
| 中文字体文件 | 需内置 |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **模板渲染引擎的 RCE 风险**（Freemarker 的 `?api`、类加载可导致任意代码执行） | NFR 明确禁用；AC-13 专项验证。**模板虽由管理员上传，但管理员账号被盗即等于服务器沦陷，必须限制** |
| HTML→PDF 方案选型影响大 | §9-2 三个方案各有取舍，需在 M2 前确定 |
| 无头浏览器方案引入 SSRF 与资源消耗风险 | 若选该方案，必须禁用 JS 与外部资源加载（AC-14）；限制并发 |
| 中文字体缺失导致乱码（Docker 容器常见） | 字体文件内置到镜像或 jar 内；AC-5 验证 |
| 打印绕过字段权限泄露敏感数据 | AC-10 专项验证；打印数据必须走与页面相同的权限过滤链路 |
| Excel 模板复杂样式填充后错乱 | AC-3 验证；复杂模板建议简化或改用 HTML |
| 各业务接入时绕过框架自己实现 | 接入成本足够低（AC-16）；Code Review |

## 9. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 两张表（SYS-07 生成）+ 模板管理 + 权限 | AC-8/19 |
| M2 | HTML 模板渲染（变量/循环/条件/格式化）+ **渲染引擎安全加固** | AC-1/2/13 |
| M3 | HTML→PDF（含中文字体、分页、页眉页脚）+ SSRF 防护 | AC-5/6/14 |
| M4 | Excel 模板填充 | AC-3/4 |
| M5 | 统一打印接口 + 访问权限 + **字段权限过滤** + 打印记录 | AC-9/10/11/12 |
| M6 | 模板预览 + 四个场景接入 + 前端打印按钮 | AC-7/15/16 |
| M7 | 性能 + 临时文件清理 | AC-17/18 |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 是否需要可视化模板设计器 | 建议**本期不做**。理由：HTML/Excel 模板由开发或实施人员制作即可，可视化设计器工作量大（相当于半个富文本+布局编辑器）。若后续实施频繁需要，再单独评估 |
| 2 | **HTML→PDF 用什么方案** | 三个选项：<br>**A. OpenHTMLtoPDF**（Apache-2.0，纯 Java，无外部依赖，中文需配字体）—— **推荐**，无额外进程与安全面<br>**B. wkhtmltopdf**（LGPL，外部进程，渲染效果好但需安装二进制、有 SSRF 面）<br>**C. Playwright/Puppeteer 无头浏览器**（渲染最准但资源消耗大、安全面最大）<br>建议 **A**，简单安全，CSS 支持够用 |
| 3 | 批量打印（多份合并）是否需要 | 本期不做。若需要（如批量打印全员工资条），建议异步生成 ZIP 而非合并 PDF |
| 4 | 模板版本是否需要完整版本管理 | 建议简化：只记 `version` 递增 + 修改留审计。完整版本管理（如批次 C LC-08 那样）对打印模板收益不大 |
| 5 | 首批四个场景是否合适 | 建议按 §FR-6。工资条与证明是 HR 高频刚需；报销单与采购单是 OA 高频。合同类模板通常由法务提供 Word，可后续接入 |
