# H 批 OA-08：耗材台账设计确认稿

设计日期：2026-09-13。实施日期：2026-09-14。状态：用户已确认并实施，真实业务验收进行中。

本文保留设计阶段的摸排依据与验收预期。正式代码、04/06及重新生成的07已实施并导入；历史工作区变更保留。可复核的通过项、临时验收政策及未覆盖项见 [H 首轮实施与验收记录](H-首轮实施与验收记录.md)，不以本稿预期代替运行证据。

实施接线补充：耗材规则通过仅允许OA服务调用的内部接口读取，只允许当前租户的`oa.consumable.request.limit`及对应业务命中记录；不为业务员工开放外部规则管理接口。库存锁查询保持显式租户条件，并以方法级配置避开当前SQL解析器的锁语句重排问题。

## 0. 范围与确认入口

DDL = 定义表、字段及索引的语句；台账 = 每笔库存数量及金额变化的不可变记录；物化库存 = 为查询提速而保存、可从台账重新计算的库存数量和成本；幂等 = 同一个业务请求重试时只记一笔业务事实；冲正 = 新增与错误记录方向相反的记录，保留原记录。

本稿覆盖 H4 原 PRD 的 OA-08 FR-5～FR-10、AC-15～AC-25：主数据补充、五类出入库、移动加权成本、领用与部分发料、采购收货接线、低库存提醒、重算任务及四类报表。会议 OA-07、通用表单子表、仓库/批次/序列号/库位/盘点单/调拨单及自动补货单均不在本项。

准确结构变化：新增 **3 表** `oa_consumable_ledger`、`oa_consumable_request`、`oa_consumable_request_item`；修改 **1 表** `oa_consumable`；删除 **0 表**。`oa_asset_log`、采购三表、现有风险/消息/规则/任务/工作流表均复用，不改表结构，不引入依赖。旧 H 文档“4（1+2+0）”不作为建表依据。

采用主代理本轮实查基线：正式 01～05 为 50/45/100/87/35，共 317 表，其中 OA 为 87 表；仅执行 OA-08 后 OA 为 90 表，全库净增 3 表。本轮其它 H 项及全库总目录由主代理汇总，本稿不重复统计。主代理已确认 1800～1859 菜单、任务及任务处理器编号无占用；OA 菜单只预留 1810～1829，实施前仍由主代理复核碰撞。

需要用户决定的业务问题合并为三组，详见 §8：审批策略与审批人；管理端直接领用是否统一绑定已批准申请；冲正限制、取消边界及未上线期初种子方案。整数数量、逐耗材单位与金额精度已由现库确定，不再作为提问。

## 1. 重新摸排证据

### 1.1 文档与代码证据

以下行号为本轮读取时的位置；仓库还存在其它代理的并行工作，实施前按符号复核，不依赖旧行号定位修改。

