# CloudFlow Pro V2.0 - 企业级微服务中台解决方案

> **基于 React + Spring Cloud Alibaba 的生产级可视化工作流与低代码平台**

## 📖 项目简介

**CloudFlow Pro** 是一套面向企业级复杂业务场景的微服务中台系统。它集成了**RBAC权限管理**、**可视化工作流引擎**、**动态表单设计器**、**消息通知中心**以及**文件管理**服务。

其核心亮点在于**“所见即所得”的后端代码生成能力**：通过前端可视化建模，结合 AI 智能分析，自动生成符合规范的 Spring Cloud 业务代码（SQL DDL、Java 业务逻辑、Redis 监听逻辑），极大降低了中后台业务的开发成本。

## 🛠 技术栈

### 前端 (Frontend)

- **框架**: React 18 + TypeScript
- **UI 组件库**: Tailwind CSS + Lucide React
- **构建工具**: Webpack / Vite
- **核心能力**:
  - SVG 可视化流程设计器
  - 拖拽式动态表单生成器 (JSON Schema)
  - AI 辅助代码生成 (Gemini API Integration)
  - WebSocket 实时消息推送

### 后端 (Backend Architecture)

- **核心框架**: Spring Cloud Alibaba (2023.x)
- **注册/配置中心**: Nacos 2.x
- **网关**: Spring Cloud Gateway
- **数据库**: MySQL 8.0 (生产级索引优化)
- **缓存/消息**: Redis 7.0 (Pub/Sub + ZSet)
- **任务调度**: Spring Scheduled + Redis ZSet (实现 SLA 延迟队列)

## ✨ 核心功能

### 1. 可视化工作流引擎

- **多类型节点**: 支持审批节点、并行网关 (Parallel)、条件网关 (Exclusive)、结束节点。
- **复杂路由**: 支持基于 SpEL 表达式的动态分支流转 (e.g., amount > 5000 && type == 'IT')。
- **SLA 服务等级**: 支持配置节点超时时间，超时后自动触发通知、自动通过或自动驳回。
- **拖拽排序**: 支持分支节点的逻辑顺序调整。

### 2. 动态表单系统 (Dynamic Form)

- **零代码设计**: 拖拽生成文本、数字、日期、下拉框等字段。
- **智能校验**: 支持配置正则表达式 (Regex) 进行前端+后端双重校验。
- **数据存储**: 基于 JSON 类型存储非结构化业务数据，无需频繁修改数据库表结构。

### 3. 安全认证体系 (Security & Auth)

- **JWT 认证**: 采用 JWT + Redis 实现分布式会话管理，支持 Token 自动续期。
- **滑块验证码**: 集成自研滑块验证码系统，有效防止恶意注册和暴力破解。
- **RBAC 权限**: 细粒度的用户、角色、部门、菜单权限控制。

### 4. 消息通知与文件服务

- **实时通知**: 基于 WebSocket 实现站内信推送（审批任务提醒、系统公告）。
- **文件管理**: 支持本地存储及 OSS 对象存储扩展，提供文件上传、下载接口。

### 5. 源码生成器 (AI-Powered)

- **SQL 生成**: 自动生成业务主表、表单定义数据、工作流配置数据的初始化脚本。
- **Java 生成**: 自动生成 Controller、Service、RedisListener 代码，包含完整的业务逻辑注释。

## 📂 后端工程结构

```
cloudflow-backend/
├── cloudflow-gateway         # 网关服务 (9000)
├── cloudflow-auth            # 认证中心 (9001)
│   ├── src/main/java/com/cloudflow/auth
│   │   ├── controller
│   │   │   ├── AuthController.java    # 登录/注册/验证码
│   │   │   └── system/SysFileController.java # 文件上传接口
│   │   └── utils/SliderPuzzleUtil.java # 滑块验证码工具
├── cloudflow-service-workflow # 工作流核心服务 (9002)
│   ├── src/main/java/com/cloudflow/workflow
│   │   ├── config
│   │   │   ├── RedisConfig.java       # Redis监听配置
│   │   │   └── WebSocketConfig.java   # WebSocket配置
│   │   ├── controller
│   │   │   ├── WorkflowController.java
│   │   │   └── SysNoticeController.java # 消息通知接口
│   │   ├── listener
│   │   │   └── TaskEventListener.java # 处理 SLA 超时与异步事件
│   │   └── service
│   │       └── impl/WorkflowServiceImpl.java # 核心引擎逻辑
└── cloudflow-common          # 公共模块
```

## 🚀 快速开始

### 1. 环境准备

- MySQL 8.0+
- Redis 6.0+
- Nacos 2.x
- JDK 17+

### 2. 数据库初始化

推荐使用全量脚本进行一键初始化：

1. 进入 `cloudflow-backend/DB` 目录。
2. 执行 `mysql -u root -p cloud_flow_db < cloudflow_full_init.sql`。
3. 该脚本包含所有表结构、索引及初始数据。

### 3. 部署微服务

1. 启动 Nacos。
2. 依次启动 `cloudflow-auth`, `cloudflow-service-workflow`, `cloudflow-gateway`。
3. 观察日志确认服务注册成功。

### 4. 运行业务

1. 在前端 **“流程设计”** 中定义您的业务流。
2. 在 **“审批待办”** 中发起测试任务。
3. 观察右上角通知铃铛，确认收到 WebSocket 实时推送。

## 🛡️ SLA 超时设计原理

本系统采用 **Redis ZSet (Sorted Set)** 实现高性能延迟任务队列：

1. **任务创建**:
   - 计算 timeout_timestamp = now + sla_hours。
   - Redis 命令: ZADD sys:task:timeouts <timestamp> <taskId>。
2. **监控扫描**:
   - 后台 SLAMonitorJob 每分钟运行一次。
   - Redis 命令: ZRANGEBYSCORE sys:task:timeouts 0 <current_timestamp>。
   - 取出所有过期任务 ID，执行自动审批逻辑，并从 ZSet 中移除。

------

*文档版本: 2.1.0 | 状态: Production Ready*
