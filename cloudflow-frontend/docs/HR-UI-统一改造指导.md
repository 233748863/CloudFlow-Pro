# 人力资源(HR)路由 UI/UX 统一改造指导

> 适用范围:`/hr/**` 下全部约 45 个菜单页面。
> 目标:收敛到项目既有的 **admin 设计语言**,最大化复用公共组件、消除自写样式与重复造轮子,使全项目视觉一致性保持高水准。
> 决策基线(已确认):**彻底收敛** + **服务端真分页** + **抽取公共 `FilterBar`(admin + HR 共用)**。按项目偏好:一次性推进、**不含补测试**。
>
> 本文件仅为**改造指导**,不含代码改动。执行时按"分阶段执行顺序"逐步落地,每阶段以 `npm run build` 门禁。

---

## 1. 设计基线(单一事实来源 = admin 列表页)

参照实现:`src/pages/admin/supplier/SupplierPage.tsx`、`src/pages/admin/consumable/ConsumablePage.tsx`。

强制规则:

| # | 规则 | 说明 |
|---|------|------|
| R1 | 外层固定 `<div className="space-y-4">` | **绝不加页面 padding**。路由 `<main>` 已统一供 `p-4 md:p-6 lg:p-8`(见 `layouts/MainLayout.tsx`)。页面再写 `p-6`/`p-4` 即双重 padding。 |
| R2 | 不在页面内渲染标题/eyebrow | 路由 header 已显示「菜单名 + 分组」(`MainLayout` 的 `activeLabel.item/group`)。页面内重复标题属冗余。 |
| R3 | 列表页结构统一 | `TablePageLayout`(`filters`/`table`/`pagination` 三槽)+ `TableSurfaceCard` + sticky 表头(`TableHeader`/`TableHead`/`TableActionHead`)。 |
| R4 | 筛选/搜索区统一 | 用公共 `FilterBar`(见 §3.1):左侧 = 带 `Search` 图标的输入框 + `Select` + 内联统计;右侧 = `搜索`/`清空条件`/`新增` 按钮(**主操作右对齐**)。 |
| R5 | 行操作统一 | `TableRowActions`(`semantic`/`tone`/`permissionKey`)。**禁止裸 `<Button>` 簇**与本地 `compactActions`/`actionButtons`/`requestActions`/`changeActions`。 |
| R6 | 弹窗统一 | 表单 = `BaseDialog`;破坏性操作 = `ConfirmDialog`。**禁用 `window.prompt`/`window.confirm`**。 |
| R7 | 服务端真分页 | list 调用传 `pageNum/pageSize`,响应读 `total`,接 `<Pagination>`(详见 §5)。 |

### 1.1 规范列表页骨架(目标模板)

```tsx
return (
  <div className="space-y-4">
    <TablePageLayout
      filters={<FilterBar
        search={{ value: kw, onChange: setKw, onSubmit: handleSearch, placeholder: '搜索…' }}
        filters={[/* <Select/> 们 */]}
        stats={[{ label: '共', value: total }]}
        actions={[
          <Button key="reset" variant="outline" size="sm" onClick={handleReset}>清空条件</Button>,
          <Button key="add" size="sm" onClick={openAdd} disabled={!hasPermission('hr:xxx:add')}>新增</Button>,
        ]}
      />}
      table={<TableSurfaceCard>{/* sticky 表头 + TableRowActions 行操作 */}</TableSurfaceCard>}
      pagination={total > 0 && <Pagination total={total} page={pageNum} pageSize={pageSize}
        onPageChange={setPageNum} onPageSizeChange={setPageSize} />}
    />
    <BaseDialog … />      {/* 表单 */}
    <ConfirmDialog … />   {/* 删除/破坏性确认 */}
  </div>
);
```

---

## 2. 偏差清单(全量审计结论,按出现频率)

1. **双重 padding**:大量页面外层写 `p-6`/`p-4`(违反 R1)。
2. **缺规范筛选卡**:几乎无页面用 admin 筛选卡。常见走样:`actions`-only 槽(按钮在左)、筛选/按钮堆右上角、裸 `flex` 行。(违反 R4)
3. **行操作用裸 `<Button>`**:丢失 `tone`/`semantic`/`permissionKey` 权限门控。仅 `TrainingPlan`/`Session`/`Course`/`AttendanceAppeal` 已合规。(违反 R5)
4. **无 `<Pagination>`**:普遍 `pageSize:200/100/50` 全量拉取 + 前端过滤。(违反 R7)
5. **重复页内标题头**:`Recruitment`/`EssProfile`/`EssContract`/`TalentNineBox`/`TalentCalibration` 及 `HrPageHeader`/`HrCrudPanel` 再渲染标题。(违反 R2)
6. **并行布局体系**:`HrCrudPanel`/`HrPageHeader`/`HrSimplePageHeader`/`HrTabList`(`HrDomainWorkspace.tsx`)与 admin 体系并行。
7. **破坏性操作缺 `ConfirmDialog`**,多处 `window.prompt`:`TrainingCertificate`/`BenefitRequest`/`MallOrder`/`WorkInjury`/`LaborDispute`。(违反 R6)
8. **劳动关系 8 页严重重复**:6 个子记录页几乎是克隆,2 个主页 Timeline 是复制粘贴双胞胎。

---

