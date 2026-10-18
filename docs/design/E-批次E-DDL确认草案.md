# 批次 E：CRM 客户经营建表确认草案

确认稿日期：2026-09-07。状态：用户已确认并批准开始，2026-09-08 已合入正式脚本与业务实现。

DDL = 定义数据库表、字段和索引的建表语句。本文件保留获批口径；四张改表与十八张新表已合入 `05.cloudflow-crm.sql`，最终建表定义以该脚本为准。下文的 `DROP TABLE` 沿用项目空库初始化格式，禁止直接用于已有业务数据的数据库；首次验收使用独立临时 MySQL，2026-09-08 用户追加授权后已备份并增量更新运行库，详情见 `E-批次E实施验收记录.md`。

## 1. 已确认口径

| 分组 | 确认结果 |
| --- | --- |
| 表数 | 按 E1–E5 PRD 新增 18 张：3 + 3 + 4 + 2 + 6；CRM 从 17 张变为 35 张，全库从 269 张变为 287 张。撤销未定义的“关联表二”，不编造表名或业务。 |
| 数值与字段 | SLA 时限保存整数分钟；金额统一 `DECIMAL(16,2)`，即共 16 位、其中 2 位小数；线索按清单新增 16 列，客户补营销来源后新增 6 列；营销效果计数采用 PRD 明确列出的 9 项。 |
| OA 对齐 | CRM 与 OA 分表，采用 E/H4 已定的共同状态和提醒结构；OA 补字段留在 H4，本批不改 OA 表。 |

OA 实查与本批采用标准：

| 字段 | OA 仓库当前结构 | E/H4 共同标准，本批 CRM 照此落地 |
| --- | --- | --- |
| `status` | `oa_schedule_event` 尚无该字段 | `PLANNED / IN_PROGRESS / COMPLETED / CANCELLED / NOT_HELD` |
| `acceptance_status` | `oa_meeting_attendance` 尚无该字段；`attend_status` 是签到结果 | `NONE / ACCEPTED / DECLINED / TENTATIVE` |

依据：`docs/design/H-批次H技术设计要点.md:68`、`cloudflow-backend/DB/04.cloudflow-oa.sql:82`、`cloudflow-backend/DB/04.cloudflow-oa.sql:1783`。这里确认的是共同标准，未声称 OA 代码已完成改造。

工单优先级映射如下；现有共用字典 `severity_level` 还服务于其他告警，不能全局替换它。

| 当前工单值 | 本批工单值 | 业务含义 |
| --- | --- | --- |
| `CRITICAL` | `P1` | 严重 |
| `HIGH` | `P2` | 高 |
| `MEDIUM` | `P3` | 中 |
| `LOW` | `P4` | 低，默认值 |

改前代码允许上述四个旧值，工单种子数据使用 `HIGH/LOW`。实施已同步修改工单字典、前后端和种子引用；新工单仅接受 `P1/P2/P3/P4`，独立空库验证无未知工单值。追加授权后已核实运行库的两条原业务工单及 2500 条旧演示工单并完成受限修正，原数据完整备份；不在业务代码中引入旧值兼容层。

## 2. 字段与索引推导

- 表规范：沿用 `05` 的 `BIGINT(20)` 自增主键、`utf8mb4`、逐列 `COMMENT` 和审计列；新增表的租户列参照 `crm_assignment_rule` 使用 `NOT NULL DEFAULT 100000`。独立业务/配置主表有 `version`，明细表不额外加版本。可维护的配置及明细有 `deleted`，提醒发送记录和营销流水不软删除。
- 类型依据：编码 50 字符、名称 120 字符、邮箱 100 字符、网站 255 字符、备注 500 字符沿用现有同类字段；流程实例 `instance_id` 为 `VARCHAR(64)`，消息记录、日历和 CRM 对象引用为 `BIGINT(20)`。SLA `entity_id` 使用 `VARCHAR(64)`，容纳客户 ID 的十进制文本、客户等级代码与行业代码。未指定取值的配置状态沿用 `crm_assignment_rule` 的 `ACTIVE/INACTIVE`，SLA 与信用额度保留 PRD 的 `ENABLED/DISABLED`。
- 关系约束：全部业务索引以 `tenant_id` 开头，不添加物理外键。唯一索引不包含 `deleted`，与现有 CRM 编码约束一致；同键软删除记录应恢复或更新，不能重复插入。父子关系、租户一致性、状态合法性、日期顺序、分钟和金额非负、丢单有且仅有一个主因，由服务层在同一事务中校验。

命名统一采用主技术设计的 `participant_ref_id`、`member_ref_id`；分别对应 PRD 的 `participant_id_ref`、`member_id_ref`，语义不变。

以下三处是明确列出的实现推导，随本草案一并确认：

- `crm_opportunity` 增加 `competitor_id` 保存商机的主要竞对，赢单时记录被击败的竞对；丢单的多原因、多竞对仍存 `crm_opportunity_lost_detail`。依据 E3 PRD FR-2.2 与 FR-5.1，竞对可在赢单时关联且需统计竞对胜负比；仅有丢单明细无法保存赢单竞对。此方案增加一列，不增加表。
- 营销归因窗口复用 `sys_config` 的 `crm.campaign.attribution.window.days`，默认 30 天，不额外新增窗口字段或归因流水表；四个效果率按比例保存，分母为零时取 0，成本为零时 `roi` 为空，避免除零。
- 投入产出比扩大整数部分的存储范围，保留 PRD 的 4 位小数。按已确认金额精度，最大收入为 99999999999999.99、最小正成本为 0.01，对应最大投入产出比为 9999999999999998，需要 16 位整数。

| 字段 | PRD 原定义 | 本草案定义 | 推导依据 |
| --- | --- | --- | --- |
| `crm_campaign.roi` | `DECIMAL(10,4)`，6 位整数 | `DECIMAL(20,4)`，16 位整数 | 覆盖 `DECIMAL(16,2)` 合法收入与正成本组合，避免汇总任务因数值溢出失败 |

## 3. 新增表完整定义

### 3.1 E1：活动管理，3 张

来源：`docs/design/E-批次E技术设计.md:25`、`docs/prd/E1-CRM-01-活动管理-PRD.md:77`。活动主表保留完整设计的业务字段，按 `05` 补齐租户非空约束与租户前导索引。

