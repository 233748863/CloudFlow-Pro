# PRD：HR 增强项合集（HR-08/09/11/12/13/14）

| 项 | 内容 |
| --- | --- |
| 条目编号 | HR-08 离职结算 · HR-09 加班调班 · HR-11 内部推荐 · HR-12 技能矩阵 · HR-13 绩效周期 · HR-14 员工借款 |
| 所属批次 | 批次 H（P2 增强项，**按诉求挑选，不建议整批执行**） |
| 对标依据 | `docs/benchmark/04-hr-人力资源对标.md` |
| 优先级 | P1（HR-08/09）+ P2（HR-11/12/13/14） |
| 预估工作量 | HR-08 L / HR-09 M / HR-11 S / HR-12 M / HR-13 M / HR-14 S |
| 版本 | v1 · 2026-08-31 |

## 0. 本合集的定位与优先级建议

六项彼此独立，可单独取用。建议顺序：

| 顺序 | 条目 | 理由 |
| --- | --- | --- |
| 1 | **HR-09 加班调班**（M） | 依赖 D1 台账已就绪；加班混在 `hr_time_request` 是现存设计缺陷 |
| 2 | **HR-08 离职结算**（L） | 离职时应付应收资产回收三笔账目前全线下，合规风险 |
| 3 | **HR-14 员工借款**（S） | 成本低，与 D3 薪资批量天然衔接 |
| 4 | **HR-12 技能矩阵**（M） | 把已建成的培训体系（7 表 + 题库 + 证书）接到岗位胜任力，杠杆高 |
| 5 | **HR-11 内部推荐**（S） | 成本低但需求强度看公司招聘方式 |
| 6 | **HR-13 绩效周期**（M） | 现有绩效已较完整（objective/assignment/result/360/分布/面谈），补周期与公式是锦上添花 |

---

# HR-09 加班与调班独立建模

## 1. 背景

**加班挤在 `hr_time_request` 里**（`request_type` 区分请假/加班/出差），共用一套字段。后果：
- 加班费计算规则无处配（1.5 倍/2 倍/3 倍）
- 加班转调休无链路
- 调班无申请入口（只有 `hr_schedule_assignment` 由 HR 直接排）

## 2. 现状
| 项 | 现状 |
| --- | --- |
| `hr_time_request` | 19 列，`request_type` 混用请假/加班/出差 |
| 假期台账 | **D1 已交付** `hr_leave_ledger`（含 `COMPENSATORY` 调休转入类型） |
| 假期类型 | **D1 已加** `compensatory_flag`（调休假标记） |
| 节假日日历 | **批次 A 已交付**（`getDateType` 返回 `triple_pay_flag`） |
| 班次 | **D2 已改造**（含判定规则） |
| 薪资 | **D3 已交付**（批量算薪，加班费可作变动项） |

## 3. 功能需求
- FR-1 新增 `hr_overtime_type`：`type_id, tenant_id, type_code, type_name, applicable_day_type(WORKDAY/REST_DAY/HOLIDAY), rate_multiplier DECIMAL(4,2), salary_component_id, compensatory_flag(可转调休), compensatory_ratio DECIMAL(4,2)(转调休比例), max_hours_per_month, max_hours_per_day, need_approval_flag, status` + 审计列
  - 预置三条：工作日加班 1.5 倍 / 休息日加班 2 倍 / 法定节假日加班 3 倍
- FR-2 加班日类型由**节假日日历**自动判定（批次 A 的 `getDateType` + `triple_pay_flag`），自动匹配对应 `hr_overtime_type`
- FR-3 `hr_time_request` 加班类请求增：`overtime_type_id, actual_hours, approved_hours, settle_mode(PAY 折现 / COMPENSATORY 转调休), settled_flag, settle_time`
- FR-4 加班审批通过后按 `settle_mode` 结算：
  - `PAY`：生成薪资变动项（`hr_comp_change` 或 D3 的变动项），进入下期算薪
  - `COMPENSATORY`：按 `compensatory_ratio` 写 `hr_leave_ledger`（`transaction_type=COMPENSATORY`）
- FR-5 加班时长上限校验（月度与单日），走 `sys_business_rule`（新增规则码 `hr.overtime.hours.limit`）
- FR-6 新增 `hr_shift_request`（调班申请）：`request_id, tenant_id, request_no, employee_id, from_shift_id, to_shift_id, from_date, to_date, swap_employee_id(换班对象，可空), reason, approver_id, status, instance_id` + 审计列
- FR-7 调班审批通过后更新 `hr_schedule_assignment`

