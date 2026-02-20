RuoYi-Cloud-Plus-2.X 框架功能分析及移植建议

---

## 一、RuoYi-Cloud-Plus-2.X 功能全景

### 1. Common 公共模块（35个子模块 vs CloudFlow 的 7个）

| 模块                 | 功能                                                         | CloudFlow 是否已有                   | 移植优先级  |
| -------------------- | ------------------------------------------------------------ | ------------------------------------ | ----------- |
| common-encrypt       | 数据加密（AES/RSA/SM2/SM4/Base64），支持注解式字段加密、API传输加密、MyBatis拦截器自动加解密 | ❌ 无                                 | ⭐⭐⭐ 高      |
| common-idempotent    | 防重复提交，`@RepeatSubmit` 注解 + AOP 切面，基于 Redis 实现 | ❌ 无                                 | ⭐⭐⭐ 高      |
| common-ratelimiter   | 接口限流，`@RateLimiter` 注解，支持全局/IP维度限流，基于 Redis + Lua 脚本 | ❌ 无                                 | ⭐⭐⭐ 高      |
| common-excel         | Excel 导入导出增强（基于 EasyExcel），支持下拉框、字典转换、自定义样式 | ❌ 无                                 | ⭐⭐⭐ 高      |
| common-oss           | 对象存储抽象层，支持 MinIO/阿里云/腾讯云/七牛等多种存储      | ❌ 无（文件上传在 auth 模块简单实现） | ⭐⭐⭐ 高      |
| common-sensitive     | 数据脱敏，注解式自动脱敏（手机号、身份证、邮箱等）           | ❌ 无                                 | ⭐⭐ 中       |
| common-translation   | 数据翻译，自动将 ID 翻译为名称（如 userId → userName），减少关联查询 | ❌ 无                                 | ⭐⭐ 中       |
| common-doc           | 接口文档自动生成（SpringDoc/Swagger）                        | ❌ 无                                 | ⭐⭐ 中       |
| common-tenant        | 多租户完整方案（SQL行级过滤、Redis Key隔离、缓存隔离）       | ✅ 有基础实现                         | ⭐⭐ 参考优化 |
| common-mail          | 邮件发送                                                     | ❌ 无                                 | ⭐ 低        |
| common-sms           | 短信发送                                                     | ❌ 无                                 | ⭐ 低        |
| common-social        | 第三方社交登录（微信/钉钉/企业微信等）                       | ❌ 无                                 | ⭐ 低        |
| common-sse           | Server-Sent Events 实时推送                                  | ❌ 无                                 | ⭐⭐ 中       |
| common-websocket     | WebSocket 通信                                               | ❌ 无                                 | ⭐⭐ 中       |
| common-elasticsearch | ElasticSearch 搜索集成                                       | ❌ 无                                 | ⭐ 低        |
| common-seata         | 分布式事务（Seata）                                          | ❌ 无                                 | ⭐ 低        |
| common-dubbo         | Dubbo RPC 服务调用                                           | ❌ 无（用 Feign）                     | ⭐ 低        |
| common-job           | 定时任务集成（SnailJob）                                     | ❌ 无                                 | ⭐⭐ 中       |
| common-logstash      | ELK 日志收集                                                 | ❌ 无                                 | ⭐ 低        |
| common-prometheus    | Prometheus 监控指标                                          | ❌ 无                                 | ⭐ 低        |
| common-mybatis       | MyBatis-Plus 增强（分页、数据权限、自动填充）                | ✅ 有（common-data）                  | ⭐⭐ 参考优化 |
| common-satoken       | Sa-Token 认证框架集成                                        | ✅ 有自己的安全方案                   | ⭐ 参考      |

### 2. System 系统管理模块

