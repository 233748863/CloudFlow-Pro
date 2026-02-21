# 数据库表缺失问题修复文档

## 问题描述

监控页面访问时报错:

```
Table 'cloud_flow_db.wf_process' doesn't exist
```

## 根本原因

1. **数据库表未创建**: 监控功能需要的数据库表还没有执行初始化脚本
2. **表名不匹配**: Mapper XML中使用了错误的表名`wf_process`,应该使用`wf_process_monitor`
3. **字段名不匹配**: Mapper XML中的字段名与数据库表结构不完全一致

## 解决方案

### 方案1: 执行数据库初始化脚本(推荐)

执行以下SQL脚本创建监控相关表:

```bash
mysql -u root -p cloud_flow_db < cloudflow-backend/DB/03.cloudflow-workflow-monitor.sql
```

该脚本会创建以下表:
- `wf_process_monitor` - 流程执行监控表
- `wf_node_monitor` - 节点执行监控表  
- `wf_task_monitor` - 任务执行监控表
- `wf_timeout_alert` - 超时告警记录表
- `wf_anomaly_alert` - 异常流程记录表
- `wf_performance_stats` - 流程性能统计表

### 方案2: 修复Mapper XML表名和字段映射

需要修改`ProcessMonitorMapper.xml`,将所有`wf_process`改为`wf_process_monitor`,并调整字段映射:

**表名映射**:
- `wf_process` → `wf_process_monitor`
- 字段名需要对应SQL表结构

**字段映射对照**:

| Mapper XML字段 | 数据库表字段 | 说明 |
|---------------|-------------|------|
| instance_id | instance_id | 流程实例ID |
| process_def_key | process_def_key | 流程定义Key |
| process_name | process_def_name | 流程定义名称 |
| status | status | 状态 |
| start_time | start_time | 开始时间 |
| end_time | end_time | 结束时间 |
| duration_ms | duration | 执行时长(毫秒) |
| initiator | start_user_name | 发起人 |

## 当前状态

- ❌ 数据库表未创建
- ❌ Mapper XML表名错误
- ❌ 字段映射不完全匹配

## 推荐操作步骤

1. **立即执行**: 运行数据库初始化脚本
   ```bash
   mysql -u root -p cloud_flow_db < cloudflow-backend/DB/03.cloudflow-workflow-monitor.sql
   ```

2. **修复Mapper**: 修改ProcessMonitorMapper.xml中的表名和字段映射

3. **重启服务**: 重启workflow服务使更改生效

4. **验证功能**: 访问监控页面确认数据正常显示

## 注意事项

1. 执行SQL脚本前请备份数据库
2. 确认数据库连接配置正确
3. 如果表已存在,脚本会先删除再创建(DROP TABLE IF EXISTS)
4. 所有表都使用`tenant_id`字段支持多租户

## 相关文件

- SQL脚本: `cloudflow-backend/DB/03.cloudflow-workflow-monitor.sql`
- Mapper XML: `cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow/ProcessMonitorMapper.xml`
- 其他文档: 
  - `docs/GATEWAY_ROUTING_FIX.md`
  - `docs/PERMISSION_BEAN_MISSING_FIX.md`

## 修复时间

2026-02-22 06:32

## 修复人员

CloudFlow Team
