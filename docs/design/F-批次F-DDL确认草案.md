# 批次 F：OA 资产与项目建表确认草案

草案日期：2026-09-09。状态：按上一轮推荐口径编制，待用户逐表审定；尚未合入正式建表脚本、业务代码或运行库。

DDL = 定义数据库表、字段和索引的语句。本稿补齐 25 张新表，并列出既有表的结构差异与里程碑收敛步骤。下文的结构调整和删表语句用于审阅最终结构，不是可直接投放运行库的升级脚本。正式实施仍须先审定本稿；既有业务数据必须先备份、转换、核对，再切换代码及移除旧结构。

## 1. 本稿采用的推荐口径

### 1.1 金额、工时与数量

| 对象 | 现状或 PRD | 本稿拟定口径 |
| --- | --- | --- |
| 资产金额 | `oa_asset.price DECIMAL(10,2)`；F1 PRD 写 `DECIMAL(14,2)` | 保持现有 `DECIMAL(10,2)`；原值、残值、期初折旧、累计折旧、净值、维保及维修金额同规格。`price` 改名为 `purchase_amount`，不同时保留两套原值。 |
| 项目核算金额 | 现有预算、实际成本为 `DECIMAL(18,2)`；F3 PRD 写 `DECIMAL(14,2)` | 项目新增金额和工时成本/计费金额使用 `DECIMAL(18,2)`，保留现有金额容量；活动单价及其快照按 PRD 使用 `DECIMAL(12,2)`。 |
| 采购及询价金额 | 现有采购总额、单价、行金额为 `DECIMAL(10,2)` | 询价预期单价、中标额、供应商报价单价、行金额及税额统一 `DECIMAL(10,2)`。供应商注册资本按 PRD 单独使用 `DECIMAL(14,2)`。 |
| 工时 | F3 明细为 `DECIMAL(6,2)`，单据汇总为 `DECIMAL(8,2)`；现有工作任务累计工时为 `DECIMAL(10,2)` | 单位为小时，保留两位小数；明细 `6,2`、单据汇总 `8,2`、项目/任务累计及任务模板计划工时 `10,2`。允许通过关联原记录的负数明细冲正。 |
| 采购数量 | F5 PRD 使用小数；现有采购、收货、库存均为整数 | 询价及报价数量均为 `INT(11)`，业务校验为正整数，本批不扩大到小数库存。 |
| 比例 | F5 税率、折扣及 F2 权重为 `DECIMAL(6,4)`；现有 CRM 报价折扣以百分数保存 | 本批比例用 `0.0000` 至 `1.0000`；折扣 `1.0000` 表示原价，税率 `0.1300` 表示 13%。CRM 的 `100.00` 表示原价，两个模块不直接复用数值单位不同的传输对象或计算入口。 |

`DECIMAL(10,2)` = 共十位数字，其中两位小数。扩大到 `14,2` 只增加整数位容量，两者均精确到分。折旧计算使用十进制金额运算，每期按四舍五入落到分，末期补齐到残值；完整折旧历史（含期初累计）与残值之和应等于当前资产原值。资本化或延寿仅重算未过账期次，禁止覆盖已过账记录。不同币种不得直接合计，本批不引入汇率换算。

工时提交时将成本单价、计费单价分别写入明细，历史金额不通过当前单价表反查重算；该方案对应 F 技术设计 §3.5。单价配置的员工、职级范围至多指定一项，均未指定时为默认价；本稿使用 `0` 表示未指定，保证唯一索引能够约束默认价，避免可空列令唯一约束失效。有效期重叠由服务层加锁校验。

### 1.2 第 25 张表及衔接补字段，随本稿审定

主设计只定义了 24 张新表。“关联一”没有被明确指认；F2 PRD FR-3.2 与 §10 第 3 项另有明确建议：新增 `oa_supplier_qualification_reminder_log`。本稿将该提醒日志列为第 25 张，按现有 `oa_license_expiry_reminder_log` 推导字段和防重索引；这里保留其来源，不把它冒称为原汇总已经定义的关联表。

| 分组 | 本稿补充字段 | 依据与用途 |
| --- | --- | --- |
| 财务追溯 | `oa_asset.opening_accumulated_depreciation`；`oa_timesheet_detail.reversal_of_detail_id` | F 技术设计 §1.3 的折旧算法读取期初累计折旧；F3 PRD FR-3.5 要求负数工时冲正。分别保存独立期初值、关联被冲正的已审批明细，保留原单价并限制累计冲正量。 |
| 既有项目能力 | `oa_project_task.baseline_start`、`baseline_end` | 现有 `OaProjectServiceImpl.snapshotBaseline()` 与 `resolveScheduleVarianceDays()` 已依赖基线。仅迁入计划日期会丢失独立基线；旧里程碑的 `baseline_date` 映射到新任务 `baseline_end`，项目工作任务保留开始/结束基线。 |
| 业务关联 | `oa_contract.supplier_id`；`oa_purchase_rfq_item.consumable_id`；`biz_purchase_item.rfq_item_id` | F2 要求合同选择供应商时校验准入，但合同现无供应商主键；F5 需要询价物料生成现有采购明细，现有采购强制关联耗材；逐行关联用于区分同名物料，并保留中标报价中的折扣、税率和舍入结果。 |

以上原审定补充共 7 个业务字段，全部在对应语句中列出，未新建衔接表。关联仍由应用校验，不建立物理外键。询价物料可以先不绑定耗材；形成采购申请前必须逐条完成绑定，禁止按名称猜测匹配。未定义的资产或服务采购类型不冒充耗材入库。

2026-09-10 用户追加确认 `oa_project_task.opening_actual_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00`，补充字段合计为 8 个。该字段只保存本任务迁移前的实际工时，不包含子任务；新建及套用模板时为零，普通保存不可修改，含正数期初工时的任务不可删除。任务实际工时为本任务期初加本任务已审批明细，分组再自底向上加各直接子任务累计值；项目汇总仅把每个未删除任务的独立期初与项目已审批明细各计一次。期初不生成员工、单价或审批记录，不参与人工成本和计费金额计算。

当前 `PurchaseRequestServiceImpl.validateAndFillItem()` 按“单价 × 数量”重算金额。对询价来源的采购明细，实施时必须沿 `rfq_item_id` 获取该询价已定标的不可变报价行，并采用核验后的成交行金额；普通采购保持既有计算。禁止只带入原始单价而丢弃折扣、税额，也禁止为配平金额篡改采购数量。审批中的采购申请须先撤回，已完成收货或付款的采购申请禁止被定标结果覆盖。

### 1.3 表数和改表数修正

| 对象 | 当前 | 本稿完成后 |
| --- | --- | --- |
| `04.cloudflow-oa.sql` | 63 张表 | 63 + 25 - 1 = 87 张表 |
| 仓库 `01` 至 `05` 全量脚本 | 287 张表 | 287 + 25 - 1 = 311 张表 |
| 运行库 | 只读核实为 272 张表，资产金额列与脚本一致 | 本稿不改运行库，不将仓库验收表数冒充已部署表数 |

提示词的 313 张最终表数使用了批次 E 修正前的基线。新表分组为 F1 六张、F2 四张加提醒日志一张、F3 七张、F4 两张、F5 五张，总计 25 张。

既有表结构调整共 7 张：提示词列出的 `oa_asset`、`oa_supplier`、`oa_project`、`oa_project_dependency`、`oa_contract`，加上 F5 已明确要求增加 `rfq_id` 的 `biz_purchase_request`，以及本稿为逐行保留成交结果而补充 `rfq_item_id` 的 `biz_purchase_item`。最后一项是待审补充，未静默当作原清单范围。

## 2. 公共建表规范

- 新表采用 `BIGINT(20)` 自增主键、`ENGINE=InnoDB`、`utf8mb4`、`AUTO_INCREMENT=1`，每列及表均有 `COMMENT`。租户字段为 `BIGINT(20) NOT NULL DEFAULT 100000`，引用对象与查询条件必须做同租户校验。
- 配置表和可维护业务表增加 `deleted`；独立业务/配置主表及独立变更状态的记录带 `version`。可编辑子项使用父单据锁控制并发；折旧计划、邀请记录和提醒日志不软删除，其中可变状态记录带版本，提醒日志只追加。业务唯一键不包含 `deleted`，同键软删除记录应恢复或更新，防止历史引用出现歧义。
- 复杂文本用 `TEXT`，附件地址为 `VARCHAR(1000)`，人员姓名为 `VARCHAR(64)`，流程实例为 `VARCHAR(64)`。配置状态沿用 OA 供应商的 `ACTIVE/DISABLED`。期限日期用 `DATE`，项目任务时间用 `DATETIME` 保留既有秒级时间，工时可选时段用 `TIME`。全部索引列显式列出，不建立物理外键。

以下为完整建表语句。为避免误用，本稿不在每张新表前附带清表语句；正式空库初始化脚本可按仓库既有格式组织，运行库不得执行全量重建脚本。

## 3. F1：资产六张新表

### 3.1 资产分类

```sql
CREATE TABLE oa_asset_category (
  category_id                  BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '资产分类ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  category_code                VARCHAR(50)     NOT NULL COMMENT '分类编码',
  category_name                VARCHAR(100)    NOT NULL COMMENT '分类名称',
  parent_id                    BIGINT(20)      NOT NULL DEFAULT 0 COMMENT '父分类ID(0为根分类)',
  level_path                   VARCHAR(500)    NOT NULL DEFAULT '/' COMMENT '分类层级路径',
  default_useful_life_months    INT(11)         DEFAULT NULL COMMENT '默认使用寿命(月)',
  default_depreciation_method   VARCHAR(30)     DEFAULT 'STRAIGHT_LINE' COMMENT '默认折旧方法(STRAIGHT_LINE/DOUBLE_DECLINING/SUM_OF_YEARS)',
  default_salvage_rate          DECIMAL(6,4)    NOT NULL DEFAULT 0.0000 COMMENT '默认残值比例(0至1)',
  maintenance_required_flag    TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否需要维保(0否1是)',
  sort_no                      INT(11)         NOT NULL DEFAULT 0 COMMENT '排序号',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE启用/DISABLED停用)',
  remark                       VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (category_id),
  UNIQUE KEY uk_asset_category_code (tenant_id, category_code),
  KEY idx_asset_category_parent (tenant_id, parent_id, sort_no),
  KEY idx_asset_category_path (tenant_id, level_path),
  KEY idx_asset_category_status (tenant_id, status, deleted)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='资产分类主数据表';
```

