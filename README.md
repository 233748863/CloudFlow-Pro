# CloudFlow Pro

CloudFlow Pro 是一个面向企业办公、流程审批和人力资源场景的低代码工作流平台。当前仓库已经从早期的 4 服务形态演进为网关、认证、工作流、OA、HR、前端和监控配套的多模块工程，README 已按当前代码结构重写。

<div align="center">

[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2.6-brightgreen)](https://spring.io/projects/spring-boot)
[![Spring Cloud](https://img.shields.io/badge/Spring%20Cloud-2023.0.1-blue)](https://spring.io/projects/spring-cloud)
[![Spring Cloud Alibaba](https://img.shields.io/badge/Spring%20Cloud%20Alibaba-2023.0.1.0-blue)](https://github.com/alibaba/spring-cloud-alibaba)
[![React](https://img.shields.io/badge/React-19.2.0-61dafb)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.4.1-646cff)](https://vite.dev/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

[API 文档](http://localhost:9000/doc.html) | [前端入口](http://localhost:3000)

</div>

## 📌 当前状态

| 项 | 当前仓库状态 |
| --- | --- |
| 后端版本 | `cloudflow-backend` Maven 版本 `1.0.0` |
| 前端版本 | `cloudflow-frontend` package 版本 `0.0.0` |
| 后端服务 | 网关、认证、工作流、OA、HR |
| 公共能力 | 16 个 `cloudflow-common-*` 子模块 |
| Controller | 业务服务 84 个，公共 SSE 1 个 |
| 前端页面 | `src/pages` 下 94 个 TSX 页面组件 |
| 数据库结构 | `01`-`04` 脚本合计 135 张结构表 |
| 本地一键启动 | `start-cloudflow.ps1` 启动 5 个后端服务和前端 |
| Docker Compose | 已编排 MySQL、Redis、Nacos、网关、认证、工作流、OA、Prometheus、Grafana、前端；HR 容器尚未编排 |

## ✨ 核心能力

- ⚙️ 工作流：流程设计、动态表单、模板库、版本管理、抄送、会签、加签、减签、委派、发布窗口、发布审批、回滚、归档、流程监控、超时告警、异常告警、性能统计。
- 🛡️ 系统治理：认证登录、滑块验证码、Sa-Token 会话、RBAC 权限、菜单权限、数据权限、多租户、字典、参数配置、文件管理、操作日志、审计日志、在线用户、Redis 缓存监控。
- 💼 OA：公告、日程、会议室、通讯录、访客、资产、耗材、车辆、费用报销、付款申请、采购申请、合同、风险告警、印章、证照、值班排班、知识库、离线同步、前端错误上报。
- 👥 HR：组织编制、岗位族、职级、职位、员工档案、合同、入职、转正、调岗、离职、考勤、请假、加班、排班、薪酬、社保、个税、绩效、招聘、候选人、面试、Offer、HR 审计。
- 📱 前端体验：React 19、Vite、Tailwind CSS 4、路由守卫、响应式页面、PWA、离线同步、工作台组件、流程设计器、模板库、监控看板、HR 工作区。

## 🧩 近期增量

- 工作台接口增强：`/oa/workplace/summary` 聚合待办、抄送、公告、日程、会议室、HR 提醒、合同/车辆/证照/资产风险、最近动态和服务健康状态；前端 `/` 与 `/dashboard` 保持原版仪表盘体验。
- 审计追踪增强：OA 统一时间线接口为 `/oa/timeline`，复用 `oa_trace_event` 输出合同、用印、证照、车辆、资产、报销、采购、知识库等业务事件。
- 业务规则中心：系统规则接口为 `/auth/system/rules`，首版固定支持 `hr.leave.quota.limit`、`oa.expense.amount.limit`、`oa.contract.risk.threshold` 三个阈值规则，执行结果为 `BLOCK`、`WARN`、`PASS`。
- 规则治理 V2：规则中心支持草稿版本、发布、回滚和命中记录；OA/HR 规则执行写入 `/auth/system/rules/hit-records`。
- 审计复盘 V2：新增 `/oa/audit/events` 审计台账、CSV 导出和 `/oa/timeline/{id}/diff` 快照差异。

## 🏗️ 技术栈

### 🚀 后端

| 技术 | 版本 |
| --- | --- |
| JDK | 17 |
| Spring Boot | 3.2.6 |
| Spring Cloud | 2023.0.1 |
| Spring Cloud Alibaba | 2023.0.1.0 |
| Nacos | 2.3.0 |
| MySQL Driver | 8.0.33 |
| MyBatis Plus | 3.5.7 |
| Sa-Token | 1.45.0 |
| Redisson | 3.27.0 |
| Dynamic Datasource | 4.3.1 |
| Knife4j | 4.5.0 |
| FastExcel | 1.0.0 |
| Apache POI | 5.2.5 |
| Javers | 7.6.2 |
| Hutool | 5.8.26 |

### 🎨 前端

| 技术 | 版本 |
| --- | --- |
| React | 19.2.0 |
| TypeScript | 5.8.2 |
| Vite | 6.4.1 |
| Tailwind CSS | 4.1.18 |
| React Router | 7.13.0 |
| TanStack React Query | 5.90.20 |
| Zustand | 5.0.11 |
| dnd-kit | 6.3.1 / 10.0.0 |
| FullCalendar | 6.1.20 |
| Lucide React | 0.555.0 |
| vite-plugin-pwa | 1.2.0 |

## 🔌 服务与端口

| 服务 | 模块 | 默认端口 | 说明 |
| --- | --- | --- | --- |
| 前端开发服务 | `cloudflow-frontend` | `3000` | Vite，本地开发入口 |
| 网关 | `cloudflow-gateway` | `9000` | 统一入口，路由 `/auth`、`/workflow`、`/oa`、`/hr`、`/ws` |
| 认证服务 | `cloudflow-auth` | `9001` | 登录、租户、系统管理、文件、日志 |
| 工作流服务 | `cloudflow-service-workflow` | `9002` | 流程引擎、流程监控、模板、版本、发布 |
| OA 服务 | `cloudflow-service-oa` | `9003` | 办公、行政、合同、知识库、同步 |
| HR 服务 | `cloudflow-service-hr` | `9005` | 人力资源业务 |
| Nacos | Docker / 本地安装 | `8848` | 注册中心和配置中心 |
| MySQL | Docker / 本地安装 | `3306` | 默认库名 `cloud_flow_db` |
| Redis | Docker / 本地安装 | `6379` | 缓存、会话、分布式能力 |
| Prometheus | Docker Compose | `9090` | 采集 Actuator 指标 |
| Grafana | Docker Compose | `3000` | 默认外部端口和前端开发端口冲突，可用 `GRAFANA_PORT` 调整 |

## 📂 项目结构

```text
CloudFlow Pro/
├── cloudflow-backend/
│   ├── cloudflow-gateway/              # Spring Cloud Gateway
│   ├── cloudflow-auth/                 # 认证与系统管理
│   ├── cloudflow-service-workflow/     # 工作流核心服务
│   ├── cloudflow-service-oa/           # OA 办公服务
│   ├── cloudflow-service-hr/           # HR 人力资源服务
│   ├── cloudflow-common/               # 16 个公共子模块
│   └── DB/                             # 数据库结构、种子和演示脚本
├── cloudflow-frontend/
│   ├── src/pages/                      # 页面与业务工作区
│   ├── src/components/                 # 业务组件和通用组件
│   ├── src/services/api/               # 前端 API 封装
│   ├── src/stores/                     # Zustand 状态
│   └── src/utils/                      # 工具函数
├── config/                             # Nacos Data ID 配置文件
├── docker/                             # 服务镜像、Nginx、监控配置
├── docker-compose.yml                  # 容器编排，当前未包含 HR 服务
├── push_nacos_config.py                # 批量推送 Nacos 配置
├── start-cloudflow.ps1                 # Windows / PowerShell 本地全服务启动
└── start-cloudflow.bat                 # PowerShell 启动脚本封装
```

## 🗄️ 数据库脚本

| 文件 | 作用 | 结构表数量 |
| --- | --- | --- |
| `01.cloudflow-common.sql` | 租户、部门、用户、角色、菜单、岗位、文件、日志、字典、参数 | 15 |
| `02.cloudflow-workflow.sql` | 流程定义、实例、任务、会签、模板、版本、归档、监控、告警 | 41 |
| `03.cloudflow-hr.sql` | HR 组织、人事、考勤、薪酬、绩效、招聘、审计 | 43 |
| `04.cloudflow-oa.sql` | OA、行政、资产、车辆、费用、合同、印章、证照、访客、知识库 | 36 |
| `05.cloudflow-clear-all.sql` | 清理业务数据 | 0 |
| `06.cloudflow-business-seed.sql` | 初始化菜单、账号、流程模板和演示业务数据 | 4 |
| `07.cloudflow-performance-demo.sql` | 监控与性能演示数据 | 0 |

执行 `06.cloudflow-business-seed.sql` 后可使用以下账号登录，密码均为 `123456`：`admin`、`li`、`wang`、`zhao`、`zhang`。

## 🚀 本地快速启动

### ✅ 1. 环境要求

- JDK 17
- Maven 3.8+
- Node.js 18、20 或 22
- MySQL 8.0+
- Redis 7.x
- Nacos 2.3.x
- Python 3.9+，仅用于 `push_nacos_config.py`

### 🧱 2. 初始化数据库

PowerShell 示例：

```powershell
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS cloud_flow_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
Get-Content .\cloudflow-backend\DB\01.cloudflow-common.sql | mysql -u root -p cloud_flow_db
Get-Content .\cloudflow-backend\DB\02.cloudflow-workflow.sql | mysql -u root -p cloud_flow_db
Get-Content .\cloudflow-backend\DB\03.cloudflow-hr.sql | mysql -u root -p cloud_flow_db
Get-Content .\cloudflow-backend\DB\04.cloudflow-oa.sql | mysql -u root -p cloud_flow_db
Get-Content .\cloudflow-backend\DB\06.cloudflow-business-seed.sql | mysql -u root -p cloud_flow_db
```

Bash 示例：

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS cloud_flow_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p cloud_flow_db < cloudflow-backend/DB/01.cloudflow-common.sql
mysql -u root -p cloud_flow_db < cloudflow-backend/DB/02.cloudflow-workflow.sql
mysql -u root -p cloud_flow_db < cloudflow-backend/DB/03.cloudflow-hr.sql
mysql -u root -p cloud_flow_db < cloudflow-backend/DB/04.cloudflow-oa.sql
mysql -u root -p cloud_flow_db < cloudflow-backend/DB/06.cloudflow-business-seed.sql
```

### 📤 3. 推送 Nacos 配置

`config/` 下当前有 6 个标准 Data ID：`cloudflow-common.yaml`、`cloudflow-gateway.yaml`、`cloudflow-auth.yaml`、`cloudflow-service-workflow.yaml`、`cloudflow-service-hr.yaml`、`cloudflow-oa.yaml`。这些配置文件带有当前开发环境默认地址，首次运行前应把 MySQL、Redis、Nacos 地址和密码改成自己的环境值。

```powershell
python -m pip install requests
$env:NACOS_SERVER = "http://localhost:8848"
$env:NACOS_NAMESPACE = "0ccb9313-39d8-4a58-9fa5-ce834b77e60d"
$env:NACOS_USERNAME = "nacos"
$env:NACOS_PASSWORD = "nacos"
python .\push_nacos_config.py
```

### 📦 4. 安装前端依赖

```powershell
cd .\cloudflow-frontend
npm ci
cd ..
```

### ▶️ 5. 一键启动全服务

```powershell
.\start-cloudflow.bat
```

等价 PowerShell 命令：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\start-cloudflow.ps1
```

脚本会编译并安装后端内部依赖，启动网关、认证、工作流、OA、HR 和前端；运行日志写入 `.cloudflow-runtime/logs/`。

### 🌐 6. 访问入口

- 前端：`http://localhost:3000`
- 网关：`http://localhost:9000`
- API 文档：`http://localhost:9000/doc.html`
- Nacos：`http://localhost:8848/nacos`
- 工作流健康检查：`http://localhost:9002/actuator/health`
- HR 健康检查：`http://localhost:9005/actuator/health`

## 🧰 手动启动

后端编译：

```powershell
cd .\cloudflow-backend
mvn -pl cloudflow-gateway,cloudflow-auth,cloudflow-service-workflow,cloudflow-service-oa,cloudflow-service-hr -am -DskipTests -Dmaven.test.skip=true -Dmdep.analyze.skip=true install
```

单服务启动示例：

```powershell
cd .\cloudflow-backend\cloudflow-auth
mvn -Dspring-boot.run.mainClass=com.cloudflow.auth.AuthApplication spring-boot:run
```

前端启动：

```powershell
cd .\cloudflow-frontend
npm run dev
```

## 🐳 Docker Compose

当前 `docker-compose.yml` 适合启动基础容器化环境和监控面板：

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

当前 Compose 文件已编排 MySQL、Redis、Nacos、网关、认证、工作流、OA、Prometheus、Grafana、前端，尚未包含 `cloudflow-service-hr`；如需完整 HR 演示，以本地脚本启动 HR 服务，或补充 HR Dockerfile、Compose service、Prometheus target 和数据库初始化挂载。

Docker 访问入口：

- 前端 Nginx：`http://localhost`
- 网关：`http://localhost:9000`
- Nacos：`http://localhost:8848/nacos`
- Prometheus：`http://localhost:9090`
- Grafana：默认 `http://localhost:3000`，可通过 `.env` 的 `GRAFANA_PORT` 修改

## 🔧 开发命令

后端：

```powershell
cd .\cloudflow-backend
mvn -DskipTests "-Dmaven.test.skip=true" "-Dmdep.analyze.skip=true" install
```

前端：

```powershell
cd .\cloudflow-frontend
npm run type-check
npm run build
```

## ⚙️ 配置说明

- 前端默认把 `/api` 和 `/ws` 代理到 `VITE_API_BASE_URL`，未设置时为 `http://localhost:9000`。
- `GEMINI_API_KEY` 用于前端 AI 代码生成能力，通过 Vite `define` 注入。
- 后端优先读取 Nacos 配置，本地 `application.yml` 是后备配置。
- `config/*.yaml` 和部分 `application.yml` 中存在开发环境地址和默认密码，公开部署前必须改为环境变量、Nacos 密文或独立密钥管理。

## 📖 API 文档

启动后访问 Knife4j：`http://localhost:9000/doc.html`。README 不再维护逐接口清单，接口以 Controller 注解和在线文档为准，避免多次迭代后文档与代码漂移。

## 🤝 贡献

```bash
git checkout -b feature/your-feature
git commit -m "feat: describe your change"
git push origin feature/your-feature
```

提交 PR 前建议至少执行后端编译和前端类型检查。

## 📄 许可证

本项目采用 [MIT License](LICENSE)。
