# OA模块部署指南

**版本**: v1.0  
**更新日期**: 2026-02-07  
**适用环境**: 开发/测试/生产

---

## 📋 部署前检查清单

### 环境要求

- [ ] JDK 17 或更高版本
- [ ] Maven 3.6+
- [ ] MySQL 8.0+
- [ ] Redis 6.0+ (推荐 7.0+)
- [ ] Nacos 2.2+ (推荐 2.3.x，兼容 2.x 系列)

### 代码准备

- [x] OA模块代码已迁移完成
- [x] 包名已更新为 `com.cloudflow.oa`
- [x] 远程服务调用接口已创建
- [x] 工作流模块中的OA代码已清理
- [x] 前端API调用已更新

---

## 🚀 部署步骤

### 步骤 1: 清理工作流模块

在工作流模块目录中执行清理脚本：

```powershell
cd cloudflow-backend\cloudflow-service-workflow
powershell -ExecutionPolicy Bypass -File cleanup-oa-files.ps1
```

**验证清理结果**：
- 确认8个Controller文件已删除
- 确认13个Domain实体文件已删除
- 确认13个Mapper接口文件已删除
- 确认10个Service接口和实现文件已删除
- 确认2个Mapper XML文件已删除

**手动检查**：
- 打开 `cloudflow-service-workflow/pom.xml`
- 如果不再需要，移除Zxing依赖：
```xml
<!-- 移除此依赖 -->
<dependency>
    <groupId>com.google.zxing</groupId>
    <artifactId>core</artifactId>
    <version>3.5.3</version>
</dependency>
```

### 步骤 2: 配置Nacos

#### 2.1 启动Nacos服务

```bash
# Windows
cd nacos/bin
startup.cmd -m standalone

# Linux/Mac
cd nacos/bin
sh startup.sh -m standalone
```

访问 Nacos 控制台：http://localhost:8848/nacos  
默认账号密码：nacos/nacos

#### 2.2 上传配置文件

在Nacos控制台中创建以下配置：

**配置1: cloudflow-common.yaml**
- Data ID: `cloudflow-common.yaml`
- Group: `DEFAULT_GROUP`
- 配置格式: `YAML`
- 配置内容: 共享配置（数据库、Redis等）

**配置2: cloudflow-oa.yaml**
- Data ID: `cloudflow-oa.yaml`
- Group: `DEFAULT_GROUP`
- 配置格式: `YAML`
- 配置内容: 从 `config/cloudflow-oa.yaml` 复制

**配置3: cloudflow-gateway.yaml**
- Data ID: `cloudflow-gateway.yaml`
- Group: `DEFAULT_GROUP`
- 配置格式: `YAML`
- 配置内容: 从 `config/cloudflow-gateway.yaml` 复制

### 步骤 3: 编译项目

在项目根目录执行：

```bash
cd cloudflow-backend
mvn clean install -DskipTests
```

**预期输出**：
```
[INFO] cloudflow-backend ................................. SUCCESS
[INFO] cloudflow-common .................................. SUCCESS
[INFO] cloudflow-gateway ................................. SUCCESS
[INFO] cloudflow-auth .................................... SUCCESS
[INFO] cloudflow-service-workflow ........................ SUCCESS
[INFO] cloudflow-service-oa .............................. SUCCESS
[INFO] BUILD SUCCESS
```

### 步骤 4: 启动服务

按以下顺序启动服务：

#### 4.1 启动Nacos（如果尚未启动）
```bash
cd nacos/bin
startup.cmd -m standalone
```

#### 4.2 启动Gateway
```bash
cd cloudflow-backend/cloudflow-gateway
mvn spring-boot:run
```

#### 4.3 启动Auth服务
```bash
cd cloudflow-backend/cloudflow-auth
mvn spring-boot:run
```

#### 4.4 启动Workflow服务
```bash
cd cloudflow-backend/cloudflow-service-workflow
mvn spring-boot:run
```

#### 4.5 启动OA服务
```bash
cd cloudflow-backend/cloudflow-service-oa
mvn spring-boot:run
```

### 步骤 5: 验证部署

#### 5.1 检查服务注册

访问 Nacos 控制台：http://localhost:8848/nacos

在"服务管理" -> "服务列表"中，确认以下服务已注册：
- cloudflow-gateway
- cloudflow-auth
- cloudflow-workflow
- cloudflow-oa ✨ (新增)

#### 5.2 测试OA服务

使用以下命令测试OA服务是否正常运行：