### 3.2 折旧计划

```sql
CREATE TABLE oa_asset_depreciation_schedule (
  schedule_id                  BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '折旧计划ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  asset_id                     BIGINT(20)      NOT NULL COMMENT '资产ID',
  period_no                    INT(11)         NOT NULL COMMENT '折旧期次(从1开始)',
  period_date                  DATE            NOT NULL COMMENT '本期折旧日期',
  depreciation_amount          DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '本期折旧金额',
  accumulated_amount           DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '本期完成后累计折旧金额',
  net_value                    DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '本期完成后资产净值',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'PLANNED' COMMENT '状态(PLANNED待过账/POSTED已过账/CANCELLED已取消)',
  post_time                    DATETIME        DEFAULT NULL COMMENT '实际过账时间',
  post_by                      BIGINT(20)      DEFAULT NULL COMMENT '过账人ID(系统任务过账为空)',
  remark                       VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (schedule_id),
  UNIQUE KEY uk_asset_period (tenant_id, asset_id, period_no),
  KEY idx_asset_depreciation_due (tenant_id, status, period_date),
  KEY idx_asset_depreciation_post (tenant_id, asset_id, status, period_no)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='资产逐期折旧计划表';
```

唯一键负责阻止同一期次重复建单；过账时仍需锁定资产并原子地将 `PLANNED` 改为 `POSTED`，只有成功取得该期过账权的事务能够累计金额。不能仅凭唯一键或“先查状态再无条件更新”宣称任务重跑安全。

### 3.3 维保计划

```sql
CREATE TABLE oa_asset_maintenance_plan (
  plan_id                      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '维保计划ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  asset_id                     BIGINT(20)      NOT NULL COMMENT '资产ID',
  plan_name                    VARCHAR(200)    NOT NULL COMMENT '维保计划名称',
  maintenance_type             VARCHAR(20)     NOT NULL DEFAULT 'PREVENTIVE' COMMENT '维保类型(PREVENTIVE预防性/CALIBRATION校准/INSPECTION检查)',
  frequency                    VARCHAR(20)     NOT NULL DEFAULT 'MONTHLY' COMMENT '频率(MONTHLY/QUARTERLY/HALF_YEARLY/YEARLY/CUSTOM)',
  custom_interval_days         INT(11)         DEFAULT NULL COMMENT '自定义间隔自然日数',
  responsible_id               BIGINT(20)      NOT NULL COMMENT '负责人ID',
  responsible_name             VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  supplier_id                  BIGINT(20)      DEFAULT NULL COMMENT '维保供应商ID',
  next_due_date                DATE            NOT NULL COMMENT '下次维保日期',
  last_completed_date          DATE            DEFAULT NULL COMMENT '最近完成维保日期',
  reminder_days                INT(11)         NOT NULL DEFAULT 7 COMMENT '提前提醒自然日数',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE启用/DISABLED停用)',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (plan_id),
  KEY idx_asset_maintenance_plan_asset (tenant_id, asset_id, deleted),
  KEY idx_asset_maintenance_plan_due (tenant_id, status, deleted, next_due_date),
  KEY idx_asset_maintenance_plan_owner (tenant_id, responsible_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='资产维保计划表';
```

### 3.4 维保任务

```sql
CREATE TABLE oa_asset_maintenance_task (
  task_id                      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '维保任务ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  plan_id                      BIGINT(20)      NOT NULL COMMENT '维保计划ID',
  asset_id                     BIGINT(20)      NOT NULL COMMENT '资产ID',
  planned_date                 DATE            NOT NULL COMMENT '计划维保日期',
  actual_date                  DATE            DEFAULT NULL COMMENT '实际维保日期',
  executor_id                  BIGINT(20)      DEFAULT NULL COMMENT '执行人ID',
  executor_name                VARCHAR(64)     DEFAULT NULL COMMENT '执行人姓名',
  result                       VARCHAR(20)     DEFAULT NULL COMMENT '结果(NORMAL正常/ABNORMAL异常/NEED_REPAIR需维修)',
  cost                         DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '维保费用',
  description                  TEXT            COMMENT '维保说明',
  attachment_url               VARCHAR(1000)   DEFAULT NULL COMMENT '附件地址',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'PENDING' COMMENT '状态(PENDING待执行/COMPLETED已完成/SKIPPED已跳过)',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (task_id),
  UNIQUE KEY uk_asset_maintenance_period (tenant_id, plan_id, planned_date),
  KEY idx_asset_maintenance_task_due (tenant_id, status, deleted, planned_date),
  KEY idx_asset_maintenance_task_asset (tenant_id, asset_id, actual_date)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='资产维保执行任务表';
```

### 3.5 维修单

```sql
CREATE TABLE oa_asset_repair (
  repair_id                    BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '维修单ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  repair_no                    VARCHAR(50)     NOT NULL COMMENT '维修单号',
  asset_id                     BIGINT(20)      NOT NULL COMMENT '资产ID',
  asset_name                   VARCHAR(100)    DEFAULT NULL COMMENT '资产名称快照',
  failure_date                 DATE            NOT NULL COMMENT '故障日期',
  report_by                    BIGINT(20)      NOT NULL COMMENT '报修人ID',
  fault_description            TEXT            COMMENT '故障描述',
  repair_status                VARCHAR(20)     NOT NULL DEFAULT 'REPORTED' COMMENT '状态(REPORTED/DIAGNOSING/REPAIRING/COMPLETED/CANNOT_REPAIR)',
  actions_performed            TEXT            COMMENT '维修措施',
  completion_date              DATE            DEFAULT NULL COMMENT '维修完成日期',
  downtime_hours               DECIMAL(8,2)    NOT NULL DEFAULT 0.00 COMMENT '停机时长(小时)',
  repair_cost                  DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '维修费用',
  capitalize_flag              TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '维修费用是否计入原值(0否1是)',
  life_extension_months        INT(11)         NOT NULL DEFAULT 0 COMMENT '延长使用寿命(月)',
  supplier_id                  BIGINT(20)      DEFAULT NULL COMMENT '维修供应商ID',
  repairer_name                VARCHAR(64)     DEFAULT NULL COMMENT '维修人姓名',
  attachment_url               VARCHAR(1000)   DEFAULT NULL COMMENT '附件地址',
  instance_id                  VARCHAR(64)     DEFAULT NULL COMMENT '审批流程实例ID',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (repair_id),
  UNIQUE KEY uk_asset_repair_no (tenant_id, repair_no),
  KEY idx_asset_repair_asset (tenant_id, asset_id, repair_status, deleted),
  KEY idx_asset_repair_supplier (tenant_id, supplier_id),
  KEY idx_asset_repair_instance (tenant_id, instance_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='资产维修单表';
```

### 3.6 调拨单

```sql
CREATE TABLE oa_asset_movement (
  movement_id                  BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '资产调拨单ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  movement_no                  VARCHAR(50)     NOT NULL COMMENT '资产调拨单号',
  asset_id                     BIGINT(20)      NOT NULL COMMENT '资产ID',
  purpose                      VARCHAR(20)     NOT NULL COMMENT '用途(ISSUE领用/RETURN归还/TRANSFER调拨/SCRAP报废/DISPOSE处置/LOST丢失)',
  from_custodian_id             BIGINT(20)      DEFAULT NULL COMMENT '原保管人ID',
  from_custodian_name           VARCHAR(64)     DEFAULT NULL COMMENT '原保管人姓名',
  to_custodian_id               BIGINT(20)      DEFAULT NULL COMMENT '新保管人ID',
  to_custodian_name             VARCHAR(64)     DEFAULT NULL COMMENT '新保管人姓名',
  from_dept_id                  BIGINT(20)      DEFAULT NULL COMMENT '原归属部门ID',
  to_dept_id                    BIGINT(20)      DEFAULT NULL COMMENT '新归属部门ID',
  from_location                VARCHAR(100)    DEFAULT NULL COMMENT '原存放位置',
  to_location                  VARCHAR(100)    DEFAULT NULL COMMENT '新存放位置',
  movement_date                DATE            NOT NULL COMMENT '调拨发生日期',
  reason                       VARCHAR(500)    NOT NULL COMMENT '调拨原因',
  attachment_url               VARCHAR(1000)   DEFAULT NULL COMMENT '附件地址',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT草稿/APPROVING审批中/COMPLETED已完成/REJECTED已驳回)',
  instance_id                  VARCHAR(64)     DEFAULT NULL COMMENT '审批流程实例ID',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (movement_id),
  UNIQUE KEY uk_asset_movement_no (tenant_id, movement_no),
  KEY idx_asset_movement_asset (tenant_id, asset_id, movement_date),
  KEY idx_asset_movement_status (tenant_id, status, deleted),
  KEY idx_asset_movement_instance (tenant_id, instance_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='资产领用归还调拨及处置单表';
```

## 4. F2：供应商四张新表及提醒日志

### 4.1 供应商分类

```sql
CREATE TABLE oa_supplier_category (
  category_id                  BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '供应商分类ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  category_code                VARCHAR(50)     NOT NULL COMMENT '分类编码',
  category_name                VARCHAR(100)    NOT NULL COMMENT '分类名称',
  parent_id                    BIGINT(20)      NOT NULL DEFAULT 0 COMMENT '父分类ID(0为根分类)',
  level_path                   VARCHAR(500)    NOT NULL DEFAULT '/' COMMENT '分类层级路径',
  sort_no                      INT(11)         NOT NULL DEFAULT 0 COMMENT '排序号',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE启用/DISABLED停用)',
  remark                       VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (category_id),
  UNIQUE KEY uk_supplier_category_code (tenant_id, category_code),
  KEY idx_supplier_category_parent (tenant_id, parent_id, sort_no),
  KEY idx_supplier_category_path (tenant_id, level_path),
  KEY idx_supplier_category_status (tenant_id, status, deleted)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='供应商分类主数据表';
```

