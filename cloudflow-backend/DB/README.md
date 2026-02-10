# CloudFlow Pro 数据库脚本说明

## 概述

本目录包含 CloudFlow Pro 项目的所有数据库初始化和迁移脚本，按模块组织，便于维护和部署。

## 文件结构

### 核心初始化脚本（按顺序执行）

| 文件名 | 模块 | 说明 | 执行顺序 |
|--------|------|------|----------|
| `01.cloudflow-common.sql` | 公共基础模块 | 用户、角色、部门、菜单、租户、文件管理 | 1 |
| `02.cloudflow-workflow.sql` | 工作流核心模块 | 流程定义、实例、任务、表单、通知、会签 | 2 |
| `03.cloudflow-workflow-deploy.sql` | 工作流发布增强 | 发布窗口、通知、审批、回滚、影响分析 | 3 |
| `04.cloudflow-oa.sql` | OA办公模块 | 公告、日程、会议室、任务、考勤、资产、车辆 | 4 |

### 辅助文件

| 文件名 | 说明 |
|--------|------|
| `DATABASE_STRUCTURE.md` | 数据库结构文档 |
| `nacos_init.sql` | Nacos 配置中心初始化脚本 |
| `run_db_script.py` | Python 数据库脚本执行工具 |

## 快速开始

### 方式一：使用 MySQL 客户端

```bash
# 1. 创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS cloud_flow_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. 按顺序执行脚本
mysql -u root -p cloud_flow_db < 01.cloudflow-common.sql
mysql -u root -p cloud_flow_db < 02.cloudflow-workflow.sql
mysql -u root -p cloud_flow_db < 03.cloudflow-workflow-deploy.sql
mysql -u root -p cloud_flow_db < 04.cloudflow-oa.sql
```

### 方式二：使用 Python 脚本

```bash
# 配置数据库连接信息后执行
python run_db_script.py
```

### 方式三：使用 Navicat 等 GUI 工具

1. 连接到 MySQL 服务器
2. 创建数据库 `cloud_flow_db`
3. 依次打开并执行 SQL 文件（按编号顺序）

## 模块详细说明

### 01. 公共基础模块 (cloudflow-common)

**包含表：**
- `sys_tenant` - 租户表
- `sys_dept` - 部门表
- `sys_user` - 用户表
- `sys_role` - 角色表
- `sys_menu` - 菜单权限表
- `sys_user_role` - 用户角色关联表
- `sys_role_menu` - 角色菜单关联表
- `sys_file` - 文件管理表

**初始化数据：**
- 默认租户（ID: 100000）
- 6个部门（研发、财务、人力、法务、IT）
- 5个角色（管理员、经理、财务、HR、员工）
- 7个测试用户（密码统一为 123456）
- 基础菜单权限

### 02. 工作流核心模块 (cloudflow-workflow)

**包含表：**
- `wf_process_definition` - 流程定义表
- `wf_form_definition` - 表单定义表
- `wf_process_instance` - 流程实例表
- `wf_task` - 任务表
- `wf_task_history` - 任务历史表
- `wf_task_read` - 任务已读记录表
- `wf_task_urge` - 任务催办记录表
- `sys_notice` - 系统通知表
- `wf_countersign_task` - 会签任务表（P3新增）
- `wf_countersign_vote` - 会签投票记录表（P3新增）

**初始化数据：**
- 5个表单定义（报销、付款、请假、招聘、合同）
- 3个流程定义（报销流程、请假流程、合同审批流程）

**性能优化：**
- 任务表复合索引（assignee+status, instance+status）
- 流程实例表复合索引（start_user+status, process_key+status）
- 任务历史表复合索引（instance+create_time, operator+create_time）

### 03. 工作流发布增强模块 (cloudflow-workflow-deploy)

**包含表：**
- `wf_deploy_record` - 发布记录表
- `wf_deploy_window` - 发布窗口配置表
- `wf_deploy_notification` - 发布通知记录表
- `wf_deploy_approval` - 发布审批表
- `wf_deploy_approval_step` - 发布审批步骤表
- `wf_process_version_snapshot` - 流程版本快照表
- `wf_deploy_rollback_history` - 发布回滚历史表
- `wf_deploy_impact` - 发布影响分析表

