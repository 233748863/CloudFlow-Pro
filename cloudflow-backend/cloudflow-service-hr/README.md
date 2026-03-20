# CloudFlow HR Service - HR人力资源管理微服务

## 项目简介

CloudFlow Pro HR微服务是一个企业级人力资源管理系统，提供组织架构、员工全生命周期、考勤管理和薪酬管理等核心功能。

## 技术栈

- **框架**: Spring Boot 3.2.4 + Spring Cloud 2023.0.1
- **数据库**: MySQL 8.0 + MyBatis-Plus 3.5.7
- **缓存**: Redis 6.x
- **消息队列**: RabbitMQ
- **服务调用**: OpenFeign
- **服务注册与配置**: Nacos
- **认证鉴权**: Sa-Token
- **文件存储**: MinIO / 本地存储

## 项目结构

```
cloudflow-service-hr/
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com/cloudflow/hr/
│   │   │       ├── HrServiceApplication.java          # 主启动类
│   │   │       ├── client/                            # Feign客户端层
│   │   │       │   └── fallback/                      # Feign降级处理
│   │   │       ├── config/                            # 配置类
│   │   │       │   ├── MyBatisPlusConfig.java         # MyBatis-Plus配置
│   │   │       │   ├── RabbitMQConfig.java            # RabbitMQ配置
│   │   │       │   └── FeignConfig.java               # Feign配置
│   │   │       ├── controller/                        # 控制器层
│   │   │       │   └── HealthController.java          # 健康检查控制器
│   │   │       ├── domain/                            # 领域模型
│   │   │       │   ├── entity/                        # 实体类
│   │   │       │   ├── dto/                           # 数据传输对象
│   │   │       │   └── vo/                            # 视图对象
│   │   │       ├── mapper/                            # MyBatis Mapper接口
│   │   │       └── service/                           # 业务逻辑层
│   │   │           └── impl/                          # 服务实现类
│   │   └── resources/
│   │       ├── application.yml                        # 应用配置文件
│   │       └── mapper/                                # MyBatis XML映射文件
│   └── test/
│       └── java/                                      # 测试类
├── pom.xml                                            # Maven配置文件
└── README.md                                          # 项目说明文档
```

## 核心模块

### 1. 组织架构管理模块
- 职位族和职级管理
- 职位管理
- 编制管理
- 汇报关系管理
- 部门岗位数据同步

### 2. 员工档案管理模块
- 员工基础信息管理
- 员工合同管理
- 员工证件管理
- 紧急联系人管理

### 3. 员工生命周期管理模块
- 入职流程
- 转正流程
- 调岗流程
- 离职流程

### 4. 考勤管理模块
- 班次和排班规则管理
- 排班计划管理
- 打卡管理（GPS、WiFi、人脸识别）
- 假期管理
- 加班管理
- 考勤统计

### 5. 薪酬管理模块
- 薪资结构配置
- 员工薪资管理
- 调薪管理
- 五险一金配置
- 个税配置

### 6. 招聘管理模块
- 招聘需求管理
- 候选人管理
- 面试管理
- Offer管理

## 服务集成

### 与Auth服务集成
- 通过Feign客户端调用Auth服务的部门、岗位、用户管理接口
- 通过RabbitMQ实时同步部门和岗位数据
- 通过定时任务增量同步数据

### 与Workflow服务集成
- 所有审批流程通过Workflow服务统一处理
- 支持入职、转正、调岗、离职、请假、加班、调薪等审批流程
- 通过回调接口接收审批结果

## 配置说明

### 数据库配置
```yaml
spring:
  datasource:
    url: jdbc:mysql://192.168.1.173:3306/cloudflow_hr
    username: root
    password: ${DB_PASSWORD:root}
```

### Redis配置
```yaml
spring:
  data:
    redis:
      host: 192.168.1.173
      port: 6379
      password: ${REDIS_PASSWORD:}
```

### RabbitMQ配置
```yaml
spring:
  rabbitmq:
    host: 192.168.1.173
    port: 5672
    username: ${RABBITMQ_USERNAME:guest}
    password: ${RABBITMQ_PASSWORD:guest}
```

### Nacos配置
```yaml
spring:
  cloud:
    nacos:
      server-addr: 192.168.1.173:8848
      username: nacos
      password: nacos
```

## 启动说明

### 前置条件
1. MySQL 8.0+ 已安装并运行
2. Redis 6.x+ 已安装并运行
3. RabbitMQ 已安装并运行
4. Nacos 已安装并运行
5. 已创建数据库 `cloudflow_hr`

### 启动步骤
1. 确保父项目已编译：`mvn clean install -DskipTests`
2. 启动HR服务：`mvn spring-boot:run`
3. 访问健康检查接口：`http://localhost:9005/api/hr/health`
4. 访问服务信息接口：`http://localhost:9005/api/hr/info`

## API文档

服务启动后，可以通过以下地址访问API文档：
- Actuator监控端点：`http://localhost:9005/actuator`
- 健康检查：`http://localhost:9005/actuator/health`
- Prometheus指标：`http://localhost:9005/actuator/prometheus`

## 开发规范

### 代码规范
- 所有类和方法必须添加中文注释
- 使用Lombok简化代码
- 遵循阿里巴巴Java开发规范

### 数据库规范
- 表名使用 `hr_` 前缀
- 所有表必须包含 `tenant_id` 字段（多租户隔离）
- 所有表必须包含 `create_time` 和 `update_time` 字段
- 使用逻辑删除，包含 `deleted` 字段

### API规范
- 统一使用 `/api/hr` 作为基础路径
- 使用RESTful风格设计API
- 统一返回格式：`Result<T>`

## 联系方式

如有问题，请联系开发团队。
