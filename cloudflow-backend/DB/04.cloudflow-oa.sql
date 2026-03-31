-- =========================================================
-- CloudFlow Pro - OA办公模块数据库脚本
-- 模块：公告、日程、会议室、任务协作、资产、车辆、访客、值班管理
-- 版本：v1.0
-- 创建日期：2026-02-09
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

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
  priority          INT(4)          DEFAULT 1 COMMENT '优先级 (0:低, 1:中, 2:高)',
  status            VARCHAR(20)     DEFAULT 'TODO' COMMENT '状态 (TODO, DOING, DONE)',
  due_date          DATETIME        DEFAULT NULL COMMENT '截止时间',
  tags              VARCHAR(500)    DEFAULT NULL COMMENT '标签 (JSON数组)',
  parent_id         BIGINT(20)      DEFAULT NULL COMMENT '父任务ID',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  PRIMARY KEY (task_id),
  KEY idx_assignee (assignee_id),
  KEY idx_owner (owner_id),
  KEY idx_work_task_dept (dept_id),
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (consumable_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材库存表';

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
  receipt_url       VARCHAR(255)    DEFAULT NULL COMMENT '票据图片URL',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (expense_id),
  KEY idx_vehicle_expense_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='车辆费用记录表';

-- =========================================================
-- 七、业务表（与工作流关联，OA 范围）
-- =========================================================

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
  receipt_url       VARCHAR(255)    DEFAULT NULL COMMENT '票据图片URL',
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
  attachment_url    VARCHAR(255)    DEFAULT NULL COMMENT '附件URL',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT草稿/PENDING审批中/APPROVED已通过/REJECTED已驳回/PAID已打款)',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
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
  project_name      VARCHAR(200)    DEFAULT NULL COMMENT '关联项目名称',
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

-- 24. 前端错误日志表
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

-- =========================================================
-- 初始化数据
-- =========================================================

-- 1. 初始化公告数据
INSERT INTO sys_announcement (title, content, type, scope_type, status, priority, sender_id, create_time, create_by) VALUES 
('关于系统OA模块升级的通知', '<p>各位同事：</p><p>系统将于本周五晚进行升级，新增任务管理和公告中心模块，请知悉。</p>', '1', 'ALL', '1', 'H', 1, NOW(), 'admin'),
('2026年春节放假安排', '<p>春节放假7天，请各位同事提前安排好工作。</p>', '2', 'ALL', '1', 'M', 1, NOW(), 'admin');

-- 2. 初始化会议室数据
INSERT INTO sys_meeting_room (name, capacity, location, equipment, status, create_time) VALUES 
('大会议室A', 50, '3楼东侧', '["投影仪", "音响", "白板"]', '1', NOW()),
('小会议室B', 10, '3楼西侧', '["电视", "白板"]', '1', NOW()),
('VIP接待室', 8, '4楼', '["沙发", "茶具"]', '1', NOW());

-- 3. 初始化日程数据
INSERT INTO sys_schedule_event (title, description, start_time, end_time, is_all_day, type, room_id, creator_id, attendees, create_time) VALUES 
('项目周会', '本周工作进度汇报', DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL '1 1' DAY_HOUR), 0, 'MEETING', 1, 1, '[1,2]', NOW()),
('拜访客户', '去客户现场演示Demo', DATE_ADD(NOW(), INTERVAL 2 DAY), DATE_ADD(NOW(), INTERVAL 2 DAY), 1, 'WORK', NULL, 1, '[]', NOW());

-- 4. 初始化任务数据
INSERT INTO sys_work_task (title, description, assignee_id, owner_id, priority, status, create_time, create_by) VALUES 
('完成OA系统任务管理模块设计', '包括数据库设计和前后端接口定义', 1, 1, 2, 'DONE', NOW(), 'admin'),
('开发任务看板功能', '前端使用 dnd-kit 实现拖拽看板', 1, 1, 2, 'DOING', NOW(), 'admin'),
('编写用户手册', '更新系统使用文档', 1, 1, 1, 'TODO', NOW(), 'admin');

-- 6. 初始化值班排班示例数据
INSERT INTO sys_duty_schedule (title, schedule_type, duty_date, shift_type, start_time, end_time, user_id, user_name, dept_id, location, duty_content, status, create_by, create_time) VALUES
('周一日常值班', 'DAILY', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'DAY', '09:00:00', '18:00:00', 1, 'admin', NULL, '前台', '负责来访接待和电话转接', 'SCHEDULED', 'admin', NOW()),
('周一夜班值班', 'DAILY', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'NIGHT', '18:00:00', '09:00:00', 1, 'admin', NULL, '监控室', '负责安全巡查和监控', 'SCHEDULED', 'admin', NOW());

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 脚本执行完成
-- =========================================================

-- =========================================================
-- 五、展示环境高饱满模拟数据（原 05.cloudflow-demo-showcase.sql 已并入）
-- 说明：本段依赖 01、02、04 前文表结构与基础数据
-- =========================================================
-- =========================================================
-- CloudFlow Pro - 展示用高饱满模拟数据脚本
-- 说明：
-- 1. 本脚本依赖 01.cloudflow-common.sql、02.cloudflow-workflow.sql、04.cloudflow-oa.sql 已先执行
-- 2. 本脚本仅插入“用于演示”的关联数据，不创建表结构
-- 3. 所有用户、部门、角色引用均基于 01.cloudflow-common.sql 的初始化数据
-- 4. 建议在开发 / 演示环境使用
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================================================
-- 一、清理当前演示数据（仅清理本脚本使用的演示编号，避免污染原始测试数据）
-- =========================================================

-- -----------------------------
-- 1.1 工作流关联数据清理
-- -----------------------------
DELETE FROM wf_task_read WHERE task_id IN (
  'demo_task_002','demo_task_003','demo_task_004','demo_task_007','demo_task_008','demo_task_011','demo_task_012','demo_task_013',
  'demo_task_014'
);

DELETE FROM wf_task_urge WHERE task_id IN (
  'demo_task_002','demo_task_004','demo_task_007','demo_task_011','demo_task_014'
);

DELETE FROM wf_task_attachment WHERE task_id IN (
  'demo_task_002','demo_task_004','demo_task_007','demo_task_011','demo_task_014'
);

DELETE FROM wf_task_delegation WHERE task_id IN (
  'demo_task_004','demo_task_011'
);

DELETE FROM wf_task_candidate WHERE task_id IN (
  'demo_task_002','demo_task_004','demo_task_011','demo_task_014'
);

DELETE FROM wf_task_add_sign WHERE add_sign_id IN (
  'demo_addsign_001','demo_addsign_002'
);

DELETE FROM wf_countersign_vote WHERE countersign_id IN (
  'demo_cs_003','demo_cs_011'
);

DELETE FROM wf_countersign_task WHERE countersign_id IN (
  'demo_cs_003','demo_cs_011'
);

DELETE FROM wf_process_snapshot WHERE instance_id IN (
  'demo_inst_003','demo_inst_005','demo_inst_011'
);

DELETE FROM wf_node_record WHERE instance_id IN (
  'demo_inst_003','demo_inst_005','demo_inst_011','demo_inst_012'
);

DELETE FROM wf_notification_log WHERE related_id IN (
  'demo_inst_003','demo_inst_005','demo_inst_011','demo_inst_012'
);

DELETE FROM wf_urge_effect WHERE task_id IN (
  'demo_task_002','demo_task_004','demo_task_007','demo_task_011','demo_task_014'
);

DELETE FROM wf_process_copy WHERE instance_id IN (
  'demo_inst_003','demo_inst_005','demo_inst_011','demo_inst_012'
);

DELETE FROM wf_transaction_message WHERE business_id IN (
  'demo_inst_003','demo_inst_005','demo_inst_011','demo_inst_012'
);

DELETE FROM wf_deploy_impact WHERE id IN (98001,98002);
DELETE FROM wf_deploy_rollback_history WHERE id IN (98001);
DELETE FROM wf_deploy_record WHERE id IN (98001,98002);
DELETE FROM wf_notification_config WHERE config_id IN ('demo_notify_001','demo_notify_002');
DELETE FROM workflow_version WHERE id IN ('demo_tpl_vehicle_001_v1');
DELETE FROM workflow_archive WHERE id IN ('demo_archive_001');
DELETE FROM wf_audit_log WHERE id IN ('demo_audit_001');
DELETE FROM workflow_template WHERE id IN ('demo_tpl_vehicle_001');

DELETE FROM wf_task_history WHERE history_id IN (
  'demo_hist_003','demo_hist_004','demo_hist_005','demo_hist_006','demo_hist_009','demo_hist_011','demo_hist_012','demo_hist_015',
  'demo_hist_016','demo_hist_017','demo_hist_018','demo_hist_021','demo_hist_022'
);

DELETE FROM wf_task WHERE task_id IN (
  'demo_task_002','demo_task_003','demo_task_004','demo_task_007','demo_task_008','demo_task_011','demo_task_012','demo_task_013',
  'demo_task_014'
);

DELETE FROM wf_process_instance WHERE instance_id IN (
  'demo_inst_003','demo_inst_004','demo_inst_005','demo_inst_006','demo_inst_011','demo_inst_012'
);

-- -----------------------------
-- 1.2 业务表数据清理
-- -----------------------------
DELETE FROM biz_expense_item WHERE claim_id IN (9001,9002);
DELETE FROM biz_expense_claim WHERE claim_no IN ('BX202603110001','BX202603110002');
DELETE FROM biz_payment_request WHERE payment_no IN ('FK202603110001','FK202603110002');
DELETE FROM biz_business_trip WHERE trip_no IN ('CC202603110001','CC202603110002');

DELETE FROM sys_vehicle_expense WHERE expense_id IN (9101,9102,9103,9104,9105,9106,9107,9108);
DELETE FROM sys_vehicle_usage WHERE usage_id IN (9001,9002,9003,9004,9005);
DELETE FROM sys_vehicle WHERE vehicle_id IN (9001,9002,9003);

DELETE FROM sys_asset_log WHERE log_id IN (9201,9202,9203,9204,9205,9206,9207,9208,9209,9210,9211,9212,9213,9214);
DELETE FROM sys_asset WHERE asset_id IN (9001,9002,9003,9004,9005);
DELETE FROM sys_consumable WHERE consumable_id IN (9001,9002,9003,9004,9005);

DELETE FROM sys_file WHERE file_id IN (91001,91002,91003,91004);
DELETE FROM sys_log WHERE log_id IN (91001,91002,91003,91004);
DELETE FROM sys_audit_log WHERE audit_id IN (91001,91002);
DELETE FROM sys_file WHERE file_id BETWEEN 92000 AND 92300;
DELETE FROM sys_log WHERE log_id BETWEEN 92000 AND 92300;
DELETE FROM sys_audit_log WHERE audit_id BETWEEN 92000 AND 92300;

DELETE FROM sys_work_task WHERE task_id IN (9401,9402,9403,9404,9405,9406,9407,9408,9409,9410,9411,9412,9413,9414);
DELETE FROM sys_schedule_event WHERE event_id IN (9501,9502,9503,9504,9505,9506,9507,9508,9509,9510);
DELETE FROM sys_meeting_room WHERE room_id IN (9001,9002,9003,9004);
DELETE FROM sys_announcement_read WHERE announcement_id IN (9601,9602,9603,9604,9605);
DELETE FROM sys_announcement WHERE announcement_id IN (9601,9602,9603,9604,9605);
DELETE FROM sys_visitor WHERE visitor_id IN (9701,9702,9703,9704,9705,9706,9707);
DELETE FROM sys_duty_schedule WHERE schedule_id IN (9801,9802,9803,9804,9805,9806);
DELETE FROM sys_frontend_error_log WHERE id IN (9901,9902,9903,9904,9905,9906);
DELETE FROM sys_frontend_error_log WHERE id BETWEEN 99200 AND 99500;
DELETE FROM sys_announcement_read WHERE announcement_id IN (9601,9602,9603,9604,9605) AND user_id IN (1,2,3,4,5,6,7,8,9) AND read_time >= DATE_SUB(NOW(), INTERVAL 40 DAY);

-- =========================================================
-- 二、OA 模块展示数据
-- =========================================================

