-- =========================================================
-- CloudFlow Pro - OA办公模块数据库脚本
-- 模块：公告、日程、会议室、任务协作、资产、车辆、访客、值班管理
-- 版本：v1.0
-- 创建日期：2026-02-09
-- =========================================================

DROP TABLE IF EXISTS oa_supplier_quotation_item;
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

DROP TABLE IF EXISTS oa_supplier_quotation;
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

DROP TABLE IF EXISTS oa_purchase_rfq_supplier;
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
  invite_delivery_status       VARCHAR(20)     DEFAULT NULL COMMENT 'EMAIL邀请的QUEUED或SENT或FAILED或UNKNOWN，线下为空',
  invite_message_record_id     BIGINT(20)      DEFAULT NULL COMMENT '邮件邀请统一消息记录ID',
  invite_sent_time             DATETIME        DEFAULT NULL COMMENT 'SMTP或提供商实际接纳邀请时间',
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

DROP TABLE IF EXISTS oa_purchase_rfq_item;
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

DROP TABLE IF EXISTS oa_purchase_rfq;
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

DROP TABLE IF EXISTS oa_contract_template_term;
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

DROP TABLE IF EXISTS oa_contract_fulfilment_term;
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

DROP TABLE IF EXISTS oa_project_template_task;
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

DROP TABLE IF EXISTS oa_project_template;
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

DROP TABLE IF EXISTS oa_project_task;
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

DROP TABLE IF EXISTS oa_timesheet_detail;
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

DROP TABLE IF EXISTS oa_timesheet;
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

DROP TABLE IF EXISTS oa_activity_cost;
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

DROP TABLE IF EXISTS oa_activity_type;
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

DROP TABLE IF EXISTS oa_supplier_qualification_reminder_log;
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

DROP TABLE IF EXISTS oa_supplier_score_criteria;
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

DROP TABLE IF EXISTS oa_supplier_scorecard;
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

DROP TABLE IF EXISTS oa_supplier_qualification;
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

DROP TABLE IF EXISTS oa_supplier_category;
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

DROP TABLE IF EXISTS oa_asset_movement;
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

DROP TABLE IF EXISTS oa_asset_repair;
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

DROP TABLE IF EXISTS oa_asset_maintenance_task;
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

DROP TABLE IF EXISTS oa_asset_maintenance_plan;
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

DROP TABLE IF EXISTS oa_asset_depreciation_schedule;
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

DROP TABLE IF EXISTS oa_asset_category;
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

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 说明：本文件仅保留表结构与约束，初始化/演示种子数据已统一迁移至 06.cloudflow-business-seed.sql。

-- =========================================================
-- 一、公告与通知模块
-- =========================================================

