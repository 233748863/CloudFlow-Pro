# 批次 H 技术设计要点（P2 增强项）

| 项 | 内容 |
| --- | --- |
| 覆盖 | H1（WF-09/10/11）· H2（HR-08/09/11/12/13/14）· H3（CRM-07/08/09/10）· H4（OA-07/08）· H5（SYS/LC/INT 六项） |
| 定位 | **按需挑选，不建议整批执行**。本文档给**设计要点**而非完整设计 —— 完整设计应在确定要做哪几项后再补 |
| 版本 | v1 · 2026-08-31 |

## 0. 为什么只给要点

H 批次共 19 个条目，PRD 已明确"按业务实际诉求挑选"。若现在做完整技术设计（DDL + 接口 + 逻辑），大概率有一半不会执行 —— 前面 6 个批次的经验是：**设计前必须摸排，摸排后 5 个条目工作量下降**。H 的条目若长期不做，摸排结果会过期。

**因此本文档只给**：已摸排确认的现状、关键设计决策、与前面批次的接口约定。**执行某项时再补完整设计**。

---

## 1. 已摸排确认的现状（19 项的基线）

| 条目 | 摸排结论 |
| --- | --- |
| WF-09 代理四态 | `wf_task.proxy_user_id` 字段存在但无 agent 语义；`wf_task_delegation.agent_mode` **已由批次 B 预留建列** |
| WF-10 包含网关 | `WfNodeConfig.branchStrategy` 仅 `PARALLEL`/`EXCLUSIVE`；`wf_parallel_join` 表已有 |
| WF-11 草稿 | 全仓无草稿痕迹；`wf_form_draft` **已由批次 B 预留建表**；实例状态 `DRAFT` **已由批次 B 纳入 14 态** |
| HR-08 离职结算 | `hr_lifecycle_*` 三表已有通用生命周期流程；无结算单；资产回收需跨服务查 `oa_asset.custodian_id`（**F1 已建该字段**） |
| HR-09 加班调班 | 加班混在 `hr_time_request`（`request_type` 区分）；调休转入需 D1 的 `hr_leave_ledger`（**已建**）与 `hr_leave_type.compensatory_flag`（**已建**）；加班倍率需批次 A 的 `triple_pay_flag`（**已建**） |
| HR-11 内推 | `hr_recruitment_channel` 有渠道概念，无推荐人与奖金状态 |
| HR-12 技能矩阵 | 培训体系 7 表 + 题库 3 表 + 证书 2 表已完整；无技能主数据；`hr_talent_development_action` 已有 |
| HR-13 绩效周期 | 绩效 7 表已较完整（objective/assignment/result/360/分布/面谈/校准会）；缺周期实体、KRA 层级、得分公式 |
| HR-14 借款 | 全无；需 D3 的算薪扣款接线 |
| CRM-07 团队分成 | `CrmPerformanceQueryServiceImpl` 实测有 `summarizeByOwner` / `summarizeByDept` / `topOwners` / `topDepartments` **四个聚合方法，全按单一 owner/dept 维度** —— 改造点明确 |
| CRM-08 客户门户 | 全无；**需公网入口**（与 G4 同一前置条件，已确认延后） |
| CRM-09 商机阶段 | 确无阶段校验；`win_rate`/`stage_changed_time` 字段已有（加权预测基础齐） |
| CRM-10 邮件归档 | 需邮件渠道（**批次 A 未做，阻塞**） |
| OA-07 会议深化 | `oa_meeting_room` / `oa_meeting_minutes` / `oa_meeting_attendance` 三表已有；**必须与 E1 的 `crm_activity` 对齐取值** |
| OA-08 耗材台账 | **已有出入库**（`ConsumableServiceImpl.addStock` + `getLowStockList`）**且已写 `oa_asset_log`**（`refType="2"` + `quantity_change`）；缺结存快照与领用单 |
| SYS-03 OAuth2 | 与 G4 一同延后 |
| SYS-06 租户套餐 | `sys_tenant` 已有 `user_limit`/`storage_limit`/`storage_used`/`expire_time`；缺套餐模板 |
| SYS-08 多数据源 | 已依赖 `dynamic-datasource` 4.3.1，配置在 Nacos |
| LC-06 自助报表 | 已定受限版（无自由 SQL）；依赖批次 A 的 LC-05 图表库 |
| INT-05 文件预览 | 依赖 G3 的签名 URL 与 `FileAccessChecker`（**G3 已设计**） |
| INT-06 全局搜索 | 前端 `useBackendMenus.ts` 已有（`useQuery` + `getRouters`），**一期菜单搜索几乎零成本** |

