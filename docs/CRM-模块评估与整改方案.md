# CRM 模块深度与协作评估及整改方案

> 评估日期：2026-05-13
> 评估范围：`cloudflow-backend/cloudflow-service-crm`、`cloudflow-frontend/src/pages/Crm*`、与 `service-oa` / `service-workflow` / `service-hr` 的协作链路

---

## 一、整体规模对比

| 模块 | 后端 Java 文件数 | 前端页面数 | 备注 |
|---|---|---|---|
| service-workflow | 343 | 多 | 平台核心 |
| service-oa | 297 | 20+ | 承载合同 / 发票 / 预算 / 项目 / 资产 / 会议 / 印章 / 采购… |
| **service-crm** | **77** | **2** | `CrmManagementPage.tsx`（1388 行单页）+ `CrmCustomerWorkspacePage.tsx`（686 行） |
| service-hr | 45 | 7 | |

CRM 后端规模看似不算少，但**前端只有两个综合页面**，所有客户 / 联系人 / 商机 / 报价 / 回款 / 续约 / 工单 / 跟进的 CRUD 都堆在一张 1388 行的页面里。

---

## 二、模块深度评估

### 2.1 已实现内容（业务骨架完整）

- **8 张核心主表**：客户 (`oa_crm_customer`)、联系人、跟进、商机、报价、回款、续约、服务工单
- **客户工作台聚合**：`CrmCustomerWorkspaceVO`，串联客户名下合同 / 项目 / 预算 / 发票 / 回款
- **商机看板**：`CrmOpportunityBoardCardVO` / `CrmOpportunityBoardColumnVO`
- **客户健康度**：`refreshHealth()` 自动评分
- **回款账龄分析**：`CrmReceivableAgingBucketVO`
- **审批回调**：MQ Stream + `WorkflowApprovalCallbackStreamConsumer`，已接入报价、续约两类
- **基础看板**：`CrmDashboardController` / `CrmDashboardSummaryVO`

### 2.2 深度不足之处

| # | 问题 | 证据 |
|---|---|---|
| 1 | **前端入口单薄** | 商机看板、报价管理、回款台账、销售业绩在后端都有 VO，但前端只有 1 张 1388 行综合页 + 1 张客户工作台页，没拆出独立功能页 |
| 2 | **缺关键销售前段** | 没有线索 (Lead) → 客户转化、客户公海 / 分配规则 / 防撞单、产品库 / 价目表、销售目标 / 配额 |
| 3 | **报价缺行项目** | `CrmQuote` 无 `quote_line` 子表与对应 mapper.xml |
| 4 | **统计能力弱** | 全部使用 `LambdaQueryWrapper`，无 mapper.xml，无法承载漏斗 / 多维聚合 / 排行榜等复杂 SQL |
| 5 | **零单元测试** | `cloudflow-service-crm` 下无 test 目录的实质用例 |
| 6 | **巨型 Service** | `CrmCustomerServiceImpl` 单文件 **1080 行**，把客户 CRUD、工作台聚合、合同 / 项目 / 预算 / 发票草稿、回款确认全揉在一起，分层不清 |

---

## 三、与其他模块的协作

### 3.1 已有协作链路

| 方向 | 实现 | 内容 |
|---|---|---|
| CRM → Workflow | `RemoteWorkflowService.startProcess` | 启动报价 / 续约审批 |
| Workflow → CRM | MQ Stream 回调 → `QuoteApprovalHandler` / `RenewalApprovalHandler` | 审批结果回写 |
| CRM → OA | `RemoteOaService` | 创建合同 / 项目 / 预算 / 发票草稿；查询合同 / 发票 / 项目 / 预算列表 |
| OA → CRM | `RemoteCrmService.syncReceivableInvoiceStatus` | 发票核销状态回写到回款记录 |
| OA → CRM | `RemoteCrmWorkplaceService.getDashboardWorkplace` | OA 工作台聚合 CRM 待办 / 风险 / 动态 |

### 3.2 协作不足之处