## 3. Phase 0 — 公共积木(新建 / 抽取 / 重写)

### 3.1 新建 `components/layout/FilterBar.tsx`(公共,admin+HR 共用) — ✅ 已完成(2026-06-07)
> 已建 `FilterBar`(search/filters/stats/actions 四槽,容器 `rounded-xl px-4 py-3`),并在 `components/layout/index.ts` 导出 `FilterBar`/`TableSurfaceCard`。`tsc --noEmit` 通过。
- 封装筛选卡容器:`flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between`。
- 入参建议:`search?`(value/onChange/onSubmit/placeholder,内置 `Search` 图标输入框)、`filters?: ReactNode[]`(Select 们)、`stats?: {label,value}[]`(内联统计 pills)、`actions?: ReactNode[]`(右对齐按钮区)。
- 导出到 `components/layout/index.ts`。
- 统一半径/内距为 `rounded-xl px-4 py-3`(修正 `HrDashboard` 的 `rounded-2xl p-4` 等偏差)。

### 3.2 重写 `HrCrudPanel`(`HrDomainWorkspace.tsx`)
- 内部改用 `TableSurfaceCard` + `TableRowActions`(把 `actions` 入参从 `(row)=>ReactNode` 改为返回 `TableRowActionItem[]`)。
- 可选挂 `FilterBar` + 内置 `Pagination`。
- **保留** tab 内小标题(用于区分同页多数据集,属合理信息,非 R2 冗余)。
- 受益页面(Phase 4)无需逐个重写即继承一致性。

### 3.3 退役 `HrPageHeader` / `HrSimplePageHeader`
- 移除其"渲染页面标题"职责(R2)。残留的 stats 能力并入 `FilterBar`。
- 全局搜索引用点并替换。

### 3.4 新建 `HrSubRecordCrudPage` 通用模板
- 面向劳动关系 6 个子记录页:参数化「父 ID 过滤 + 列定义 + 表单字段 + api 注入(list/create/update/remove)」。
- 内置:`FilterBar`(父 ID 选择/输入 + 查询)+ `TableSurfaceCard` + `TableRowActions` + `Pagination` + `BaseDialog` + `ConfirmDialog`。

### 3.5 抽取共享 `StageTimeline`
- 合并 `HrWorkInjuryPage` 的 `StageTimeline` 与 `HrLaborDisputePage` 的 `DisputeTimeline`(仅颜色/标签不同)。
- 放 `pages/hr/components/` 或 `components/common/`。

---

## 4. 分阶段执行顺序

> 整体一次性推进,但按 Phase 顺序提交,每阶段 `npm run build` 门禁,便于回滚与审阅。

- **Phase 1 — admin 接入 `FilterBar`(验证基线)**:把 admin 列表页手写筛选卡替换为 `FilterBar`,确认**零视觉回归**。先做以验证公共组件正确性。 — ✅ 已完成(2026-06-07)
  > 已接入 6 个 admin 列表页:`SupplierPage`、`ConsumablePage`、`SealListPage`、`LicenseListPage`、`BorrowManagementPage`、`TemplateManagement`;`VehicleUsageList`(双 Tab + SegmentedControl + 每 Tab 条件筛选 + stats/actions)亦统一收敛为单个 `FilterBar`(原 actions 卡与 filters 卡合并)。
  > 经审计排除 2 个非 list-CRUD 页(合理偏差,不强套 FilterBar):`VehicleBooking`(三步预约向导,无表格/分页)、`WorkflowImport`(文件导入拖拽区 + 冲突策略面板)。
  > `tsc --noEmit` 通过(`TypeScript: No errors found`)。