---

## 2. 前面批次已为 H 铺好的地基

这是 H 各项成本下降的原因，执行时不要重复建设：

| H 条目 | 已铺好的 | 来自 |
| --- | --- | --- |
| WF-09 | `wf_task_delegation.agent_mode` 列 | 批次 B §1.4 |
| WF-11 | `wf_form_draft` 表、实例状态 `DRAFT` | 批次 B §1.7、§1.5 |
| HR-08 | `oa_asset.custodian_id`（资产回收查询） | 批次 F |
| HR-09 | `hr_leave_ledger` 的 `COMPENSATORY` 类型、`hr_leave_type.compensatory_flag`、`sys_holiday_date.triple_pay_flag`、`hr_attendance_checkin.overtime_type_id`、`hr_shift.overtime_threshold_minutes`、`hr_attendance_record.overtime_minutes` | 批次 A、D |
| HR-13 | C3 的受限表达式解析器（改 `evalNumeric` 即可算得分公式） | 批次 C §5.3 |
| HR-14 | D3 的批次算薪（扣款作为变动项接入） | 批次 D |
| CRM-09 | `crm_opportunity.win_rate` / `stage_changed_time`；E3 的 `crm_lost_reason`（`is_lost_flag` 联动） | 现状 + 批次 E |
| OA-07 | E1 的 `status` 与 `acceptance_status` 取值标准、`crm_activity_reminder` 结构 | 批次 E §1.2 |
| OA-08 | F1 的 `oa_asset_movement` 模式可参照 | 批次 F |
| LC-06 | LC-05 的 ECharts 组件层 | 批次 A |
| INT-05 | G3 的 `FileAccessChecker` + 签名 URL | 批次 G §1.3/1.4 |
| INT-06 | `useBackendMenus.ts` 菜单树 | 现状 |

---

## 3. 五个关键设计决策（执行前需定，现在先记）

### 3.1 OA-07 必须与 E1 对齐（**强约束**）

批次 E 的 `crm_activity` 已定取值标准。OA-07 改 `oa_schedule_event` 与 `oa_meeting_attendance` 时**必须用同一套**：

```
status:            PLANNED / IN_PROGRESS / COMPLETED / CANCELLED / NOT_HELD
acceptance_status: NONE / ACCEPTED / DECLINED / TENTATIVE
提醒结构:          与 crm_activity_reminder 同（remind_minutes_before / channel_type /
                   sent_flag / send_time / message_record_id）
```

否则系统内出现两套不可互通的会议模型。**这是 H4 的第一验收项**。

### 3.2 OA-08 台账用新表而非扩展 `oa_asset_log`（F 的 §7-2 建议）

摸排发现耗材变动已写 `oa_asset_log`（`refType="2"`）。但该表**无 `balance_after`**，无法还原任意时点库存。

**决策**：新建 `oa_consumable_ledger` 专用台账（含 `balance_after` / `unit_price` / `amount`），原 `oa_asset_log` 保留作通用变更历史。理由：塞进共用日志表会让它承载资产与耗材两种语义，且加 `balance_after` 对资产无意义。

**同时要改**：`ConsumableServiceImpl.addStock()` 从"就地改数 + 写日志"改为"写台账 + 刷新物化值"（与 D1 假期额度同一模式）。

### 3.3 CRM-07 的业绩口径变更影响面

摸排确认 `CrmPerformanceQueryServiceImpl` 有 4 个聚合方法全按单一 owner/dept。改为按 `crm_deal_team.allocated_percentage` 分成后：

- 4 个方法的 SQL 都要改（在 XML mapper 里，符合项目规范）
- HR 侧 `HrCrmPerformanceController` 消费这些数据，**需同步确认是否受影响**
- `crm_sales_target` 的考核口径也要改

**建议**：执行时先确认 HR 绩效对 CRM 业绩数据的依赖方式，再决定是否同步改。

