-- 车辆管理系统表结构设计

-- ----------------------------
-- 1. 车辆信息表
-- ----------------------------
DROP TABLE IF EXISTS sys_vehicle;
CREATE TABLE sys_vehicle (
  vehicle_id        bigint(20)      NOT NULL AUTO_INCREMENT COMMENT '车辆ID',
  license_plate     varchar(20)     NOT NULL COMMENT '车牌号',
  brand             varchar(50)     DEFAULT NULL COMMENT '品牌',
  model             varchar(50)     DEFAULT NULL COMMENT '型号',
  color             varchar(20)     DEFAULT NULL COMMENT '颜色',
  capacity          int(11)         DEFAULT NULL COMMENT '载客量',
  status            char(1)         DEFAULT '1' COMMENT '状态（1可用 2已预约 3使用中 4维修中 5报废）',
  mileage           decimal(10,2)   DEFAULT 0.00 COMMENT '当前里程(km)',
  purchase_date     date            DEFAULT NULL COMMENT '购买日期',
  insurance_expiry  date            DEFAULT NULL COMMENT '保险到期日',
  location          varchar(100)    DEFAULT NULL COMMENT '停放位置',
  remark            varchar(500)    DEFAULT NULL COMMENT '备注',
  del_flag          char(1)         DEFAULT '0' COMMENT '删除标志（0代表存在 2代表删除）',
  create_by         varchar(64)     DEFAULT '' COMMENT '创建者',
  create_time       datetime        DEFAULT NULL COMMENT '创建时间',
  update_by         varchar(64)     DEFAULT '' COMMENT '更新者',
  update_time       datetime        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (vehicle_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='车辆信息表';

-- ----------------------------
-- 2. 用车申请与记录表
-- ----------------------------
DROP TABLE IF EXISTS sys_vehicle_usage;
CREATE TABLE sys_vehicle_usage (
  usage_id          bigint(20)      NOT NULL AUTO_INCREMENT COMMENT '用车记录ID',
  vehicle_id        bigint(20)      NOT NULL COMMENT '车辆ID',
  applicant_id      bigint(20)      NOT NULL COMMENT '申请人ID',
  driver_id         bigint(20)      DEFAULT NULL COMMENT '司机ID',
  start_time        datetime        NOT NULL COMMENT '预计开始时间',
  end_time          datetime        NOT NULL COMMENT '预计结束时间',
  destination       varchar(200)    NOT NULL COMMENT '目的地',
  reason            varchar(500)    NOT NULL COMMENT '用车事由',
  passenger_count   int(11)         DEFAULT 1 COMMENT '随行人数',
  passengers        varchar(500)    DEFAULT NULL COMMENT '随行人员名单',
  start_mileage     decimal(10,2)   DEFAULT NULL COMMENT '起始里程',
  end_mileage       decimal(10,2)   DEFAULT NULL COMMENT '结束里程',
  actual_start_time datetime        DEFAULT NULL COMMENT '实际开始时间',
  actual_end_time   datetime        DEFAULT NULL COMMENT '实际结束时间',
  status            char(1)         DEFAULT '0' COMMENT '状态（0待审批 1已批准 2已驳回 3进行中 4已完成 5已取消）',
  process_instance_id varchar(64)   DEFAULT NULL COMMENT '流程实例ID',
  del_flag          char(1)         DEFAULT '0' COMMENT '删除标志',
  create_by         varchar(64)     DEFAULT '' COMMENT '创建者',
  create_time       datetime        DEFAULT NULL COMMENT '创建时间',
  update_by         varchar(64)     DEFAULT '' COMMENT '更新者',
  update_time       datetime        DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (usage_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='用车申请与记录表';

-- ----------------------------
-- 3. 车辆费用记录表
-- ----------------------------
DROP TABLE IF EXISTS sys_vehicle_expense;
CREATE TABLE sys_vehicle_expense (
  expense_id        bigint(20)      NOT NULL AUTO_INCREMENT COMMENT '费用ID',
  vehicle_id        bigint(20)      NOT NULL COMMENT '车辆ID',
  usage_id          bigint(20)      DEFAULT NULL COMMENT '关联用车记录ID',
  expense_type      varchar(20)     NOT NULL COMMENT '费用类型（1油费 2过路费 3停车费 4维修保养 5保险 6其他）',
  amount            decimal(10,2)   NOT NULL COMMENT '金额',
  expense_date      date            NOT NULL COMMENT '费用发生日期',
  description       varchar(500)    DEFAULT NULL COMMENT '费用说明',
  receipt_url       varchar(255)    DEFAULT NULL COMMENT '票据图片URL',
  create_by         varchar(64)     DEFAULT '' COMMENT '创建者',
  create_time       datetime        DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (expense_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='车辆费用记录表';