- **Phase 2 — HR 扁平 list-CRUD 页**:统一 `FilterBar` + `TableSurfaceCard` + `TableRowActions` + `Pagination` + `ConfirmDialog`,去 `p-6`。 — ✅ 已完成(2026-06-07)
  > 已完成:`HrAttendanceAppealPage`(筛选行→`FilterBar`;裸 `TableHeader/tbody`→规范 `<table>` + sticky 表头;详情弹窗由裸 JSON 改为结构化 `DetailField` + `AttachmentLinks`;行操作补 `permissionKey`;根容器 `<>`→`space-y-4`)。`tsc --noEmit` 通过。
  > 已完成:`HrTrainingPlanPage`(根 `p-6`→`space-y-4`;`actions`-only 槽 → `FilterBar`(关键字搜索 + 状态 Select + `共 N 条` stats + 清空/刷新/新建 actions);`pageSize:200` 全量拉取 → 服务端真分页 `pageNum/pageSize` + 读 `total` + `<Pagination>`(删尾页回退);删除由直连改为 `ConfirmDialog`;行操作补 `permissionKey`(plan:edit/remove);裸 `<Table>` → 规范 `<table>` + sticky 表头)。后端 `HrTrainingCommonQueryDTO` 已支持 `keyword/status`。`tsc --noEmit` 通过。
  > 已完成:`HrTrainingSessionPage`(根 `p-6`→`space-y-4`;`actions`-only 槽 → `FilterBar`(课程 Select + 状态 Select + `共 N 条` stats + 清空/刷新/新建 actions);班次列表服务端真分页(`courseId/status` 过滤)+ `<Pagination>`,课程下拉/名称解析单独全量加载;删除改 `ConfirmDialog`;行操作补 `permissionKey`(session:edit/remove);裸 `<Table>` → 规范 `<table>` + sticky 表头)。`tsc --noEmit` 通过。
  > 已完成:`HrEssSalarySlipPage`(根 `p-6`→`space-y-4`;原 `actions` 内月份输入既筛选又生成,拆分为 `FilterBar`(月份精确搜索 `periodMonth` + `共 N 条` stats + 清空/刷新/生成 actions)+ 独立"生成工资条" `BaseDialog`;前端全量+客户端过滤 → 服务端真分页 + `<Pagination>`(后端 `pageMySalarySlips` 支持 `periodMonth/status`);裸 Button 行操作 → `TableRowActions`(查看/确认);裸 `<Table>` → 规范 `<table>` + sticky 表头)。`tsc --noEmit` 通过。
  > 已完成:`HrEssCertificatePage`(根 `p-6`→`space-y-4`;`actions`-only → `FilterBar`(关键字搜索 + 状态 Select + `共 N 条` stats + 清空/刷新/申请 actions);全量拉取 → 服务端真分页 + `<Pagination>`(后端 `HrEssCommonQueryDTO` 支持 `keyword/status`);裸 Button 行操作 → `TableRowActions`(下载/取消);取消由直连改为 `ConfirmDialog`;裸 `<Table>` → 规范 `<table>` + sticky 表头)。`tsc --noEmit` 通过。
  > 已完成:`HrEssBenefitPage`(read-only;根 `p-6`→`space-y-4`;原 `actions` 内月份输入既筛选又生成,拆分为 `FilterBar`(月份精确搜索 + `共 N 条` stats + 清空/刷新/生成 actions)+ 独立"生成当月明细" `BaseDialog`;前端全量+客户端过滤 → 服务端真分页 + `<Pagination>`;status 裸枚举 → `StatusBadge`(草稿/已生成/已发放/已取消);裸 `<Table>` → 规范 `<table>` + sticky 表头)。`tsc --noEmit` 通过。
  > 已完成:`HrEssLeaveBalancePage`(read-only;根 `p-6`→`space-y-4`;无 `TablePageLayout` + ad-hoc 年份按钮导航 → `TablePageLayout` + `FilterBar`(年份 Select(近 6 年)+ `共 N 项` stats + 刷新 action);裸 `<Table>` → 规范 `<table>` + sticky 表头)。接口返回纯数组(假类有限),按 §5 兜底不加分页。`tsc --noEmit` 通过。
  > 已完成:`HrEssContractPage`(read-only ×2;根 `p-6`→`space-y-4`;两表统一为带 `SectionHeader` 小标题的 `TableSurfaceCard` 壳(合同表头放刷新 action),消除第二表手写 `p-5` 卡;裸 Button 行操作 → `TableRowActions`(发起签署/取消);裸 `<Table>` → 规范 `<table>` + sticky 表头)。两接口返回纯数组(个人合同/签署记录量小),按 §5 兜底不加分页。`tsc --noEmit` 通过。**ESS 6 页(§6.2)全部完成。**
  > 已完成:`HrTalentReviewPage`(§6.4;根 `p-6`→`space-y-4`;`actions`-only 槽 → `FilterBar`(关键字搜索 + 状态 Select + `共 N 条` stats + 清空/刷新/新建 actions);全量拉取 → 服务端真分页 + `<Pagination>`(后端 `HrTalentReviewQueryDTO` 支持 `keyword/status`);裸 Button 行操作 → `TableRowActions`(编辑/拉取业绩(仅 DRAFT/IN_PROGRESS 显示)/发起发布(仅 IN_PROGRESS/CALIBRATING 显示))补 `permissionKey`(review:edit/add);删除占位 Button(无后端 API)直接移除;保留新建/编辑与业绩快照两个 `BaseDialog`)。`tsc --noEmit` 通过。
  > 已完成:`HrTalentSuccessionPage`(§6.4;根 `p-6`→`space-y-4`;`actions`-only 槽 → `FilterBar`(关键字搜索 + 状态 Select + `共 N 条` stats + 清空/刷新/新建 actions);`pageSize:200` 全量拉取 → 服务端真分页 + `<Pagination>`(后端 `HrTalentSuccessionPlanQueryDTO` 支持 `keyword/status`);裸 `<Table>` → 规范 `<table>` + sticky 表头;裸 Button 簇 → `TableRowActions`(详情提名/发起发布(仅 DRAFT)/删除)补 `permissionKey`(succession:edit/remove);inline 删除直连 → `ConfirmDialog`;详情弹窗内继任人裸 `<Table>` 与移除 Button 一并收敛)。`tsc --noEmit` 通过。
  > 已完成:`HrTalentPoolPage`(§6.4;根 `p-6`→`space-y-4`;`actions`-only 槽 → `FilterBar`(关键字搜索 + 类型 Select + `共 N 条` stats + 清空/刷新/新建 actions);`pageSize:200` 全量拉取 → 服务端真分页 + `<Pagination>`(后端 `HrTalentPoolQueryDTO` 支持 `keyword/poolType`);裸 `<Table>` → 规范 `<table>` + sticky 表头;裸 Button 簇 → `TableRowActions`(编辑/成员/删除)补 `permissionKey`(pool:edit/remove);inline 删除直连 → `ConfirmDialog`;成员弹窗内裸 `<Table>` 与退出 Button 一并收敛)。`tsc --noEmit` 通过。
  > 已完成:`HrTalentDevelopmentPage`(§6.4;根 `p-6`→`space-y-4`;`actions`-only 槽 → `FilterBar`(员工 ID 搜索 + 类型 Select + 状态 Select + `共 N 条` stats + 清空/刷新/新建 actions);`pageSize:200` 全量拉取 → 服务端真分页 + `<Pagination>`(后端 `HrTalentDevelopmentActionQueryDTO` 支持 `employeeId/actionType/status`,无 keyword 故按员工 ID 搜索);裸 `<Table>` → 规范 `<table>` + sticky 表头;裸 Button 簇 → `TableRowActions`(编辑/完成回填(仅 PLANNED/ONGOING)/删除)补 `permissionKey`(development:edit/remove);inline 删除直连 → `ConfirmDialog`;保留编辑与完成回填两个 `BaseDialog`)。`tsc --noEmit` 通过。
  > 已完成:`HrTalentCalibrationPage`(§6.4;根 `p-6`→`space-y-4`;去页内**冗余标题**「校准会议」;盘点活动 selector 从 filter 外的标题行移入 `FilterBar`(盘点 Select + `共 N 条` stats + 刷新/新建 actions);裸 `<Table>` → 规范 `<table>` + sticky 表头;裸 Button 行操作 → `TableRowActions`(编辑/纪要)补 `permissionKey`(calibration:edit);会议列表按 reviewId 返回纯数组,按 §5 兜底不加分页)。`tsc --noEmit` 通过。
  > 已完成:`HrTalentArchivePage`(§6.4 dashboard/viz;根 `p-6 space-y-4`→ `space-y-4`(去双重 padding);右上手写 search 行 → `FilterBar`(员工 ID 搜索 + 留空查看本人 reset action);四个明细块裸 `<Table>` → 规范 `<table>`(profile 卡 / MiniGrid 九宫格 / 培养行动时间线等领域可视化保留);用 `TablePageLayout` 承载 filters + 多卡 table)。`tsc --noEmit` 通过。
  > 已完成:`HrBenefitRequestPage`(§6.5;根 `p-6 space-y-4`→ `space-y-4`;右上手写筛选行 → `FilterBar`(申请编号搜索 + 类型 Select + 状态 Select + `共 N 条` stats + 清空/刷新/新建 actions);前端 statusFilter 全量 → 服务端真分页 + `<Pagination>`(后端 `HrBenefitRequestQueryDTO` 支持 `requestNo/requestType/status`);裸 `<Table>` → 规范 `<table>` + sticky 表头;裸 Button 簇 → `TableRowActions`(编辑/提交/取消,按 `hasWorkflowStatus` 门控);**`window.prompt('取消理由')` → 取消理由 `BaseDialog`**)。`tsc --noEmit` 通过。
  > 已完成:`HrMallOrderPage`(§6.5;根 `p-6`→`space-y-4`;无筛选卡 → `FilterBar`(订单号搜索 + 范围 Select(全部/我的)+ 状态 Select + `共 N 条` stats + 清空/刷新 actions);全量拉取 → 服务端真分页 + `<Pagination>`(`listMyOrders`/`listAllOrders` 透传 `orderNo/status`,读 `total`);裸 `<Table>` → 规范 `<table>` + sticky 表头;裸 Button 簇 → `TableRowActions`(详情/发货(仅 APPROVED)/确认收货(仅 SHIPPED 且我的)/取消(仅 PENDING/APPROVED));详情弹窗内商品明细裸表 → 规范 `<table>`;**`window.prompt('取消理由')` → 取消理由 `BaseDialog`**)。`tsc --noEmit` 通过。
  > 已完成:`HrMallItemAdminPage`(§6.5;根 `p-6`→`space-y-4`;右上手写状态行 → `FilterBar`(商品名称搜索 + 状态 Select + `共 N 条` stats + 清空/刷新/新增 actions);全量拉取 → 服务端真分页 + `<Pagination>`(后端 `HrMallItemQueryDTO` 支持 `itemName/category/status`);裸 `<Table>` → 规范 `<table>` + sticky 表头;裸 Button 簇 → `TableRowActions`(编辑/上架(仅 OFF_SHELF)/下架(仅 ON_SHELF))补 `permissionKey`(mall:item:edit))。`tsc --noEmit` 通过。
  > 已完成:`HrPointAccountPage`(§6.5 dashboard+明细;根 `p-6`→`space-y-4`;右上手写查询行 → `FilterBar`(员工 ID 搜索 + 方向 Select + `共 N 条流水`/视图 stats + 查看本人/刷新/手动调整 actions);**流水无分页 → 服务端真分页 + `<Pagination>`**(后端 `HrPointTransactionQueryDTO` 支持 `direction`);账户查询与流水加载拆为两个 effect(账户变更→重载流水);四张统计卡保留;裸 `<Table>` → 规范 `<table>` + sticky 表头;手动调整 `BaseDialog` 保留)。`tsc --noEmit` 通过。
  > 已完成:`HrMallPage`(§6.5 card-grid 仅收壳;根 `p-6`→`space-y-4`;右上余额/购物车 + 独立搜索卡 → `FilterBar`(商品搜索 + 分类 pills filters + `共 N 件` stats + 余额徽标/购物车 actions);**商店卡片网格保留**(领域可视化);客户端搜索/分类过滤保留(后端仅 `status=ON_SHELF` 拉取);购物车弹窗内裸 `<Table>` → 规范 `<table>`;商品详情/购物车两个 `BaseDialog` 保留;`TablePageLayout` 承载 filters + 卡片网格)。`tsc --noEmit` 通过。
  > 已完成:`HrBenefitMinePage`(§6.5 dashboard 仅收壳;根 `p-6`→`space-y-4`;右上裸刷新行 → `FilterBar`(在享福利/在途订单 stats + 刷新 action);四张积分统计卡保留;三块明细裸 `<Table>` → 规范 `<table>` + sticky 表头;`TablePageLayout` 承载 filters + 统计卡 + 明细网格;摘要接口返回有限数组,按 §5 兜底不加分页)。`tsc --noEmit` 通过。**福利 §6.5 六页全部完成。**
  > 已完成:`HrTrainingArchivePage`(§6.3 dashboard;根 `p-6`→`space-y-4`;右上手写查询行 → `FilterBar`(员工 ID 搜索 + 查我的/刷新 actions);自写 `StatCard`(本地渐变卡)→ 公共 `StatCard`(title/value/icon/iconVariant);两块明细裸 `<Table>` + 手写 `p-5` 卡 → 规范 `<table>` + sticky 表头(`TableSurfaceCard` 壳);`TablePageLayout` 承载 filters + 统计卡 + 明细;档案接口返回有限数组,按 §5 兜底不加分页)。`tsc --noEmit` 通过。
