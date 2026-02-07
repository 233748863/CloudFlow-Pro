# CloudFlow Pro 数据库结构文档

**版本**: v2.0  
**更新日期**: 2026-02-07  
**数据库**: cloudflow_pro

---

## 📋 数据库概览

CloudFlow Pro 使用 MySQL 8.0+ 数据库，采用微服务架构设计，支持多租户模式。

### 核心模块

1. **系统管理模块** - 用户、角色、部门、菜单权限
2. **工作流引擎模块** - 流程定义、实例、任务管理
3. **OA办公模块** - 公告、日程、会议室、任务协作
4. **行政后勤模块** - 考勤、资产、耗材管理
5. **车辆管理模块** - 车辆信息、用车申请、费用记录
6. **文件管理模块** - 文件上传、存储管理
7. **通知系统模块** - 站内通知、消息推送
8. **多租户模块** - 租户隔离、数据权限

---

## 🗂️ 数据库表分类

### 1. 系统管理表 (System Management)

| 表名 | 说明 | 记录数 |
|------|------|--------|
| sys_user | 用户信息表 | ~100 |
| sys_dept | 部门组织表 | ~50 |
| sys_role | 角色信息表 | ~20 |
| sys_menu | 菜单权限表 | ~100 |
| sys_user_role | 用户角色关联表 | ~200 |
| sys_role_menu | 角色菜单关联表 | ~500 |
| sys_tenant | 租户信息表 | ~10 |

**关键字段**:
- `tenant_id`: 租户ID（所有表都包含，用于数据隔离）
- `del_flag`: 删除标志（0存在 2删除）
- `status`: 状态标志（0正常 1停用）

### 2. 工作流引擎表 (Workflow Engine)

| 表名 | 说明 | 记录数 |
|------|------|--------|
| wf_process_definition | 流程定义表 | ~50 |
| wf_form_definition | 表单定义表 | ~30 |
| wf_process_instance | 流程实例表 | ~10000 |
| wf_task | 待办任务表 | ~5000 |
| wf_task_history | 任务历史表 | ~20000 |
| wf_task_read | 任务已读记录表 | ~15000 |
| wf_task_urge | 任务催办记录表 | ~1000 |

**流程状态**:
- RUNNING: 运行中
- COMPLETED: 已完成
- CANCELLED: 已取消

**任务状态**:
- TODO: 待办
- DONE: 已完成

### 3. OA办公表 (Office Automation)

| 表名 | 说明 | 记录数 |
|------|------|--------|
| sys_announcement | 系统公告表 | ~500 |
| sys_announcement_read | 公告阅读记录表 | ~5000 |
| sys_notice | 系统通知表 | ~10000 |
| sys_schedule_event | 日程事件表 | ~2000 |
| sys_meeting_room | 会议室资源表 | ~10 |
| sys_work_task | 协作任务表 | ~1000 |

**公告类型**:
- 1: 通知
- 2: 公告
- 3: 紧急

**日程类型**:
- MEETING: 会议
- PERSONAL: 个人日程
- WORK: 工作安排

### 4. 行政后勤表 (Admin & Logistics)

| 表名 | 说明 | 记录数 |
|------|------|--------|
| sys_attendance_record | 考勤打卡记录表 | ~50000 |
| sys_attendance_rule | 考勤规则表 | ~5 |
| sys_asset | 固定资产表 | ~500 |
| sys_consumable | 耗材库存表 | ~200 |
| sys_asset_log | 资产变动日志表 | ~2000 |
| biz_leave | 请假业务表 | ~1000 |

**考勤状态**:
- 1: 正常
- 2: 迟到
- 3: 早退
- 4: 外勤
- 5: 缺卡

**资产状态**:
- 1: 闲置
- 2: 在用
- 3: 维修
- 4: 报废
- 5: 丢失

### 5. 车辆管理表 (Vehicle Management)

| 表名 | 说明 | 记录数 |
|------|------|--------|
| sys_vehicle | 车辆信息表 | ~20 |
| sys_vehicle_usage | 用车申请与记录表 | ~1000 |
| sys_vehicle_expense | 车辆费用记录表 | ~2000 |

**车辆状态**:
- 1: 可用
- 2: 已预约
- 3: 使用中
- 4: 维修中
- 5: 报废

**用车状态**:
- 0: 待审批
- 1: 已批准
- 2: 已驳回
- 3: 进行中
- 4: 已完成
- 5: 已取消

**费用类型**:
- 1: 油费
- 2: 过路费
- 3: 停车费
- 4: 维修保养
- 5: 保险
- 6: 其他

### 6. 文件管理表 (File Management)

| 表名 | 说明 | 记录数 |
|------|------|--------|
| sys_file | 文件管理表 | ~5000 |

**支持的文件类型**:
- 图片: jpg, png, gif, bmp
- 文档: pdf, doc, docx, xls, xlsx, ppt, pptx
- 压缩包: zip, rar, 7z
- 其他: txt, csv, json, xml