```sql
DROP TABLE IF EXISTS crm_activity;
CREATE TABLE crm_activity (
  activity_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '活动ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  activity_no        VARCHAR(64)     DEFAULT NULL COMMENT '活动编号',
  activity_type      VARCHAR(20)     NOT NULL COMMENT '活动类型(MEETING/CALL/TASK)',
  subject            VARCHAR(200)    NOT NULL COMMENT '主题',
  description        VARCHAR(2000)   DEFAULT NULL COMMENT '说明',
  status             VARCHAR(20)     NOT NULL DEFAULT 'PLANNED' COMMENT '状态(PLANNED/IN_PROGRESS/COMPLETED/CANCELLED/NOT_HELD)',
  priority           VARCHAR(20)     DEFAULT 'MEDIUM' COMMENT '优先级(HIGH/MEDIUM/LOW)',
  direction          VARCHAR(20)     DEFAULT NULL COMMENT '通话方向(INBOUND/OUTBOUND)',
  start_time         DATETIME        DEFAULT NULL COMMENT '开始时间',
  end_time           DATETIME        DEFAULT NULL COMMENT '结束时间',
  all_day_flag       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否全天',
  duration_minutes   INT             DEFAULT NULL COMMENT '活动时长(分钟)',
  biz_type           VARCHAR(30)     DEFAULT 'NONE' COMMENT '挂载类型(CUSTOMER/OPPORTUNITY/LEAD/TICKET/CONTRACT/QUOTE/NONE)',
  biz_id             BIGINT(20)      DEFAULT NULL COMMENT '挂载对象ID',
  customer_id        BIGINT(20)      DEFAULT NULL COMMENT '客户ID',
  customer_name      VARCHAR(200)    DEFAULT NULL COMMENT '客户名称',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name         VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  dept_id            BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  location           VARCHAR(300)    DEFAULT NULL COMMENT '地点',
  join_url           VARCHAR(500)    DEFAULT NULL COMMENT '线上会议链接',
  meeting_platform   VARCHAR(50)     DEFAULT NULL COMMENT '会议平台',
  result_summary     VARCHAR(1000)   DEFAULT NULL COMMENT '结果纪要',
  next_action        VARCHAR(500)    DEFAULT NULL COMMENT '后续动作',
  complete_time      DATETIME        DEFAULT NULL COMMENT '完成时间',
  overdue_flag       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '任务是否逾期',
  attachment_url     VARCHAR(1000)   DEFAULT NULL COMMENT '附件',
  follow_up_id       BIGINT(20)      DEFAULT NULL COMMENT '关联生成的跟进记录ID',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version            INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (activity_id),
  KEY idx_crmact_biz (tenant_id, biz_type, biz_id),
  KEY idx_crmact_customer (tenant_id, customer_id),
  KEY idx_crmact_owner_time (tenant_id, owner_id, start_time),
  KEY idx_crmact_status_time (tenant_id, status, start_time),
  KEY idx_crmact_overdue (tenant_id, activity_type, overdue_flag, status, end_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM活动表';

DROP TABLE IF EXISTS crm_activity_participant;
CREATE TABLE crm_activity_participant (
  participant_id     BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '参与记录ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  activity_id        BIGINT(20)      NOT NULL COMMENT '活动ID',
  participant_type   VARCHAR(20)     NOT NULL COMMENT '参与人类型(USER/CONTACT/LEAD)',
  participant_ref_id BIGINT(20)      NOT NULL COMMENT '参与人对应用户或联系人或线索ID',
  participant_name   VARCHAR(120)    DEFAULT NULL COMMENT '参与人姓名快照',
  is_organizer_flag  TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否组织者',
  acceptance_status VARCHAR(20)     NOT NULL DEFAULT 'NONE' COMMENT '接受状态(NONE/ACCEPTED/DECLINED/TENTATIVE)',
  response_time      DATETIME        DEFAULT NULL COMMENT '接受状态响应时间',
  attend_flag        TINYINT(1)      DEFAULT NULL COMMENT '出席结果(NULL=未记录 0=未出席 1=出席)',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (participant_id),
  UNIQUE KEY uk_crmact_participant (tenant_id, activity_id, participant_type, participant_ref_id),
  KEY idx_crmact_participant_ref (tenant_id, participant_type, participant_ref_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM活动参与人表';

DROP TABLE IF EXISTS crm_activity_reminder;
CREATE TABLE crm_activity_reminder (
  reminder_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '提醒ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  activity_id        BIGINT(20)      NOT NULL COMMENT '活动ID',
  remind_minutes_before INT         NOT NULL COMMENT '提前提醒分钟数',
  channel_type       VARCHAR(20)     NOT NULL DEFAULT 'INTERNAL' COMMENT '提醒渠道(INTERNAL/EMAIL)',
  sent_flag          TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否已提交发送(0=待发送 1=已提交)',
  send_time          DATETIME        DEFAULT NULL COMMENT '提交发送时间',
  message_record_id  BIGINT(20)      DEFAULT NULL COMMENT '统一消息记录ID',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (reminder_id),
  KEY idx_crmact_reminder_pending (tenant_id, sent_flag, activity_id),
  KEY idx_crmact_reminder_activity (tenant_id, activity_id, sent_flag),
  KEY idx_crmact_reminder_message (tenant_id, message_record_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM活动提醒表';
```

提醒表不对“活动 + 提前分钟 + 渠道”加唯一约束：活动改期后同一配置可以产生新的提醒，已发送历史仍保留。服务层锁定活动记录后去重配置、删除未发提醒并重排，避免并发重复；活动取消时仅删除未发提醒。`sent_flag` 表示已进入统一消息投递链路，真实投递结果以 `sys_message_record` 为准，未实现的邮件渠道不得显示发送成功。

### 3.2 E2：服务时限，3 张

来源：`docs/design/E-批次E技术设计.md:134`、`docs/prd/E2-CRM-03-SLA服务等级-PRD.md:75`。

