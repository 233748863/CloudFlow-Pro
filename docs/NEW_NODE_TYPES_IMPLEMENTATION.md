# 新节点类型实现文档

## 概述
本文档记录了为工作流设计器添加的5种新节点类型的实现细节。

## 已完成的工作

### 1. 前端实现 (cloudflow-frontend)
✅ **types.ts** - 添加了新节点类型定义
- NOTIFICATION (通知节点)
- SCRIPT (脚本节点)
- TIMER (定时节点)
- SUBPROCESS (子流程节点)
- MANUAL (人工任务节点)

✅ **WorkflowBuilder.tsx** - 完整的UI支持
- 导入了新节点图标
- 配置了节点视觉样式
- 添加到快捷菜单
- 设置默认标题

### 2. 后端基础实现 (cloudflow-backend)

✅ **依赖管理 (pom.xml)**
- 添加 Groovy 脚本引擎依赖
- 添加 Apache HttpClient 5 依赖

✅ **域模型更新 (WfNodeConfig.java)**
- 更新 type 字段注释包含所有新节点类型

✅ **核心服务 (WorkflowServiceImpl.java)**
- 在 runNode 方法中添加了所有新节点类型的处理分支
- 实现了基础的节点处理器方法框架

✅ **脚本执行服务 (ScriptExecutionService.java)**
- 实现了 Groovy 脚本执行功能
- 支持变量绑定和上下文传递
- JavaScript 执行预留接口

✅ **HTTP客户端服务 (HttpClientService.java)**
- 实现了完整的 HTTP 请求功能
- 支持 GET, POST, PUT, DELETE, PATCH 等方法
- 支持自定义请求头和请求体
- 返回结构化的响应结果

## 最新完成的工作

### 1. ✅ WorkflowServiceImpl 集成新服务
- 已完成 handleScriptNode 方法集成 ScriptExecutionService 和 HttpClientService
- 支持 Groovy、JavaScript 和 API 三种脚本执行模式
- 实现了完整的变量替换和结果存储机制

### 2. ✅ 定时节点调度器实现
**TimerSchedulerService.java** - 完整的定时任务调度服务
- 每分钟扫描 Redis 中的到期定时任务
- 自动触发流程继续执行
- 支持定时任务的取消和清理
- 实现了故障恢复机制

**Spring 调度配置**
- 在 WorkflowApplication 中启用 @EnableScheduling
- 定时任务自动运行，无需手动触发

### 3. ✅ runNode 方法访问性调整
- 将 runNode 方法从 private 改为 public
- 允许 TimerSchedulerService 调用以继续流程执行

### 4. 待完成：前端配置界面
在前端创建专门的配置面板：
- 通知节点配置面板（接收人、内容模板等）
- 脚本节点配置面板（脚本类型、脚本内容、API配置等）
- 定时节点配置面板（延迟时间、定时规则等）
- 子流程节点配置面板（子流程选择、变量映射等）
- 人工任务节点配置面板（任务描述、处理人等）

**注意**: 前端配置界面需要根据实际的 UI 框架和设计规范来实现，建议在 WorkflowBuilder.tsx 中为每种节点类型添加专门的配置表单。

## 节点类型详细说明

### NOTIFICATION (通知节点)
**用途**: 发送通知消息给指定接收人
**配置项**:
- noticeTitle: 通知标题
- noticeContent: 通知内容（支持变量替换）
- noticeType: 通知类型（1-通知 2-公告）
- recipientType: 接收人类型（INITIATOR/ROLE/USER/DEPT）
- recipientValue: 接收人值

**执行逻辑**: 发送通知后自动继续流程

### SCRIPT (脚本节点)
**用途**: 执行自动化脚本或API调用
**配置项**:
- scriptType: 脚本类型（GROOVY/JAVASCRIPT/API）
- scriptContent: 脚本内容
- apiUrl: API地址（API模式）
- apiMethod: HTTP方法（API模式）
- apiHeaders: 请求头（API模式）
- apiBody: 请求体（API模式）
- continueOnError: 失败时是否继续

**执行逻辑**: 
- GROOVY模式: 使用 GroovyShell 执行脚本
- API模式: 使用 HttpClient 调用API
- 执行后自动继续流程

### TIMER (定时节点)
**用途**: 延迟或定时触发流程
**配置项**:
- timerType: 定时类型（DELAY/SCHEDULE）
- delayMinutes: 延迟分钟数（DELAY模式）
- scheduleTime: 定时时间（SCHEDULE模式）

**执行逻辑**: 
- 将定时信息存储到 Redis
- 暂停流程等待触发
- 由调度器在指定时间继续流程

### SUBPROCESS (子流程节点)
**用途**: 调用其他工作流作为子流程
**配置项**:
- subProcessKey: 子流程定义Key
- variableMapping: 变量映射配置
- continueOnError: 失败时是否继续

**执行逻辑**: 
- 启动子流程实例
- 传递父流程变量
- 记录父子关系
- 执行后自动继续流程

### MANUAL (人工任务节点)
**用途**: 创建需要人工处理但不是审批的任务
**配置项**:
- taskDescription: 任务描述
- approverType: 处理人类型
- approverValue: 处理人值

**执行逻辑**: 
- 创建人工任务
- 分配处理人
- 发送通知
- 暂停流程等待处理

## 技术架构

### 脚本执行安全性
- 使用 GroovyShell 的沙箱模式
- 限制脚本执行时间
- 限制可访问的类和方法
- 记录脚本执行日志

### HTTP调用安全性
- 支持自定义超时时间
- 支持请求重试机制
- 记录API调用日志
- 错误处理和异常捕获

### 定时任务可靠性
- 使用 Redis 持久化定时信息
- 支持定时任务的故障恢复
- 防止重复触发
- 支持定时任务的取消

### 子流程管理
- 记录父子流程关系
- 支持子流程的独立监控
- 子流程失败不影响父流程（可配置）
- 支持子流程的递归调用限制

## 下一步计划

1. **立即完成**:
   - 更新 WorkflowServiceImpl 集成新服务
   - 创建定时任务调度器
   
2. **短期计划**:
   - 实现前端配置界面
   - 添加节点配置验证
   - 完善错误处理

3. **长期优化**:
   - 添加节点执行监控
   - 实现节点执行统计
   - 优化性能和资源使用
