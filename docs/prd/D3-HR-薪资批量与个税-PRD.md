# PRD：薪资批量运算与个税税率表（HR-06 + HR-07）

| 项 | 内容 |
| --- | --- |
| 条目编号 | HR-06 薪资批量运算 · HR-07 个税税率表结构化 |
| 所属批次 | 批次 D（第 3 份，两项同批交付更省事：税表是算薪的输入） |
| 对标依据 | `docs/benchmark/04-hr-人力资源对标.md` |
| 优先级 | P0（HR-06）+ P1（HR-07） |
| 预估工作量 | **M**（初版估 L，摸排后下调 —— 批量生成已有，见 §1.1-①） |
| 版本 | v2 · 2026-08-31（摸排修正） |

## 1. 背景与目标

### 1.1 问题

**① 🔴 已有批量生成，缺的是批次管理**（2026-08-31 摸排修正）

> 本 PRD 初版写"**没有批次**：算 500 人的薪只能逐条"，**这是错的**。

**实测 `HrEssServiceImpl.generateSalarySlips(String periodMonth, Long employeeId)`**：
```java
if (employeeId != null) { compWrapper.eq("employee_id", employeeId); }  // 传 null 则全员
List<HrEmployeeComp> comps = employeeCompMapper.selectList(compWrapper);  // 按 status='ACTIVE' 筛
for (HrEmployeeComp comp : comps) {
    if (existsSlip(tenantId, comp.getEmployeeId(), periodMonth)) { continue; }  // 幂等跳过
    salarySlipMapper.insert(composeSlip(tenantId, comp, periodMonth));
    created++;
}
log.info("月度工资条生成完成，employees: {}, created: {}", comps.size(), created);
```

**已具备**：全员批量生成、幂等跳过已存在工资条、生成计数、按在职状态筛选、`composeSlip` 算薪逻辑

**真实缺口**（本条目价值仍成立，但要重新表述）：

| 缺什么 | 后果 |
| --- | --- |
| 批次实体（无 `hr_payroll_batch`） | 无法回滚、无法只重跑失败项、无状态跟踪 |
| 前置校验 | 无"考勤未齐不许算薪" |
| per-employee 错误收集 | 循环里某人失败会中断整批，无错误清单 |
| 异步执行 | 同步循环，500 人会超 HTTP 超时 |
| 两阶段提交 | 无 `CALCULATED → SUBMITTED` 状态机 |

**工作量 L → M**：算薪核心逻辑（`composeSlip`）已在，本条目是**在其外面包一层批次管理**，而非重建算薪能力。

**② 个税配置在 JSON 里，且缺中国累计预扣**
`hr_tax_profile`（10 列）用 `tax_config` JSON 存税率，`threshold` 存起征点。个税税率改了要改**每个人的 JSON**。更关键的是：**中国个税按累计预扣预缴**，需要年度累计应税所得与累计已缴税额，当前 `hr_salary_slip` 无这两个字段。

### 1.2 目标
1. 批次成为一等公民：筛人 → 批量算 → 两阶段提交 → 可回滚可重跑
2. 算薪前置校验（考勤齐备、薪资结构已分配）
3. 个税税率表独立为主数据（含速算扣除数）
4. **支持中国累计预扣预缴**
5. 专项扣除两阶段（申报 / 已举证）

### 1.3 非目标
- 不做会计科目与总账过账（我们不是 ERP）
- 不做社保公积金申报文件生成（可后续评估）
- 不做多币种薪资

## 2. 现状基线（实测）

| 表/项 | 现状 |
| --- | --- |
| `hr_salary_slip` | 21 列：`employee_id, period_month, gross_total, deduction_total, net_total, tax_amount, benefit_amount, components(JSON), pay_date, status, employee_confirmed, confirmed_time, digest_sha256` + 审计列 |
| `hr_comp_component` | 薪酬项 |
| `hr_comp_structure` | 薪酬结构 |
| `hr_comp_grade` | 薪酬等级 |
| `hr_employee_comp` | 员工薪酬 |
| `hr_comp_change` | 薪酬变动 |
| `hr_tax_profile` | 10 列：`employee_id, tax_residence_city, threshold, tax_config(JSON), status, version` + 时间列 |
| `hr_tax_deduction` | 15 列：`employee_id, deduction_type, amount, start_date, end_date, status, remark` + 审计列 |
| `hr_benefit_scheme` / `hr_employee_benefit` / `hr_benefit_payment` | 福利与社保 |
| 批量能力 | **实测无**（无 payroll 相关类） |
| 薪资服务 | `HrTypedCrudService`（通用 CRUD）、`HrEssServiceImpl` |
| PDF | `HrPdfRenderer`（已有，工资条打印可复用） |