- **Phase 3 — 劳动关系收敛(模板化)**:2 主页用统一模板 + 共享 `StageTimeline` + `ConfirmDialog`;6 子页改用 `HrSubRecordCrudPage`,删除重复实现。
  > ✅ 已完成。新增两个共享组件:`components/StageTimeline.tsx`(§3.5,tone 参数化 emerald/sky,合并原 HrWorkInjury 的 StageTimeline 与 HrLaborDispute 的 DisputeTimeline)、`components/HrSubRecordCrudPage.tsx`(§3.4,泛型 `<T,F>` 子记录 CRUD 模板:FilterBar 父 ID 搜索 + stats + 查询/刷新/新增;规范 `<table>` + sticky 表头;字段声明式 text/number/date/datetime/select/user/custom;`extraActions` 注入行级扩展操作)。
  > 2 主页重写:`HrWorkInjuryPage`(共享 StageTimeline emerald + FilterBar + 规范表 + TableRowActions;`window.prompt('关闭理由')` → 关闭原因 `ConfirmDialog`+Textarea)、`HrLaborDisputePage`(共享 StageTimeline sky;`window.prompt` → `ConfirmDialog`;证据子表 `<Table>` → 规范 `<table>`)。
  > 6 子页改用 `HrSubRecordCrudPage` 删重复:`HrWorkInjuryInvestigationPage`/`HrWorkInjuryTreatmentPage`/`HrWorkInjuryRehabilitationPage`/`HrWorkInjuryCompensationPage`(`extraActions` 注入「标记已支付」gated PLANNED → `payCompensation`)/`HrDisputeMediationPage`/`HrDisputeArbitrationPage`(dialogWidth=wide)。每页约 200 行 → 约 60 行声明式配置。`tsc --noEmit` 通过;Phase 3 涉及页全仓无 `window.prompt`/`window.confirm`。