```bash
# 测试健康检查
curl http://localhost:9003/actuator/health

# 通过Gateway访问OA服务
curl http://localhost:9000/oa/announcement/list
```

#### 5.3 检查日志

查看OA服务启动日志，确认：
- ✅ Nacos注册成功
- ✅ 数据库连接成功
- ✅ Redis连接成功
- ✅ Feign客户端初始化成功

---

## 🔧 故障排查

### 问题1: OA服务无法启动

**症状**: 服务启动失败，抛出异常

**可能原因**:
1. 数据库连接失败
2. Nacos配置未正确加载
3. 端口9003被占用

**解决方案**:
```bash
# 检查端口占用
netstat -ano | findstr :9003

# 检查Nacos配置
# 访问 http://localhost:8848/nacos 确认配置存在

# 检查数据库连接
mysql -h localhost -u root -p cloudflow_pro
```

### 问题2: 服务间调用失败

**症状**: Feign调用超时或失败

**可能原因**:
1. 服务未在Nacos注册
2. 网络配置问题
3. 降级策略触发

**解决方案**:
- 检查Nacos服务列表
- 查看服务日志中的Feign调用记录
- 验证Hystrix配置

### 问题3: 前端无法访问OA功能

**症状**: 前端调用OA API返回404

**可能原因**:
1. Gateway路由未配置
2. 前端API路径未更新

**解决方案**:
- 检查Gateway配置中的OA路由
- 更新前端API调用路径（见下一节）

---

## 📱 前端API更新

需要更新以下前端文件中的API调用路径：

### 1. 公告相关 (src/services/api/announcement.ts)

```typescript
// 旧路径
const API_BASE = '/workflow/announcement';

// 新路径
const API_BASE = '/oa/announcement';
```

### 2. 日程相关 (src/services/api/schedule.ts)

```typescript
// 旧路径
const API_BASE = '/workflow/schedule';

// 新路径
const API_BASE = '/oa/schedule';
```

### 3. 车辆相关 (src/services/api/vehicle.ts)

```typescript
// 旧路径
const API_BASE = '/workflow/vehicle';

// 新路径
const API_BASE = '/oa/vehicle';
```

### 4. 任务相关 (src/services/api/workTask.ts)

```typescript
// 旧路径
const API_BASE = '/workflow/task';

// 新路径
const API_BASE = '/oa/task';
```

### 5. 资产/考勤/会议室 (src/services/api/admin.ts)

```typescript
// 资产管理
const ASSET_API = '/oa/asset';

// 考勤管理
const ATTENDANCE_API = '/oa/attendance';

// 会议室管理
const MEETING_ROOM_API = '/oa/meeting-room';
```

---

## ✅ 部署验证清单

完成部署后，请逐项检查：

- [ ] Nacos服务已启动并可访问
- [ ] 所有配置文件已上传到Nacos
- [ ] 项目编译成功，无错误
- [ ] 工作流模块中的OA代码已清理
- [ ] Gateway服务已启动
- [ ] Auth服务已启动
- [ ] Workflow服务已启动
- [ ] OA服务已启动
- [ ] 所有服务已在Nacos注册
- [ ] OA服务健康检查通过
- [ ] 通过Gateway可以访问OA服务
- [ ] 前端API路径已更新
- [ ] 前端可以正常访问OA功能
- [ ] 服务间远程调用正常工作

---

## 📊 性能监控

### 监控指标

建议监控以下关键指标：

1. **服务健康状态**
   - 通过Nacos控制台监控服务实例状态
   - 配置健康检查告警

2. **API响应时间**
   - 监控OA服务各API的响应时间
   - 设置响应时间阈值告警

3. **Feign调用成功率**
   - 监控服务间调用的成功率
   - 关注降级策略触发频率

4. **数据库连接池**
   - 监控数据库连接池使用情况
   - 及时调整连接池配置

---

## 🔐 安全建议

1. **生产环境配置**
   - 修改Nacos默认密码
   - 使用强密码保护数据库
   - 配置Redis密码认证

2. **网络安全**
   - 配置防火墙规则
   - 限制服务端口访问
   - 使用HTTPS加密通信

3. **日志管理**
   - 配置日志轮转
   - 定期备份日志文件
   - 敏感信息脱敏

---

## 📞 技术支持

如遇到问题，请：
1. 查看服务日志文件
2. 检查Nacos配置
3. 参考故障排查章节
4. 联系开发团队

---

**文档版本**: v1.0  
**最后更新**: 2026-02-07  
**维护者**: CloudFlow开发团队