| 证据 | 本轮确认的事实及设计影响 |
| --- | --- |
| `docs/design/04-编码任务通用约束.md:168`、`:196`、`:206` | OA 使用自增 BIGINT；逐列 COMMENT、无物理外键；未上线直接改正式初始化定义，不做迁移；H 使用 1800+。 |
| `docs/design/11-批次H编码任务提示词.md:26`、`:85`、`:126` | 先完成六步设计再确认；独立台账保留原日志；必须覆盖既有行为回归。 |
| `docs/design/H-批次H技术设计要点.md:81` | 已定专用台账及“写台账、刷新物化库存”方向。 |
| `docs/prd/H4-OA-增强项合集-PRD.md:136`、`:159`、`:163`、`:183`、`:190`、`:195`、`:200`、`:206` | 原 PRD 还包含成本、部分发料、五种交易、风险提醒、重算与报表，不能只交付一个日志列表。 |
| `docs/design/F-批次F技术设计.md:41`、`:74`、`:618` | 出入库和通用日志早已存在；资产 movement 是结构化单据模式；不往 `oa_asset_log` 添加结存字段。 |
| `docs/design/F-批次F-DDL确认草案.md:9`、`:221`；`docs/design/F-批次F-实施验收记录.md:14` | F 已采用整数采购数量、采购金额 10,2 和资产调拨审批；F 的历史迁移记录不构成本项迁移授权。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/controller/ConsumableController.java:64`、`:80`、`:106` | 新增强制库存为 0；普通编辑不开放数量；删除阻止非零库存及采购引用。需保留并补保护版本、台账和领用引用。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/controller/ConsumableController.java:135`、`:148`、`:157`、`:169`、`:187` | 日志、低库存、补货建议、入库、ISSUE/LOSS 出库已有；不另建平行库存入口。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/ConsumableServiceImpl.java:70`、`:92`、`:134` | 当前读数量后 `updateById`，再写 `refType="2"` 日志；没有耗材版本列或行锁，也没有持久业务请求去重键。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/mapper/SysConsumableMapper.java:10`；`cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/SysConsumableMapper.xml:5` | XML 目前只有低库存查询，条件为 `quantity <= low_stock_threshold AND warn_enabled=1 AND deleted=0`；必须增加明确租户条件的锁定/聚合/受限更新 SQL。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/domain/dto/ConsumableStockDTO.java:9`；`cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/domain/SysConsumable.java:15` | 当前出入库只有数量、出库类型、备注，主数据没有成本或版本。不能假设已有价款与并发防护。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/PurchaseRequestServiceImpl.java:210` | 采购分批收货调用 `addStock`，随后更新累计收货并插入 receipt；这是必须同步接线的第二个库存入口。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaRfqPurchaseSourceService.java:73` | F 询价转采购的 `unit_price` 是报价单价，`amount` 是含折扣/税的 `gross()`；不能用单价乘数量替代真实采购行金额。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/BizPurchaseRequestMapper.xml:122` | 采购主单已有租户内 `FOR UPDATE`；收货接线可复用，不新建收货表。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaAssetOperationsService.java:146`、`:201`；`cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/OaAssetMovementMapper.xml:4` | F 使用行锁、业务状态门禁、审批结果实例校验。只复用机制，不照搬资产六种用途或“完成即改变保管人”。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaApprovalOutboxService.java:30`、`:49`、`:66` | 审批提交与 outbox（同事务保存、提交后投递的业务事件）同事务；已有 `F:` 预占令牌、提交快照和实例绑定检查。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/event/consumer/OaApprovalSubmittedEventConsumer.java:25`、`:31` | 现有消费器按 `OaApprovalParticipant` 动态分派，在业务事务外调用受限内部发起，再绑定实例；不需要新建事件表。 |
| `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/controller/WorkflowInnerController.java:17`、`:28` | `/inner/workflow/process/start` 已限定服务调用方，OA 在许可范围内；业务申请人无需新增通用流程发起权限。 |
| `cloudflow-backend/cloudflow-common/cloudflow-common-workflow-callback/src/main/java/com/cloudflow/common/workflow/callback/service/DefaultWorkflowCallbackDispatcher.java:46` | 回调通过 `TenantBroker` 恢复租户，只支持 APPROVED/REJECTED；不能假定 CANCELLED 已有通用业务回调。 |
| `cloudflow-backend/cloudflow-common/cloudflow-common-data/src/main/java/com/cloudflow/common/datascope/DataScopeUtils.java:69`；`cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/OaIdentityReferenceMapper.xml:4` | 数据范围可显式指定申请人/部门列；用户和部门已有同租户、未删除、有效状态查询，不混用 HR 员工主键。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaBusinessRuleService.java:23`、`:47`；`cloudflow-backend/DB/01.cloudflow-common.sql:597` | 规则中心只有单一数值阈值及 BLOCK/WARN/PASS 等效果，没有“自动审批”效果或双阈值列。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaRiskAlertServiceImpl.java:81` | 风险去重目前是查后插；耗材调用必须在耗材行锁内执行，不能把它当作已有数据库唯一约束。 |
| `cloudflow-backend/cloudflow-common/cloudflow-common-message/src/main/java/com/cloudflow/common/message/api/MessageSender.java:8`；`cloudflow-backend/cloudflow-common/cloudflow-common-message/src/main/java/com/cloudflow/common/message/api/MessageSendRequest.java:24` | 已有同事务消息事件及 `deduplicationKey`，通知不依赖新增消息表或邮件渠道。 |
| `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/job/OaAssetProjectJobs.java:21` | 已有 `JobHandler`、`DistributedJob`、`TenantIterator` 组合，任务纳管，无需新增 `@Scheduled`。 |
| `cloudflow-frontend/src/services/api/consumable.ts:33`、`:55`；`cloudflow-frontend/src/pages/admin/consumable/ConsumablePage.tsx:220`、`:545`、`:772`、`:836` | 现页已有主数据、出入库弹窗、日志、补货建议及权限按钮；没有价格、结存或领用申请明细编辑。 |
| `cloudflow-frontend/src/pages/PurchaseRequestPage.tsx:81` | 采购金额显示使用 `¥`、两位小数。币种解释见下一节，不擅自引入换汇。 |
| `cloudflow-backend/DB/06.cloudflow-business-seed.sql:640`、`:953`、`:996`、`:8199`、`:9936`、`:14449` | 实际为 11 角色；旧耗材菜单为 509/548～552；有两组非零库存及不完整通用日志种子；F 审批定义按有效租户初始化。 |

### 1.2 实库只读结果与口径差异

本轮对 `cloud_flow_db` 执行 `SET SESSION TRANSACTION READ ONLY; START TRANSACTION READ ONLY` 后，仅查询相关 `information_schema`、耗材单位和现有耗材授权，最后 `ROLLBACK`。未执行服务启动或数据变更。

| 项 | 原 PRD/旧描述 | 实库及本稿处理 |
| --- | --- | --- |
| 库存数量 | `current_stock DECIMAL(12,2)`，流水数量也为小数 | `oa_consumable.quantity`、采购数量、收货数量及日志数量均为 INT；本稿统一 INT，正操作量 1～2,147,483,647，库存 0～2,147,483,647，不支持小数换算。 |
| 单位 | 新增 `unit` | 当前已有 `VARCHAR(20)`；本租户 8 种耗材使用箱/支/包/根/盒/个；按每个耗材保存单位快照，根有 2 种、个有 2 种，不把不同单位相加成一个“库存量”。 |
| 单价、金额 | 主数据成本 12,2，部分字段未定精度 | `biz_purchase_item.unit_price/amount` 均为 `DECIMAL(10,2)`；本稿金额统一 10,2，非负上限 99,999,999.99，流水金额可为负；有效单价非负。 |
| 币种 | 没有明确定义 | 现库采购没有币种列，前端使用 `¥`；沿用现有采购人民币元显示口径，不新增币种列或换汇，不宣称支持多币种。 |
| 主数据重名 | `specification/safety_stock/current_stock/supplier_id` | 分别沿用 `model/low_stock_threshold/quantity/default_supplier_id`；已有 `unit` 不重复建列。 |
| 分类来源 | `category_id` 未定义主表 | 建议引用已有 `sys_dict_data.dict_code`，限定同租户 `dict_type=oa_consumable_category`；新增字典种子，不新建第 4 张“耗材分类表”。 |
| 预警边界 | 文案“低于安全库存” | 保留已实现的 `<= low_stock_threshold`，前端和扫描同口径；补货仍为 `max(target_stock-quantity,0)`。 |
| 流水现状 | “无流水” | 已有 `oa_asset_log(ref_type='2')`，本稿保留，新增专用不可变库存台账并一对一关联。 |
| 领用与表单 | 要点未展开，容易误认为可用通用子表 | 主代理确认 C 原 PRD 的通用子表/受限表单解析器未落地、当前字段类型仅 9 种；本业务使用专用 React 明细编辑，不复造通用表单平台。 |
| 当前授权 | 旧文档只有 10 角色 | 本轮实库旧耗材 6 项权限仅 admin(1)、manager(2) 持有；customer_success(11) 纳入新矩阵；不通过全角色交叉授权扩权。 |

本轮实库及正式 04 均未发现本稿三张新表。原 PRD 的小数库存和重名字段与实物表存在冲突，已先行向主代理报告；本稿展示对齐建议，没有越权修改旧文档或代码。

## 2. 完整 DDL 草案

以下语句只用于确认结构，严禁直接在当前运行库执行。确认后的实施方式是在正式 04 定义中合并最终结构，并重建符合台账语义的 06/演示生成源；不交付 ALTER 升级包或历史数据迁移。

新表自增起点 100、InnoDB、utf8mb4，无物理外键。标识键用 ASCII 二进制比较避免请求键大小写折叠。所有写入租户来自上下文，不能接受请求体里的租户；默认 100000 仅供初始化，不能替代租户校验。

### 2.1 `oa_consumable_ledger`：专用台账

```sql
CREATE TABLE oa_consumable_ledger (
  ledger_id                 BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '耗材台账ID',
  tenant_id                 BIGINT(20) NOT NULL DEFAULT 100000 COMMENT '租户ID',
  consumable_id             BIGINT(20) NOT NULL COMMENT '耗材ID',
  consumable_name           VARCHAR(100) NOT NULL COMMENT '耗材名称快照',
  model                     VARCHAR(100) NULL DEFAULT NULL COMMENT '规格型号快照',
  unit                      VARCHAR(20) NOT NULL COMMENT '计量单位快照',
  transaction_type          VARCHAR(16) NOT NULL COMMENT '交易类型(INBOUND/OUTBOUND/ADJUST/SCRAP/RETURN)',
  quantity                  INT(11) NOT NULL COMMENT '数量变化正增负减且不为零',
  balance_after             INT(11) NOT NULL COMMENT '本笔后库存数量',
  unit_price                DECIMAL(10,2) NOT NULL COMMENT '本笔计价单价快照元每单位',
  amount                    DECIMAL(10,2) NOT NULL COMMENT '本笔库存成本变化元正增负减',
  balance_amount_after      DECIMAL(10,2) NOT NULL COMMENT '本笔后库存总成本元',
  avg_cost_after            DECIMAL(10,2) NOT NULL COMMENT '本笔后移动平均单价元每单位',
  storage_location          VARCHAR(100) NULL DEFAULT NULL COMMENT '存放说明快照不表示独立库位',
  source_biz_type           VARCHAR(24) NOT NULL COMMENT '来源类型(PURCHASE_RECEIPT/CONSUMABLE_REQUEST/MANUAL)',
  source_biz_id             BIGINT(20) NULL DEFAULT NULL COMMENT '来源收货记录或领用申请ID手工为空',
  source_item_id            BIGINT(20) NULL DEFAULT NULL COMMENT '来源采购或领用明细ID',
  source_event_key          VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '服务端生成的唯一来源事件键',
  operation_key             VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '同一业务请求重试复用的幂等键',
  operation_line_no         INT(11) NOT NULL COMMENT '请求内稳定明细序号从1开始',
  operation_hash            CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '归一化请求SHA256摘要',
  source_ledger_id          BIGINT(20) NULL DEFAULT NULL COMMENT '正常退回对应的原领用台账ID',
  reversal_of_ledger_id     BIGINT(20) NULL DEFAULT NULL COMMENT '被整笔冲正的原台账ID',
  asset_log_id              BIGINT(20) NOT NULL COMMENT '本笔对应的原通用日志ID',
  beneficiary_id           BIGINT(20) NULL DEFAULT NULL COMMENT '实际领用人sys_user主键快照',
  beneficiary_name         VARCHAR(64) NULL DEFAULT NULL COMMENT '实际领用人姓名快照',
  dept_id                   BIGINT(20) NULL DEFAULT NULL COMMENT '领用归属部门ID快照',
  dept_name                 VARCHAR(64) NULL DEFAULT NULL COMMENT '领用归属部门名称快照',
  operator_id               BIGINT(20) NOT NULL COMMENT '实际操作人sys_user主键',
  operator_name             VARCHAR(64) NOT NULL COMMENT '实际操作人姓名快照',
  operate_time              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '服务端实际记账时间',
  remark                    VARCHAR(255) NOT NULL COMMENT '本笔业务原因或来源摘要',
  create_by                 VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建者',
  create_time               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (ledger_id),
  UNIQUE KEY uk_consumable_ledger_operation (tenant_id, operation_key, operation_line_no),
  UNIQUE KEY uk_consumable_ledger_source (tenant_id, source_event_key),
  UNIQUE KEY uk_consumable_ledger_log (tenant_id, asset_log_id),
  UNIQUE KEY uk_consumable_ledger_reversal (tenant_id, reversal_of_ledger_id),
  KEY idx_consumable_ledger_order (tenant_id, consumable_id, ledger_id),
  KEY idx_consumable_ledger_time (tenant_id, consumable_id, operate_time, ledger_id),
  KEY idx_consumable_ledger_business (tenant_id, source_biz_type, source_biz_id, source_item_id),
  KEY idx_consumable_ledger_return (tenant_id, source_ledger_id, ledger_id),
  KEY idx_consumable_ledger_dept (tenant_id, dept_id, operate_time, ledger_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='耗材不可变数量及成本台账';
```

流水不加 `deleted/version/update_*`：只允许追加，不允许 UPDATE、DELETE、软删除或回写原行。`reversal_of_ledger_id` 可空的唯一键保证每笔最多一次整笔冲正；普通记录为空，可并存。对应原记录、退回累计与租户一致性在耗材锁内校验，不把可空唯一索引误当作完整业务验证。

### 2.2 `oa_consumable_request`：领用申请主表

```sql
CREATE TABLE oa_consumable_request (
  request_id                BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '领用申请ID',
  tenant_id                 BIGINT(20) NOT NULL DEFAULT 100000 COMMENT '租户ID',
  request_no                VARCHAR(50) NOT NULL COMMENT '领用申请编号',
  applicant_id              BIGINT(20) NOT NULL COMMENT '申请人sys_user主键',
  applicant_name            VARCHAR(64) NOT NULL COMMENT '申请人姓名快照',
  dept_id                   BIGINT(20) NOT NULL COMMENT '申请人部门ID快照',
  dept_name                 VARCHAR(64) NOT NULL COMMENT '申请人部门名称快照',
  purpose                   VARCHAR(500) NOT NULL COMMENT '领用用途',
  apply_date                DATE NOT NULL COMMENT '申请日期',
  expect_date               DATE NULL DEFAULT NULL COMMENT '期望领用日期',
  total_amount              DECIMAL(10,2) NULL DEFAULT NULL COMMENT '提交或批准数量的估算总金额元无法估价时为空',
  issued_amount             DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '累计实际发料金额元已扣发料冲正未扣正常退回',
  returned_amount           DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '累计正常退回金额元已扣退回冲正',
  status                    VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT/APPROVING/APPROVED/ISSUED/REJECTED/CANCELLED)',
  instance_id               VARCHAR(64) NULL DEFAULT NULL COMMENT '当前审批预占令牌或工作流实例ID',
  create_key                VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '创建请求幂等键',
  create_hash               CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '创建请求归一化摘要',
  submit_key                VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL COMMENT '本轮提交幂等键',
  submit_hash               CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL COMMENT '本轮提交请求归一化摘要',
  rule_snapshot             JSON NULL DEFAULT NULL COMMENT '本轮审批策略规则版本阈值计算依据与审批人快照',
  submit_time               DATETIME NULL DEFAULT NULL COMMENT '本轮提交时间',
  issue_by                  BIGINT(20) NULL DEFAULT NULL COMMENT '最近一次发料操作人sys_user主键',
  issue_time                DATETIME NULL DEFAULT NULL COMMENT '最近一次发料时间',
  cancel_by                 BIGINT(20) NULL DEFAULT NULL COMMENT '取消操作人sys_user主键',
  cancel_time               DATETIME NULL DEFAULT NULL COMMENT '取消时间',
  cancel_reason             VARCHAR(255) NULL DEFAULT NULL COMMENT '取消原因',
  deleted                   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志本期业务接口不提供删除',
  version                   INT(11) NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                 VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建者',
  create_time               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                 VARCHAR(64) NOT NULL DEFAULT '' COMMENT '更新者',
  update_time               DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (request_id),
  UNIQUE KEY uk_consumable_request_no (tenant_id, request_no),
  UNIQUE KEY uk_consumable_request_create (tenant_id, create_key),
  UNIQUE KEY uk_consumable_request_submit (tenant_id, submit_key),
  UNIQUE KEY uk_consumable_request_instance (tenant_id, instance_id),
  KEY idx_consumable_request_applicant (tenant_id, applicant_id, deleted, status, request_id),
  KEY idx_consumable_request_dept (tenant_id, dept_id, deleted, status, request_id),
  KEY idx_consumable_request_dispatch (tenant_id, status, deleted, expect_date, request_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='耗材领用申请主表';
```

### 2.3 `oa_consumable_request_item`：领用申请明细

```sql
CREATE TABLE oa_consumable_request_item (
  item_id                   BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '领用申请明细ID',
  tenant_id                 BIGINT(20) NOT NULL DEFAULT 100000 COMMENT '租户ID',
  request_id                BIGINT(20) NOT NULL COMMENT '领用申请ID',
  consumable_id             BIGINT(20) NOT NULL COMMENT '耗材ID',
  consumable_name           VARCHAR(100) NOT NULL COMMENT '耗材名称快照',
  model                     VARCHAR(100) NULL DEFAULT NULL COMMENT '规格型号快照',
  unit                      VARCHAR(20) NOT NULL COMMENT '计量单位快照',
  apply_quantity            INT(11) NOT NULL COMMENT '申请数量正整数',
  approved_quantity         INT(11) NOT NULL DEFAULT 0 COMMENT '批准数量本期通过时等于申请数量',
  issued_quantity           INT(11) NOT NULL DEFAULT 0 COMMENT '累计实际发料数量已扣发料冲正未扣正常退回',
  returned_quantity         INT(11) NOT NULL DEFAULT 0 COMMENT '累计正常退回数量已扣退回冲正',
  unit_price                DECIMAL(10,2) NULL DEFAULT NULL COMMENT '本轮申请估算单价元无法估价时为空',
  amount                    DECIMAL(10,2) NULL DEFAULT NULL COMMENT '本轮申请或批准数量的估算金额元无法估价时为空',
  issued_amount             DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '累计实际发料金额元',
  returned_amount           DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '累计正常退回金额元',
  sort_no                   INT(11) NOT NULL DEFAULT 0 COMMENT '明细显示顺序',
  remark                    VARCHAR(255) NULL DEFAULT NULL COMMENT '明细备注',
  version                   INT(11) NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                 VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建者',
  create_time               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                 VARCHAR(64) NOT NULL DEFAULT '' COMMENT '更新者',
  update_time               DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (item_id),
  UNIQUE KEY uk_consumable_request_item (tenant_id, request_id, consumable_id),
  KEY idx_consumable_request_item_order (tenant_id, request_id, sort_no, item_id),
  KEY idx_consumable_request_item_material (tenant_id, consumable_id, request_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='耗材领用申请明细表';
```

同一申请每种耗材一行，前端合并重复选择，服务端重复则拒绝。明细不独立授权；任何读写先校验同租户主单及范围，再校验 `request_id`。仅无发料的 DRAFT/REJECTED 编辑允许同事务替换明细，记录主单差异审计；一经提交不重建明细 ID，防止来源台账悬空。请求主表与可变明细使用 `@Version` 和项目既有审计填充。

### 2.4 修改 `oa_consumable` 的完整差异片段

```sql
ALTER TABLE oa_consumable
  MODIFY COLUMN tenant_id BIGINT(20) NOT NULL DEFAULT 100000 COMMENT '租户ID',
  MODIFY COLUMN unit VARCHAR(20) NOT NULL DEFAULT '个' COMMENT '计量单位已有业务引用后禁止修改',
  MODIFY COLUMN quantity INT(11) NOT NULL DEFAULT 0 COMMENT '由耗材台账重算的物化库存数量',
  MODIFY COLUMN low_stock_threshold INT(11) NOT NULL DEFAULT 10 COMMENT '低库存预警阈值达到阈值也预警',
  MODIFY COLUMN target_stock INT(11) NOT NULL DEFAULT 0 COMMENT '补货目标库存0表示未设置目标',
  MODIFY COLUMN warn_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '库存预警开关1启用0停用',
  ADD COLUMN category_id BIGINT(20) NULL DEFAULT NULL COMMENT '同租户耗材分类字典编码',
  ADD COLUMN brand VARCHAR(100) NULL DEFAULT NULL COMMENT '耗材品牌',
  ADD COLUMN max_stock INT(11) NULL DEFAULT NULL COMMENT '建议库存上限为空表示未设置不自动阻止收货',
  ADD COLUMN avg_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '物化移动平均成本元每单位',
  ADD COLUMN stock_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '物化库存总成本元',
  ADD COLUMN last_purchase_price DECIMAL(10,2) NULL DEFAULT NULL COMMENT '最近有效采购收货的计价单价元无采购时为空',
  ADD COLUMN storage_location VARCHAR(100) NULL DEFAULT NULL COMMENT '存放说明不表示独立仓库或库位',
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE可新领用/INACTIVE停用)',
  ADD COLUMN last_calc_time DATETIME NULL DEFAULT NULL COMMENT '最近记账或重算时间',
  ADD COLUMN version INT(11) NOT NULL DEFAULT 0 COMMENT '并发更新乐观锁版本号',
  MODIFY COLUMN create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN update_time DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  ADD KEY idx_consumable_warning (tenant_id, deleted, status, warn_enabled, quantity),
  ADD KEY idx_consumable_category (tenant_id, category_id, deleted, status);
```

未列入 MODIFY 的现有列保持正式 04 原类型、可空性、默认值和 COMMENT，包括名称、型号、供应商、deleted、创建/更新者及主键/原租户索引。不存在对采购表或原日志表的隐含 ALTER。

`stock_amount`、流水金额结存及均价快照是原字段清单之外必要的成本接线字段：只保存两位均价再乘数量会累计舍入误差。幂等键/摘要、来源日志引用、原流水引用用于重复与冲正控制；申请累计已发/已退金额及数量用于部分发料与追溯；全部随本稿一起审定，不视为已获实现授权。

## 3. 接口、权限和页面

### 3.1 通用协议

下表列浏览器经过网关的完整路径；OA Controller 去掉 `/oa` 前缀。新接口统一 `R<T>`，分页为 `R<PageResult<T>>`，页码从 1 开始、默认每页 10、每页最大 100。旧耗材列表的 `IPage` 外形保留，不顺手改全模块分页。

库存写请求必有 `operationKey`（1～64 位 ASCII 字母、数字、冒号、横线或下划线，推荐 UUID）和 `remark`（去空白后 1～255 字）。申请创建/提交使用同名请求键分别保存为 `create_key/submit_key`。可变主单修改必传 `version`，库存数量及成本更新使用事务内重新锁定的最新版本。库存记账/冲正、采购收货、领用创建/提交/发料以及承诺 changed=false 的幂等重算入口仅使用 `@RepeatSubmit.Disabled`，由行锁、状态/版本和数据库唯一键提供持久防重，保留适用限流。现有 `@RepeatSubmit` 默认5秒会在业务重放查询前直接拒绝，不能与这些入口的“立即重试返回原结果”承诺并用；其余未承诺重放的写接口继续使用 `@RepeatSubmit`。

所有请求体使用明确 DTO（仅接收允许编辑的字段），拒绝注入 `tenantId/operatorId/quantity物化值/stockAmount/avgCost/approvedQuantity/issuedQuantity/status/instanceId` 等服务端字段。新增金额输入为两位十进制字符串，服务端 BigDecimal 计算；新增金额输出用十进制字符串，前端只展示，不计算应记成本。新增业务 ID 按十进制字符串序列化，旧耗材/采购 API 已有 ID 形态保留，统一在 API 适配层处理，避免对 ID 做数值运算。

参数非法沿用项目异常处理返回参数错误，权限不足返回 403；跨租户和不可见记录统一按不存在处理，避免枚举 ID。库存不足、版本冲突、键重用但内容不同均返回明确业务错误（如 `STOCK_NOT_ENOUGH`、`VERSION_CONFLICT`、`IDEMPOTENCY_CONFLICT`），不得返回成功或吞掉受影响行数为 0 的更新。

### 3.2 保留并改造的耗材、采购接口

| 方法与完整路径 | 入参 | 出参 | 权限码及设计 |
| --- | --- | --- | --- |
| `GET /oa/consumable/list`、`GET /oa/consumable/{id}` | 原查询增加 categoryId/status；ID | 原响应增加分类、品牌、状态、位置及版本；成本列有权才回传 | `oa:consumable:list`；成本需额外 `oa:consumable-ledger:cost`，无权不序列化金额列。 |
| `POST /oa/consumable` | name(1～100)、model≤100、unit(1～20)、categoryId?、brand?、lowStockThreshold、targetStock、maxStock?、defaultSupplierId?、warnEnabled、storageLocation? | 原 `R<Void>` | `oa:consumable:add`；服务端建立 quantity/stockAmount/avgCost=0，不能以主数据创建写初始库存。 |
| `PUT /oa/consumable` | 上述字段、consumableId、version；另允许 status=ACTIVE/INACTIVE | 原 `R<Void>` | `oa:consumable:edit`；只更新白名单列，拒绝过期版本。库存有台账/采购/领用引用后单位冻结。 |
| `DELETE /oa/consumable/{ids}` | 去重后的 ID 列表，最多 100 | 原 `R<Void>` | `oa:consumable:remove`；全部校验并同事务执行。非零库存、有采购/台账/领用引用任一成立即拒绝整批删除，改用停用。 |
| `GET /oa/consumable/{id}/logs` | ID | 保留原通用日志数组，可附 ledgerId 供跳转 | `oa:consumable:list`；保留 `ref_type='2'` 与租户过滤，固定资产日志不混入。 |
| `GET /oa/consumable/low-stock` | 无 | 现有耗材清单 | `oa:consumable:list`；仍按 `<=` 判断，停用但未清空的耗材在管理台可查，正常补货列表不自动推荐停用品。 |
| `GET /oa/consumable/replenishment-suggestions` | 无 | 现有补货建议结构 | `oa:consumable:list`；沿用目标库存、有效默认供应商，一键采购仍需原采购新增权限。 |
| `POST /oa/consumable/{id}/add-stock` | quantity、unitPrice、remark、operationKey | `StockPostingVO` | `oa:consumable:add-stock`；手工 INBOUND，unitPrice 必填，零价必须显式填 0，不能把缺价当免费。 |
| `POST /oa/consumable/{id}/reduce-stock` | quantity、stockOutType、remark、operationKey；ISSUE 另必填 requestId/itemId/requestVersion | `StockPostingVO` 或单行 `IssueResultVO` | 保留 `oa:consumable:reduce-stock`；LOSS→ADJUST 负数；ISSUE 委托同一个领用发料服务并同时要求 `oa:consumable-request:dispatch`、`oa:consumable-request:issue`。禁止原入口绕过审批。此行为变更待 §8 确认。 |
| `POST /oa/purchase/request/{id}/receipt` | 原 items[{itemId,quantity}]/remark，增加 operationKey 与 purchaseVersion | `StockPostingVO`（不改变原成功/失败外层封装） | `oa:purchase:receipt`；价格与金额仅从锁定的已批准采购明细取得，不能由前端传成本；沿用采购记录的数据范围。 |
| `POST /oa/purchase/request/from-suggestion` | 原供应商、耗材数量清单、用途与日期 | 原采购申请结果 | `oa:purchase:add`；保持现有“一键生成申请”流程，不自动下单/审批/入库，不再新建补货单表。 |

`StockPostingVO={operationKey,replayed,ledgerIds,rows:[{ledgerId,consumableId,transactionType,quantity,balanceAfter,unit,unitPrice?,amount?,balanceAmountAfter?}],sourceId?}`；价格字段按成本权限裁剪，引用来源不携带用户无权读取的合同、报价或银行资料。

### 3.3 新台账、调整与报表接口

| 方法与完整路径 | 入参 | 出参 | 权限码 |
| --- | --- | --- | --- |
| `GET /oa/consumable/ledger/list` | consumableId?、transactionType?、sourceBizType?、sourceBizId?、from/to?、pageNum/pageSize | `PageResult<LedgerVO>`，进出数量、结存、来源、冲正/退回关系、操作者及时间；金额可裁剪 | `oa:consumable-ledger:list` |
| `GET /oa/consumable/ledger/{ledgerId}` | 台账 ID | `LedgerVO`，附原通用日志和来源跳转标识 | `oa:consumable-ledger:list` |
| `POST /oa/consumable/ledger/{ledgerId}/reverse` | operationKey、remark；业务来源当前版本（采购或申请） | `StockPostingVO`，新的反向行 ID，不修改原行 | `oa:consumable-ledger:reverse`；采购来源再校验 `oa:purchase:receipt` 及该采购可写范围；领用来源再校验 `oa:consumable-request:issue`。 |
| `POST /oa/consumable/{id}/adjust` | direction=IN/OUT、正 quantity、IN 时必填 unitPrice、operationKey、remark | `StockPostingVO`，ADJUST | `oa:consumable:adjust` |
| `POST /oa/consumable/{id}/scrap` | 正 quantity、operationKey、remark | `StockPostingVO`，SCRAP | `oa:consumable:scrap` |
| `POST /oa/consumable/{id}/return` | sourceLedgerId、正 quantity、operationKey、remark、requestVersion | `StockPostingVO`，RETURN；成本取原发料分摊值 | `oa:consumable:return`；仓管实际收到实物后办理，不允许申请人自增库存。 |
| `POST /oa/consumable/{id}/recalculate` | mode=CHECK/REBUILD、version、operationKey、remark | `RecalculationVO={consistent,before,expected,after?,changed,reason}`；不生成虚构出入库 | `oa:consumable-ledger:recalculate`，高风险审计；CHECK 不改业务库存。 |
| `GET /oa/consumable/reports/stock` | consumableId?、categoryId?、from/to、pageNum/pageSize | 分耗材/单位的期初、流入、流出、期末及库存成本，不跨单位合计数量 | `oa:consumable-report:list`；成本另需 `oa:consumable-report:cost`。 |
| `GET /oa/consumable/reports/usage` | groupBy=DEPARTMENT/PERSON/CONSUMABLE、from/to、deptId?、applicantId?、分页 | 实发、正常退回、冲正后净数量/金额；数量按 consumableId+unit 保留维度 | `oa:consumable-report:list`；部门/人员过滤只能缩小授权范围。 |
| `GET /oa/consumable/reports/cost` | from/to、consumableId?、deptId?、分页 | 分耗材的入库成本、领用净成本、报废/调整成本及期末成本 | 同时具备 `oa:consumable-report:list`、`oa:consumable-report:cost`。 |

`LedgerVO` 对应台账业务列，另计算 `reversed`、`reversalLedgerId`、`returnedQuantity`；这些是查询派生字段，不回写台账。报表时间范围使用含起点、不含终点；默认本月，可查任意历史区间，分页和索引控制成本；不开放任意 SQL。库存预警清单复用现有接口与页面，不新建“预警数据表”。

### 3.4 领用申请接口

| 方法与完整路径 | 入参 | 出参 | 权限码及范围 |
| --- | --- | --- | --- |
| `GET /oa/consumable/request/catalog` | keyword?、categoryId?、分页 | 只返回可领用耗材 ID/名称/型号/单位/当前可领数量，不返回成本、供应商银行信息 | `oa:consumable-request:lookup`；同租户 ACTIVE 主数据，不授予旧库存管理权限。 |
| `GET /oa/consumable/request/list` | status?、requestNo?、from/to?、分页 | `PageResult<RequestSummaryVO>` | `oa:consumable-request:list`；固定本人范围。 |
| `GET /oa/consumable/request/department-list` | 同上，可附 deptId 进一步缩小范围 | `PageResult<RequestSummaryVO>` | `oa:consumable-request:dept-list`；叠加既有部门数据范围，不写死角色 ID。 |
| `GET /oa/consumable/request/{id}` | 申请 ID | `RequestVO` 主单、明细、发料/退回摘要；估价和成本按成本权限裁剪 | `oa:consumable-request:query`；与列表同范围，不因知道 ID 放宽。 |
| `POST /oa/consumable/request` | operationKey、purpose、applyDate、expectDate?、items[{consumableId,applyQuantity,remark?}]，1～100 行 | `{requestId,requestNo,status,version,replayed}` | `oa:consumable-request:add`；申请人及部门从当前用户解析，不支持代填其他申请人。 |
| `PUT /oa/consumable/request/{id}` | version、purpose、applyDate、expectDate?、同上 items | `{requestId,status,version}` | `oa:consumable-request:edit`；仅本人 DRAFT/REJECTED、未发料可编辑；驳回后编辑回 DRAFT。 |
| `POST /oa/consumable/request/{id}/submit` | version、operationKey | `{requestId,status,version,instanceId?,approvalPending,replayed}` | `oa:consumable-request:submit`；仅本人发起，全部价格、规则、批准数量由服务端重算。 |
| `POST /oa/consumable/request/{id}/cancel` | version、reason(1～255) | `{requestId,status,version}` | `oa:consumable-request:cancel`；本稿建议只允许本人尚未发料的 DRAFT/REJECTED/APPROVED，APPROVING 的撤回不冒称现成。 |
| `GET /oa/consumable/request/dispatch-list` | requestNo?、applicantName?、分页 | 同租户 APPROVED/ISSUED 及发料历史摘要，不含未提交草稿 | `oa:consumable-request:dispatch`；仓管专用队列，独立于本人申请列表。 |
| `GET /oa/consumable/request/{id}/dispatch-detail` | 申请 ID | 仓管必要的申请人/部门/明细/已发/待发/退回记录 | `oa:consumable-request:dispatch`；同租户、进入发料阶段的单据。 |
| `POST /oa/consumable/request/{id}/issue` | version、operationKey、allowPartial（默认 false）、remark、items[{itemId,quantity}] | `IssueResultVO={requestId,status,version,replayed,rows:[{itemId,requestedQuantity,issuedQuantity,shortageQuantity,ledgerId?}],ledgerIds}` | 同时具备 `oa:consumable-request:dispatch`、`oa:consumable-request:issue`；仅 APPROVED；不得改申请人或批准数量。 |

审批复用 `POST /workflow/wf/complete`（`workflow:task:complete`，任务服务核验当前实际办理人），入参使用既有 `{taskId,action:APPROVE/REJECT,comment}`。本期审批通过即批准原申请数量，不开放在通用任务变量里更改批准量。仓库不足由部分发料解决，避免未经设计的审批子表回传协议。待办展示提交时的只读明细快照；不能用自由变量将本人变成审批人。

OA 内部新增 `ConsumableRequestApprovalHandler` 实现 `OaApprovalParticipant`，由现有回调消费器调用，不新增可由浏览器调用的“审批成功”接口。OA 发起使用已有 `/inner/workflow/process/start`，只允许受信服务调用，申请人不能伪造内部身份。

### 3.5 页面布局与数据范围

沿用 `ConsumablePage.tsx` 的卡片、查询栏、表格、弹窗、确认提示、现有 Input/Select/Button、主题变量与权限判断。新增台账页、领用页和报表页，不换 UI 库、图表库、主题或路由框架。明细编辑是本业务专用表格；使用现有控件逐行选耗材、填整数数量、校验、删除草稿行，不使用尚未实现的通用表单子表能力。

```text
耗材管理  [名称/分类/状态]                 [新增] [补货建议]
名称 | 型号 | 单位 | 库存 | 阈值 | 状态 | 入库/出库/台账/编辑

耗材台账  [耗材/时间/类型/来源]             [核对/重算]
时间 | 类型 | 增减 | 结存 | 单价* | 金额* | 来源 | 操作者
详情侧栏：来源单据、原日志、退回/冲正关联、原因

领用申请  [我的申请] [部门范围] [待发料（有权限）] [新申请]
申请人/部门（只读）  用途/日期
耗材选择 | 型号/单位 | 申请数 | 批准数 | 已发 | 已退 | 待发
草稿：保存/提交；待发料：本次数量/允许部分发料/确认发料

报表      [日期/耗材/单位/部门]   [进出存] [领用] [成本*]
分组表格及既有图表组件；*仅在服务端确认成本权限后展示
```

我的申请使用 `DataScopeUtils.onlySelf("applicant_id")`，Mapper 同时显式限定 tenant_id 和来自 UserContext 的 applicant_id，保证管理员的“我的申请”也只看本人，不依赖角色数据范围替代本人条件；部门入口额外要求 `oa:consumable-request:dept-list`，使用 `DataScopeUtils.listScope("dept_id","applicant_id")`，用户提交的部门筛选只能缩小范围。详情按本人或已授权部门入口校验，编辑/提交/取消仍仅限本人，不能沿用无范围的 `getById`。仓管队列为显式独立权限，不修改 OA_CLERK 在其它模块的角色数据范围。台账及总体库存报表是租户内共享库存资源，持对应读取权限才可看完整租户库存；人员/部门领用报表另按 §5 过滤，普通申请人仅看自己的领用快照。所有 JOIN 显式连接相同 tenant_id。

## 4. 业务处理与地基接线

### 4.1 唯一记账入口与事务原子性

实现时把 `ConsumableServiceImpl.addStock/reduceStock` 收敛到同一个耗材记账服务，采购收货、领用发料、退回、报废、调整均调用它。普通主数据编辑永远不修改 quantity/stock_amount/avg_cost；不能留下“兼容旧方法”直接覆盖数量的分支。台账是事实，数量和库存总成本是缓存；统一检验：

```text
库存数量 = SUM(ledger.quantity)
库存总成本 = SUM(ledger.amount)
每行 balance_after = 该耗材按 ledger_id 排序的数量前缀和
每行 balance_amount_after = 同序金额前缀和
avg_cost = quantity=0 ? 0.00 : ROUND(stock_amount / quantity, 2)
quantity=0 时 stock_amount 必须为 0.00
```

一笔业务事务的固定顺序：鉴权与请求验证 → 读取并核对同请求已成功结果 → 锁来源主单（有询价来源时沿用 F 的询价→采购顺序）→ 锁来源明细 → 按 consumable_id 升序锁全部涉及耗材 → 校验当前状态、版本、台账尾部与物化值 → 计算数量/成本 → 写对应原通用日志 → 插入专用台账 → 条件更新物化值/单据累计 → 必要的来源项目重算、审计/业务事件 → 提交。所有 SQL 进入 Mapper XML，`SELECT ... FOR UPDATE` 明确 tenant_id/deleted；不使用注解 SQL、Java 拼 SQL、`.last()` 或 `.apply()`。

锁所有耗材前不逐项执行入库/出库，避免两个多行请求反向拿锁。记账事务加入采购/领用已有本地事务，不使用 REQUIRES_NEW；任一步失败（含原日志、台账、主单最终更新受影响行数不为 1）抛异常，使库存、日志、台账、receipt、已收/已发数量一起回滚。不能沿用当前采购方法“末尾 update 返回 false，但前面已写数据”的结果处理。

本稿建议以 MySQL 行锁作为最终一致性保证；现有 Redisson 不需新增依赖，可作为外层削峰锁，不能取代数据库锁、状态检查和唯一键。原 PRD 的 Redisson 建议以“并发不超发”结果验收，不假定仅有 Redis 锁即可正确。

耗材一次变动至少保持：非零增减量、不会出现负库存或负成本、无整数溢出、金额不越 10,2 范围、源单属于当前租户。先用 Long/BigDecimal 计算并校验，再转 INT 入库，不能让 Java int 加法溢出后再判断。INACTIVE 禁止新申请、普通手工入库及新发料；有效旧采购收货、真实退回和合法冲正仍可办理并记账，避免停用阻断已发生业务。删除过的耗材不能新记账。

每笔新台账恰好配一条 `oa_asset_log(ref_type='2')`，数量方向一致、operator/target 对齐，使用新台账 `asset_log_id` 建立关系。固定资产 `ref_type='1'` 不受影响；原日志的零数量备注记录可保留，不冒充非零库存流水。手工记账备注限 255；采购 receipt 的原 500 字备注继续留在来源记录，台账及通用日志只存含采购号的有界摘要，不截断/丢失原采购备注。

### 4.2 持久幂等、重试与并发

| 场景 | 保证方式 |
| --- | --- |
| 相同请求重复发送 | operationKey 在同租户全局唯一，operation_line_no 为规范化明细的稳定序号；hash 包含入口类型、操作人、来源 ID、原始版本及全部业务参数。摘要一致返回原流水 ID 和原行结果；不再扣库存、不再写日志。 |
| 同键换参数/换调用人/换接口 | 返回幂等冲突，不以最后一次内容覆盖第一笔；读重放结果前也必须做当前数据权限检查。 |
| 不同键同时领用同一耗材 | 来源与耗材行锁串行化；后到者重新检查剩余库存和本单待发数量，不能使用锁前的 quantity。 |
| 采购多次正常分批收货 | 每次新 operationKey，新 receipt 主键生成 `PURCHASE_RECEIPT:<receiptId>` 来源键；一次收货请求中的 itemId 不得重复；累计收货不得超过申请。 |
| 领用多次正常分批发料 | `CONSUMABLE_REQUEST:<requestId>:<itemId>:<operationKey>` 来源键；同一明细可多笔，不能对 requestId/itemId 做禁止部分发料的唯一约束。 |
| 手工变动/退回/冲正 | 服务端生成 `MANUAL:<operationKey>:<lineNo>`、`RETURN:<sourceLedgerId>:<operationKey>`、`REVERSE:<originalLedgerId>`；不得直接信任前端 source_event_key。 |
| 重复审批/迟到旧审批 | 当前业务类型、租户、businessId、instanceId、提交快照及 APPROVING 状态全部匹配才处理；重复结果返回无副作用，旧轮审批不得覆盖重新提交。 |
| 超时后重试 | 前端保留原 operationKey 和原请求体；不能每次点击生成新键。锁超时/死锁使整个事务失败，重试仍用原键；唯一键竞争异常在事务外重新读取已提交结果，不在回滚事务内吞异常继续。 |

多行请求只会全部提交一次；如果允许部分发料，仍在一个事务内提交“本次明确可发的各行”。重放由原输入和已保存流水重建缺货行，不能使用重试时的新库存再次分配。全部可发数量为 0 时返回库存不足，不产生零数量流水或成功的空发料记录。

### 4.3 五类交易、移动加权成本与采购分摊

| 交易类型 | 数量方向 | 金额来源 | 原日志展示 |
| --- | --- | --- | --- |
| INBOUND | 正 | 手工 quantity×显式 unitPrice；采购按真实采购行 amount 分摊 | 入库 |
| OUTBOUND | 负 | 当前锁定库存总成本按本次发料数量占库存数量分摊 | 领用出库 |
| ADJUST | 正或负 | 盘盈需明确单价；盘亏按当前库存总成本分摊 | 盘盈调整/盘亏调整 |
| SCRAP | 负 | 当前库存总成本按报废数量分摊 | 报废出库 |
| RETURN | 正 | 关联原 OUTBOUND，按原发料金额分摊，不能使用今天的采购价 | 领用退回 |

冲正不增加第六种 transaction_type：保留原交易类型，quantity/amount 取反，设置 `reversal_of_ledger_id`，显示额外“冲正”标识；查询交易方向以有符号数量判断，不能只看类型。普通 RETURN 引用 `source_ledger_id`，与错误修正严格分开。

单价/金额采用已核对的 DECIMAL(10,2)，外部输入多于两位小数直接拒绝。业务内部除法使用 BigDecimal，金额按 HALF_UP 保留两位。`unit_price` 是计价展示快照；实际 `amount` 才是分摊后的账面成本，不能反向强制 amount=roundedUnitPrice×quantity。

移动加权：入库后成本=原库存总成本+本次真实入库金额，数量相加，均价=新成本/新数量四舍五入到分。出库 amount 的绝对值=`ROUND(出库前总成本×本次数量/出库前数量,2)`，出尽时直接取全部剩余成本，数量与成本同时归零。部分出库后的剩余成本仍作为下一笔的计算基数；不把两位 avg_cost 当作精确总成本来源。

采购使用锁定后的 `biz_purchase_item.amount`（F 已包含税额及折扣）和 `quantity`，不使用 `unit_price×收到数量`。本次入库金额=`ROUND(行总金额×新的有效累计收货量/申请量,2)-此前未冲正收货台账累计金额`；最后一次收足自然补齐尾差。台账单价保存整条采购行的有效计价单价 `ROUND(amount/quantity,2)`，原报价单价仍在采购明细中。分批收货金额总和等于原行 amount，不能再次加税或再打折。

例：采购 3 个、行金额 10.00 元，三次各收 1 个记 3.33/3.34/3.33，总计 10.00；若先收 2 个应记 6.67，不能记 6.66。入库 10 个×2.00，再入库 10 个×4.00，结存 20 个/60.00、均价 3.00；领 3 个出 9.00，剩 17 个/51.00；退其中 1 个按原发料记 3.00。

申请估价取当前有依据的库存平均成本，库存为零时可用最近有效入库计价快照；从无入库依据时 unit_price/amount/total_amount 保持 NULL，并在页面显示“待计价”。不能把缺失价格填为 0 后走免审批。正式发料必须使用当时实际库存成本，申请估价和实际领用成本分开展示，旧申请不因后续采购调价被回写估价。

### 4.4 发料、退回及冲正的单据一致性

建议一期保留原六个申请状态，不增加 PARTIALLY_ISSUED：

| 当前状态与动作 | 新状态/结果 | 库存影响 |
| --- | --- | --- |
| 新建或驳回后编辑 | DRAFT；重算估价，保留同一 request_no | 无 |
| DRAFT 提交且需要审批 | APPROVING；保存新提交键/规则快照/预占令牌 | 无，不预占库存 |
| DRAFT 提交且已确认阈值策略允许直通 | APPROVED；approved_quantity=apply_quantity，写自动通过审计 | 无，仍需仓管发料 |
| APPROVING 收到当前轮通过/驳回 | APPROVED/REJECTED；通过时批准全部申请数量，驳回时批准量为 0 | 无，审批回调不扣库存 |
| APPROVED 发出部分 | 仍 APPROVED；派生显示“部分发料”，累计 issued_quantity/issued_amount | 按实际发出写 OUTBOUND |
| APPROVED 全部发足 | ISSUED；各行 issued_quantity=approved_quantity | 按最后一笔实际发出记账 |
| 未发料的 DRAFT/REJECTED/APPROVED 本人取消 | CANCELLED，写取消原因/人/时间；重复同状态不重复操作 | 无 |
| APPROVING 取消、已部分发料取消或改量 | 本稿建议拒绝；审批中撤回/关闭剩余未发量需另行确认完整流程 | 无，不把取消当作退库 |
| 正常退回 | 申请原状态不变；增加 returned_quantity/returned_amount | RETURN；退回不会恢复已批准单的可再次发料额度 |
| 整笔发料冲正 | 减少 issued_quantity/issued_amount；原 ISSUED 回 APPROVED | 原发料反向行；原记录不改 |

发料上限为 `approved_quantity-issued_quantity`，库存上限为当前 quantity；允许部分发料时实际数为两者与请求量的最小值。审批过程不占库存，因此两张已批准单可竞争同一库存，但行锁保证最终不超发。未明确勾选 allowPartial，任何请求行不足均整单本次失败；允许部分时返回每行实际数和缺口，不悄悄改为全量成功。

RETURN 必须关联当前租户同耗材、未整笔冲正的原 OUTBOUND。该原行累计净退回量不得超过原发出量；本次退回金额使用原发出总金额按累计退回量分摊并补最后一笔尾差。更新申请主/子表累计退回量、金额与台账同事务；退回冲正扣减这些累计量。

建议本期冲正边界：仅整笔、仅该耗材物理记账顺序中最新一条非冲正流水、原行未被冲正、没有后续退回引用；不支持对更早成本记录倒插修正，不支持冲正的再次冲正。按原 quantity/amount 精确取反后恢复前一结存；越界或存在后续业务则拒绝，历史差错走带理由、独立授权的当前日期 ADJUST，而非改历史成本。这项业务限制需用户确认。

冲正采购收货时同时锁采购和明细，减少 received_quantity，重推 APPROVED/PARTIAL_RECEIVED/RECEIVED，并在同一事务重新计算关联项目成本；原 `biz_purchase_receipt` 仍保留，通过台账反向引用派生“已冲正”标识。不得删除 receipt，也不允许仅减库存但让采购仍显示收足。若采购已产生付款申请/付款关系或已进入其它不可逆后续状态，拒绝裸冲正，不能私自改付款及预算；该边界进入验收。领用冲正需同步主子表累计，任何单据更新失败使整笔回滚。

采购、领用来源不可伪装成 MANUAL 绕过来源权限。采购 receipt 查看若当前仅有原记录展示，实施时同一 OA 范围补充派生冲正标识；无须为此增加 receipt 状态列。项目汇总继续使用原采购汇总逻辑，不再把耗材台账金额第二次计入项目成本。

### 4.5 工作流与规则中心

建议规则码 `oa.consumable.request.limit`，继续使用规则中心单一 `threshold_value`，不增加新表/列或新 effect 枚举。通过既有 `sys_config` 的 `sys.oa.consumable.approvalMode=ALWAYS/THRESHOLD`、`sys.oa.consumable.limitMetric=AMOUNT/QUANTITY` 指明含义。建议默认 ALWAYS（每单审批），业务确认后才启用 THRESHOLD；金额未知始终送审，不能免审。

THRESHOLD：AMOUNT 比较有依据的申请估算金额；QUANTITY 按每行申请量判断任一行超过阈值，不把“箱+根”相加。建议“超过”使用 `>`，恰好等于阈值不触发额外审批。命中 WARN/ALERT 时由本业务送审；BLOCK 明确拒绝提交；PASS 直通需显式配置。ALWAYS 下 PASS 不取消全审批策略。规则缺失、非法、中心不可用或审计命中记录失败时提交失败，不静默免审。阈值数值、维度与审批人由用户确定，系统默认值不冒称公司制度。

读取并校验规则、解析审批人可在本地事务外进行；进入短事务后重新核验请求 version，并持久保存规则版本/金额依据/选定审批人快照。审批人优先从已配置的同租户负责人取得，使用现有用户/部门查询校验有效性和既有任务办理权限；缺失或指向跨租户用户则拒绝提交，不能默认跨租户使用 user_id=1。申请人不得自己指定 approverIds。审批人恰为申请人时建议拒绝提交并要求管理员配置替代审批人，不沿用 F 演示模型的自动允许自审。

禁止自审需要实际服务接线：现 SelfApprovalPolicy 默认 ALLOW，转派仍命中本人时也会降级允许，不能只给流程模型填写“禁止自审”。本项与 HR 专项 §4.4 共用受限业务参与人校验：服务端生成并冻结原申请用户与审批人，审批节点禁止转办/加签，办理动作及终审副作用均重验申请人排除条件；运维重新指派也不能绕过。无合格审批人时阻塞，违规终审不推进领用状态、不发料，记录审计并进入既有回调异常处理。该通用接线由集成人统一维护，仅限制本轮已注册的业务类型，不重写其他批次的自审政策。

业务类型 `OA_CONSUMABLE_REQUEST`，流程 key `oa_consumable_request`，提交调用现有 `OaApprovalOutboxService.queue`。内部 eventType 仍用既有 `OA_F_APPROVAL_SUBMITTED`，预占令牌仍使用其现有 `F:` 格式；它们是已存在的传输约定，不为 H 更名导致 F 回归。variables 只放明确字段和 Map/List 快照，包含 businessType/businessId/businessNo/oaRequestToken、申请人、部门、用途、耗材名称/型号/单位/申请量、已计算的是否送审结论、由服务端生成的 approverIds；批准数量不读取用户任意 workflow variables。成本、估价与规则金额依据保留在 OA 受限表/接口，不写进申请人可能读取的通用流程 variables、标题或消息，防止绕过成本字段权限；有成本权限且业务数据可见的审批人可通过 OA 详情读取估价。

`ConsumableRequestApprovalHandler.currentInstance/bindInstance` 按 F 模式实现，同租户行锁下核验 reservation，绑定成功同时写 `APPROVAL_BOUND` 快照。回调先做当前实例匹配，再读取同轮提交快照，只推进 APPROVING→APPROVED/REJECTED；在发起尚未完成绑定时抛可重试异常。重复、乱序、旧实例回调均不能改库存，自动通过的无实例单不接受后来伪造回调。

公共 `workflow:process:start`、流程定义编辑、流程管理权限完全不新增。主代理实查只有角色 1/2/3/4/5/8/9 有通用发起权限；角色 6/7/10/11 的本业务申请依靠受限内部调用，不向这些角色补通用权限。通用发起即使构造一个同名流程，也没有业务表中已登记的预占令牌、实例和提交快照，不能推动本业务状态；须专项验证。

### 4.6 预警、重算及审计

复用 `oa_risk_alert`，business_type=`CONSUMABLE`、business_id=consumable_id、risk_code=`CONSUMABLE_LOW_STOCK`。扫描每个耗材时先锁耗材，再重新读 quantity/阈值/开关；同租户同耗材同风险码只有一个 OPEN/HANDLING 风险。只在新建风险时通过 `MessageSender.send(MessageSendRequest)` 生成同事务消息事件，去重键 `consumable-low-stock:<tenantId>:<riskId>:<receiverId>`；已有活跃风险不每次重新通知。

库存恢复至大于阈值后关闭本项风险；再次跌破时新建新风险及一次通知。忽略的低库存风险在同一轮低库存期间不自动重新打开，直到库存恢复（由后续扫描识别恢复并记录关闭原因）后下一次跌破才重开。为避免未扫描的短暂恢复造成漏识别，记账时在同一耗材锁内检查已有本项 IGNORED 风险并在 quantity>阈值时标记 CLOSED，不创建新风险或即时通知。此行为只作用于本项风险码，不修改其它业务风险处理语义。

库存核心写入不依赖外部消息服务成功投递；扫描创建风险与消息 outbox 同事务，投递失败按 A 消息机制重试。预警接收人来自同租户 `sys.oa.consumable.stockManagerUserId`，缺失时任务报配置错误，不能向外租户或所有员工群发。只用站内信，不依赖 SMTP。

拟注册两个既有调度平台处理器：`oaConsumableStockWarning`（建议 300000ms 周期）和 `oaConsumableStockRecalculate`（建议每日 02:30）。复用 `TenantIterator`、`@JobHandler`、`@DistributedJob`，每个租户分批每次最多 100 个耗材、单耗材短事务；异常隔离并汇总失败，不新增 `@Scheduled`。两条任务种子默认 PAUSED，配置有效且用户确认后启用；暂停状态不等于已经完成线上验收。

重算按耗材 ledger_id 顺序重放全部有符号数量/金额并核验每个前缀结存、金额结存、均价、原日志引用、来源及冲正关系。CHECK 只返回差异；REBUILD 在耗材锁内把有效结果写回 quantity/stock_amount/avg_cost/last_purchase_price/last_calc_time 并审计，不改任何台账历史。最后采购价取最近未冲正 PURCHASE_RECEIPT 入库计价，无采购时 NULL。台账链自身不合法则停止重算并报错/告警，不能根据当前 quantity 伪造“期初补差”流水。

定时处理器同样进行完整重算验证，建议读取 `sys.oa.consumable.recalculateMode=CHECK/REBUILD`，初始 CHECK；选择 REBUILD 才修复物化值，属于 §8 运维边界确认，不静默启用自动修账。人工 REBUILD 的重复调用目标值相同就返回 changed=false，不重复改变版本或记重复纠正记录；变更审计用既有 `oa_trace_event`/审计能力。库存流转、取消、冲正、删除、停用、重算等方法按通用约束设置高风险审计；外部业务端点必须有实际 `@SaCheckPermission`，写接口配置 `@SysLog`，防重注解按 §3.1 选择 `@RepeatSubmit` 或明确 `@RepeatSubmit.Disabled`，审计不记录凭据。

## 5. 跨模块值与边界对齐

| 对象 | 对齐约定 | 禁止的误接 |
| --- | --- | --- |
| 租户 | 所有表同 tenant_id，HTTP/异步/任务均通过既有上下文与 TenantBroker；锁定 SQL 明确租户条件 | 默认租户冒充上下文、定时任务跳过租户、用跨租户同 ID 关联。 |
| 人员与部门 | applicant/beneficiary/operator/issue_by 为 sys_user.user_id；dept_id 为 sys_dept.dept_id；使用 OaIdentityReferenceMapper 校验 | 把 hr_employee.id 当成申请人用户 ID；前端姓名替代服务端身份。 |
| 规格与单位 | model 与采购 model；unit 与耗材当前单位、采购单位及领用快照完全一致 | “箱”和“包”隐含换算；直接改单位后解释历史数量。 |
| 单据与流水状态 | 申请六态与 PRD 对齐；采购沿用 APPROVED/PARTIAL_RECEIVED/RECEIVED；台账五类型 | 把资产 movement 的 TRANSFER/LOST 等作为耗材流水类型；把审批成功等同库存已发出。 |
| 通用日志 | ref_type='2' 表示耗材，ref_type='1' 表示固定资产，quantity_change=ledger.quantity | 往原日志加 balance_after、把资产报废影响到耗材库存。 |
| 价格 | DECIMAL(10,2)、人民币元；F 采购行 gross amount 为入库成本分摊源 | 税额/折扣算两次，使用 CRM 百分数或 F 工时 DECIMAL(18,2) 代替采购精度。 |
| 业务标识 | 工作流 OA_CONSUMABLE_REQUEST/oa_consumable_request；台账 CONSUMABLE_REQUEST；风险 CONSUMABLE | 因各链路用途不同擅自复用别的模块业务类型，或更改已有 F eventType。 |
| 分类 | sys_dict_data 中本租户、有效的 oa_consumable_category，category_id 指 dict_code；不引用 oa_asset_category | 给员工字典管理权限，建立没有设计依据的额外分类表。 |
| 数据范围 | 本人申请与部门申请分入口；仓管明确权限；库存总表在租户内共享 | 把 OA_CLERK 的全局 ds_type 改成全租户影响其它模块。 |
| 报表范围 | 进出存/总体成本按租户共享库存；涉及人员/部门领用时另叠加 `DataScopeUtils.listScope("dept_id","beneficiary_id")` | 有库存清单权限就能不受范围控制地查看全员领取明细。 |
| 规则 | 数值阈值含义由本业务 metric 标识；效果保持 BLOCK/ALERT/WARN/PASS；快照记录规则版本 | 新造 APPROVE effect、把未计价当 0、加多维规则表。 |
| 消息与任务 | INTERNAL 站内信、BIZ_REMINDER 类别；现有消息去重；现有调度平台逐租户执行 | 直接发邮件、增加裸定时任务或全租户一把无界长事务。 |
| 表单/文件 | 业务专用明细表格，任务展示 Map/List 只读快照；本项不新增附件功能 | 假设通用子表/受限表达式解析器已经完成；引入新表单引擎、预览库或打印依赖。 |

金额型条件、来源对象、人员关联与数据范围全部在后端验证，前端权限按钮不能替代接口保护。现有全局构建规则和启动期高风险审计校验不得为此项放宽。消息模板如经过现有模板链路，沿用已有受限配置，不开启 POJO 包装或任何任意方法访问。

## 6. 表数、菜单、角色及种子方案

### 6.1 精确计数与预留编号

| 脚本/对象 | OA-08 单项变化 | 实施职责 |
| --- | --- | --- |
| 04 表定义 | 新建 3、修改 1、删除 0；87→90 | 合并本稿已确认定义，不另增“关联表”。 |
| 01/02/03/05 表定义 | 本项 0 新表、0 改表 | 通用字典/配置/规则/工作流均仅新增既有表的种子记录。 |
| 全库 | OA-08 净增 3 | 主代理汇总本轮 H 总表数，不把其它 H 项混入本稿。 |
| 06 业务种子 | 菜单 19 条（预留 20 个号中 1819 暂空），两个任务/处理器、规则/版本、字典/配置/消息模板、流程定义及一致的业务示例 | 仅在获准实施后修改正式脚本；此轮未改。 |
| 07 演示数据 | 从既有生成器及 OA 场景生成源重新生成 | 不直接手改生成文件，不使用导数脚本做运行数据迁移。 |

菜单归属 OA 目录（现 parent_id=5）；原耗材菜单 509 和原按钮 548～552不移动、不改编号。新增路由组件名为拟定实现路径，不表示文件已存在。按钮统一 menu_type=F、path 空；visible/status 沿用项目 0/1 约定，权限必须按白名单逐项授予。

| menu_id | 名称/类型 | 路由或父菜单 | 权限码 |
| --- | --- | --- | --- |
| 1810 | 耗材台账 C | `/admin/consumable-ledger`，parent 5 | `oa:consumable-ledger:list` |
| 1811 | 台账成本 F | parent 1810 | `oa:consumable-ledger:cost` |
| 1812 | 台账冲正 F | parent 1810 | `oa:consumable-ledger:reverse` |
| 1813 | 库存核对重算 F | parent 1810 | `oa:consumable-ledger:recalculate` |
| 1814 | 盘盈盘亏调整 F | parent 509 | `oa:consumable:adjust` |
| 1815 | 耗材报废 F | parent 509 | `oa:consumable:scrap` |
| 1816 | 耗材退回 F | parent 1810 | `oa:consumable:return` |
| 1817 | 耗材报表 C | `/admin/consumable-reports`，parent 5 | `oa:consumable-report:list` |
| 1818 | 耗材成本报表 F | parent 1817 | `oa:consumable-report:cost` |
| 1819 | 未使用 | 保留 | 不生成菜单或权限 |
| 1820 | 耗材领用 C | `/admin/consumable-request`，parent 5 | `oa:consumable-request:list` |
| 1821 | 领用详情 F | parent 1820 | `oa:consumable-request:query` |
| 1822 | 新建领用 F | parent 1820 | `oa:consumable-request:add` |
| 1823 | 编辑领用 F | parent 1820 | `oa:consumable-request:edit` |
| 1824 | 提交领用 F | parent 1820 | `oa:consumable-request:submit` |
| 1825 | 取消领用 F | parent 1820 | `oa:consumable-request:cancel` |
| 1826 | 领用发料 F | parent 1820 | `oa:consumable-request:issue` |
| 1827 | 仓管队列 F | parent 1820 | `oa:consumable-request:dispatch` |
| 1828 | 可领耗材查询 F | parent 1820 | `oa:consumable-request:lookup` |
| 1829 | 部门领用查询 F | parent 1820 | `oa:consumable-request:dept-list` |

权限码均为 module:resource:action 三段，module=oa；不能把表名直接拼成多层冒号权限。任务可使用本子项已确认无占用的 job_id/handler_id 1810、1811，分别对应低库存扫描和重算；任务编号与 menu_id 位于不同表，不增加任何调度管理菜单权限。实际落库前由主代理再次检查目标号段，不自行挪到其它段位。

### 6.2 十一角色权限矩阵（全部为待确认授权草案）

“本人申请”精确包含 1820～1825、1828；只允许本人新建/修改/提交/取消。部门查询额外 1829，仍受当前角色已有数据范围限制；仓管包含 1826/1827，可看已进入发料阶段的申请，不可改其他人的草稿。矩阵只描述本项权限，不覆盖或清理已有角色权限。

| 角色 | 旧耗材权限 | 本人申请 | 部门查询 | 仓管 | 台账/成本 | 调整/报废/退回/冲正/重算 | 报表 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 admin | 保留 509/548～552 | 是 | 是，已有全量范围 | 是 | 1810/1811 | 1814/1815/1816/1812/1813 | 1817/1818 |
| 2 manager | 保留 509/548～552 | 是 | 是，已有部门范围 | 是 | 1810/1811 | 1814/1815/1816/1812；不加 1813 | 1817/1818，人员领用受部门范围约束 |
| 3 finance | 不新增旧库存管理 | 是 | 否 | 否 | 1810/1811，只读 | 无 | 1817/1818，人员领用受已有数据范围约束 |
| 4 hr | 不新增 | 是 | 否 | 否 | 无 | 无 | 无 |
| 5 employee | 不新增 | 是 | 否 | 否 | 无 | 无 | 无 |
| 6 legal | 不新增 | 是 | 否 | 否 | 无 | 无 | 无 |
| 7 oa_clerk | 不新增旧库存增删改 | 是 | 否 | 是 | 1810，仅数量/来源 | 仅 1816 退回，不加冲正/报废/重算 | 无 |
| 8 sales_manager | 不新增 | 是 | 是，已有部门范围 | 否 | 无 | 无 | 无 |
| 9 sales_rep | 不新增 | 是 | 否 | 否 | 无 | 无 | 无 |
| 10 crm_ops | 不新增 | 是 | 否 | 否 | 无 | 无 | 无 |
| 11 customer_success | 不新增 | 是 | 否 | 否 | 无 | 无 | 无 |

ADMIN 仍沿用现有全量菜单授权方式；其它角色按本表列出的精确 menu_id 写入，不使用 `BETWEEN` 整段授权或全角色 CROSS JOIN。不增删任一角色的 `workflow:process:start`、定义配置、实例管理等通用权限；原未具备通用发起的 6/7/10/11 必须能提交本业务单且仍不能直接调用通用发起 API。

### 6.3 基础种子与期初库存

| 种子类别 | 拟定内容及重跑保证 |
| --- | --- |
| 分类 | 既有字典表新增 `oa_consumable_category` 类型及 OFFICE（办公）、PRINT（打印）、IT（数码配件）三项；按 tenant_id/dict_type/dict_value 确认唯一，不使用固定资产分类。分类选择通过本业务 lookup 返回，员工不获字典管理权限。 |
| 审批配置 | approvalMode=ALWAYS、limitMetric=AMOUNT；规则 `oa.consumable.request.limit` 的示例阈值 0.00、effect=WARN、enabled=1，并保存既有规则版本。ALWAYS 下阈值不代表公司实际限额，切换 THRESHOLD 必须配置真实数值。 |
| 人员配置 | approverUserId 与 stockManagerUserId 来自用户确认的有效同租户人员；开发演示可显式指定已存在的有效账号，但不把演示用户 ID 作为所有租户默认值。未配置则相应提交/任务失败，不静默回退。 |
| 重算配置与任务 | recalculateMode=CHECK；两个任务及 handler 注册按 §4.6，默认 PAUSED。只有本项任务 ID，无额外任务管理角色授权。 |
| 流程 | 每个有效租户一份 process_key=oa_consumable_request、版本 1、PUBLISHED 的 START→指定责任人 APPROVAL→END 定义，已有 VARIABLE_USER/approverIds 接线；提交端拦截自审，流程禁止自审；不创建通用子表表单。定义 ID 可用 `batch-h-oa08-<tenantId>`（不超过 64）。 |
| 消息 | 模板码 `OA_CONSUMABLE_LOW_STOCK`，INTERNAL/BIZ_REMINDER；参数 name/model/unit/quantity/threshold/linkUrl；标题“耗材库存预警”，内容使用相同单位的实际值，链接仅跳转有权限页面。按 tenant_id/templateCode/channel 查重。 |

期初建议为“未上线重新构建一致种子”：保留原八种耗材的名称、型号和单位，库存列从 0 开始；在种子场景中显式给出期初数量和演示成本，以一次 MANUAL 来源、INBOUND 类型、`source_event_key=SEED:OA08:<consumableId>:OPENING` 生成对应台账/通用日志，再按完整采购收货和发料场景生成后续记录，最终派生库存缓存。期初为 0 则不写零数量流水；首次真实启用也必须通过有明确数量和价格依据的入库，不直接编辑缓存。

旧 06 的非零库存与零散 `oa_asset_log` 无法还原成本，不能把当前 quantity 直接当期初再叠加已存在采购 receipt，也不能据零散日志推算未知历史价格。实施时修改原耗材、相关采购/收货/日志示例的生成源，使每个库存来源恰好算一次；原固定资产 `ref_type='1'` 种子不改。两组原耗材种子（06:8199 与 06:9936）、相关收货种子及重复初始化清理段全部纳入检查。07 通过生成器重新生成，不在本任务运行旧清理语句。

成本数值只能是明确标注的演示数据或用户提供的真实开账依据；不能冒充既有财务余额。示例使用独立标识“OA08验收耗材A/B/C”，不会拿正式业务用户的现有库存做暗中修补。生成器内部维护符号到真实自增 ID 的映射，后续 receipt/request/item/ledger 引用这些 ID，不给未经核验的固定业务主键或伪造不存在的员工/采购表。

### 6.4 最小可复现业务场景种子

| 符号 | 明确的初始/业务事实 | 预期结果 |
| --- | --- | --- |
| OA08-A（个） | 手工期初 10×2.00；采购收货 10 个、行金额 40.00；批准申请 6 个，分两次发 3 个；退第一笔中的 1 个 | INBOUND/OUTBOUND/RETURN 可追溯；数量 15、库存成本 45.00、均价 3.00；申请已发 6/18.00、已退 1/3.00、状态 ISSUED。 |
| OA08-B（盒） | 从 0 开始，采购 3 盒、行金额 10.00，分三次各收 1 | 台账金额 3.33/3.34/3.33；quantity=3、stock_amount=10.00、avg_cost=3.33；最后一笔受限整笔冲正可独立验证。 |
| OA08-C（根） | 手工期初 8×1.00；盘亏 1；报废 1；安全阈值 6、目标库存 10 | ADJUST=-1、SCRAP=-1；结存 6/6.00，触发一次低库存风险及站内信，建议采购 4。 |
| 审批状态样例 | DRAFT/APPROVING/APPROVED/ISSUED/REJECTED/CANCELLED 各一份，使用同租户真实种子用户；APPROVING 样例通过实际审批发起取得实例 | 不伪造不存在的 instanceId；只做静态 06 初始化时，仅预置 DRAFT，其它状态由验收脚本经过真实操作产生。 |

这组数据属于建议验收场景，不能通过手写“已通过”状态代替工作流验收。初始 06 允许新领用表为空、台账只含明确期初/完整来源种子；完整六态、重试和并发由确认后的验收步骤实际产生。每次重复执行生成逻辑需校验既有 source_event_key/请求创建键内容一致，遇冲突失败，不通过 INSERT IGNORE 掩盖金额或数量不一致。

## 7. 可执行验收与前批回归

本节保留确认时的验收规约，具体完成情况见实施记录。实际在线入口为`scripts/verify-batch-h-oa.mjs`，沿用仓库PowerShell/API/MySQL验证方式，不引入测试框架；各阶段通过只证明该阶段，不能代表全部业务闭环。测试令牌和连接信息由既有安全环境载入，不写入文档。

### 7.1 原 PRD AC-15～AC-25 对照

| 原验收项 | 可执行操作 | 精确断言 |
| --- | --- | --- |
| AC-15 采购入库 | 对 OA08-B 的已批准采购连续调用三次 receipt，每次不同 operationKey、quantity=1 | 收货记录 3、台账 INBOUND 3、原耗材日志 3；金额 3.33/3.34/3.33；已收 3、状态 RECEIVED；同键重试不增行。 |
| AC-16 手工及移动均价 | OA08-A 先入 10×2.00，再入 10、采购行 amount=40.00 | 结存 20、成本 60.00、avg_cost=3.00；缺失 unitPrice 拒绝；显式 0 可记录零成本捐赠。 |
| AC-17 申请审批发料 | employee 创建并提交 6 个；真实审批人完成待办；仓管发 6 | 提交/审批时库存不变；批准量 6；发料后 ISSUED，库存减少 6，只有 1 笔 OUTBOUND；未审批发料拒绝。 |
| AC-18 部分发料 | 已批准 6 个、库存 4，先 allowPartial=false 发 6，再 true 发 6；补入 2 后再次发 2 | 首次失败零副作用；部分发出 4/缺口2、仍 APPROVED；补发后已发6、ISSUED；不超批准量。 |
| AC-19 结存推导 | 调用 CHECK，与只读聚合逐行比对；在授权的验收场景中仅使库存缓存错 1，再 CHECK/REBUILD/REBUILD | CHECK 报差异但不写；第一次 REBUILD 恢复台账值且审计；第二次 changed=false；故意破坏台账前缀时拒绝重建，绝不新造补差流水。 |
| AC-20 不可修改及冲正 | 对最新手工入库反向请求；重复；尝试改/删台账端点、冲正更早行或冲正行 | 原记录完全不变；仅一条反向行及新通用日志；库存数量与金额恢复；重复不增行；不允许的操作明确失败。 |
| AC-21 预警与通知 | OA08-C 结存 6、阈值6，执行扫描两次；补到7，再耗至6扫描 | 第一次仅 1 个 OPEN 风险、每接收人 1 条去重消息；重复扫描不增加；恢复后旧风险关闭，再次跌破新增1轮；阈值相等按现有 <= 触发。 |
| AC-22 一键补货 | 对 OA08-C 从建议页生成采购申请 | 带入当前耗材 ID、单位、建议量4、有效供应商；只建原采购申请/明细，不直接入库、不新建补货表。 |
| AC-23 五类型 | 分别执行手工/采购入库、已批发料、盘盈/盘亏、报废、关联退回 | 五种类型全部出现；非冲正行的方向与 §4.3 一致，台账/原日志数量一致；余额及成本均非负。 |
| AC-24 四报表 | 查询上述三个场景期间的进出存、人员/部门/耗材领用、预警、成本 | 期初+净增减=期末，领用扣正常退回但不二次扣冲正；A 最终 15/45.00，B 3/10.00，C 6/6.00；个/盒/根不相加；无成本权限不返回任何金额字段。 |
| AC-25 并发防超发 | 两张已批申请各领4，库存5，使用两个独立请求键并发发出，allowPartial=false | 恰好一张发4、另一张失败，最终库存1；仅一条发料事实，无负库存、无丢更新，原日志和台账各增1。 |

### 7.2 事务、安全与边界补测

| 分组 | 执行方式 | 必须满足的结果 |
| --- | --- | --- |
| 多行事务失败 | 一个请求包含两个耗材，其中第二行库存不足；以及对台账/原日志/主单更新分别注入失败 | 本次全部业务表均回滚，不出现先发成功的孤立第一行；错误不返回 R.ok。 |
| 旧入口不绕过 | 分别使用新 issue 和旧 reduce-stock/ISSUE，对未批准申请、他人明细、错误 requestId 测试 | 都由同一服务阻止；旧路径不得以库存权限直接绕过申请批准状态。 |
| 采购重复并发 | 同采购同 item 同时收足、重复同键、同键换量、带两条重复 itemId | 同键重放一份；不同键只允许累计不超申请；重复 itemId 和同键换参数拒绝；台账金额没有多收。 |
| 金额边界 | 手工单价含三位小数、数量为小数/0/负数、数量导致 INT 溢出、库存成本超过 99,999,999.99 | 全部明确拒绝，不截断/四舍五入用户输入、不发生 int 回绕、不写任何半成品。 |
| 采购税折扣 | 使用 F 询价生成的采购，确认 quantity×unit_price 与 amount 不同，再分批收货 | 期末入库成本等于采购真实 amount；不重复计算税/折扣；原询价、供应商准入与报价保密不变。 |
| 退回边界 | 原发3，先退1再退2；第4个退回、跨耗材原行、已冲正原行、重复退回键 | 前两次合计不超3且最后金额补尾差；其余失败或重放；申请可发量不因真实退回增大。 |
| 冲正联动 | 分别冲正最新采购收货、发料、RETURN；来源主单版本过期、已有付款关联 | 合法时采购已收/申请已发/已退和项目成本一并恢复；不合法时整笔拒绝；原 receipt/台账不删，派生标识正确。 |
| 单位冻结 | 发生台账或采购/领用引用后改单位；正常改名称/品牌/位置 | 改单位拒绝；其它允许字段可改且历史台账/单据快照不变；停用不丢历史。 |
| 权限矩阵 | 用11个真实角色账号逐一请求新 API 和金额详情，另以 employee 猜测其他申请/明细/ledger ID | 符合 §6.2；employee 无库存写、无成本、无他人数据；按钮隐藏与后台拒绝同时成立。 |
| 跨租户 | 使用两个真实租户，在请求体/路径/引用项/审批回调/消息接收人中交换 ID | 无跨租户读写与通知；未具备第二租户真实用户时记录为未验收，不伪称通过。 |
| 通用权限不扩大 | 对6/7/10/11通过业务 submit 发起；直接调用公共流程发起/定义管理；对其它角色比较授权集合 | 业务入口成功送审；公共流程权限仍拒绝；原1/2/3/4/5/8/9的通用权限不增删。 |
| 工作流异常 | 停止投递后的 outbox 重放、重复审批、旧轮实例、绑定前快速回调、错误 oaRequestToken；申请人读取自己的通用流程详情 | 每轮最多一个实例/一次状态推进；重试可恢复；没有错误库存增减；不能将假失败降级成自动通过；通用流程详情/消息不泄露被 OA 成本权限隐藏的金额。 |
| 规则与审批人 | ALWAYS；THRESHOLD 在阈值下/等于/上；未计价；规则中心失败；审批人失效/跨租户/为申请人 | 按 §4.5 处理；缺价不当0；未配置或非法不放行；不把审批人任由前端指定。 |
| 预警竞争与忽略 | 并发扫描同耗材；忽略后反复扫描；库存恢复再跌破；消息投递失败重试 | 每轮一条风险与一次去重消息；忽略不刷屏；恢复后可开启新轮；投递失败不回滚已发生库存。 |
| 删除及重算竞争 | 删除已有台账但库存0的耗材；编辑旧版本；记账与 CHECK/REBUILD 并发 | 历史不可删除；旧版本拒绝；按同耗材行锁串行处理，重算不能覆盖后来新增的台账或并发更新。 |
| 原子重放结果 | 成功响应丢失后5秒内立即重试；部分发料含0发料行，成功后库存变化，再以原键和原体重试 | 不在业务重放前被短时防重注解拦截；原零发料行仍为0，不因现有新库存补发；返回原流水和实际发量。 |

### 7.3 可直接转为脚本的调用与核验片段

下列示例要求先完成实现、确认验收数据范围并准备合法认证 `$headers`、耗材 `$materialId`，仅为规约示例，此轮不执行。

```powershell
$baseUrl = 'http://127.0.0.1:9000'
$operationKey = [guid]::NewGuid().ToString()
$body = @{ quantity = 10; unitPrice = '2.00'; remark = 'OA08验收手工入库'; operationKey = $operationKey } | ConvertTo-Json
$first = Invoke-RestMethod -Method Post -Uri "$baseUrl/oa/consumable/$materialId/add-stock" -Headers $headers -ContentType 'application/json' -Body $body
$replay = Invoke-RestMethod -Method Post -Uri "$baseUrl/oa/consumable/$materialId/add-stock" -Headers $headers -ContentType 'application/json' -Body $body
if ($first.data.ledgerIds[0] -ne $replay.data.ledgerIds[0]) { throw '幂等重试生成了不同流水' }
if (-not $replay.data.replayed) { throw '未返回幂等重放标记' }
```

只读不变量查询的返回行数必须为 0；把 tenant_id 限定为本次真实验收租户，不向所有租户注入数据：

```sql
SELECT inventory.consumable_id
FROM oa_consumable inventory
LEFT JOIN (
  SELECT tenant_id, consumable_id, SUM(quantity) AS quantity_sum, SUM(amount) AS amount_sum
  FROM oa_consumable_ledger
  WHERE tenant_id = 100000
  GROUP BY tenant_id, consumable_id
) totals ON totals.tenant_id = inventory.tenant_id AND totals.consumable_id = inventory.consumable_id
WHERE inventory.tenant_id = 100000
  AND (inventory.quantity <> COALESCE(totals.quantity_sum, 0)
    OR inventory.stock_amount <> COALESCE(totals.amount_sum, 0));

SELECT history.ledger_id
FROM (
  SELECT ledger_id, balance_after, balance_amount_after,
         SUM(quantity) OVER (PARTITION BY tenant_id, consumable_id ORDER BY ledger_id ROWS UNBOUNDED PRECEDING) AS expected_quantity,
         SUM(amount) OVER (PARTITION BY tenant_id, consumable_id ORDER BY ledger_id ROWS UNBOUNDED PRECEDING) AS expected_amount
  FROM oa_consumable_ledger
  WHERE tenant_id = 100000
) history
WHERE history.balance_after <> history.expected_quantity
   OR history.balance_amount_after <> history.expected_amount;

SELECT ledger.ledger_id
FROM oa_consumable_ledger ledger
LEFT JOIN oa_asset_log history ON history.tenant_id = ledger.tenant_id AND history.log_id = ledger.asset_log_id
WHERE ledger.tenant_id = 100000
  AND (history.log_id IS NULL OR history.ref_type <> '2'
    OR history.ref_id <> ledger.consumable_id OR history.quantity_change <> ledger.quantity);
```

### 7.4 前批与工程回归

| 范围 | 验证内容 |
| --- | --- |
| 原耗材体验 | 列表搜索、详情、主数据新增强制0、普通编辑不能改库存、低库存 <=、补货建议和原日志均保留；原 ISSUE 增加批准来源是需确认的明确行为变化，不能宣称完全无变化。 |
| F 资产/采购 | 固定资产借还、维修、调拨审批及 ref_type='1' 日志不变；普通采购/询价采购/分批收货/预算和付款、项目成本汇总不因新增台账重复入账；沿用既有 `scripts/verify-batch-f.ps1` 和 `scripts/verify-batch-f-db.ps1` 的适用项目，不执行其历史迁移或重建模式。 |
| A/B/G 公共能力 | 消息去重及租户投递、任务暂停/手工触发、工作流业务实例去重/回调重试、通用权限守卫、文件私有访问边界保持；本项不改模板引擎或 OSS 配置。 |
| D/E 里程碑 | 保留既有 D/E 验收状态及未验收边界；本项验收不重写其证据或宣称其它批次全部通过，公共审批/消息/规则接线变更需回归受影响场景。 |
| 构建与初始化 | 确认实施后运行后端构建含静态规则、前端 type-check/build、应用启动高风险审计检查；在用户许可的初始化目标验证 01～06、生成07，OA单项+3表、只改1个已有表、19条新增菜单精确权限及11角色回归。当前设计阶段全部不执行。 |

## 8. 需要用户确认的三组业务规则

数量采用整数、每种耗材保留现有单位、金额为 DECIMAL(10,2)，以上来自实际表和已交付 F 采购口径，不是待选择项；移动加权、独立台账、保留通用日志、五类交易和部分发料来自原 PRD，技术实现由本稿给出。

| 确认组 | 本稿建议 | 用户需要决定的业务事实 |
| --- | --- | --- |
| 审批及授权 | 初期每单审批；审批人由有效负责人配置且不得自审；之后可按金额或逐行数量设置阈值；按 §6.2 给 OA_CLERK 发料/退回而不给通用流程管理权限 | 每单审批还是阈值审批；阈值维度/数值（仅选择阈值时需要）及实际审批人；是否认可本稿角色分工。 |
| 管理端直领及取消 | 原出库入口保留，但 ISSUE 必须引用已批准申请；发料允许显式部分发出，不预占库存；本期仅允许取消尚未发料且非 APPROVING 的申请 | 是否接受管理员/经理原直接领用也受申请审批约束；是否需要审批中撤回或关闭部分发料剩余量，若需要须先补完整设计再实现。 |
| 更正、期初与自动修复 | 只冲正最新一笔、整笔且无后续不可逆业务；历史差错用有原因的当前调整；未上线重新构建一致种子，演示成本明确标识；重算任务先 CHECK，人工确认才 REBUILD | 是否接受该冲正边界和期初方案；定时任务是否保持只核对，或明确授权自动重建物化缓存。 |

整体确认范围包括三张 CREATE TABLE、一张 ALTER 差异、新增必要接线字段、接口/数据权限、19项菜单及原 PRD 差异说明。任一建议被否决时先调整本文件和主代理汇总，再等待确认；不通过凑表、扩大通用权限、伪造审批/库存数据或提前编码绕开确认。

## 9. 用户确认后的实施记录

确认后的三张耗材业务表、既有耗材库存成本字段、19项菜单及审批、采购、台账、报表和预警接线已实施，2026-09-15共13个线上阶段完成。原RFQ 20949051在原截止时间后形成并收齐采购单1749055，含税折扣采购及来源页面验证完成；最终26项只读核对确认8条恢复记录闭合、专属身份恢复原角色2、任务保持停用。缓存损坏、数据库写入故障和回调事务故障另有27组7491项随机独立库证据，运行库不通过SQL改审批或库存结果。

具体阶段、源码指纹、线上与独立库证据的区别见[H首轮实施与验收记录](H-首轮实施与验收记录.md)。覆盖映射无待完成项，同时保留7项由独立库验证的线上未执行边界；付款仅核对关联来源，未办理审批或支付。预警保留49个未配置仓管租户的全局失败汇总，审批人、仓管与任务状态已按原基线恢复，未为通过验收擅自核定配置。
