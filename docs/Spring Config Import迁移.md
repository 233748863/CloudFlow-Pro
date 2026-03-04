# Spring Cloud 配置迁移文档

## 迁移概述

本项目已从 **Bootstrap 上下文方式** 迁移到 **Spring Cloud 2023.x 推荐的 `spring.config.import` 方式**。

## 迁移原因

在 **Spring Cloud 2021.0 (Jubilee)** 及更高版本中，Bootstrap 上下文默认被禁用，原因如下：

1. **性能优化**：Bootstrap 上下文会创建额外的 `ApplicationContext`，增加启动时间和内存消耗
2. **架构简化**：Spring Boot 2.4+ 引入的 `spring.config.import` 机制更简洁高效
3. **降低复杂性**：避免两层上下文（bootstrap + application）导致的配置优先级混乱

## 迁移内容

### 1. 配置文件变更

#### 旧方式（Bootstrap）
```yaml
# bootstrap.yaml
spring:
  application:
    name: cloudflow-auth
  cloud:
    nacos:
      config:
        server-addr: 192.168.1.173:18848
        namespace: ae5cca25-3dae-4da1-897d-25edb370e00d
        file-extension: yaml
        shared-configs:
          - data-id: cloudflow-common.yaml
            refresh: true
```

#### 新方式（spring.config.import）
```yaml
# application.yml
spring:
  application:
    name: cloudflow-auth
  config:
    import:
      - optional:nacos:cloudflow-auth.yaml
      - optional:nacos:cloudflow-common.yaml?refresh=true
  cloud:
    nacos:
      server-addr: 192.168.1.173:18848
      username: nacos
      password: nacos
      config:
        namespace: ae5cca25-3dae-4da1-897d-25edb370e00d
        file-extension: yaml
      discovery:
        namespace: ae5cca25-3dae-4da1-897d-25edb370e00d
```

### 2. 依赖变更

**移除的依赖**（所有服务模块）：
```xml
<!-- 不再需要 -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-bootstrap</artifactId>
</dependency>
```

**保留的依赖**：
```xml
<!-- 仍然需要 -->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-config</artifactId>
</dependency>
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
```

### 3. 文件删除

已删除所有 `bootstrap.yaml` 文件：
- ✅ `cloudflow-auth/src/main/resources/bootstrap.yaml`
- ✅ `cloudflow-gateway/src/main/resources/bootstrap.yaml`
- ✅ `cloudflow-service-workflow/src/main/resources/bootstrap.yaml`
- ✅ `cloudflow-service-oa/src/main/resources/bootstrap.yaml`

## 各服务配置详情

### cloudflow-auth
- **端口**: 9001
- **Nacos 配置**: `cloudflow-auth.yaml`, `cloudflow-common.yaml`

### cloudflow-gateway
- **端口**: 9000
- **Nacos 配置**: `cloudflow-gateway.yaml`, `cloudflow-common.yaml`

### cloudflow-service-workflow
- **端口**: 9002
- **Nacos 配置**: `cloudflow-service-workflow.yaml`, `cloudflow-common.yaml`
- **支持环境变量**: `NACOS_SERVER`, `NACOS_NAMESPACE`, `SPRING_PROFILES_ACTIVE`

### cloudflow-service-oa
- **端口**: 9003
- **Nacos 配置**: `cloudflow-oa.yaml`, `cloudflow-common.yaml`

## spring.config.import 语法说明

### 基本格式
```yaml
spring:
  config:
    import:
      - optional:nacos:{dataId}.{file-extension}
```

### 参数说明
- `optional:` - 配置文件不存在时不会导致启动失败
- `nacos:` - 指定从 Nacos 配置中心导入
- `{dataId}` - Nacos 中的配置文件 ID
- `?refresh=true` - 启用配置动态刷新（配合 `@RefreshScope` 使用）

### 示例
```yaml
spring:
  config:
    import:
      # 导入服务专属配置
      - optional:nacos:cloudflow-auth.yaml
      # 导入共享配置，并启用动态刷新
      - optional:nacos:cloudflow-common.yaml?refresh=true
```

## 优势对比

| 特性 | Bootstrap 方式 | spring.config.import 方式 |
|------|---------------|--------------------------|
| 启动速度 | 较慢（双上下文） | 更快（单上下文） |
| 内存占用 | 较高 | 较低 |
| 配置文件 | bootstrap.yaml + application.yml | 仅 application.yml |
| 额外依赖 | 需要 spring-cloud-starter-bootstrap | 无需额外依赖 |
| 配置优先级 | 复杂（两层） | 简单（一层） |
| Spring Cloud 版本 | 2020.x 及以前默认支持 | 2021.x+ 推荐方式 |

## 注意事项

1. **Nacos 配置中心必须正常运行**，否则服务无法启动
2. **配置文件命名规则**：`{spring.application.name}.yaml`
3. **共享配置**：`cloudflow-common.yaml` 被所有服务共享
4. **动态刷新**：使用 `?refresh=true` 参数配合 `@RefreshScope` 注解实现配置热更新
5. **环境变量支持**：可通过环境变量覆盖 Nacos 地址等配置

## 验证步骤

1. 确保 Nacos 服务器正常运行
2. 确认 Nacos 中存在所需的配置文件
3. 启动各服务模块
4. 检查服务是否成功注册到 Nacos
5. 验证配置是否正确加载

## 回滚方案

如需回滚到 Bootstrap 方式：

1. 恢复 `bootstrap.yaml` 文件
2. 在各服务 pom.xml 中添加 `spring-cloud-starter-bootstrap` 依赖
3. 从 `application.yml` 中移除 `spring.config.import` 配置
4. 重新编译和部署

## 相关文档

- [Spring Cloud 2023.x 官方文档](https://spring.io/projects/spring-cloud)
- [Nacos Spring Cloud 快速开始](https://nacos.io/zh-cn/docs/quick-start-spring-cloud.html)
- [Spring Boot 配置导入机制](https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.external-config.files.importing)

---

**迁移完成时间**: 2026-02-09  
**迁移人员**: Cline AI Assistant  
**Spring Cloud 版本**: 2023.0.1  
**Spring Cloud Alibaba 版本**: 2023.0.1.0
