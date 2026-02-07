# CloudFlow Pro V2.0 (Production Ready)

> **基于 Spring Cloud Alibaba + React 的企业级低代码工作流平台**

CloudFlow Pro 是一套成熟的微服务中台解决方案，经过多轮迭代，现已具备生产级能力。它集成了可视化工作流引擎、动态表单设计器、RBAC 权限管理、消息通知中心及文件管理模块，致力于通过“低代码+AI”的方式解决复杂的业务流程需求。

## ✨ 核心特性

- **🚀 生产就绪 (Production Ready)**
  - 完整的索引优化与 SQL 性能调优
  - 经过验证的高可用微服务架构
  - 集成 Notification 消息通知中心与 File 文件管理模块

- **⚙️ 强大的工作流引擎**
  - **可视化设计**: 支持 SVG 拖拽式流程建模
  - **复杂流转**: 支持并行网关、排他网关、SpEL 动态表达式路由
  - **SLA 控制**: 支持节点超时自动处理（自动通过/驳回/通知）与 Redis 延迟队列

- **📝 低代码表单能力**
  - **动态表单**: 拖拽生成 JSON Schema 表单，支持前后端双重校验
  - **AI 赋能**: 集成 Gemini API，通过自然语言自动生成业务代码（Controller/Service/SQL）

- **🛡️ 企业级安全**
  - **RBAC 权限**: 细粒度的用户、角色、部门、菜单权限控制
  - **安全认证**: JWT + Redis 分布式会话，集成自研滑块验证码防止暴力破解

## 🏗 技术架构

### 后端 (Spring Cloud Alibaba 2023.x)
- **网关**: Spring Cloud Gateway
- **注册/配置**: Nacos 2.x
- **服务调用**: OpenFeign + LoadBalancer
- **数据库**: MySQL 8.0 (生产级索引优化)
- **缓存/消息**: Redis 7.0 (Pub/Sub & ZSet)
- **任务调度**: Spring Scheduled + Redis

### 前端 (React 18)
- **框架**: Vite + TypeScript
- **UI**: Tailwind CSS + Lucide Icons
- **状态管理**: Zustand / React Query

## 📂 项目结构

```
CloudFlow Pro/
├── cloudflow-backend/          # 后端工程
│   ├── cloudflow-gateway/      # 网关服务 (9000)
│   ├── cloudflow-auth/         # 认证中心 (9001)
│   ├── cloudflow-service-workflow/ # 工作流核心服务 (9002)
│   ├── cloudflow-common/       # 公共模块
│   └── DB/                     # 数据库初始化脚本
├── cloudflow-frontend/         # 前端工程 (9527)
└── 项目详细文档.md               # 详细架构与开发文档
```

## 🚀 快速开始

### 1. 环境准备
- **MySQL 8.0+**
- **Redis 6.0+**
- **Nacos 2.x** (确保已启动)
- **JDK 17+** & **Maven 3.8+**
- **Node.js 18+**

### 2. 数据库初始化
进入 `cloudflow-backend/DB` 目录，执行全量初始化脚本：

```bash
# 推荐使用全量脚本，包含所有模块与索引
mysql -u root -p cloud_flow_db < cloudflow_full_init.sql
```

> 详细脚本说明请参考 [DB/README.md](cloudflow-backend/DB/README.md)

### 3. 启动后端
建议在 IDE 中按顺序启动以下服务：
1. **CloudFlowAuth** (认证服务)
2. **CloudFlowWorkflow** (工作流服务)
3. **CloudFlowGateway** (网关服务)

### 4. 启动前端

```bash
cd cloudflow-frontend
npm install
npm run dev
```
访问地址: `http://localhost:3000`

## 📦 生产环境部署建议

1. **配置分离**: 建议将 `bootstrap.yaml` 中的配置迁移至 Nacos 配置中心，并使用 `--spring.profiles.active=prod` 启动。
2. **容器化**: 建议为每个微服务构建 Docker 镜像，配合 K8s 进行编排。
3. **高可用**: 生产环境建议部署 Nacos 集群和 Redis Sentinel/Cluster 模式。

## 📚 详细文档

更多关于架构设计、SLA 实现原理及代码生成器的使用，请参阅 [项目详细文档](项目详细文档%20(Project%20Documentation).md)。