---

## 🔑 关键索引设计

### 高频查询索引

```sql
-- 用户相关
CREATE INDEX idx_user_tenant ON sys_user(tenant_id);
CREATE UNIQUE INDEX uk_user_name_tenant ON sys_user(user_name, tenant_id);

-- 工作流相关
CREATE INDEX idx_wf_task_assignee ON wf_task(assignee);
CREATE INDEX idx_wf_inst_business_key ON wf_process_instance(business_key);
CREATE INDEX idx_wf_task_instance_id ON wf_task(instance_id);

-- 考勤相关
CREATE INDEX idx_att_user_time ON sys_attendance_record(user_id, check_time);

-- 车辆相关
CREATE INDEX idx_vehicle_usage_time ON sys_vehicle_usage(start_time, end_time);
```

---

## 📊 数据量估算

### 按模块统计（年度）

| 模块 | 预估记录数 | 增长率 |
|------|-----------|--------|
| 用户管理 | 100-500 | 低 |
| 工作流实例 | 10,000-50,000 | 高 |
| 考勤记录 | 50,000-200,000 | 高 |
| 公告通知 | 1,000-5,000 | 中 |
| 车辆使用 | 1,000-5,000 | 中 |
| 文件存储 | 5,000-20,000 | 中 |

### 存储空间估算

- **数据库**: 约 2-5 GB/年
- **文件存储**: 约 10-50 GB/年
- **日志文件**: 约 5-10 GB/年

---

## 🔐 数据安全设计

### 1. 多租户隔离

所有业务表都包含 `tenant_id` 字段，确保数据隔离：

```sql
-- 查询时必须带上租户条件
SELECT * FROM sys_user WHERE tenant_id = ? AND user_name = ?;
```

### 2. 软删除机制

使用 `del_flag` 字段实现软删除，保留数据历史：

```sql
-- 删除操作
UPDATE sys_user SET del_flag = '2' WHERE user_id = ?;

-- 查询时过滤已删除数据
SELECT * FROM sys_user WHERE del_flag = '0';
```

### 3. 审计字段

所有表都包含审计字段：
- `create_by`: 创建者
- `create_time`: 创建时间
- `update_by`: 更新者
- `update_time`: 更新时间

---

## 🚀 性能优化建议

### 1. 分区策略

对于大表建议按时间分区：

```sql
-- 考勤记录表按月分区
ALTER TABLE sys_attendance_record
PARTITION BY RANGE (YEAR(check_time) * 100 + MONTH(check_time)) (
    PARTITION p202601 VALUES LESS THAN (202602),
    PARTITION p202602 VALUES LESS THAN (202603),
    ...
);
```

### 2. 归档策略

- **工作流历史**: 保留2年，超过2年归档到历史库
- **考勤记录**: 保留3年，超过3年归档
- **文件记录**: 保留5年，超过5年归档

### 3. 缓存策略

高频查询数据建议使用 Redis 缓存：
- 用户信息: 缓存30分钟
- 部门组织: 缓存1小时
- 角色权限: 缓存1小时
- 流程定义: 缓存2小时

---

## 📝 数据字典

### 通用状态码

| 字段 | 值 | 说明 |
|------|---|------|
| del_flag | 0 | 存在 |
| del_flag | 2 | 已删除 |
| status | 0 | 正常/启用 |
| status | 1 | 停用/禁用 |

### 性别代码

| 值 | 说明 |
|---|------|
| 0 | 男 |
| 1 | 女 |
| 2 | 未知 |

### 数据范围

| 值 | 说明 |
|---|------|
| 1 | 全部数据权限 |
| 2 | 自定义数据权限 |
| 3 | 本部门数据权限 |
| 4 | 本部门及以下数据权限 |

---

## 🔄 数据库版本管理

### 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2025-12-01 | 初始版本，包含基础模块 |
| v1.1 | 2025-12-15 | 添加多租户支持 |
| v1.2 | 2026-01-10 | 添加OA办公模块 |
| v1.3 | 2026-01-20 | 添加行政后勤模块 |
| v1.4 | 2026-02-01 | 添加车辆管理模块 |
| v2.0 | 2026-02-07 | OA模块独立，微服务架构优化 |

### 升级脚本

升级脚本按版本号命名，存放在 `DB/upgrades/` 目录：
- `upgrade_v1.0_to_v1.1.sql`
- `upgrade_v1.1_to_v1.2.sql`
- ...

---

## 📚 相关文档

- [数据库初始化指南](./README.md)
- [OA模块重构总结](../docs/OA_MODULE_REFACTORING_SUMMARY.md)
- [部署指南](../docs/OA_MODULE_DEPLOYMENT_GUIDE.md)

---

**文档维护者**: CloudFlow 开发团队  
**最后更新**: 2026-02-07