-- -----------------------------
-- 2.1 公告与阅读记录
-- -----------------------------
INSERT INTO sys_announcement (
  announcement_id, tenant_id, title, content, type, scope_type, scope_value, status, priority, is_top,
  sender_id, publish_time, expire_time, create_by, create_time, update_by, update_time, del_flag
) VALUES
(9601, 100000, '2026年第一季度经营复盘会议通知',
 '<p><strong>会议主题：</strong>第一季度经营复盘与第二季度目标拆解</p><p>请研发、财务、HR、法务负责人准备汇报材料，并于会前 1 小时上传至共享盘。</p>',
 '2', 'ALL', NULL, '1', 'H', 1, 1, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_ADD(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 4 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 3 DAY), '0'),
(9602, 100000, '差旅报销时效要求提醒',
 '<p>自本周起，出差结束后 <strong>5 个工作日内</strong> 需提交报销单，逾期需补充说明。</p>',
 '1', 'ALL', NULL, '1', 'M', 0, 3, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_ADD(NOW(), INTERVAL 30 DAY), 'wang', DATE_SUB(NOW(), INTERVAL 2 DAY), 'wang', DATE_SUB(NOW(), INTERVAL 2 DAY), '0'),
(9603, 100000, '研发环境发布窗口调整说明',
 '<p>每周三、周五 19:00-21:00 为统一发布窗口，紧急变更需走审批流程并同步值班人员。</p>',
 '1', 'DEPT', '101', '1', 'H', 0, 7, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 15 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 1 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 1 DAY), '0'),
(9604, 100000, '客户到访接待规范更新',
 '<p>行政部已更新客户到访接待 SOP，请各部门注意访客预约至少提前 2 小时提交。</p>',
 '2', 'ALL', NULL, '1', 'M', 0, 1, DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_ADD(NOW(), INTERVAL 45 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR), '0'),
(9605, 100000, '演示环境数据已刷新',
 '<p>今日 09:00 已完成演示环境模拟数据刷新，可用于客户汇报与培训演示。</p>',
 '3', 'ROLE', '1,2,3,4', '1', 'H', 1, 1, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_ADD(NOW(), INTERVAL 7 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 1 HOUR), '0');

INSERT INTO sys_announcement_read (tenant_id, announcement_id, user_id, read_time) VALUES
(100000, 9601, 2, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(100000, 9601, 3, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(100000, 9601, 4, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(100000, 9601, 5, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(100000, 9602, 3, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(100000, 9602, 5, DATE_SUB(NOW(), INTERVAL 18 HOUR)),
(100000, 9603, 2, DATE_SUB(NOW(), INTERVAL 20 HOUR)),
(100000, 9603, 8, DATE_SUB(NOW(), INTERVAL 10 HOUR)),
(100000, 9604, 1, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(100000, 9604, 4, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(100000, 9605, 1, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
(100000, 9605, 2, DATE_SUB(NOW(), INTERVAL 20 MINUTE)),
(100000, 9605, 3, DATE_SUB(NOW(), INTERVAL 18 MINUTE)),
(100000, 9605, 4, DATE_SUB(NOW(), INTERVAL 15 MINUTE)),
(100000, 9601, 6, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(100000, 9602, 7, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(100000, 9603, 9, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(100000, 9604, 6, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(100000, 9605, 7, DATE_SUB(NOW(), INTERVAL 12 MINUTE)),
(100000, 9605, 8, DATE_SUB(NOW(), INTERVAL 9 MINUTE));

-- -----------------------------
-- 2.2 会议室与日程
-- -----------------------------
INSERT INTO sys_meeting_room (
  room_id, tenant_id, name, capacity, location, equipment, status, create_by, create_time, update_by, update_time, del_flag
) VALUES
(9001, 100000, '创新协作厅', 30, '5楼东区', '["4K大屏","无线投屏","视频会议终端","电子白板"]', '1', 'admin', DATE_SUB(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY), '0'),
(9002, 100000, '客户演示中心', 16, '1楼展厅', '["LED屏","演示主机","音响","录播设备"]', '1', 'admin', DATE_SUB(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 DAY), '0'),
(9003, 100000, '战略会议室', 12, '6楼南侧', '["视频会议终端","书写屏","保密门禁"]', '1', 'admin', DATE_SUB(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 DAY), '0'),
(9004, 100000, '培训教室', 60, '2楼西区', '["投影仪","扩声音响","录课摄像头","移动麦克风"]', '0', 'admin', DATE_SUB(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 3 HOUR), '0');

INSERT INTO sys_schedule_event (
  event_id, tenant_id, title, description, start_time, end_time, is_all_day, type, room_id, creator_id, attendees, create_time, update_time, del_flag
) VALUES
(9501, 100000, 'Q1经营复盘会', '管理层汇总 Q1 经营指标、重点项目进展与风险项。', DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 1 DAY), INTERVAL 2 HOUR), 0, 'MEETING', 9003, 1, '[1,2,3,4,6,7]', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 6 HOUR), '0'),
(9502, 100000, '智慧园区项目客户演示', '面向星河集团展示流程引擎、OA 协同、可视化报表。', DATE_ADD(NOW(), INTERVAL 2 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 2 DAY), INTERVAL 3 HOUR), 0, 'MEETING', 9002, 2, '[2,5,8,9]', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 3 HOUR), '0'),
(9503, 100000, '研发迭代计划评审', '确认下个迭代的需求优先级、上线窗口和人力安排。', DATE_ADD(NOW(), INTERVAL 8 HOUR), DATE_ADD(DATE_ADD(NOW(), INTERVAL 8 HOUR), INTERVAL 90 MINUTE), 0, 'WORK', 9001, 2, '[2,5,8,9]', DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), '0'),
(9504, 100000, '供应商合同谈判', '与供应商讨论年度服务框架协议和 SLA 条款。', DATE_ADD(NOW(), INTERVAL 3 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 3 DAY), INTERVAL 2 HOUR), 0, 'MEETING', 9003, 6, '[3,6]', DATE_SUB(NOW(), INTERVAL 10 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), '0'),
(9505, 100000, '年度团建筹备事项跟进', '行政、HR、部门经理共同确认团建预算、交通与场地。', DATE_ADD(NOW(), INTERVAL 4 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 4 DAY), INTERVAL 1 HOUR), 0, 'MEETING', 9001, 4, '[1,2,4]', DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), '0'),
(9506, 100000, '张三客户现场拜访', '陪同销售团队进行流程平台上线前培训。', DATE_ADD(NOW(), INTERVAL 5 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 5 DAY), INTERVAL 8 HOUR), 1, 'WORK', NULL, 5, '[5]', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), '0'),
(9507, 100000, '流程引擎性能评审会', '讨论流程引擎在峰值场景下的性能与优化方案。', DATE_ADD(NOW(), INTERVAL 6 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 6 DAY), INTERVAL 2 HOUR), 0, 'MEETING', 9003, 1, '[1,2,7,9]', DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), '0'),
(9508, 100000, '财务预算复核', '梳理各部门季度预算执行情况与调整建议。', DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 1 DAY), INTERVAL 90 MINUTE), 0, 'WORK', 9001, 3, '[3,4,6]', DATE_SUB(NOW(), INTERVAL 9 HOUR), DATE_SUB(NOW(), INTERVAL 7 HOUR), '0'),
(9509, 100000, '新人入职培训', '新员工入职流程、制度与系统培训。', DATE_ADD(NOW(), INTERVAL 3 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 3 DAY), INTERVAL 3 HOUR), 0, 'MEETING', 9004, 4, '[4,5,8]', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), '0'),
(9510, 100000, '客户远程支持', '远程协助客户完成流程配置与数据导入。', DATE_ADD(NOW(), INTERVAL 2 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 2 DAY), INTERVAL 4 HOUR), 1, 'WORK', NULL, 7, '[7,9]', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR), '0');