```sql
DROP TABLE IF EXISTS crm_sla_policy;
CREATE TABLE crm_sla_policy (
  policy_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'SLA策略ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  policy_code        VARCHAR(50)     NOT NULL COMMENT '策略编码',
  policy_name        VARCHAR(120)    NOT NULL COMMENT '策略名称',
  entity_type        VARCHAR(30)     NOT NULL DEFAULT 'GLOBAL' COMMENT '适用范围(GLOBAL/CUSTOMER/CUSTOMER_LEVEL/INDUSTRY)',
  entity_id          VARCHAR(64)     DEFAULT NULL COMMENT '范围对象标识(客户ID或等级代码或行业代码，全局为空)',
  holiday_calendar_id BIGINT(20)     DEFAULT NULL COMMENT '节假日日历ID',
  apply_for_resolution TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否考核解决时长',
  round_the_clock_flag TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否按全天自然时间计时',
  default_flag       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否默认策略',
  priority           INT             NOT NULL DEFAULT 100 COMMENT '同范围匹配顺序，数字越小越先匹配',
  effective_start    DATE            DEFAULT NULL COMMENT '生效开始日期',
  effective_end      DATE            DEFAULT NULL COMMENT '生效结束日期',
  status             VARCHAR(20)     NOT NULL DEFAULT 'ENABLED' COMMENT '状态(ENABLED/DISABLED)',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version            INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (policy_id),
  UNIQUE KEY uk_crm_sla_policy_code (tenant_id, policy_code),
  KEY idx_crm_sla_policy_scope (tenant_id, entity_type, entity_id, status, priority),
  KEY idx_crm_sla_policy_default (tenant_id, default_flag, status),
  KEY idx_crm_sla_policy_calendar (tenant_id, holiday_calendar_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM服务等级策略表';

DROP TABLE IF EXISTS crm_sla_priority;
CREATE TABLE crm_sla_priority (
  priority_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'SLA优先级分档ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  policy_id          BIGINT(20)      NOT NULL COMMENT 'SLA策略ID',
  priority_code      VARCHAR(20)     NOT NULL COMMENT '工单优先级代码(P1/P2/P3/P4)',
  priority_name      VARCHAR(64)     NOT NULL COMMENT '优先级名称',
  first_response_minutes INT        NOT NULL COMMENT '首次响应时限(分钟)',
  resolution_minutes INT            DEFAULT NULL COMMENT '解决时限(分钟，不考核解决时可为空)',
  sort_no            INT             NOT NULL DEFAULT 0 COMMENT '排序号',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (priority_id),
  UNIQUE KEY uk_crm_sla_priority (tenant_id, policy_id, priority_code)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM服务等级优先级分档表';

DROP TABLE IF EXISTS crm_sla_status_rule;
CREATE TABLE crm_sla_status_rule (
  rule_id            BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'SLA状态规则ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  policy_id          BIGINT(20)      NOT NULL COMMENT 'SLA策略ID',
  rule_type          VARCHAR(20)     NOT NULL COMMENT '规则类型(PAUSE/FULFILL)',
  ticket_status      VARCHAR(20)     NOT NULL COMMENT '触发规则的工单状态',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (rule_id),
  UNIQUE KEY uk_crm_sla_status_rule (tenant_id, policy_id, rule_type, ticket_status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM服务等级状态规则表';
```

SLA = 工单响应和解决的承诺时限。正常累计日历工作时段，扣除午休、下班、休息日、节假日和暂停；暂停恢复保留已耗时。非全天策略应绑定可用日历；`round_the_clock_flag=1` 才显式选择全天服务。E2 PRD §6 的异常降级单独处理：日历故障时允许工单创建，记录异常、按自然时间兜底并告警，不能静默切换计时口径。

A4 已有 `calcWorkMinutes`，尚无公共 `addWorkMinutes` 方法；M3 在 CRM 内组合现有日历能力反算到期时间。SLA 分档字典 `crm_sla_priority_tier` 复用 `CrmHealthCalculator` / `SysDictHelper` 的配置读取方式；缺字典时使用内置分档，不报错、不返回空。无匹配策略才使用 `NOT_APPLICABLE`，不能把字典缺失误判为无需考核。

### 3.3 E3：丢单分析与信用额度，4 张

来源：`docs/prd/E3-CRM-丢单分析与信用额度-PRD.md:74`、`docs/prd/E3-CRM-丢单分析与信用额度-PRD.md:104`。

```sql
DROP TABLE IF EXISTS crm_lost_reason;
CREATE TABLE crm_lost_reason (
  reason_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '丢单原因ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  reason_code        VARCHAR(50)     NOT NULL COMMENT '原因编码',
  reason_name        VARCHAR(120)    NOT NULL COMMENT '原因名称',
  reason_category    VARCHAR(30)     NOT NULL DEFAULT 'OTHER' COMMENT '原因分类(PRICE/PRODUCT/SERVICE/COMPETITOR/TIMING/BUDGET/RELATIONSHIP/OTHER)',
  sort_no            INT             NOT NULL DEFAULT 0 COMMENT '排序号',
  status             VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE/INACTIVE)',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version            INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (reason_id),
  UNIQUE KEY uk_crm_lost_reason_code (tenant_id, reason_code),
  KEY idx_crm_lost_reason_category (tenant_id, reason_category, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM丢单原因表';

DROP TABLE IF EXISTS crm_competitor;
CREATE TABLE crm_competitor (
  competitor_id      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '竞争对手ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  competitor_code    VARCHAR(50)     NOT NULL COMMENT '竞争对手编码',
  competitor_name    VARCHAR(120)    NOT NULL COMMENT '竞争对手名称',
  website            VARCHAR(255)    DEFAULT NULL COMMENT '官网',
  industry           VARCHAR(64)     DEFAULT NULL COMMENT '行业',
  scale              VARCHAR(50)     DEFAULT NULL COMMENT '企业规模',
  strength           VARCHAR(1000)   DEFAULT NULL COMMENT '竞争对手优势',
  weakness           VARCHAR(1000)   DEFAULT NULL COMMENT '竞争对手劣势',
  our_advantage      VARCHAR(1000)   DEFAULT NULL COMMENT '我方相对优势',
  our_disadvantage   VARCHAR(1000)   DEFAULT NULL COMMENT '我方相对劣势',
  threat_level       VARCHAR(20)     NOT NULL DEFAULT 'MEDIUM' COMMENT '威胁程度(HIGH/MEDIUM/LOW)',
  status             VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE/INACTIVE)',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version            INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (competitor_id),
  UNIQUE KEY uk_crm_competitor_code (tenant_id, competitor_code),
  KEY idx_crm_competitor_name (tenant_id, competitor_name),
  KEY idx_crm_competitor_industry (tenant_id, industry, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM竞争对手表';

DROP TABLE IF EXISTS crm_opportunity_lost_detail;
CREATE TABLE crm_opportunity_lost_detail (
  detail_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '丢单明细ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  opportunity_id     BIGINT(20)      NOT NULL COMMENT '商机ID',
  lost_reason_id     BIGINT(20)      NOT NULL COMMENT '丢单原因ID',
  competitor_id      BIGINT(20)      DEFAULT NULL COMMENT '关联竞争对手ID',
  amount_lost        DECIMAL(16,2)   DEFAULT NULL COMMENT '丢单金额',
  is_primary_flag    TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否主要原因',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (detail_id),
  KEY idx_crm_lost_detail_opportunity (tenant_id, opportunity_id),
  KEY idx_crm_lost_detail_reason (tenant_id, lost_reason_id),
  KEY idx_crm_lost_detail_competitor (tenant_id, competitor_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM商机丢单明细表';

DROP TABLE IF EXISTS crm_customer_credit;
CREATE TABLE crm_customer_credit (
  credit_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '客户信用额度ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  customer_id        BIGINT(20)      NOT NULL COMMENT '客户ID',
  credit_limit       DECIMAL(16,2)   NOT NULL DEFAULT 0.00 COMMENT '信用额度',
  overdue_threshold  DECIMAL(16,2)   NOT NULL DEFAULT 0.00 COMMENT '超期欠款阈值',
  currency           VARCHAR(10)     NOT NULL DEFAULT 'CNY' COMMENT '币种',
  bypass_flag        TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否例外放行',
  bypass_reason      VARCHAR(500)    DEFAULT NULL COMMENT '例外放行原因',
  bypass_by          BIGINT(20)      DEFAULT NULL COMMENT '例外放行人ID',
  bypass_time        DATETIME        DEFAULT NULL COMMENT '例外放行时间',
  bypass_expire_date DATE            DEFAULT NULL COMMENT '例外放行有效截止日期',
  effective_start    DATE            DEFAULT NULL COMMENT '额度生效开始日期',
  effective_end      DATE            DEFAULT NULL COMMENT '额度生效结束日期',
  status             VARCHAR(20)     NOT NULL DEFAULT 'DISABLED' COMMENT '状态(ENABLED/DISABLED)，审批通过后启用',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  instance_id        VARCHAR(64)     DEFAULT NULL COMMENT '额度审批流程实例ID',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version            INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (credit_id),
  UNIQUE KEY uk_crm_credit_customer (tenant_id, customer_id),
  KEY idx_crm_credit_instance (tenant_id, instance_id),
  KEY idx_crm_credit_status (tenant_id, status, effective_end)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM客户信用额度表';
```