| 功能                        | CloudFlow 是否已有 | 移植价值 |
| --------------------------- | ------------------ | -------- |
| 用户管理 (SysUser)          | ✅ 有               | 参考优化 |
| 角色管理 (SysRole)          | ✅ 有               | 参考优化 |
| 菜单管理 (SysMenu)          | ✅ 有               | 参考优化 |
| 部门管理 (SysDept)          | ✅ 有               | 参考优化 |
| 岗位管理 (SysPost)          | ❌ 无               | ⭐⭐ 中    |
| 字典管理 (SysDictType/Data) | ❌ 无               | ⭐⭐⭐ 高   |
| 参数配置 (SysConfig)        | ❌ 无               | ⭐⭐ 中    |
| 通知公告 (SysNotice)        | ✅ 有               | 参考优化 |
| 租户管理 (SysTenant)        | ✅ 有               | 参考优化 |
| 租户套餐 (SysTenantPackage) | ❌ 无               | ⭐⭐ 中    |
| 客户端管理 (SysClient)      | ❌ 无               | ⭐ 低     |
| 社交账号 (SysSocial)        | ❌ 无               | ⭐ 低     |
| 个人中心 (SysProfile)       | ❌ 无               | ⭐⭐ 中    |

### 3. 监控功能

| 功能                  | CloudFlow 是否已有 | 移植价值 |
| --------------------- | ------------------ | -------- |
| 缓存监控 (Cache)      | ❌ 无               | ⭐⭐ 中    |
| 登录日志 (Logininfor) | ❌ 无               | ⭐⭐⭐ 高   |
| 操作日志 (Operlog)    | ✅ 有基础           | 参考优化 |
| 在线用户 (UserOnline) | ❌ 无               | ⭐⭐ 中    |

### 4. 代码生成器 (ruoyi-gen)

CloudFlow 完全没有代码生成器。RuoYi 的代码生成器可以根据数据库表自动生成 Controller/Service/Mapper/Domain/前端页面，开发效率提升巨大。移植价值：⭐⭐⭐ 高

### 5. 工作流模块 (ruoyi-workflow)

RuoYi 使用 Warm-Flow 轻量级工作流引擎，包含：流程分类管理、流程定义管理、流程实例管理、任务管理、SpEL 表达式规则。CloudFlow 已有自己的工作流实现，可参考其流程分类和规则引擎设计。

---

## 二、推荐移植优先级排序

### P0 - 立即移植（对系统健壮性和开发效率影响最大）

1. `common-idempotent` 防重复提交 — OA 系统表单提交场景极多，没有防重复提交是 P0 级隐患
2. `common-ratelimiter` 接口限流 — 防止接口被恶意调用或误操作导致系统崩溃
3. `common-encrypt` 数据加密 — 敏感数据（身份证、手机号）存储加密是合规要求
4. 字典管理 (SysDictType/SysDictData) — 消除代码中的硬编码魔法值，所有下拉选项统一管理

### P1 - 尽快移植（提升开发效率和用户体验）

5. `common-excel` Excel 导入导出 — OA 系统大量报表导出需求
6. `common-oss` 对象存储 — 当前文件上传实现过于简单，需要抽象存储层
7. 登录日志 — 安全审计必备
8. `common-sensitive` 数据脱敏 — 列表页展示手机号、身份证等需要脱敏
9. 在线用户管理 — 管理员需要查看和踢出在线用户

### P2 - 按需移植（锦上添花）

10. `common-translation` 数据翻译 — 减少关联查询，提升性能
11. `common-sse` / `common-websocket` 实时推送 — 审批通知实时推送
12. 代码生成器 — 后续新增业务模块时大幅提效
13. 岗位管理 / 租户套餐 / 参数配置 — 完善系统管理功能
14. `common-job` 定时任务 — 定时统计报表、清理过期数据
15. 缓存监控 — 运维排查问题

### P3 - 暂不需要

- common-dubbo（CloudFlow 用 Feign，没必要换）
- common-seata（当前业务复杂度不需要分布式事务）
- common-elasticsearch（数据量不大时不需要）
- common-social（社交登录看业务需求）
- common-logstash / common-prometheus / common-skylog（运维级别，后期再考虑）

---

## 三、移植策略建议

1. 注解驱动的模块（idempotent、ratelimiter、encrypt、sensitive）移植成本最低，只需复制模块代码并调整包名，然后在需要的地方加注解即可
2. 字典管理需要新建数据库表 + 后端 CRUD + 前端页面，工作量中等但价值极高
3. Excel 和 OSS 建议直接引入 EasyExcel 和 AWS S3 SDK，参考 RuoYi 的封装思路
4. 代码生成器可以作为独立工具模块，不影响现有代码