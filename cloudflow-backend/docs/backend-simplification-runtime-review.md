# 网关退出异常定位与修复

## 任务与证据边界

主代理反馈：同一有效 token 经网关 GET `/auth/info` 和 OA/HR 写入成功，经网关 POST `/auth/logout` 返回 AuthFilter 的 401 文案“未授权或Token已过期”，直连 Auth 的 `/logout` 成功；请求头和 Cookie token 一致，CSRF 正确。本分工只读检查源码和本机 Maven 依赖，不改源码、不构建、不访问服务器。以下已证实源码及依赖触发链，线上线程与实际生效连接工厂仍由主代理核实。

## 最小根因链

最高确定性的源码解释是：退出命中专用异步限流 → Redis 回调线程直接进入同步登录校验 → Redisson 明确禁止此线程执行同步命令 → TokenService 吞掉异常并返回 null → AuthFilter 将其误报为 token 无效。没有发现针对 logout 替换、清空请求 token 的实现。

| 环节 | 证据 | 影响 |
| --- | --- | --- |
| 退出专用路径 | `DB/06.cloudflow-business-seed.sql:4072` 的 `auth.logout.guard` 为 ACTIVE，POST `/auth/logout`，USER，30 次/60 秒；该组种子没有 `/auth/info` 规则 | 退出需要等待一次 Reactive Redis 计数；info 无匹配规则时直接进入认证 |
| 异步回调接同步链 | `cloudflow-gateway/src/main/java/com/cloudflow/gateway/ratelimit/DynamicRateLimitFilter.java:136`—`:149` 对 Reactive Redis increment/expire 的结果执行 flatMap，并在回调中直接 `chain.filter(exchange)`；过滤器顺序 -150，AuthFilter 为 -100 | 未切换到允许阻塞的工作线程，AuthFilter 沿用 Redis 完成信号线程 |
| 同步 token 校验 | `cloudflow-gateway/src/main/java/com/cloudflow/gateway/filter/AuthFilter.java:74` 直接调用 `tokenService.verifyToken(rawToken)`；`cloudflow-common/cloudflow-common-security/src/main/java/com/cloudflow/common/security/core/TokenService.java:108` 调 `StpUtil.getLoginIdByToken` | 此调用按 token 查询 Redis，使用同步 StringRedisTemplate |
| 实际依赖配置 | `cloudflow-common/cloudflow-common-redis/pom.xml:44` 引入 redisson-spring-boot-starter 3.27.0；GatewayApplication 未排除它，也无自定义连接工厂。依赖 RedissonAutoConfigurationV2 在 RedisAutoConfiguration 前生效，缺失工厂时创建 RedissonConnectionFactory | 项目默认自动配置的同步和 Reactive Redis 都可由 Redisson 提供，不能看到 lettuce 依赖就认定实际使用 Lettuce |
| 驱动明确拒绝 | 只读 `javap -c` 核实 Redisson 3.27.0 `CommandAsyncService.get(RFuture)`：字节码 0—11 检查当前线程名以 `redisson-netty` 开头；14—23 抛 IllegalStateException，原文 `Sync methods can't be invoked from async/rx/reactive listeners` | 会立即失败，无须等 token 超时或 Redis 命令超时 |
| 错误被转为过期 | TokenService `:134`—`:135` 对任何 Exception 返回 null；AuthFilter `:75`—`:76` 收到 null 即 unauthorized，`:137` 写固定 401 文案 | 基础设施/线程使用错误与真实无效 token 被合并，日志中可能没有原始异常 |

依赖调用链已核实：Sa-Token 1.45.0 `StpLogic.getLoginIdByToken` → `getLoginIdNotHandle` → `SaTokenDao.get`；`SaTokenDaoForRedisTemplate.get` → `StringRedisTemplate.opsForValue().get`；`RedissonConnection.get` → `read` → `sync` → `syncFuture` → `CommandAsyncService.get`。Redisson 的 `CommandReactiveService` 直接在 RFuture.whenComplete 回调中向 FluxSink 发出 next/complete，没有在此切换线程。以上均为读取已有 jar 字节码，未运行构建。

主代理最小运行确认：确认网关连接工厂为 RedissonConnectionFactory，以及命中退出限流后认证调用线程为 `redisson-netty-*`；原异常预计为上述 IllegalStateException，外层可能包装 RedisSystemException。由于 TokenService 当前吞异常，仅搜索现有日志没有报错不能排除此链路。直接 Auth 成功符合 Servlet 工作线程可执行同步读取的差异。

## 同链路已确认的第二个缺陷

DynamicRateLimitFilter `:153`—`:155` 的 onErrorResume 包裹了此前 flatMap 中返回的整个下游 `chain.filter`。任何下游异常都会被写成“API 限流计数异常”，随后再次执行 `chain.filter(exchange)`，造成一次请求重复进入认证和业务链。此问题在源码上确定存在；不能据此声称当前 logout 已执行两次，当前 401 也可能在第一次认证时直接产生。