信用额度一客户一条记录。待审批变更保存在既有流程的业务数据中，审批通过后更新生效额度；已有额度在审批期间继续生效。占用金额复用未关闭应收的未回款金额，规则命中复用 `sys_business_rule_hit_record`，例外放行和拦截复用 `sys_audit_log`，不新增同用途表。竞对丢单数量按商机去重，避免多原因明细使同一商机被重复计数。

按 E3 PRD 的本期单币种口径，额度申请与占用核算只接受人民币 `CNY`；`currency` 字段留作扩展，不增加汇率依赖或混币汇总。

### 3.4 E4：区域与线索评分，2 张

来源：`docs/prd/E4-CRM-04-线索资质与客户分层-PRD.md:100`、`docs/prd/E4-CRM-04-线索资质与客户分层-PRD.md:113`。

```sql
DROP TABLE IF EXISTS crm_territory;
CREATE TABLE crm_territory (
  territory_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '区域ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  territory_code     VARCHAR(50)     NOT NULL COMMENT '区域编码',
  territory_name     VARCHAR(120)    NOT NULL COMMENT '区域名称',
  parent_id          BIGINT(20)      NOT NULL DEFAULT 0 COMMENT '父区域ID，0为根区域',
  level_path         VARCHAR(500)    NOT NULL DEFAULT '/' COMMENT '区域层级路径，包含自身ID并以斜线分隔',
  sort_no            INT             NOT NULL DEFAULT 0 COMMENT '排序号',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '区域负责人ID',
  status             VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE/INACTIVE)',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version            INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (territory_id),
  UNIQUE KEY uk_crm_territory_code (tenant_id, territory_code),
  KEY idx_crm_territory_parent (tenant_id, parent_id, sort_no),
  KEY idx_crm_territory_path (tenant_id, level_path),
  KEY idx_crm_territory_owner (tenant_id, owner_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM销售区域表';

DROP TABLE IF EXISTS crm_lead_score_rule;
CREATE TABLE crm_lead_score_rule (
  rule_id            BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '线索评分规则ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  rule_name          VARCHAR(120)    NOT NULL COMMENT '规则名称',
  field_name         VARCHAR(64)     NOT NULL COMMENT '参与评分的白名单字段名',
  `operator`         VARCHAR(20)     NOT NULL COMMENT '比较运算符',
  field_value        VARCHAR(500)    DEFAULT NULL COMMENT '比较值',
  score              INT             NOT NULL DEFAULT 0 COMMENT '命中时累加的分值',
  enabled_flag       TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否启用',
  sort_no            INT             NOT NULL DEFAULT 0 COMMENT '排序号',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version            INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (rule_id),
  KEY idx_crm_lead_score_enabled (tenant_id, enabled_flag, sort_no)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM线索评分规则表';
```

区域保存时在事务中维护完整 `level_path`，禁止自指、迁移到子节点和超过 5 层；查询限定租户。评分字段和运算符采用白名单，不执行用户填写的 SQL 或脚本；重算只改变评分，不自动改变人工资质结论。

### 3.5 E5-a：营销活动与名单，4 张

来源：`docs/prd/E5-CRM-02-营销活动闭环-PRD.md:89`、`docs/prd/E5-CRM-02-营销活动闭环-PRD.md:121`。活动状态使用营销 PRD 的 `PLANNING` 等值，独立于 E1 日程活动的 `PLANNED` 等值。

