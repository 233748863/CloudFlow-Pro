-- =============================================
-- 流程分类管理表
-- 参考 RuoYi-Cloud-Plus FlwCategory 设计
-- 支持树形结构，用于组织和管理流程定义
-- =============================================

-- ----------------------------
-- 流程分类表
-- ----------------------------
DROP TABLE IF EXISTS `wf_process_category`;
CREATE TABLE `wf_process_category` (
    `category_id`   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '分类ID',
    `parent_id`     BIGINT       DEFAULT 0               COMMENT '父分类ID（0表示顶级分类）',
    `category_name` VARCHAR(100) NOT NULL                 COMMENT '分类名称',
    `category_code` VARCHAR(100) NOT NULL                 COMMENT '分类编码（唯一标识）',
    `icon`          VARCHAR(100) DEFAULT NULL              COMMENT '分类图标',
    `sort_order`    INT          DEFAULT 0                COMMENT '排序号',
    `status`        CHAR(1)      DEFAULT '0'              COMMENT '状态（0=正常 1=停用）',
    `remark`        VARCHAR(500) DEFAULT NULL              COMMENT '备注',
    `tenant_id`     BIGINT       DEFAULT NULL              COMMENT '租户ID',
    `create_by`     VARCHAR(64)  DEFAULT NULL              COMMENT '创建者',
    `create_time`   DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_by`     VARCHAR(64)  DEFAULT NULL              COMMENT '更新者',
    `update_time`   DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`category_id`),
    UNIQUE KEY `uk_category_code` (`category_code`, `tenant_id`),
    KEY `idx_parent_id` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程分类表';

-- ----------------------------
-- 初始化数据：预置常用流程分类
-- ----------------------------
INSERT INTO `wf_process_category` (`category_id`, `parent_id`, `category_name`, `category_code`, `icon`, `sort_order`, `status`) VALUES
(1, 0, 'OA办公',       'oa',           'Briefcase',    1, '0'),
(2, 0, '人事管理',     'hr',           'Users',        2, '0'),
(3, 0, '财务管理',     'finance',      'DollarSign',   3, '0'),
(4, 0, '行政管理',     'admin',        'Building',     4, '0'),
(5, 0, '项目管理',     'project',      'FolderKanban', 5, '0'),

-- OA办公子分类
(10, 1, '请假管理',    'oa_leave',     'Calendar',     1, '0'),
(11, 1, '加班管理',    'oa_overtime',  'Clock',        2, '0'),
(12, 1, '出差管理',    'oa_trip',      'Plane',        3, '0'),
(13, 1, '考勤管理',    'oa_attendance','UserCheck',    4, '0'),
(14, 1, '访客管理',    'oa_visitor',   'UserPlus',     5, '0'),

-- 财务管理子分类
(20, 3, '报销管理',    'fin_expense',  'Receipt',      1, '0'),
(21, 3, '付款管理',    'fin_payment',  'CreditCard',   2, '0'),
(22, 3, '预算管理',    'fin_budget',   'PieChart',     3, '0'),

-- 行政管理子分类
(30, 4, '车辆管理',    'adm_vehicle',  'Car',          1, '0'),
(31, 4, '会议管理',    'adm_meeting',  'Video',        2, '0'),
(32, 4, '公告管理',    'adm_notice',   'Bell',         3, '0');