## 4. 验收标准
| # | 验收项 |
| --- | --- |
| AC-1 | 三种加班类型按日历自动判定（工作日/休息日/法定节假日） |
| AC-2 | 法定节假日加班匹配 3 倍类型（`triple_pay_flag=1`），调休日匹配 2 倍 |
| AC-3 | `settle_mode=PAY` 时生成薪资变动项，下期算薪含加班费 |
| AC-4 | `settle_mode=COMPENSATORY` 时按比例写假期台账，员工可用调休 |
| AC-5 | 月度/单日加班超上限时按规则中心配置 BLOCK 或 WARN |
| AC-6 | 调班申请可提交与审批；通过后排班更新 |
| AC-7 | 回归：现有请假与出差请求行为不变 |

## 5. 依赖
D1（台账 + `compensatory_flag`）、D2（班次）、D3（薪资变动项）、批次 A（节假日日历、规则中心）

---

# HR-08 离职结算单与经济补偿

## 1. 背景

`hr_lifecycle_application/_detail/_task` 是通用生命周期流程（入职/转正/调岗/离职共用），离职时能跑流程和任务清单，但**没有结算单**：
- 应付员工（未结工资、未休年假折现）
- 应收员工（借款、培训违约金）
- 资产回收（OA 有 `oa_asset` 但不与离职联动）

三笔账全部线下处理。且无经济补偿计算（N+1）。

## 2. 功能需求
- FR-8 新增 `hr_final_settlement`：`settlement_id, tenant_id, settlement_no, employee_id, lifecycle_application_id, join_date, relieving_date, work_years DECIMAL(5,2), total_payable, total_receivable, asset_recovery_cost, severance_amount, net_amount DECIMAL(14,2), status(DRAFT/CONFIRMED/PAID/CLOSED), instance_id, remark` + 审计列
- FR-9 新增 `hr_final_settlement_item`：`item_id, settlement_id, item_type(PAYABLE/RECEIVABLE/ASSET/SEVERANCE), item_name, source_biz_type, source_biz_id, amount DECIMAL(14,2), confirmed_flag, remark`
- FR-10 自动汇集三类数据：
  - **应付**：未结工资（D3）、未休年假折现（D1 台账余额 × 日薪）
  - **应收**：未结清借款（HR-14）、培训违约金（`hr_training_*`）
  - **资产**：调 OA 侧查该员工名下未归还资产（`oa_asset.custodian_id`，F1 已加该字段），复用 `oa_borrow_reminder_log` 提醒机制
- FR-11 新增 `hr_severance_rule` + `hr_severance_rule_slab`：工龄分档、计算基数（引用 `hr_comp_component`）、**封顶月数（社平工资 3 倍封顶是中国法定要求）**
- FR-12 经济补偿计算：按工龄分档 × 月工资基数，受封顶约束
- FR-13 新增 `hr_exit_interview`：离职面谈（结构参照现有 `hr_performance_interview`）
- FR-14 结算单走审批；确认后生成付款数据（对接 OA `biz_payment_request` 或 D3 薪资）

## 3. 验收标准
| # | 验收项 |
| --- | --- |
| AC-8 | 结算单可自动汇集应付/应收/资产三类数据 |
| AC-9 | 未休年假折现金额正确（读 D1 台账余额） |
| AC-10 | **资产回收清单正确（跨服务查 OA 该员工名下未归还资产）** |
| AC-11 | 经济补偿按工龄分档正确计算；**超社平 3 倍封顶时按封顶值** |
| AC-12 | 净额 = 应付 + 补偿 - 应收 - 资产损失 |
| AC-13 | 结算单走审批；确认后生成付款数据 |
| AC-14 | 离职面谈可记录 |
| AC-15 | 结算单确认后不可修改（需冲正） |

## 4. 依赖与风险
- 依赖：D1（年假余额）、D3（工资）、HR-14（借款）、F1（`oa_asset.custodian_id`）、跨服务调用
- 风险：**经济补偿计算涉及法律合规**，分档规则与封顶需 HR/法务确认；跨服务查资产需 OA 提供 `@Inner` 接口

---

# HR-14 员工借款与预支

## 1. 背景
无借款管理。OA 有付款申请（`biz_payment_request`）但那是对外付款，不是对员工的借款与逐月扣回。

## 2. 功能需求
- FR-15 新增 `hr_employee_advance`：`advance_id, tenant_id, advance_no, employee_id, advance_amount DECIMAL(14,2), purpose, apply_date, repay_mode(SALARY_DEDUCT 工资扣还 / LUMP_SUM 一次性归还), repay_start_month, repay_months, monthly_deduct_amount DECIMAL(14,2), repaid_amount, outstanding_amount, status(APPLYING/APPROVED/PAID/REPAYING/CLEARED/WRITTEN_OFF), instance_id` + 审计列
- FR-16 新增 `hr_advance_repayment`：`repayment_id, advance_id, repay_month, repay_amount, salary_slip_id, repay_type(SALARY/MANUAL), repay_date, remark`
- FR-17 借款审批通过后走 OA 付款申请放款
- FR-18 D3 算薪时读未结清借款生成扣款项，写还款流水
- FR-19 离职时未结清借款进 HR-08 结算单应收项
- FR-20 借款额度校验（如不超过月工资 3 倍），走规则中心