最小修复方向：把计数降级的错误处理限制在 Redis 计数阶段，再进入下游链一次；下游异常继续交统一异常处理器。对网关同步 token 校验和 Cookie 续期配置读取设置明确工作线程边界，例如将这些同步工作放入延迟执行的 Mono 并指定 boundedElastic（用于执行同步阻塞工作的线程池）。只在限流之后增加线程切换能够修复当前路径，但把认证自己的阻塞依赖集中处理，更能覆盖其他异步前置过滤器；不要仅调整认证/限流顺序来隐藏问题。

## 最小修复与验收建议

先核实上述线上线程证据，再由主代理实施：有效 token 经启用限流的 `/auth/logout` 返回成功，退出后同 token `/auth/info` 返回 401；同步校验在工作线程执行。定向回归验证下游抛错时请求链只执行一次、计数失败仍保持既定放行策略且只执行一次、超限仍返回 429。当前同样存在有效认证且命中动态限流的种子路径包括 `/auth/switchTenant`、`/workflow/start`、`/oa/contract/page`，应纳入运行抽查。

上述定位阶段未修改源码或依赖配置、未执行测试或构建、未操作服务器。已确认的错误吞并和重复执行属于本轮冗余防御审计范围，具体线上根因与修复验收结果由主代理补记。

## 14:36 授权后的实施决策（修改前）

主代理已确认运行 Redis 活跃规则中有 id=6 的 auth.logout.guard，并授权独占修改 AuthFilter 和独立回归测试，禁止改公共 TokenService、禁止构建和服务器操作。本分工已进一步核实驱动为项目默认 Redisson 自动配置，确定存在禁止异步监听线程执行同步读取的依赖检查；原先关于 Lettuce 超时的推测由上述更具体的证据替代。

最小修改：白名单与空 token 的本地判断保持现有流程；有效格式 token 的同步认证、Cookie 续期配置读取统一延迟到 Mono.defer 内，并用 subscribeOn(boundedElastic) 在允许阻塞的工作线程执行。租户状态异步查询和既有响应/转发规则保留，不增加重试或错误放行。新增测试模拟 `redisson-netty-*` 非阻塞调用线程，证明 token 校验和 Cookie 配置读取均离开该线程，并验证有效请求一次转发、无效 token 仍 401、停用租户仍拒绝。限流 onErrorResume 重放问题已报告主代理，本次授权仅改 AuthFilter，不越界修改限流器。

## 14:49 扩展授权后的限流修复决策（修改前）

主代理已确认默认连接驱动并授权一并修改 DynamicRateLimitFilter 与独立测试。将计数异常恢复放在进入下游的 flatMap 之前：仅 Redis 计数阶段失败时按既有策略允许本次请求一次，下游错误直接传播，删除错误后再次调用 chain 的分支。保持正常计数、超限 429 和原有 TTL 异常策略；新增下游失败不重复、计数失败仅放行一次、超限仍 429 三项回归。不修改公共 TokenService，不构建，不操作服务器。

## 实施结果与验证交接

- AuthFilter 已增加明确的同步工作边界：认证及 Cookie 配置读取放入 Mono.defer，并 subscribeOn(boundedElastic)。白名单、空 token、无效 token 401、停用租户 403、可信租户透传和伪造内部头移除保持现有行为。
- DynamicRateLimitFilter 的 onErrorResume 已移到进入下游前，只恢复 Redis 计数阶段错误；原有下游失败后再次执行 chain 的分支已删除。顺带把 Reactive 流中不可出现的 null 计数兜底换成 thenReturn(count)。正常请求和 Redis 计数失败各只进入下游一次，真实下游错误向外传播。
- 新增 2 类共 7 项测试：AuthFilterThreadBoundaryTest 3 项（非阻塞 Redisson 名线程触发有效认证与 Cookie 读取、无效 token、停用租户）；DynamicRateLimitFilterFailureBoundaryTest 4 项（下游失败不重复、计数失败放行一次、计数失败后下游也失败仍不重复、超限 429）。修改文件 `git diff --check` 通过，已只读确认当前依赖中的相关构建器方法；未运行 Maven/npm，未改公共 TokenService、依赖或 SQL，未操作服务器。

主代理统一验证命令（cloudflow-backend 目录）：`mvn -pl cloudflow-gateway -am -Dtest=AuthFilterThreadBoundaryTest,DynamicRateLimitFilterFailureBoundaryTest -Dsurefire.failIfNoSpecifiedTests=false test`，之后打包部署网关并验收启用原退出限流时 logout 成功、同 token 后续 info 401。上述 7 项测试当前为已编写待执行，不标记为已通过。

## 主代理最终验证

Gateway及依赖verify通过：网关10个测试全部通过，含本次7项回归；依赖治理通过。运行包重新打包并校验SHA256后部署。原id=6 auth.logout.guard限流规则保持启用，网关POST /auth/logout实际返回200，旧token再访问/auth/info返回401；同次登录8个核心接口及OA/HR写入成功，证明线程边界修复消除了此前稳定复现的错误。最近服务日志未发现ERROR。没有新增错误放行或关闭鉴权/限流。