## 3. 范围

### 3.1 做
1. 新增 `hr_payroll_period`（薪资周期）
2. 新增 `hr_payroll_batch`（批次）+ `hr_payroll_batch_employee`（批次明细）
3. 新增 `hr_payroll_correction`（补正）
4. `hr_salary_slip` 增 `batch_id` 与累计字段
5. 新增 `hr_tax_slab` + `hr_tax_slab_detail`（税率表主数据）
6. `hr_tax_profile` 改为引用税率表
7. `hr_tax_deduction` 增申报/举证两态
8. 批量算薪引擎（幂等 + 失败重跑）
9. 算薪前置校验
10. 累计预扣预缴计算

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 会计科目/总账过账 | 不是 ERP；薪资出账走 OA 付款申请 |
| 社保申报文件生成 | 各地格式不同，按需另立 |
| 多币种 | 无需求 |
| 薪资审批流 | 复用现有工作流，本期只提供 `instance_id` 关联 |

## 4. 功能需求

### FR-1 薪资周期
- FR-1.1 新增 `hr_payroll_period`：`period_id, tenant_id, period_name, start_date, end_date, frequency(MONTHLY/SEMI_MONTHLY/WEEKLY), pay_date, status(OPEN/CALCULATING/CLOSED), remark` + 审计列
- FR-1.2 周期关闭后不允许新建批次或修改该周期的工资单
- FR-1.3 同一周期不允许重叠日期区间

### FR-2 薪资批次（HR-06 核心）
- FR-2.1 新增 `hr_payroll_batch`：
  ```
  batch_id, tenant_id, batch_no
  payroll_period_id
  posting_date
  筛选条件：filter_dept_ids(JSON), filter_position_ids(JSON), filter_job_level_ids(JSON),
           filter_employee_type, filter_employee_ids(JSON)
  employee_count
  validate_attendance_flag     是否强制考勤齐备
  status                       DRAFT/CALCULATING/CALCULATED/SUBMITTED/PAID/FAILED/CANCELLED
  slip_created_flag, slip_submitted_flag
  total_gross, total_deduction, total_tax, total_net   DECIMAL(14,2)
  error_message
  instance_id                  审批流实例
  calc_start_time, calc_end_time
  + 审计列
  ```
- FR-2.2 新增 `hr_payroll_batch_employee`：`batch_id, employee_id, employee_name, salary_slip_id, calc_status(PENDING/SUCCESS/FAILED/SKIPPED), error_message, gross_total, net_total`
- FR-2.3 批次生命周期：
  1. **建批次**：选周期 + 筛选条件 → 生成员工清单（可人工增删）
  2. **算薪**：`status=CALCULATING`，逐员工计算生成工资单，失败记录在明细的 `error_message`
  3. **算完**：`status=CALCULATED`，汇总总额，可查看错误清单
  4. **重跑**：只重算 `calc_status=FAILED` 的员工（幂等）
  5. **提交**：`status=SUBMITTED`，可走审批（`instance_id`）
  6. **发放**：`status=PAID`
  7. **取消**：`CANCELLED`，删除本批次生成的工资单
- FR-2.4 `hr_salary_slip` 增 `batch_id`（单条手工工资单该字段为空）
- FR-2.5 批次取消或重跑时，已生成的工资单按 `batch_id` 精确清理

### FR-3 算薪前置校验
- FR-3.1 建批次或算薪前校验，不通过的员工记 `calc_status=SKIPPED` + 原因：
  | 校验 | 说明 |
  | --- | --- |
  | 薪资结构已分配 | `hr_employee_comp` 有生效记录 |
  | 考勤齐备 | `validate_attendance_flag=1` 时，周期内每个工作日都有 `hr_attendance_record`（依赖 D2） |
  | 员工在职状态 | 已离职员工需特殊处理（走离职结算，批次 H HR-08） |
  | 税档已配置 | `hr_tax_profile` 有生效记录 |
  | 无未结清冻结 | 如有薪资暂扣（批次 H HR-14 借款）需提示 |
- FR-3.2 校验结果在建批次时预览，HR 可决定是否继续

### FR-4 算薪逻辑
- FR-4.1 计算顺序：
  1. 取员工薪资结构（`hr_employee_comp` + `hr_comp_structure`）得应发项
  2. 按考勤扣款（缺勤、迟到，规则来自 D2 的考勤结论）
  3. 按无薪假扣款（D1 的 `lwp_flag` 与部分带薪 `salary_fraction_per_day`）
  4. 加福利与社保（`hr_employee_benefit`）
  5. 加变动项（`hr_comp_change`、加班费、奖金、内推奖金）
  6. 减专项扣除（`hr_tax_deduction`）
  7. **算个税**（FR-5 累计预扣）
  8. 得实发