- **Phase 4 — Tab 类 CRUD 页**:基于重写后的 `HrCrudPanel`/`HrTabList`,收敛 tab 页(含去 `Recruitment` 重复标题头、去 `window.prompt`)。
  > ✅ 已完成。重写 `HrCrudPanel`(`HrDomainWorkspace.tsx`):内部改用 `TableSurfaceCard` + 规范 `<table>` + sticky 表头 + `TableRowActions`(`actions` 入参 `(row)=>ReactNode` 改为返回 `TableRowActionItem[]`);可选 `pageSize` 启用内置 `<Pagination>`;删除 `HrPageHeader`/`HrSimplePageHeader`(退役标题职责,R2/§3.3)。
  > 4 个 HrCrudPanel 消费页适配新签名:`HrOrganizationPage`(`compactActions`→`deleteAction`,删除接 `ConfirmDialog` danger)、`HrLifecyclePage`(状态流转裸 Button 簇→`TableRowActionItem[]`,提交/通过/驳回/生效)、`HrCompensationPage`(调薪流转同上)、`HrAttendancePage`(申请流转 + 4 个高频 tab 加 `pageSize={10}` 客户端分页)。
  > `HrRecruitmentPage`:**去冗余标题头**(R2「招聘与候选人」)+ 独立 stats/搜索行 → 单个 `FilterBar`(关键词搜索 + 6 项 stats + 刷新/新建需求/新建候选人/安排面试/新建 Offer actions);tab 内大体量裸 `<Table>` 暂留(超出本次标题收敛范围)。
  > 培训三页 tab 收敛:`HrTrainingCoursePage`(去 `p-6`;课程/讲师 tab 加 `FilterBar`;裸 `<Table>`→规范 `<table>` + sticky;删除接 `ConfirmDialog`;tab 加 admin 样式)、`HrTrainingEnrollmentPage`(去 `p-6`;`FilterBar` + 规范表;状态裸 Button 簇→`TableRowActions`(签到/完成/取消))、`HrTrainingExamPage`(去 `p-6`;题库/试卷/作答四 tab 各 `FilterBar` + 规范表;`Trash2` ghost 删除→`TableRowActions` + `ConfirmDialog`)。
  > `HrTrainingCertificatePage`:去 `p-6`;`FilterBar` + 规范表;裸 Button→`TableRowActions`(下载/重生 PDF/撤销);**`window.prompt('撤销原因')` → 撤销原因 `ConfirmDialog`+`Textarea`**。
  > `HrEssProfilePage`(§6.2):去 `p-6` + **去冗余标题**「个人信息」;银行卡/家庭/紧急三 tab 各 `FilterBar` + 规范表;`Trash2` ghost 删除→`TableRowActions` + `ConfirmDialog`;**裸 `<input type=checkbox>` → 公共 `Switch`**(主卡/赡养人);tab 加 admin 样式。
  > 每页 `tsc --noEmit` 通过;Phase 4 涉及页全仓无 `window.prompt`/`window.confirm`,破坏性删除/撤销均有 `ConfirmDialog`。