-- 1. 系统公告表
DROP TABLE IF EXISTS oa_announcement;
CREATE TABLE oa_announcement (
  announcement_id   BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '公告ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  title             VARCHAR(255)    NOT NULL COMMENT '公告标题',
  content           LONGTEXT        COMMENT '公告内容(HTML)',
  type              CHAR(1)         DEFAULT '1' COMMENT '类型 (1:通知, 2:公告, 3:紧急)',
  scope_type        VARCHAR(20)     DEFAULT 'ALL' COMMENT '发布范围 (ALL, DEPT, ROLE)',
  scope_value       VARCHAR(255)    DEFAULT NULL COMMENT '范围值',
  status            CHAR(1)         DEFAULT '0' COMMENT '状态 (0:草稿, 1:已发布, 2:已撤销)',
  priority          CHAR(1)         DEFAULT 'M' COMMENT '优先级 (L:低, M:中, H:高)',
  is_top            INT(11)         DEFAULT 0 COMMENT '是否置顶 (0:否, 1:是)',
  sender_id         BIGINT(20)      DEFAULT NULL COMMENT '发布人ID',
  publish_time      DATETIME        DEFAULT NULL COMMENT '发布时间',
  expire_time       DATETIME        DEFAULT NULL COMMENT '过期时间(NULL表示永不过期)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (announcement_id),
  KEY idx_announcement_tenant (tenant_id),
  KEY idx_announcement_status (status, is_top, priority)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='系统公告表';

-- 2. 公告阅读记录表
DROP TABLE IF EXISTS oa_announcement_read;
CREATE TABLE oa_announcement_read (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  announcement_id   BIGINT(20)      NOT NULL COMMENT '公告ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  read_time         DATETIME        DEFAULT NULL COMMENT '阅读时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_announcement_read_tenant (tenant_id, announcement_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公告阅读记录表';

-- =========================================================
-- 二、日程与会议室模块
-- =========================================================

-- 3. 会议室资源表
DROP TABLE IF EXISTS oa_meeting_room;
CREATE TABLE oa_meeting_room (
  room_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '会议室ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  name              VARCHAR(64)     NOT NULL COMMENT '会议室名称',
  capacity          INT(11)         DEFAULT NULL COMMENT '容量',
  location          VARCHAR(255)    DEFAULT NULL COMMENT '位置',
  equipment         VARCHAR(500)    DEFAULT NULL COMMENT '设备设施(JSON)',
  equipment_tags    JSON            DEFAULT NULL COMMENT '设备标签，原equipment文字字段保留',
  open_time         TIME            DEFAULT NULL COMMENT '每日可预约开始时间，成对为空时不限制',
  close_time        TIME            DEFAULT NULL COMMENT '每日可预约结束时间，成对为空时不限制',
  bookable_weekdays JSON            DEFAULT NULL COMMENT '可预约星期一至七，空为每日',
  holiday_calendar_id BIGINT(20)    DEFAULT NULL COMMENT '绑定公共节假日日历ID',
  holiday_bookable_flag TINYINT(1)  NOT NULL DEFAULT 1 COMMENT '法定节假日是否可预约',
  min_booking_minutes INT          NOT NULL DEFAULT 1 COMMENT '最短预约分钟数',
  max_booking_minutes INT          DEFAULT NULL COMMENT '最长预约分钟数，空保留原有未配置状态',
  advance_booking_days INT         DEFAULT NULL COMMENT '最多提前天数，空保留原有未配置状态',
  need_approval_flag TINYINT(1)     NOT NULL DEFAULT 0 COMMENT '预约是否需要审批',
  approver_id       BIGINT(20)      DEFAULT NULL COMMENT '预约审批人用户ID',
  buffer_minutes    INT            NOT NULL DEFAULT 0 COMMENT '会议结束后必须留出的间隔分钟数',
  photo_file_id     BIGINT(20)      DEFAULT NULL COMMENT '会议室照片私有文件ID',
  status            CHAR(1)         DEFAULT '1' COMMENT '状态 (1:可用, 0:维护中)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (room_id),
  KEY idx_meeting_room_tenant (tenant_id),
  CONSTRAINT chk_meeting_room_window CHECK ((open_time IS NULL AND close_time IS NULL) OR (open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time)),
  CONSTRAINT chk_meeting_room_limits CHECK (min_booking_minutes > 0 AND (max_booking_minutes IS NULL OR max_booking_minutes >= min_booking_minutes) AND (advance_booking_days IS NULL OR advance_booking_days >= 0) AND buffer_minutes >= 0),
  CONSTRAINT chk_meeting_room_approver CHECK (need_approval_flag = 0 OR approver_id IS NOT NULL)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COMMENT='会议室资源表';

-- 4. 日程事件表
DROP TABLE IF EXISTS oa_schedule_event;
CREATE TABLE oa_schedule_event (
  event_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '事件ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  title             VARCHAR(255)    NOT NULL COMMENT '日程主题',
  description       TEXT            COMMENT '描述',
  start_time        DATETIME        NOT NULL COMMENT '开始时间',
  end_time          DATETIME        NOT NULL COMMENT '结束时间',
  is_all_day        TINYINT(1)      DEFAULT 0 COMMENT '是否全天',
  type              VARCHAR(20)     DEFAULT 'PERSONAL' COMMENT '类型 (MEETING, PERSONAL, WORK)',
  room_id           BIGINT(20)      DEFAULT NULL COMMENT '关联会议室ID',
  creator_id        BIGINT(20)      NOT NULL COMMENT '创建人ID',
  attendees         VARCHAR(1000)   DEFAULT NULL COMMENT '参与人ID列表(JSON)',
  join_url          VARCHAR(1000)   DEFAULT NULL COMMENT '会议HTTPS链接，仅显示不由服务器请求',
  meeting_platform  VARCHAR(30)     DEFAULT NULL COMMENT '会议平台，与CRM枚举对齐',
  reminders         JSON            DEFAULT NULL COMMENT '提前分钟数及渠道配置，发送事实在提醒表',
  recurrence_rule   VARCHAR(1000)   DEFAULT NULL COMMENT 'RFC5545 RRULE，仅周期主记录填写',
  recurrence_end_date DATE          DEFAULT NULL COMMENT '周期展开上限日期',
  recurrence_role   VARCHAR(20)     NOT NULL DEFAULT 'SINGLE' COMMENT 'SINGLE或SERIES或INSTANCE',
  parent_event_id   BIGINT(20)      DEFAULT NULL COMMENT '周期主记录ID',
  original_start_time DATETIME      DEFAULT NULL COMMENT '周期原定开始时间，独立改期不改此值',
  recurrence_exception_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '实例已独立编辑或取消，不被整系列重算覆盖',
  source_series_version INT         DEFAULT NULL COMMENT '实例采用的周期主记录版本',
  timezone_id       VARCHAR(64)     NOT NULL DEFAULT 'Asia/Shanghai' COMMENT '周期展开时区',
  status            VARCHAR(20)     NOT NULL DEFAULT 'PLANNED' COMMENT 'PLANNED或IN_PROGRESS或COMPLETED或CANCELLED或NOT_HELD',
  approval_status   VARCHAR(20)     NOT NULL DEFAULT 'NOT_REQUIRED' COMMENT 'NOT_REQUIRED或DRAFT或PENDING或APPROVED或REJECTED或CANCELLED',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '预约审批实例ID',
  expected_attendees INT           NOT NULL DEFAULT 1 COMMENT '预计参会人数',
  buffer_minutes_snapshot INT      NOT NULL DEFAULT 0 COMMENT '预约时核定的会议后间隔分钟数',
  schedule_version  INT            NOT NULL DEFAULT 0 COMMENT '邀请及提醒版本，改期或参会人变化时增加',
  version           INT            NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  PRIMARY KEY (event_id),
  KEY idx_creator (creator_id),
  KEY idx_room_time (room_id, start_time, end_time),
  KEY idx_schedule_tenant (tenant_id),
  UNIQUE KEY uk_meeting_occurrence (tenant_id, parent_event_id, original_start_time),
  KEY idx_schedule_room_window (tenant_id, room_id, status, start_time, end_time),
  CONSTRAINT chk_schedule_status CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED','NOT_HELD')),
  CONSTRAINT chk_schedule_recurrence CHECK ((recurrence_role = 'INSTANCE' AND parent_event_id IS NOT NULL AND original_start_time IS NOT NULL) OR (recurrence_role IN ('SINGLE','SERIES') AND parent_event_id IS NULL))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='日程事件表';

-- =========================================================
-- 三、任务协作模块
-- =========================================================

-- 5. 协作任务表
DROP TABLE IF EXISTS oa_work_task;
CREATE TABLE oa_work_task (
  task_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '任务ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  title             VARCHAR(255)    NOT NULL COMMENT '任务标题',
  description       TEXT            COMMENT '任务描述',
  assignee_id       BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_id          BIGINT(20)      DEFAULT NULL COMMENT '创建人ID',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  project_id        BIGINT(20)      DEFAULT NULL COMMENT '项目ID',
  milestone_id      BIGINT(20)      DEFAULT NULL COMMENT '里程碑ID',
  wbs_code          VARCHAR(50)     DEFAULT NULL COMMENT 'WBS编码',
  priority          INT(4)          DEFAULT 1 COMMENT '优先级 (0:低, 1:中, 2:高)',
  status            VARCHAR(20)     DEFAULT 'TODO' COMMENT '状态 (TODO, DOING, DONE)',
  due_date          DATETIME        DEFAULT NULL COMMENT '截止时间',
  planned_start_time DATETIME       DEFAULT NULL COMMENT '计划开始时间',
  planned_end_time  DATETIME        DEFAULT NULL COMMENT '计划结束时间',
  baseline_start_time DATETIME      DEFAULT NULL COMMENT '基线开始时间',
  baseline_end_time DATETIME        DEFAULT NULL COMMENT '基线结束时间',
  actual_start_time DATETIME        DEFAULT NULL COMMENT '实际开始时间',
  actual_end_time   DATETIME        DEFAULT NULL COMMENT '实际结束时间',
  progress          DECIMAL(5,2)    DEFAULT 0.00 COMMENT '进度百分比',
  estimated_hours   DECIMAL(10,2)   DEFAULT 0.00 COMMENT '预估工时',
  actual_hours      DECIMAL(10,2)   DEFAULT 0.00 COMMENT '实际工时',
  tags              VARCHAR(500)    DEFAULT NULL COMMENT '标签 (JSON数组)',
  parent_id         BIGINT(20)      DEFAULT NULL COMMENT '父任务ID',
  sort_order        INT(11)         DEFAULT 0 COMMENT '排序',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (task_id),
  KEY idx_assignee (assignee_id),
  KEY idx_owner (owner_id),
  KEY idx_work_task_dept (dept_id),
  KEY idx_work_task_project (project_id),
  KEY idx_work_task_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='协作任务表';

-- =========================================================
-- 五、资产管理模块
-- =========================================================

-- 8. 固定资产表
DROP TABLE IF EXISTS oa_asset;
CREATE TABLE oa_asset (
  asset_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '资产ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  asset_code        VARCHAR(50)     NOT NULL COMMENT '资产编码',
  name              VARCHAR(100)    NOT NULL COMMENT '资产名称',
  model             VARCHAR(100)    DEFAULT NULL COMMENT '规格型号',
  status VARCHAR(20) NOT NULL DEFAULT 'IDLE' COMMENT '状态(IN_USE在用/IDLE闲置/MAINTENANCE维修/SCRAPPED报废/DISPOSED处置/LOST丢失)',
  purchase_amount DECIMAL(10,2) DEFAULT NULL COMMENT '资产购入原值',
  purchase_date     DATE            DEFAULT NULL COMMENT '采购日期',
  owner_id          BIGINT(20)      DEFAULT NULL COMMENT '当前领用人ID',
  location          VARCHAR(100)    DEFAULT NULL COMMENT '存放位置',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  category_id BIGINT(20) DEFAULT NULL COMMENT '资产分类ID',
  custodian_id BIGINT(20) DEFAULT NULL COMMENT '资产保管责任人ID',
  custodian_name VARCHAR(64) DEFAULT NULL COMMENT '资产保管责任人姓名',
  dept_id BIGINT(20) DEFAULT NULL COMMENT '归属部门ID',
  dept_name VARCHAR(64) DEFAULT NULL COMMENT '归属部门名称',
  location_detail VARCHAR(500) DEFAULT NULL COMMENT '存放位置详情',
  salvage_value DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '资产残值',
  useful_life_months INT(11) DEFAULT NULL COMMENT '使用寿命(月)',
  available_from_date DATE DEFAULT NULL COMMENT '可用日期及折旧起算日',
  disposal_date DATE DEFAULT NULL COMMENT '资产处置日期',
  depreciation_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否计提折旧(0否1是)',
  depreciation_method VARCHAR(30) DEFAULT 'STRAIGHT_LINE' COMMENT '折旧方法(STRAIGHT_LINE/DOUBLE_DECLINING/SUM_OF_YEARS)',
  depreciation_frequency VARCHAR(20) DEFAULT 'MONTHLY' COMMENT '折旧频率(MONTHLY/QUARTERLY/YEARLY)',
  opening_accumulated_depreciation DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '期初累计折旧金额',
  accumulated_depreciation DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '累计折旧金额(含期初)',
  net_book_value DECIMAL(10,2) DEFAULT NULL COMMENT '资产账面净值',
  next_depreciation_date DATE DEFAULT NULL COMMENT '下次折旧日期',
  depreciation_completed_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '折旧是否完成(0否1是)',
  insurance_policy_no VARCHAR(100) DEFAULT NULL COMMENT '保险保单号',
  insurer_name VARCHAR(200) DEFAULT NULL COMMENT '保险机构名称',
  insured_value DECIMAL(10,2) DEFAULT NULL COMMENT '保险金额',
  insurance_start_date DATE DEFAULT NULL COMMENT '保险开始日期',
  insurance_end_date DATE DEFAULT NULL COMMENT '保险结束日期',
  insurance_reminder_days INT(11) NOT NULL DEFAULT 30 COMMENT '保险提前提醒自然日数',
  maintenance_required_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否需要维保(0否1是)',
  warranty_expire_date DATE DEFAULT NULL COMMENT '保修到期日期',
  PRIMARY KEY (asset_id),
  UNIQUE KEY uk_asset_code_tenant (asset_code, tenant_id),
  KEY idx_asset_category (tenant_id, category_id, deleted),
  KEY idx_asset_custodian (tenant_id, custodian_id, deleted),
  KEY idx_asset_depreciation_scan (tenant_id, depreciation_flag, depreciation_completed_flag, deleted, next_depreciation_date),
  KEY idx_asset_insurance_expiry (tenant_id, deleted, insurance_end_date),
  KEY idx_asset_warranty_expiry (tenant_id, deleted, warranty_expire_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='固定资产表';

-- 9. 耗材库存表
DROP TABLE IF EXISTS oa_consumable;
CREATE TABLE oa_consumable (
  consumable_id     BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '耗材ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  name              VARCHAR(100)    NOT NULL COMMENT '耗材名称',
  model             VARCHAR(100)    DEFAULT NULL COMMENT '规格型号',
  unit              VARCHAR(20)     NOT NULL DEFAULT '个' COMMENT '计量单位已有业务引用后禁止修改',
  quantity          INT(11)         NOT NULL DEFAULT 0 COMMENT '由耗材台账重算的物化库存数量',
  low_stock_threshold INT(11)       NOT NULL DEFAULT 10 COMMENT '低库存预警阈值达到阈值也预警',
  default_supplier_id BIGINT(20)    DEFAULT NULL COMMENT '默认供应商ID',
  target_stock      INT(11)         NOT NULL DEFAULT 0 COMMENT '补货目标库存0表示未设置目标',
  warn_enabled      TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '库存预警开关1启用0停用',
  category_id       BIGINT(20)      DEFAULT NULL COMMENT '同租户耗材分类字典编码',
  brand             VARCHAR(100)    DEFAULT NULL COMMENT '耗材品牌',
  max_stock         INT(11)         DEFAULT NULL COMMENT '建议库存上限为空表示未设置不自动阻止收货',
  avg_cost          DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '物化移动平均成本元每单位',
  stock_amount      DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '物化库存总成本元',
  last_purchase_price DECIMAL(10,2) DEFAULT NULL COMMENT '最近有效采购收货的计价单价元无采购时为空',
  storage_location  VARCHAR(100)    DEFAULT NULL COMMENT '存放说明不表示独立仓库或库位',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE可新领用/INACTIVE停用)',
  last_calc_time    DATETIME        DEFAULT NULL COMMENT '最近记账或重算时间',
  version           INT(11)         NOT NULL DEFAULT 0 COMMENT '并发更新乐观锁版本号',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (consumable_id),
  KEY idx_consumable_tenant (tenant_id),
  KEY idx_consumable_warning (tenant_id, deleted, status, warn_enabled, quantity),
  KEY idx_consumable_category (tenant_id, category_id, deleted, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材库存表';

DROP TABLE IF EXISTS oa_consumable_ledger;
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

DROP TABLE IF EXISTS oa_consumable_request;
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

DROP TABLE IF EXISTS oa_consumable_request_item;
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

-- 10. 供应商主数据表
DROP TABLE IF EXISTS oa_supplier;
CREATE TABLE oa_supplier (
  supplier_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '供应商ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  supplier_name     VARCHAR(100)    NOT NULL COMMENT '供应商名称',
  contact_name      VARCHAR(64)     DEFAULT NULL COMMENT '联系人',
  contact_phone     VARCHAR(30)     DEFAULT NULL COMMENT '联系电话',
  bank_name         VARCHAR(100)    DEFAULT NULL COMMENT '开户行',
  bank_account      VARCHAR(100)    DEFAULT NULL COMMENT '银行账号',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE启用/DISABLED停用)',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  supplier_code VARCHAR(50) DEFAULT NULL COMMENT '供应商编号',
  supplier_type VARCHAR(20) DEFAULT NULL COMMENT '供应商类型(MANUFACTURER/DEALER/SERVICE/INDIVIDUAL)',
  category_id BIGINT(20) DEFAULT NULL COMMENT '供应商分类ID',
  short_name VARCHAR(100) DEFAULT NULL COMMENT '供应商简称',
  credit_code VARCHAR(18) DEFAULT NULL COMMENT '统一社会信用代码',
  legal_person VARCHAR(64) DEFAULT NULL COMMENT '法定代表人',
  register_capital DECIMAL(14,2) DEFAULT NULL COMMENT '注册资本金额',
  register_date DATE DEFAULT NULL COMMENT '成立日期',
  business_scope TEXT COMMENT '经营范围',
  address VARCHAR(500) DEFAULT NULL COMMENT '供应商地址',
  province VARCHAR(100) DEFAULT NULL COMMENT '所在省份',
  city VARCHAR(100) DEFAULT NULL COMMENT '所在城市',
  contact_email VARCHAR(100) DEFAULT NULL COMMENT '联系邮箱',
  tax_no VARCHAR(50) DEFAULT NULL COMMENT '税号',
  tax_rate DECIMAL(6,4) DEFAULT NULL COMMENT '默认税率比例',
  payment_terms VARCHAR(50) DEFAULT NULL COMMENT '付款条件编码',
  currency VARCHAR(10) NOT NULL DEFAULT 'CNY' COMMENT '默认币种',
  cooperation_start_date DATE DEFAULT NULL COMMENT '合作开始日期',
  level_code VARCHAR(50) DEFAULT NULL COMMENT '供应商等级字典编码',
  score DECIMAL(5,2) DEFAULT NULL COMMENT '最近确认评分(0至100)',
  standing VARCHAR(20) DEFAULT NULL COMMENT '评级(EXCELLENT/QUALIFIED/WATCH/ELIMINATED)',
  indicator_color VARCHAR(10) DEFAULT NULL COMMENT '评级颜色(RED/YELLOW/GREEN)',
  last_score_time DATETIME DEFAULT NULL COMMENT '最近确认评分时间',
  blacklist_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否在黑名单(0否1是)',
  blacklist_reason VARCHAR(500) DEFAULT NULL COMMENT '拉黑原因',
  blacklist_by BIGINT(20) DEFAULT NULL COMMENT '拉黑人ID',
  blacklist_time DATETIME DEFAULT NULL COMMENT '拉黑时间',
  prevent_purchase_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否禁止采购(0否1是)',
  prevent_rfq_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否禁止询价(0否1是)',
  qualification_expire_date DATE DEFAULT NULL COMMENT '最早有效资质到期日期',
  instance_id VARCHAR(64) DEFAULT NULL COMMENT '准入审批流程实例ID',
  bypass_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用例外放行(0否1是)',
  bypass_reason VARCHAR(500) DEFAULT NULL COMMENT '例外放行原因',
  bypass_by BIGINT(20) DEFAULT NULL COMMENT '例外放行人ID',
  bypass_expire_date DATE DEFAULT NULL COMMENT '例外放行截止日期',
  PRIMARY KEY (supplier_id),
  KEY idx_supplier_tenant (tenant_id),
  KEY idx_supplier_status (status),
  UNIQUE KEY uk_supplier_code (tenant_id, supplier_code),
  UNIQUE KEY uk_supplier_credit_code (tenant_id, credit_code),
  KEY idx_supplier_category (tenant_id, category_id, deleted),
  KEY idx_supplier_standing (tenant_id, standing, blacklist_flag, deleted),
  KEY idx_supplier_qualification_expiry (tenant_id, qualification_expire_date),
  KEY idx_supplier_admission_instance (tenant_id, instance_id),
  KEY idx_supplier_bypass_expiry (tenant_id, bypass_flag, bypass_expire_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商主数据表';

-- 10. 资产变动日志表
DROP TABLE IF EXISTS oa_asset_log;
CREATE TABLE oa_asset_log (
  log_id            BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  ref_id            BIGINT(20)      NOT NULL COMMENT '关联ID(资产或耗材)',
  ref_type          CHAR(1)         NOT NULL COMMENT '关联类型(1固定资产 2耗材)',
  type              VARCHAR(20)     NOT NULL COMMENT '操作类型(领用/归还/入库/出库/盘点)',
  quantity_change   INT(11)         DEFAULT 0 COMMENT '数量变动',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  target_id         BIGINT(20)      DEFAULT NULL COMMENT '领用人/归还人ID',
  remark            VARCHAR(255)    DEFAULT NULL COMMENT '备注',
  create_time       DATETIME        DEFAULT NULL COMMENT '操作时间',
  PRIMARY KEY (log_id),
  KEY idx_log_ref (ref_id, ref_type),
  KEY idx_asset_log_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产变动日志表';

-- =========================================================
-- 六、车辆管理模块
-- =========================================================

-- 11. 车辆信息表
DROP TABLE IF EXISTS oa_vehicle;
CREATE TABLE oa_vehicle (
  vehicle_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '车辆ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  license_plate     VARCHAR(20)     NOT NULL COMMENT '车牌号',
  brand             VARCHAR(50)     DEFAULT NULL COMMENT '品牌',
  model             VARCHAR(50)     DEFAULT NULL COMMENT '型号',
  color             VARCHAR(20)     DEFAULT NULL COMMENT '颜色',
  capacity          INT(11)         DEFAULT NULL COMMENT '载客量',
  status            CHAR(1)         DEFAULT '1' COMMENT '状态（1可用 2已预约 3使用中 4维修中 5报废）',
  mileage           DECIMAL(10,2)   DEFAULT 0.00 COMMENT '当前里程(km)',
  purchase_date     DATE            DEFAULT NULL COMMENT '购买日期',
  insurance_expiry  DATE            DEFAULT NULL COMMENT '保险到期日',
  annual_inspection_expiry DATE     DEFAULT NULL COMMENT '年检到期日',
  maintenance_cycle_km DECIMAL(10,2) DEFAULT NULL COMMENT '保养周期里程(km)',
  next_maintenance_mileage DECIMAL(10,2) DEFAULT NULL COMMENT '下次保养里程(km)',
  manager_user_id   BIGINT(20)      DEFAULT NULL COMMENT '车辆管理员用户ID',
  location          VARCHAR(100)    DEFAULT NULL COMMENT '停放位置',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (vehicle_id),
  KEY idx_vehicle_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='车辆信息表';

-- 12. 用车申请与记录表
DROP TABLE IF EXISTS oa_vehicle_usage;
CREATE TABLE oa_vehicle_usage (
  usage_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '用车记录ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  vehicle_id        BIGINT(20)      NOT NULL COMMENT '车辆ID',
  applicant_id      BIGINT(20)      NOT NULL COMMENT '申请人ID',
  driver_id         BIGINT(20)      DEFAULT NULL COMMENT '司机ID',
  driver_mode       TINYINT(1)      DEFAULT 0 COMMENT '司机模式(0自驾 1派司机)',
  start_time        DATETIME        NOT NULL COMMENT '预计开始时间',
  end_time          DATETIME        NOT NULL COMMENT '预计结束时间',
  destination       VARCHAR(200)    NOT NULL COMMENT '目的地',
  return_location   VARCHAR(200)    DEFAULT NULL COMMENT '还车地点',
  is_round_trip     TINYINT(1)      DEFAULT 0 COMMENT '是否往返(0单程 1往返)',
  reason            VARCHAR(500)    NOT NULL COMMENT '用车事由',
  passenger_count   INT(11)         DEFAULT 1 COMMENT '随行人数',
  passengers        VARCHAR(500)    DEFAULT NULL COMMENT '随行人员名单',
  start_mileage     DECIMAL(10,2)   DEFAULT NULL COMMENT '起始里程',
  end_mileage       DECIMAL(10,2)   DEFAULT NULL COMMENT '结束里程',
  actual_start_time DATETIME        DEFAULT NULL COMMENT '实际开始时间',
  actual_end_time   DATETIME        DEFAULT NULL COMMENT '实际结束时间',
  dispatch_time     DATETIME        DEFAULT NULL COMMENT '派车时间',
  dispatch_remark   VARCHAR(500)    DEFAULT NULL COMMENT '派车备注',
  return_remark     VARCHAR(500)    DEFAULT NULL COMMENT '归还备注',
  attachment_url    VARCHAR(500)    DEFAULT NULL COMMENT '附件URL(多个用逗号分隔)',
  status            CHAR(1)         DEFAULT '0' COMMENT '状态（0待审批 1已批准 2已驳回 3进行中 4已完成 5已取消）',
  process_instance_id VARCHAR(64)   DEFAULT NULL COMMENT '流程实例ID',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (usage_id),
  KEY idx_vehicle_usage_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='用车申请与记录表';

-- 13. 车辆费用记录表
DROP TABLE IF EXISTS oa_vehicle_expense;
CREATE TABLE oa_vehicle_expense (
  expense_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '费用ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  vehicle_id        BIGINT(20)      NOT NULL COMMENT '车辆ID',
  usage_id          BIGINT(20)      DEFAULT NULL COMMENT '关联用车记录ID',
  expense_type      VARCHAR(20)     NOT NULL COMMENT '费用类型（1油费 2过路费 3停车费 4维修保养 5保险 6其他）',
  amount            DECIMAL(10,2)   NOT NULL COMMENT '金额',
  expense_date      DATE            NOT NULL COMMENT '费用发生日期',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '费用说明',
  receipt_url       VARCHAR(1000)   DEFAULT NULL COMMENT '票据附件URL(多个用逗号分隔)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (expense_id),
  KEY idx_vehicle_expense_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='车辆费用记录表';

DROP TABLE IF EXISTS oa_vehicle_maintenance;
CREATE TABLE oa_vehicle_maintenance (
  maintenance_id    BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '维保记录ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  vehicle_id        BIGINT(20)      NOT NULL COMMENT '车辆ID',
  maintenance_type  VARCHAR(20)     NOT NULL COMMENT '维保类型(MAINTENANCE/REPAIR/INSPECTION)',
  status            VARCHAR(20)     DEFAULT 'OPEN' COMMENT '状态(OPEN处理中/DONE已完成)',
  title             VARCHAR(200)    NOT NULL COMMENT '标题',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '维保说明',
  provider_name     VARCHAR(100)    DEFAULT NULL COMMENT '服务商名称',
  cost_amount       DECIMAL(10,2)   DEFAULT 0.00 COMMENT '费用金额',
  maintenance_date  DATE            DEFAULT NULL COMMENT '维保日期',
  next_maintenance_date DATE        DEFAULT NULL COMMENT '下次保养日期',
  mileage_at_service DECIMAL(10,2)  DEFAULT NULL COMMENT '维保时里程',
  next_maintenance_mileage DECIMAL(10,2) DEFAULT NULL COMMENT '下次保养里程',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '附件URL',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (maintenance_id),
  KEY idx_vehicle_maintenance_tenant (tenant_id),
  KEY idx_vehicle_maintenance_vehicle (vehicle_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='车辆维保记录表';

DROP TABLE IF EXISTS oa_vehicle_violation;
CREATE TABLE oa_vehicle_violation (
  violation_id      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '违章记录ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  vehicle_id        BIGINT(20)      NOT NULL COMMENT '车辆ID',
  usage_id          BIGINT(20)      DEFAULT NULL COMMENT '关联用车记录ID',
  driver_id         BIGINT(20)      DEFAULT NULL COMMENT '司机ID',
  violation_time    DATETIME        NOT NULL COMMENT '违章时间',
  violation_address VARCHAR(255)    DEFAULT NULL COMMENT '违章地点',
  violation_reason  VARCHAR(255)    NOT NULL COMMENT '违章原因',
  penalty_amount    DECIMAL(10,2)   DEFAULT 0.00 COMMENT '罚款金额',
  points            INT(11)         DEFAULT 0 COMMENT '扣分',
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT '状态(PENDING待处理/PROCESSING处理中/CLOSED已处理)',
  handled_time      DATETIME        DEFAULT NULL COMMENT '处理时间',
  handler_id        BIGINT(20)      DEFAULT NULL COMMENT '处理人ID',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '附件URL',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (violation_id),
  KEY idx_vehicle_violation_tenant (tenant_id),
  KEY idx_vehicle_violation_vehicle (vehicle_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='车辆违章记录表';

-- OA-P0-1 车辆油耗记录表
DROP TABLE IF EXISTS oa_vehicle_fuel_log;
CREATE TABLE oa_vehicle_fuel_log (
  fuel_log_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '油耗记录ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  vehicle_id        BIGINT(20)      NOT NULL COMMENT '车辆ID',
  fuel_date         DATE            NOT NULL COMMENT '加油日期',
  fuel_type         VARCHAR(20)     DEFAULT NULL COMMENT '燃料类型(汽油92/汽油95/汽油98/柴油/电)',
  liters            DECIMAL(10,2)   NOT NULL COMMENT '加油量(升)或电量(度)',
  unit_price        DECIMAL(10,4)   NOT NULL COMMENT '单价',
  total_amount      DECIMAL(10,2)   NOT NULL COMMENT '总金额',
  start_mileage     DECIMAL(10,2)   DEFAULT NULL COMMENT '加油前里程',
  end_mileage       DECIMAL(10,2)   DEFAULT NULL COMMENT '当前里程',
  drive_distance    DECIMAL(10,2)   DEFAULT NULL COMMENT '本次行驶里程(自动= end_mileage - 上次 end_mileage)',
  fuel_per_100km    DECIMAL(10,2)   DEFAULT NULL COMMENT '百公里油耗(自动= liters/distance×100)',
  station_name      VARCHAR(100)    DEFAULT NULL COMMENT '加油站',
  receipt_url       VARCHAR(1000)   DEFAULT NULL COMMENT '票据/附件',
  driver_id         BIGINT(20)      DEFAULT NULL COMMENT '司机ID',
  driver_name       VARCHAR(50)     DEFAULT NULL COMMENT '司机姓名',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  PRIMARY KEY (fuel_log_id),
  KEY idx_vehicle_fuel_vehicle_date (vehicle_id, fuel_date),
  KEY idx_vehicle_fuel_tenant (tenant_id, fuel_date)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='车辆油耗记录表';

-- =========================================================
-- 七、业务表（与工作流关联，OA 范围）
-- =========================================================

-- 14. OA知识库文档表
DROP TABLE IF EXISTS oa_knowledge_document;
CREATE TABLE oa_knowledge_document (
  document_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '文档ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  title             VARCHAR(255)    NOT NULL COMMENT '文档标题',
  category          VARCHAR(64)     NOT NULL COMMENT '文档分类',
  summary           VARCHAR(500)    DEFAULT NULL COMMENT '摘要',
  content           LONGTEXT        NOT NULL COMMENT '正文内容',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '附件URL(多个用逗号分隔)',
  scope_type        VARCHAR(20)     DEFAULT 'ALL' COMMENT '可见范围(ALL/DEPT/ROLE)',
  scope_value       VARCHAR(255)    DEFAULT NULL COMMENT '范围值',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT草稿/PENDING审批中/PUBLISHED已发布/REJECTED已驳回)',
  external_visible_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否明确对客户门户发布',
  external_version_id BIGINT(20) DEFAULT NULL COMMENT '明确发布的知识版本ID，工作草稿不可外显',
  external_attachment_file_ids JSON DEFAULT NULL COMMENT '明确对外公开的版本附件文件ID清单，未选择的不对外提供',
  submitter_id      BIGINT(20)      NOT NULL COMMENT '提交人ID',
  submitter_name    VARCHAR(64)     DEFAULT NULL COMMENT '提交人姓名',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '提交人部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '提交人部门名称',
  submit_time       DATETIME        DEFAULT NULL COMMENT '提交审批时间',
  publish_time      DATETIME        DEFAULT NULL COMMENT '发布时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (document_id),
  KEY idx_knowledge_tenant (tenant_id),
  KEY idx_knowledge_status (status),
  KEY idx_knowledge_submitter (submitter_id),
  KEY idx_knowledge_scope (scope_type, scope_value),
  KEY idx_knowledge_category (category)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='OA知识库文档表';

-- 15. OA知识库阅读记录表
DROP TABLE IF EXISTS oa_knowledge_read;
CREATE TABLE oa_knowledge_read (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  document_id       BIGINT(20)      NOT NULL COMMENT '文档ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '用户姓名',
  read_time         DATETIME        DEFAULT NULL COMMENT '阅读时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_knowledge_read_tenant (tenant_id, document_id, user_id),
  KEY idx_knowledge_read_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA知识库阅读记录表';

-- =========================================================
-- 八、费用报销与付款申请模块
-- =========================================================

-- 14. 报销申请表
DROP TABLE IF EXISTS biz_expense_claim;
CREATE TABLE biz_expense_claim (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '申请人ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  claim_no          VARCHAR(50)     NOT NULL COMMENT '报销单号',
  category          VARCHAR(20)     NOT NULL COMMENT '报销类别(TRAVEL差旅/OFFICE办公/ENTERTAIN招待/TRANSPORT交通/OTHER其他)',
  total_amount      DECIMAL(10,2)   DEFAULT 0.00 COMMENT '总金额',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '报销说明',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT草稿/PENDING审批中/APPROVED已通过/REJECTED已驳回/PAID已打款)',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  project_id        BIGINT(20)      DEFAULT NULL COMMENT '关联项目ID',
  project_name      VARCHAR(200)    DEFAULT NULL COMMENT '关联项目名称',
  customer_id       BIGINT(20)      DEFAULT NULL COMMENT '关联客户ID',
  customer_name     VARCHAR(200)    DEFAULT NULL COMMENT '关联客户名称',
  budget_subject_code VARCHAR(50)   DEFAULT NULL COMMENT '预算科目编码',
  budget_subject_name VARCHAR(100)  DEFAULT NULL COMMENT '预算科目名称',
  invoice_status    VARCHAR(20)     DEFAULT 'NONE' COMMENT '发票状态(NONE/REGISTERED/BOUND/WRITEOFF_PARTIAL/WRITEOFF_FULL)',
  exceeded_standard TINYINT(1)      DEFAULT 0 COMMENT 'OA-P0-3 是否超标(0否1是)',
  exceeded_amount   DECIMAL(12,2)   DEFAULT 0.00 COMMENT 'OA-P0-3 超标金额合计',
  exceeded_detail   JSON            DEFAULT NULL COMMENT 'OA-P0-3 超标明细[{itemId,category,amount,limitAmount}]',
  budget_exceeded   TINYINT(1)      DEFAULT 0 COMMENT 'OA-P0-2 是否触发预算特批(0否1是)',
  budget_exceeded_amount DECIMAL(12,2) DEFAULT 0.00 COMMENT 'OA-P0-2 超过预算的金额',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_expense_claim_tenant_no (tenant_id, claim_no),
  KEY idx_claim_user (user_id),
  KEY idx_claim_status (status),
  KEY idx_claim_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='报销申请表';

-- 15. 报销明细表
DROP TABLE IF EXISTS biz_expense_item;
CREATE TABLE biz_expense_item (
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  claim_id          BIGINT(20)      NOT NULL COMMENT '报销申请ID',
  expense_type      VARCHAR(20)     NOT NULL COMMENT '费用类型(MEAL餐费/HOTEL住宿/TRANSPORT交通/OFFICE办公用品/COMM通讯/OTHER其他)',
  amount            DECIMAL(10,2)   NOT NULL COMMENT '金额',
  expense_date      DATE            NOT NULL COMMENT '费用发生日期',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '费用说明',
  budget_subject_code VARCHAR(50)   DEFAULT NULL COMMENT '预算科目编码',
  budget_subject_name VARCHAR(100)  DEFAULT NULL COMMENT '预算科目名称',
  receipt_url       VARCHAR(1000)   DEFAULT NULL COMMENT '凭证附件URL(多个用逗号分隔)',
  vehicle_expense_id BIGINT(20)     DEFAULT NULL COMMENT '关联车辆费用ID',
  PRIMARY KEY (id),
  KEY idx_item_claim (claim_id),
  KEY idx_item_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='报销明细表';

-- 16. 付款申请表
DROP TABLE IF EXISTS biz_payment_request;
CREATE TABLE biz_payment_request (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '申请人ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  payment_no        VARCHAR(50)     NOT NULL COMMENT '付款单号',
  payee_name        VARCHAR(100)    NOT NULL COMMENT '收款方名称',
  payee_account     VARCHAR(100)    DEFAULT NULL COMMENT '收款账号',
  payee_bank        VARCHAR(100)    DEFAULT NULL COMMENT '开户行',
  amount            DECIMAL(14,2)   NOT NULL COMMENT '付款金额，与HR结算及借款精度对齐',
  source_biz_type    VARCHAR(50)    DEFAULT NULL COMMENT 'HR_SETTLEMENT或HR_ADVANCE，既有单据为空',
  source_biz_id      VARCHAR(64)    DEFAULT NULL COMMENT '来源业务ID',
  payment_type      VARCHAR(20)     NOT NULL COMMENT '付款类型(PURCHASE采购/SERVICE服务/RENT租金/OTHER其他)',
  reason            VARCHAR(500)    NOT NULL COMMENT '付款事由',
  expected_date     DATE            DEFAULT NULL COMMENT '期望付款日期',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '附件URL(多个用逗号分隔)',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT草稿/PENDING审批中/APPROVED已通过/REJECTED已驳回/PAID已打款)',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  project_id        BIGINT(20)      DEFAULT NULL COMMENT '关联项目ID',
  project_name      VARCHAR(200)    DEFAULT NULL COMMENT '关联项目名称',
  customer_id       BIGINT(20)      DEFAULT NULL COMMENT '关联客户ID',
  customer_name     VARCHAR(200)    DEFAULT NULL COMMENT '关联客户名称',
  budget_subject_code VARCHAR(50)   DEFAULT NULL COMMENT '预算科目编码',
  budget_subject_name VARCHAR(100)  DEFAULT NULL COMMENT '预算科目名称',
  invoice_status    VARCHAR(20)     DEFAULT 'NONE' COMMENT '发票状态(NONE/REGISTERED/BOUND/WRITEOFF_PARTIAL/WRITEOFF_FULL)',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_payment_request_tenant_no (tenant_id, payment_no),
  UNIQUE KEY uk_payment_request_source (tenant_id, source_biz_type, source_biz_id),
  CONSTRAINT chk_payment_request_source CHECK ((source_biz_type IS NULL AND source_biz_id IS NULL) OR (source_biz_type IS NOT NULL AND source_biz_id IS NOT NULL)),
  KEY idx_payment_user (user_id),
  KEY idx_payment_status (status),
  KEY idx_payment_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='付款申请表';

-- 17. 行政采购申请表
DROP TABLE IF EXISTS biz_purchase_request;
CREATE TABLE biz_purchase_request (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '申请人ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  purchase_no       VARCHAR(50)     NOT NULL COMMENT '采购单号',
  supplier_id       BIGINT(20)      NOT NULL COMMENT '供应商ID',
  supplier_name     VARCHAR(100)    DEFAULT NULL COMMENT '供应商名称快照',
  supplier_contact  VARCHAR(64)     DEFAULT NULL COMMENT '供应商联系人快照',
  supplier_phone    VARCHAR(30)     DEFAULT NULL COMMENT '供应商联系电话快照',
  supplier_bank     VARCHAR(100)    DEFAULT NULL COMMENT '供应商开户行快照',
  supplier_account  VARCHAR(100)    DEFAULT NULL COMMENT '供应商银行账号快照',
  total_amount      DECIMAL(10,2)   DEFAULT 0.00 COMMENT '采购总金额',
  expected_date     DATETIME        DEFAULT NULL COMMENT '期望到货日期',
  reason            VARCHAR(500)    NOT NULL COMMENT '采购事由',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT/PENDING/APPROVED/PARTIAL_RECEIVED/RECEIVED/REJECTED)',
  payment_status    VARCHAR(20)     DEFAULT 'NONE' COMMENT '付款状态(NONE/DRAFT/PENDING/APPROVED/REJECTED/PAID)',
  payment_request_id BIGINT(20)     DEFAULT NULL COMMENT '关联付款申请ID',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '附件URL(多个用逗号分隔)',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  project_id        BIGINT(20)      DEFAULT NULL COMMENT '关联项目ID',
  project_name      VARCHAR(200)    DEFAULT NULL COMMENT '关联项目名称',
  customer_id       BIGINT(20)      DEFAULT NULL COMMENT '关联客户ID',
  customer_name     VARCHAR(200)    DEFAULT NULL COMMENT '关联客户名称',
  budget_subject_code VARCHAR(50)   DEFAULT NULL COMMENT '预算科目编码',
  budget_subject_name VARCHAR(100)  DEFAULT NULL COMMENT '预算科目名称',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  rfq_id BIGINT(20) DEFAULT NULL COMMENT '来源询价单ID',
  PRIMARY KEY (id),
  UNIQUE KEY uk_purchase_request_tenant_no (tenant_id, purchase_no),
  KEY idx_purchase_user (user_id),
  KEY idx_purchase_status (status),
  KEY idx_purchase_payment_status (payment_status),
  KEY idx_purchase_supplier (supplier_id),
  KEY idx_purchase_tenant (tenant_id),
  UNIQUE KEY uk_purchase_request_rfq (tenant_id, rfq_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='行政采购申请表';

-- 18. 行政采购申请明细表
DROP TABLE IF EXISTS biz_purchase_item;
CREATE TABLE biz_purchase_item (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  purchase_id       BIGINT(20)      NOT NULL COMMENT '采购申请ID',
  consumable_id     BIGINT(20)      NOT NULL COMMENT '耗材ID',
  consumable_name   VARCHAR(100)    DEFAULT NULL COMMENT '耗材名称快照',
  model             VARCHAR(100)    DEFAULT NULL COMMENT '规格型号快照',
  unit              VARCHAR(20)     DEFAULT NULL COMMENT '单位快照',
  quantity          INT(11)         NOT NULL COMMENT '采购数量',
  unit_price        DECIMAL(10,2)   NOT NULL COMMENT '采购单价',
  amount            DECIMAL(10,2)   NOT NULL COMMENT '采购金额',
  received_quantity INT(11)         DEFAULT 0 COMMENT '已入库数量',
  budget_subject_code VARCHAR(50)   DEFAULT NULL COMMENT '预算科目编码',
  budget_subject_name VARCHAR(100)  DEFAULT NULL COMMENT '预算科目名称',
  rfq_item_id BIGINT(20) DEFAULT NULL COMMENT '来源询价物料ID(用于关联中标报价及成交金额)',
  PRIMARY KEY (id),
  KEY idx_purchase_item_purchase (purchase_id),
  KEY idx_purchase_item_consumable (consumable_id),
  KEY idx_purchase_item_tenant (tenant_id),
  UNIQUE KEY uk_purchase_item_rfq (tenant_id, purchase_id, rfq_item_id),
  KEY idx_purchase_item_rfq_source (tenant_id, rfq_item_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='行政采购申请明细表';

-- 19. 行政采购到货入库记录表
DROP TABLE IF EXISTS biz_purchase_receipt;
CREATE TABLE biz_purchase_receipt (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  purchase_id       BIGINT(20)      NOT NULL COMMENT '采购申请ID',
  item_id           BIGINT(20)      NOT NULL COMMENT '采购明细ID',
  consumable_id     BIGINT(20)      NOT NULL COMMENT '耗材ID',
  consumable_name   VARCHAR(100)    DEFAULT NULL COMMENT '耗材名称快照',
  received_quantity INT(11)         NOT NULL COMMENT '本次入库数量',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  operator_name     VARCHAR(64)     DEFAULT NULL COMMENT '操作人姓名',
  receipt_time      DATETIME        DEFAULT NULL COMMENT '入库时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_purchase_receipt_purchase (purchase_id),
  KEY idx_purchase_receipt_item (item_id),
  KEY idx_purchase_receipt_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='行政采购到货入库记录表';

-- =========================================================
-- 九、出差申请模块
-- =========================================================

-- 17. 出差申请表
DROP TABLE IF EXISTS biz_business_trip;
CREATE TABLE biz_business_trip (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '申请人ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  trip_no           VARCHAR(32)     NOT NULL COMMENT '出差单号',
  departure         VARCHAR(200)    DEFAULT NULL COMMENT '出发地',
  destination       VARCHAR(200)    NOT NULL COMMENT '出差目的地',
  start_date        DATE            NOT NULL COMMENT '出差开始日期',
  end_date          DATE            NOT NULL COMMENT '出差结束日期',
  trip_days         DECIMAL(5,1)    DEFAULT NULL COMMENT '出差天数',
  transport_type    VARCHAR(20)     DEFAULT NULL COMMENT '交通方式(PLANE飞机/TRAIN火车/CAR自驾/OTHER其他)',
  estimated_cost    DECIMAL(10,2)   DEFAULT NULL COMMENT '预计费用',
  accommodation     VARCHAR(20)     DEFAULT 'SELF' COMMENT '住宿安排(SELF自行安排/COMPANY公司安排/NONE无需住宿)',
  contact_phone     VARCHAR(20)     DEFAULT NULL COMMENT '出差期间联系电话',
  emergency_contact VARCHAR(64)     DEFAULT NULL COMMENT '紧急联系人',
  emergency_phone   VARCHAR(20)     DEFAULT NULL COMMENT '紧急联系人电话',
  project_id        BIGINT(20)      DEFAULT NULL COMMENT '关联项目ID',
  project_name      VARCHAR(200)    DEFAULT NULL COMMENT '关联项目名称',
  customer_id       BIGINT(20)      DEFAULT NULL COMMENT '关联客户ID',
  customer_name     VARCHAR(200)    DEFAULT NULL COMMENT '关联客户名称',
  budget_subject_code VARCHAR(50)   DEFAULT NULL COMMENT '预算科目编码',
  budget_subject_name VARCHAR(100)  DEFAULT NULL COMMENT '预算科目名称',
  companions        VARCHAR(500)    DEFAULT NULL COMMENT '同行人员(JSON数组)',
  reason            VARCHAR(500)    NOT NULL COMMENT '出差事由',
  itinerary         TEXT            DEFAULT NULL COMMENT '行程安排(JSON)',
  attachment_url    VARCHAR(500)    DEFAULT NULL COMMENT '附件URL(多个用逗号分隔)',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT草稿/PENDING审批中/APPROVED已通过/REJECTED已驳回/CANCELLED已取消)',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT NULL COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT NULL COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_trip_tenant_no (tenant_id, trip_no),
  KEY idx_trip_user (user_id),
  KEY idx_trip_tenant (tenant_id),
  KEY idx_trip_status (status),
  KEY idx_trip_date (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='出差申请表';

-- =========================================================
-- 十、用印与证照借用模块
-- =========================================================

-- 19. 合同台账表
DROP TABLE IF EXISTS oa_contract;
CREATE TABLE oa_contract (
  contract_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '合同ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  contract_no       VARCHAR(50)     NOT NULL COMMENT '合同编号',
  contract_name     VARCHAR(200)    NOT NULL COMMENT '合同名称',
  counterparty_name VARCHAR(200)    NOT NULL COMMENT '相对方名称',
  contract_type     VARCHAR(30)     NOT NULL COMMENT '合同类型(SALES销售/PURCHASE采购/SERVICE服务/OTHER其他)',
  amount            DECIMAL(18,2)   DEFAULT 0.00 COMMENT '合同金额',
  currency          VARCHAR(10)     DEFAULT 'CNY' COMMENT '币种',
  owner_id          BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name        VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  project_id        BIGINT(20)      DEFAULT NULL COMMENT '关联项目ID',
  project_name      VARCHAR(200)    DEFAULT NULL COMMENT '关联项目名称',
  customer_id       BIGINT(20)      DEFAULT NULL COMMENT '关联客户ID',
  customer_name     VARCHAR(200)    DEFAULT NULL COMMENT '关联客户名称',
  budget_subject_code VARCHAR(50)   DEFAULT NULL COMMENT '预算科目编码',
  budget_subject_name VARCHAR(100)  DEFAULT NULL COMMENT '预算科目名称',
  invoice_status    VARCHAR(20)     DEFAULT 'NONE' COMMENT '发票状态(NONE/REGISTERED/BOUND/WRITEOFF_PARTIAL/WRITEOFF_FULL)',
  start_date        DATE            DEFAULT NULL COMMENT '合同开始日期',
  end_date          DATE            DEFAULT NULL COMMENT '合同结束日期',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '合同附件URL(多个用逗号分隔)',
  archive_attachment_url VARCHAR(1000) DEFAULT NULL COMMENT '归档附件URL(多个用逗号分隔)',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '审批流程实例ID',
  seal_application_id BIGINT(20)    DEFAULT NULL COMMENT '关联合同用印申请ID',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT/PENDING/APPROVED/REJECTED/SEALING/SEALED/ACTIVE/EXPIRED/TERMINATED/CANCELLED)',
  risk_level        VARCHAR(20)     DEFAULT 'LOW' COMMENT '风险等级(LOW/MEDIUM/HIGH/CRITICAL)',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  source_type       VARCHAR(30)     DEFAULT 'MANUAL' COMMENT '来源类型 MANUAL/CRM_OPPORTUNITY/CRM_CUSTOMER',
  source_id         BIGINT(20)      DEFAULT NULL COMMENT '来源业务ID',
  template_id       BIGINT(20)      DEFAULT NULL COMMENT 'OA-P0-2 使用的合同模板ID(oa_contract_template.id)',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  supplier_id BIGINT(20) DEFAULT NULL COMMENT '合同关联供应商ID(用于准入校验)',
  requires_fulfilment_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否需要履约跟踪(0否1是)',
  fulfilment_status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED' COMMENT '履约状态(NOT_STARTED/ONGOING/FULFILLED/PARTIALLY_BREACHED/BREACHED)',
  fulfilment_deadline DATE DEFAULT NULL COMMENT '合同整体履约期限(自然日)',
  fulfilled_term_count INT(11) NOT NULL DEFAULT 0 COMMENT '已完成条款数(含豁免)',
  total_term_count INT(11) NOT NULL DEFAULT 0 COMMENT '有效履约条款总数',
  fulfilment_progress DECIMAL(6,2) NOT NULL DEFAULT 0.00 COMMENT '履约进度(0至100)',
  signed_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已签署(0否1是)',
  sign_method VARCHAR(20) DEFAULT NULL COMMENT '签署方式(OFFLINE纸质/ESIGN电子签章/SCAN扫描件确认)',
  our_signee_id BIGINT(20) DEFAULT NULL COMMENT '我方签署人用户ID',
  our_signee_name VARCHAR(64) DEFAULT NULL COMMENT '我方签署人姓名',
  our_sign_time DATETIME DEFAULT NULL COMMENT '我方签署时间',
  our_sign_ip VARCHAR(45) DEFAULT NULL COMMENT '服务端取得的签署来源IP',
  counterparty_signee VARCHAR(64) DEFAULT NULL COMMENT '对方签署人姓名',
  counterparty_sign_time DATETIME DEFAULT NULL COMMENT '对方签署时间',
  sign_place VARCHAR(200) DEFAULT NULL COMMENT '签署地点',
  sign_remark VARCHAR(500) DEFAULT NULL COMMENT '签署说明',
  signed_file_url VARCHAR(1000) DEFAULT NULL COMMENT '已签署合同文件地址',
  esign_provider VARCHAR(50) DEFAULT NULL COMMENT '电子签章服务商(预留)',
  esign_transaction_id VARCHAR(100) DEFAULT NULL COMMENT '电子签章流水号(预留)',
  portal_term_ids JSON DEFAULT NULL COMMENT '明确对客户公开的履约条款ID清单，未选择的仅内部可见',
  portal_milestone_ids JSON DEFAULT NULL COMMENT '明确对客户公开的关键节点ID清单，未选择的仅内部可见',
  portal_payment_schedule_ids JSON DEFAULT NULL COMMENT '明确对客户公开的付款计划ID清单，未选择的仅内部可见',
  PRIMARY KEY (contract_id),
  UNIQUE KEY uk_contract_no_tenant (contract_no, tenant_id),
  KEY idx_contract_tenant (tenant_id),
  KEY idx_contract_owner (owner_id),
  KEY idx_contract_dept (dept_id),
  KEY idx_contract_status (status),
  KEY idx_contract_end_date (end_date),
  KEY idx_contract_seal (seal_application_id),
  KEY idx_contract_template (tenant_id, template_id),
  KEY idx_contract_supplier (tenant_id, supplier_id),
  KEY idx_contract_fulfilment_scan (tenant_id, requires_fulfilment_flag, fulfilment_status, fulfilment_deadline),
  KEY idx_contract_signed (tenant_id, signed_flag, our_sign_time),
  KEY idx_contract_portal_customer (tenant_id, customer_id, deleted, signed_flag, contract_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='OA合同台账表';

DROP TABLE IF EXISTS oa_project;
CREATE TABLE oa_project (
  project_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '项目ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id        VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  project_no         VARCHAR(50)     NOT NULL COMMENT '项目编号',
  project_name       VARCHAR(200)    NOT NULL COMMENT '项目名称',
  project_type       VARCHAR(30)     DEFAULT 'DELIVERY' COMMENT '项目类型(DELIVERY)',
  customer_id        BIGINT(20)      DEFAULT NULL COMMENT '客户ID',
  customer_name      VARCHAR(200)    DEFAULT NULL COMMENT '客户名称',
  contract_id        BIGINT(20)      DEFAULT NULL COMMENT '合同ID',
  contract_no        VARCHAR(50)     DEFAULT NULL COMMENT '合同编号',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '项目负责人ID',
  owner_name         VARCHAR(64)     DEFAULT NULL COMMENT '项目负责人姓名',
  dept_id            BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name          VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  start_date         DATE            DEFAULT NULL COMMENT '计划开始日期',
  end_date           DATE            DEFAULT NULL COMMENT '计划结束日期',
  actual_start_date  DATE            DEFAULT NULL COMMENT '实际开始日期',
  actual_end_date    DATE            DEFAULT NULL COMMENT '实际结束日期',
  budget_amount      DECIMAL(18,2)   DEFAULT 0.00 COMMENT '项目预算',
  actual_cost_amount DECIMAL(18,2)   DEFAULT 0.00 COMMENT '项目实际成本',
  progress           DECIMAL(5,2)    DEFAULT 0.00 COMMENT '项目进度',
  priority           VARCHAR(20)     DEFAULT 'MEDIUM' COMMENT '优先级(HIGH/MEDIUM)',
  status             VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态',
  risk_level         VARCHAR(20)     DEFAULT 'LOW' COMMENT '风险等级',
  source_type        VARCHAR(20)     DEFAULT 'MANUAL' COMMENT '来源类型',
  source_id          BIGINT(20)      DEFAULT NULL COMMENT '来源业务ID',
  source_name        VARCHAR(200)    DEFAULT NULL COMMENT '来源名称',
  baseline_version   INT(11)         DEFAULT 0 COMMENT '基线版本号',
  attachment_url     VARCHAR(1000)   DEFAULT NULL COMMENT '附件',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  estimated_cost DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '预估成本',
  labor_cost_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '已审批工时人力成本',
  purchase_cost_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '已完成采购成本',
  other_cost_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '其他成本',
  billable_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '可计费金额',
  billed_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '已开票金额',
  gross_margin DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '毛利金额',
  gross_margin_rate DECIMAL(6,4) DEFAULT NULL COMMENT '毛利率(比例,可计费金额为0时为空)',
  actual_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '期初与已审批累计投入工时(小时)',
  percent_complete_mode VARCHAR(20) NOT NULL DEFAULT 'TASK_COMPLETION' COMMENT '进度模式(MANUAL/TASK_COMPLETION/TASK_PROGRESS)',
  PRIMARY KEY (project_id),
  UNIQUE KEY uk_project_no_tenant (tenant_id, project_no),
  KEY idx_project_status (status),
  KEY idx_project_customer (customer_id),
  KEY idx_project_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目主表';

DROP TABLE IF EXISTS oa_project_member;
CREATE TABLE oa_project_member (
  id                 BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  project_id         BIGINT(20)      NOT NULL COMMENT '项目ID',
  user_id            BIGINT(20)      NOT NULL COMMENT '成员ID',
  user_name          VARCHAR(64)     DEFAULT NULL COMMENT '成员姓名',
  role_code          VARCHAR(30)     DEFAULT 'MEMBER' COMMENT '项目角色',
  role_name          VARCHAR(64)     DEFAULT NULL COMMENT '项目角色名称',
  join_date          DATE            DEFAULT NULL COMMENT '加入日期',
  leave_date         DATE            DEFAULT NULL COMMENT '离开日期',
  billable_flag      TINYINT(1)      DEFAULT 1 COMMENT '是否计费成员',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_project_member_tenant (tenant_id, project_id, user_id),
  KEY idx_project_member_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目成员表';



DROP TABLE IF EXISTS oa_project_risk;
CREATE TABLE oa_project_risk (
  risk_id            BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '项目风险ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  project_id         BIGINT(20)      NOT NULL COMMENT '项目ID',
  risk_code          VARCHAR(50)     NOT NULL COMMENT '风险编码',
  risk_name          VARCHAR(200)    NOT NULL COMMENT '风险名称',
  risk_level         VARCHAR(20)     DEFAULT 'MEDIUM' COMMENT '风险等级',
  status             VARCHAR(20)     DEFAULT 'OPEN' COMMENT '状态(OPEN/HANDLING/CLOSED/IGNORED)',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name         VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  trigger_source     VARCHAR(20)     DEFAULT 'MANUAL' COMMENT '触发来源(CRM_TICKET/MANUAL/MILESTONE_OVERDUE)',
  summary            VARCHAR(1000)   DEFAULT NULL COMMENT '风险说明',
  action_plan        VARCHAR(1000)   DEFAULT NULL COMMENT '应对计划',
  resolved_time      DATETIME        DEFAULT NULL COMMENT '关闭时间',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (risk_id),
  UNIQUE KEY uk_project_risk_tenant (tenant_id, project_id, risk_code),
  KEY idx_project_risk_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目风险表';

DROP TABLE IF EXISTS oa_project_dependency;
CREATE TABLE oa_project_dependency (
  dependency_id      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '依赖ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  project_id         BIGINT(20)      NOT NULL COMMENT '项目ID',
  predecessor_task_id BIGINT(20) NOT NULL COMMENT '前置项目任务ID',
  successor_task_id BIGINT(20) NOT NULL COMMENT '后置项目任务ID',
  dependency_type VARCHAR(20) NOT NULL DEFAULT 'FINISH_TO_START' COMMENT '依赖类型(FINISH_TO_START/START_TO_START/FINISH_TO_FINISH)',
  lag_days           INT(11)         DEFAULT 0 COMMENT '延迟天数',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  version INT(11) NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (dependency_id),
  KEY idx_project_dependency_project (project_id),
  KEY idx_project_dependency_tenant (tenant_id),
  UNIQUE KEY uk_project_dependency_edge (tenant_id, project_id, predecessor_task_id, successor_task_id, dependency_type),
  KEY idx_project_dependency_before (tenant_id, project_id, predecessor_task_id),
  KEY idx_project_dependency_after (tenant_id, project_id, successor_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目依赖表';

DROP TABLE IF EXISTS oa_budget_subject;
CREATE TABLE oa_budget_subject (
  subject_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '预算科目ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  subject_code       VARCHAR(50)     NOT NULL COMMENT '科目编码',
  subject_name       VARCHAR(100)    NOT NULL COMMENT '科目名称',
  parent_id          BIGINT(20)      DEFAULT NULL COMMENT '父科目ID',
  subject_type       VARCHAR(20)     DEFAULT 'EXPENSE' COMMENT '科目类型(EXPENSE)',
  sort_order         INT(11)         DEFAULT 0 COMMENT '排序',
  enabled            TINYINT(1)      DEFAULT 1 COMMENT '是否启用',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (subject_id),
  UNIQUE KEY uk_budget_subject_code (tenant_id, subject_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预算科目表';

DROP TABLE IF EXISTS oa_budget_plan;
CREATE TABLE oa_budget_plan (
  budget_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '预算主表ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id        VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  budget_no          VARCHAR(50)     NOT NULL COMMENT '预算编号',
  budget_name        VARCHAR(200)    NOT NULL COMMENT '预算名称',
  fiscal_year        INT(11)         NOT NULL COMMENT '会计年度',
  period_type        VARCHAR(20)     DEFAULT 'ANNUAL' COMMENT '期间类型(ANNUAL)',
  target_type        VARCHAR(20)     NOT NULL COMMENT '目标类型(DEPT|PROJECT)',
  target_id          BIGINT(20)      NOT NULL COMMENT '目标ID',
  target_name        VARCHAR(200)    DEFAULT NULL COMMENT '目标名称',
  dept_id            BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name          VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  project_id         BIGINT(20)      DEFAULT NULL COMMENT '项目ID',
  project_name       VARCHAR(200)    DEFAULT NULL COMMENT '项目名称',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name         VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  total_amount       DECIMAL(18,2)   DEFAULT 0.00 COMMENT '预算总额',
  reserved_amount    DECIMAL(18,2)   DEFAULT 0.00 COMMENT '占用金额',
  actual_amount      DECIMAL(18,2)   DEFAULT 0.00 COMMENT '实际执行金额',
  available_amount   DECIMAL(18,2)   DEFAULT 0.00 COMMENT '可用余额',
  version_no         INT(11)         DEFAULT 1 COMMENT '版本号',
  status             VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (budget_id),
  UNIQUE KEY uk_budget_no (tenant_id, budget_no),
  KEY idx_budget_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预算主表';

DROP TABLE IF EXISTS oa_budget_line;
CREATE TABLE oa_budget_line (
  line_id            BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '预算明细ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  budget_id          BIGINT(20)      NOT NULL COMMENT '预算主表ID',
  subject_id         BIGINT(20)      DEFAULT NULL COMMENT '科目ID',
  subject_code       VARCHAR(50)     NOT NULL COMMENT '科目编码',
  subject_name       VARCHAR(100)    NOT NULL COMMENT '科目名称',
  amount             DECIMAL(18,2)   DEFAULT 0.00 COMMENT '预算金额',
  reserved_amount    DECIMAL(18,2)   DEFAULT 0.00 COMMENT '占用金额',
  actual_amount      DECIMAL(18,2)   DEFAULT 0.00 COMMENT '实际执行金额',
  available_amount   DECIMAL(18,2)   DEFAULT 0.00 COMMENT '可用余额',
  warning_ratio      DECIMAL(5,2)    DEFAULT 0.80 COMMENT '预警阈值',
  alert_ratio        DECIMAL(5,2)    DEFAULT 0.90 COMMENT '告警阈值',
  block_ratio        DECIMAL(5,2)    DEFAULT 1.00 COMMENT '拦截阈值',
  sort_order         INT(11)         DEFAULT 0 COMMENT '排序',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (line_id),
  UNIQUE KEY uk_budget_line_tenant_subject (tenant_id, budget_id, subject_code),
  KEY idx_budget_line_budget (budget_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预算明细表';

DROP TABLE IF EXISTS oa_budget_adjustment;
CREATE TABLE oa_budget_adjustment (
  adjustment_id      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '预算调整ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id        VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  adjustment_no      VARCHAR(50)     NOT NULL COMMENT '调整单号',
  budget_id          BIGINT(20)      NOT NULL COMMENT '预算ID',
  budget_no          VARCHAR(50)     DEFAULT NULL COMMENT '预算编号',
  adjustment_type    VARCHAR(20)     DEFAULT 'ADD' COMMENT '调整类型(ADD/REDUCE)',
  subject_code       VARCHAR(50)     DEFAULT NULL COMMENT '科目编码',
  subject_name       VARCHAR(100)    DEFAULT NULL COMMENT '科目名称',
  change_amount      DECIMAL(18,2)   NOT NULL COMMENT '调整金额',
  reason             VARCHAR(500)    NOT NULL COMMENT '调整原因',
  status             VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (adjustment_id),
  UNIQUE KEY uk_budget_adjustment_no (tenant_id, adjustment_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预算调整表';

DROP TABLE IF EXISTS oa_budget_ledger;
CREATE TABLE oa_budget_ledger (
  ledger_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '预算台账ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  budget_id          BIGINT(20)      NOT NULL COMMENT '预算ID',
  line_id            BIGINT(20)      DEFAULT NULL COMMENT '预算明细ID',
  target_type        VARCHAR(20)     NOT NULL COMMENT '目标类型(DEPT/PROJECT/BUDGET)',
  target_id          BIGINT(20)      NOT NULL COMMENT '目标ID',
  business_type      VARCHAR(30)     NOT NULL COMMENT '业务类型(ADJUST/EXPENSE_CLAIM/PAYMENT_REQUEST/TRAVEL_APPLY)',
  business_id        BIGINT(20)      NOT NULL COMMENT '业务ID',
  business_no        VARCHAR(50)     DEFAULT NULL COMMENT '业务编号',
  subject_code       VARCHAR(50)     NOT NULL COMMENT '科目编码',
  subject_name       VARCHAR(100)    DEFAULT NULL COMMENT '科目名称',
  operation_type     VARCHAR(20)     NOT NULL COMMENT '操作类型(RESERVE/RELEASE/WRITEOFF/ADJUST)',
  amount             DECIMAL(18,2)   NOT NULL COMMENT '金额',
  available_after    DECIMAL(18,2)   DEFAULT 0.00 COMMENT '操作后可用余额',
  status             VARCHAR(20)     DEFAULT 'VALID' COMMENT '状态(VALID/VOID)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (ledger_id),
  UNIQUE KEY uk_budget_ledger_biz_op (tenant_id, business_type, business_id, operation_type, target_type, target_id, subject_code),
  KEY idx_budget_ledger_budget (budget_id),
  KEY idx_budget_ledger_business (business_type, business_id),
  KEY idx_budget_ledger_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预算执行台账表';

DROP TABLE IF EXISTS oa_invoice;
CREATE TABLE oa_invoice (
  invoice_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '发票ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  invoice_direction  VARCHAR(20)     NOT NULL COMMENT '发票方向(INPUT/OUTPUT)',
  third_party_system VARCHAR(50)     DEFAULT NULL COMMENT '第三方系统',
  external_bill_no   VARCHAR(64)     DEFAULT NULL COMMENT '第三方单号',
  external_link_url  VARCHAR(1000)   DEFAULT NULL COMMENT '第三方链接',
  invoice_code       VARCHAR(50)     NOT NULL COMMENT '发票代码',
  invoice_no         VARCHAR(50)     NOT NULL COMMENT '发票号码',
  invoice_type       VARCHAR(30)     DEFAULT NULL COMMENT '发票类型',
  invoice_date       DATE            DEFAULT NULL COMMENT '开票日期',
  gross_amount       DECIMAL(18,2)   DEFAULT 0.00 COMMENT '含税金额',
  tax_amount         DECIMAL(18,2)   DEFAULT 0.00 COMMENT '税额',
  seller_name        VARCHAR(200)    DEFAULT NULL COMMENT '销方名称',
  buyer_name         VARCHAR(200)    DEFAULT NULL COMMENT '购方名称',
  image_url          VARCHAR(1000)   DEFAULT NULL COMMENT '影像地址',
  customer_id        BIGINT(20)      DEFAULT NULL COMMENT '关联客户ID',
  customer_name      VARCHAR(200)    DEFAULT NULL COMMENT '关联客户名称',
  contract_id        BIGINT(20)      DEFAULT NULL COMMENT '关联合同ID',
  contract_no        VARCHAR(50)     DEFAULT NULL COMMENT '关联合同编号',
  expense_claim_id   BIGINT(20)      DEFAULT NULL COMMENT '关联报销ID',
  payment_request_id BIGINT(20)      DEFAULT NULL COMMENT '关联付款ID',
  receivable_id      BIGINT(20)      DEFAULT NULL COMMENT '关联回款ID',
  status             VARCHAR(20)     DEFAULT 'REGISTERED' COMMENT '状态(REGISTERED/BOUND/WRITEOFF_PARTIAL/WRITEOFF_FULL/VOID)',
  portal_public_version INT DEFAULT NULL COMMENT '已确认公开的单据版本，NULL表示未公开或已撤回',
  portal_published_by BIGINT(20) DEFAULT NULL COMMENT '财务公开确认人系统用户ID',
  portal_published_time DATETIME DEFAULT NULL COMMENT '财务公开确认时间',
  portal_file_ids JSON DEFAULT NULL COMMENT '财务明确允许对外读取的票据文件编号数组',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (invoice_id),
  UNIQUE KEY uk_invoice_unique (tenant_id, invoice_code, invoice_no),
  KEY idx_invoice_direction (invoice_direction),
  KEY idx_invoice_status (status),
  KEY idx_oa_invoice_portal (tenant_id, customer_id, deleted, invoice_id),
  CONSTRAINT chk_oa_invoice_portal_publication CHECK ( (portal_public_version IS NULL AND portal_published_by IS NULL AND portal_published_time IS NULL AND portal_file_ids IS NULL) OR (portal_public_version IS NOT NULL AND portal_public_version >= 0 AND portal_public_version <= version AND portal_published_by IS NOT NULL AND portal_published_time IS NOT NULL AND portal_file_ids IS NOT NULL AND JSON_TYPE(portal_file_ids) = 'ARRAY') )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发票主表';

DROP TABLE IF EXISTS oa_invoice_writeoff;
CREATE TABLE oa_invoice_writeoff (
  writeoff_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '核销ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  invoice_id         BIGINT(20)      NOT NULL COMMENT '发票ID',
  business_type      VARCHAR(30)     NOT NULL COMMENT '业务类型(CRM_RECEIVABLE/EXPENSE_CLAIM/PAYMENT_REQUEST)',
  business_id        BIGINT(20)      NOT NULL COMMENT '业务ID',
  business_no        VARCHAR(50)     DEFAULT NULL COMMENT '业务编号',
  writeoff_amount    DECIMAL(18,2)   NOT NULL COMMENT '核销金额',
  writeoff_date      DATE            DEFAULT NULL COMMENT '核销日期',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (writeoff_id),
  KEY idx_invoice_writeoff_invoice (invoice_id),
  KEY idx_invoice_writeoff_business (business_type, business_id),
  KEY idx_invoice_writeoff_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发票核销表';

-- 19.1 OA统一链路事件表
DROP TABLE IF EXISTS oa_trace_event;
CREATE TABLE oa_trace_event (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  business_type     VARCHAR(30)     NOT NULL COMMENT '主业务类型(CONTRACT/APPROVAL/SEAL)',
  business_id       BIGINT(20)      NOT NULL COMMENT '主业务ID',
  related_type      VARCHAR(30)     DEFAULT NULL COMMENT '关联类型(APPROVAL/BUDGET/CONTRACT/PAYMENT/RISK/SEAL_APPLY/SEAL_RENEWAL)',
  related_id        BIGINT(20)      DEFAULT NULL COMMENT '关联ID',
  event_type        VARCHAR(50)     NOT NULL COMMENT '事件类型',
  event_title       VARCHAR(100)    NOT NULL COMMENT '事件标题',
  event_content     VARCHAR(1000)   DEFAULT NULL COMMENT '事件内容',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  operator_name     VARCHAR(64)     DEFAULT NULL COMMENT '操作人姓名',
  event_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '事件时间',
  snapshot_json     JSON            DEFAULT NULL COMMENT '事件快照JSON',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_trace_business (business_type, business_id),
  KEY idx_trace_related (related_type, related_id),
  KEY idx_trace_tenant_time (tenant_id, event_time)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='OA全链路事件表';

-- 19.2 OA风险提醒表
DROP TABLE IF EXISTS oa_risk_alert;
CREATE TABLE oa_risk_alert (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  business_type     VARCHAR(30)     NOT NULL COMMENT '业务类型(CONTRACT/SEAL/APPROVAL)',
  business_id       BIGINT(20)      NOT NULL COMMENT '业务ID',
  risk_code         VARCHAR(50)     NOT NULL COMMENT '风险编码',
  risk_name         VARCHAR(100)    NOT NULL COMMENT '风险名称',
  risk_level        VARCHAR(20)     DEFAULT 'MEDIUM' COMMENT '风险等级(LOW/MEDIUM/HIGH/CRITICAL)',
  risk_status       VARCHAR(20)     DEFAULT 'OPEN' COMMENT '状态(OPEN/HANDLING/CLOSED/IGNORED)',
  risk_source       VARCHAR(20)     DEFAULT 'RULE' COMMENT '来源(RULE/MANUAL)',
  owner_id          BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name        VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  detected_time     DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '发现时间',
  handled_time      DATETIME        DEFAULT NULL COMMENT '处理时间',
  handler_id        BIGINT(20)      DEFAULT NULL COMMENT '处理人ID',
  handler_name      VARCHAR(64)     DEFAULT NULL COMMENT '处理人姓名',
  handle_remark     VARCHAR(1000)   DEFAULT NULL COMMENT '处理说明',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_risk_business (business_type, business_id),
  KEY idx_risk_status (risk_status),
  KEY idx_risk_level (risk_level),
  KEY idx_risk_source (risk_source),
  KEY idx_risk_owner (owner_id),
  KEY idx_risk_tenant_time (tenant_id, detected_time)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='OA风险提醒表';

-- 20. 印章台账表
DROP TABLE IF EXISTS oa_seal;
CREATE TABLE oa_seal (
  seal_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '印章ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  seal_code         VARCHAR(50)     NOT NULL COMMENT '印章编码',
  seal_name         VARCHAR(100)    NOT NULL COMMENT '印章名称',
  seal_type         VARCHAR(30)     NOT NULL COMMENT '印章类型(COMPANY公章/FINANCE财务章/CONTRACT合同章/LEGAL法人章/OTHER其他)',
  seal_no           VARCHAR(100)    DEFAULT NULL COMMENT '印章编号',
  issuer            VARCHAR(100)    DEFAULT NULL COMMENT '签发/备案机构',
  issue_date        DATE            DEFAULT NULL COMMENT '签发/启用日期',
  expire_date       DATE            DEFAULT NULL COMMENT '到期日期',
  keeper_id         BIGINT(20)      DEFAULT NULL COMMENT '保管人ID',
  keeper_name       VARCHAR(64)     DEFAULT NULL COMMENT '保管人姓名',
  location          VARCHAR(200)    DEFAULT NULL COMMENT '存放位置',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '印章附件URL(多个用逗号分隔)',
  status            VARCHAR(20)     DEFAULT 'AVAILABLE' COMMENT '状态(AVAILABLE可用/BORROWED借出/DISABLED停用)',
  borrow_due_time   DATETIME        DEFAULT NULL COMMENT '当前借出预计归还时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (seal_id),
  UNIQUE KEY uk_seal_code_tenant (seal_code, tenant_id),
  KEY idx_seal_tenant (tenant_id),
  KEY idx_seal_status (status),
  KEY idx_seal_expire (expire_date)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='印章台账表';

-- 21. 用印申请表
DROP TABLE IF EXISTS oa_seal_application;
CREATE TABLE oa_seal_application (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  application_no    VARCHAR(50)     NOT NULL COMMENT '用印申请编号',
  contract_id       BIGINT(20)      DEFAULT NULL COMMENT '关联合同ID',
  contract_no       VARCHAR(50)     DEFAULT NULL COMMENT '关联合同编号',
  seal_id           BIGINT(20)      NOT NULL COMMENT '印章ID',
  seal_name         VARCHAR(100)    DEFAULT NULL COMMENT '印章名称快照',
  user_id           BIGINT(20)      NOT NULL COMMENT '申请人ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  document_name     VARCHAR(200)    NOT NULL COMMENT '用印文件名称',
  use_scene         VARCHAR(30)     DEFAULT 'CONTRACT' COMMENT '用印场景(CONTRACT合同/PROOF证明/FINANCE财务/OTHER其他)',
  copy_count        INT(11)         DEFAULT 1 COMMENT '用印份数',
  purpose           VARCHAR(500)    NOT NULL COMMENT '用印用途',
  expected_borrow_time DATETIME     DEFAULT NULL COMMENT '预计借出时间',
  expected_return_time DATETIME     NOT NULL COMMENT '预计归还时间',
  actual_borrow_time DATETIME       DEFAULT NULL COMMENT '实际借出时间',
  actual_return_time DATETIME       DEFAULT NULL COMMENT '实际归还时间',
  handler_id        BIGINT(20)      DEFAULT NULL COMMENT '最近经办人ID',
  handler_name      VARCHAR(64)     DEFAULT NULL COMMENT '最近经办人姓名',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '附件URL(多个用逗号分隔)',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT/PENDING/APPROVED/REJECTED/BORROWED/RETURNED/OVERDUE/CANCELLED)',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_seal_app_tenant_no (tenant_id, application_no),
  KEY idx_seal_app_tenant (tenant_id),
  KEY idx_seal_app_seal (seal_id),
  KEY idx_seal_app_contract (contract_id),
  KEY idx_seal_app_user (user_id),
  KEY idx_seal_app_status (status),
  KEY idx_seal_app_return_time (expected_return_time)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='用印申请表';

-- 22. 用印借还交接日志表
DROP TABLE IF EXISTS oa_seal_handover_log;
CREATE TABLE oa_seal_handover_log (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  application_id    BIGINT(20)      NOT NULL COMMENT '用印申请ID',
  seal_id           BIGINT(20)      NOT NULL COMMENT '印章ID',
  action_type       VARCHAR(20)     NOT NULL COMMENT '动作类型(BORROW借出/RETURN归还)',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '经办人ID',
  operator_name     VARCHAR(64)     DEFAULT NULL COMMENT '经办人姓名',
  action_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '交接附件URL(多个用逗号分隔)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_seal_handover_app (application_id),
  KEY idx_seal_handover_seal (seal_id),
  KEY idx_seal_handover_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='用印借还交接日志表';

-- 23. 印章续期申请表
DROP TABLE IF EXISTS oa_seal_renewal;
CREATE TABLE oa_seal_renewal (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  renewal_no        VARCHAR(50)     NOT NULL COMMENT '续期申请编号',
  seal_id           BIGINT(20)      NOT NULL COMMENT '印章ID',
  seal_name         VARCHAR(100)    DEFAULT NULL COMMENT '印章名称快照',
  seal_no           VARCHAR(100)    DEFAULT NULL COMMENT '印章编号快照',
  old_issue_date    DATE            DEFAULT NULL COMMENT '原签发/启用日期',
  old_expire_date   DATE            DEFAULT NULL COMMENT '原到期日期',
  new_issue_date    DATE            DEFAULT NULL COMMENT '新签发/启用日期',
  new_expire_date   DATE            NOT NULL COMMENT '新到期日期',
  applicant_id      BIGINT(20)      DEFAULT NULL COMMENT '申请人ID',
  applicant_name    VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  renewal_reason    VARCHAR(500)    NOT NULL COMMENT '续期原因',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '续期附件URL(多个用逗号分隔)',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT/PENDING/APPROVED/REJECTED/CANCELLED)',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_seal_renewal_tenant_no (tenant_id, renewal_no),
  KEY idx_seal_renewal_seal (seal_id),
  KEY idx_seal_renewal_status (status),
  KEY idx_seal_renewal_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='印章续期申请表';

-- 24. 印章到期提醒日志表
DROP TABLE IF EXISTS oa_seal_expiry_reminder_log;
CREATE TABLE oa_seal_expiry_reminder_log (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  seal_id           BIGINT(20)      NOT NULL COMMENT '印章ID',
  seal_name         VARCHAR(100)    DEFAULT NULL COMMENT '印章名称',
  expire_date       DATE            NOT NULL COMMENT '到期日期',
  days_before       INT(11)         DEFAULT 0 COMMENT '提前提醒天数',
  recipient_id      BIGINT(20)      NOT NULL COMMENT '接收人ID',
  recipient_name    VARCHAR(64)     DEFAULT NULL COMMENT '接收人姓名',
  reminder_type     VARCHAR(20)     NOT NULL COMMENT '提醒类型(AUTO自动/MANUAL手动)',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  operator_name     VARCHAR(64)     DEFAULT NULL COMMENT '操作人姓名',
  reminder_content  VARCHAR(500)    DEFAULT NULL COMMENT '提醒内容',
  reminder_time     DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '提醒时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_seal_expiry_tenant (tenant_id, seal_id, expire_date, days_before, recipient_id),
  KEY idx_seal_expiry_log_tenant (tenant_id),
  KEY idx_seal_expiry_log_seal (seal_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='印章到期提醒日志表';

-- 25. 证照台账表
DROP TABLE IF EXISTS oa_license;
CREATE TABLE oa_license (
  license_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '证照ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  license_code      VARCHAR(50)     NOT NULL COMMENT '证照编码',
  license_name      VARCHAR(100)    NOT NULL COMMENT '证照名称',
  license_type      VARCHAR(30)     NOT NULL COMMENT '证照类型(BUSINESS营业执照/PERMIT许可证/QUALIFICATION资质证书/OTHER其他)',
  license_no        VARCHAR(100)    DEFAULT NULL COMMENT '证照编号',
  issuer            VARCHAR(100)    DEFAULT NULL COMMENT '签发机构',
  issue_date        DATE            DEFAULT NULL COMMENT '签发日期',
  expire_date       DATE            DEFAULT NULL COMMENT '到期日期',
  keeper_id         BIGINT(20)      DEFAULT NULL COMMENT '保管人ID',
  keeper_name       VARCHAR(64)     DEFAULT NULL COMMENT '保管人姓名',
  location          VARCHAR(200)    DEFAULT NULL COMMENT '存放位置',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '证照附件URL(多个用逗号分隔)',
  status            VARCHAR(20)     DEFAULT 'AVAILABLE' COMMENT '状态(AVAILABLE可用/BORROWED借出/DISABLED停用)',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (license_id),
  UNIQUE KEY uk_license_code_tenant (license_code, tenant_id),
  KEY idx_license_tenant (tenant_id),
  KEY idx_license_status (status),
  KEY idx_license_expire (expire_date)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='证照台账表';

-- 26. 证照借用申请表
DROP TABLE IF EXISTS oa_license_borrow;
CREATE TABLE oa_license_borrow (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  borrow_no         VARCHAR(50)     NOT NULL COMMENT '证照借用编号',
  license_id        BIGINT(20)      NOT NULL COMMENT '证照ID',
  license_name      VARCHAR(100)    DEFAULT NULL COMMENT '证照名称快照',
  user_id           BIGINT(20)      NOT NULL COMMENT '申请人ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  purpose           VARCHAR(500)    NOT NULL COMMENT '借用用途',
  expected_borrow_time DATETIME     DEFAULT NULL COMMENT '预计借出时间',
  expected_return_time DATETIME     NOT NULL COMMENT '预计归还时间',
  actual_borrow_time DATETIME       DEFAULT NULL COMMENT '实际借出时间',
  actual_return_time DATETIME       DEFAULT NULL COMMENT '实际归还时间',
  handler_id        BIGINT(20)      DEFAULT NULL COMMENT '最近经办人ID',
  handler_name      VARCHAR(64)     DEFAULT NULL COMMENT '最近经办人姓名',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '附件URL(多个用逗号分隔)',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT/PENDING/APPROVED/REJECTED/BORROWED/RETURNED/OVERDUE/CANCELLED)',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_license_borrow_tenant_no (tenant_id, borrow_no),
  KEY idx_license_borrow_tenant (tenant_id),
  KEY idx_license_borrow_license (license_id),
  KEY idx_license_borrow_user (user_id),
  KEY idx_license_borrow_status (status),
  KEY idx_license_borrow_return_time (expected_return_time)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='证照借用申请表';

-- 27. 证照借还交接日志表
DROP TABLE IF EXISTS oa_license_handover_log;
CREATE TABLE oa_license_handover_log (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  borrow_id         BIGINT(20)      NOT NULL COMMENT '证照借用申请ID',
  license_id        BIGINT(20)      NOT NULL COMMENT '证照ID',
  action_type       VARCHAR(20)     NOT NULL COMMENT '动作类型(BORROW借出/RETURN归还)',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '经办人ID',
  operator_name     VARCHAR(64)     DEFAULT NULL COMMENT '经办人姓名',
  action_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '交接附件URL(多个用逗号分隔)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_license_handover_borrow (borrow_id),
  KEY idx_license_handover_license (license_id),
  KEY idx_license_handover_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='证照借还交接日志表';

-- 28. 证照续期申请表
DROP TABLE IF EXISTS oa_license_renewal;
CREATE TABLE oa_license_renewal (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  renewal_no        VARCHAR(50)     NOT NULL COMMENT '续期申请编号',
  license_id        BIGINT(20)      NOT NULL COMMENT '证照ID',
  license_name      VARCHAR(100)    DEFAULT NULL COMMENT '证照名称快照',
  license_no        VARCHAR(100)    DEFAULT NULL COMMENT '证照编号快照',
  old_issue_date    DATE            DEFAULT NULL COMMENT '原签发日期',
  old_expire_date   DATE            DEFAULT NULL COMMENT '原到期日期',
  new_issue_date    DATE            DEFAULT NULL COMMENT '新签发日期',
  new_expire_date   DATE            NOT NULL COMMENT '新到期日期',
  applicant_id      BIGINT(20)      DEFAULT NULL COMMENT '申请人ID',
  applicant_name    VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  renewal_reason    VARCHAR(500)    NOT NULL COMMENT '续期原因',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '续期附件URL(多个用逗号分隔)',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT/PENDING/APPROVED/REJECTED/CANCELLED)',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_license_renewal_tenant_no (tenant_id, renewal_no),
  KEY idx_license_renewal_license (license_id),
  KEY idx_license_renewal_status (status),
  KEY idx_license_renewal_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='证照续期申请表';

-- 29. 证照到期提醒日志表
DROP TABLE IF EXISTS oa_license_expiry_reminder_log;
CREATE TABLE oa_license_expiry_reminder_log (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  license_id        BIGINT(20)      NOT NULL COMMENT '证照ID',
  license_name      VARCHAR(100)    DEFAULT NULL COMMENT '证照名称',
  expire_date       DATE            NOT NULL COMMENT '到期日期',
  days_before       INT(11)         DEFAULT 0 COMMENT '提前提醒天数',
  recipient_id      BIGINT(20)      NOT NULL COMMENT '接收人ID',
  recipient_name    VARCHAR(64)     DEFAULT NULL COMMENT '接收人姓名',
  reminder_type     VARCHAR(20)     NOT NULL COMMENT '提醒类型(AUTO自动/MANUAL手动)',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  operator_name     VARCHAR(64)     DEFAULT NULL COMMENT '操作人姓名',
  reminder_content  VARCHAR(500)    DEFAULT NULL COMMENT '提醒内容',
  reminder_time     DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '提醒时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_license_expiry_tenant (tenant_id, license_id, expire_date, days_before, recipient_id),
  KEY idx_license_expiry_log_tenant (tenant_id),
  KEY idx_license_expiry_log_license (license_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='证照到期提醒日志表';

-- 30. 用印/证照逾期催还日志表
DROP TABLE IF EXISTS oa_borrow_reminder_log;
CREATE TABLE oa_borrow_reminder_log (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  business_type     VARCHAR(20)     NOT NULL COMMENT '业务类型(SEAL/LICENSE)',
  business_id       BIGINT(20)      NOT NULL COMMENT '业务申请ID',
  resource_id       BIGINT(20)      NOT NULL COMMENT '资源ID',
  resource_name     VARCHAR(100)    DEFAULT NULL COMMENT '资源名称',
  applicant_id      BIGINT(20)      DEFAULT NULL COMMENT '申请人ID',
  applicant_name    VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  reminder_type     VARCHAR(20)     NOT NULL COMMENT '催还类型(AUTO自动/MANUAL手动)',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  operator_name     VARCHAR(64)     DEFAULT NULL COMMENT '操作人姓名',
  reminder_content  VARCHAR(500)    DEFAULT NULL COMMENT '催还内容',
  reminder_time     DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '催还时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_borrow_reminder_business (business_type, business_id),
  KEY idx_borrow_reminder_tenant (tenant_id),
  KEY idx_borrow_reminder_type (reminder_type)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='用印证照逾期催还日志表';

-- =========================================================
-- 十二、访客管理模块
-- =========================================================

-- 22. 访客预约表
DROP TABLE IF EXISTS oa_visitor;
CREATE TABLE oa_visitor (
  visitor_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '访客记录ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  visitor_name      VARCHAR(64)     NOT NULL COMMENT '访客姓名',
  visitor_phone     VARCHAR(20)     DEFAULT NULL COMMENT '访客电话',
  visitor_company   VARCHAR(100)    DEFAULT NULL COMMENT '访客单位',
  visitor_count     INT(11)         DEFAULT 1 COMMENT '来访人数',
  id_card           VARCHAR(20)     DEFAULT NULL COMMENT '身份证号(脱敏存储)',
  visit_reason      VARCHAR(500)    NOT NULL COMMENT '来访事由',
  host_id           BIGINT(20)      NOT NULL COMMENT '被访人ID',
  host_name         VARCHAR(64)     DEFAULT NULL COMMENT '被访人姓名',
  host_dept         VARCHAR(64)     DEFAULT NULL COMMENT '被访人部门',
  visit_date        DATE            NOT NULL COMMENT '预约来访日期',
  visit_time_start  TIME            DEFAULT NULL COMMENT '预计到达时间',
  visit_time_end    TIME            DEFAULT NULL COMMENT '预计离开时间',
  actual_arrive     DATETIME        DEFAULT NULL COMMENT '实际到达时间',
  actual_leave      DATETIME        DEFAULT NULL COMMENT '实际离开时间',
  visit_area        VARCHAR(200)    DEFAULT NULL COMMENT '访问区域',
  car_plate         VARCHAR(20)     DEFAULT NULL COMMENT '车牌号',
  belongings        VARCHAR(500)    DEFAULT NULL COMMENT '携带物品',
  photo_url         VARCHAR(255)    DEFAULT NULL COMMENT '访客照片URL',
  pass_code         VARCHAR(32)     DEFAULT NULL COMMENT '通行证编号',
  process_instance_id VARCHAR(64)   DEFAULT NULL COMMENT '工作流实例ID',
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT '状态(PENDING待确认/APPROVING审批中/APPROVAL_FAILED流程启动失败/REJECTED已拒绝/CONFIRMED已确认/ARRIVED已到访/COMPLETED已离开/CANCELLED已取消)',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT NULL COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT NULL COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (visitor_id),
  KEY idx_visitor_tenant (tenant_id),
  KEY idx_visitor_host (host_id),
  KEY idx_visitor_date (visit_date),
  KEY idx_visitor_status (status),
  KEY idx_visitor_process_instance (process_instance_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='访客预约表';

-- =========================================================
-- 十三、值班排班模块
-- =========================================================

-- 23. 值班排班计划表
DROP TABLE IF EXISTS oa_duty_schedule;
CREATE TABLE oa_duty_schedule (
  schedule_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '排班ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  title             VARCHAR(100)    NOT NULL COMMENT '排班标题',
  schedule_type     VARCHAR(20)     NOT NULL COMMENT '排班类型(DAILY日常值班/HOLIDAY节假日值班/EMERGENCY应急值班)',
  duty_date         DATE            NOT NULL COMMENT '值班日期',
  shift_type        VARCHAR(20)     DEFAULT 'DAY' COMMENT '班次(DAY白班/NIGHT夜班/FULL全天)',
  start_time        TIME            DEFAULT NULL COMMENT '值班开始时间',
  end_time          TIME            DEFAULT NULL COMMENT '值班结束时间',
  user_id           BIGINT(20)      NOT NULL COMMENT '值班人ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '值班人姓名',
  backup_user_id    BIGINT(20)      DEFAULT NULL COMMENT '替班人ID',
  backup_user_name  VARCHAR(64)     DEFAULT NULL COMMENT '替班人姓名',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  location          VARCHAR(200)    DEFAULT NULL COMMENT '值班地点',
  duty_content      VARCHAR(500)    DEFAULT NULL COMMENT '值班内容/职责',
  check_in_time     DATETIME        DEFAULT NULL COMMENT '签到时间',
  check_out_time    DATETIME        DEFAULT NULL COMMENT '签退时间',
  status            VARCHAR(20)     DEFAULT 'SCHEDULED' COMMENT '状态(SCHEDULED已排班/CHECKED_IN已签到/COMPLETED已完成/SWAPPED已换班/CANCELLED已取消)',
  swap_reason       VARCHAR(255)    DEFAULT NULL COMMENT '换班原因',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT NULL COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT NULL COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (schedule_id),
  KEY idx_duty_tenant (tenant_id),
  KEY idx_duty_user (user_id),
  KEY idx_duty_date (duty_date),
  KEY idx_duty_dept (dept_id),
  KEY idx_duty_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='值班排班表';

-- =========================================================
-- 十四、前端错误日志模块
-- =========================================================

-- 24. 同步设备表
DROP TABLE IF EXISTS oa_sync_device;
CREATE TABLE oa_sync_device (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  device_id         VARCHAR(64)     NOT NULL COMMENT '设备ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  device_name       VARCHAR(128)    DEFAULT NULL COMMENT '设备名称',
  last_sync_time    DATETIME        DEFAULT NULL COMMENT '最后同步时间',
  create_by         VARCHAR(64)     DEFAULT NULL COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT NULL COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sync_device_user_tenant (device_id, user_id, tenant_id),
  KEY idx_sync_device_tenant_user (tenant_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='同步设备表';

-- 25. 前端错误日志表
DROP TABLE IF EXISTS oa_frontend_error_log;
CREATE TABLE oa_frontend_error_log (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT NULL COMMENT '租户ID',
  message           VARCHAR(1000)   NOT NULL COMMENT '错误消息',
  stack             TEXT            DEFAULT NULL COMMENT '错误堆栈',
  component_stack   TEXT            DEFAULT NULL COMMENT 'React组件堆栈',
  context           VARCHAR(200)    DEFAULT NULL COMMENT '错误发生的上下文描述',
  url               VARCHAR(500)    DEFAULT NULL COMMENT '页面URL',
  user_agent        VARCHAR(500)    DEFAULT NULL COMMENT '用户代理',
  level             VARCHAR(20)     DEFAULT 'error' COMMENT '错误级别(error/warning/info)',
  tags              JSON            DEFAULT NULL COMMENT '标签信息(JSON)',
  extra             JSON            DEFAULT NULL COMMENT '额外数据(JSON)',
  client_ip         VARCHAR(64)     DEFAULT NULL COMMENT '客户端IP',
  user_id           BIGINT(20)      DEFAULT NULL COMMENT '当前用户ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '当前用户名',
  client_time       DATETIME        DEFAULT NULL COMMENT '客户端上报时间',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '服务端接收时间',
  trace_id          VARCHAR(64) DEFAULT NULL COMMENT '关联请求的链路追踪ID',
  PRIMARY KEY (id),
  KEY idx_fe_error_tenant (tenant_id),
  KEY idx_fe_error_level (level),
  KEY idx_fe_error_create_time (create_time),
  KEY idx_fe_error_user (user_id),
  KEY idx_fe_error_trace (tenant_id, trace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='前端错误日志表';

-- =========================================================
-- OA-P0-1 知识库版本管理
-- =========================================================
DROP TABLE IF EXISTS oa_knowledge_doc_version;
CREATE TABLE oa_knowledge_doc_version (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  document_id       BIGINT(20)      NOT NULL COMMENT '关联文档ID(oa_knowledge_document.document_id)',
  version_no        INT(11)         NOT NULL COMMENT '版本号(递增)',
  title             VARCHAR(255)    NOT NULL COMMENT '版本快照-标题',
  summary           VARCHAR(500)    DEFAULT NULL COMMENT '版本快照-摘要',
  content           LONGTEXT        NOT NULL COMMENT '版本快照-正文',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '版本快照-附件',
  change_summary    VARCHAR(500)    DEFAULT NULL COMMENT '版本说明(本次变更内容)',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  operator_name     VARCHAR(64)     DEFAULT NULL COMMENT '操作人姓名',
  publish_time      DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间(版本生成时间)',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_knowledge_version_tenant (tenant_id, document_id, version_no),
  KEY idx_knowledge_version_doc (tenant_id, document_id, version_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA知识库文档版本快照';

-- =========================================================
-- OA-P0-2 合同模板
-- =========================================================
DROP TABLE IF EXISTS oa_contract_template;
CREATE TABLE oa_contract_template (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  template_code     VARCHAR(60)     NOT NULL COMMENT '模板编码',
  template_name     VARCHAR(200)    NOT NULL COMMENT '模板名称',
  category          VARCHAR(60)     DEFAULT NULL COMMENT '模板类别(SALES/PURCHASE/SERVICE/RENT/OTHER)',
  content           LONGTEXT        NOT NULL COMMENT '模板正文HTML(支持{{partyA}}等占位符)',
  variables         JSON            DEFAULT NULL COMMENT '变量定义 [{code,name,type,required,defaultValue}]',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE/INACTIVE)',
  usage_count       INT(11)         DEFAULT 0 COMMENT '使用次数(被合同引用次数)',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_contract_template_code (tenant_id, template_code),
  KEY idx_contract_template_category (tenant_id, category, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA合同模板';

-- 注：oa_contract.template_id / idx_contract_template 已内嵌在 oa_contract CREATE 中

-- =========================================================
-- OA-P0-3 费用标准(超标审批分支)
-- =========================================================
DROP TABLE IF EXISTS oa_expense_standard;
CREATE TABLE oa_expense_standard (
  standard_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '费用标准ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  position_level    VARCHAR(60)     DEFAULT NULL COMMENT '职级编码(为空表示通用)',
  category          VARCHAR(30)     NOT NULL COMMENT '报销类别(TRAVEL/OFFICE/ENTERTAIN/TRANSPORT/OTHER)',
  city              VARCHAR(60)     DEFAULT NULL COMMENT '城市或区域(为空表示通用)',
  limit_amount      DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT '限额(单次)',
  limit_type        VARCHAR(20)     DEFAULT 'PER_ITEM' COMMENT '限额类型(PER_ITEM/DAILY/MONTHLY/YEARLY)',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE/INACTIVE)',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (standard_id),
  KEY idx_expense_standard_match (tenant_id, category, position_level, city, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA报销费用标准';

-- 注：biz_expense_claim.exceeded_* 已内嵌在 biz_expense_claim CREATE 中

-- =========================================================
-- OA-P1-1 合同履约里程碑 + 付款计划
-- =========================================================
DROP TABLE IF EXISTS oa_contract_milestone;
CREATE TABLE oa_contract_milestone (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  contract_id       BIGINT(20)      NOT NULL COMMENT '关联合同ID oa_contract.id',
  milestone_no      INT(11)         NOT NULL DEFAULT 1 COMMENT '里程碑序号(展示用)',
  milestone_name    VARCHAR(200)    NOT NULL COMMENT '里程碑名称',
  milestone_type    VARCHAR(30)     NOT NULL DEFAULT 'DELIVERY' COMMENT '类型(DELIVERY交付/PAYMENT付款/ACCEPTANCE验收/OTHER其他)',
  planned_date      DATE            DEFAULT NULL COMMENT '计划完成日期',
  actual_date       DATE            DEFAULT NULL COMMENT '实际完成日期',
  amount            DECIMAL(18,2)   DEFAULT NULL COMMENT '里程碑金额(可选)',
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT '状态(PENDING待开始/IN_PROGRESS进行中/DONE已完成/OVERDUE逾期/CANCELLED已取消)',
  owner_id          BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name        VARCHAR(100)    DEFAULT NULL COMMENT '负责人姓名',
  completion_remark VARCHAR(500)    DEFAULT NULL COMMENT '完成备注',
  attachment_url    VARCHAR(500)    DEFAULT NULL COMMENT '附件URL',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_contract_milestone_contract (tenant_id, contract_id, status),
  KEY idx_contract_milestone_planned (tenant_id, planned_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA合同履约里程碑';

DROP TABLE IF EXISTS oa_contract_payment_schedule;
CREATE TABLE oa_contract_payment_schedule (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  contract_id       BIGINT(20)      NOT NULL COMMENT '关联合同ID',
  milestone_id      BIGINT(20)      DEFAULT NULL COMMENT '关联里程碑ID(可空)',
  payment_no        INT(11)         NOT NULL DEFAULT 1 COMMENT '付款序号',
  payment_name      VARCHAR(200)    NOT NULL COMMENT '付款节点名称',
  plan_date         DATE            NOT NULL COMMENT '计划付款日期',
  actual_date       DATE            DEFAULT NULL COMMENT '实际付款日期',
  amount            DECIMAL(18,2)   NOT NULL COMMENT '应付金额',
  actual_amount     DECIMAL(18,2)   DEFAULT NULL COMMENT '实际付款金额',
  currency          VARCHAR(10)     DEFAULT 'CNY' COMMENT '币种',
  payee_id          BIGINT(20)      DEFAULT NULL COMMENT '收款方ID',
  payee_name        VARCHAR(200)    DEFAULT NULL COMMENT '收款方名称',
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT '状态(PENDING待付/PAID已付/OVERDUE逾期/CANCELLED已取消)',
  invoice_id        BIGINT(20)      DEFAULT NULL COMMENT '关联发票ID(可空)',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_contract_payment_contract (tenant_id, contract_id, status),
  KEY idx_contract_payment_plan (tenant_id, plan_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA合同付款计划';

-- =========================================================
-- OA-P1-2 会议纪要 + 出席记录
-- =========================================================
DROP TABLE IF EXISTS oa_meeting_minutes;
CREATE TABLE oa_meeting_minutes (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  meeting_id        BIGINT(20)      DEFAULT NULL COMMENT '会议ID(关联 sys_schedule 等)',
  meeting_title     VARCHAR(200)    DEFAULT NULL COMMENT '会议标题',
  meeting_time      DATETIME        DEFAULT NULL COMMENT '会议时间',
  room_id           VARCHAR(64)     DEFAULT NULL COMMENT '关联会议室ID',
  location          VARCHAR(200)    DEFAULT NULL COMMENT '会议地点/会议室',
  organizer_id      BIGINT(20)      DEFAULT NULL COMMENT '召集人ID',
  organizer_name    VARCHAR(100)    DEFAULT NULL COMMENT '召集人姓名',
  schedule_event_id BIGINT(20)      DEFAULT NULL COMMENT '关联日程事件ID',
  minutes_content   MEDIUMTEXT      DEFAULT NULL COMMENT '纪要正文(富文本HTML)',
  decisions         JSON            DEFAULT NULL COMMENT '决议项 [{title,owner,deadline,workTaskId}]',
  attachment_url    VARCHAR(500)    DEFAULT NULL COMMENT '附件URL列表(逗号分隔)',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT/CONFIRMED)',
  confirmed_time    DATETIME        DEFAULT NULL COMMENT '确认时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_meeting_minutes_meeting (tenant_id, meeting_id),
  KEY idx_meeting_minutes_status (tenant_id, status, meeting_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA会议纪要';

DROP TABLE IF EXISTS oa_meeting_attendance;
CREATE TABLE oa_meeting_attendance (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  minutes_id        BIGINT(20)      DEFAULT NULL COMMENT '纪要ID，会议开始前接受邀请时可为空',
  meeting_id        BIGINT(20)      DEFAULT NULL COMMENT '关联会议ID(冗余便于查询)',
  schedule_event_id BIGINT(20)      DEFAULT NULL COMMENT '明确关联的实际会议日程ID',
  acceptance_status VARCHAR(20)    NOT NULL DEFAULT 'NONE' COMMENT 'NONE或ACCEPTED或DECLINED或TENTATIVE',
  response_time     DATETIME        DEFAULT NULL COMMENT '邀请回应时间',
  invitation_version INT          NOT NULL DEFAULT 0 COMMENT '本次邀请对应日程通知版本',
  user_id           BIGINT(20)      NOT NULL COMMENT '参会人员ID',
  user_name         VARCHAR(100)    DEFAULT NULL COMMENT '参会人员姓名',
  attend_status     VARCHAR(20)     DEFAULT 'NOT_CHECKED' COMMENT '出席状态(ATTEND已出席/ABSENT缺席/LATE迟到/LEAVE请假/NOT_CHECKED未签到)',
  check_in_time     DATETIME        DEFAULT NULL COMMENT '签到时间',
  remark            VARCHAR(200)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_meeting_attendance_tenant (tenant_id, minutes_id, user_id),
  KEY idx_meeting_attendance_user (tenant_id, user_id),
  UNIQUE KEY uk_meeting_event_attendee (tenant_id, schedule_event_id, user_id),
  CONSTRAINT chk_meeting_acceptance CHECK (acceptance_status IN ('NONE','ACCEPTED','DECLINED','TENTATIVE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA会议出席记录';

DROP TABLE IF EXISTS oa_meeting_reminder;
CREATE TABLE oa_meeting_reminder (
  reminder_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '会议提醒ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  event_id          BIGINT(20)      NOT NULL COMMENT '实际会议日程ID',
  remind_minutes_before INT        NOT NULL COMMENT '提前分钟数，与CRM活动同义',
  channel_type      VARCHAR(20)     NOT NULL COMMENT '统一消息渠道类型',
  sent_flag         TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否已确认发送，与CRM活动同义',
  send_time         DATETIME        DEFAULT NULL COMMENT '实际发送时间',
  message_record_id BIGINT(20)      DEFAULT NULL COMMENT '统一消息记录ID',
  schedule_version  INT            NOT NULL COMMENT '会议本轮通知版本',
  due_time          DATETIME        NOT NULL COMMENT '预定触发时间',
  status            VARCHAR(20)     NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING或DISPATCHED或SENT或CANCELLED或FAILED',
  event_key         VARCHAR(128)    NOT NULL COMMENT '会议版本及提醒设置的唯一事件键',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (reminder_id),
  UNIQUE KEY uk_meeting_reminder_event (tenant_id, event_key),
  KEY idx_meeting_reminder_due (status, due_time, tenant_id),
  KEY idx_meeting_reminder_schedule (tenant_id, event_id, schedule_version),
  CONSTRAINT chk_meeting_reminder_minutes CHECK (remind_minutes_before BETWEEN 0 AND 43200)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='会议多提醒及改期通知版本';

-- =========================================================
-- OA-P1-3 知识库文档模板
-- =========================================================
DROP TABLE IF EXISTS oa_knowledge_template;
CREATE TABLE oa_knowledge_template (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  template_code     VARCHAR(60)     NOT NULL COMMENT '模板编码',
  template_name     VARCHAR(200)    NOT NULL COMMENT '模板名称',
  category          VARCHAR(60)     DEFAULT NULL COMMENT '分类(MEETING会议纪要/WEEKLY周报/REVIEW复盘/POLICY制度/OTHER)',
  summary           VARCHAR(500)    DEFAULT NULL COMMENT '模板摘要',
  content           MEDIUMTEXT      DEFAULT NULL COMMENT '模板正文(富文本HTML)',
  cover_url         VARCHAR(500)    DEFAULT NULL COMMENT '封面图URL',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE/INACTIVE)',
  usage_count       INT(11)         DEFAULT 0 COMMENT '使用次数',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_knowledge_template_code (tenant_id, template_code),
  KEY idx_knowledge_template_category (tenant_id, category, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA知识库文档模板';

-- =========================================================
-- OA-P0-3 合同金额阈值 (按金额区间路由审批层级)
-- =========================================================
DROP TABLE IF EXISTS oa_contract_amount_threshold;
CREATE TABLE oa_contract_amount_threshold (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  business_unit     VARCHAR(100)    DEFAULT NULL COMMENT '业务单元(可选: 部门/产品线/留空=全租户)',
  threshold_min     DECIMAL(18,2)   NOT NULL DEFAULT 0 COMMENT '金额下限(含)',
  threshold_max     DECIMAL(18,2)   DEFAULT NULL COMMENT '金额上限(不含,NULL=∞)',
  amount_tier       VARCHAR(20)     NOT NULL COMMENT '金额档位(T1/T2/T3,写入流程变量 amountTier)',
  approver_role     VARCHAR(60)     NOT NULL COMMENT '所需审批角色(DEPT_MGR/VP/CEO,写入流程变量 requiredApproverRole)',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE/INACTIVE)',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_contract_threshold_tenant (tenant_id, status, deleted),
  KEY idx_contract_threshold_range (tenant_id, threshold_min)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA合同金额审批阈值';

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 脚本执行完成
-- =========================================================