### 4.2 供应商资质

```sql
CREATE TABLE oa_supplier_qualification (
  qualification_id             BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '供应商资质ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  supplier_id                  BIGINT(20)      NOT NULL COMMENT '供应商ID',
  qualification_type           VARCHAR(30)     NOT NULL COMMENT '资质类型(BUSINESS_LICENSE/TAX_REGISTRATION/ISO/INDUSTRY_PERMIT/BANK_INFO/CREDIT_REPORT/OTHER)',
  cert_name                    VARCHAR(100)    NOT NULL COMMENT '证件名称',
  cert_no                      VARCHAR(100)    DEFAULT NULL COMMENT '证件编号',
  issue_org                    VARCHAR(200)    DEFAULT NULL COMMENT '发证机构',
  issue_date                   DATE            DEFAULT NULL COMMENT '发证日期',
  expire_date                  DATE            DEFAULT NULL COMMENT '到期日期(长期有效时为空)',
  long_term_flag               TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否长期有效(0否1是)',
  file_url                     VARCHAR(1000)   DEFAULT NULL COMMENT '证件扫描件地址',
  verify_status                VARCHAR(20)     NOT NULL DEFAULT 'PENDING' COMMENT '核验状态(PENDING待核验/VERIFIED已核验/REJECTED不通过/EXPIRED已过期)',
  verify_by                    BIGINT(20)      DEFAULT NULL COMMENT '核验人ID',
  verify_time                  DATETIME        DEFAULT NULL COMMENT '核验时间',
  reject_reason                VARCHAR(500)    DEFAULT NULL COMMENT '不通过原因',
  reminder_days                INT(11)         NOT NULL DEFAULT 30 COMMENT '提前提醒自然日数',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (qualification_id),
  KEY idx_supplier_qualification_type (tenant_id, supplier_id, qualification_type, deleted),
  KEY idx_supplier_qualification_due (tenant_id, deleted, long_term_flag, verify_status, expire_date),
  KEY idx_supplier_qualification_cert (tenant_id, cert_no)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='供应商资质证件表';
```

### 4.3 周期评分卡

```sql
CREATE TABLE oa_supplier_scorecard (
  scorecard_id                 BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '供应商评分卡ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  supplier_id                  BIGINT(20)      NOT NULL COMMENT '供应商ID',
  period_type                  VARCHAR(20)     NOT NULL DEFAULT 'MONTHLY' COMMENT '评分周期(MONTHLY月/QUARTERLY季/YEARLY年)',
  period_start                 DATE            NOT NULL COMMENT '评分周期开始日期',
  period_end                   DATE            NOT NULL COMMENT '评分周期结束日期',
  total_score                  DECIMAL(5,2)    DEFAULT NULL COMMENT '加权总分(0至100)',
  standing                     VARCHAR(20)     DEFAULT NULL COMMENT '评级(EXCELLENT优秀/QUALIFIED合格/WATCH观察/ELIMINATED淘汰)',
  indicator_color              VARCHAR(10)     DEFAULT NULL COMMENT '评级颜色(RED/YELLOW/GREEN)',
  warn_flag                    TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否达到警告条件(0否1是)',
  prevent_flag                 TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否达到阻止条件(0否1是)',
  calc_time                    DATETIME        DEFAULT NULL COMMENT '评分计算时间',
  calc_by                      BIGINT(20)      DEFAULT NULL COMMENT '评分计算人ID(系统任务为空)',
  remark                       VARCHAR(500)    DEFAULT NULL COMMENT '评分说明',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT草稿/CONFIRMED已确认)',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (scorecard_id),
  UNIQUE KEY uk_supplier_scorecard_period (tenant_id, supplier_id, period_type, period_start, period_end),
  KEY idx_supplier_scorecard_status (tenant_id, status, deleted, period_end),
  KEY idx_supplier_scorecard_supplier (tenant_id, supplier_id, calc_time)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='供应商周期评分卡表';
```

### 4.4 评分维度明细

```sql
CREATE TABLE oa_supplier_score_criteria (
  criteria_id                  BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '供应商评分维度ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  scorecard_id                 BIGINT(20)      NOT NULL COMMENT '评分卡ID',
  criteria_code                VARCHAR(50)     NOT NULL COMMENT '评分维度编码',
  criteria_name                VARCHAR(100)    NOT NULL COMMENT '评分维度名称',
  weight                       DECIMAL(6,4)    NOT NULL DEFAULT 0.0000 COMMENT '维度权重(0至1)',
  score                        DECIMAL(5,2)    DEFAULT NULL COMMENT '维度得分(未评分为空)',
  max_score                    DECIMAL(5,2)    NOT NULL DEFAULT 100.00 COMMENT '维度最高分',
  data_source                  VARCHAR(20)     NOT NULL DEFAULT 'MANUAL' COMMENT '数据来源(AUTO自动/MANUAL人工)',
  auto_value                   DECIMAL(9,4)    DEFAULT NULL COMMENT '自动计算值(交付及时率为0至100的百分数)',
  remark                       TEXT            COMMENT '评分说明及自动计算的单据范围依据',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (criteria_id),
  UNIQUE KEY uk_supplier_score_criteria (tenant_id, scorecard_id, criteria_code),
  KEY idx_supplier_score_criteria_card (tenant_id, scorecard_id, deleted)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='供应商评分维度明细表';
```

交付及时率 `auto_value` 按主设计 §2.1 保存百分数值，得分也是 0 至 100；权重使用 0 至 1 的比例。没有收货数据时保存 `NULL`，不能伪造零分或满分；计算依据记录供应商、周期、收货单范围和纳入数量。

### 4.5 资质到期提醒日志，第 25 张候选表

```sql
CREATE TABLE oa_supplier_qualification_reminder_log (
  id                           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '资质提醒日志ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  qualification_id             BIGINT(20)      NOT NULL COMMENT '供应商资质ID',
  supplier_id                  BIGINT(20)      NOT NULL COMMENT '供应商ID',
  cert_name                    VARCHAR(100)    DEFAULT NULL COMMENT '证件名称快照',
  expire_date                  DATE            NOT NULL COMMENT '到期日期快照',
  days_before                  INT(11)         NOT NULL DEFAULT 0 COMMENT '提前提醒自然日数',
  recipient_id                 BIGINT(20)      NOT NULL COMMENT '接收人ID',
  recipient_name               VARCHAR(64)     DEFAULT NULL COMMENT '接收人姓名',
  reminder_type                VARCHAR(20)     NOT NULL COMMENT '提醒类型(AUTO自动/MANUAL手动)',
  operator_id                  BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  operator_name                VARCHAR(64)     DEFAULT NULL COMMENT '操作人姓名',
  reminder_content             VARCHAR(500)    DEFAULT NULL COMMENT '提醒内容',
  reminder_time                DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '提醒时间',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_supplier_qualification_reminder (tenant_id, qualification_id, expire_date, days_before, recipient_id),
  KEY idx_supplier_qualification_remind (tenant_id, supplier_id, reminder_time),
  KEY idx_supplier_qualification_log (tenant_id, qualification_id, reminder_time)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='供应商资质到期提醒日志表';
```

该表只追加、无 `deleted` 和 `version`，字段来自现有证照提醒日志，增加供应商定位字段。发送通过批次 A 消息中心，使用同一业务键防重；只有消息中心可靠接收后才登记提醒日志，失败必须可重试。

## 5. F3：活动单价、工时与项目任务七张新表

### 5.1 活动类型

```sql
CREATE TABLE oa_activity_type (
  type_id                      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '活动类型ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  type_code                    VARCHAR(50)     NOT NULL COMMENT '活动类型编码',
  type_name                    VARCHAR(100)    NOT NULL COMMENT '活动类型名称',
  billable_default_flag        TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '默认是否可计费(0否1是)',
  sort_no                      INT(11)         NOT NULL DEFAULT 0 COMMENT '排序号',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE启用/DISABLED停用)',
  remark                       VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (type_id),
  UNIQUE KEY uk_activity_type_code (tenant_id, type_code),
  KEY idx_activity_type_status (tenant_id, status, deleted, sort_no)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='项目工时活动类型表';
```

### 5.2 活动成本及计费单价

```sql
CREATE TABLE oa_activity_cost (
  cost_id                      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '活动单价ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  activity_type_id             BIGINT(20)      NOT NULL COMMENT '活动类型ID',
  employee_id                  BIGINT(20)      NOT NULL DEFAULT 0 COMMENT '员工ID(0未指定)',
  job_level_id                 BIGINT(20)      NOT NULL DEFAULT 0 COMMENT '职级ID(0未指定)',
  costing_rate                 DECIMAL(12,2)   NOT NULL COMMENT '每小时内部成本单价',
  billing_rate                 DECIMAL(12,2)   NOT NULL COMMENT '每小时对客计费单价',
  currency                     VARCHAR(10)     NOT NULL DEFAULT 'CNY' COMMENT '单价币种',
  effective_start              DATE            NOT NULL COMMENT '生效开始日期',
  effective_end                DATE            DEFAULT NULL COMMENT '生效结束日期(空为长期)',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE启用/DISABLED停用)',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (cost_id),
  UNIQUE KEY uk_activity_cost_scope (tenant_id, activity_type_id, employee_id, job_level_id, effective_start),
  KEY idx_activity_cost_employee (tenant_id, employee_id, activity_type_id, effective_start, effective_end),
  KEY idx_activity_cost_job_level (tenant_id, job_level_id, activity_type_id, effective_start, effective_end)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='项目活动成本及计费单价表';
```

### 5.3 工时单