```sql
DROP TABLE IF EXISTS crm_campaign;
CREATE TABLE crm_campaign (
  campaign_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '营销活动ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  campaign_code      VARCHAR(50)     NOT NULL COMMENT '营销活动编码',
  campaign_name      VARCHAR(120)    NOT NULL COMMENT '营销活动名称',
  campaign_type      VARCHAR(20)     NOT NULL COMMENT '营销类型(EMAIL/EVENT/WEBINAR/EXHIBITION/OTHER)',
  status             VARCHAR(20)     NOT NULL DEFAULT 'PLANNING' COMMENT '状态(PLANNING/ACTIVE/PAUSED/COMPLETED/CANCELLED)',
  start_date         DATE            DEFAULT NULL COMMENT '活动开始日期',
  end_date           DATE            DEFAULT NULL COMMENT '活动结束日期',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name         VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  description        VARCHAR(2000)   DEFAULT NULL COMMENT '活动说明',
  budget             DECIMAL(16,2)   NOT NULL DEFAULT 0.00 COMMENT '预算金额',
  actual_cost        DECIMAL(16,2)   NOT NULL DEFAULT 0.00 COMMENT '实际成本',
  revenue            DECIMAL(16,2)   NOT NULL DEFAULT 0.00 COMMENT '归因收入',
  sent_count         INT             NOT NULL DEFAULT 0 COMMENT '发送数',
  delivered_count    INT             NOT NULL DEFAULT 0 COMMENT '送达数',
  opened_count       INT             NOT NULL DEFAULT 0 COMMENT '打开数',
  clicked_count      INT             NOT NULL DEFAULT 0 COMMENT '点击数',
  bounced_count     INT             NOT NULL DEFAULT 0 COMMENT '退信数',
  unsubscribed_count INT            NOT NULL DEFAULT 0 COMMENT '退订数',
  lead_created_count INT            NOT NULL DEFAULT 0 COMMENT '产生线索数',
  opportunity_created_count INT     NOT NULL DEFAULT 0 COMMENT '产生商机数',
  won_opportunity_count INT         NOT NULL DEFAULT 0 COMMENT '赢单数',
  open_rate          DECIMAL(6,4)    NOT NULL DEFAULT 0.0000 COMMENT '打开率，按比例存储',
  click_rate         DECIMAL(6,4)    NOT NULL DEFAULT 0.0000 COMMENT '点击率，按比例存储',
  bounce_rate        DECIMAL(6,4)    NOT NULL DEFAULT 0.0000 COMMENT '退信率，按比例存储',
  unsubscribe_rate   DECIMAL(6,4)    NOT NULL DEFAULT 0.0000 COMMENT '退订率，按比例存储',
  roi                DECIMAL(20,4)   DEFAULT NULL COMMENT '投入产出比((收入-成本)/成本)，成本为零时为空',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version            INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (campaign_id),
  UNIQUE KEY uk_crm_campaign_code (tenant_id, campaign_code),
  KEY idx_crm_campaign_owner (tenant_id, owner_id),
  KEY idx_crm_campaign_status_dates (tenant_id, status, start_date, end_date)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM营销活动表';

DROP TABLE IF EXISTS crm_target_list;
CREATE TABLE crm_target_list (
  list_id            BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '目标名单ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  list_code          VARCHAR(50)     NOT NULL COMMENT '名单编码',
  list_name          VARCHAR(120)    NOT NULL COMMENT '名单名称',
  description        VARCHAR(2000)   DEFAULT NULL COMMENT '名单说明',
  member_count       INT             NOT NULL DEFAULT 0 COMMENT '成员数',
  opted_out_count    INT             NOT NULL DEFAULT 0 COMMENT '已退订成员数',
  source_type        VARCHAR(20)     NOT NULL DEFAULT 'MANUAL' COMMENT '名单来源(MANUAL/QUERY)',
  query_condition    JSON            DEFAULT NULL COMMENT '条件筛选配置JSON',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  status             VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE/INACTIVE)',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version            INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (list_id),
  UNIQUE KEY uk_crm_target_list_code (tenant_id, list_code),
  KEY idx_crm_target_list_owner (tenant_id, owner_id),
  KEY idx_crm_target_list_source (tenant_id, source_type, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM营销目标名单表';

DROP TABLE IF EXISTS crm_target_list_member;
CREATE TABLE crm_target_list_member (
  member_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '名单成员记录ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  list_id            BIGINT(20)      NOT NULL COMMENT '名单ID',
  member_type        VARCHAR(20)     NOT NULL COMMENT '成员类型(CUSTOMER/CONTACT/LEAD)',
  member_ref_id      BIGINT(20)      NOT NULL COMMENT '客户或联系人或线索ID',
  member_name        VARCHAR(120)    DEFAULT NULL COMMENT '成员名称快照',
  email              VARCHAR(100)    DEFAULT NULL COMMENT '邮箱快照',
  phone              VARCHAR(30)     DEFAULT NULL COMMENT '电话快照',
  opted_out_flag     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否退订',
  add_time           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入名单时间',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (member_id),
  UNIQUE KEY uk_crm_target_list_member (tenant_id, list_id, member_type, member_ref_id),
  KEY idx_crm_target_member_ref (tenant_id, member_type, member_ref_id),
  KEY idx_crm_target_member_optout (tenant_id, list_id, opted_out_flag)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM营销目标名单成员表';

DROP TABLE IF EXISTS crm_campaign_target_list;
CREATE TABLE crm_campaign_target_list (
  relation_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '活动名单关联ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  campaign_id        BIGINT(20)      NOT NULL COMMENT '营销活动ID',
  list_id            BIGINT(20)      NOT NULL COMMENT '目标名单ID',
  is_excluding_flag  TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否排除名单(0=目标名单 1=排除名单)',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (relation_id),
  UNIQUE KEY uk_crm_campaign_target_list (tenant_id, campaign_id, list_id),
  KEY idx_crm_campaign_target_reverse (tenant_id, list_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM营销活动名单关联表';
```

同一活动与同一名单只有一条关联，切换包含/排除用途时更新 `is_excluding_flag`。名单刷新保留退订结果；计算实际对象时合并目标名单、扣除排除名单、已退订对象和无邮箱对象，并去重。归因重算覆盖写入结果，不在旧金额上累加；M9 从线索、商机、回款数据计算线索数、商机数、赢单数及收入，不依赖尚未开放的邮件日志任务。

### 3.6 E5-b：邮件群发与营销流水，2 张，仅预建表

来源：`docs/prd/E5-CRM-02-营销活动闭环-PRD.md:130`、`docs/prd/E5-CRM-02-营销活动闭环-PRD.md:139`。

```sql
DROP TABLE IF EXISTS crm_mass_email;
CREATE TABLE crm_mass_email (
  mass_email_id      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '群发任务ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  campaign_id        BIGINT(20)      NOT NULL COMMENT '营销活动ID',
  subject            VARCHAR(200)    NOT NULL COMMENT '邮件主题',
  template_code      VARCHAR(100)    NOT NULL COMMENT '统一消息中心邮件模板编码',
  from_address       VARCHAR(100)    DEFAULT NULL COMMENT '发件邮箱',
  from_name          VARCHAR(120)    DEFAULT NULL COMMENT '发件人显示名称',
  reply_to           VARCHAR(100)    DEFAULT NULL COMMENT '回复邮箱',
  scheduled_time    DATETIME        DEFAULT NULL COMMENT '计划发送时间',
  status             VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT/SCHEDULED/SENDING/SENT/CANCELLED)',
  total_count        INT             NOT NULL DEFAULT 0 COMMENT '计划发送总数',
  sent_count         INT             NOT NULL DEFAULT 0 COMMENT '已发送数',
  failed_count       INT             NOT NULL DEFAULT 0 COMMENT '失败数',
  start_time         DATETIME        DEFAULT NULL COMMENT '实际开始时间',
  end_time           DATETIME        DEFAULT NULL COMMENT '实际结束时间',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version            INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (mass_email_id),
  KEY idx_crm_mass_email_campaign (tenant_id, campaign_id),
  KEY idx_crm_mass_email_scheduled (tenant_id, status, scheduled_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM营销邮件群发任务表';

DROP TABLE IF EXISTS crm_campaign_log;
CREATE TABLE crm_campaign_log (
  log_id             BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '营销效果流水ID',
  tenant_id          BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  campaign_id        BIGINT(20)      NOT NULL COMMENT '营销活动ID',
  mass_email_id      BIGINT(20)      DEFAULT NULL COMMENT '群发任务ID',
  action             VARCHAR(30)     NOT NULL COMMENT '动作(SENT/DELIVERED/OPENED/CLICKED/BOUNCED/UNSUBSCRIBED/LEAD_CREATED/OPPORTUNITY_CREATED/WON)',
  action_time        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '动作发生时间',
  target_type        VARCHAR(20)     DEFAULT NULL COMMENT '对象类型(CUSTOMER/CONTACT/LEAD)',
  target_id          BIGINT(20)      DEFAULT NULL COMMENT '对象ID',
  target_email       VARCHAR(100)    DEFAULT NULL COMMENT '目标邮箱',
  click_url          VARCHAR(2000)   DEFAULT NULL COMMENT '被点击的原始链接',
  user_agent         VARCHAR(500)    DEFAULT NULL COMMENT '访问客户端标识',
  ip_address         VARCHAR(50)     DEFAULT NULL COMMENT '访问IP地址',
  message_record_id  BIGINT(20)      DEFAULT NULL COMMENT '统一消息记录ID',
  test_flag          TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否测试发送',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (log_id),
  KEY idx_crm_campaign_log_action (tenant_id, campaign_id, test_flag, action, action_time),
  KEY idx_crm_campaign_log_target (tenant_id, target_type, target_id),
  KEY idx_crm_campaign_log_mass (tenant_id, mass_email_id),
  KEY idx_crm_campaign_log_message (tenant_id, message_record_id),
  KEY idx_crm_campaign_log_time (tenant_id, action_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM营销效果流水表';
```

