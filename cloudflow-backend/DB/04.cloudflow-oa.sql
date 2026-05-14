-- =========================================================
-- CloudFlow Pro - OA办公模块数据库脚本
-- 模块：公告、日程、会议室、任务协作、资产、车辆、访客、值班管理
-- 版本：v1.0
-- 创建日期：2026-02-09
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 说明：本文件仅保留表结构与约束，初始化/演示种子数据已统一迁移至 06.cloudflow-business-seed.sql。

-- =========================================================
-- 一、公告与通知模块
-- =========================================================

-- 1. 系统公告表
DROP TABLE IF EXISTS sys_announcement;
CREATE TABLE sys_announcement (
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  PRIMARY KEY (announcement_id),
  KEY idx_announcement_tenant (tenant_id),
  KEY idx_announcement_status (status, is_top, priority)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='系统公告表';

-- 2. 公告阅读记录表
DROP TABLE IF EXISTS sys_announcement_read;
CREATE TABLE sys_announcement_read (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  announcement_id   BIGINT(20)      NOT NULL COMMENT '公告ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  read_time         DATETIME        DEFAULT NULL COMMENT '阅读时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_announcement_user (announcement_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公告阅读记录表';

-- =========================================================
-- 二、日程与会议室模块
-- =========================================================

-- 3. 会议室资源表
DROP TABLE IF EXISTS sys_meeting_room;
CREATE TABLE sys_meeting_room (
  room_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '会议室ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  name              VARCHAR(64)     NOT NULL COMMENT '会议室名称',
  capacity          INT(11)         DEFAULT NULL COMMENT '容量',
  location          VARCHAR(255)    DEFAULT NULL COMMENT '位置',
  equipment         VARCHAR(500)    DEFAULT NULL COMMENT '设备设施(JSON)',
  status            CHAR(1)         DEFAULT '1' COMMENT '状态 (1:可用, 0:维护中)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  PRIMARY KEY (room_id)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COMMENT='会议室资源表';

-- 4. 日程事件表
DROP TABLE IF EXISTS sys_schedule_event;
CREATE TABLE sys_schedule_event (
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
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  PRIMARY KEY (event_id),
  KEY idx_creator (creator_id),
  KEY idx_room_time (room_id, start_time, end_time),
  KEY idx_schedule_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='日程事件表';

-- =========================================================
-- 三、任务协作模块
-- =========================================================

-- 5. 协作任务表
DROP TABLE IF EXISTS sys_work_task;
CREATE TABLE sys_work_task (
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
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
DROP TABLE IF EXISTS sys_asset;
CREATE TABLE sys_asset (
  asset_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '资产ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  asset_code        VARCHAR(50)     NOT NULL COMMENT '资产编码',
  name              VARCHAR(100)    NOT NULL COMMENT '资产名称',
  category          VARCHAR(50)     DEFAULT NULL COMMENT '分类',
  model             VARCHAR(100)    DEFAULT NULL COMMENT '规格型号',
  status            CHAR(1)         DEFAULT '1' COMMENT '状态（1闲置 2在用 3维修 4报废 5丢失）',
  price             DECIMAL(10,2)   DEFAULT NULL COMMENT '价格',
  purchase_date     DATE            DEFAULT NULL COMMENT '采购日期',
  owner_id          BIGINT(20)      DEFAULT NULL COMMENT '当前领用人ID',
  location          VARCHAR(100)    DEFAULT NULL COMMENT '存放位置',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (asset_id),
  UNIQUE KEY uk_asset_code_tenant (asset_code, tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='固定资产表';

-- 9. 耗材库存表
DROP TABLE IF EXISTS sys_consumable;
CREATE TABLE sys_consumable (
  consumable_id     BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '耗材ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  name              VARCHAR(100)    NOT NULL COMMENT '耗材名称',
  model             VARCHAR(100)    DEFAULT NULL COMMENT '规格型号',
  unit              VARCHAR(20)     DEFAULT '个' COMMENT '单位',
  quantity          INT(11)         DEFAULT 0 COMMENT '库存数量',
  low_stock_threshold INT(11)       DEFAULT 10 COMMENT '预警阈值',
  default_supplier_id BIGINT(20)    DEFAULT NULL COMMENT '默认供应商ID',
  target_stock      INT(11)         DEFAULT 0 COMMENT '目标库存',
  warn_enabled      TINYINT(1)      DEFAULT 1 COMMENT '是否启用库存预警(1启用 0停用)',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (consumable_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材库存表';

-- 10. 供应商主数据表
DROP TABLE IF EXISTS sys_supplier;
CREATE TABLE sys_supplier (
  supplier_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '供应商ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  supplier_name     VARCHAR(100)    NOT NULL COMMENT '供应商名称',
  contact_name      VARCHAR(64)     DEFAULT NULL COMMENT '联系人',
  contact_phone     VARCHAR(30)     DEFAULT NULL COMMENT '联系电话',
  bank_name         VARCHAR(100)    DEFAULT NULL COMMENT '开户行',
  bank_account      VARCHAR(100)    DEFAULT NULL COMMENT '银行账号',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE启用/DISABLED停用)',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (supplier_id),
  KEY idx_supplier_tenant (tenant_id),
  KEY idx_supplier_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商主数据表';

-- 10. 资产变动日志表
DROP TABLE IF EXISTS sys_asset_log;
CREATE TABLE sys_asset_log (
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
  KEY idx_log_ref (ref_id, ref_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产变动日志表';

-- =========================================================
-- 六、车辆管理模块
-- =========================================================

-- 11. 车辆信息表
DROP TABLE IF EXISTS sys_vehicle;
CREATE TABLE sys_vehicle (
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (vehicle_id),
  KEY idx_vehicle_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='车辆信息表';

-- 12. 用车申请与记录表
DROP TABLE IF EXISTS sys_vehicle_usage;
CREATE TABLE sys_vehicle_usage (
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (usage_id),
  KEY idx_vehicle_usage_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='用车申请与记录表';

-- 13. 车辆费用记录表
DROP TABLE IF EXISTS sys_vehicle_expense;
CREATE TABLE sys_vehicle_expense (
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

DROP TABLE IF EXISTS sys_vehicle_maintenance;
CREATE TABLE sys_vehicle_maintenance (
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  PRIMARY KEY (maintenance_id),
  KEY idx_vehicle_maintenance_tenant (tenant_id),
  KEY idx_vehicle_maintenance_vehicle (vehicle_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='车辆维保记录表';

DROP TABLE IF EXISTS sys_vehicle_violation;
CREATE TABLE sys_vehicle_violation (
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  PRIMARY KEY (violation_id),
  KEY idx_vehicle_violation_tenant (tenant_id),
  KEY idx_vehicle_violation_vehicle (vehicle_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='车辆违章记录表';

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
  submitter_id      BIGINT(20)      NOT NULL COMMENT '提交人ID',
  submitter_name    VARCHAR(64)     DEFAULT NULL COMMENT '提交人姓名',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '提交人部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '提交人部门名称',
  submit_time       DATETIME        DEFAULT NULL COMMENT '提交审批时间',
  publish_time      DATETIME        DEFAULT NULL COMMENT '发布时间',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志(0正常 2删除)',
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
  UNIQUE KEY uk_knowledge_user (document_id, user_id),
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
  invoice_status    VARCHAR(20)     DEFAULT 'NONE' COMMENT '发票状态',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_claim_no (claim_no),
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
  amount            DECIMAL(10,2)   NOT NULL COMMENT '付款金额',
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
  invoice_status    VARCHAR(20)     DEFAULT 'NONE' COMMENT '发票状态',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_payment_no (payment_no),
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_purchase_no (purchase_no),
  KEY idx_purchase_user (user_id),
  KEY idx_purchase_status (status),
  KEY idx_purchase_payment_status (payment_status),
  KEY idx_purchase_supplier (supplier_id),
  KEY idx_purchase_tenant (tenant_id)
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
  PRIMARY KEY (id),
  KEY idx_purchase_item_purchase (purchase_id),
  KEY idx_purchase_item_consumable (consumable_id),
  KEY idx_purchase_item_tenant (tenant_id)
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志(0正常 2删除)',
  create_by         VARCHAR(64)     DEFAULT NULL COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT NULL COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_trip_no (trip_no),
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
  invoice_status    VARCHAR(20)     DEFAULT 'NONE' COMMENT '发票状态',
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志(0正常 1删除)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (contract_id),
  UNIQUE KEY uk_contract_no_tenant (contract_no, tenant_id),
  KEY idx_contract_tenant (tenant_id),
  KEY idx_contract_owner (owner_id),
  KEY idx_contract_dept (dept_id),
  KEY idx_contract_status (status),
  KEY idx_contract_end_date (end_date),
  KEY idx_contract_seal (seal_application_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='OA合同台账表';

DROP TABLE IF EXISTS oa_project;
CREATE TABLE oa_project (
  project_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '项目ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id        VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  project_no         VARCHAR(50)     NOT NULL COMMENT '项目编号',
  project_name       VARCHAR(200)    NOT NULL COMMENT '项目名称',
  project_type       VARCHAR(30)     DEFAULT 'DELIVERY' COMMENT '项目类型',
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
  priority           VARCHAR(20)     DEFAULT 'MEDIUM' COMMENT '优先级',
  status             VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态',
  risk_level         VARCHAR(20)     DEFAULT 'LOW' COMMENT '风险等级',
  source_type        VARCHAR(20)     DEFAULT 'MANUAL' COMMENT '来源类型',
  source_id          BIGINT(20)      DEFAULT NULL COMMENT '来源业务ID',
  source_name        VARCHAR(200)    DEFAULT NULL COMMENT '来源名称',
  baseline_version   INT(11)         DEFAULT 0 COMMENT '基线版本号',
  attachment_url     VARCHAR(1000)   DEFAULT NULL COMMENT '附件',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  del_flag           CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
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
  del_flag           CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_project_member (project_id, user_id),
  KEY idx_project_member_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目成员表';

DROP TABLE IF EXISTS oa_project_milestone;
CREATE TABLE oa_project_milestone (
  milestone_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '里程碑ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  project_id         BIGINT(20)      NOT NULL COMMENT '项目ID',
  milestone_name     VARCHAR(200)    NOT NULL COMMENT '里程碑名称',
  milestone_code     VARCHAR(50)     DEFAULT NULL COMMENT '里程碑编码',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name         VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  planned_date       DATE            DEFAULT NULL COMMENT '计划日期',
  baseline_date      DATE            DEFAULT NULL COMMENT '基线日期',
  actual_date        DATE            DEFAULT NULL COMMENT '实际日期',
  progress           DECIMAL(5,2)    DEFAULT 0.00 COMMENT '进度',
  sort_order         INT(11)         DEFAULT 0 COMMENT '排序',
  status             VARCHAR(20)     DEFAULT 'PLANNED' COMMENT '状态',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  del_flag           CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (milestone_id),
  KEY idx_project_milestone_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目里程碑表';

DROP TABLE IF EXISTS oa_project_risk;
CREATE TABLE oa_project_risk (
  risk_id            BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '项目风险ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  project_id         BIGINT(20)      NOT NULL COMMENT '项目ID',
  risk_code          VARCHAR(50)     NOT NULL COMMENT '风险编码',
  risk_name          VARCHAR(200)    NOT NULL COMMENT '风险名称',
  risk_level         VARCHAR(20)     DEFAULT 'MEDIUM' COMMENT '风险等级',
  status             VARCHAR(20)     DEFAULT 'OPEN' COMMENT '状态',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name         VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  trigger_source     VARCHAR(20)     DEFAULT 'MANUAL' COMMENT '触发来源',
  summary            VARCHAR(1000)   DEFAULT NULL COMMENT '风险说明',
  action_plan        VARCHAR(1000)   DEFAULT NULL COMMENT '应对计划',
  resolved_time      DATETIME        DEFAULT NULL COMMENT '关闭时间',
  del_flag           CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (risk_id),
  UNIQUE KEY uk_project_risk_code (project_id, risk_code),
  KEY idx_project_risk_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目风险表';

DROP TABLE IF EXISTS oa_project_dependency;
CREATE TABLE oa_project_dependency (
  dependency_id      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '依赖ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  project_id         BIGINT(20)      NOT NULL COMMENT '项目ID',
  predecessor_type   VARCHAR(20)     NOT NULL COMMENT '前置类型(MILESTONE/WBS)',
  predecessor_id     BIGINT(20)      NOT NULL COMMENT '前置对象ID',
  successor_type     VARCHAR(20)     NOT NULL COMMENT '后置类型(MILESTONE/WBS)',
  successor_id       BIGINT(20)      NOT NULL COMMENT '后置对象ID',
  dependency_type    VARCHAR(20)     DEFAULT 'FS' COMMENT '依赖类型',
  lag_days           INT(11)         DEFAULT 0 COMMENT '延迟天数',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  del_flag           CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (dependency_id),
  KEY idx_project_dependency_project (project_id),
  KEY idx_project_dependency_predecessor (predecessor_type, predecessor_id),
  KEY idx_project_dependency_successor (successor_type, successor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目依赖表';

DROP TABLE IF EXISTS oa_budget_subject;
CREATE TABLE oa_budget_subject (
  subject_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '预算科目ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  subject_code       VARCHAR(50)     NOT NULL COMMENT '科目编码',
  subject_name       VARCHAR(100)    NOT NULL COMMENT '科目名称',
  parent_id          BIGINT(20)      DEFAULT NULL COMMENT '父科目ID',
  subject_type       VARCHAR(20)     DEFAULT 'EXPENSE' COMMENT '科目类型',
  sort_order         INT(11)         DEFAULT 0 COMMENT '排序',
  enabled            TINYINT(1)      DEFAULT 1 COMMENT '是否启用',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  del_flag           CHAR(1)         DEFAULT '0' COMMENT '删除标志',
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
  period_type        VARCHAR(20)     DEFAULT 'ANNUAL' COMMENT '期间类型',
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
  del_flag           CHAR(1)         DEFAULT '0' COMMENT '删除标志',
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
  UNIQUE KEY uk_budget_line_subject (budget_id, subject_code),
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
  adjustment_type    VARCHAR(20)     DEFAULT 'ADD' COMMENT '调整类型',
  subject_code       VARCHAR(50)     DEFAULT NULL COMMENT '科目编码',
  subject_name       VARCHAR(100)    DEFAULT NULL COMMENT '科目名称',
  change_amount      DECIMAL(18,2)   NOT NULL COMMENT '调整金额',
  reason             VARCHAR(500)    NOT NULL COMMENT '调整原因',
  status             VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态',
  del_flag           CHAR(1)         DEFAULT '0' COMMENT '删除标志',
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
  target_type        VARCHAR(20)     NOT NULL COMMENT '目标类型',
  target_id          BIGINT(20)      NOT NULL COMMENT '目标ID',
  business_type      VARCHAR(30)     NOT NULL COMMENT '业务类型',
  business_id        BIGINT(20)      NOT NULL COMMENT '业务ID',
  business_no        VARCHAR(50)     DEFAULT NULL COMMENT '业务编号',
  subject_code       VARCHAR(50)     NOT NULL COMMENT '科目编码',
  subject_name       VARCHAR(100)    DEFAULT NULL COMMENT '科目名称',
  operation_type     VARCHAR(20)     NOT NULL COMMENT '操作类型(RESERVE/RELEASE/WRITEOFF/ADJUST)',
  amount             DECIMAL(18,2)   NOT NULL COMMENT '金额',
  available_after    DECIMAL(18,2)   DEFAULT 0.00 COMMENT '操作后可用余额',
  status             VARCHAR(20)     DEFAULT 'VALID' COMMENT '状态',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (ledger_id),
  KEY idx_budget_ledger_budget (budget_id),
  KEY idx_budget_ledger_business (business_type, business_id)
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
  status             VARCHAR(20)     DEFAULT 'REGISTERED' COMMENT '状态',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  del_flag           CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (invoice_id),
  UNIQUE KEY uk_invoice_unique (tenant_id, invoice_code, invoice_no),
  KEY idx_invoice_direction (invoice_direction),
  KEY idx_invoice_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发票主表';

DROP TABLE IF EXISTS oa_invoice_writeoff;
CREATE TABLE oa_invoice_writeoff (
  writeoff_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '核销ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  invoice_id         BIGINT(20)      NOT NULL COMMENT '发票ID',
  business_type      VARCHAR(30)     NOT NULL COMMENT '业务类型',
  business_id        BIGINT(20)      NOT NULL COMMENT '业务ID',
  business_no        VARCHAR(50)     DEFAULT NULL COMMENT '业务编号',
  writeoff_amount    DECIMAL(18,2)   NOT NULL COMMENT '核销金额',
  writeoff_date      DATE            DEFAULT NULL COMMENT '核销日期',
  remark             VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (writeoff_id),
  KEY idx_invoice_writeoff_invoice (invoice_id),
  KEY idx_invoice_writeoff_business (business_type, business_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发票核销表';

-- 19.1 OA统一链路事件表
DROP TABLE IF EXISTS oa_trace_event;
CREATE TABLE oa_trace_event (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  business_type     VARCHAR(30)     NOT NULL COMMENT '主业务类型(CONTRACT/APPROVAL/SEAL)',
  business_id       BIGINT(20)      NOT NULL COMMENT '主业务ID',
  related_type      VARCHAR(30)     DEFAULT NULL COMMENT '关联类型',
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志(0正常 1删除)',
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志(0正常 1删除)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_seal_application_no (application_no),
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志(0正常 1删除)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_seal_renewal_no (renewal_no),
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
  UNIQUE KEY uk_seal_expiry_round (seal_id, expire_date, days_before, recipient_id),
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志(0正常 1删除)',
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志(0正常 1删除)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_license_borrow_no (borrow_no),
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志(0正常 1删除)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_license_renewal_no (renewal_no),
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
  UNIQUE KEY uk_license_expiry_round (license_id, expire_date, days_before, recipient_id),
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
DROP TABLE IF EXISTS sys_visitor;
CREATE TABLE sys_visitor (
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
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT '状态(PENDING待确认/CONFIRMED已确认/ARRIVED已到访/COMPLETED已离开/CANCELLED已取消)',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by         VARCHAR(64)     DEFAULT NULL COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT NULL COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (visitor_id),
  KEY idx_visitor_tenant (tenant_id),
  KEY idx_visitor_host (host_id),
  KEY idx_visitor_date (visit_date),
  KEY idx_visitor_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='访客预约表';

-- =========================================================
-- 十三、值班排班模块
-- =========================================================

-- 23. 值班排班计划表
DROP TABLE IF EXISTS sys_duty_schedule;
CREATE TABLE sys_duty_schedule (
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
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
DROP TABLE IF EXISTS sys_frontend_error_log;
CREATE TABLE sys_frontend_error_log (
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
  PRIMARY KEY (id),
  KEY idx_fe_error_tenant (tenant_id),
  KEY idx_fe_error_level (level),
  KEY idx_fe_error_create_time (create_time),
  KEY idx_fe_error_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='前端错误日志表';

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 脚本执行完成
-- =========================================================

