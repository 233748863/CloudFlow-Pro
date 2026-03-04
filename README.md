# CloudFlow Pro - 企业级低代码工作流平台

<div align="center">

**基于 Spring Cloud Alibaba + React 的生产级微服务工作流解决方案**

[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2.4-brightgreen)](https://spring.io/projects/spring-boot)
[![Spring Cloud](https://img.shields.io/badge/Spring%20Cloud-2023.0.1-blue)](https://spring.io/projects/spring-cloud)
[![React](https://img.shields.io/badge/React-19.2-61dafb)](https://react.dev/)
[![MyBatis Plus](https://img.shields.io/badge/MyBatis%20Plus-3.5.7-red)](https://baomidou.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

[在线演示](http://demo.cloudflow.com) | [开发文档](docs/) | [API文档](http://localhost:9000/doc.html)

</div>

---

## 📖 项目简介

CloudFlow Pro 是一套**生产就绪**的企业级微服务工作流平台，集成了可视化流程设计、动态表单、RBAC权限、实时监控告警、完整OA模块等核心能力。通过"低代码+AI"的方式，帮助企业快速构建复杂的业务流程应用。

**当前版本**: v2.0  
**代码规模**: 46个后端Controller + 60+前端页面 + 39张数据库表  
**核心能力**: 已完成 Phase 2 监控告警模块，系统功能完整

---

## ✨ 核心特性

### 🚀 生产级架构
- **微服务化** - 网关、认证、工作流、OA服务独立部署，支持水平扩展
- **高可用** - Nacos服务注册与配置中心，支持集群部署
- **高性能** - 完整的索引优化、连接池配置、异步处理、Redis缓存
- **安全加固** - JWT认证、滑块验证码、数据加密、审计日志、数据权限

### ⚙️ 强大的工作流引擎（13个Controller）
- **可视化设计** - SVG拖拽式流程建模，支持复杂流程图
- **复杂流转** - 并行网关、排他网关、SpEL动态表达式路由、子流程
- **会签机制** - 支持顺序会签、并行会签、一票否决、按比例通过
- **任务管理** - 任务委派、转办、加签、减签、催办、附件管理
- **流程监控** - 实时监控流程执行状态、性能统计、异常检测（Phase 2）
- **超时控制** - 节点超时自动处理、多级告警（提醒/警告/严重）
- **版本管理** - 流程版本控制、版本对比、一键回滚
- **模板库** - 预置流程模板、一键创建、模板分类管理
- **归档管理** - 历史流程归档、批量归档、归档恢复
- **发布增强** - 发布窗口、发布审批、影响分析、回滚历史

### 📝 低代码表单能力
- **动态表单** - 拖拽生成JSON Schema表单，支持20+组件类型
- **双重校验** - 前后端统一校验规则，保证数据一致性
- **表单版本** - 表单版本管理，支持历史版本查看
- **AI赋能** - 集成Gemini API，自然语言生成业务代码

### 🛡️ 企业级权限管理（10个Controller）
- **RBAC模型** - 用户、角色、部门、菜单四级权限控制
- **数据权限** - 支持全部、自定义、本级及下级、本级、本人五种数据范围
- **多租户** - 完整的租户隔离，支持SaaS模式部署
- **安全认证** - JWT + Redis分布式会话，自研滑块验证码
- **缓存监控** - Redis缓存监控、缓存清理、缓存统计
- **参数配置** - 系统参数配置、业务配置、配置热更新

### 📊 实时监控告警（Phase 2 - 已完成）
- **流程监控** - 实时监控流程执行状态、节点耗时、任务分布
- **超时检测** - 自动检测超时任务和流程，多级告警（提醒/警告/严重）
- **异常检测** - 自动检测执行失败、死锁、无处理人、数据不一致
- **性能统计** - 流程执行时长、成功率、节点性能趋势分析
- **告警管理** - 告警查询、告警处理、告警升级、告警统计

### 💼 完整的OA模块（23个Controller）
- **考勤管理** - GPS打卡、请假、补卡、加班、出差申请、考勤统计
- **资产管理** - 资产登记、领用、归还、维修、盘点、二维码管理
- **车辆管理** - 车辆档案、用车申请、用车记录、油耗统计、费用管理
- **会议室** - 会议室预订、签到、自动释放、使用统计
- **公告中心** - 公告发布、阅读统计、附件管理、置顶管理
- **通讯录** - 企业通讯录、组织架构展示、用户详情
- **访客管理** - 访客预约、登记、签离、访客统计
- **值班排班** - 值班计划、排班管理、签到签退、换班申请
- **费用管理** - 费用报销、付款申请、费用统计、月度分析
- **耗材管理** - 耗材登记、库存管理、低库存预警、出入库记录

### 📱 移动端适配
- **响应式设计** - 自动检测设备类型，切换桌面端/移动端路由
- **移动端页面** - 10+移动端专属页面，优化触控体验
- **离线同步** - 支持离线数据上传、增量数据下载、冲突解决

---

## 🏗️ 技术架构

### 后端技术栈
| 技术 | 版本 | 说明 |
|------|------|------|
| Spring Boot | 3.2.4 | 基础框架 |
| Spring Cloud | 2023.0.1 | 微服务框架 |
| Spring Cloud Alibaba | 2023.0.1.0 | 阿里巴巴微服务套件 |
| Spring Cloud Gateway | 4.1.x | API网关 |
| Nacos | 2.3.x | 服务注册与配置中心 |
| OpenFeign | 4.1.x | 服务调用 |
| MySQL | 8.0.33 | 关系型数据库 |
| Redis | 7.0+ | 缓存与消息队列 |
| MyBatis Plus | 3.5.7 | ORM框架 |
| Redisson | 3.27.0 | 分布式锁 |
| Hutool | 5.8.26 | Java工具类库 |
| Knife4j | 4.5.0 | API文档 |
| EasyExcel | 3.3.4 | Excel导入导出 |
| ZXing | 3.5.3 | 二维码生成 |
| Groovy | 3.0.19 | 脚本引擎 |
| Javers | 7.6.2 | 对象差异比较 |

### 前端技术栈
| 技术 | 版本 | 说明 |
|------|------|------|
| React | 19.2 | UI框架 |
| Vite | 6.4 | 构建工具 |
| TypeScript | 5.8 | 类型系统 |
| Tailwind CSS | 4.1 | CSS框架 |
| Zustand | 5.0 | 状态管理 |
| React Query | 5.90 | 数据请求 |
| React Router | 7.13 | 路由管理 |
| dnd-kit | 6.3 | 拖拽功能 |
| Lucide React | 0.555 | 图标库 |
| FullCalendar | 6.1 | 日历组件 |
| date-fns | 4.1 | 日期处理 |

### 公共模块能力（15个模块）
- **cloudflow-common-core** - 核心工具类、常量、异常处理
- **cloudflow-common-security** - JWT认证、权限校验、滑块验证码
- **cloudflow-common-redis** - Redis封装、分布式锁、缓存管理
- **cloudflow-common-data** - 数据权限、MyBatis Plus配置
- **cloudflow-common-datasource** - 多数据源、动态数据源
- **cloudflow-common-log** - 操作日志、审计日志
- **cloudflow-common-audit** - 数据变更审计、对象差异比较
- **cloudflow-common-idempotent** - 接口幂等性
- **cloudflow-common-ratelimiter** - 接口限流
- **cloudflow-common-encrypt** - 数据加密、字段加密
- **cloudflow-common-excel** - Excel导入导出
- **cloudflow-common-oss** - 对象存储、文件上传
- **cloudflow-common-sse** - 服务端推送、实时通知
- **cloudflow-common-job** - 定时任务
- **cloudflow-common-seata** - 分布式事务

### 架构特点
- **微服务架构** - 4个独立服务（网关、认证、工作流、OA）
- **配置中心** - Nacos统一配置管理，支持动态刷新
- **服务发现** - 自动服务注册与发现，支持负载均衡
- **分布式锁** - Redisson实现分布式锁，防止并发问题
- **异步处理** - 线程池异步执行，提升系统吞吐量
- **实时推送** - SSE服务端推送，实时通知更新
- **数据权限** - 基于注解的数据权限过滤
- **审计日志** - 完整的操作日志和数据变更审计

---

## 📂 项目结构

```
CloudFlow Pro/
├── cloudflow-backend/              # 后端工程
│   ├── cloudflow-gateway/          # API网关服务 (9000)
│   ├── cloudflow-auth/             # 认证中心 (9001) - 10个Controller
│   ├── cloudflow-service-workflow/ # 工作流核心服务 (9002) - 13个Controller
│   ├── cloudflow-service-oa/       # OA办公服务 (9003) - 23个Controller
│   ├── cloudflow-common/           # 公共模块 - 15个子模块
│   │   ├── cloudflow-common-core/      # 核心工具类
│   │   ├── cloudflow-common-security/  # 安全认证
│   │   ├── cloudflow-common-redis/     # Redis封装
│   │   ├── cloudflow-common-data/      # 数据权限
│   │   ├── cloudflow-common-log/       # 日志管理
│   │   ├── cloudflow-common-audit/     # 审计日志
│   │   ├── cloudflow-common-excel/     # Excel处理
│   │   ├── cloudflow-common-oss/       # 对象存储
│   │   ├── cloudflow-common-sse/       # 实时推送
│   │   └── ...                         # 其他公共模块
│   └── DB/                         # 数据库脚本
│       ├── 01.cloudflow-common.sql     # 基础模块（15张表）
│       ├── 02.cloudflow-workflow.sql   # 工作流模块（39张表）
│       └── 04.cloudflow-oa.sql         # OA模块（20+张表）
├── cloudflow-frontend/             # 前端工程 (3000)
│   ├── src/
│   │   ├── pages/                  # 页面组件（60+页面）
│   │   ├── mobile/                 # 移动端页面（10+页面）
│   │   ├── components/             # 通用组件
│   │   ├── services/               # API服务
│   │   ├── stores/                 # 状态管理
│   │   └── utils/                  # 工具函数
│   └── public/                     # 静态资源
├── config/                         # Nacos配置文件
├── docker/                         # Docker镜像构建
├── docs/                           # 项目文档
└── README.md                       # 项目说明
```

---

## 🚀 快速开始

### 环境要求
- **JDK**: 17+
- **Maven**: 3.8+
- **Node.js**: 18+
- **MySQL**: 8.0+
- **Redis**: 6.0+
- **Nacos**: 2.3+

### 1. 数据库初始化

```bash
# 创建数据库
mysql -u root -p -e "CREATE DATABASE cloud_flow_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 执行初始化脚本（按顺序）
cd cloudflow-backend/DB
mysql -u root -p cloud_flow_db < 01.cloudflow-common.sql    # 基础模块（15张表）
mysql -u root -p cloud_flow_db < 02.cloudflow-workflow.sql  # 工作流模块（39张表）
mysql -u root -p cloud_flow_db < 04.cloudflow-oa.sql        # OA模块（20+张表）
```

**默认账号**：
- 管理员：`admin` / `123456`
- 部门经理：`li` / `123456`
- 财务专员：`wang` / `123456`
- HR经理：`zhao` / `123456`
- 普通员工：`zhang` / `123456`

### 2. 启动Nacos

```bash
# 下载Nacos 2.3.0
wget https://github.com/alibaba/nacos/releases/download/2.3.0/nacos-server-2.3.0.tar.gz
tar -xzf nacos-server-2.3.0.tar.gz
cd nacos/bin

# 单机模式启动
sh startup.sh -m standalone  # Linux/Mac
startup.cmd -m standalone    # Windows

# 访问控制台: http://localhost:8848/nacos
# 默认账号: nacos / nacos
```

### 3. 配置Nacos

将 `config/` 目录下的配置文件导入Nacos：
- `cloudflow-common.yaml` - 公共配置（数据库、Redis）
- `cloudflow-gateway.yaml` - 网关配置
- `cloudflow-auth.yaml` - 认证服务配置
- `cloudflow-service-workflow.yaml` - 工作流服务配置
- `cloudflow-oa.yaml` - OA服务配置

### 4. 启动后端服务

**方式一：IDE启动（推荐开发环境）**

按顺序启动以下服务：
1. `CloudFlowAuthApplication` - 认证服务 (9001)
2. `CloudFlowWorkflowApplication` - 工作流服务 (9002)
3. `CloudFlowOaApplication` - OA服务 (9003)
4. `CloudFlowGatewayApplication` - 网关服务 (9000)

**方式二：命令行启动**

```bash
cd cloudflow-backend

# 编译打包
mvn clean package -DskipTests

# 启动认证服务
java -jar cloudflow-auth/target/cloudflow-auth-1.0.0.jar

# 启动工作流服务
java -jar cloudflow-service-workflow/target/cloudflow-service-workflow-1.0.0.jar

# 启动OA服务
java -jar cloudflow-service-oa/target/cloudflow-service-oa-1.0.0.jar

# 启动网关服务
java -jar cloudflow-gateway/target/cloudflow-gateway-1.0.0.jar
```

### 5. 启动前端

```bash
cd cloudflow-frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问地址: http://localhost:3000
```

### 6. 验证部署

- **前端**: http://localhost:3000
- **网关**: http://localhost:9000
- **API文档**: http://localhost:9000/doc.html
- **Nacos**: http://localhost:8848/nacos
- **健康检查**: http://localhost:9002/actuator/health

---

## 🐳 Docker部署

### 使用Docker Compose（推荐）

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，修改数据库密码等敏感信息

# 2. 启动所有服务
docker-compose up -d

# 3. 查看服务状态
docker-compose ps

# 4. 查看日志
docker-compose logs -f cloudflow-workflow

# 5. 停止服务
docker-compose down
```

服务端口映射：
- MySQL: 3306
- Redis: 6379
- Nacos: 8848
- 网关: 9000
- 认证: 9001
- 工作流: 9002
- OA: 9003
- 前端: 3000

---

## 📚 功能模块

### 工作台
- **仪表盘** - 待办统计、流程统计、快捷入口、数据可视化
- **我的日程** - 日历视图、事件管理、会议提醒

### 办公协同（7个功能）
- **会议室管理** - 预订、签到、自动释放、使用统计
- **公告中心** - 发布、阅读统计、附件管理、置顶管理
- **考勤打卡** - GPS定位打卡、考勤统计、异常处理
- **补卡申请** - 补卡/外勤申请流程、审批记录
- **加班申请** - 加班申请与审批、加班统计
- **出差申请** - 出差申请与行程管理、出差统计
- **通讯录** - 企业通讯录、组织架构、用户详情

### 流程中心（5个功能）
- **发起流程** - 流程模板库、快速发起、草稿保存
- **我的申请** - 申请记录、进度跟踪、流程撤回
- **审批待办** - 待办列表、批量审批、任务委派
- **抄送我的** - 抄送记录、查看详情、已读标记
- **模板库** - 流程模板浏览、一键使用、模板分类

### 流程管理（10个功能）
- **流程设计** - 可视化流程设计器、节点配置、流程验证
- **流程监控** - 实时监控、性能统计、异常检测
- **发布管理** - 版本管理、灰度发布、发布审批
- **表单设计** - 动态表单设计器、组件库、表单预览
- **批量编辑** - 流程分类、标签管理、批量操作
- **流程分类** - 分类管理、权限控制、分类树
- **流程导入** - 批量导入、模板导入、导入验证
- **归档管理** - 历史流程归档、查询、归档恢复
- **告警管理** - 超时告警、异常告警处理、告警统计
- **性能统计** - 流程性能分析、趋势图表、性能优化建议

### 行政管理（8个功能）
- **组织架构** - 部门管理、人员管理、组织树
- **资产管理** - 资产登记、领用、归还、盘点、二维码
- **车辆管理** - 车辆档案、用车申请、用车记录、油耗统计
- **用车申请** - 在线申请、审批流程、车辆调度
- **用车记录** - 行驶记录、油耗统计、费用分析
- **考勤规则** - 考勤规则配置、班次管理、节假日设置
- **访客管理** - 访客预约、登记、签离、访客统计
- **值班排班** - 值班计划、排班管理、签到签退、换班申请

### 系统管理（12个功能）
- **用户管理** - 用户增删改查、密码重置、批量导入
- **角色管理** - 角色权限配置、数据权限、角色分配
- **菜单管理** - 菜单树管理、权限标识、菜单图标
- **文件管理** - 文件上传、下载、预览、文件统计
- **源码生成** - AI代码生成、模板定制、代码预览
- **租户管理** - 租户增删改查、配额管理、租户切换
- **操作日志** - 操作记录、审计追踪、日志导出
- **审计日志** - 数据变更记录、合规审计、差异对比
- **岗位管理** - 岗位配置、人员分配、岗位权限
- **参数配置** - 系统参数、业务配置、配置热更新
- **缓存监控** - Redis监控、缓存清理、缓存统计
- **字典管理** - 数据字典、下拉选项、字典分类

---

## 🔧 开发指南

### 后端开发

**添加新的业务模块**：
1. 在 `cloudflow-backend` 下创建新模块
2. 配置 `pom.xml` 依赖
3. 实现 Controller、Service、Mapper
4. 配置 Nacos 配置文件
5. 在网关配置路由

**数据权限使用**：
```java
@DataScope(deptAlias = "d", userAlias = "u")
public List<User> selectUserList(User user) {
    // 自动注入数据权限SQL
}
```

**分布式锁使用**：
```java
@Autowired
private RedissonClient redissonClient;

RLock lock = redissonClient.getLock("lock:key");
try {
    if (lock.tryLock(10, 30, TimeUnit.SECONDS)) {
        // 业务逻辑
    }
} finally {
    lock.unlock();
}
```

**审计日志使用**：
```java
@AuditLog(module = "用户管理", operation = "修改用户")
public void updateUser(User user) {
    // 自动记录数据变更
}
```

### 前端开发

**添加新页面**：
1. 在 `src/pages` 创建页面组件
2. 在 `src/router.tsx` 配置路由
3. 在 `src/services/api` 添加API接口
4. 使用 Zustand 管理状态

**API调用示例**：
```typescript
import { request } from '@/utils/request';

export const getWorkflowList = (params: any) => {
  return request.get('/workflow/list', { params });
};
```

**状态管理示例**：
```typescript
import { create } from 'zustand';

export const useUserStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
```

---

## 📖 API文档

### 工作流服务 API（13个Controller）

#### 1. WorkflowController - 流程核心
- `POST /workflow/start` - 启动流程
- `POST /workflow/complete` - 完成任务
- `GET /workflow/tasks` - 获取待办任务
- `GET /workflow/instances` - 获取流程实例
- `GET /workflow/trace/{instanceId}` - 获取流程轨迹

#### 2. AlertController - 告警管理
- `GET /workflow/alerts/timeout` - 获取超时告警
- `GET /workflow/alerts/anomaly` - 获取异常告警
- `POST /workflow/alerts/resolve` - 处理告警

#### 3. WorkflowMonitorController - 流程监控
- `GET /workflow/monitor/overview` - 监控概览
- `GET /workflow/monitor/trend` - 流程趋势
- `GET /workflow/monitor/performance` - 性能统计

#### 4. TemplateController - 模板管理
- `GET /workflow/templates` - 获取模板列表
- `POST /workflow/templates` - 创建模板
- `POST /workflow/templates/{id}/use` - 使用模板

#### 5. VersionController - 版本管理
- `GET /workflow/versions/{workflowId}` - 获取版本历史
- `POST /workflow/versions/rollback` - 版本回滚
- `GET /workflow/versions/compare` - 版本对比

#### 6. ImportExportController - 导入导出
- `POST /workflow/export` - 导出流程
- `POST /workflow/import` - 导入流程
- `POST /workflow/validate` - 验证导入文件

#### 7. BatchOperationController - 批量操作
- `POST /workflow/batch/archive` - 批量归档
- `POST /workflow/batch/restore` - 批量恢复
- `POST /workflow/batch/delete` - 批量删除

#### 8. DeployEnhancementController - 发布增强
- `GET /workflow/deploy/window` - 检查发布窗口
- `POST /workflow/deploy/approval` - 提交发布审批
- `POST /workflow/deploy/rollback` - 回滚发布
- `GET /workflow/deploy/impact` - 影响分析

#### 9. ProcessCategoryController - 流程分类
- `GET /workflow/category/tree` - 获取分类树
- `POST /workflow/category` - 创建分类
- `PUT /workflow/category` - 更新分类

#### 10. ProcessCopyController - 抄送管理
- `GET /workflow/copy/list` - 获取抄送列表
- `POST /workflow/copy/read` - 标记已读
- `GET /workflow/copy/unread` - 获取未读数量

#### 11. WorkflowEnhanceController - 流程增强
- `POST /workflow/addSign` - 加签
- `POST /workflow/removeSign` - 减签
- `POST /workflow/delegate` - 委派任务
- `GET /workflow/flowchart/{instanceId}` - 获取流程图

#### 12. AuditLogController - 审计日志
- `GET /workflow/audit/list` - 获取审计日志列表
- `GET /workflow/audit/{id}` - 获取审计日志详情
- `DELETE /workflow/audit/expired` - 删除过期日志

#### 13. PermissionTestController - 权限测试
- `GET /workflow/permission/test` - 权限测试接口

### 认证服务 API（10个Controller）

#### 1. AuthController - 认证核心
- `POST /auth/login` - 用户登录
- `POST /auth/register` - 用户注册
- `POST /auth/logout` - 用户登出
- `GET /auth/info` - 获取用户信息
- `GET /auth/routers` - 获取路由菜单
- `POST /auth/switchTenant` - 切换租户

#### 2. CaptchaController - 验证码
- `GET /auth/captcha/slider` - 获取滑块验证码
- `POST /auth/captcha/check` - 验证滑块

#### 3. SysUserController - 用户管理
- `GET /system/user/list` - 获取用户列表
- `GET /system/user/{userId}` - 获取用户详情
- `POST /system/user` - 创建用户
- `PUT /system/user` - 更新用户
- `DELETE /system/user/{userIds}` - 删除用户

#### 4. SysRoleController - 角色管理
- `GET /system/role/list` - 获取角色列表
- `GET /system/role/{roleId}` - 获取角色详情
- `POST /system/role` - 创建角色
- `PUT /system/role` - 更新角色
- `DELETE /system/role/{roleIds}` - 删除角色

#### 5. SysMenuController - 菜单管理
- `GET /system/menu/list` - 获取菜单列表
- `GET /system/menu/{menuId}` - 获取菜单详情
- `POST /system/menu` - 创建菜单
- `PUT /system/menu` - 更新菜单
- `DELETE /system/menu/{menuId}` - 删除菜单

#### 6. SysDeptController - 部门管理
- `GET /system/dept/tree` - 获取部门树
- `GET /system/dept/{deptId}` - 获取部门详情
- `POST /system/dept` - 创建部门
- `PUT /system/dept` - 更新部门
- `DELETE /system/dept/{deptId}` - 删除部门

#### 7. SysPostController - 岗位管理
- `GET /system/post/list` - 获取岗位列表
- `GET /system/post/{postId}` - 获取岗位详情
- `POST /system/post` - 创建岗位
- `PUT /system/post` - 更新岗位
- `DELETE /system/post/{postIds}` - 删除岗位

#### 8. SysTenantController - 租户管理
- `GET /system/tenant/list` - 获取租户列表
- `GET /system/tenant/{tenantId}` - 获取租户详情
- `POST /system/tenant` - 创建租户
- `PUT /system/tenant` - 更新租户
- `DELETE /system/tenant/{tenantId}` - 删除租户

#### 9. SysConfigController - 参数配置
- `GET /system/config/list` - 获取配置列表
- `GET /system/config/{configId}` - 获取配置详情
- `GET /system/config/key/{configKey}` - 根据Key获取配置
- `POST /system/config` - 创建配置
- `PUT /system/config` - 更新配置
- `DELETE /system/config/{configIds}` - 删除配置

#### 10. CacheMonitorController - 缓存监控
- `GET /system/cache/info` - 获取缓存信息
- `GET /system/cache/keys` - 获取缓存键列表
- `GET /system/cache/value` - 获取缓存值
- `DELETE /system/cache/key` - 删除缓存键
- `DELETE /system/cache/prefix` - 按前缀删除缓存

### OA服务 API（23个Controller）

#### 考勤管理（3个Controller）
- **AttendanceController** - 考勤打卡、考勤规则、考勤统计
- **AttendanceAppealController** - 补卡申请、外勤申请
- **OvertimeController** - 加班申请、加班审批

#### 资产管理（2个Controller）
- **AssetController** - 资产登记、领用、归还、维修、盘点、二维码
- **ConsumableController** - 耗材管理、库存管理、低库存预警

#### 车辆管理（1个Controller）
- **VehicleController** - 车辆档案、用车申请、用车记录、油耗统计、费用管理

#### 会议室管理（1个Controller）
- **MeetingRoomController** - 会议室预订、签到、自动释放、使用统计

#### 公告管理（2个Controller）
- **SysAnnouncementController** - 公告发布、阅读统计、附件管理
- **SysNoticeController** - 系统通知、消息推送

#### 日程管理（1个Controller）
- **SysScheduleController** - 日程管理、会议预订、日程统计

#### 通讯录（1个Controller）
- **ContactController** - 企业通讯录、组织架构、用户详情

#### 访客管理（1个Controller）
- **VisitorController** - 访客预约、登记、签离、访客统计

#### 值班管理（1个Controller）
- **DutyScheduleController** - 值班计划、排班管理、签到签退、换班申请

#### 费用管理（3个Controller）
- **ExpenseClaimController** - 费用报销、报销审批、费用统计
- **PaymentRequestController** - 付款申请、付款审批、付款统计
- **LeaveController** - 请假申请、请假审批、请假统计

#### 出差管理（1个Controller）
- **BusinessTripController** - 出差申请、出差审批、出差统计

#### 其他（6个Controller）
- **WorkplaceController** - 工作台、待办统计、快捷入口
- **WorkTaskController** - 任务管理、任务看板
- **SyncController** - 离线同步、数据上传、冲突解决
- **ErrorReportController** - 前端错误上报

---

## 📖 文档导航

### 核心文档
- [后端生产就绪评估](docs/后端生产就绪最终评估.md) - 系统评估报告
- [阶段2完成总结](docs/阶段2完成总结.md) - Phase 2 监控告警模块
- [Nacos微服务部署](docs/Nacos微服务部署.md) - 微服务部署指南
- [数据权限集成指南](cloudflow-backend/cloudflow-common/DATASCOPE_INTEGRATION_GUIDE.md)

### 功能文档
- [工作流设计指南](docs/工作流对比-若依VS CloudFlow最终版.md)
- [P1任务管理](docs/P1前端实现总结.md) - 任务管理模块
- [车辆系统设计](docs/车辆系统设计.md)
- [验证码集成指南](docs/验证码集成指南.md)

### 开发文档
- [前端代码审查报告](docs/前端代码审查报告.md)
- [后端API开发总结](docs/后端API开发总结.md)
- [性能优化指南](cloudflow-backend/cloudflow-service-workflow/PERFORMANCE_OPTIMIZATION.md)

---

## 🎯 路线图

### ✅ 已完成
- [x] Phase 1: 基础架构与核心功能
  - [x] 微服务架构搭建（4个服务）
  - [x] 工作流引擎实现（13个Controller）
  - [x] 动态表单设计器
  - [x] RBAC权限管理（10个Controller）
  - [x] 完整OA模块（23个Controller）
- [x] Phase 2: 性能优化与监控告警
  - [x] 流程监控服务
  - [x] 超时检测与告警
  - [x] 异常检测与告警
  - [x] 性能统计与分析
  - [x] 监控API接口（3个Controller）

### 🚧 进行中
- [ ] Phase 3: 高级功能增强
  - [ ] 流程模拟执行
  - [ ] 智能推荐引擎
  - [ ] 移动端原生APP

### 📅 计划中
- [ ] Phase 4: 企业级增强
  - [ ] 分布式事务（Seata）
  - [ ] 链路追踪（SkyWalking）
  - [ ] 消息队列（RocketMQ）
  - [ ] 数据报表（ECharts）

---

## 🤝 贡献指南

欢迎贡献代码、提出问题和建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 📊 项目统计

- **代码行数**: 50,000+ 行（后端 30,000+ / 前端 20,000+）
- **后端Controller**: 46个（工作流13 + 认证10 + OA 23）
- **前端页面**: 60+ 页面（桌面端 + 移动端）
- **数据库表**: 70+ 张表（基础15 + 工作流39 + OA 20+）
- **公共模块**: 15个企业级能力模块
- **API接口**: 200+ 个RESTful接口

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 💬 联系方式

- **问题反馈**: [GitHub Issues](https://github.com/your-repo/issues)
- **技术交流**: 欢迎提交 PR 或 Issue
- **商务合作**: contact@cloudflow.com

---

## 🙏 致谢

感谢以下开源项目：
- [Spring Cloud Alibaba](https://github.com/alibaba/spring-cloud-alibaba)
- [React](https://github.com/facebook/react)
- [MyBatis Plus](https://github.com/baomidou/mybatis-plus)
- [Redisson](https://github.com/redisson/redisson)
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss)
- [Nacos](https://github.com/alibaba/nacos)

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star ⭐**

Made with ❤️ by CloudFlow Team

**当前由派大星AI API系统免费提供运行**

</div>