### 3.4 HR-13 得分公式复用 C3 的解析器

批次 C 已建 `RestrictedExpressionEvaluator`（白名单变量 + 受限语法 + 禁 eval）。HR-13 的 `final_score_formula` **直接复用**，只需加数值求值方法：

```java
public BigDecimal evalNumeric(String expr, Map<String,Object> vars, Set<String> allowedVars);
```

**不要另建表达式引擎** —— 否则系统里两套解析器两套安全边界。

### 3.5 INT-06 一期可提前到任意批次

摸排确认 `useBackendMenus.ts` 已有菜单树数据（`useQuery` + `getRouters`），一期菜单搜索是**纯前端零后端成本**：

```tsx
// 约 150 行即可完成
const { data: menus } = useBackendMenus();
const flatMenus = useMemo(() => flattenMenuTree(menus), [menus]);   // 菜单树已按权限过滤
// 拼音首字母匹配用 pinyin-match 或自建首字母索引
```

**建议提前做**（S 成本、零依赖、体验提升明显），不必等 H 批次。

---

## 4. 表数预估（若全做）

| 条目 | 新增表 |
| --- | --- |
| H1（WF-09/10/11） | 1（`wf_agent_setting`；草稿表与 agent_mode 列已由 B 建） |
| H2（HR 六项） | 13（离职结算 4 + 加班调班 2 + 内推 1 + 技能 3 + 绩效周期 2 + 借款 2） |
| H3（CRM 四项） | 8（团队分成 1 + 门户 1 + 商机阶段 2 + 邮件 1 + 目标名单等 3） |
| H4（OA 两项） | 4（耗材台账 1 + 领用单 2 + 会议无新表，改现有） |
| H5（六项） | 10（套餐 1 + 数据源 1 + OAuth2 5 + 自助报表 4 − 重叠） |
| **合计** | **约 36 张**（全做则全库 320 → 356） |

---

## 5. 建议的挑选优先级（综合摸排后）

| 优先级 | 条目 | 理由 |
| --- | --- | --- |
| **建议做** | INT-06 一期（菜单搜索） | S 成本、零依赖、可提前 |
| **建议做** | WF-11 草稿 | 表已由 B 建好，只需逻辑；用户感知直接 |
| **建议做** | OA-08 耗材台账 | 现有就地改数是实际问题（与 D1 同类） |
| **建议做** | HR-09 加班调班 | 地基已由 A/D 铺好（倍率、调休转入、加班字段全就绪）；加班混在请假表是设计缺陷 |
| 按需 | HR-08 离职结算 | 三笔账全线下有合规风险；但需 HR/法务确认补偿规则 |
| 按需 | CRM-09 商机阶段 | 加权预测字段已齐，补阶段主数据成本适中 |
| 按需 | HR-14 借款 / HR-11 内推 / HR-12 技能 / CRM-07 分成 / OA-07 会议 / SYS-06 套餐 / LC-06 报表 / INT-05 预览 | 看实际诉求 |
| **建议不做** | WF-10 包含网关 | 汇聚逻辑风险高（易致流程卡死），实际业务频率低 |
| **建议不做** | SYS-03 OAuth2 服务端 | 无明确第三方接入需求；OAuth2 安全细节多，成本与风险不匹配收益 |
| **阻塞** | CRM-08 门户 / CRM-10 邮件 / SYS-03 | 需公网入口或邮件渠道 |

---

## 6. 执行某项时的补设计清单

确定要做某条目后，需补：

1. **重新摸排该条目**（前面 6 批经验：摸排必有发现）
2. 完整 DDL（遵循对应模块的规范：workflow 用 `VARCHAR(64)` 主键、CRM/HR/OA 用 `BIGINT` 自增）
3. 接口签名 + 权限码（模块前缀限五类）
4. 与已铺地基的接线点（§2 表格）
5. 若涉及跨模块取值（如 OA-07 与 E1），先确认对齐标准
6. 更新表数与 `06` 种子数据（菜单 ID 段位：批次 A 用 1300-1349，**H 用 1800+** —— 2026-09-01 全批次段位重排，原 1100+ 会撞现有菜单，见 `01-决策汇总.md` §11.1）