| # | 协作缺口 | 影响 |
|---|---|---|
| 1 | **与 HR 完全脱节**：销售归属仅冗余字段 `ownerId/ownerName/deptId/deptName`，无任何 Feign 调 `service-hr` | 销售业绩没法归集到 `HrPerformancePage`；离职交接、组织调整无法联动客户 / 商机归属转移 |
| 2 | **审批接入面窄**：当前仅报价、续约两类 | 客户领取 / 公海转出、商机降级关闭、退款、客户分级变更等典型审批动作均未走 workflow |
| 3 | **无消息 / 通知服务调用** | 跟进逾期、回款到期、商机停滞只能在 dashboard 静态聚合，无主动推送 / 待办派发 |
| 4 | **财务闭环只到草稿层** | CRM 仅"创建草稿 + 拉列表"，未形成"赢单 → 合同 → 履约项目 → 回款 → 发票核销 → 业绩归集"的自动闭环，每一步仍需人工触发 |
| 5 | **无领域事件广播** | 除消费 workflow 回调外，CRM 自身没有发布"客户成交""回款到账"等事件，下游模块无法订阅 |

---

## 四、结论

- **深度**：业务骨架（8 域 + 客户工作台 + 商机看板 + 审批回调）已搭起来，但**前端入口、销售前段、统计分析、测试**四块明显偏薄，处于"能用但不深"水平。
- **协作**：与 OA、Workflow 已有双向链路（Feign + MQ），是项目里少数双向集成的模块；但**与 HR 完全没接、与通知 / 消息没接、审批面只覆盖 2 类动作**，距离"端到端业务闭环"仍有差距。

---

## 五、整改方案

按"价值 / 风险比"排序，分四个阶段推进，每阶段独立可交付。

### 阶段 1：架构清理与测试基线（1 周，零业务风险）

> 目标：为后续改动建立可回归的安全网，避免巨型类继续膨胀。

| 步骤 | 动作 | 产出 |
|---|---|---|
| 1.1 | 拆分 `CrmCustomerServiceImpl`（1080 行） | 抽出 `CrmCustomerWorkspaceService`（工作台聚合）、`CrmCrossModuleDraftService`（合同 / 项目 / 预算 / 发票草稿创建）；保留 Customer CRUD 在原 Service |
| 1.2 | 引入 mapper.xml 目录 | 新建 `resources/mapper/crm/`，把后续复杂统计 SQL 落到 xml |
| 1.3 | 补单元测试基线 | 至少覆盖：客户 CRUD、健康度刷新、商机阶段推进、报价审批回调、回款核销同步 |
| 1.4 | 抽取常量与枚举 | 商机阶段、客户健康等级、回款状态当前散落在字符串里，统一为枚举 |

### 阶段 2：与 HR 打通销售归属与业绩（1.5 周，低风险）

> 目标：让 CRM 不再是"信息孤岛"，销售数据能反哺 HR 绩效。

| 步骤 | 动作 | 产出 |
|---|---|---|
| 2.1 | 新增 `RemoteHrService`（CRM 侧 Feign） | 提供：按 userId 查员工归属部门、按 deptId 查部门信息、查询员工是否在职 |
| 2.2 | 客户 / 商机归属保护 | 新增 / 修改时校验 `ownerId` 在职；离职交接时通过事件批量改归属 |
| 2.3 | 新增 `RemoteCrmPerformanceService`（HR 侧 Feign） | 提供：按 ownerId / deptId 聚合"赢单数 / 合同金额 / 回款金额 / 跟进次数"，供 `HrPerformancePage` 直接消费 |
| 2.4 | 前端 `HrPerformancePage` 加 CRM 业绩卡片 | 至少展示 4 个指标 + 部门 / 个人 Top10 榜 |
| 2.5 | HR 离职流程发布 `EmployeeLeftEvent` | CRM 监听后弹出"客户 / 商机交接"待办，避免数据孤悬 |

### 阶段 3：业务闭环与审批面扩展（2 周，中风险）