## 3. 验收标准
| # | 验收项 |
| --- | --- |
| AC-16 | 借款可申请与审批；通过后生成付款申请 |
| AC-17 | 算薪时自动扣还；还款流水正确 |
| AC-18 | 还清后状态置 CLEARED |
| AC-19 | 离职时未结清借款进结算单应收 |
| AC-20 | 超额度申请按规则中心配置拦截 |

## 4. 依赖
D3（算薪扣款）、HR-08（离职结算）、OA 付款申请、规则中心

---

# HR-12 技能矩阵与技能评估

## 1. 背景

培训体系已很完整（`hr_training_plan/_category/_instructor/_course/_session/_enrollment/_archive` 7 表 + 题库考试 3 表 + 证书 2 表），人才模块有 `hr_talent_development_action`。

**但没有技能主数据** —— "岗位要求什么技能 / 这个人差什么技能"无结构化表达，培训与岗位胜任力之间没有连线。

## 2. 功能需求
- FR-21 新增 `hr_skill`：`skill_id, tenant_id, skill_code, skill_name, skill_category, description, level_definition(JSON，各等级含义), status` + 审计列
- FR-22 新增 `hr_position_skill`：`position_id, skill_id, required_level(1-5), weight DECIMAL(6,4),必备/加分标记`
- FR-23 新增 `hr_employee_skill`：`employee_id, skill_id, current_level, assessed_by, assess_time, evidence_type(TRAINING/EXAM/CERTIFICATE/MANAGER_REVIEW/SELF), evidence_biz_id, expire_date(技能是否需复评), remark`
- FR-24 与培训打通：`hr_training_course` 增 `skill_id` + `target_level`；培训完成或考试通过后可自动提升技能等级
- FR-25 技能差距报表：`GET /hr/skill/gap?positionId=`（岗位要求 vs 在岗人员现状）
- FR-26 按技能差距推荐培训课程

## 3. 验收标准
| # | 验收项 |
| --- | --- |
| AC-21 | 技能主数据可维护；岗位可配置required技能与等级 |
| AC-22 | 员工技能可评估录入，支持五种证据类型 |
| AC-23 | 培训完成/考试通过后技能等级自动提升 |
| AC-24 | **技能差距报表正确**（岗位要求 vs 在岗现状） |
| AC-25 | 按差距推荐培训课程 |

## 4. 依赖
现有培训与考试体系、`hr_position`、批次 A LC-05（报表）

---

# HR-13 绩效周期与最终得分公式

## 1. 背景

现有绩效覆盖面不错：`hr_performance_objective/_assignment/_result` + `hr_perf_evaluator/_response`（360 度）+ `hr_perf_distribution_rule`（强制分布）+ `hr_performance_interview` + `hr_performance_salary_adjustment` + `hr_talent_calibration_session`。

缺三点：① 无"周期"实体统一框定参评范围；② 最终得分算法固定不可配；③ 无 KRA 层级（目标直接挂人，缺权重聚合的中间层）。

## 2. 功能需求
- FR-27 新增 `hr_appraisal_cycle`：`cycle_id, tenant_id, cycle_name, cycle_type(MONTHLY/QUARTERLY/HALF_YEARLY/YEARLY), start_date, end_date, scope_dept_ids(JSON), scope_position_ids(JSON), scope_job_level_ids(JSON), evaluation_method(KRA_WEIGHTED/GOAL_BASED/MIXED), final_score_mode(WEIGHTED_AVG/FORMULA), final_score_formula VARCHAR(500), status(DRAFT/ONGOING/SCORING/CALIBRATING/COMPLETED), remark` + 审计列
- FR-28 新增 `hr_appraisal_kra`：`kra_id, cycle_id, kra_name, weight DECIMAL(6,4), description`；`hr_performance_objective` 增 `kra_id`
- FR-29 `hr_performance_assignment` 增 `cycle_id`
- FR-30 **得分公式安全约束**：`final_score_formula` 用**受限表达式**（白名单变量 + 四则运算），与批次 C LC-04 的 `visibleExpr` 同一套解析器。**禁止 eval / 脚本引擎 / 可执行代码字段**
- FR-31 周期状态机驱动流程：草稿 → 进行中（设目标）→ 评分中 → 校准中（对接现有 `hr_talent_calibration_session`）→ 完成
- FR-32 与现有 `hr_perf_distribution_rule`（强制分布）串联：校准阶段应用分布规则