## 15:23 通知事件时间契约修复决策（修改前）

原生 java -jar 再次重建验收发现 `SystemNoticeCreatedEvent.createTime` 消费失败，错误为 InvalidFormatException、index 10。源码链路：`SysNoticeServiceImpl.publishNoticeCreatedEvent` 使用 OA 主 ObjectMapper 写业务 payload；`OaJacksonConfig` 将通用 LocalDateTime 序列化为 `yyyy-MM-dd HH:mm:ss`；事件 createTime 没有字段规则，Workflow 默认时间解析期待 ISO 中的 T 分隔符，故在第 10 个字符失败。信封 occurredAt 已独立标准化，不会自动改变 payload 内的 createTime。

最小决策：只在共享事件 createTime 增加 JsonFormat，明确 `yyyy-MM-dd'T'HH:mm:ss.SSSSSSSSS` 字符串；固定 9 位小数秒保留 LocalDateTime 全部纳秒，零纳秒输出 `.000000000`，不增加旧格式兼容。core 已经通过现有 Spring Web/Jackson 依赖获得 jackson-annotations，父 POM 的依赖检查允许使用该既有组件；无需增加框架、jsr310 直接依赖、消费者分支或第二个全局 ObjectMapper。OA 页面与 SysNotice 的原有时间格式保持。

补 OA 定向测试：使用真实 OaJacksonConfig 构造提供端 ObjectMapper，序列化事件与信封，再由 Workflow 使用的 Spring 默认 ObjectMapper 构造规则读取，覆盖纳秒、整秒和空时间；另验证 SysNotice 页面格式不变及旧空格事件格式被拒绝。只改事件字段和独立测试，主代理统一构建部署，本代理不运行构建或服务器操作。

实施结果：共享 `SystemNoticeCreatedEvent.createTime` 已增加上述单一时间格式；新增 `SystemNoticeEventTimeContractTest` 3 项（事件＋信封经 OA→默认 Workflow 映射器的纳秒往返、页面格式与 null 保持、旧空格格式拒绝）。`git diff --check` 通过；未新增依赖、未修改消费者或全局页面配置，未执行测试/构建/部署。主代理请运行 OA 及依赖 verify，因共享 core 事件注解同时控制读写，需部署最新 OA 与 Workflow 运行包并用新通知事件复验；本次测试不能覆盖旧重建之前已经发出的错误 payload，不应为旧测试消息新增格式兼容。

## 通知时间修复最终运行验证

2026-11-02 15:41 OA/Workflow及依赖install通过，新增3项测试通过；15:43可运行包打包成功。全后端现存31份Surefire XML共66项测试，失败、错误、跳过均0。独立只读复核确认生产代码只有OA生产、Workflow消费SystemNoticeCreatedEvent，本次仅更新两个服务足够。部署目录 `/data/cloudflow/releases/notice-time-20261102-154611`，替换前包与证据备份目录 `/data/cloudflow/backups/notice-time-20261102-154611`；两个运行包上传后SHA256一致，15:46:43经systemd执行Java17 -jar启动，健康UP。

受控新通知使用已确认不存在的收件用户8999999999999001，经有效测试登录会话及内部来源头调用 `/oa/inner/notice/send`。仅内部头不足以通过此路径登录检查，验证沿用现有认证，不放宽规则。通知22857224属于租户100001；事件e123a3da-e786-46b7-983d-dc47bd122e00已发布，createTime=`2026-11-02T15:52:10.686655607`，五个消费组pending/lag均0，失败消息没有增加且无该事件失败记录。验证后按精确编号和标记删除通知与出站记录，证据保留于notice-verification.json；测试账号重新登录并退出，旧token拒绝。

旧失败消息最终计数8173条，全部为15:20:03—15:32:12的SystemNoticeCreatedEvent.createTime空格格式，已备份old-notice-time-dlq.json，Redis原记录保留；此前27条是早期观察计数，不能作为最终总数。它们来自修复前测试数据触发的通知，没有重放或改标成功。15:48后当前服务日志检查未发现ERROR；停服务瞬间旧进程的Redisson shutdown日志与新进程验收分开记录。

验证边界：未连接真实用户浏览器，因此不能据消费组确认声称网页实际收到通知。独立复核发现Workflow NotificationWebSocketHandler使用new ObjectMapper()且未注册日期模块，在线发送LocalDateTime可能失败并只记录警告；这项既有网页推送风险本次仅记录，未改变其逻辑。六个原生后端健康、前端HTTP200、真实登录和8个核心接口、退出后旧token401均再次通过。数据库和Redis继续Docker运行，项目库清空重导已完成。

统一构建补记：本代理已读取 `%TEMP%/cloudflow-notice-time-build.log`，15:41:43 OA/Workflow 及依赖 install 全部成功，通知时间测试 3 项无失败、错误或跳过；依赖治理通过。`cloudflow-notice-time-package.log` 显示 15:43:09 两服务运行包重新打包成功。源码修改时间为 15:39:18，以上验证覆盖本次事件注解和测试；本代理未重复构建，服务器新通知验收由主代理补记。