> 目标：把"赢单 → 合同 → 项目 → 回款 → 发票"打通成自动链路；扩大审批覆盖。

| 步骤 | 动作 | 产出 |
|---|---|---|
| 3.1 | 商机赢单自动建合同草稿 | 商机阶段推进至"赢单"时，自动通过 `RemoteOaService.createContract` 落合同草稿，并把 quoteId 传过去 |
| 3.2 | 合同生效自动建项目 + 预算 | OA 合同审批通过后，发布 `ContractApprovedEvent`，CRM 监听并按合同生成履约项目草稿与预算计划 |
| 3.3 | 回款认领与发票自动核销 | 财务确认入账 → 发布 `ReceivableConfirmedEvent` → 自动触发 OA 发票核销绑定 |
| 3.4 | 扩展审批接入 | 新增 4 类审批：客户领取 / 公海释放、商机降级关闭、退款、客户分级变更；统一走 `RemoteWorkflowService.startProcess` + 现有回调框架 |
| 3.5 | 引入领域事件广播 | 新建 MQ 主题 `crm.events`：发布 `OpportunityWon` / `CustomerCreated` / `ReceivableConfirmed` / `CustomerOwnerChanged`，HR / OA / 通知服务可订阅 |

### 阶段 4：销售前段与前端拆分（2 周，独立交付）

> 目标：补全 Lead / 产品 / 配额三大缺口；把 1388 行综合页拆成独立功能页。

| 步骤 | 动作 | 产出 |
|---|---|---|
| 4.1 | 新增"线索 (Lead)"域 | `oa_crm_lead` 表 + Lead → Customer 转化接口 + 转化日志 |
| 4.2 | 新增"产品 / 价目表"域 | `oa_crm_product` + `oa_crm_price_book`；报价单加行项目 `oa_crm_quote_line` |
| 4.3 | 新增"销售目标 / 配额"域 | 部门 / 个人维度月 / 季 / 年配额；与阶段 2 的业绩聚合对照展示完成率 |
| 4.4 | 客户公海与分配规则 | 公海池表 + 自动回收（X 天未跟进自动回池）+ 抢单 / 分配规则配置 |
| 4.5 | 前端拆页 | `CrmManagementPage` 拆成：Lead 池、客户列表、客户公海、商机看板（独立路由）、报价管理、回款台账、续约管理、服务工单、销售业绩；旧页保留为聚合工作台入口 |
| 4.6 | 通知接入 | 跟进逾期、回款到期、商机停滞 N 天调用 `service-oa` 现有公告 / 待办接口主动推送 |

---

## 六、推荐执行顺序与里程碑

```
Week 1        阶段 1：架构清理 + 测试基线
Week 2-3      阶段 2：HR 打通（业绩归集 + 离职交接）
Week 4-5      阶段 3：业务闭环 + 审批扩展
Week 6-7      阶段 4：销售前段 + 前端拆分
```

**强烈建议先做阶段 1 与阶段 2**：
- 阶段 1 是后续所有改动的安全网（目前零测试，巨型类直接改风险高）
- 阶段 2 投入最少，业绩归集对管理层最直观，能立竿见影

阶段 3 与阶段 4 可以并行（不同人 / 不同分支），互不冲突。

---

## 七、风险与注意事项

1. **`CrmCustomerServiceImpl` 拆分**：1080 行的单类拆分需要先把测试补齐再动刀，否则容易引入隐性回归。
2. **领域事件引入**：MQ 主题命名、消费幂等、失败重试策略需要在阶段 3 启动前先定规范，避免 OA / HR 各搞一套。
3. **HR Feign 双向引用**：CRM 调 HR、HR 也调 CRM 时，要确保两个 Feign 都有 `contextId` 与 `fallbackFactory`，避免循环依赖与雪崩。
4. **前端拆页**：要先把现有 1388 行页面里的状态管理 (Zustand / Context) 抽离出来，再按域拆页，避免重复请求与状态错乱。