- FR-4.2 每项计算明细存 `hr_salary_slip.components`（JSON），保证可追溯
- FR-4.3 `digest_sha256` 在工资单最终确定时计算（保留现有防篡改机制）
- FR-4.4 计算过程可重入：同一批次同一员工重算覆盖原工资单（保持 `slip_id` 不变）

### FR-5 个税税率表与累计预扣（HR-07）
- FR-5.1 新增 `hr_tax_slab`：`slab_id, tenant_id, slab_name, region, effective_from, effective_to, threshold_amount(起征点), status, remark` + 审计列
- FR-5.2 新增 `hr_tax_slab_detail`：`slab_id, level_no, from_amount, to_amount, tax_rate DECIMAL(6,4), quick_deduction DECIMAL(12,2)`
  - **`quick_deduction`（速算扣除数）是中国个税本地化必需字段**，参考项目没有
- FR-5.3 `hr_tax_profile` 增 `tax_slab_id` 引用税率表，`tax_config` JSON 降级为扩展位
- FR-5.4 **累计预扣预缴**：`hr_salary_slip` 增
  ```
  cumulative_taxable_income   年度累计应税所得 DECIMAL(14,2)
  cumulative_deduction        年度累计扣除 DECIMAL(14,2)
  cumulative_tax_payable      年度累计应纳税额 DECIMAL(14,2)
  cumulative_tax_paid         年度累计已缴税额 DECIMAL(14,2)
  current_tax                 本期应缴（= 累计应纳 - 累计已缴）
  ```
  计算：本期个税 = (年度累计应税所得 × 适用税率 - 速算扣除数) - 年度累计已缴税额
- FR-5.5 年度首月自动重置累计值；中途入职员工按入职月起算
- FR-5.6 税率表变更不影响已生成的工资单（工资单存计算时的税率快照在 `components` JSON 里）

### FR-6 专项扣除两阶段（HR-07）
- FR-6.1 `hr_tax_deduction` 增：`declare_status(DECLARED/PROOF_SUBMITTED/VERIFIED/REJECTED), proof_file_url, verify_by, verify_time, reject_reason`
- FR-6.2 算薪时按 `hr_payroll_batch` 的 `deduct_unverified_flag` 决定是否扣除未举证的申报项
- FR-6.3 员工在 ESS 门户申报与上传证明；HR 审核

### FR-7 补正
- FR-7.1 新增 `hr_payroll_correction`：`correction_id, original_slip_id, correction_slip_id, reason, corrected_by, correction_time, diff_amount`
- FR-7.2 已发放的工资单发现错误时，生成补正工资单（不修改原单），差额在下期发放或单独补发
- FR-7.3 补正需审批

### FR-8 工资条
- FR-8.1 员工在 ESS 查看工资条（保留现有 `employee_confirmed` 确认机制）
- FR-8.2 PDF 导出复用现有 `HrPdfRenderer`；打印模板对接批次 G 的 LC-07
- FR-8.3 工资条仅本人可见（严格权限）

## 5. 数据模型汇总

| 操作 | 表 |
| --- | --- |
| 新增 | `hr_payroll_period`、`hr_payroll_batch`、`hr_payroll_batch_employee`、`hr_payroll_correction`、`hr_tax_slab`、`hr_tax_slab_detail` |
| 改造 | `hr_salary_slip`（增 `batch_id` + 5 个累计字段） |
| 改造 | `hr_tax_profile`（增 `tax_slab_id`） |
| 改造 | `hr_tax_deduction`（增 5 个举证字段） |