```sql
CREATE TABLE oa_timesheet (
  timesheet_id                 BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '工时单ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  timesheet_no                 VARCHAR(50)     NOT NULL COMMENT '工时单号',
  employee_id                  BIGINT(20)      NOT NULL COMMENT '填报员工ID',
  employee_name                VARCHAR(64)     DEFAULT NULL COMMENT '填报员工姓名',
  dept_id                      BIGINT(20)      DEFAULT NULL COMMENT '员工部门ID',
  start_date                   DATE            NOT NULL COMMENT '填报周期开始日期',
  end_date                     DATE            NOT NULL COMMENT '填报周期结束日期',
  total_hours                  DECIMAL(8,2)    NOT NULL DEFAULT 0.00 COMMENT '总工时(小时,冲正可为负数)',
  billable_hours               DECIMAL(8,2)    NOT NULL DEFAULT 0.00 COMMENT '可计费工时(小时,冲正可为负数)',
  costing_amount               DECIMAL(18,2)   NOT NULL DEFAULT 0.00 COMMENT '内部成本金额',
  billing_amount               DECIMAL(18,2)   NOT NULL DEFAULT 0.00 COMMENT '对客计费金额',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT/SUBMITTED/APPROVING/APPROVED/REJECTED)',
  instance_id                  VARCHAR(64)     DEFAULT NULL COMMENT '审批流程实例ID',
  submit_time                  DATETIME        DEFAULT NULL COMMENT '提交时间',
  approve_time                 DATETIME        DEFAULT NULL COMMENT '审批通过时间',
  reject_reason                VARCHAR(500)    DEFAULT NULL COMMENT '驳回原因',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (timesheet_id),
  UNIQUE KEY uk_timesheet_no (tenant_id, timesheet_no),
  KEY idx_timesheet_employee_period (tenant_id, employee_id, start_date, end_date),
  KEY idx_timesheet_status (tenant_id, status, deleted, submit_time),
  KEY idx_timesheet_instance (tenant_id, instance_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='项目工时填报单表';
```

### 5.4 工时明细及单价快照

```sql
CREATE TABLE oa_timesheet_detail (
  detail_id                    BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '工时明细ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  timesheet_id                 BIGINT(20)      NOT NULL COMMENT '工时单ID',
  project_id                   BIGINT(20)      NOT NULL COMMENT '项目ID',
  project_name                 VARCHAR(200)    DEFAULT NULL COMMENT '项目名称快照',
  task_id                      BIGINT(20)      NOT NULL COMMENT '项目任务ID(oa_project_task.task_id)',
  activity_type_id             BIGINT(20)      NOT NULL COMMENT '活动类型ID',
  work_date                    DATE            NOT NULL COMMENT '工作日期',
  from_time                    TIME            DEFAULT NULL COMMENT '开始时刻(可选)',
  to_time                      TIME            DEFAULT NULL COMMENT '结束时刻(可选)',
  hours                        DECIMAL(6,2)    NOT NULL COMMENT '投入工时(小时,负数表示冲正)',
  billable_flag                TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否可计费(0否1是)',
  costing_rate                 DECIMAL(12,2)   DEFAULT NULL COMMENT '提交时锁定的每小时成本单价',
  costing_amount               DECIMAL(18,2)   DEFAULT NULL COMMENT '成本金额快照(冲正可为负数)',
  billing_rate                 DECIMAL(12,2)   DEFAULT NULL COMMENT '提交时锁定的每小时计费单价',
  billing_amount               DECIMAL(18,2)   DEFAULT NULL COMMENT '计费金额快照(冲正可为负数)',
  reversal_of_detail_id        BIGINT(20)      DEFAULT NULL COMMENT '被冲正的原已审批工时明细ID',
  description                  TEXT            COMMENT '工作内容或冲正说明',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (detail_id),
  KEY idx_timesheet_detail_sheet (tenant_id, timesheet_id, deleted),
  KEY idx_timesheet_detail_project (tenant_id, project_id, work_date),
  KEY idx_timesheet_detail_task (tenant_id, task_id, work_date),
  KEY idx_timesheet_detail_activity (tenant_id, activity_type_id, work_date),
  KEY idx_timesheet_detail_reversal (tenant_id, reversal_of_detail_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='项目工时明细及单价快照表';
```

明细单价及金额允许在草稿阶段为空；提交前必须匹配到有效单价并锁定两套快照，不能把缺少单价当作零成本。冲正必须引用同租户、同员工的原已审批正数明细并沿用原单价；并发提交时锁定原明细，已审批及在途冲正合计不得超过原工时。项目成本和实际工时只汇总已审批单据，重复审批回调不得重复累计。

### 5.5 项目任务树

```sql
CREATE TABLE oa_project_task (
  task_id                      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '项目任务ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  project_id                   BIGINT(20)      NOT NULL COMMENT '项目ID',
  parent_task_id               BIGINT(20)      DEFAULT NULL COMMENT '父任务ID(根任务为空)',
  level_path                   VARCHAR(500)    NOT NULL DEFAULT '/' COMMENT '任务层级路径',
  task_no                      VARCHAR(50)     DEFAULT NULL COMMENT '任务编号或原里程碑编码',
  subject                      VARCHAR(255)    NOT NULL COMMENT '任务名称',
  task_type_id                 BIGINT(20)      DEFAULT NULL COMMENT '任务类型字典ID',
  is_group_flag                TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否分组任务(0否1是)',
  is_milestone_flag            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否里程碑任务(0否1是)',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'NOT_STARTED' COMMENT '状态(NOT_STARTED/IN_PROGRESS/COMPLETED/CANCELLED/BLOCKED)',
  priority                     INT(4)          NOT NULL DEFAULT 1 COMMENT '优先级(0低1中2高)',
  assignee_id                  BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  assignee_name                VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  task_weight                  DECIMAL(6,2)    NOT NULL DEFAULT 1.00 COMMENT '任务权重(普通默认1.00,里程碑由业务设为3.00)',
  progress                     DECIMAL(5,2)    NOT NULL DEFAULT 0.00 COMMENT '任务进度(0至100)',
  planned_start                DATETIME        DEFAULT NULL COMMENT '计划开始时间',
  planned_end                  DATETIME        DEFAULT NULL COMMENT '计划结束时间',
  baseline_start               DATETIME        DEFAULT NULL COMMENT '基线开始时间',
  baseline_end                 DATETIME        DEFAULT NULL COMMENT '基线结束时间(承接原里程碑基线日期)',
  planned_hours                DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '计划投入工时(小时)',
  actual_start                 DATETIME        DEFAULT NULL COMMENT '实际开始时间',
  actual_end                   DATETIME        DEFAULT NULL COMMENT '实际结束时间',
  opening_actual_hours         DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '本任务历史期初工时(小时,仅迁移写入)',
  actual_hours                 DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '期初与已审批累计工时(小时,分组含子任务)',
  sort_no                      INT(11)         NOT NULL DEFAULT 0 COMMENT '同级排序号',
  description                  TEXT            COMMENT '任务说明',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (task_id),
  KEY idx_project_task_project (tenant_id, project_id, deleted, status),
  KEY idx_project_task_parent (tenant_id, project_id, parent_task_id, sort_no),
  KEY idx_project_task_path (tenant_id, project_id, level_path),
  KEY idx_project_task_milestone (tenant_id, project_id, is_milestone_flag, deleted),
  KEY idx_project_task_assignee (tenant_id, assignee_id, status),
  KEY idx_project_task_no (tenant_id, project_id, task_no)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='项目任务树及里程碑表';
```

里程碑是本表中 `is_milestone_flag=1` 的任务。新增或转换里程碑时设置权重 `3.00`；数据库普通默认值 `1.00` 不代替这一业务动作。层级上限为五层；父子关系、分组节点的进度汇总、同项目关系及循环依赖均由服务端校验。

进度严格采用 F 技术设计 §3.6：`TASK_COMPLETION` 为“完成任务数 ÷ 任务总数 × 100”，`TASK_PROGRESS` 为“Σ(任务进度 × 任务权重) ÷ Σ任务权重”。里程碑已包含在任务集合中，不能再独立加入分母。无任务时回退原进度，空值回退零；完成项目仍返回 100。扩展现有 `resolveProjectProgress()`，保留两位小数四舍五入，不另建一套进度服务。

验收例：两个普通任务和一个里程碑，仅一个普通任务完成，计数模式应为 `33.33%`；按权重 `1/1/3` 的加权模式应为 `20.00%`。

### 5.6 项目模板

```sql
CREATE TABLE oa_project_template (
  template_id                  BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '项目模板ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  template_code                VARCHAR(50)     NOT NULL COMMENT '项目模板编码',
  template_name                VARCHAR(200)    NOT NULL COMMENT '项目模板名称',
  project_type                 VARCHAR(30)     DEFAULT 'DELIVERY' COMMENT '适用项目类型',
  description                  TEXT            COMMENT '模板说明',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE启用/DISABLED停用)',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (template_id),
  UNIQUE KEY uk_project_template_code (tenant_id, template_code),
  KEY idx_project_template_type (tenant_id, project_type, status, deleted)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='项目任务模板主表';
```

### 5.7 项目模板任务

```sql
CREATE TABLE oa_project_template_task (
  template_task_id             BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '模板任务ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  template_id                  BIGINT(20)      NOT NULL COMMENT '项目模板ID',
  parent_template_task_id      BIGINT(20)      DEFAULT NULL COMMENT '父模板任务ID(根任务为空)',
  level_path                   VARCHAR(500)    NOT NULL DEFAULT '/' COMMENT '模板任务层级路径',
  task_no                      VARCHAR(50)     DEFAULT NULL COMMENT '任务编号',
  subject                      VARCHAR(255)    NOT NULL COMMENT '任务名称',
  task_type_id                 BIGINT(20)      DEFAULT NULL COMMENT '任务类型字典ID',
  is_milestone_flag            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否里程碑任务(0否1是)',
  task_weight                  DECIMAL(6,2)    NOT NULL DEFAULT 1.00 COMMENT '任务权重',
  planned_hours                DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '计划工时(小时)',
  start_offset_days            INT(11)         NOT NULL DEFAULT 0 COMMENT '相对项目开始日偏移自然日数',
  duration_days                INT(11)         NOT NULL DEFAULT 1 COMMENT '持续自然日数(里程碑允许0)',
  assignee_role                VARCHAR(64)     DEFAULT NULL COMMENT '负责人项目角色编码',
  sort_no                      INT(11)         NOT NULL DEFAULT 0 COMMENT '同级排序号',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (template_task_id),
  KEY idx_project_template_task_parent (tenant_id, template_id, parent_template_task_id, sort_no),
  KEY idx_project_template_task_path (tenant_id, template_id, level_path),
  KEY idx_project_template_task_active (tenant_id, template_id, deleted)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='项目模板任务树表';
```