- **Phase 5 — Dashboard/Portal/特殊页(仅收壳)**:保留自定义可视化,仅去 `p-6`→`space-y-4`、统计卡用 `StatCard`、空/载入态用 `TableSurfaceCard`、搜索区用 `FilterBar`。
  > ✅ 已完成。`HrEssPortalPage`(门户;去 `p-6`;右上裸刷新行 → `FilterBar`(未读消息 stats + 刷新 action);五张可点 `SummaryCard`(领域导航,带 onClick,公共 StatCard 无 onClick 故保留)+ 四块 Section 明细列表全保留)。
  > `HrTalentDashboardPage`(§6.4;去 `p-6`;右上裸刷新行 → `FilterBar`(刷新 action);四张 `StatCard` 已是公共组件;最近盘点/继任 + 快速入口 widgets 全保留)。
  > `HrTalentNineBoxPage`(§6.4 matrix-viz;去 `p-6` + **去冗余标题**「九宫格校准」;盘点活动 Select + 刷新/发起发布 → `FilterBar`(Select 入 filters、状态入 stats、按钮入 actions);九宫格拖拽矩阵 + 双弹窗全保留)。
  > `HrDashboardPage` 经核已符合基线,无需改。每页 `tsc --noEmit` 通过。
- **Phase 6 — 大页(workspace 壳收敛)**:`HrEmployeePage`(+`HrEmployeeWorkspace`)、`HrPerformancePage` 的外层/筛选/行操作收敛;领域可视化(master-detail/树/矩阵)保留,自写卡片/按钮替换为公共组件。
  > ✅ 已完成。`HrEmployeePage`(workspace;手写筛选卡 `rounded-2xl/p-4` → `FilterBar`(姓名/工号/部门/岗位搜索 + 状态 Select filters + 清空(有筛选时)/刷新/新增 actions);行操作裸 Button 对(详情/编辑)→ `TableRowActions`(view/edit,外裹 `stopPropagation` div 保留行点击选中);master-detail 主从网格 + 右侧 `HrEmployeeWorkspace` 面板保留)。
  > `HrEmployeeWorkspace`(form-heavy 子面板;合同/证照/紧急联系人三块 `<article>` 档案卡右上「编辑/删除」裸 Button 对 → `TableRowActions mode="inline"`(edit/delete,合同 delete 沿用 `canDeleteContract` disabled 门控);删除均已走既有 `requestDelete*` → `ConfirmDialog`,无新增;「编辑主档」工具栏按钮保留;移除未用 `Trash2` import)。
  > `HrPerformancePage`(dashboard/tabbed;**槽位误用纠正**:四张 `StatCard` 从 `actions` 槽移入 `filters` 槽顶部统计网格;自写 `card p-4` 筛选块 → `FilterBar`(目标编号/周期/名称搜索 + 状态 Select filters + 刷新/新建/360评估/强制分布 actions);**`cf-tabs` 手写 tab → 公共 `Tabs/TabsList/TabsTrigger`** 受控(7 个 tab + 状态徽标/提交计划/提交结果/录入面谈 右侧操作保留);绩效目标树/类型矩阵/进度填报等领域可视化视图 + 行内「分解/填报」互斥单按钮 + 各创建/分解/实绩 `BaseDialog` 全保留(分析视图保留);移除未用 `Search`(lucide,自定义员工搜索下拉仍用故保留))。
  > 每页 `tsc --noEmit` 通过;Phase 6 `npm run build` 通过(仅既有 WorkflowDesign 动态/静态混合导入告警,与本次无关)。

---

## 5. 服务端真分页落地规范

- `services/api/hr.ts` 为桶文件,`normalizeRows`(`hrShared.ts`)已兼容 `{records,total}`/`{rows,total}` → 后端多为 PageHelper 分页,**主要是前端改造**。
- 每个 list fn:透传 `pageNum`(目前多只传 `pageSize`),响应读 `total` 存入 state,接 `<Pagination>` 的 `onPageChange`。
- 删除/状态流转后注意:若当前页清空需回退页码。
- 兜底:个别返回**纯数组**的接口 → 加客户端分页,或逐个确认后端是否需补分页。