E5-b 继续被邮件渠道阻塞：SMTP = 邮件发送服务器连接配置，账号尚未提供；生产邮件发送器尚未就绪，追踪域名也暂不确定。本批只预建两表、保留适配入口并走 A 的 `SKIPPED / NOT_IMPLEMENTED` 明确未实现路径，不提供实际群发、公开追踪或退订端点。日志不软删除、不加乐观锁，保留期在 M10 确认；测试邮件流水不得进入正式效果统计。

## 4. 四张现有表的完整替换定义

以下四张表均已存在，属于替换原定义，不能再计入十八张新增表。保留现有主键、审计字段和索引，仅增加本批字段、索引并修订明确改变的字段语义。

| 表 | 原字段数 | 草案字段数 | 本批变化 |
| --- | --- | --- | --- |
| `crm_lead` | 27 | 43 | 新增 16 列 |
| `crm_customer` | 36 | 42 | 新增 6 列，包含营销来源 `campaign_id` |
| `crm_opportunity` | 27 | 29 | 新增 `campaign_id`、`competitor_id`；`lost_reason` 保留为补充说明 |
| `crm_service_ticket` | 23 | 34 | 新增 11 列；优先级改为 P1–P4，`due_time` 改由 SLA 计算 |

四表定义由当前 `05` 原定义逐项补齐，审阅时可直接对照，不使用 `ALTER TABLE`。

### 4.1 线索：新增 16 列

```sql
DROP TABLE IF EXISTS crm_lead;
CREATE TABLE crm_lead (
  lead_id            BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '线索ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  lead_no            VARCHAR(50)     NOT NULL COMMENT '线索编号',
  lead_name          VARCHAR(120)    NOT NULL COMMENT '线索名称',
  company_name       VARCHAR(120)    DEFAULT NULL COMMENT '公司名称',
  contact_name       VARCHAR(64)     DEFAULT NULL COMMENT '联系人姓名',
  mobile             VARCHAR(30)     DEFAULT NULL COMMENT '手机号',
  phone              VARCHAR(30)     DEFAULT NULL COMMENT '联系电话',
  email              VARCHAR(100)    DEFAULT NULL COMMENT '联系邮箱',
  source             VARCHAR(30)     DEFAULT NULL COMMENT '线索来源(ADS/CHANNEL/EVENT/REFERRAL)',
  industry           VARCHAR(64)     DEFAULT NULL COMMENT '行业',
  status             VARCHAR(20)     DEFAULT 'NEW' COMMENT '线索状态',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name         VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  dept_id            BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name          VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  next_follow_up_time DATETIME       DEFAULT NULL COMMENT '下次跟进时间',
  last_follow_up_time DATETIME       DEFAULT NULL COMMENT '最近跟进时间',
  converted_customer_id BIGINT(20)   DEFAULT NULL COMMENT '转化后的客户ID',
  converted_time     DATETIME        DEFAULT NULL COMMENT '转化时间',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  qualification_status VARCHAR(20) NOT NULL DEFAULT 'UNQUALIFIED' COMMENT '资质状态(UNQUALIFIED/QUALIFYING/QUALIFIED/DISQUALIFIED)',
  qualified_by       BIGINT(20)      DEFAULT NULL COMMENT '资质判定人ID',
  qualified_by_name  VARCHAR(64)     DEFAULT NULL COMMENT '资质判定人姓名',
  qualified_time     DATETIME        DEFAULT NULL COMMENT '资质判定时间',
  disqualify_reason  VARCHAR(500)    DEFAULT NULL COMMENT '不合格原因',
  annual_revenue     DECIMAL(16,2)   DEFAULT NULL COMMENT '企业年营收',
  employee_scale     VARCHAR(20)     DEFAULT NULL COMMENT '员工规模字典代码',
  market_segment     VARCHAR(64)     DEFAULT NULL COMMENT '细分市场字典代码',
  territory_id       BIGINT(20)      DEFAULT NULL COMMENT '销售区域ID',
  job_title          VARCHAR(120)    DEFAULT NULL COMMENT '联系人职位',
  website            VARCHAR(255)    DEFAULT NULL COMMENT '企业官网',
  campaign_id        BIGINT(20)      DEFAULT NULL COMMENT '来源营销活动ID',
  unsubscribe_flag   TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否退订营销邮件',
  unsubscribe_time   DATETIME        DEFAULT NULL COMMENT '退订时间',
  lead_score         INT             NOT NULL DEFAULT 0 COMMENT '线索评分',
  score_updated_time DATETIME        DEFAULT NULL COMMENT '评分更新时间',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (lead_id),
  UNIQUE KEY uk_crm_lead_no (tenant_id, lead_no),
  KEY idx_crm_lead_owner (tenant_id, owner_id),
  KEY idx_crm_lead_status (tenant_id, status),
  KEY idx_crm_lead_company (tenant_id, company_name),
  KEY idx_crm_lead_qualification (tenant_id, qualification_status),
  KEY idx_crm_lead_territory (tenant_id, territory_id),
  KEY idx_crm_lead_segment (tenant_id, market_segment),
  KEY idx_crm_lead_score (tenant_id, lead_score),
  KEY idx_crm_lead_campaign (tenant_id, campaign_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CRM线索表';
```

### 4.2 客户：新增 6 列