## 6. F4：合同履约两张新表

### 6.1 合同履约条款

```sql
CREATE TABLE oa_contract_fulfilment_term (
  term_id                      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '合同履约条款ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  contract_id                  BIGINT(20)      NOT NULL COMMENT '合同ID',
  term_no                      INT(11)         NOT NULL COMMENT '条款序号',
  term_category                VARCHAR(30)     NOT NULL DEFAULT 'OTHER' COMMENT '条款类别(DELIVERY/PAYMENT/SERVICE/QUALITY/CONFIDENTIALITY/IP/OTHER)',
  term_content                 TEXT            NOT NULL COMMENT '条款内容',
  requirement                  TEXT            COMMENT '履约要求',
  responsible_party            VARCHAR(20)     NOT NULL COMMENT '责任方(OUR我方/COUNTERPARTY对方/BOTH双方)',
  responsible_id               BIGINT(20)      DEFAULT NULL COMMENT '我方责任人ID',
  responsible_name             VARCHAR(64)     DEFAULT NULL COMMENT '我方责任人姓名',
  deadline_date                DATE            DEFAULT NULL COMMENT '履约期限(自然日)',
  fulfilled_flag               TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否已履约(0否1是)',
  fulfilled_date               DATE            DEFAULT NULL COMMENT '实际履约日期',
  fulfilled_by                 BIGINT(20)      DEFAULT NULL COMMENT '履约确认人ID',
  fulfilled_by_name            VARCHAR(64)     DEFAULT NULL COMMENT '履约确认人姓名',
  evidence_file_url            VARCHAR(1000)   DEFAULT NULL COMMENT '履约证据附件地址',
  evidence_remark              VARCHAR(500)    DEFAULT NULL COMMENT '履约证据说明',
  overdue_flag                 TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否超期未履约(0否1是)',
  waived_flag                  TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否豁免(0否1是)',
  waived_reason                VARCHAR(500)    DEFAULT NULL COMMENT '豁免原因',
  sort_no                      INT(11)         NOT NULL DEFAULT 0 COMMENT '排序号',
  remark                       VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (term_id),
  UNIQUE KEY uk_contract_fulfilment_term_no (tenant_id, contract_id, term_no),
  KEY idx_contract_fulfilment_contract (tenant_id, contract_id, deleted, sort_no),
  KEY idx_contract_fulfilment_due (tenant_id, deleted, fulfilled_flag, waived_flag, deadline_date),
  KEY idx_contract_fulfilment_owner (tenant_id, responsible_id, deadline_date)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='合同逐条履约及豁免记录表';
```

### 6.2 合同模板条款

```sql
CREATE TABLE oa_contract_template_term (
  template_term_id             BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '合同模板条款ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  template_id                  BIGINT(20)      NOT NULL COMMENT '合同模板ID(oa_contract_template.id)',
  term_no                      INT(11)         NOT NULL COMMENT '条款序号',
  term_category                VARCHAR(30)     NOT NULL DEFAULT 'OTHER' COMMENT '条款类别(DELIVERY/PAYMENT/SERVICE/QUALITY/CONFIDENTIALITY/IP/OTHER)',
  term_content                 TEXT            NOT NULL COMMENT '条款内容',
  requirement                  TEXT            COMMENT '履约要求',
  responsible_party            VARCHAR(20)     NOT NULL COMMENT '责任方(OUR我方/COUNTERPARTY对方/BOTH双方)',
  deadline_offset_days         INT(11)         DEFAULT NULL COMMENT '相对合同开始日偏移自然日数(空为无单独期限)',
  sort_no                      INT(11)         NOT NULL DEFAULT 0 COMMENT '排序号',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (template_term_id),
  UNIQUE KEY uk_contract_template_term_no (tenant_id, template_id, term_no),
  KEY idx_contract_template_term_sort (tenant_id, template_id, deleted, sort_no)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='合同模板履约条款表';
```

条款期限使用自然日；豁免计入完成，豁免必须填写原因并记录审计。合同履约五态由条款实时推导，扫描任务只补偿遗漏。签署人、签署时间和 IP 由服务端取得；`our_sign_ip` 使用与 HR 签署表相同的 `VARCHAR(45)`。可信代理配置和转发头透传仍待运维确认，内网/网关地址必须告警，不宣称其具有真实客户端取证效力。

## 7. F5：询价比价五张新表

### 7.1 询价单

```sql
CREATE TABLE oa_purchase_rfq (
  rfq_id                       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '询价单ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  rfq_no                       VARCHAR(50)     NOT NULL COMMENT '询价单号',
  title                        VARCHAR(200)    NOT NULL COMMENT '询价标题',
  purchase_request_id          BIGINT(20)      DEFAULT NULL COMMENT '关联采购申请ID',
  dept_id                      BIGINT(20)      DEFAULT NULL COMMENT '需求部门ID',
  dept_name                    VARCHAR(64)     DEFAULT NULL COMMENT '需求部门名称',
  project_id                   BIGINT(20)      DEFAULT NULL COMMENT '关联项目ID',
  project_name                 VARCHAR(200)    DEFAULT NULL COMMENT '项目名称快照',
  owner_id                     BIGINT(20)      NOT NULL COMMENT '采购负责人ID',
  owner_name                   VARCHAR(64)     DEFAULT NULL COMMENT '采购负责人姓名',
  quote_deadline               DATE            NOT NULL COMMENT '报价截止日期',
  expected_delivery_date       DATE            DEFAULT NULL COMMENT '期望交付日期',
  delivery_address             VARCHAR(500)    DEFAULT NULL COMMENT '交付地址',
  payment_terms                VARCHAR(50)     DEFAULT NULL COMMENT '付款条件',
  terms_content                TEXT            COMMENT '询价条款说明',
  invited_count                INT(11)         NOT NULL DEFAULT 0 COMMENT '已邀请供应商数',
  responded_count              INT(11)         NOT NULL DEFAULT 0 COMMENT '已报价供应商数',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT/SENT/QUOTING/COMPARING/AWARDED/CANCELLED/FAILED)',
  awarded_supplier_id          BIGINT(20)      DEFAULT NULL COMMENT '中标供应商ID',
  awarded_supplier_name        VARCHAR(100)    DEFAULT NULL COMMENT '中标供应商名称快照',
  awarded_quotation_id         BIGINT(20)      DEFAULT NULL COMMENT '中标报价ID',
  awarded_amount               DECIMAL(10,2)   DEFAULT NULL COMMENT '含税中标总金额',
  award_reason                 VARCHAR(2000)   DEFAULT NULL COMMENT '定标理由',
  award_by                     BIGINT(20)      DEFAULT NULL COMMENT '定标人ID',
  award_time                   DATETIME        DEFAULT NULL COMMENT '定标时间',
  instance_id                  VARCHAR(64)     DEFAULT NULL COMMENT '定标审批流程实例ID',
  attachment_url               VARCHAR(1000)   DEFAULT NULL COMMENT '询价附件地址',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (rfq_id),
  UNIQUE KEY uk_purchase_rfq_no (tenant_id, rfq_no),
  KEY idx_purchase_rfq_deadline (tenant_id, status, deleted, quote_deadline),
  KEY idx_purchase_rfq_owner (tenant_id, owner_id, status),
  KEY idx_purchase_rfq_purchase (tenant_id, purchase_request_id),
  KEY idx_purchase_rfq_project (tenant_id, project_id),
  KEY idx_purchase_rfq_instance (tenant_id, instance_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='采购询价单表';
```

### 7.2 询价物料

```sql
CREATE TABLE oa_purchase_rfq_item (
  item_id                      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '询价物料ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  rfq_id                       BIGINT(20)      NOT NULL COMMENT '询价单ID',
  consumable_id                BIGINT(20)      DEFAULT NULL COMMENT '对应采购耗材ID(生成采购前须绑定)',
  sort_no                      INT(11)         NOT NULL DEFAULT 0 COMMENT '排序号',
  item_name                    VARCHAR(100)    NOT NULL COMMENT '物料名称',
  spec                         VARCHAR(100)    DEFAULT NULL COMMENT '规格型号',
  unit                         VARCHAR(20)     DEFAULT NULL COMMENT '数量单位',
  quantity                     INT(11)         NOT NULL COMMENT '询价数量(正整数)',
  expected_price               DECIMAL(10,2)   DEFAULT NULL COMMENT '预期单价',
  brand_requirement            VARCHAR(100)    DEFAULT NULL COMMENT '品牌要求',
  technical_requirement        TEXT            COMMENT '技术要求',
  remark                       VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (item_id),
  KEY idx_purchase_rfq_item_rfq (tenant_id, rfq_id, deleted, sort_no),
  KEY idx_purchase_rfq_item_consumable (tenant_id, consumable_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='采购询价物料明细表';
```

### 7.3 被邀供应商

```sql
CREATE TABLE oa_purchase_rfq_supplier (
  rfq_supplier_id              BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '询价供应商邀请ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  rfq_id                       BIGINT(20)      NOT NULL COMMENT '询价单ID',
  supplier_id                  BIGINT(20)      NOT NULL COMMENT '被邀供应商ID',
  supplier_name                VARCHAR(100)    DEFAULT NULL COMMENT '供应商名称快照',
  contact_name                 VARCHAR(64)     DEFAULT NULL COMMENT '联系人快照',
  contact_email                VARCHAR(100)    DEFAULT NULL COMMENT '联系邮箱快照',
  contact_phone                VARCHAR(30)     DEFAULT NULL COMMENT '联系电话快照',
  invite_time                  DATETIME        DEFAULT NULL COMMENT '邀请登记时间',
  invite_channel               VARCHAR(20)     NOT NULL DEFAULT 'OFFLINE' COMMENT '邀请渠道(EMAIL邮件/PHONE电话/OFFLINE线下)',
  respond_time                 DATETIME        DEFAULT NULL COMMENT '响应时间',
  quote_status                 VARCHAR(20)     NOT NULL DEFAULT 'INVITED' COMMENT '报价状态(INVITED/RESPONDED/DECLINED/NO_RESPONSE)',
  decline_reason               VARCHAR(500)    DEFAULT NULL COMMENT '拒绝报价原因',
  remark                       VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (rfq_supplier_id),
  UNIQUE KEY uk_purchase_rfq_supplier (tenant_id, rfq_id, supplier_id),
  KEY idx_purchase_rfq_supplier_status (tenant_id, rfq_id, quote_status),
  KEY idx_purchase_rfq_supplier_ref (tenant_id, supplier_id, invite_time)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='采购询价供应商邀请及响应记录表';
```

