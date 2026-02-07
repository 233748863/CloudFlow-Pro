-- ----------------------------
-- 1. Attendance Management Tables
-- ----------------------------

-- Attendance Records
DROP TABLE IF EXISTS `sys_attendance_record`;
CREATE TABLE `sys_attendance_record` (
  `record_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '记录ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `type` char(1) NOT NULL COMMENT '类型（1签到 2签退）',
  `check_time` datetime NOT NULL COMMENT '打卡时间',
  `location` varchar(100) DEFAULT NULL COMMENT '经纬度(lat,lng)',
  `address` varchar(255) DEFAULT NULL COMMENT '打卡地址',
  `device_info` varchar(255) DEFAULT NULL COMMENT '设备信息',
  `wifi_info` varchar(100) DEFAULT NULL COMMENT 'Wi-Fi信息(SSID/MAC)',
  `status` char(1) DEFAULT '1' COMMENT '状态（1正常 2迟到 3早退 4外勤 5缺卡）',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID',
  `del_flag` char(1) DEFAULT '0' COMMENT '删除标志',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`record_id`),
  KEY `idx_att_user_time` (`user_id`, `check_time`),
  KEY `idx_att_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤打卡记录表';

-- Attendance Rules
DROP TABLE IF EXISTS `sys_attendance_rule`;
CREATE TABLE `sys_attendance_rule` (
  `rule_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '规则ID',
  `rule_name` varchar(50) NOT NULL COMMENT '规则名称',
  `check_in_time` time NOT NULL COMMENT '上班时间',
  `check_out_time` time NOT NULL COMMENT '下班时间',
  `elastic_minutes` int(11) DEFAULT 0 COMMENT '弹性时间(分钟)',
  `location_points` text COMMENT '打卡点坐标集合(JSON)',
  `wifi_configs` text COMMENT 'Wi-Fi配置(JSON)',
  `radius` int(11) DEFAULT 200 COMMENT '打卡范围半径(米)',
  `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID',
  `del_flag` char(1) DEFAULT '0' COMMENT '删除标志',
  `create_by` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_by` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`rule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤规则表';

-- Initialize Default Rule
INSERT INTO `sys_attendance_rule` (`rule_name`, `check_in_time`, `check_out_time`, `elastic_minutes`, `tenant_id`, `create_time`) 
VALUES ('默认考勤组', '09:00:00', '18:00:00', 30, 100000, NOW());

-- ----------------------------
-- 2. Asset Management Tables
-- ----------------------------

-- Asset (Fixed Assets)
DROP TABLE IF EXISTS `sys_asset`;
CREATE TABLE `sys_asset` (
  `asset_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '资产ID',
  `asset_code` varchar(50) NOT NULL COMMENT '资产编码',
  `name` varchar(100) NOT NULL COMMENT '资产名称',
  `category` varchar(50) DEFAULT NULL COMMENT '分类',
  `model` varchar(100) DEFAULT NULL COMMENT '规格型号',
  `status` char(1) DEFAULT '1' COMMENT '状态（1闲置 2在用 3维修 4报废 5丢失）',
  `price` decimal(10,2) DEFAULT NULL COMMENT '价格',
  `purchase_date` date DEFAULT NULL COMMENT '采购日期',
  `owner_id` bigint(20) DEFAULT NULL COMMENT '当前领用人ID',
  `location` varchar(100) DEFAULT NULL COMMENT '存放位置',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID',
  `del_flag` char(1) DEFAULT '0' COMMENT '删除标志',
  `create_by` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_by` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`asset_id`),
  UNIQUE KEY `uk_asset_code_tenant` (`asset_code`, `tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='固定资产表';

-- Consumable (Inventory)
DROP TABLE IF EXISTS `sys_consumable`;
CREATE TABLE `sys_consumable` (
  `consumable_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '耗材ID',
  `name` varchar(100) NOT NULL COMMENT '耗材名称',
  `model` varchar(100) DEFAULT NULL COMMENT '规格型号',
  `unit` varchar(20) DEFAULT '个' COMMENT '单位',
  `quantity` int(11) DEFAULT 0 COMMENT '库存数量',
  `low_stock_threshold` int(11) DEFAULT 10 COMMENT '预警阈值',
  `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID',
  `del_flag` char(1) DEFAULT '0' COMMENT '删除标志',
  `create_by` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_by` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`consumable_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材库存表';

-- Asset/Consumable Log
DROP TABLE IF EXISTS `sys_asset_log`;
CREATE TABLE `sys_asset_log` (
  `log_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `ref_id` bigint(20) NOT NULL COMMENT '关联ID(资产或耗材)',
  `ref_type` char(1) NOT NULL COMMENT '关联类型(1固定资产 2耗材)',
  `type` varchar(20) NOT NULL COMMENT '操作类型(领用/归还/入库/出库/盘点)',
  `quantity_change` int(11) DEFAULT 0 COMMENT '数量变动',
  `operator_id` bigint(20) DEFAULT NULL COMMENT '操作人ID',
  `target_id` bigint(20) DEFAULT NULL COMMENT '领用人/归还人ID',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID',
  `create_time` datetime DEFAULT NULL COMMENT '操作时间',
  PRIMARY KEY (`log_id`),
  KEY `idx_log_ref` (`ref_id`, `ref_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产变动日志表';

-- ----------------------------
-- 3. Business Forms Data (Leave, Overtime, etc.)
--    Note: These are handled by Workflow Engine (wf_process_instance variables), 
--    but we can create view tables or business tables for easier reporting.
--    For this implementation, we will use separate tables for better performance and structure.
-- ----------------------------

DROP TABLE IF EXISTS `biz_leave`;
CREATE TABLE `biz_leave` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `instance_id` varchar(64) DEFAULT NULL COMMENT '流程实例ID',
  `user_id` bigint(20) DEFAULT NULL COMMENT '申请人',
  `type` varchar(20) DEFAULT NULL COMMENT '请假类型',
  `start_time` datetime DEFAULT NULL COMMENT '开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '结束时间',
  `days` decimal(5,1) DEFAULT NULL COMMENT '天数',
  `reason` varchar(500) DEFAULT NULL COMMENT '事由',
  `status` varchar(20) DEFAULT 'PENDING' COMMENT '状态',
  `tenant_id` bigint(20) DEFAULT 100000,
  `create_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='请假业务表';