**初始化数据：**
- 2个默认发布窗口（工作日窗口、周末维护窗口）

**功能特性：**
- 发布窗口管理（支持每日、每周、每月、自定义）
- 多渠道通知（邮件、短信、站内信、微信）
- 多级审批流程
- 版本快照与回滚
- 影响分析（运行实例、待办任务、表单变更、节点变更）

### 04. OA办公模块 (cloudflow-oa)

**包含表：**

**公告与通知：**
- `sys_announcement` - 系统公告表
- `sys_announcement_read` - 公告阅读记录表

**日程与会议室：**
- `sys_meeting_room` - 会议室资源表
- `sys_schedule_event` - 日程事件表

**任务协作：**
- `sys_work_task` - 协作任务表

**考勤管理：**
- `sys_attendance_record` - 考勤打卡记录表
- `sys_attendance_rule` - 考勤规则表

**资产管理：**
- `sys_asset` - 固定资产表
- `sys_consumable` - 耗材库存表
- `sys_asset_log` - 资产变动日志表

**车辆管理：**
- `sys_vehicle` - 车辆信息表
- `sys_vehicle_usage` - 用车申请与记录表
- `sys_vehicle_expense` - 车辆费用记录表

**业务表：**
- `biz_leave` - 请假业务表

**初始化数据：**
- 2条系统公告
- 3个会议室
- 2个日程事件
- 3个协作任务
- 1条考勤规则

## 数据库配置

### 开发环境

```yaml
数据库地址: 192.168.1.173:3306
数据库名称: cloud_flow_db
用户名: root
密码: Juwangkeji@2025
字符集: utf8mb4
排序规则: utf8mb4_unicode_ci
```

### 生产环境

生产环境部署前请修改：
1. 数据库密码
2. Redis 密码
3. JWT Secret
4. 初始用户密码

## 注意事项

### 执行顺序

⚠️ **必须按照编号顺序执行脚本**，因为存在表依赖关系：
- `02.cloudflow-workflow.sql` 依赖 `01.cloudflow-common.sql` 中的用户表
- `03.cloudflow-workflow-deploy.sql` 依赖 `02.cloudflow-workflow.sql` 中的流程定义表
- `04.cloudflow-oa.sql` 依赖 `01.cloudflow-common.sql` 中的用户表

### 字符集

所有表使用 `utf8mb4` 字符集，支持完整的 Unicode 字符（包括 Emoji）。

### 索引优化

脚本中已包含性能优化索引，特别是：
- 工作流任务表的复合索引（高频查询优化）
- 流程实例表的复合索引（列表查询优化）
- 租户隔离索引（多租户场景）

### 初始密码

所有初始用户的密码统一为 `123456`（BCrypt 加密），生产环境部署后请立即修改。

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-02-09 | 初始版本，整合所有模块脚本 |
| - | - | 包含 P2 发布增强功能 |
| - | - | 包含 P3 会签功能 |

## 相关文档

- [数据库结构文档](./DATABASE_STRUCTURE.md)
- [Nacos 配置指南](../docs/LOCAL_NACOS_CONFIGURATION.md)
- [后端部署指南](../docs/BACKEND_PRODUCTION_READINESS_FINAL_ASSESSMENT.md)

## 技术支持

如遇到问题，请检查：
1. MySQL 版本（建议 5.7+）
2. 字符集配置（必须支持 utf8mb4）
3. 数据库用户权限（需要 CREATE、ALTER、INSERT 权限）
4. 脚本执行日志（查看具体错误信息）

## 维护说明

### 添加新表

1. 确定表所属模块
2. 在对应的 SQL 文件中添加表结构
3. 更新本 README 文档
4. 更新 DATABASE_STRUCTURE.md

### 数据迁移

对于已有数据库的升级，建议：
1. 备份现有数据
2. 创建迁移脚本（ALTER TABLE 语句）
3. 在测试环境验证
4. 生产环境执行并验证

---

**最后更新**: 2026-02-09  
**维护者**: CloudFlow 开发团队