```sql
DROP TABLE IF EXISTS crm_customer;
CREATE TABLE crm_customer (
  customer_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '客户ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  customer_code      VARCHAR(50)     NOT NULL COMMENT '客户编码',
  customer_name      VARCHAR(120)    NOT NULL COMMENT '客户名称',
  customer_type      VARCHAR(30)     DEFAULT 'ENTERPRISE' COMMENT '客户类型',
  industry           VARCHAR(64)     DEFAULT NULL COMMENT '行业',
  level_code         VARCHAR(20)     DEFAULT 'NORMAL' COMMENT '客户等级',
  source             VARCHAR(30)     DEFAULT NULL COMMENT '客户来源(CHANNEL/EVENT/REFERRAL)',
  customer_tags      VARCHAR(255)    DEFAULT NULL COMMENT '客户标签，逗号分隔',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name         VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  dept_id            BIGINT(20)      DEFAULT NULL COMMENT '所属部门ID',
  dept_name          VARCHAR(64)     DEFAULT NULL COMMENT '所属部门名称',
  phone              VARCHAR(30)     DEFAULT NULL COMMENT '联系电话',
  email              VARCHAR(100)    DEFAULT NULL COMMENT '联系邮箱',
  website            VARCHAR(255)    DEFAULT NULL COMMENT '官网',
  province           VARCHAR(64)     DEFAULT NULL COMMENT '省份',
  city               VARCHAR(64)     DEFAULT NULL COMMENT '城市',
  address            VARCHAR(255)    DEFAULT NULL COMMENT '地址',
  credit_code        VARCHAR(50)     DEFAULT NULL COMMENT '统一社会信用代码',
  health_level       VARCHAR(20)     DEFAULT 'GREEN' COMMENT '健康度等级(GREEN/YELLOW/RED)',
  health_reason      VARCHAR(500)    DEFAULT NULL COMMENT '健康度原因',
  last_follow_up_time DATETIME       DEFAULT NULL COMMENT '最近跟进时间',
  next_follow_up_time DATETIME       DEFAULT NULL COMMENT '下次跟进时间',
  pool_flag          CHAR(1)         DEFAULT '0' COMMENT '是否在公海：0否 1是',
  pooled_time        DATETIME        DEFAULT NULL COMMENT '入池时间',
  original_owner_id  BIGINT(20)      DEFAULT NULL COMMENT '入池前原负责人ID',
  original_owner_name VARCHAR(64)    DEFAULT NULL COMMENT '入池前原负责人姓名',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  status             VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '状态',
  territory_id       BIGINT(20)      DEFAULT NULL COMMENT '销售区域ID',
  market_segment     VARCHAR(64)     DEFAULT NULL COMMENT '细分市场字典代码',
  employee_scale     VARCHAR(20)     DEFAULT NULL COMMENT '员工规模字典代码',
  annual_revenue     DECIMAL(16,2)   DEFAULT NULL COMMENT '企业年营收',
  unsubscribe_flag   TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否退订营销邮件',
  campaign_id        BIGINT(20)      DEFAULT NULL COMMENT '来源营销活动ID',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (customer_id),
  UNIQUE KEY uk_crm_customer_code (tenant_id, customer_code),
  KEY idx_crm_customer_owner (tenant_id, owner_id),
  KEY idx_crm_customer_health (tenant_id, health_level),
  KEY idx_crm_customer_name (tenant_id, customer_name),
  KEY idx_crm_customer_pool (tenant_id, pool_flag, last_follow_up_time),
  KEY idx_crm_customer_territory (tenant_id, territory_id),
  KEY idx_crm_customer_segment (tenant_id, market_segment),
  KEY idx_crm_customer_campaign (tenant_id, campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CRM客户表';
```

### 4.3 商机：营销来源与主要竞对

```sql
DROP TABLE IF EXISTS crm_opportunity;
CREATE TABLE crm_opportunity (
  opportunity_id     BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '商机ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  customer_id        BIGINT(20)      NOT NULL COMMENT '客户ID',
  customer_name      VARCHAR(120)    DEFAULT NULL COMMENT '客户名称快照',
  opportunity_name   VARCHAR(120)    NOT NULL COMMENT '商机名称',
  stage              VARCHAR(30)     DEFAULT 'LEAD' COMMENT '商机阶段(LEAD/QUALIFIED/PROPOSAL/NEGOTIATION/WON/LOST)',
  source             VARCHAR(30)     DEFAULT NULL COMMENT '商机来源(CHANNEL/CUSTOMER_SUCCESS)',
  expected_amount    DECIMAL(16,2)   DEFAULT 0.00 COMMENT '预计金额',
  win_rate           DECIMAL(5,2)    DEFAULT 0.00 COMMENT '赢单率',
  expected_sign_date DATE            DEFAULT NULL COMMENT '预计签约日期',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name         VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  dept_id            BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name          VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  contact_id         BIGINT(20)      DEFAULT NULL COMMENT '主联系人ID',
  contact_name       VARCHAR(64)     DEFAULT NULL COMMENT '主联系人姓名',
  latest_follow_up_time DATETIME     DEFAULT NULL COMMENT '最近跟进时间',
  stage_changed_time DATETIME        DEFAULT NULL COMMENT '阶段更新时间',
  lost_reason        VARCHAR(500)    DEFAULT NULL COMMENT '丢单其他说明',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  status             VARCHAR(20)     DEFAULT 'OPEN' COMMENT '状态(OPEN/CLOSED)',
  campaign_id        BIGINT(20)      DEFAULT NULL COMMENT '来源营销活动ID',
  competitor_id      BIGINT(20)      DEFAULT NULL COMMENT '主要竞争对手ID，赢单时用于竞对胜负统计',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (opportunity_id),
  KEY idx_crm_opportunity_customer (tenant_id, customer_id),
  KEY idx_crm_opportunity_stage (tenant_id, stage),
  KEY idx_crm_opportunity_owner (tenant_id, owner_id),
  KEY idx_crm_opportunity_campaign (tenant_id, campaign_id, stage),
  KEY idx_crm_opportunity_competitor (tenant_id, competitor_id, stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CRM商机表';
```

### 4.4 工单：新增 11 列并统一优先级

```sql
DROP TABLE IF EXISTS crm_service_ticket;
CREATE TABLE crm_service_ticket (
  ticket_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '工单ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  customer_id        BIGINT(20)      NOT NULL COMMENT '客户ID',
  customer_name      VARCHAR(120)    DEFAULT NULL COMMENT '客户名称快照',
  ticket_no          VARCHAR(50)     NOT NULL COMMENT '工单编号',
  ticket_title       VARCHAR(120)    NOT NULL COMMENT '工单标题',
  severity           VARCHAR(20)     DEFAULT 'P4' COMMENT '工单优先级(P1/P2/P3/P4)',
  issue_type         VARCHAR(30)     DEFAULT 'OTHER' COMMENT '问题类型(OTHER/PRODUCT/SERVICE)',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name         VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  opened_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  resolved_time      DATETIME        DEFAULT NULL COMMENT '解决时间',
  due_time           DATETIME        DEFAULT NULL COMMENT '由SLA计算的到期时间',
  description        VARCHAR(1000)   DEFAULT NULL COMMENT '问题描述',
  solution           VARCHAR(1000)   DEFAULT NULL COMMENT '解决方案',
  attachment_url     VARCHAR(1000)   DEFAULT NULL COMMENT '附件地址',
  status             VARCHAR(20)     DEFAULT 'OPEN' COMMENT '工单状态(OPEN/IN_PROGRESS/WAITING_CUSTOMER/RESOLVED/CLOSED)',
  sla_policy_id      BIGINT(20)      DEFAULT NULL COMMENT '匹配的SLA策略ID',
  first_response_due DATETIME        DEFAULT NULL COMMENT '首次响应到期时间',
  resolution_due     DATETIME        DEFAULT NULL COMMENT '解决到期时间',
  first_response_time DATETIME       DEFAULT NULL COMMENT '实际首次响应时间',
  first_response_minutes INT        DEFAULT NULL COMMENT '实际响应用时(按策略口径累计的分钟)',
  resolution_minutes INT            DEFAULT NULL COMMENT '实际解决用时(按策略口径累计的分钟)',
  sla_paused_minutes INT            NOT NULL DEFAULT 0 COMMENT '累计暂停分钟',
  pause_start_time   DATETIME        DEFAULT NULL COMMENT '当前暂停开始时间，未暂停时为空',
  sla_status         VARCHAR(30)     NOT NULL DEFAULT 'NOT_APPLICABLE' COMMENT 'SLA状态(NOT_APPLICABLE/ONGOING/PAUSED/RESPONSE_BREACHED/RESOLUTION_BREACHED/FULFILLED)',
  response_breached_flag TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '是否首次响应违约',
  resolution_breached_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否解决违约',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (ticket_id),
  UNIQUE KEY uk_crm_ticket_no (tenant_id, ticket_no),
  KEY idx_crm_ticket_customer (tenant_id, customer_id),
  KEY idx_crm_ticket_status (tenant_id, status),
  KEY idx_crm_ticket_severity (tenant_id, severity),
  KEY idx_crm_ticket_sla_policy (tenant_id, sla_policy_id),
  KEY idx_crm_ticket_response_due (tenant_id, sla_status, response_breached_flag, first_response_due),
  KEY idx_crm_ticket_resolution_due (tenant_id, sla_status, resolution_breached_flag, resolution_due)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CRM服务工单表';
```