`DB/03.cloudflow-hr.sql`：+6 表

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| **幂等** | 同一批次重复算薪结果一致；重跑只处理失败项 |
| 精度 | 全部金额 DECIMAL(14,2)，税率 DECIMAL(6,4)；**计算过程不用 float/double** |
| 性能 | 500 人批量算薪 < 3 分钟；走异步任务（批次 A SYS-02），前端轮询进度 |
| 事务 | 单员工算薪为一个事务；批次整体不做大事务（避免长事务锁表） |
| 并发 | 同一周期同一员工不允许被两个批次同时计算（加锁或唯一约束） |
| **权限（最严格）** | 工资单本人可见；HR 按数据权限范围可见；批次操作需 `hr:payroll:*` 权限；**所有查询与导出记审计** |
| 防篡改 | 保留 `digest_sha256`；工资单确定后字段不可改，只能走补正 |
| 审计 | 建批次、算薪、提交、发放、取消、补正全部记 `hr_audit_log` |
| 数据准确性 | 税率表变更记审计；建议走审批 |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 建批次按部门筛选出员工清单，可人工增删 |
| AC-2 | 500 人批量算薪成功，走异步任务不阻塞接口，前端可看进度 |
| AC-3 | 部分员工算薪失败时，批次状态为 CALCULATED 且错误清单可查；重跑只处理失败项 |
| AC-4 | **重复算薪结果一致（幂等）** |
| AC-5 | 批次取消后本批次生成的工资单被精确清理，不影响其他批次 |
| AC-6 | `validate_attendance_flag=1` 时考勤不齐的员工被 SKIPPED 并给出原因 |
| AC-7 | 无薪假与部分带薪假正确扣款（联动 D1） |
| AC-8 | 考勤缺勤迟到正确扣款（联动 D2） |
| AC-9 | **中国累计预扣预缴计算正确**：连续 3 个月工资单的累计值递增，税率跨档时本期税额正确（用速算扣除数） |
| AC-10 | 年度首月累计值重置；中途入职员工按入职月起算 |
| AC-11 | 税率表变更后，已生成工资单的税额不变（快照验证） |
| AC-12 | 专项扣除未举证时按批次开关决定是否扣除 |
| AC-13 | 补正工资单生成后原单不变，差额正确 |
| AC-14 | 同一周期同一员工无法被两个批次同时计算 |
| AC-15 | **权限：员工只能看自己工资条；非授权用户无法查他人；所有查询记审计** |
| AC-16 | 工资单确定后字段不可改（只能补正） |
| AC-17 | 全部金额计算无浮点误差（大额与小数场景验证） |
| AC-18 | 周期关闭后无法新建批次或改工资单 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **D1 假期规则体系** | 无薪假与部分带薪假扣款；强依赖 |
| **D2 考勤判定** | 考勤扣款与齐备校验；强依赖 |
| **批次 A SYS-02 任务平台** | 异步批量算薪 |
| **批次 A SYS-01 消息中心** | 工资条发放通知 |
| 现有 `hr_comp_*` 五表 | 薪资结构 |
| 现有 `HrPdfRenderer` | 工资条 PDF |
| 批次 G LC-07 打印模板 | 工资条模板（弱依赖） |
| 批次 H HR-08 离职结算 | 离职员工薪资（弱依赖） |
| 批次 H HR-14 借款 | 借款扣还（弱依赖） |

### 8.2 风险

| 风险 | 应对 |
| --- | --- |
| **薪资是最高敏感数据，权限或审计缺失后果严重** | NFR 最严格权限 + AC-15；工资条本人可见；所有查询导出记审计 |
| **累计预扣计算错误直接导致个税申报错误** | AC-9/10 专项验证，需财务或 HR 用真实案例核对；建议提供"试算"功能对单个员工验证 |
| 依赖 D1/D2 未完成时无法算准 | 强依赖已列；建议 D1→D2→D3 顺序交付 |
| 500 人算薪性能与长事务风险 | 单员工一事务（NFR）；异步批处理；AC-2 验证 |
| 浮点精度导致金额误差 | 全程 DECIMAL（NFR）+ AC-17 |
| 批次取消清理不彻底导致脏数据 | 按 `batch_id` 精确清理 + AC-5 |
| 税率表配置错误影响全员 | 变更记审计；建议走审批（§10-2） |
| 已发放工资单被误改 | AC-16 + 补正机制 |

## 9. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 六张新表（SYS-07 生成）+ 周期管理 | AC-18 |
| M2 | 批次生命周期（建/算/重跑/提交/发放/取消） | AC-1/3/4/5/14 |
| M3 | 算薪引擎 + 前置校验（联动 D1/D2） | AC-6/7/8 |
| M4 | **税率表 + 累计预扣预缴 + 试算功能** | AC-9/10/11/17 |
| M5 | 专项扣除两阶段 + 补正 | AC-12/13/16 |
| M6 | 异步批量 + 进度 + 性能 | AC-2 |
| M7 | 权限与审计加固 + 工资条 ESS + PDF | AC-15 |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 累计预扣的年度起点 | 按自然年（中国个税规定），与 D1 的假期周期可以不同 |
| 2 | 税率表变更是否走审批 | 建议走审批（影响全员薪资）；可复用工作流 |
| 3 | 社保公积金是按固定值还是按基数比例算 | 需确认现有 `hr_employee_benefit` 的建模方式；若只存固定金额，可能需扩展支持基数×比例 |
| 4 | 工资条是否需要员工确认后才算发放完成 | 现有已有 `employee_confirmed` 字段，建议保留但不阻塞发放（确认只作为知悉记录） |
| 5 | 是否需要银行代发文件导出 | 本期不做；若需要按银行格式导出，另立小条目 |