-- -----------------------------
-- 2.3 协作任务
-- -----------------------------
INSERT INTO sys_work_task (
  task_id, tenant_id, title, description, assignee_id, owner_id, dept_id, priority, status, due_date, tags, parent_id,
  create_by, create_time, update_by, update_time, del_flag
) VALUES
(9401, 100000, '准备客户演示环境', '确认账号、流程模板、看板数据与大屏演示脚本均可用。', 7, 1, 105, 2, 'DOING', DATE_ADD(NOW(), INTERVAL 1 DAY), '["演示","环境","高优"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 2 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0'),
(9402, 100000, '导出演示用审批截图', '截取待办、已办、抄送、流程轨迹、催办与加签场景。', 8, 7, 106, 2, 'DOING', DATE_ADD(NOW(), INTERVAL 20 HOUR), '["前端","截图","演示"]', 9401, 'chen', DATE_SUB(NOW(), INTERVAL 1 DAY), 'test_fe', DATE_SUB(NOW(), INTERVAL 1 HOUR), '0'),
(9403, 100000, '整理财务付款案例材料', '准备 SaaS 年框付款流程、合同附件、银行信息。', 3, 1, 102, 2, 'TODO', DATE_ADD(NOW(), INTERVAL 2 DAY), '["财务","付款","案例"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 10 HOUR), 'wang', DATE_SUB(NOW(), INTERVAL 10 HOUR), '0'),
(9404, 100000, '完善员工出差制度 FAQ', '结合近期出差与报销问题补充常见问答。', 4, 1, 103, 1, 'TODO', DATE_ADD(NOW(), INTERVAL 4 DAY), '["HR","制度","知识库"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 8 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 8 HOUR), '0'),
(9405, 100000, '合同审批模板优化', '增加法务会签说明、风险提示和附件校验规则。', 6, 1, 104, 2, 'DOING', DATE_ADD(NOW(), INTERVAL 3 DAY), '["法务","模板","流程"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 12 HOUR), 'liu', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0'),
(9406, 100000, '清点备用笔记本库存', '核对设备编号、领用状态、维修与借用记录。', 7, 1, 105, 1, 'DONE', DATE_SUB(NOW(), INTERVAL 1 DAY), '["资产","盘点","IT"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 3 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 20 HOUR), '0'),
(9407, 100000, '访客接待动线演练', '为大型客户到访准备接待流程与前台物料。', 4, 1, 103, 1, 'TODO', DATE_ADD(NOW(), INTERVAL 2 DAY), '["访客","接待","行政"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 4 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 4 HOUR), '0'),
(9408, 100000, '访客通行二维码问题排查', '复现偶发二维码刷新失败与前台核验异常，输出问题清单。', 9, 7, 107, 2, 'DOING', DATE_ADD(NOW(), INTERVAL 36 HOUR), '["访客","前台","缺陷"]', NULL, 'chen', DATE_SUB(NOW(), INTERVAL 15 HOUR), 'test_be', DATE_SUB(NOW(), INTERVAL 3 HOUR), '0'),
(9409, 100000, '更新客户演示讲解稿', '梳理本周演示流程亮点与常见问题回答。', 8, 1, 106, 2, 'TODO', DATE_ADD(NOW(), INTERVAL 2 DAY), '["演示","讲解","前端"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'test_fe', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0'),
(9410, 100000, '完善预算执行报表', '补充财务看板数据并检查异常指标。', 3, 1, 102, 2, 'DOING', DATE_ADD(NOW(), INTERVAL 1 DAY), '["财务","报表","看板"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY), 'wang', DATE_SUB(NOW(), INTERVAL 3 HOUR), '0'),
(9411, 100000, '整理发布回滚预案', '汇总常见回滚步骤与联系人列表。', 7, 1, 105, 1, 'TODO', DATE_ADD(NOW(), INTERVAL 3 DAY), '["运维","发布","回滚"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 9 HOUR), 'chen', DATE_SUB(NOW(), INTERVAL 4 HOUR), '0'),
(9412, 100000, '修订访客接待SOP', '补充贵宾接待流程与安全检查清单。', 4, 1, 103, 1, 'TODO', DATE_ADD(NOW(), INTERVAL 5 DAY), '["行政","SOP","访客"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 7 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 6 HOUR), '0'),
(9413, 100000, '合同附件合规复核', '检查合同附件完整性与签署规范。', 6, 1, 104, 2, 'DOING', DATE_ADD(NOW(), INTERVAL 2 DAY), '["法务","合同","合规"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'liu', DATE_SUB(NOW(), INTERVAL 3 HOUR), '0'),
(9414, 100000, '用车申请移动端体验优化', '收集试用反馈并输出移动端提交流程优化建议。', 9, 7, 107, 2, 'TODO', DATE_ADD(NOW(), INTERVAL 4 DAY), '["用车","移动端","体验"]', NULL, 'chen', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'test_be', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0');

-- -----------------------------
-- 2.5 资产、耗材与日志
-- -----------------------------
INSERT INTO sys_asset (
  asset_id, tenant_id, asset_code, name, category, model, status, price, purchase_date, owner_id, location, remark,
  del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 'IT-LAP-2024-001', 'MacBook Pro 14 开发机', '笔记本电脑', 'Apple M3 Pro 36GB/1TB', '2', 18999.00, '2024-06-18', 8, '研发部工位A-12', '前端演示专用设备', '0', 'chen', DATE_SUB(NOW(), INTERVAL 200 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 5 DAY)),
(9002, 100000, 'IT-LAP-2024-002', 'ThinkPad X1 Carbon', '笔记本电脑', 'i7/32GB/1TB', '2', 13999.00, '2024-07-01', 9, '后端组工位B-06', '后端联调与现场支持', '0', 'chen', DATE_SUB(NOW(), INTERVAL 180 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9003, 100000, 'IT-PAD-2025-001', 'iPad Pro 演示终端', '平板设备', '11英寸 512G', '1', 7999.00, '2025-01-10', NULL, 'IT资产柜 2 层', '客户接待演示备用', '0', 'chen', DATE_SUB(NOW(), INTERVAL 60 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(9004, 100000, 'OFF-PRJ-2023-001', '激光投影仪', '会议设备', 'EPSON CB-2255U', '2', 6599.00, '2023-10-20', 7, '客户演示中心', '绑定演示厅固定设备', '0', 'admin', DATE_SUB(NOW(), INTERVAL 400 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 10 DAY)),
(9005, 100000, 'IT-SRV-2024-001', '应用演示服务器', '服务器', 'Dell R760 64C/256GB', '3', 46800.00, '2024-05-08', NULL, '机房 R2-08', '近期进行硬盘阵列维护', '0', 'chen', DATE_SUB(NOW(), INTERVAL 250 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 8 HOUR));

INSERT INTO sys_consumable (
  consumable_id, tenant_id, name, model, unit, quantity, low_stock_threshold, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 'A4打印纸', '70g/500张', '箱', 26, 8, '0', 'admin', DATE_SUB(NOW(), INTERVAL 30 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9002, 100000, '黑色硒鼓', 'HP 138A', '支', 5, 6, '0', 'admin', DATE_SUB(NOW(), INTERVAL 30 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(9003, 100000, '便签纸', '76x76mm', '包', 18, 5, '0', 'admin', DATE_SUB(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9004, 100000, '工牌挂绳', '标准蓝色', '根', 42, 10, '0', 'admin', DATE_SUB(NOW(), INTERVAL 25 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9005, 100000, '演示用 HDMI 线', '2米 4K', '根', 3, 4, '0', 'chen', DATE_SUB(NOW(), INTERVAL 12 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 2 HOUR));

INSERT INTO sys_asset_log (
  log_id, tenant_id, ref_id, ref_type, type, quantity_change, operator_id, target_id, remark, create_time
) VALUES
(9201, 100000, 9001, '1', '领用', 1, 7, 8, '前端演示负责人长期领用', DATE_SUB(NOW(), INTERVAL 40 DAY)),
(9202, 100000, 9002, '1', '领用', 1, 7, 9, '后端现场支持设备发放', DATE_SUB(NOW(), INTERVAL 35 DAY)),
(9203, 100000, 9003, '1', '盘点', 0, 7, NULL, '演示平板库存正常', DATE_SUB(NOW(), INTERVAL 3 DAY)),
(9204, 100000, 9005, '1', '维修', 0, 7, NULL, 'RAID 卡异常，已送检', DATE_SUB(NOW(), INTERVAL 8 HOUR)),
(9205, 100000, 9001, '2', '出库', -4, 1, NULL, '行政集中领用打印纸用于培训资料', DATE_SUB(NOW(), INTERVAL 6 DAY)),
(9206, 100000, 9002, '2', '出库', -2, 7, NULL, '客户演示中心打印机更换硒鼓', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9207, 100000, 9005, '2', '入库', 6, 7, NULL, '补充 HDMI 线缆', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9208, 100000, 9004, '2', '盘点', 0, 1, NULL, '工牌挂绳数量正常', DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(9209, 100000, 9003, '1', '领用', 1, 7, 5, '演示平板借用给产品经理', DATE_SUB(NOW(), INTERVAL 12 HOUR)),
(9210, 100000, 9002, '1', '归还', -1, 7, 9, '现场支持设备归还入库', DATE_SUB(NOW(), INTERVAL 9 HOUR)),
(9211, 100000, 9001, '1', '盘点', 0, 1, NULL, '月度资产盘点记录', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9212, 100000, 9004, '1', '维修', 0, 7, NULL, '投影仪灯泡更换', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9213, 100000, 9001, '2', '入库', 10, 1, NULL, '补充办公用品入库', DATE_SUB(NOW(), INTERVAL 3 DAY)),
(9214, 100000, 9003, '2', '出库', -3, 7, NULL, '外勤现场备品领用', DATE_SUB(NOW(), INTERVAL 10 HOUR));

-- -----------------------------
-- 2.6 车辆、用车与费用
-- -----------------------------
INSERT INTO sys_vehicle (
  vehicle_id, tenant_id, license_plate, brand, model, color, capacity, status, mileage, purchase_date, insurance_expiry, location,
  remark, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, '沪A-CF001', '别克', 'GL8 ES', '黑色', 7, '3', 28650.50, '2023-06-01', '2026-08-31', '总部地库 A 区', '客户接待与商务出行主力车辆', '0', 'admin', DATE_SUB(NOW(), INTERVAL 600 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(9002, 100000, '沪A-CF002', '特斯拉', 'Model Y', '白色', 5, '1', 15280.00, '2024-03-12', '2026-03-28', '总部地库 B 区', '适合市区短途接待', '0', 'admin', DATE_SUB(NOW(), INTERVAL 360 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9003, 100000, '沪A-CF003', '大众', '帕萨特', '银色', 5, '4', 43120.00, '2022-11-20', '2026-05-16', '维修厂', '右前轮毂维修中', '0', 'admin', DATE_SUB(NOW(), INTERVAL 820 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 12 HOUR));

INSERT INTO sys_vehicle_usage (
  usage_id, tenant_id, vehicle_id, applicant_id, driver_id, start_time, end_time, destination, return_location, is_round_trip, reason,
  passenger_count, passengers, start_mileage, end_mileage, actual_start_time, actual_end_time, attachment_url, status, process_instance_id,
  del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 9001, 2, 7, DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 1 DAY), INTERVAL 6 HOUR), '浦东新区星河集团总部', '总部地库 A 区', 1,
 '客户高层商务拜访及产品演示', 4, '李经理,张三,前端测试,后端测试', 28650.50, NULL, NULL, NULL,
 'https://demo.cloudflow.local/files/vehicle/usage-9001-approval.pdf', '0', 'demo_inst_012', '0', 'li', DATE_SUB(NOW(), INTERVAL 3 HOUR), 'li', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(9002, 100000, 9002, 4, 7, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 4 HOUR, '虹桥人才中心', '总部地库 B 区', 1,
 '招聘专场宣讲与候选人面谈接送', 3, '赵HR,行政接待,候选人代表', 15140.00, 15210.00, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 4 HOUR,
 'https://demo.cloudflow.local/files/vehicle/usage-9002-summary.pdf', '4', NULL, '0', 'zhao', DATE_SUB(NOW(), INTERVAL 3 DAY), 'zhao', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9003, 100000, 9003, 1, 7, DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY) + INTERVAL 1 HOUR, '市区维修中心', '维修厂', 0,
 '送修车辆，处理异响与刹车保养', 1, '陈IT', 43080.00, 43120.00, DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY) + INTERVAL 1 HOUR,
 'https://demo.cloudflow.local/files/vehicle/maintenance/repair-order-9003.jpg', '4', NULL, '0', 'admin', DATE_SUB(NOW(), INTERVAL 8 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 7 DAY)),
(9004, 100000, 9001, 5, 7, DATE_ADD(NOW(), INTERVAL 2 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 2 DAY), INTERVAL 5 HOUR), '浦东新区创新园区', '总部地库 A 区', 1,
 '客户现场演示与方案沟通', 3, '张三,前端测试,后端测试', 28650.50, NULL, NULL, NULL,
 'https://demo.cloudflow.local/files/vehicle/usage-9004-approval.pdf', '0', NULL, '0', 'zhang', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'zhang', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(9005, 100000, 9002, 3, 7, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY) + INTERVAL 3 HOUR, '静安区客户培训点', '总部地库 B 区', 1,
 '财务系统客户培训接送', 2, '王财务,客户代表', 15210.00, 15280.00, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY) + INTERVAL 3 HOUR,
 'https://demo.cloudflow.local/files/vehicle/usage-9005-summary.pdf', '4', NULL, '0', 'wang', DATE_SUB(NOW(), INTERVAL 2 DAY), 'wang', DATE_SUB(NOW(), INTERVAL 1 DAY));

INSERT INTO sys_vehicle_expense (
  expense_id, tenant_id, vehicle_id, usage_id, expense_type, amount, expense_date, description, receipt_url, create_by, create_time
) VALUES
(9101, 100000, 9002, 9002, '1', 268.50, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '招聘活动往返油费', 'https://demo.cloudflow.local/files/vehicle/receipts/fuel-9101.jpg', 'zhao', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9102, 100000, 9002, 9002, '3', 48.00, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '人才中心停车费', 'https://demo.cloudflow.local/files/vehicle/receipts/park-9102.jpg', 'zhao', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9103, 100000, 9003, 9003, '4', 1860.00, DATE_SUB(CURDATE(), INTERVAL 6 DAY), '刹车片与轮胎检查维修', 'https://demo.cloudflow.local/files/vehicle/receipts/repair-9103.jpg', 'admin', DATE_SUB(NOW(), INTERVAL 6 DAY)),
(9104, 100000, 9001, NULL, '5', 5200.00, DATE_SUB(CURDATE(), INTERVAL 25 DAY), '年度商业险续保', 'https://demo.cloudflow.local/files/vehicle/receipts/insurance-9104.pdf', 'admin', DATE_SUB(NOW(), INTERVAL 25 DAY)),
(9105, 100000, 9001, 9004, '1', 320.00, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '客户演示往返油费', 'https://demo.cloudflow.local/files/vehicle/receipts/fuel-9105.jpg', 'zhang', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9106, 100000, 9001, 9004, '3', 36.00, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '园区停车费', 'https://demo.cloudflow.local/files/vehicle/receipts/park-9106.jpg', 'zhang', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9107, 100000, 9001, NULL, '2', 120.00, DATE_SUB(CURDATE(), INTERVAL 5 DAY), '洗车与基础保养', 'https://demo.cloudflow.local/files/vehicle/receipts/wash-9107.jpg', 'admin', DATE_SUB(NOW(), INTERVAL 5 DAY)),
(9108, 100000, 9002, 9005, '4', 980.00, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '培训期间临时维修', 'https://demo.cloudflow.local/files/vehicle/receipts/repair-9108.jpg', 'wang', DATE_SUB(NOW(), INTERVAL 1 DAY));

-- -----------------------------
-- 2.7 访客与值班
-- -----------------------------
INSERT INTO sys_visitor (
  visitor_id, tenant_id, visitor_name, visitor_phone, visitor_company, visitor_count, id_card, visit_reason, host_id, host_name, host_dept,
  visit_date, visit_time_start, visit_time_end, actual_arrive, actual_leave, visit_area, car_plate, belongings, photo_url, pass_code,
  status, remark, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9701, 100000, '孙总', '13900010001', '星河集团', 3, '3101********1234', '智慧园区项目合作洽谈', 2, '李经理', '研发部',
 DATE_ADD(CURDATE(), INTERVAL 2 DAY), '10:00:00', '12:30:00', NULL, NULL, '1楼展厅,6楼战略会议室', '沪B88888', '演示样册,客户名片', 'https://demo.cloudflow.local/files/visitor/9701.jpg', 'VST2026031101',
 'CONFIRMED', '需安排投影与茶歇', '0', 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(9702, 100000, '何老师', '13900010002', '城市大学', 2, '3202********5678', '校企合作交流', 4, '赵HR', '人力资源部',
 DATE_ADD(CURDATE(), INTERVAL 1 DAY), '14:00:00', '16:00:00', NULL, NULL, '5楼创新协作厅', NULL, '笔记本电脑', 'https://demo.cloudflow.local/files/visitor/9702.jpg', 'VST2026031102',
 'PENDING', '需安排校招资料', '0', 'zhao', DATE_SUB(NOW(), INTERVAL 4 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(9703, 100000, '陈顾问', '13900010003', '智策咨询', 1, '3303********9012', '财务流程优化咨询', 3, '王财务', '财务部',
 DATE_SUB(CURDATE(), INTERVAL 1 DAY), '09:30:00', '11:30:00', DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR + INTERVAL 20 MINUTE, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 11 HOUR + INTERVAL 45 MINUTE,
 '3楼财务会议区', NULL, '平板电脑', 'https://demo.cloudflow.local/files/visitor/9703.jpg', 'VST2026031003',
 'COMPLETED', '已完成咨询会议', '0', 'wang', DATE_SUB(NOW(), INTERVAL 30 HOUR), 'wang', DATE_SUB(NOW(), INTERVAL 20 HOUR)),
(9704, 100000, '王经理', '13900010004', '云启科技', 2, '3404********3456', '合同谈判及法务条款确认', 6, '刘法务', '法务部',
 CURDATE(), '15:00:00', '17:00:00', CURDATE() + INTERVAL 14 HOUR + INTERVAL 50 MINUTE, NULL, '6楼战略会议室', '苏A12345', '合同草案,公司章程复印件',
 'https://demo.cloudflow.local/files/visitor/9704.jpg', 'VST2026031104', 'ARRIVED', '法务部已接待', '0', 'liu', DATE_SUB(NOW(), INTERVAL 3 HOUR), 'liu', DATE_SUB(NOW(), INTERVAL 10 MINUTE)),
(9705, 100000, '周总监', '13900010005', '星航科技', 2, '3105********4567', '流程平台战略合作沟通', 2, '李经理', '研发部',
 DATE_ADD(CURDATE(), INTERVAL 3 DAY), '13:30:00', '15:30:00', NULL, NULL, '5楼创新协作厅', '沪C66666', '演示方案,合同意向书', 'https://demo.cloudflow.local/files/visitor/9705.jpg', 'VST2026031105',
 'CONFIRMED', '需安排会议资料', '0', 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(9706, 100000, '刘老师', '13900010006', '南方理工大学', 1, '3206********7890', '校企实习合作对接', 4, '赵HR', '人力资源部',
 DATE_ADD(CURDATE(), INTERVAL 2 DAY), '09:00:00', '11:00:00', NULL, NULL, '2楼西区培训教室', NULL, '讲义资料', 'https://demo.cloudflow.local/files/visitor/9706.jpg', 'VST2026031106',
 'PENDING', '需准备实习岗位材料', '0', 'zhao', DATE_SUB(NOW(), INTERVAL 1 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 1 HOUR)),
(9707, 100000, '顾女士', '13900010007', '远航咨询', 1, '3307********2345', '流程优化诊断复盘', 3, '王财务', '财务部',
 DATE_SUB(CURDATE(), INTERVAL 2 DAY), '14:00:00', '16:30:00', DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 14 HOUR + INTERVAL 5 MINUTE, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 16 HOUR + INTERVAL 20 MINUTE,
 '3楼财务会议区', NULL, '笔记本电脑', 'https://demo.cloudflow.local/files/visitor/9707.jpg', 'VST2026031007',
 'COMPLETED', '完成流程优化复盘', '0', 'wang', DATE_SUB(NOW(), INTERVAL 50 HOUR), 'wang', DATE_SUB(NOW(), INTERVAL 40 HOUR));

INSERT INTO sys_duty_schedule (
  schedule_id, tenant_id, title, schedule_type, duty_date, shift_type, start_time, end_time, user_id, user_name,
  backup_user_id, backup_user_name, dept_id, dept_name, location, duty_content, check_in_time, check_out_time, status,
  swap_reason, remark, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9801, 100000, '客户演示日值班', 'EMERGENCY', DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'DAY', '08:30:00', '18:30:00', 7, '陈IT', 9, '后端测试', 105, 'IT部',
 '客户演示中心', '保障演示网络、投屏、应用服务稳定运行', NULL, NULL, 'SCHEDULED', NULL, '重要客户演示专项保障', '0', 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(9802, 100000, '发布窗口晚间值班', 'DAILY', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'NIGHT', '18:00:00', '23:30:00', 9, '后端测试', 7, '陈IT', 107, '后端组',
 '监控室', '负责观察发布告警、接口异常与回滚预案', NULL, NULL, 'SCHEDULED', NULL, '与周三发布窗口联动', '0', 'chen', DATE_SUB(NOW(), INTERVAL 8 HOUR), 'chen', DATE_SUB(NOW(), INTERVAL 8 HOUR)),
(9803, 100000, '行政前台接待值班', 'DAILY', CURDATE(), 'DAY', '09:00:00', '18:00:00', 4, '赵HR', 1, 'Admin', 103, '人力资源部',
 '前台', '负责访客登记、快递签收、会议支持', CURDATE() + INTERVAL 8 HOUR + INTERVAL 55 MINUTE, NULL, 'CHECKED_IN', NULL, '今日有两批客户来访', '0', 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY), 'zhao', DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
(9804, 100000, '周末安全巡检值班', 'HOLIDAY', DATE_ADD(CURDATE(), INTERVAL 4 DAY), 'FULL', '09:00:00', '21:00:00', 1, 'Admin', 7, '陈IT', 100, 'CloudFlow 科技',
 '总部办公区', '检查机房、电源、空调与办公区门禁状态', NULL, NULL, 'SCHEDULED', NULL, '节前安全巡查', '0', 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(9805, 100000, '客户上线支持值班', 'EMERGENCY', DATE_ADD(CURDATE(), INTERVAL 5 DAY), 'NIGHT', '20:00:00', '02:00:00', 7, '陈IT', 9, '后端测试', 105, 'IT部',
 '客户机房', '保障客户上线期间接口与数据库稳定', NULL, NULL, 'SCHEDULED', NULL, '客户上线专项保障', '0', 'admin', DATE_SUB(NOW(), INTERVAL 4 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(9806, 100000, '季度资产盘点值班', 'TEMP', DATE_ADD(CURDATE(), INTERVAL 6 DAY), 'DAY', '09:00:00', '17:00:00', 7, '陈IT', 8, '前端测试', 105, 'IT部',
 '资产仓库', '完成季度资产盘点与出入库核对', NULL, NULL, 'SCHEDULED', NULL, '盘点专项任务', '0', 'admin', DATE_SUB(NOW(), INTERVAL 3 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 3 HOUR));

-- -----------------------------
-- 2.8 前端错误日志（用于演示监控与排错）
-- -----------------------------
INSERT INTO sys_frontend_error_log (
  id, tenant_id, message, stack, component_stack, context, url, user_agent, level, tags, extra, client_ip,
  user_id, user_name, client_time, create_time
) VALUES
(9901, 100000, '流程详情页渲染附件列表失败',
 'TypeError: Cannot read properties of undefined (reading ''map'')',
 'at AttachmentPanel (src/pages/workflow/ProcessDetail.tsx:128)\nat ProcessDetail',
 '流程详情页打开已办任务',
 '/workflow/process/detail/demo_inst_004',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 'error',
 JSON_OBJECT('module','workflow','page','ProcessDetail','env','demo'),
 JSON_OBJECT('instanceId','demo_inst_004','taskId','demo_task_011','browser','Chrome'),
 '10.10.0.25', 8, '前端测试', DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(9902, 100000, '访客预约二维码加载失败',
 'Error: geolocation permission denied',
 'at MobileVisitorPass (src/mobile/pages/VisitorPass.tsx:86)\nat VisitorPassPage',
 '访客预约页面加载通行二维码',
 '/mobile/visitor/pass',
 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15',
 'warning',
 JSON_OBJECT('module','visitor','page','MobileVisitorPass','env','demo'),
 JSON_OBJECT('visitorId',9702,'device','iPhone 15','network','4G'),
 '10.10.0.36', 5, '张三', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(9903, 100000, '日程页面数据加载超时',
 'AxiosError: timeout of 10000ms exceeded',
 'at SchedulePage (src/pages/SchedulePage.tsx:53)\nat App',
 '日程页面加载当日数据',
 '/schedule',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 'info',
 JSON_OBJECT('module','oa','page','SchedulePage','env','demo'),
 JSON_OBJECT('queryDate',DATE_FORMAT(CURDATE(), '%Y-%m-%d'),'retry',1),
 '10.10.0.18', 1, 'Admin', DATE_SUB(NOW(), INTERVAL 70 MINUTE), DATE_SUB(NOW(), INTERVAL 70 MINUTE)),
(9904, 100000, '公告中心列表加载缓慢',
 'AxiosError: timeout of 5000ms exceeded',
 'at AnnouncementList (src/pages/AnnouncementPage.tsx:44)\nat App',
 '公告中心首次加载',
 '/announcement',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 'warning',
 JSON_OBJECT('module','oa','page','AnnouncementPage','env','demo'),
 JSON_OBJECT('query','latest','retry',1),
 '10.10.0.22', 4, '赵HR', DATE_SUB(NOW(), INTERVAL 50 MINUTE), DATE_SUB(NOW(), INTERVAL 50 MINUTE)),
(9905, 100000, '用车申请列表筛选异常',
 'TypeError: Cannot read properties of undefined (reading ''filter'')',
 'at VehicleUsageList (src/pages/admin/vehicle/VehicleUsageList.tsx:218)\nat Admin',
 '用车申请列表按状态筛选',
 '/admin/vehicle/usage',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 'error',
 JSON_OBJECT('module','vehicle','page','VehicleUsageList','env','demo'),
 JSON_OBJECT('status','PENDING','userId',7),
 '10.10.0.23', 7, '陈IT', DATE_SUB(NOW(), INTERVAL 35 MINUTE), DATE_SUB(NOW(), INTERVAL 35 MINUTE)),
(9906, 100000, '值班安排保存失败',
 'AxiosError: Request failed with status code 500',
 'at DutyScheduleForm (src/pages/admin/duty/DutyScheduleForm.tsx:190)\nat Admin',
 '值班安排保存',
 '/admin/duty/schedule',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 'error',
 JSON_OBJECT('module','duty','page','DutyScheduleForm','env','demo'),
 JSON_OBJECT('scheduleId',9803,'action','save'),
 '10.10.0.24', 7, '陈IT', DATE_SUB(NOW(), INTERVAL 20 MINUTE), DATE_SUB(NOW(), INTERVAL 20 MINUTE));

INSERT INTO sys_file (
  file_id, tenant_id, file_name, file_path, url, storage_type, file_size, file_type, create_by, create_time, del_flag, remark
) VALUES
(91001, 100000, '年度运维合同.pdf', '/demo/workflow/payment/service-contract.pdf',
 'https://demo.cloudflow.local/files/payment/fk202603110001-contract.pdf', 'LOCAL', 1864022, 'application/pdf', 'wang', DATE_SUB(NOW(), INTERVAL 13 HOUR), '0', '付款合同存档'),
(91002, 100000, '访客接待物料清单.xlsx', '/demo/oa/visitor/reception-checklist.xlsx',
 'https://demo.cloudflow.local/files/visitor/reception-checklist.xlsx', 'LOCAL', 102400, 'application/xlsx', 'test_fe', DATE_SUB(NOW(), INTERVAL 6 HOUR), '0', '访客接待物料准备清单'),
(91003, 100000, '客户演示议程.pdf', '/demo/workflow/trip/training-agenda.pdf',
 'https://demo.cloudflow.local/files/trip/cc202603110001-plan.pdf', 'LOCAL', 280600, 'application/pdf', 'zhang', DATE_SUB(NOW(), INTERVAL 9 HOUR), '0', '客户培训资料归档'),
(91004, 100000, '用车派车记录.docx', '/demo/workflow/vehicle/dispatch-note.docx',
 'https://demo.cloudflow.local/files/vehicle/dispatch-note.docx', 'LOCAL', 86530, 'application/docx', 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY), '0', '派车记录模板');

INSERT INTO sys_log (
  log_id, tenant_id, log_type, title, service_id, remote_addr, user_agent, request_uri, method, params, time, exception, create_by, create_time
) VALUES
(91001, 100000, '0', '流程实例查询', 'cloudflow-workflow', '10.10.0.18',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 '/api/workflow/instance/list', 'GET', '{"status":"RUNNING","page":1}', 120, NULL, 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(91002, 100000, '9', '流程模板发布失败', 'cloudflow-workflow', '10.10.0.20',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 '/api/workflow/template/deploy', 'POST', '{"templateId":"demo_tpl_vehicle_001"}', 560, '模板校验未通过', 'admin', DATE_SUB(NOW(), INTERVAL 10 DAY)),
(91003, 100000, '0', '用车申请列表查询', 'cloudflow-oa', '10.10.0.21',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 '/api/oa/vehicle/usage/list', 'GET', '{"status":"PENDING","page":1}', 95, NULL, 'admin', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(91004, 100000, '9', '值班安排保存失败', 'cloudflow-oa', '10.10.0.24',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 '/api/oa/duty/schedule', 'POST', '{"scheduleId":9803}', 420, '数据库连接超时', 'chen', DATE_SUB(NOW(), INTERVAL 20 MINUTE));

INSERT INTO sys_audit_log (
  audit_id, tenant_id, audit_name, audit_field, before_val, after_val, create_by, create_time
) VALUES
(91001, 100000, '流程模板变更', 'status', 'draft', 'published', 'admin', DATE_SUB(NOW(), INTERVAL 12 DAY)),
(91002, 100000, '值班安排变更', 'start_time', '09:00:00', '08:30:00', 'admin', DATE_SUB(NOW(), INTERVAL 9 DAY));

-- =========================================================
-- 三、业务申请表 + 工作流实例联动数据
-- =========================================================

-- -----------------------------
-- 3.1 报销申请
-- -----------------------------
INSERT INTO biz_expense_claim (
  id, tenant_id, instance_id, user_id, user_name, claim_no, category, total_amount, description, status,
  dept_id, dept_name, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 'demo_inst_003', 5, '张三', 'BX202603110001', 'TRAVEL', 2680.50,
 '上海至杭州客户现场差旅报销，包含高铁、住宿、市内交通与餐补。',
 'PENDING', 101, '研发部', '0', 'zhang', DATE_SUB(NOW(), INTERVAL 16 HOUR), 'zhang', DATE_SUB(NOW(), INTERVAL 16 HOUR)),
(9002, 100000, 'demo_inst_004', 3, '王财务', 'BX202603110002', 'OFFICE', 860.00,
 '财务部采购档案盒、票据夹及打印耗材的部门报销。',
 'PAID', 102, '财务部', '0', 'wang', DATE_SUB(NOW(), INTERVAL 8 DAY), 'wang', DATE_SUB(NOW(), INTERVAL 3 DAY));

INSERT INTO biz_expense_item (
  id, tenant_id, claim_id, expense_type, amount, expense_date, description, receipt_url, vehicle_expense_id
) VALUES
(90011, 100000, 9001, 'TRANSPORT', 560.00, DATE_SUB(CURDATE(), INTERVAL 3 DAY), '上海虹桥往返杭州东高铁票', 'https://demo.cloudflow.local/files/expense/bx9001-train.jpg', NULL),
(90012, 100000, 9001, 'HOTEL', 980.50, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '杭州客户附近酒店住宿一晚', 'https://demo.cloudflow.local/files/expense/bx9001-hotel.jpg', NULL),
(90013, 100000, 9001, 'MEAL', 260.00, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '出差期间餐补', 'https://demo.cloudflow.local/files/expense/bx9001-meal.jpg', NULL),
(90014, 100000, 9001, 'TRANSPORT', 880.00, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '杭州当地网约车与机场巴士', 'https://demo.cloudflow.local/files/expense/bx9001-taxi.jpg', NULL),
(90021, 100000, 9002, 'OFFICE', 320.00, DATE_SUB(CURDATE(), INTERVAL 9 DAY), '票据档案盒采购', 'https://demo.cloudflow.local/files/expense/bx9002-box.jpg', NULL),
(90022, 100000, 9002, 'OFFICE', 540.00, DATE_SUB(CURDATE(), INTERVAL 9 DAY), '打印耗材与财务标签纸', 'https://demo.cloudflow.local/files/expense/bx9002-print.jpg', NULL);

-- -----------------------------
-- 3.2 付款申请
-- -----------------------------
INSERT INTO biz_payment_request (
  id, tenant_id, instance_id, user_id, user_name, payment_no, payee_name, payee_account, payee_bank, amount,
  payment_type, reason, expected_date, attachment_url, status, dept_id, dept_name, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 'demo_inst_005', 3, '王财务', 'FK202603110001', '上海星河云服科技有限公司', '31050100012345678901', '建设银行上海分行', 128000.00,
 'SERVICE', '支付企业流程平台年度运维与驻场服务费（第一期）。', DATE_ADD(CURDATE(), INTERVAL 3 DAY),
 'https://demo.cloudflow.local/files/payment/fk202603110001-contract.pdf',
 'PENDING', 102, '财务部', '0', 'wang', DATE_SUB(NOW(), INTERVAL 14 HOUR), 'wang', DATE_SUB(NOW(), INTERVAL 14 HOUR)),
(9002, 100000, 'demo_inst_006', 3, '王财务', 'FK202603110002', '杭州云启科技有限公司', '6222020202020202020', '招商银行杭州分行', 32000.00,
 'PURCHASE', '支付客户演示中心升级所需显示设备采购尾款。', DATE_SUB(CURDATE(), INTERVAL 2 DAY),
 'https://demo.cloudflow.local/files/payment/fk202603110002-invoice.pdf',
 'PAID', 102, '财务部', '0', 'wang', DATE_SUB(NOW(), INTERVAL 10 DAY), 'wang', DATE_SUB(NOW(), INTERVAL 4 DAY));

-- -----------------------------
-- 3.3 出差申请
-- -----------------------------
INSERT INTO biz_business_trip (
  id, tenant_id, instance_id, user_id, user_name, trip_no, departure, destination, start_date, end_date, trip_days,
  transport_type, estimated_cost, accommodation, contact_phone, emergency_contact, emergency_phone, project_name, companions,
  reason, itinerary, attachment_url, status, dept_id, dept_name, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 'demo_inst_011', 5, '张三', 'CC202603110001', '上海', '杭州',
 DATE_ADD(CURDATE(), INTERVAL 2 DAY), DATE_ADD(CURDATE(), INTERVAL 4 DAY), 3.0,
 'TRAIN', 3200.00, 'SELF', '15888880001', '李经理', '15888880002', '智慧园区二期项目', '["前端测试"]',
 '赴客户现场完成流程平台演示、用户培训与需求确认。',
 '[{"date":"第1天","plan":"到达客户现场并部署演示环境"},{"date":"第2天","plan":"开展培训与流程配置辅导"},{"date":"第3天","plan":"需求评审与返程"}]',
 'https://demo.cloudflow.local/files/trip/cc202603110001-plan.pdf',
 'PENDING', 101, '研发部', '0', 'zhang', DATE_SUB(NOW(), INTERVAL 11 HOUR), 'zhang', DATE_SUB(NOW(), INTERVAL 11 HOUR)),
(9002, 100000, NULL, 4, '赵HR', 'CC202603110002', '上海', '南京',
 DATE_SUB(CURDATE(), INTERVAL 12 DAY), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 3.0,
 'TRAIN', 2400.00, 'COMPANY', '15888880003', 'Admin', '15888880004', '校企合作拓展', '["Admin"]',
 '参加高校招聘双选会并洽谈校企合作。',
 '[{"date":"第1天","plan":"到达南京并布置展位"},{"date":"第2天","plan":"进行宣讲与面试"},{"date":"第3天","plan":"回访院系并返程"}]',
 'https://demo.cloudflow.local/files/trip/cc202603110002-summary.pdf',
 'APPROVED', 103, '人力资源部', '0', 'zhao', DATE_SUB(NOW(), INTERVAL 13 DAY), 'zhao', DATE_SUB(NOW(), INTERVAL 10 DAY));

-- -----------------------------
-- 3.4 用车审批业务（与工作流直接关联）
-- -----------------------------
-- 说明：sys_vehicle_usage.usage_id = 9001 已在上文插入，并绑定 process_instance_id = demo_inst_012

-- =========================================================
-- 四、工作流实例、任务、轨迹、通知、抄送、催办、附件等展示数据
-- =========================================================

-- -----------------------------
-- 4.1 流程实例
-- -----------------------------
INSERT INTO wf_process_instance (
  instance_id, tenant_id, process_def_key, definition_id, business_key, title, start_user_id, start_user_name,
  status, start_time, end_time, variables, priority, process_no, dept_id, create_by, update_by, create_time, update_time,
  del_flag, parent_instance_id, parent_node_key
) VALUES
('demo_inst_003', 100000, 'biz_reimburse', 'wf_reimburse', 'EXPENSE_CLAIM:9001', '张三的杭州出差报销', 5, '张三',
 'RUNNING', DATE_SUB(NOW(), INTERVAL 16 HOUR), NULL,
 JSON_OBJECT('claimNo','BX202603110001','amount',2680.50,'category','TRAVEL','deptName','研发部'),
 'HIGH', 'PROC-DEMO-20260311-003', 101, 'zhang', 'zhang', DATE_SUB(NOW(), INTERVAL 16 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), '0', NULL, NULL),

('demo_inst_004', 100000, 'biz_reimburse', 'wf_reimburse', 'EXPENSE_CLAIM:9002', '王财务的办公采购报销', 3, '王财务',
 'COMPLETED', DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY),
 JSON_OBJECT('claimNo','BX202603110002','amount',860.00,'category','OFFICE','deptName','财务部'),
 'NORMAL', 'PROC-DEMO-20260311-004', 102, 'wang', 'wang', DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY), '0', NULL, NULL),

('demo_inst_005', 100000, 'biz_payment', 'wf_payment', 'PAYMENT_REQUEST:9001', '年度运维服务付款申请', 3, '王财务',
 'RUNNING', DATE_SUB(NOW(), INTERVAL 14 HOUR), NULL,
 JSON_OBJECT('paymentNo','FK202603110001','amount',128000.00,'paymentType','SERVICE','deptName','财务部'),
 'URGENT', 'PROC-DEMO-20260311-005', 102, 'wang', 'wang', DATE_SUB(NOW(), INTERVAL 14 HOUR), DATE_SUB(NOW(), INTERVAL 30 MINUTE), '0', NULL, NULL),

('demo_inst_006', 100000, 'biz_payment', 'wf_payment', 'PAYMENT_REQUEST:9002', '显示设备采购尾款付款申请', 3, '王财务',
 'COMPLETED', DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY),
 JSON_OBJECT('paymentNo','FK202603110002','amount',32000.00,'paymentType','PURCHASE','deptName','财务部'),
 'NORMAL', 'PROC-DEMO-20260311-006', 102, 'wang', 'wang', DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY), '0', NULL, NULL),

('demo_inst_011', 100000, 'business_trip', 'wf_business_trip', 'BUSINESS_TRIP:9001', '张三的杭州客户出差申请', 5, '张三',
 'RUNNING', DATE_SUB(NOW(), INTERVAL 11 HOUR), NULL,
 JSON_OBJECT('tripNo','CC202603110001','destination','杭州','tripDays',3.0,'projectName','智慧园区二期项目'),
 'URGENT', 'PROC-DEMO-20260311-011', 101, 'zhang', 'zhang', DATE_SUB(NOW(), INTERVAL 11 HOUR), DATE_SUB(NOW(), INTERVAL 40 MINUTE), '0', NULL, NULL),

('demo_inst_012', 100000, 'vehicle_approval', 'wf_vehicle_approval', 'VEHICLE_USAGE:9001', '李经理的客户拜访用车申请', 2, '李经理',
 'RUNNING', DATE_SUB(NOW(), INTERVAL 3 HOUR), NULL,
 JSON_OBJECT('usageId',9001,'vehicleId',9001,'destination','浦东新区星河集团总部','passengerCount',4),
 'HIGH', 'PROC-DEMO-20260311-012', 101, 'li', 'li', DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 20 MINUTE), '0', NULL, NULL);

-- -----------------------------
-- 4.2 当前待办任务
-- -----------------------------
INSERT INTO wf_task (
  task_id, tenant_id, instance_id, node_key, node_name, assignee, assignee_name, proxy_user_id, candidate_roles,
  status, priority, is_timeout, create_time, due_time
) VALUES
('demo_task_002', 100000, 'demo_inst_003', 'b2', '财务总监审批', 3, '王财务', NULL, 'finance', 'TODO', 'HIGH', 1, DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_ADD(NOW(), INTERVAL 6 HOUR)),
('demo_task_003', 100000, 'demo_inst_005', 'n1', '财务主管审批', 3, '王财务', NULL, 'finance', 'DONE', 'URGENT', 0, DATE_SUB(NOW(), INTERVAL 14 HOUR), DATE_SUB(NOW(), INTERVAL 8 HOUR)),
('demo_task_004', 100000, 'demo_inst_005', 'b2', '总经理审批', 1, 'Admin', NULL, 'admin', 'TODO', 'URGENT', 0, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_ADD(NOW(), INTERVAL 10 HOUR)),
('demo_task_007', 100000, 'demo_inst_011', 'n1', '部门经理审批', 2, '李经理', NULL, 'manager', 'TODO', 'URGENT', 0, DATE_SUB(NOW(), INTERVAL 11 HOUR), DATE_ADD(NOW(), INTERVAL 20 HOUR)),
('demo_task_008', 100000, 'demo_inst_012', 'n1', '直属上级审批', 1, 'Admin', NULL, 'admin', 'TODO', 'HIGH', 0, DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_ADD(NOW(), INTERVAL 12 HOUR)),
('demo_task_011', 100000, 'demo_inst_004', 'n1', '直属上级审批', 1, 'Admin', NULL, 'admin', 'APPROVED', 'NORMAL', 0, DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY)),
('demo_task_012', 100000, 'demo_inst_004', 'b1', '财务主管审批', 3, '王财务', NULL, 'finance', 'APPROVED', 'NORMAL', 0, DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)),
('demo_task_013', 100000, 'demo_inst_006', 'n1', '财务主管审批', 3, '王财务', NULL, 'finance', 'APPROVED', 'NORMAL', 0, DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 8 DAY)),
('demo_task_014', 100000, 'demo_inst_006', 'b1', '财务总监审批', 3, '王财务', NULL, 'finance', 'APPROVED', 'NORMAL', 0, DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY));

-- -----------------------------
-- 4.3 任务历史
-- -----------------------------
INSERT INTO wf_task_history (
  history_id, tenant_id, task_id, instance_id, node_name, node_key, operator_id, operator_name, action, comment,
  duration_seconds, variables_changed, create_time
) VALUES
('demo_hist_003', 100000, 'demo_task_011', 'demo_inst_004', '直属上级审批', 'n1', 1, 'Admin', 'APPROVE', '采购事项合理，进入财务审核。', 2400,
 '{"approveNode":"leader"}', DATE_SUB(NOW(), INTERVAL 7 DAY)),
('demo_hist_004', 100000, 'demo_task_012', 'demo_inst_004', '财务主管审批', 'b1', 3, '王财务', 'APPROVE', '票据齐全，准予报销。', 3600,
 '{"status":"PAID"}', DATE_SUB(NOW(), INTERVAL 6 DAY)),

('demo_hist_005', 100000, 'demo_task_013', 'demo_inst_006', '财务主管审批', 'n1', 3, '王财务', 'APPROVE', '金额与合同一致，提交财务总监。', 2100,
 '{"amount":32000}', DATE_SUB(NOW(), INTERVAL 8 DAY)),
('demo_hist_006', 100000, 'demo_task_014', 'demo_inst_006', '财务总监审批', 'b1', 3, '王财务', 'APPROVE', '尾款支付完成，已通知出纳。', 1800,
 '{"status":"PAID"}', DATE_SUB(NOW(), INTERVAL 6 DAY)),

('demo_hist_009', 100000, 'demo_task_003', 'demo_inst_005', '财务主管审批', 'n1', 3, '王财务', 'APPROVE', '预算已锁定，提交总经理终审。', 3200,
 '{"nextNode":"b2"}', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
('demo_hist_011', 100000, 'demo_task_002', 'demo_inst_003', '提交报销', 'root', 5, '张三', 'SUBMIT', '已提交杭州客户拜访差旅报销。', 180,
 '{"claimNo":"BX202603110001","amount":2680.50}', DATE_SUB(NOW(), INTERVAL 16 HOUR)),
('demo_hist_012', 100000, 'demo_task_004', 'demo_inst_005', '提交付款申请', 'root', 3, '王财务', 'SUBMIT', '付款申请已发起。', 100,
 '{"paymentNo":"FK202603110001","amount":128000.00}', DATE_SUB(NOW(), INTERVAL 14 HOUR)),
('demo_hist_015', 100000, 'demo_task_007', 'demo_inst_011', '提交出差申请', 'root', 5, '张三', 'SUBMIT', '杭州客户出差申请已提交。', 120,
 '{"tripNo":"CC202603110001","destination":"杭州"}', DATE_SUB(NOW(), INTERVAL 11 HOUR)),
('demo_hist_016', 100000, 'demo_task_008', 'demo_inst_012', '提交用车申请', 'root', 2, '李经理', 'SUBMIT', '客户拜访用车申请已提交。', 90,
 '{"usageId":9001,"vehicleId":9001}', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
('demo_hist_017', 100000, 'demo_task_002', 'demo_inst_003', '直属上级审批', 'n1', 2, '李经理', 'APPROVE', '差旅真实发生，票据已验真。', 2400,
 '{"amount":2680.50,"route":"财务总监审批"}', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
('demo_hist_018', 100000, 'demo_task_004', 'demo_inst_005', '转办记录', 'b2', 1, 'Admin', 'DELEGATE', '总经理外出，先由本人稍后处理，保留原审批人。', 300,
 '{"delegate":"none"}', DATE_SUB(NOW(), INTERVAL 70 MINUTE)),
('demo_hist_021', 100000, 'demo_task_007', 'demo_inst_011', '催办记录', 'n1', 5, '张三', 'URGE', '客户要求尽快确认出差安排。', 30,
 '{"urgeCount":1}', DATE_SUB(NOW(), INTERVAL 40 MINUTE)),
('demo_hist_022', 100000, 'demo_task_008', 'demo_inst_012', '催办记录', 'n1', 2, '李经理', 'URGE', '客户明日上午来访，请尽快审批派车。', 30,
 '{"urgeCount":1}', DATE_SUB(NOW(), INTERVAL 20 MINUTE));

-- -----------------------------
-- 4.4 任务已读、催办、附件、候选人、委托、加签
-- -----------------------------
INSERT INTO wf_task_read (tenant_id, task_id, user_id, read_time) VALUES
(100000, 'demo_task_002', 3, DATE_SUB(NOW(), INTERVAL 50 MINUTE)),
(100000, 'demo_task_004', 1, DATE_SUB(NOW(), INTERVAL 40 MINUTE)),
(100000, 'demo_task_007', 2, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
(100000, 'demo_task_008', 1, DATE_SUB(NOW(), INTERVAL 15 MINUTE));

INSERT INTO wf_task_urge (tenant_id, task_id, sender_id, recipient_id, reason, create_time) VALUES
(100000, 'demo_task_002', 5, 3, '报销需在本周财务结算前完成。', DATE_SUB(NOW(), INTERVAL 55 MINUTE)),
(100000, 'demo_task_004', 3, 1, '年度服务费付款窗口临近。', DATE_SUB(NOW(), INTERVAL 35 MINUTE)),
(100000, 'demo_task_007', 5, 2, '客户已确认出差日程，请尽快审批。', DATE_SUB(NOW(), INTERVAL 40 MINUTE)),
(100000, 'demo_task_011', 3, 1, '历史报销流程演示时可展示催办记录。', DATE_SUB(NOW(), INTERVAL 7 DAY)),
(100000, 'demo_task_014', 3, 3, '财务节点自催办测试数据。', DATE_SUB(NOW(), INTERVAL 6 DAY));

INSERT INTO wf_task_attachment (
  attachment_id, tenant_id, task_id, instance_id, file_name, file_path, file_size, file_type, upload_user_id, upload_time
) VALUES
('demo_att_001', 100000, 'demo_task_002', 'demo_inst_003', '杭州出差高铁票.jpg', '/demo/workflow/expense/train-ticket.jpg', 245781, 'image/jpeg', 5, DATE_SUB(NOW(), INTERVAL 15 HOUR)),
('demo_att_002', 100000, 'demo_task_002', 'demo_inst_003', '酒店发票.pdf', '/demo/workflow/expense/hotel-invoice.pdf', 538920, 'application/pdf', 5, DATE_SUB(NOW(), INTERVAL 15 HOUR)),
('demo_att_003', 100000, 'demo_task_004', 'demo_inst_005', '年度运维合同.pdf', '/demo/workflow/payment/service-contract.pdf', 1864022, 'application/pdf', 3, DATE_SUB(NOW(), INTERVAL 13 HOUR)),
('demo_att_004', 100000, 'demo_task_004', 'demo_inst_005', '付款审批说明.docx', '/demo/workflow/payment/approval-note.docx', 86530, 'application/docx', 3, DATE_SUB(NOW(), INTERVAL 12 HOUR)),
('demo_att_006', 100000, 'demo_task_007', 'demo_inst_011', '客户培训议程.pdf', '/demo/workflow/trip/training-agenda.pdf', 280600, 'application/pdf', 5, DATE_SUB(NOW(), INTERVAL 10 HOUR)),
('demo_att_007', 100000, 'demo_task_011', 'demo_inst_004', '采购报销清单.pdf', '/demo/workflow/history/office-expense-list.pdf', 221100, 'application/pdf', 3, DATE_SUB(NOW(), INTERVAL 8 DAY)),
('demo_att_008', 100000, 'demo_task_014', 'demo_inst_006', '显示设备采购发票.pdf', '/demo/workflow/history/display-invoice.pdf', 401231, 'application/pdf', 3, DATE_SUB(NOW(), INTERVAL 9 DAY));

INSERT INTO wf_task_candidate (tenant_id, task_id, candidate_type, candidate_id, create_time) VALUES
(100000, 'demo_task_002', 'ROLE', 'finance', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(100000, 'demo_task_004', 'ROLE', 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(100000, 'demo_task_011', 'ROLE', 'admin', DATE_SUB(NOW(), INTERVAL 8 DAY)),
(100000, 'demo_task_014', 'ROLE', 'finance', DATE_SUB(NOW(), INTERVAL 8 DAY));

INSERT INTO wf_task_delegation (
  delegation_id, tenant_id, task_id, instance_id, from_user_id, from_user_name, to_user_id, to_user_name,
  delegation_type, reason, status, create_time
) VALUES
('demo_delegate_001', 100000, 'demo_task_004', 'demo_inst_005', 1, 'Admin', 1, 'Admin', 'DELEGATE', '模拟展示：高额付款进入终审节点后的委托记录。', 'ACTIVE', DATE_SUB(NOW(), INTERVAL 70 MINUTE)),
('demo_delegate_002', 100000, 'demo_task_011', 'demo_inst_004', 1, 'Admin', 3, '王财务', 'TRANSFER', '历史案例：直属领导将资料核验转财务先补充。', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 7 DAY));

INSERT INTO wf_task_add_sign (
  add_sign_id, tenant_id, task_id, instance_id, sign_type, sign_user_ids, sign_user_names, initiator_id, initiator_name,
  reason, status, create_time, complete_time
) VALUES
('demo_addsign_001', 100000, 'demo_task_004', 'demo_inst_005', 'BEFORE', '6', '刘法务', 1, 'Admin',
 '高额服务付款需补充法务确认合同付款条件。', 'PENDING', DATE_SUB(NOW(), INTERVAL 30 MINUTE), NULL),
('demo_addsign_002', 100000, 'demo_task_011', 'demo_inst_004', 'AFTER', '1', 'Admin', 3, '王财务',
 '历史案例：报销完成后由管理层抽查确认。', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY));

-- -----------------------------
-- 4.5 会签任务与投票
-- -----------------------------
INSERT INTO wf_countersign_task (
  countersign_id, tenant_id, instance_id, node_key, node_name, sign_type, pass_percent,
  total_count, voted_count, approve_count, reject_count, status, assignee_order, current_index, create_time, complete_time
) VALUES
('demo_cs_003', 100000, 'demo_inst_003', 'b2', '财务复核会签演示', 'ALL', 100, 2, 1, 1, 0, 'VOTING',
 '[3,6]', 1, DATE_SUB(NOW(), INTERVAL 4 HOUR), NULL),
('demo_cs_011', 100000, 'demo_inst_011', 'n2', '出差备案会签演示', 'ANY', 50, 2, 2, 2, 0, 'COMPLETED',
 '[4,1]', 2, DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 50 MINUTE));

INSERT INTO wf_countersign_vote (
  vote_id, tenant_id, countersign_id, task_id, voter_id, voter_name, vote_result, comment, vote_time
) VALUES
('demo_vote_001', 100000, 'demo_cs_003', 'demo_task_002', 3, '王财务', 'APPROVE', '财务角度无异常。', DATE_SUB(NOW(), INTERVAL 50 MINUTE)),
('demo_vote_002', 100000, 'demo_cs_011', 'demo_task_007', 4, '赵HR', 'APPROVE', '出差计划合理，备案通过。', DATE_SUB(NOW(), INTERVAL 55 MINUTE)),
('demo_vote_003', 100000, 'demo_cs_011', 'demo_task_007', 1, 'Admin', 'APPROVE', '同意安排客户培训与差旅。', DATE_SUB(NOW(), INTERVAL 50 MINUTE));

-- -----------------------------
-- 4.6 快照、节点轨迹、消息、通知、催办效果、抄送
-- -----------------------------
INSERT INTO wf_process_snapshot (
  snapshot_id, tenant_id, instance_id, node_key, node_name, status, variables, active_tasks, create_time
) VALUES
('demo_snap_002', 100000, 'demo_inst_003', 'b2', '财务总监审批', 'RUNNING',
 '{"claimNo":"BX202603110001","amount":2680.5}',
 '[{"taskId":"demo_task_002","assigneeName":"王财务","status":"TODO","timeout":true}]', DATE_SUB(NOW(), INTERVAL 20 MINUTE)),
('demo_snap_003', 100000, 'demo_inst_005', 'b2', '总经理审批', 'RUNNING',
 '{"paymentNo":"FK202603110001","amount":128000}',
 '[{"taskId":"demo_task_004","assigneeName":"Admin","status":"TODO"}]', DATE_SUB(NOW(), INTERVAL 10 MINUTE)),
('demo_snap_004', 100000, 'demo_inst_011', 'n1', '部门经理审批', 'RUNNING',
 '{"tripNo":"CC202603110001","destination":"杭州","tripDays":3}',
 '[{"taskId":"demo_task_007","assigneeName":"李经理","status":"TODO"}]', DATE_SUB(NOW(), INTERVAL 5 MINUTE));

INSERT INTO wf_node_record (
  tenant_id, instance_id, process_def_key, node_key, node_name, node_type, status, executor_id, executor_name,
  start_time, end_time, duration_ms, extra_data, event_type, event_time, create_time
) VALUES
(100000, 'demo_inst_003', 'biz_reimburse', 'root', '提交报销', 'START', 'COMPLETED', 5, '张三',
 DATE_SUB(NOW(), INTERVAL 16 HOUR), DATE_SUB(NOW(), INTERVAL 16 HOUR) + INTERVAL 3 MINUTE, 180000, '{"amount":2680.5}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 16 HOUR), DATE_SUB(NOW(), INTERVAL 16 HOUR)),
(100000, 'demo_inst_003', 'biz_reimburse', 'n1', '直属上级审批', 'APPROVAL', 'COMPLETED', 2, '李经理',
 DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), 3600000, '{"decision":"APPROVE"}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 7 HOUR)),
(100000, 'demo_inst_003', 'biz_reimburse', 'b2', '财务总监审批', 'APPROVAL', 'RUNNING', 3, '王财务',
 DATE_SUB(NOW(), INTERVAL 5 HOUR), NULL, NULL, '{"timeout":true}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(100000, 'demo_inst_005', 'biz_payment', 'root', '提交付款申请', 'START', 'COMPLETED', 3, '王财务',
 DATE_SUB(NOW(), INTERVAL 14 HOUR), DATE_SUB(NOW(), INTERVAL 14 HOUR) + INTERVAL 2 MINUTE, 120000, '{"amount":128000}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 14 HOUR), DATE_SUB(NOW(), INTERVAL 14 HOUR)),
(100000, 'demo_inst_005', 'biz_payment', 'n1', '财务主管审批', 'APPROVAL', 'COMPLETED', 3, '王财务',
 DATE_SUB(NOW(), INTERVAL 14 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), 43200000, '{"decision":"APPROVE"}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 14 HOUR)),
(100000, 'demo_inst_005', 'biz_payment', 'b2', '总经理审批', 'APPROVAL', 'RUNNING', 1, 'Admin',
 DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, NULL, '{"addSign":"demo_addsign_001"}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(100000, 'demo_inst_011', 'business_trip', 'root', '提交出差申请', 'START', 'COMPLETED', 5, '张三',
 DATE_SUB(NOW(), INTERVAL 11 HOUR), DATE_SUB(NOW(), INTERVAL 11 HOUR) + INTERVAL 2 MINUTE, 120000, '{"destination":"杭州"}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 11 HOUR), DATE_SUB(NOW(), INTERVAL 11 HOUR)),
(100000, 'demo_inst_011', 'business_trip', 'n1', '部门经理审批', 'APPROVAL', 'RUNNING', 2, '李经理',
 DATE_SUB(NOW(), INTERVAL 11 HOUR), NULL, NULL, '{"urgeCount":1}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 11 HOUR), DATE_SUB(NOW(), INTERVAL 11 HOUR)),
(100000, 'demo_inst_012', 'vehicle_approval', 'root', '提交用车申请', 'START', 'COMPLETED', 2, '李经理',
 DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR) + INTERVAL 1 MINUTE, 60000, '{"vehicleId":9001}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(100000, 'demo_inst_012', 'vehicle_approval', 'n1', '直属上级审批', 'APPROVAL', 'RUNNING', 1, 'Admin',
 DATE_SUB(NOW(), INTERVAL 3 HOUR), NULL, NULL, '{"passengerCount":4}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR));

INSERT INTO wf_transaction_message (
  message_id, tenant_id, business_type, business_id, content, status, retry_count, max_retry_count, next_retry_time, create_time, update_time, error_message
) VALUES
('demo_msg_002', 100000, 'WORKFLOW_NOTIFY', 'demo_inst_003', '报销申请进入财务总监审批节点。', 'PENDING', 1, 5, DATE_ADD(NOW(), INTERVAL 10 MINUTE), DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 20 MINUTE), '短信通道短暂超时'),
('demo_msg_003', 100000, 'WORKFLOW_NOTIFY', 'demo_inst_005', '高额付款申请等待总经理审批。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL),
('demo_msg_004', 100000, 'WORKFLOW_NOTIFY', 'demo_inst_011', '出差申请等待部门经理审批。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 11 HOUR), DATE_SUB(NOW(), INTERVAL 11 HOUR), NULL),
('demo_msg_005', 100000, 'WORKFLOW_NOTIFY', 'demo_inst_012', '用车申请已提交，等待直属上级审批。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR), NULL);

INSERT INTO wf_notification_log (
  log_id, tenant_id, notification_type, recipient_id, recipient_name, title, content, send_status, send_time, error_message,
  related_type, related_id, create_time
) VALUES
('demo_notice_002', 100000, 'INTERNAL', 3, '王财务', '待审批：张三的杭州出差报销', '报销金额 2680.50 元，已进入财务审批节点。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 4 HOUR), NULL, 'PROCESS_INSTANCE', 'demo_inst_003', DATE_SUB(NOW(), INTERVAL 4 HOUR)),
('demo_notice_003', 100000, 'SMS', 1, 'Admin', '待审批：年度运维服务付款申请', '付款金额 128000 元，请尽快完成总经理审批。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 90 MINUTE), NULL, 'PROCESS_INSTANCE', 'demo_inst_005', DATE_SUB(NOW(), INTERVAL 90 MINUTE)),
('demo_notice_004', 100000, 'INTERNAL', 2, '李经理', '待审批：杭州客户出差申请', '张三提交了杭州客户培训出差申请。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 10 HOUR), NULL, 'PROCESS_INSTANCE', 'demo_inst_011', DATE_SUB(NOW(), INTERVAL 10 HOUR)),
('demo_notice_005', 100000, 'EMAIL', 1, 'Admin', '待审批：客户拜访用车申请', '请审批明日客户拜访派车申请。', 'PENDING', NULL, NULL, 'PROCESS_INSTANCE', 'demo_inst_012', DATE_SUB(NOW(), INTERVAL 2 HOUR));

INSERT INTO wf_urge_effect (
  tenant_id, task_id, urge_count, first_urge_time, last_urge_time, task_complete_time, response_seconds
) VALUES
(100000, 'demo_task_002', 1, DATE_SUB(NOW(), INTERVAL 55 MINUTE), DATE_SUB(NOW(), INTERVAL 55 MINUTE), NULL, 3300),
(100000, 'demo_task_004', 1, DATE_SUB(NOW(), INTERVAL 35 MINUTE), DATE_SUB(NOW(), INTERVAL 35 MINUTE), NULL, 2100),
(100000, 'demo_task_007', 1, DATE_SUB(NOW(), INTERVAL 40 MINUTE), DATE_SUB(NOW(), INTERVAL 40 MINUTE), NULL, 2400),
(100000, 'demo_task_011', 1, DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), 86400),
(100000, 'demo_task_014', 1, DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), 3600);

INSERT INTO wf_process_copy (
  tenant_id, instance_id, process_def_key, title, node_id, node_name, start_user_id, start_user_name, user_id,
  form_data, is_read, read_time, create_time
) VALUES
(100000, 'demo_inst_003', 'biz_reimburse', '张三的杭州出差报销', 'b2', '财务总监审批', 5, '张三', 2,
 '{"claimNo":"BX202603110001","amount":2680.50}', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(100000, 'demo_inst_005', 'biz_payment', '年度运维服务付款申请', 'b2', '总经理审批', 3, '王财务', 6,
 '{"paymentNo":"FK202603110001","amount":128000.00}', 0, NULL, DATE_SUB(NOW(), INTERVAL 90 MINUTE)),
(100000, 'demo_inst_011', 'business_trip', '张三的杭州客户出差申请', 'n1', '部门经理审批', 5, '张三', 4,
 '{"tripNo":"CC202603110001","destination":"杭州","tripDays":3}', 1, DATE_SUB(NOW(), INTERVAL 45 MINUTE), DATE_SUB(NOW(), INTERVAL 10 HOUR)),
(100000, 'demo_inst_012', 'vehicle_approval', '李经理的客户拜访用车申请', 'n1', '直属上级审批', 2, '李经理', 7,
 '{"usageId":9001,"vehicleId":9001,"destination":"浦东新区星河集团总部"}', 0, NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR));

INSERT INTO wf_notification_config (
  config_id, tenant_id, config_name, event_type, notify_channel, template_id, recipient_type, recipient_value, enabled, create_time, update_time
) VALUES
('demo_notify_001', 100000, '待办生成通知', 'TASK_CREATED', 'INTERNAL', NULL, 'ROLE', 'manager', 1, DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 20 DAY)),
('demo_notify_002', 100000, '任务超时提醒', 'TASK_TIMEOUT', 'SMS', NULL, 'USER', '1', 1, DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY));

INSERT INTO wf_deploy_record (
  id, tenant_id, process_def_id, process_key, version, deploy_status, deploy_by, deployer_name, deploy_time,
  deploy_note, change_log, can_rollback, rollback_from_version, rollback_reason, rollback_by, rollback_time,
  approval_id, deploy_window_id, impact_analysis, created_time, updated_time
) VALUES
(98001, 100000, 'wf_reimburse', 'biz_reimburse', 3, 'SUCCESS', 1, 'Admin', DATE_SUB(NOW(), INTERVAL 20 DAY),
 '发布财务报销流程V3', '新增金额条件分支与加签节点', 1, NULL, NULL, NULL, NULL,
 NULL, NULL, '影响历史实例0条', DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 20 DAY)),
(98002, 100000, 'wf_reimburse', 'biz_reimburse', 2, 'SUCCESS', 1, 'Admin', DATE_SUB(NOW(), INTERVAL 15 DAY),
 '回滚至V2', '回滚原因：条件分支误配置', 0, 3, 'V3条件判断错误', 1, DATE_SUB(NOW(), INTERVAL 15 DAY),
 NULL, NULL, '回滚影响待办2条', DATE_SUB(NOW(), INTERVAL 15 DAY), DATE_SUB(NOW(), INTERVAL 15 DAY));

INSERT INTO wf_deploy_rollback_history (
  id, tenant_id, original_deploy_id, rollback_deploy_id, process_def_id, from_version, to_version, rollback_type,
  rollback_status, rollback_reason, rollback_by, rollback_by_name, rollback_time, success, error_message
) VALUES
(98001, 100000, 98001, 98002, 'wf_reimburse', 3, 2, 'MANUAL', 'SUCCESS',
 '条件分支判断误配，回滚修复', 1, 'Admin', DATE_SUB(NOW(), INTERVAL 15 DAY), 1, NULL);

INSERT INTO wf_deploy_impact (
  id, tenant_id, deploy_id, impact_type, impact_level, impact_count, impact_detail, mitigation_plan, create_time
) VALUES
(98001, 100000, 98001, 'TASK', 'MEDIUM', 12, '影响进行中报销任务 12 条', '通过批量通知提示重新提交审批', DATE_SUB(NOW(), INTERVAL 19 DAY)),
(98002, 100000, 98002, 'PROCESS', 'LOW', 2, '回滚后重新触发流程实例 2 条', '运维窗口内执行，已通知业务方', DATE_SUB(NOW(), INTERVAL 15 DAY));

INSERT INTO workflow_template (
  id, name, description, category_id, tags, definition, preview_image, created_by, created_at, updated_at, usage_count, is_system, status, tenant_id
) VALUES
('demo_tpl_vehicle_001', '用车申请简化模板', '适用于短途接待用车的简化流程', 'cat-office',
 '["用车","行政","简化"]',
 '{"nodes":[{"id":"start","type":"START","title":"提交用车"},{"id":"approve","type":"APPROVAL","title":"直属上级审批","approverType":"ROLE","approverValue":"manager"},{"id":"end","type":"END","title":"结束"}],"edges":[{"id":"start->approve","source":"start","target":"approve"},{"id":"approve->end","source":"approve","target":"end"}]}',
 '/demo/workflow/template/vehicle-simple.png', 'admin', DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), 18, 0, 'active', 100000);

INSERT INTO workflow_version (
  id, workflow_id, version_number, definition, change_log, change_type, created_by, created_at, is_rollback, rollback_from_version, checksum, tenant_id
) VALUES
('demo_tpl_vehicle_001_v1', 'demo_tpl_vehicle_001', 'v1',
 '{"nodes":[{"id":"start","type":"START","title":"提交用车"},{"id":"approve","type":"APPROVAL","title":"直属上级审批","approverType":"ROLE","approverValue":"manager"},{"id":"end","type":"END","title":"结束"}],"edges":[{"id":"start->approve","source":"start","target":"approve"},{"id":"approve->end","source":"approve","target":"end"}]}',
 '初始版本', 'CREATE', 'admin', DATE_SUB(NOW(), INTERVAL 12 DAY), 0, NULL, '9f86d081884c7d659a2feaa0c55ad015', 100000);

INSERT INTO workflow_archive (
  id, workflow_id, workflow_name, archived_by, archived_at, archive_reason, can_restore, original_data, tenant_id
) VALUES
('demo_archive_001', 'tpl-purchase-001', '采购申请', 'admin', DATE_SUB(NOW(), INTERVAL 90 DAY), '模板迁移至新版本库', 1,
 '{"status":"archived","movedTo":"demo_tpl_vehicle_001","note":"保留历史记录"}', 100000);

INSERT INTO wf_audit_log (
  id, operation_type, target_type, target_id, target_name, operator_id, operator_name, operation_time, operation_reason,
  operation_details, operation_result, error_message, ip_address, user_agent, tenant_id
) VALUES
('demo_audit_001', 'DEPLOY', 'workflow_template', 'demo_tpl_vehicle_001', '用车申请简化模板', '1', 'Admin', DATE_SUB(NOW(), INTERVAL 12 DAY),
 '演示环境模板发布', '发布模板并生成初始版本', 'SUCCESS', NULL, '10.10.0.18',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36', 100000);

-- =========================================================
-- 五、补充系统消息（sys_notice）
-- =========================================================
INSERT INTO sys_notice (
  tenant_id, notice_title, notice_type, notice_content, sender_id, recipient_id, status,
  create_by, create_time, update_by, update_time, remark
) VALUES
(100000, '流程待办提醒', '1', '您有一条待审批的高优先级付款申请，请尽快处理。', 1, 1, '0', 'admin', DATE_SUB(NOW(), INTERVAL 30 MINUTE), 'admin', DATE_SUB(NOW(), INTERVAL 30 MINUTE), '演示数据-付款审批提醒'),
(100000, '报销审批提醒', '1', '张三提交的差旅报销已进入财务审批节点。', 5, 3, '0', 'zhang', DATE_SUB(NOW(), INTERVAL 50 MINUTE), 'zhang', DATE_SUB(NOW(), INTERVAL 50 MINUTE), '演示数据-报销审批'),
(100000, '出差申请提醒', '1', '张三的杭州客户出差申请等待部门经理审批。', 5, 2, '0', 'zhang', DATE_SUB(NOW(), INTERVAL 40 MINUTE), 'zhang', DATE_SUB(NOW(), INTERVAL 40 MINUTE), '演示数据-出差审批'),
(100000, '用车申请提醒', '1', '明日客户拜访派车申请已提交，请确认。', 2, 1, '0', 'li', DATE_SUB(NOW(), INTERVAL 20 MINUTE), 'li', DATE_SUB(NOW(), INTERVAL 20 MINUTE), '演示数据-用车审批');

INSERT INTO sys_log (
  log_id, tenant_id, log_type, title, service_id, remote_addr, user_agent, request_uri, method, params, time, exception, create_by, create_time
)
SELECT
  92000 + n,
  100000,
  CASE WHEN n % 10 = 0 THEN '9' ELSE '0' END,
  CONCAT('批量演示日志', n),
  'cloudflow-oa',
  CONCAT('10.10.1.', LPAD(n % 200, 2, '0')),
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
  '/api/demo/batch',
  'GET',
  CONCAT('{"page":', n, ',"size":20}'),
  50 + (n % 200),
  CASE WHEN n % 10 = 0 THEN '批量异常示例' ELSE NULL END,
  'admin',
  DATE_SUB(NOW(), INTERVAL n MINUTE)
FROM (
  SELECT (a.n * 100 + b.n * 10 + c.n) + 1 AS n
  FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
  WHERE (a.n * 100 + b.n * 10 + c.n) < 300
) seq;

INSERT INTO sys_audit_log (
  audit_id, tenant_id, audit_name, audit_field, before_val, after_val, create_by, create_time
)
SELECT
  92000 + n,
  100000,
  '批量审计记录',
  'status',
  'draft',
  CASE WHEN n % 2 = 0 THEN 'published' ELSE 'archived' END,
  'admin',
  DATE_SUB(NOW(), INTERVAL n MINUTE)
FROM (
  SELECT (a.n * 100 + b.n * 10 + c.n) + 1 AS n
  FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
  WHERE (a.n * 100 + b.n * 10 + c.n) < 300
) seq;

INSERT INTO sys_file (
  file_id, tenant_id, file_name, file_path, url, storage_type, file_size, file_type, create_by, create_time, del_flag, remark
)
SELECT
  92000 + n,
  100000,
  CONCAT('批量文件_', n, CASE WHEN n % 3 = 0 THEN '.jpg' WHEN n % 3 = 1 THEN '.pdf' ELSE '.xlsx' END),
  CONCAT('/demo/batch/file-', n),
  CONCAT('https://demo.cloudflow.local/files/batch/file-', n),
  'LOCAL',
  1024 + n,
  CASE WHEN n % 3 = 0 THEN 'image/jpeg' WHEN n % 3 = 1 THEN 'application/pdf' ELSE 'application/xlsx' END,
  'admin',
  DATE_SUB(NOW(), INTERVAL n MINUTE),
  '0',
  '批量演示文件'
FROM (
  SELECT (a.n * 100 + b.n * 10 + c.n) + 1 AS n
  FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
  WHERE (a.n * 100 + b.n * 10 + c.n) < 300
) seq;

INSERT INTO sys_frontend_error_log (
  id, tenant_id, message, stack, component_stack, context, url, user_agent, level, tags, extra, client_ip,
  user_id, user_name, client_time, create_time
)
SELECT
  99200 + n,
  100000,
  CONCAT('批量错误日志', n),
  'AxiosError: timeout of 5000ms exceeded',
  'at DemoPage (src/pages/DemoPage.tsx:88)\nat App',
  '批量演示错误上报',
  '/demo',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
  CASE WHEN n % 3 = 0 THEN 'error' WHEN n % 3 = 1 THEN 'warning' ELSE 'info' END,
  JSON_OBJECT('module','demo','page','DemoPage','env','demo'),
  JSON_OBJECT('batch',1,'index',n),
  CONCAT('10.10.2.', LPAD(n % 200, 2, '0')),
  (n % 9) + 1,
  CASE (n % 9) WHEN 0 THEN 'Admin' WHEN 1 THEN '李经理' WHEN 2 THEN '王财务' WHEN 3 THEN '赵HR' WHEN 4 THEN '张三' WHEN 5 THEN '刘法务' WHEN 6 THEN '陈IT' WHEN 7 THEN '前端测试' ELSE '后端测试' END,
  DATE_SUB(NOW(), INTERVAL n MINUTE),
  DATE_SUB(NOW(), INTERVAL n MINUTE)
FROM (
  SELECT (a.n * 100 + b.n * 10 + c.n) + 1 AS n
  FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
  WHERE (a.n * 100 + b.n * 10 + c.n) < 300
) seq;

INSERT IGNORE INTO sys_announcement_read (tenant_id, announcement_id, user_id, read_time)
SELECT
  100000,
  9601 + (n % 5),
  (n % 9) + 1,
  DATE_SUB(NOW(), INTERVAL (n % 20) HOUR)
FROM (
  SELECT (a.n * 100 + b.n * 10 + c.n) + 1 AS n
  FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
  WHERE (a.n * 100 + b.n * 10 + c.n) < 300
) seq;

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 脚本说明
-- 1. 本脚本覆盖：
--    - OA：公告、会议室、日程、协作任务、资产、耗材、车辆、访客、值班、前端错误日志
--    - 业务申请：报销、付款、出差、用车
--    - 工作流：流程实例、待办、已办、附件、催办、抄送、加签、会签、快照、通知、事务消息
-- 2. 所有审批人与申请人都引用现有基础数据：
--    admin=1，李经理=2，王财务=3，赵HR=4，张三=5，刘法务=6，陈IT=7，前端测试=8，后端测试=9
-- 3. 可直接用于首页仪表盘、待办中心、已办中心、流程轨迹、OA 各子模块展示
-- =========================================================