## 5. 内置任务与实施计划

### 5.1 五个任务全部登记到统一任务中心

`sys_job` = 批次 A 已实现的统一任务配置表。使用既有任务注册、执行和回报机制，`service_name=crm`、`concurrent_flag=0`；`@Scheduled` = 代码自行声明定时执行的方式，本批不新增。下表配置已写入种子并登记运行库，E5-b 聚合任务保持暂停。

| 任务标识 | 触发类型 | 时间配置 | 本批启用状态 |
| --- | --- | --- | --- |
| `crmActivityReminder` | `FIXED_RATE` | `interval_ms=300000`，每 5 分钟 | `ENABLED` |
| `crmActivityOverdue` | `CRON` | `0 0 6 * * *`，每日 06:00 | `ENABLED` |
| `crmSlaBreachScan` | `FIXED_RATE` | `interval_ms=600000`，每 10 分钟 | `ENABLED` |
| `crmCampaignRevenueRecalc` | `CRON` | `0 0 4 * * *`，每日 04:00 | `ENABLED` |
| `crmCampaignCountAggregate` | `CRON` | `0 30 4 * * *`，每日 04:30 | `PAUSED`，E5-b 解阻后启用 |

每日时间以部署统一时区 `Asia/Shanghai` 解释，实施时核实 A 的调度器配置；不得在 `sys_job` 中虚构时区字段。旧工单提醒 `ticketSlaDispatch` 改造现有实现，读取真实 SLA 字段；不另建平行提醒实现。E5-a 的业务转化计数随收入重算刷新，不依赖暂停中的邮件效果任务。

### 5.2 M1–M4：活动和服务时限

| 阶段 | 实施范围 | 阶段验收与依赖 |
| --- | --- | --- |
| M1 | E1 三表的活动管理、参与人、客户/线索/商机/工单/合同/报价挂载；共同状态字典和权限 | 状态五值及接受状态四值与 E/H4 一致；校验租户和业务对象权限；依赖批次 A |
| M2 | 提醒、改期取消、日历视图、我的活动与团队视图、客户六类时间线 | 改期取消旧提醒，不重复投递；六类数据合并排序并按权限过滤；依赖 M1、A 消息和任务中心 |
| M3 | E2 三表配置、策略匹配、优先级映射、字典内置回退、工作日历计时与试算 | 跨午休、下班、周末、节假日计算正确；日历故障告警；依赖 A4 |
| M4 | 首次响应、暂停恢复、优先级变更重算、履约和违约判定、改造现有提醒与达成率报表 | 已耗时不重置，重复事件不双算，服务重启不丢暂停；依赖 M3 |

### 5.3 M5–M8：丢单、信用、线索经营

| 阶段 | 实施范围 | 阶段验收与依赖 |
| --- | --- | --- |
| M5 | E3 四表的基础管理、结构化丢单、赢单竞对关联、丢单和竞对图表 | 至少一个原因且只有一个主因；竞对商机计数去重；图表复用 A 的 LC-05 |
| M6 | 信用额度审批、生效、占用与超期金额、规则中心三个校验点、例外放行审计 | 报价提交、报价转合同草稿、客户工作台建合同草稿均校验；BLOCK/WARN/PASS 走既有规则中心；依赖 M5 |
| M7 | E4 两表、线索和客户画像、人工资质判定、区域树 | 资质动作正确；区域不能自指或成环，层级不超过 5；新增字段完整可维护 |
| M8 | 评分规则、单条/批量重算、线索转客户和商机的字段映射 | 评分不代替人工判定；区域、画像、营销来源和退订信息传递完整；依赖 M7 |

### 5.4 M9–M10：营销闭环，邮件阶段保持阻塞

| 阶段 | 实施范围 | 阶段验收与依赖 |
| --- | --- | --- |
| M9 | E5-a 四表、手工/条件名单、包含与排除、营销来源、归因窗口、收入及效果报表 | 扣除退订与无邮箱对象；重复重算结果一致，不翻倍；名单条件使用 M8 分层字段 |
| M10 | E5-b 实际邮件群发、打开/点击追踪和退订 | 继续阻塞，等待邮件渠道和追踪域名确认；本批仅预建两表、注册暂停任务并提供明确未实现返回，不计作功能已完成 |

十八张新表可在 DDL 确认后统一加入初始化脚本，各阶段完成对应业务功能。每阶段先核对接口、权限和数据一致性，再运行相应测试；本批菜单范围为 1550–1649，写入前必须受控连接运行库核查冲突。修改 `06` 后用既有生成脚本重建 `07`，不手改演示种子。

## 6. 确认范围与验证状态

结构检查已通过：22 份完整建表定义包含 18 张新增表和 4 张替换表，共核对 468 列、79 个非主键索引；列注释、主键、索引引用、金额精度、分钟单位、活动状态、字段增量及原字段保留均已核查。原 `04`、`05`、`06` 文件的 SHA-256 摘要与准备前一致。此检查不等同于数据库实际执行验收。

- 本轮交付：十八张新增表、四张现有表完整替换定义、优先级映射、五项任务注册方案、M1–M10 分阶段计划；实际只新增本确认文档。
- 确认后实施：以用户批准的新表数和字段口径同步更新正式 SQL、种子及相关设计汇总；补齐租户权限、业务规则、消息去重和前后端功能。六类时间线直接查询合并，不新增 `crm_trace_event` 或额外缓存。
- 验证进展：用户已确认 DDL 并授权实施；独立空库 287 张表、运行库 E 增量部署和相关服务启动均已验证。运行库当前 272 张，差额为未部署的 15 张 HR 表，详情及备份位置见实施验收记录。
