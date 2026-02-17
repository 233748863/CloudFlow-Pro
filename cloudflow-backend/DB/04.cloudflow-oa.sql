-- =========================================================
-- CloudFlow Pro - OA办公模块数据库脚本
-- 模块：公告、日程、会议室、任务协作、考勤、资产、车辆管理
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
-- 四、考勤管理模块
-- =========================================================

-- 6. 考勤打卡记录表
DROP TABLE IF EXISTS sys_attendance_record;
CREATE TABLE sys_attendance_record (
  record_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '记录ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  type              CHAR(1)         NOT NULL COMMENT '类型（1签到 2签退）',
  check_time        DATETIME        NOT NULL COMMENT '打卡时间',
  location          VARCHAR(100)    DEFAULT NULL COMMENT '经纬度(lat,lng)',
  address           VARCHAR(255)    DEFAULT NULL COMMENT '打卡地址',
  device_info       VARCHAR(255)    DEFAULT NULL COMMENT '设备信息',
  wifi_info         VARCHAR(100)    DEFAULT NULL COMMENT 'Wi-Fi信息',
  status            CHAR(1)         DEFAULT '1' COMMENT '状态（1正常 2迟到 3早退 4外勤 5缺卡）',
  remark            VARCHAR(255)    DEFAULT NULL COMMENT '备注',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (record_id),
  KEY idx_att_user_time (user_id, check_time),
  KEY idx_att_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤打卡记录表';

-- 7. 考勤规则表
DROP TABLE IF EXISTS sys_attendance_rule;
CREATE TABLE sys_attendance_rule (
  rule_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '规则ID',
  rule_name         VARCHAR(50)     NOT NULL COMMENT '规则名称',
  check_in_time     TIME            NOT NULL COMMENT '上班时间',
  check_out_time    TIME            NOT NULL COMMENT '下班时间',
  elastic_minutes   INT(11)         DEFAULT 0 COMMENT '弹性时间(分钟)',
  work_days         VARCHAR(50)     DEFAULT '[1,2,3,4,5]' COMMENT '工作日配置(JSON数组, 1=周一...7=周日)',
  lunch_break_start TIME            DEFAULT '12:00:00' COMMENT '午休开始时间',
  lunch_break_end   TIME            DEFAULT '13:00:00' COMMENT '午休结束时间',
  overtime_enabled  TINYINT(1)      DEFAULT 0 COMMENT '是否允许加班(0否 1是)',
  overtime_min_minutes INT(11)      DEFAULT 30 COMMENT '加班最低时长(分钟)',
  late_tolerance_count INT(11)      DEFAULT 0 COMMENT '每月迟到容忍次数',
  severe_late_minutes INT(11)       DEFAULT 60 COMMENT '严重迟到阈值(分钟)',
  absent_minutes    INT(11)         DEFAULT 240 COMMENT '旷工阈值(分钟)',
  photo_required    TINYINT(1)      DEFAULT 0 COMMENT '是否需要拍照打卡(0否 1是)',
  enabled           TINYINT(1)      DEFAULT 1 COMMENT '是否启用(0禁用 1启用)',
  location_points   TEXT            COMMENT '打卡点坐标集合(JSON)',
  wifi_configs      TEXT            COMMENT 'Wi-Fi配置(JSON)',
  radius            INT(11)         DEFAULT 200 COMMENT '打卡范围半径(米)',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注说明',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (rule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤规则表';

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
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (expense_id),
  KEY idx_vehicle_expense_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='车辆费用记录表';

-- =========================================================
-- 七、业务表（与工作流关联）
-- =========================================================

-- 14. 请假申请表
DROP TABLE IF EXISTS biz_leave_request;
CREATE TABLE biz_leave_request (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT NULL COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  user_id           BIGINT(20)      DEFAULT NULL COMMENT '申请人ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  leave_no          VARCHAR(32)     DEFAULT NULL COMMENT '请假单号',
  leave_type        VARCHAR(20)     DEFAULT NULL COMMENT '请假类型(ANNUAL年假/SICK病假/PERSONAL事假/MATERNITY产假/MARRIAGE婚假/BEREAVEMENT丧假/OTHER其他)',
  start_time        DATETIME        DEFAULT NULL COMMENT '开始时间',
  end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
  leave_days        DECIMAL(5,1)    DEFAULT NULL COMMENT '请假天数',
  reason            VARCHAR(500)    DEFAULT NULL COMMENT '请假事由',
  attachment_url    VARCHAR(500)    DEFAULT NULL COMMENT '附件URL',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT草稿/PENDING审批中/APPROVED已通过/REJECTED已驳回/CANCELLED已取消)',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志(0正常 2删除)',
  create_by         VARCHAR(64)     DEFAULT NULL COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT NULL COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_leave_no (leave_no),
  KEY idx_user_id (user_id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_status (status),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='请假申请表';

-- =========================================================
-- 八、费用报销与付款申请模块
-- =========================================================

-- 15. 报销申请表
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
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_claim_no (claim_no),
  KEY idx_claim_user (user_id),
  KEY idx_claim_status (status),
  KEY idx_claim_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='报销申请表';

-- 16. 报销明细表
DROP TABLE IF EXISTS biz_expense_item;
CREATE TABLE biz_expense_item (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  claim_id          BIGINT(20)      NOT NULL COMMENT '报销申请ID',
  expense_type      VARCHAR(20)     NOT NULL COMMENT '费用类型(MEAL餐费/HOTEL住宿/TRANSPORT交通/OFFICE办公用品/COMM通讯/OTHER其他)',
  amount            DECIMAL(10,2)   NOT NULL COMMENT '金额',
  expense_date      DATE            NOT NULL COMMENT '费用发生日期',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '费用说明',
  receipt_url       VARCHAR(255)    DEFAULT NULL COMMENT '票据图片URL',
  vehicle_expense_id BIGINT(20)     DEFAULT NULL COMMENT '关联车辆费用ID',
  PRIMARY KEY (id),
  KEY idx_item_claim (claim_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='报销明细表';

-- 17. 付款申请表
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
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_payment_no (payment_no),
  KEY idx_payment_user (user_id),
  KEY idx_payment_status (status),
  KEY idx_payment_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='付款申请表';

-- =========================================================
-- 九、补卡/外勤申请模块
-- =========================================================

-- 19. 补卡申请表
DROP TABLE IF EXISTS biz_attendance_appeal;
CREATE TABLE biz_attendance_appeal (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '申请人ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  appeal_no         VARCHAR(32)     NOT NULL COMMENT '申请单号',
  appeal_type       VARCHAR(20)     NOT NULL COMMENT '申请类型(MAKEUP补卡/FIELD外勤)',
  appeal_date       DATE            NOT NULL COMMENT '补卡/外勤日期',
  appeal_time       TIME            DEFAULT NULL COMMENT '补卡时间(补卡类型必填)',
  check_type        CHAR(1)         DEFAULT NULL COMMENT '补卡打卡类型(1签到 2签退)',
  original_record_id BIGINT(20)     DEFAULT NULL COMMENT '关联原始考勤记录ID',
  original_status   VARCHAR(20)     DEFAULT NULL COMMENT '原始打卡状态(LATE迟到/EARLY早退/ABSENT缺卡/ABNORMAL异常)',
  witness_name      VARCHAR(64)     DEFAULT NULL COMMENT '证明人姓名',
  location          VARCHAR(100)    DEFAULT NULL COMMENT '外勤地点经纬度(lat,lng)',
  address           VARCHAR(255)    DEFAULT NULL COMMENT '外勤地点地址',
  reason            VARCHAR(500)    NOT NULL COMMENT '申请事由',
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
  UNIQUE KEY uk_appeal_no (appeal_no),
  KEY idx_appeal_user (user_id),
  KEY idx_appeal_tenant (tenant_id),
  KEY idx_appeal_status (status),
  KEY idx_appeal_date (appeal_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='补卡/外勤申请表';

-- =========================================================
-- 十、加班申请模块
-- =========================================================

-- 20. 加班申请表
DROP TABLE IF EXISTS biz_overtime_request;
CREATE TABLE biz_overtime_request (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '申请人ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  overtime_no       VARCHAR(32)     NOT NULL COMMENT '加班单号',
  overtime_type     VARCHAR(20)     NOT NULL COMMENT '加班类型(WORKDAY工作日/WEEKEND周末/HOLIDAY节假日)',
  start_time        DATETIME        NOT NULL COMMENT '加班开始时间',
  end_time          DATETIME        NOT NULL COMMENT '加班结束时间',
  overtime_hours    DECIMAL(5,1)    DEFAULT NULL COMMENT '加班时长(小时)',
  compensate_type   VARCHAR(20)     DEFAULT 'SALARY' COMMENT '补偿方式(SALARY加班费/LEAVE调休)',
  reason            VARCHAR(500)    NOT NULL COMMENT '加班事由',
  work_content      VARCHAR(500)    DEFAULT NULL COMMENT '加班工作内容',
  expected_output   VARCHAR(500)    DEFAULT NULL COMMENT '预计产出/成果',
  need_meal         TINYINT(1)      DEFAULT 0 COMMENT '是否需要用餐(0否 1是)',
  work_location     VARCHAR(20)     DEFAULT 'OFFICE' COMMENT '加班地点(OFFICE办公室/HOME居家/OTHER其他)',
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
  UNIQUE KEY uk_overtime_no (overtime_no),
  KEY idx_overtime_user (user_id),
  KEY idx_overtime_tenant (tenant_id),
  KEY idx_overtime_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='加班申请表';

-- =========================================================
-- 十一、出差申请模块
-- =========================================================

-- 21. 出差申请表
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

-- 5. 初始化考勤规则
INSERT INTO sys_attendance_rule (rule_name, check_in_time, check_out_time, elastic_minutes, work_days, lunch_break_start, lunch_break_end, overtime_enabled, overtime_min_minutes, late_tolerance_count, severe_late_minutes, absent_minutes, photo_required, enabled, tenant_id, create_time) 
VALUES ('默认考勤组', '09:00:00', '18:00:00', 30, '[1,2,3,4,5]', '12:00:00', '13:00:00', 0, 30, 3, 60, 240, 0, 1, 100000, NOW());

-- 6. 初始化值班排班示例数据
INSERT INTO sys_duty_schedule (title, schedule_type, duty_date, shift_type, start_time, end_time, user_id, user_name, dept_id, location, duty_content, status, create_by, create_time) VALUES
('周一日常值班', 'DAILY', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'DAY', '09:00:00', '18:00:00', 1, 'admin', NULL, '前台', '负责来访接待和电话转接', 'SCHEDULED', 'admin', NOW()),
('周一夜班值班', 'DAILY', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'NIGHT', '18:00:00', '09:00:00', 1, 'admin', NULL, '监控室', '负责安全巡查和监控', 'SCHEDULED', 'admin', NOW());

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 脚本执行完成
-- =========================================================
