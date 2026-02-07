# CloudFlow Pro 数据库初始化指南

**版本**: v2.0  
**更新日期**: 2026-02-07

本目录包含 CloudFlow Pro 项目的数据库初始化脚本和相关文档。

---

## 📁 目录结构

```
DB/
├── README.md                      # 本文件 - 数据库初始化指南
├── DATABASE_STRUCTURE.md          # 数据库结构详细文档
├── cloudflow_pro_init.sql         # 主初始化脚本（推荐使用）
├── 15_admin_logistics.sql         # 行政后勤模块（考勤、资产）
├── 20_vehicle_management.sql      # 车辆管理模块
└── run_db_script.py               # Python数据库脚本执行工具
```

---

## 🚀 快速开始

### 方式一：模块化安装（推荐）⭐

**适用场景**: 微服务架构，按需部署模块

```bash
# 1. 创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS cloudflow_pro DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. 按顺序执行模块脚本
mysql -u root -p cloudflow_pro < 01_common.sql      # 公共模块（必需）
mysql -u root -p cloudflow_pro < 02_workflow.sql    # 工作流模块（必需）
mysql -u root -p cloudflow_pro < 03_oa.sql          # OA模块（必需）
```

**包含内容**:
- ✅ **01_common.sql**: 用户、角色、部门、菜单、租户、文件管理
- ✅ **02_workflow.sql**: 流程定义、实例、任务、表单、通知
- ✅ **03_oa.sql**: 公告、日程、会议室、任务协作、考勤、资产、车辆

### 方式二：使用完整脚本

**适用场景**: 快速部署、开发测试环境

```bash
# 1. 创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS cloudflow_pro DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. 执行完整初始化脚本
mysql -u root -p cloudflow_pro < cloudflow_pro_init.sql
```

**注意**: cloudflow_pro_init.sql 包含所有模块的合并版本，适合一次性部署。

### 方式三：扩展模块安装

如果需要额外的行政后勤或车辆管理功能：

```bash
# 在执行完基础模块后，可选择性添加
mysql -u root -p cloudflow_pro < 15_admin_logistics.sql    # 扩展：考勤、资产管理
mysql -u root -p cloudflow_pro < 20_vehicle_management.sql  # 扩展：车辆管理
```

---

## 📂 SQL文件说明

### 核心模块文件（推荐使用）

| 文件名 | 说明 | 表数量 | 必需 |
|--------|------|--------|------|
| **01_common.sql** | 公共基础模块 | 8张表 | ✅ 必需 |
| **02_workflow.sql** | 工作流引擎模块 | 8张表 | ✅ 必需 |
| **03_oa.sql** | OA办公模块 | 14张表 | ✅ 必需 |

### 完整脚本文件

| 文件名 | 说明 | 必需 |
|--------|------|------|
| **cloudflow_pro_init.sql** | 完整初始化脚本（包含所有模块） | ⭕ 可选 |

### 扩展模块文件

| 文件名 | 说明 | 必需 |
|--------|------|------|
| **15_admin_logistics.sql** | 行政后勤扩展（考勤、资产） | ⭕ 可选 |
| **20_vehicle_management.sql** | 车辆管理扩展 | ⭕ 可选 |

---

## 📋 模块详细说明

### 01_common.sql - 公共基础模块

**包含表**:
- `sys_user` - 用户信息表
- `sys_dept` - 部门组织表
- `sys_role` - 角色信息表
- `sys_menu` - 菜单权限表
- `sys_user_role` - 用户角色关联表
- `sys_role_menu` - 角色菜单关联表
- `sys_tenant` - 租户信息表
- `sys_file` - 文件管理表

**初始化数据**:
- 默认租户（ID: 100000）
- 6个部门（研发部、财务部、人力资源部、法务部、IT部）
- 5个角色（管理员、经理、财务、HR、员工）
- 7个测试用户（admin, li, wang, zhao, zhang, liu, chen）
- 基础菜单权限

### 02_workflow.sql - 工作流引擎模块

**包含表**:
- `wf_process_instance` - 流程实例表
- `wf_task` - 流程任务表
- `wf_task_history` - 任务历史表
- `wf_process_definition` - 流程定义表
- `wf_form_definition` - 表单定义表
- `wf_task_read` - 任务已读记录表
- `wf_task_urge` - 任务催办记录表
- `sys_notice` - 系统通知表

**初始化数据**:
- 5个表单定义（报销、付款、请假、招聘、合同）
- 3个流程定义（报销流程、请假流程、合同审批流程）
- 性能优化索引

### 03_oa.sql - OA办公模块

**包含表**:
- `sys_announcement` - 系统公告表
- `sys_announcement_read` - 公告阅读记录表
- `sys_meeting_room` - 会议室资源表
- `sys_schedule_event` - 日程事件表
- `sys_work_task` - 协作任务表
- `sys_attendance_record` - 考勤打卡记录表
- `sys_attendance_rule` - 考勤规则表
- `sys_asset` - 固定资产表
- `sys_consumable` - 耗材库存表
- `sys_asset_log` - 资产变动日志表
- `sys_vehicle` - 车辆信息表
- `sys_vehicle_usage` - 用车申请与记录表
- `sys_vehicle_expense` - 车辆费用记录表
- `biz_leave` - 请假业务表

**初始化数据**:
- 2条公告（系统升级通知、春节放假安排）
- 3个会议室（大会议室A、小会议室B、VIP接待室）
- 2个日程事件（项目周会、拜访客户）
- 3个协作任务（设计、开发、文档）
- 1条考勤规则（默认考勤组）

---

## 🧪 默认测试账户

所有账户默认密码: **`123456`**

| 角色 | 账号 | 权限 |
| :--- | :--- | :--- |
| **超级管理员** | `admin` | 系统全权，可管理用户、配置、流程定义 |
| **部门经理** | `li` | 审批本部门（研发部）申请 |
| **财务专员** | `wang` | 审批财务类流程 |
| **人事专员** | `zhao` | 审批人事类流程 |
| **普通员工** | `zhang` | 发起流程，查看本人待办 |

## ⚠️ 注意事项

1. **MySQL 版本**: 推荐 MySQL 8.0+。
2. **字符集**: 脚本默认使用 `utf8mb4`。
3. **Nacos 配置**: 如果使用 `04_nacos_config.sql`，请确保 Nacos 处于运行状态并配置了正确的数据库连接，或者手动在 Nacos 控制台导入。
