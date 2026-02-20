-- =============================================
-- 字典管理表
-- =============================================

-- 字典类型表
CREATE TABLE IF NOT EXISTS `sys_dict_type` (
    `dict_id`     BIGINT       NOT NULL AUTO_INCREMENT COMMENT '字典主键',
    `tenant_id`   BIGINT       DEFAULT NULL COMMENT '租户ID',
    `dict_name`   VARCHAR(100) NOT NULL COMMENT '字典名称',
    `dict_type`   VARCHAR(100) NOT NULL COMMENT '字典类型（唯一标识）',
    `status`      CHAR(1)      DEFAULT '0' COMMENT '状态（0正常 1停用）',
    `remark`      VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `create_by`   VARCHAR(64)  DEFAULT NULL COMMENT '创建者',
    `create_time` DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_by`   VARCHAR(64)  DEFAULT NULL COMMENT '更新者',
    `update_time` DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`dict_id`),
    UNIQUE KEY `uk_dict_type` (`dict_type`, `tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典类型表';

-- 字典数据表
CREATE TABLE IF NOT EXISTS `sys_dict_data` (
    `dict_code`   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '字典编码',
    `tenant_id`   BIGINT       DEFAULT NULL COMMENT '租户ID',
    `dict_sort`   INT          DEFAULT 0 COMMENT '字典排序',
    `dict_label`  VARCHAR(100) NOT NULL COMMENT '字典标签',
    `dict_value`  VARCHAR(100) NOT NULL COMMENT '字典键值',
    `dict_type`   VARCHAR(100) NOT NULL COMMENT '字典类型',
    `css_class`   VARCHAR(100) DEFAULT NULL COMMENT '样式属性（前端扩展）',
    `list_class`  VARCHAR(100) DEFAULT NULL COMMENT '表格回显样式（如 success/warning/danger）',
    `is_default`  CHAR(1)      DEFAULT 'N' COMMENT '是否默认（Y是 N否）',
    `status`      CHAR(1)      DEFAULT '0' COMMENT '状态（0正常 1停用）',
    `remark`      VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `create_by`   VARCHAR(64)  DEFAULT NULL COMMENT '创建者',
    `create_time` DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_by`   VARCHAR(64)  DEFAULT NULL COMMENT '更新者',
    `update_time` DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`dict_code`),
    KEY `idx_dict_type` (`dict_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典数据表';

-- =============================================
-- 初始化数据：常用字典类型
-- =============================================
INSERT INTO `sys_dict_type` (`dict_name`, `dict_type`, `remark`) VALUES
('用户性别', 'sys_user_sex', '用户性别列表'),
('系统状态', 'sys_normal_disable', '系统开关状态'),
('是否', 'sys_yes_no', '系统是否列表'),
('通知类型', 'sys_notice_type', '通知类型列表'),
('审批状态', 'oa_approval_status', 'OA审批状态'),
('请假类型', 'oa_leave_type', '请假类型列表'),
('加班类型', 'oa_overtime_type', '加班类型列表'),
('出差状态', 'oa_trip_status', '出差状态列表'),
('费用类型', 'oa_expense_type', '费用报销类型');

-- 用户性别
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '男', '0', 'sys_user_sex', 'default'),
(2, '女', '1', 'sys_user_sex', 'default'),
(3, '未知', '2', 'sys_user_sex', 'default');

-- 系统状态
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '正常', '0', 'sys_normal_disable', 'success'),
(2, '停用', '1', 'sys_normal_disable', 'danger');

-- 是否
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '是', 'Y', 'sys_yes_no', 'success'),
(2, '否', 'N', 'sys_yes_no', 'danger');

-- 通知类型
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '通知', '1', 'sys_notice_type', 'warning'),
(2, '公告', '2', 'sys_notice_type', 'success');

-- 审批状态
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '待审批', 'PENDING', 'oa_approval_status', 'warning'),
(2, '审批中', 'IN_PROGRESS', 'oa_approval_status', 'processing'),
(3, '已通过', 'APPROVED', 'oa_approval_status', 'success'),
(4, '已驳回', 'REJECTED', 'oa_approval_status', 'danger'),
(5, '已撤销', 'CANCELLED', 'oa_approval_status', 'default');

-- 请假类型
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '年假', 'ANNUAL', 'oa_leave_type', 'success'),
(2, '事假', 'PERSONAL', 'oa_leave_type', 'default'),
(3, '病假', 'SICK', 'oa_leave_type', 'warning'),
(4, '婚假', 'MARRIAGE', 'oa_leave_type', 'success'),
(5, '产假', 'MATERNITY', 'oa_leave_type', 'success'),
(6, '丧假', 'BEREAVEMENT', 'oa_leave_type', 'default');

-- 加班类型
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '工作日加班', 'WORKDAY', 'oa_overtime_type', 'default'),
(2, '周末加班', 'WEEKEND', 'oa_overtime_type', 'warning'),
(3, '节假日加班', 'HOLIDAY', 'oa_overtime_type', 'danger');

-- 出差状态
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '待出发', 'NOT_STARTED', 'oa_trip_status', 'default'),
(2, '出差中', 'IN_PROGRESS', 'oa_trip_status', 'processing'),
(3, '已返回', 'COMPLETED', 'oa_trip_status', 'success');

-- 费用类型
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '差旅费', 'TRAVEL', 'oa_expense_type', 'default'),
(2, '交通费', 'TRANSPORT', 'oa_expense_type', 'default'),
(3, '餐饮费', 'MEAL', 'oa_expense_type', 'default'),
(4, '住宿费', 'ACCOMMODATION', 'oa_expense_type', 'default'),
(5, '办公用品', 'OFFICE', 'oa_expense_type', 'default'),
(6, '其他', 'OTHER', 'oa_expense_type', 'default');
