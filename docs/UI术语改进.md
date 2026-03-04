# API 404 问题解决方案

## 问题描述

前端调用监控API时出现404错误:
```
No static resource monitor/overview
No static resource monitor/anomaly/list
No static resource monitor/timeout/list
No static resource monitor/trend
```

## 问题原因

**WorkflowMonitorController已经编译成功,但运行中的服务还是旧版本,没有包含新的Controller。**

从日志时间戳可以看出:
- 编译时间: 刚才完成
- 服务运行时间: `2026-02-22T06:09:05` (还在运行旧代码)
- 错误发生时间: `2026-02-22T06:09:05` - `2026-02-22T06:09:06`

## 解决方案

### 方案1: 重启后端服务 (推荐)

```bash
# 停止当前运行的服务
# 然后重新启动

# 或者如果使用IDE,直接重启应用
```

### 方案2: 使用Spring Boot DevTools热部署

如果项目配置了DevTools,修改代码后会自动重启。

### 方案3: 验证Controller是否正确加载

重启后,可以通过以下方式验证:

1. **查看启动日志**,确认Controller被扫描:
```
Mapped "{[/workflow/monitor/overview],methods=[GET]}" onto ...
```

2. **访问Swagger文档** (如果启用):
```
http://localhost:9002/swagger-ui.html
```

3. **直接测试API**:
```bash
curl http://localhost:9002/workflow/monitor/overview
```

## 验证清单

重启服务后,检查以下内容:

- [ ] 服务启动成功,无错误日志
- [ ] 启动日志中显示WorkflowMonitorController的映射
- [ ] 前端监控大屏可以正常加载数据
- [ ] 没有404错误

## Controller路径映射

确认以下API端点可用:

| 端点 | 方法 | 说明 |
|------|------|------|
| `/workflow/monitor/overview` | GET | 监控概览 |
| `/workflow/monitor/trend` | GET | 流程趋势 |
| `/workflow/monitor/process/list` | GET | 流程监控列表 |
| `/workflow/monitor/process/{id}` | GET | 流程监控详情 |
| `/workflow/monitor/timeout/list` | GET | 超时告警列表 |
| `/workflow/monitor/timeout/{id}/handle` | POST | 处理超时告警 |
| `/workflow/monitor/anomaly/list` | GET | 异常告警列表 |
| `/workflow/monitor/anomaly/{id}/resolve` | POST | 解决异常告警 |
| `/workflow/monitor/performance/stats` | GET | 性能统计 |

## 注意事项

1. **编译成功 ≠ 服务已更新**
   - Maven编译只是生成class文件
   - 需要重启服务才能加载新代码

2. **检查端口**
   - 确认服务运行在正确的端口 (9002)
   - 确认前端配置的API地址正确

3. **权限问题**
   - Controller方法使用了 `@PreAuthorize` 注解
   - 确保用户有相应权限: `workflow:monitor:view`, `workflow:alert:list` 等

## 总结

**立即操作**: 重启 `cloudflow-service-workflow` 服务,问题即可解决!