落库列名采用 PRD 和主设计字段清单中的 `invite_channel`，本批降级值为 `OFFLINE`；示例代码中的 `channel` 是变量名，不额外创建同义列。邀请记录不软删除，同一供应商在同一询价中只有一条记录。

### 7.4 供应商报价

```sql
CREATE TABLE oa_supplier_quotation (
  quotation_id                 BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '供应商报价ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  quotation_no                 VARCHAR(50)     NOT NULL COMMENT '供应商报价单号',
  rfq_id                       BIGINT(20)      NOT NULL COMMENT '询价单ID',
  supplier_id                  BIGINT(20)      NOT NULL COMMENT '报价供应商ID',
  supplier_name                VARCHAR(100)    DEFAULT NULL COMMENT '供应商名称快照',
  quote_date                   DATE            NOT NULL COMMENT '报价日期',
  valid_until                  DATE            DEFAULT NULL COMMENT '报价有效期截止日期',
  total_amount                 DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '含税报价总金额',
  tax_amount                   DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '报价总税额',
  currency                     VARCHAR(10)     NOT NULL DEFAULT 'CNY' COMMENT '报价币种',
  payment_terms                VARCHAR(50)     DEFAULT NULL COMMENT '付款条件',
  delivery_days                INT(11)         DEFAULT NULL COMMENT '承诺交付自然日数',
  delivery_date                DATE            DEFAULT NULL COMMENT '承诺交付日期',
  warranty_months              INT(11)         DEFAULT NULL COMMENT '保修月数',
  attachment_url               VARCHAR(1000)   DEFAULT NULL COMMENT '供应商正式报价附件地址',
  remark                       VARCHAR(500)    DEFAULT NULL COMMENT '报价说明',
  status                       VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT草稿/SUBMITTED已提交/WITHDRAWN已撤回)',
  entry_by                     BIGINT(20)      NOT NULL COMMENT '报价录入人ID(服务端取得)',
  entry_time                   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '报价录入时间',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  version                      INT(11)         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (quotation_id),
  UNIQUE KEY uk_supplier_quotation_no (tenant_id, quotation_no),
  UNIQUE KEY uk_supplier_quotation_rfq (tenant_id, rfq_id, supplier_id),
  KEY idx_supplier_quotation_compare (tenant_id, rfq_id, status, deleted, total_amount),
  KEY idx_supplier_quotation_entry (tenant_id, entry_by, rfq_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='供应商报价主表';
```

### 7.5 供应商报价明细

```sql
CREATE TABLE oa_supplier_quotation_item (
  item_id                      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '供应商报价明细ID',
  tenant_id                    BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  quotation_id                 BIGINT(20)      NOT NULL COMMENT '供应商报价ID',
  rfq_item_id                  BIGINT(20)      NOT NULL COMMENT '对应询价物料ID',
  sort_no                      INT(11)         NOT NULL DEFAULT 0 COMMENT '排序号',
  item_name                    VARCHAR(100)    NOT NULL COMMENT '物料名称快照',
  spec                         VARCHAR(100)    DEFAULT NULL COMMENT '规格型号快照',
  unit                         VARCHAR(20)     DEFAULT NULL COMMENT '数量单位快照',
  quantity                     INT(11)         NOT NULL COMMENT '报价数量(正整数)',
  unit_price                   DECIMAL(10,2)   NOT NULL COMMENT '未税报价单价',
  discount_rate                DECIMAL(6,4)    NOT NULL DEFAULT 1.0000 COMMENT '折扣比例(1为原价)',
  tax_rate                     DECIMAL(6,4)    NOT NULL DEFAULT 0.0000 COMMENT '税率比例(0.13为13%)',
  line_amount                  DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '折后未税行金额',
  brand                        VARCHAR(100)    DEFAULT NULL COMMENT '报价品牌',
  model                        VARCHAR(100)    DEFAULT NULL COMMENT '报价型号',
  delivery_days                INT(11)         DEFAULT NULL COMMENT '本项承诺交付自然日数',
  remark                       VARCHAR(500)    DEFAULT NULL COMMENT '报价明细说明',
  deleted                      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0未删除1已删除)',
  create_by                    VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time                  DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                    VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time                  DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (item_id),
  UNIQUE KEY uk_supplier_quotation_item_rfq (tenant_id, quotation_id, rfq_item_id),
  KEY idx_supplier_quotation_item_quote (tenant_id, quotation_id, deleted, sort_no),
  KEY idx_supplier_quotation_item_source (tenant_id, rfq_item_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='供应商报价物料明细表';
```

本稿将报价单价和 `line_amount` 明确为未税口径，报价总额及中标额为含税口径；折后行额和逐行税额各四舍五入到分后汇总。生成采购时逐行带入折后未税行额与该行税额之和，并核对采购总额等于中标总额。数量必须与对应询价物料一致；当前一轮询价每家供应商只有一份报价。

保密控制覆盖列表、详情、明细、比价、导出和附件访问：截止前录入人只能读取自己录入的报价；截止后比价仍需采购负责人或审批人身份与权限。报价被定标引用后禁止修改价格或删除；最低家数通过规则中心 `evaluateWarn`，不以硬编码数量拒绝邀请。

## 8. 既有表结构调整

下列语句描述相对于当前 `04.cloudflow-oa.sql` 的结构差异。正式实施将最终结构合入初始化脚本；不能将这些语句作为未经数据转换的运行库升级脚本直接执行。

| 表 | 当前列数 | 调整后列数 | 说明 |
| --- | --- | --- | --- |
| `oa_asset` | 18 | 43 | 分类改引用、价格改名，净增 25 列；比原清单多期初累计折旧一列。 |
| `oa_supplier` | 14 | 49 | PRD 字段逐项展开为 31 列，再加主设计已要求的 4 列例外放行；新增 35 列。 |
| `oa_project` | 36 | 46 | 新增 10 列，保留原预算及实际成本金额精度。 |
| `oa_project_dependency` | 15 | 14 | 去掉两个对象类型列、两个对象 ID 改挂项目任务，并补一列版本号。 |
| `oa_contract` | 37 | 57 | 履约 6 列、签署 13 列，再补合同供应商关联一列。 |
| `biz_purchase_request` | 33 | 34 | 增加询价单关联。 |
| `biz_purchase_item` | 13 | 14 | 增加询价物料关联；不修改现有数量及金额精度。 |

供应商“增加 26 列”和合同“增加 18 列”与逐字段清单不一致，本稿按具体字段保留完整业务内容，不为凑汇总数字删掉字段。

### 8.1 资产主表

```sql
ALTER TABLE oa_asset
  DROP COLUMN category,
  CHANGE COLUMN price purchase_amount DECIMAL(10,2) DEFAULT NULL COMMENT '资产购入原值',
  MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'IDLE' COMMENT '状态(IN_USE在用/IDLE闲置/MAINTENANCE维修/SCRAPPED报废/DISPOSED处置/LOST丢失)',
  ADD COLUMN category_id BIGINT(20) DEFAULT NULL COMMENT '资产分类ID',
  ADD COLUMN custodian_id BIGINT(20) DEFAULT NULL COMMENT '资产保管责任人ID',
  ADD COLUMN custodian_name VARCHAR(64) DEFAULT NULL COMMENT '资产保管责任人姓名',
  ADD COLUMN dept_id BIGINT(20) DEFAULT NULL COMMENT '归属部门ID',
  ADD COLUMN dept_name VARCHAR(64) DEFAULT NULL COMMENT '归属部门名称',
  ADD COLUMN location_detail VARCHAR(500) DEFAULT NULL COMMENT '存放位置详情',
  ADD COLUMN salvage_value DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '资产残值',
  ADD COLUMN useful_life_months INT(11) DEFAULT NULL COMMENT '使用寿命(月)',
  ADD COLUMN available_from_date DATE DEFAULT NULL COMMENT '可用日期及折旧起算日',
  ADD COLUMN disposal_date DATE DEFAULT NULL COMMENT '资产处置日期',
  ADD COLUMN depreciation_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否计提折旧(0否1是)',
  ADD COLUMN depreciation_method VARCHAR(30) DEFAULT 'STRAIGHT_LINE' COMMENT '折旧方法(STRAIGHT_LINE/DOUBLE_DECLINING/SUM_OF_YEARS)',
  ADD COLUMN depreciation_frequency VARCHAR(20) DEFAULT 'MONTHLY' COMMENT '折旧频率(MONTHLY/QUARTERLY/YEARLY)',
  ADD COLUMN opening_accumulated_depreciation DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '期初累计折旧金额',
  ADD COLUMN accumulated_depreciation DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '累计折旧金额(含期初)',
  ADD COLUMN net_book_value DECIMAL(10,2) DEFAULT NULL COMMENT '资产账面净值',
  ADD COLUMN next_depreciation_date DATE DEFAULT NULL COMMENT '下次折旧日期',
  ADD COLUMN depreciation_completed_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '折旧是否完成(0否1是)',
  ADD COLUMN insurance_policy_no VARCHAR(100) DEFAULT NULL COMMENT '保险保单号',
  ADD COLUMN insurer_name VARCHAR(200) DEFAULT NULL COMMENT '保险机构名称',
  ADD COLUMN insured_value DECIMAL(10,2) DEFAULT NULL COMMENT '保险金额',
  ADD COLUMN insurance_start_date DATE DEFAULT NULL COMMENT '保险开始日期',
  ADD COLUMN insurance_end_date DATE DEFAULT NULL COMMENT '保险结束日期',
  ADD COLUMN insurance_reminder_days INT(11) NOT NULL DEFAULT 30 COMMENT '保险提前提醒自然日数',
  ADD COLUMN maintenance_required_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否需要维保(0否1是)',
  ADD COLUMN warranty_expire_date DATE DEFAULT NULL COMMENT '保修到期日期',
  ADD KEY idx_asset_category (tenant_id, category_id, deleted),
  ADD KEY idx_asset_custodian (tenant_id, custodian_id, deleted),
  ADD KEY idx_asset_depreciation_scan (tenant_id, depreciation_flag, depreciation_completed_flag, deleted, next_depreciation_date),
  ADD KEY idx_asset_insurance_expiry (tenant_id, deleted, insurance_end_date),
  ADD KEY idx_asset_warranty_expiry (tenant_id, deleted, warranty_expire_date);
```