---

## 6. 全量页面清单(当前状态 → 目标动作)

> 归类:list-CRUD / tabbed-CRUD / dashboard / portal / card-grid / matrix-viz / workspace / 子记录-CRUD。
> 严重度 = 偏离基线程度;工作量 S/M/L。

### 6.1 核心(`pages/hr`)
| 页面 | 归类 | 主要偏差 | 目标动作 | 严重 | 量 |
|---|---|---|---|---|---|
| HrDashboardPage | dashboard | 筛选卡 `rounded-2xl/p-4` 偏差;table 槽为自定义网格 | FilterBar 微调;仪表盘网格保留 | 低 | S |
| HrEmployeePage | workspace | `<>` 外层;裸 Button 行操作;无分页 | TableRowActions + 壳收敛;master-detail 保留 | 中 | L |
| HrEmployeeWorkspace(子) | form-heavy 面板 | 自写 `<article>` 卡片;裸 Button | 卡片/按钮收敛(已用 BaseDialog+ConfirmDialog) | 中 | L |
| HrRecruitmentPage | tabbed-CRUD | **冗余标题头**;自写卡片;裸 Button;无分页 | 去标题头 + tab 收敛 + TableRowActions | 高 | L |
| HrOrganizationPage | tabbed-CRUD | `HrCrudPanel`;无搜索;`compactActions`;删除无确认 | 重写后 HrCrudPanel + ConfirmDialog | 高 | L |
| HrLifecyclePage | tabbed-CRUD | `HrCrudPanel`;裸 Button 簇 | 同上 | 高 | L |
| HrAttendancePage | tabbed-CRUD(8) | `HrCrudPanel`;数据量大却无分页;裸 Button | 同上 + 分页 | 高 | L |
| HrAttendanceAppealPage | list-CRUD | 已用 TablePageLayout;筛选行非 FilterBar;缺 permissionKey;详情裸 JSON | 换 FilterBar + 补权限 + 详情结构化 | 低-中 | S |
| HrCompensationPage | tabbed-CRUD(9) | `HrCrudPanel`;裸 Button | 重写后 HrCrudPanel | 高 | L |
| HrEssPortalPage | portal | `p-6`;自写卡片/列表 | 去 padding;壳收敛(门户可保留) | 中 | M |
| HrPerformancePage | dashboard/tabbed | 槽位误用(StatCard 入 actions、`cf-tabs`);自写表;裸 Button | 壳/行操作收敛;分析视图保留 | 中-高 | L |

### 6.2 ESS(`pages/hr/ess`)
| 页面 | 归类 | 主要偏差 | 目标动作 | 严重 | 量 |
|---|---|---|---|---|---|
| HrEssSalarySlipPage | read-only-list | `p-6`;actions-only;裸 Button | 去 padding + FilterBar + TableRowActions | 中 | M |
| HrEssCertificatePage | list-CRUD | `p-6`;无筛选卡;裸 Button;取消无确认 | 全套收敛 + ConfirmDialog | 中 | M |
| HrEssProfilePage | tabbed-CRUD | `p-6`;**冗余标题**;裸 Button;删除无确认;裸 checkbox | tab 收敛 + 去标题 + ConfirmDialog | 高 | L |
| HrEssLeaveBalancePage | read-only-list | `p-6`;无 TablePageLayout;年份导航 ad-hoc | 去 padding + 年份入 FilterBar(Select) | 低 | S |
| HrEssBenefitPage | read-only-list | `p-6`;actions-only;status 裸枚举 | 去 padding + FilterBar + 状态标签 | 低-中 | S |
| HrEssContractPage | read-only-list ×2 | `p-6`;第二表手写卡;裸 Button | 去 padding + 统一两表壳 | 中 | M |

### 6.3 培训(`pages/hr`)
| 页面 | 归类 | 主要偏差 | 目标动作 | 严重 | 量 |
|---|---|---|---|---|---|
| HrTrainingPlanPage | list-CRUD | `p-6`;actions-only 无筛选卡;(TableRowActions ✓);删除无确认 | +FilterBar +分页 +ConfirmDialog | 中 | M |
| HrTrainingCoursePage | tabbed-CRUD | `p-6`;无 TablePageLayout;(TableRowActions ✓) | tab 收敛 + 去 padding | 中 | M |
| HrTrainingSessionPage | list-CRUD | `p-6`;actions-only;(TableRowActions ✓) | +FilterBar +分页 | 中 | M |
| HrTrainingEnrollmentPage | tabbed-CRUD | `p-6`;无 TablePageLayout;裸 Button;`班次#id` 未解析 | tab 收敛 + TableRowActions + 名称解析 | 中 | M |
| HrTrainingExamPage | tabbed-CRUD | `p-6`;无 TablePageLayout;裸 Button(多表) | tab 收敛 + TableRowActions | 中-高 | L |
| HrTrainingCertificatePage | tabbed-CRUD | `p-6`;裸 Button;`window.prompt` 撤销 | tab 收敛 + 去 prompt(BaseDialog) | 中-高 | L |
| HrTrainingArchivePage | dashboard | `p-6`;手写 StatCard 网格;ad-hoc 工具条 | 去 padding + StatCard + FilterBar | 低-中 | M |