## 3. 验收标准
| # | 验收项 |
| --- | --- |
| AC-26 | 周期可创建并框定参评范围（部门/岗位/职级） |
| AC-27 | KRA 可配置权重；目标挂 KRA；权重之和校验 |
| AC-28 | `WEIGHTED_AVG` 模式最终得分按 KRA 权重正确聚合 |
| AC-29 | `FORMULA` 模式按公式计算正确 |
| AC-30 | **公式中嵌入函数调用或脚本被拒绝**（安全） |
| AC-31 | 周期五态流转正确；校准阶段应用强制分布规则 |
| AC-32 | 回归：现有绩效功能不变 |

## 4. 依赖与风险
- 依赖：现有绩效七表、批次 C LC-04（受限表达式解析器可复用）
- 风险：**公式字段是代码注入面**，必须用受限解析器（FR-30 + AC-30）

---

# HR-11 内部推荐与推荐奖金

## 1. 背景
`hr_recruitment_channel` 有渠道概念、`hr_candidate` 有来源字段，但"谁推荐的、奖金给没给"无法记录。

## 2. 功能需求
- FR-33 新增 `hr_employee_referral`：`referral_id, tenant_id, referral_no, referrer_employee_id, referrer_name, candidate_name, contact_phone, email, current_employer, current_job_title, target_position_id, resume_file_url, referral_reason, status(SUBMITTED/SCREENING/INTERVIEWING/OFFERED/HIRED/REJECTED/DUPLICATE), candidate_id(转候选人后回指), hire_date, bonus_applicable_flag, bonus_amount, bonus_status(NOT_APPLICABLE/PENDING/APPROVED/PAID), bonus_pay_date, bonus_condition_remark(如"入职满 3 个月发放"), instance_id` + 审计列
- FR-34 ESS 门户提交推荐（上传简历）
- FR-35 推荐通过初筛后转为 `hr_candidate`，进入现有招聘流程
- FR-36 重复推荐检测（同一候选人手机/邮箱已存在时标 `DUPLICATE`）
- FR-37 奖金发放：入职满条件后由 HR 审批发放，作为薪资变动项进入 D3 算薪
- FR-38 推荐人可在 ESS 查看自己推荐的进展与奖金状态

## 3. 验收标准
| # | 验收项 |
| --- | --- |
| AC-33 | 员工可在 ESS 提交推荐并上传简历 |
| AC-34 | 推荐可转为候选人并进入招聘流程 |
| AC-35 | 重复推荐被检出并标记 |
| AC-36 | 奖金审批通过后进入薪资变动项 |
| AC-37 | 推荐人可查看进展与奖金状态 |

## 4. 依赖
现有招聘体系、ESS 门户、D3（奖金进算薪）、批次 G SYS-04（简历文件权限）

---

## 综合依赖汇总

| 依赖 | 被哪几项用 |
| --- | --- |
| **D1 假期台账** | HR-09（调休转入）、HR-08（年假折现） |
| **D2 考勤班次** | HR-09（调班） |
| **D3 薪资批量** | HR-09（加班费）、HR-14（借款扣还）、HR-11（推荐奖金）、HR-08（未结工资） |
| **批次 A 节假日日历** | HR-09（加班日类型判定） |
| **批次 A 规则中心** | HR-09（加班上限）、HR-14（借款额度） |
| **批次 C LC-04 受限表达式** | HR-13（得分公式） |
| **F1 `oa_asset.custodian_id`** | HR-08（资产回收） |
| **批次 A LC-05** | HR-12（差距报表） |

## 综合待确认

| # | 问题 | 建议 |
| --- | --- | --- |
| 1 | 六项各自是否有真实诉求 | 需 HR 确认。本 PRD 已给出优先级建议（§0） |
| 2 | 经济补偿分档规则与封顶标准 | **必须由 HR/法务确认**，涉及法律合规。社平工资 3 倍封顶是法定要求 |
| 3 | 加班转调休的比例 | 建议默认 1:1（加班 1 小时得 1 小时调休），可按加班类型配不同比例 |
| 4 | 借款额度上限 | 建议月工资 3 倍，走规则中心可配 |
| 5 | 技能等级定义（1-5 各代表什么） | 需 HR 定义；建议在 `hr_skill.level_definition` JSON 里按技能分别定义 |
| 6 | 绩效得分公式是否真需要 | 若 `WEIGHTED_AVG` 够用则不做 FORMULA 模式，可省掉表达式解析器的安全风险 |