旧状态转换为 `1→IDLE`、`2→IN_USE`、`3→MAINTENANCE`、`4→SCRAPPED`、`5→LOST`；新增 `DISPOSED` 无旧值对应。移除分类文本前须逐租户建立分类映射并保留名称；启用折旧前校验原值、残值、期初折旧、起算日和寿命，未知原值保持空，禁止将其伪造为零元资产。

### 8.2 供应商主表

```sql
ALTER TABLE oa_supplier
  ADD COLUMN supplier_code VARCHAR(50) DEFAULT NULL COMMENT '供应商编号',
  ADD COLUMN supplier_type VARCHAR(20) DEFAULT NULL COMMENT '供应商类型(MANUFACTURER/DEALER/SERVICE/INDIVIDUAL)',
  ADD COLUMN category_id BIGINT(20) DEFAULT NULL COMMENT '供应商分类ID',
  ADD COLUMN short_name VARCHAR(100) DEFAULT NULL COMMENT '供应商简称',
  ADD COLUMN credit_code VARCHAR(18) DEFAULT NULL COMMENT '统一社会信用代码',
  ADD COLUMN legal_person VARCHAR(64) DEFAULT NULL COMMENT '法定代表人',
  ADD COLUMN register_capital DECIMAL(14,2) DEFAULT NULL COMMENT '注册资本金额',
  ADD COLUMN register_date DATE DEFAULT NULL COMMENT '成立日期',
  ADD COLUMN business_scope TEXT COMMENT '经营范围',
  ADD COLUMN address VARCHAR(500) DEFAULT NULL COMMENT '供应商地址',
  ADD COLUMN province VARCHAR(100) DEFAULT NULL COMMENT '所在省份',
  ADD COLUMN city VARCHAR(100) DEFAULT NULL COMMENT '所在城市',
  ADD COLUMN contact_email VARCHAR(100) DEFAULT NULL COMMENT '联系邮箱',
  ADD COLUMN tax_no VARCHAR(50) DEFAULT NULL COMMENT '税号',
  ADD COLUMN tax_rate DECIMAL(6,4) DEFAULT NULL COMMENT '默认税率比例',
  ADD COLUMN payment_terms VARCHAR(50) DEFAULT NULL COMMENT '付款条件编码',
  ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'CNY' COMMENT '默认币种',
  ADD COLUMN cooperation_start_date DATE DEFAULT NULL COMMENT '合作开始日期',
  ADD COLUMN level_code VARCHAR(50) DEFAULT NULL COMMENT '供应商等级字典编码',
  ADD COLUMN score DECIMAL(5,2) DEFAULT NULL COMMENT '最近确认评分(0至100)',
  ADD COLUMN standing VARCHAR(20) DEFAULT NULL COMMENT '评级(EXCELLENT/QUALIFIED/WATCH/ELIMINATED)',
  ADD COLUMN indicator_color VARCHAR(10) DEFAULT NULL COMMENT '评级颜色(RED/YELLOW/GREEN)',
  ADD COLUMN last_score_time DATETIME DEFAULT NULL COMMENT '最近确认评分时间',
  ADD COLUMN blacklist_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否在黑名单(0否1是)',
  ADD COLUMN blacklist_reason VARCHAR(500) DEFAULT NULL COMMENT '拉黑原因',
  ADD COLUMN blacklist_by BIGINT(20) DEFAULT NULL COMMENT '拉黑人ID',
  ADD COLUMN blacklist_time DATETIME DEFAULT NULL COMMENT '拉黑时间',
  ADD COLUMN prevent_purchase_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否禁止采购(0否1是)',
  ADD COLUMN prevent_rfq_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否禁止询价(0否1是)',
  ADD COLUMN qualification_expire_date DATE DEFAULT NULL COMMENT '最早有效资质到期日期',
  ADD COLUMN instance_id VARCHAR(64) DEFAULT NULL COMMENT '准入审批流程实例ID',
  ADD COLUMN bypass_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用例外放行(0否1是)',
  ADD COLUMN bypass_reason VARCHAR(500) DEFAULT NULL COMMENT '例外放行原因',
  ADD COLUMN bypass_by BIGINT(20) DEFAULT NULL COMMENT '例外放行人ID',
  ADD COLUMN bypass_expire_date DATE DEFAULT NULL COMMENT '例外放行截止日期',
  ADD UNIQUE KEY uk_supplier_code (tenant_id, supplier_code),
  ADD UNIQUE KEY uk_supplier_credit_code (tenant_id, credit_code),
  ADD KEY idx_supplier_category (tenant_id, category_id, deleted),
  ADD KEY idx_supplier_standing (tenant_id, standing, blacklist_flag, deleted),
  ADD KEY idx_supplier_qualification_expiry (tenant_id, qualification_expire_date),
  ADD KEY idx_supplier_admission_instance (tenant_id, instance_id),
  ADD KEY idx_supplier_bypass_expiry (tenant_id, bypass_flag, bypass_expire_date);
```

没有填写的供应商编号和信用代码统一保存为空值，禁止用空字符串绕乱唯一性语义；有值时做规范化及同租户唯一校验。原 `status` 的 `ACTIVE/DISABLED` 保持不变，评级未知时为空，不预设合格。例外放行仍记录规则命中与审计。

### 8.3 项目主表

```sql
ALTER TABLE oa_project
  ADD COLUMN estimated_cost DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '预估成本',
  ADD COLUMN labor_cost_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '已审批工时人力成本',
  ADD COLUMN purchase_cost_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '已完成采购成本',
  ADD COLUMN other_cost_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '其他成本',
  ADD COLUMN billable_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '可计费金额',
  ADD COLUMN billed_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '已开票金额',
  ADD COLUMN gross_margin DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '毛利金额',
  ADD COLUMN gross_margin_rate DECIMAL(6,4) DEFAULT NULL COMMENT '毛利率(比例,可计费金额为0时为空)',
  ADD COLUMN actual_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '期初与已审批累计投入工时(小时)',
  ADD COLUMN percent_complete_mode VARCHAR(20) NOT NULL DEFAULT 'TASK_COMPLETION' COMMENT '进度模式(MANUAL/TASK_COMPLETION/TASK_PROGRESS)';
```

现有 `budget_amount`、`actual_cost_amount` 和 `progress` 保留。成本汇总保持“人力 + 采购 + 其他”，毛利保持“可计费金额 - 实际成本”；过量金额或比例须在写库前明确报错，不能截断、限幅或将溢出转换为零。启用自动汇总前须核对既有手填成本和工时，不能用尚未补齐的明细覆盖历史数值。

### 8.4 项目依赖改挂任务

```sql
ALTER TABLE oa_project_dependency
  DROP INDEX idx_project_dependency_predecessor,
  DROP INDEX idx_project_dependency_successor,
  DROP COLUMN predecessor_type,
  DROP COLUMN successor_type,
  CHANGE COLUMN predecessor_id predecessor_task_id BIGINT(20) NOT NULL COMMENT '前置项目任务ID',
  CHANGE COLUMN successor_id successor_task_id BIGINT(20) NOT NULL COMMENT '后置项目任务ID',
  MODIFY COLUMN dependency_type VARCHAR(20) NOT NULL DEFAULT 'FINISH_TO_START' COMMENT '依赖类型(FINISH_TO_START/START_TO_START/FINISH_TO_FINISH)',
  ADD COLUMN version INT(11) NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  ADD UNIQUE KEY uk_project_dependency_edge (tenant_id, project_id, predecessor_task_id, successor_task_id, dependency_type),
  ADD KEY idx_project_dependency_before (tenant_id, project_id, predecessor_task_id),
  ADD KEY idx_project_dependency_after (tenant_id, project_id, successor_task_id);
```

原 `MILESTONE/WBS` 类型及对象 ID 必须在删列之前用于生成新任务 ID 映射；不能直接把两个来源表的原 ID 当成同一编号空间。现有 `FS` 转换为 `FINISH_TO_START`。只保留本表的逻辑关联，禁止增加物理外键。

### 8.5 合同主表

```sql
ALTER TABLE oa_contract
  ADD COLUMN supplier_id BIGINT(20) DEFAULT NULL COMMENT '合同关联供应商ID(用于准入校验)',
  ADD COLUMN requires_fulfilment_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否需要履约跟踪(0否1是)',
  ADD COLUMN fulfilment_status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED' COMMENT '履约状态(NOT_STARTED/ONGOING/FULFILLED/PARTIALLY_BREACHED/BREACHED)',
  ADD COLUMN fulfilment_deadline DATE DEFAULT NULL COMMENT '合同整体履约期限(自然日)',
  ADD COLUMN fulfilled_term_count INT(11) NOT NULL DEFAULT 0 COMMENT '已完成条款数(含豁免)',
  ADD COLUMN total_term_count INT(11) NOT NULL DEFAULT 0 COMMENT '有效履约条款总数',
  ADD COLUMN fulfilment_progress DECIMAL(6,2) NOT NULL DEFAULT 0.00 COMMENT '履约进度(0至100)',
  ADD COLUMN signed_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已签署(0否1是)',
  ADD COLUMN sign_method VARCHAR(20) DEFAULT NULL COMMENT '签署方式(OFFLINE纸质/ESIGN电子签章/SCAN扫描件确认)',
  ADD COLUMN our_signee_id BIGINT(20) DEFAULT NULL COMMENT '我方签署人用户ID',
  ADD COLUMN our_signee_name VARCHAR(64) DEFAULT NULL COMMENT '我方签署人姓名',
  ADD COLUMN our_sign_time DATETIME DEFAULT NULL COMMENT '我方签署时间',
  ADD COLUMN our_sign_ip VARCHAR(45) DEFAULT NULL COMMENT '服务端取得的签署来源IP',
  ADD COLUMN counterparty_signee VARCHAR(64) DEFAULT NULL COMMENT '对方签署人姓名',
  ADD COLUMN counterparty_sign_time DATETIME DEFAULT NULL COMMENT '对方签署时间',
  ADD COLUMN sign_place VARCHAR(200) DEFAULT NULL COMMENT '签署地点',
  ADD COLUMN sign_remark VARCHAR(500) DEFAULT NULL COMMENT '签署说明',
  ADD COLUMN signed_file_url VARCHAR(1000) DEFAULT NULL COMMENT '已签署合同文件地址',
  ADD COLUMN esign_provider VARCHAR(50) DEFAULT NULL COMMENT '电子签章服务商(预留)',
  ADD COLUMN esign_transaction_id VARCHAR(100) DEFAULT NULL COMMENT '电子签章流水号(预留)',
  ADD KEY idx_contract_supplier (tenant_id, supplier_id),
  ADD KEY idx_contract_fulfilment_scan (tenant_id, requires_fulfilment_flag, fulfilment_status, fulfilment_deadline),
  ADD KEY idx_contract_signed (tenant_id, signed_flag, our_sign_time);
```