### 6.4 人才(`pages/hr/talent`)
| 页面 | 归类 | 主要偏差 | 目标动作 | 严重 | 量 |
|---|---|---|---|---|---|
| HrTalentDashboardPage | dashboard | `p-6` | 去 padding;widgets 保留 | 低 | S |
| HrTalentReviewPage | list-CRUD | `p-6`;actions-only;裸 Button | 全套收敛 | 高 | M |
| HrTalentNineBoxPage | matrix-viz | `p-6`;**冗余标题**;矩阵自定义 | 壳/标题收敛;九宫格保留;Select 入 FilterBar | 中 | M |
| HrTalentCalibrationPage | list-CRUD | `p-6`;**冗余标题**;selector 在 filter 外;裸 Button | 全套收敛;review 选择入 FilterBar | 高 | M |
| HrTalentSuccessionPage | list-CRUD | `p-6`;actions-only;裸 Button;删除无确认 | 全套收敛 + ConfirmDialog | 高 | M |
| HrTalentPoolPage | list-CRUD | `p-6`;actions-only;裸 Button;inline 删除无确认 | 全套收敛 + ConfirmDialog | 高 | M |
| HrTalentDevelopmentPage | list-CRUD | `p-6`;actions-only;裸 Button;inline 删除无确认 | 全套收敛 + ConfirmDialog | 高 | M |
| HrTalentArchivePage | dashboard/viz | `p-6`;search 非 FilterBar | 去 padding + search 入 FilterBar;profile viz 保留 | 低 | S |

### 6.5 福利(`pages/hr/benefit`)
| 页面 | 归类 | 主要偏差 | 目标动作 | 严重 | 量 |
|---|---|---|---|---|---|
| HrBenefitMinePage | dashboard | `p-6`;裸 Table | 去 padding + 统一表壳;汇总保留 | 低 | S |
| HrBenefitRequestPage | list-CRUD | `p-6`;无筛选卡;裸 Button;`window.prompt` | 全套收敛 + 去 prompt | 中 | M |
| HrPointAccountPage | dashboard+明细 | `p-6`;search 右上;流水无分页 | 去 padding + FilterBar + 流水分页 | 低-中 | M |
| HrMallPage | card-grid | `p-6`;未分页 | 去 padding;**商店卡片保留**;考虑加载更多/分页 | 低 | S |
| HrMallOrderPage | list-CRUD | `p-6`;无筛选卡;裸 Button;`window.prompt` | 全套收敛 + 去 prompt | 中 | M |
| HrMallItemAdminPage | list-CRUD | `p-6`;无搜索;裸 Button | 全套收敛 | 中 | M |

### 6.6 劳动关系(`pages/hr/laborRelation`)
| 页面 | 归类 | 主要偏差 | 目标动作 | 严重 | 量 |
|---|---|---|---|---|---|
| HrWorkInjuryPage(主) | list-CRUD+timeline | `p-6`;裸 Button;`window.prompt`;本地 StageTimeline | 统一模板 + 共享 StageTimeline + ConfirmDialog | 中 | M |
| HrWorkInjuryInvestigationPage(子) | 子记录-CRUD | `p-6`;裸 Button;父 ID 输入裸 | 改用 `HrSubRecordCrudPage` | 低-中 | S |
| HrWorkInjuryTreatmentPage(子) | 子记录-CRUD | 同上(克隆) | 改用 `HrSubRecordCrudPage` | 低-中 | S |
| HrWorkInjuryCompensationPage(子) | 子记录-CRUD | 同上 + 标记已支付 | 改用模板(自定义动作注入) | 低-中 | S |
| HrWorkInjuryRehabilitationPage(子) | 子记录-CRUD | 同上(克隆) | 改用 `HrSubRecordCrudPage` | 低-中 | S |
| HrLaborDisputePage(主) | list-CRUD+timeline+证据 | `p-6`;裸 Button;`window.prompt`;本地 DisputeTimeline | 统一模板 + 共享 StageTimeline + ConfirmDialog | 中 | M |
| HrDisputeMediationPage(子) | 子记录-CRUD | 同子页族(克隆) | 改用 `HrSubRecordCrudPage` | 低-中 | S |
| HrDisputeArbitrationPage(子) | 子记录-CRUD | 同子页族(克隆) | 改用 `HrSubRecordCrudPage` | 低-中 | S |

---

## 7. 验证标准
- 每个 Phase 结束 `npm run build` 必须通过。
- 关键页面浏览器视觉抽查(golden path + 空/载入/错误态)。
- 行操作权限门控(`permissionKey`)与 admin 一致。
- 破坏性操作均有 `ConfirmDialog`,全仓无 `window.prompt`/`window.confirm`。
- 不含补测试(按项目偏好)。

## 8. 风险与注意
- **Phase 1 先行**:admin 接入 FilterBar 是基线验证,务必确认零视觉回归再大规模铺开。
- **HrCrudPanel 重写是高杠杆点**:一处改动影响 4+ 个 tab 页,需重点回归。
- **分页**:删除后页码回退、`total` 同步;纯数组接口走客户端兜底。
- **保留项**:Mall 商店卡片、NineBox 九宫格、Dashboard/Archive 可视化、Employee/Performance 的 master-detail/树——仅收"壳",不动领域可视化。