合同原有金额、相对方名称和付款里程碑保持不变；F3 删除的是项目里程碑表，合同里程碑表不删除。签署后锁定金额、期限及相对方等关键字段；预留电子签章字段不代表本期已经完成第三方签章接入。

### 8.6 采购申请关联询价

```sql
ALTER TABLE biz_purchase_request
  ADD COLUMN rfq_id BIGINT(20) DEFAULT NULL COMMENT '来源询价单ID',
  ADD UNIQUE KEY uk_purchase_request_rfq (tenant_id, rfq_id);
```

同一询价只能生成一张采购申请；普通采购的空引用不参与唯一性冲突。生成或更新时锁定询价及采购申请，在同一事务内维护双方引用及明细，业务写入完成后再发起审批。

### 8.7 采购明细关联询价物料，待审补充

```sql
ALTER TABLE biz_purchase_item
  ADD COLUMN rfq_item_id BIGINT(20) DEFAULT NULL COMMENT '来源询价物料ID(用于关联中标报价及成交金额)',
  ADD UNIQUE KEY uk_purchase_item_rfq (tenant_id, purchase_id, rfq_item_id),
  ADD KEY idx_purchase_item_rfq_source (tenant_id, rfq_item_id);
```

该引用必须属于采购申请所关联的询价，耗材、数量及中标供应商也必须匹配。旧采购明细的空引用保留现有处理；原 `quantity`、`received_quantity`、`unit_price`、`amount` 规格不变。此处通过真实来源关联分流计算，未增加一套旧版本接口兼容层。

## 9. 项目里程碑收敛及运行数据保护

按 F 技术设计 §3.6 的六步顺序实施，新增表和数据核验完成前不得执行删表。

| 顺序 | 必须完成的动作 |
| --- | --- |
| 1 | 建立 `oa_project_task`，保留原项目主表及项目成员、风险等表。 |
| 2 | 将旧里程碑转换为 `is_milestone_flag=1`、权重 `3.00` 的任务；把仍参与项目进度的项目工作任务转换到新任务数据源。保留来源类型、租户、项目、旧 ID 到新 ID 的转换记录。 |
| 3 | 扩展 `ProjectExecutionStateService`，将进度取数切换到新表，并使用 §3.6 修正版公式；基线快照及偏差计算同步改读新任务字段。 |
| 4 | 根据来源映射转换 `oa_project_dependency` 两端 ID；既有 `oa_work_task.milestone_id` 的有效关联也须重绑定到新里程碑任务，禁止留下悬空 ID。 |
| 5 | 核对记录数、租户/项目归属、依赖端点、关键历史字段及进度结果后，删除旧里程碑实体、映射、业务实现、接口内部引用和表；不删除通用工作任务表。 |
| 6 | 前端里程碑视图改为筛选新任务的 `is_milestone_flag=1`，同步项目任务树、依赖、模板及工时选择器；对外里程碑视图保留业务展示能力。 |

关键字段对应关系如下：

| 原字段 | 新任务字段或处理 |
| --- | --- |
| `milestone_name / milestone_code` | `subject / task_no` |
| `owner_id / owner_name` | `assignee_id / assignee_name` |
| `planned_date / baseline_date / actual_date` | `planned_end / baseline_end / actual_end`，日期转换为当天零时；原日期本身不具备更细时间精度。 |
| 旧工作任务开始、结束、基线时间 | 新任务相应 `planned_* / actual_* / baseline_*`，保留已有时间值。 |
| 原进度、排序、说明及审计列 | 保留到 `progress / sort_no / description` 及对应审计列；状态按现有完成判定转换，未知状态停止转换并报告。 |
| 两张来源表中可能相同的旧 ID | 使用“租户 + 项目 + 来源类型 + 旧 ID”映射到独立的新任务 ID，禁止直接混用。 |

只有上述检查全部通过后，最终结构才移除旧表：

```sql
DROP TABLE oa_project_milestone;
```

本稿不执行该语句。运行库发布前须完整备份，并在独立恢复环境试跑转换；对照备份验证原业务记录未丢失，不将演示数据重建脚本直接覆盖到运行库。执行代码、正式 SQL、种子生成器和测试清理旧运行引用；设计历史文档保留旧表名用于说明转换依据。正式初始化 SQL 与种子一并更新，`07` 演示种子使用现有生成脚本重新生成，不手工修改。

## 10. M1–M12 实施与验收计划

每阶段包含对应前后端、权限、审计及自动化测试。菜单使用 1650–1749 段，落库前再次检查占用；新增任务统一注册进 `sys_job`，不新增 `@Scheduled`。工作流启动、审批和撤回调用放在数据库事务之外；名称含删除、撤销等高风险操作的公开服务方法必须满足启动期 `@Audit(highRisk=true)` 校验。

### 10.1 M1–M6：供应商与资产

| 阶段 | 交付内容 | 依赖与主要验收 |
| --- | --- | --- |
| M1 | 供应商分类、主表扩展、资质核验及到期提醒 | 批次 A；信用代码唯一、资质回填、提醒防重。 |
| M2 | 评分卡、自动交付及时率、准入拦截和例外放行 | M1；规则中心生效、收货数据可追溯、黑名单和过期资质拦截。 |
| M3 | 资产主表扩展、分类主数据、既有状态操作衔接 | 批次 A；`getAllCategories()` 改读分类主数据，金额及状态转换核验。 |
| M4 | 三种折旧方法、计划生成与预览 | M3；逐方法手算案例，首期、末期及残值边界。 |
| M5 | 折旧任务过账、并发防重、资本化和延寿重算 | M4、任务平台；重跑不翻倍，已过账历史不变。 |
| M6 | 维保计划与任务、维修、调拨、保险及保修提醒 | M4；状态联动、任务生成防重、时间线和审计可追溯。 |

### 10.2 M7–M9：项目与工时

| 阶段 | 交付内容 | 依赖与主要验收 |
| --- | --- | --- |
| M7 | 任务树、依赖及循环检测、基线保留、进度扩展、里程碑收敛 | 五层限制，三种进度模式；严格执行六步顺序及不重复计数用例。 |
| M8 | 活动类型、有效期单价、工时填报、双轨金额及单价锁定 | M7；员工价优先、历史不受调价影响、敏感单价权限。 |
| M9 | 工时审批与冲正、项目成本回写及全量重算、项目模板 | M8；重复回调安全、负数工时可追溯、采购及开票对账。 |

### 10.3 M10–M12：合同与询价

| 阶段 | 交付内容 | 依赖与主要验收 |
| --- | --- | --- |
| M10 | 合同履约条款、模板条款、五态推导、签署及提醒 | 批次 A；自然日到期、签署后锁定，IP 可信性保留运维确认项。 |
| M11 | 询价、供应商邀请、报价录入、比价保密及导出 | M2；服务端全入口权限过滤，同一物料逐行对应。 |
| M12 | 定标、采购联动、线下邀请、整体构建及部署验收 | M11；非最低价理由、成交金额不丢折扣税额、运行数据受保护。 |

完整实施后的验收包括后端构建及启动、前端类型检查及构建、独立空库执行 `01` 至 `06`、311 张全量表核对、菜单权限核对、内置任务实跑和运行环境数据核验。本轮仅编制及静态检查建表稿，不把这些实施验收标记为通过。

## 11. 范围及审定关口

- 耗材专用台账仍属于 H4，原资产日志保留，不增加 `balance_after`；车辆保持原有六表，一物多账不在本批。
- 邮件邀请使用 `OFFLINE` 降级并落库，邮件送达不列为已完成能力；签署真实客户端 IP 仍需运维确认可信代理及转发头配置。
- 审定内容包括 §1.1 的数值单位及金额口径、提醒日志作为第 25 张表、§1.2 的七个衔接字段和 §8 的七张改表。确认后再同步正式 SQL 与代码；本文件本身不授权删除或覆盖运行数据。

## 12. 静态校验记录

静态校验 = 只读取本稿和现有建表脚本检查语句结构，不执行数据库语句。2026-09-09 检查通过：33 个 SQL 代码块包含 25 张新表、7 张既有表调整及 1 张受控删表；新表共 518 列、110 个索引（含 25 个主键索引），七张改表模拟后的列数均与 §8 一致。

已检查主键与租户字段、逐列及表注释、默认值与可空性、枚举长度、金额和工时规格、索引引用列、重复命名、标识符长度、联合索引宽度、无物理外键、代码围栏及行尾空白。追加式资质提醒日志按现有 `oa_license_expiry_reminder_log` 检查，仅保留创建审计字段；未强行增加更新字段或软删除字段。

`01` 至 `05` 脚本表数分别为 44、45、100、63、35，合计 287；本稿结构全部实施后，OA 为 87 张，全量脚本为 311 张。本轮未执行建表、删表、业务自动化测试或运行库部署，实施阶段仍须进行真实数据库及业务验收。
