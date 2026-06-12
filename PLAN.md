# CloudFlow 权限完成态改造计划

## 摘要
- 目标是把项目从“Sa-Token 已统一、授权粒度未统一”的中间态，收口到“单一权限模型、单一命名空间、单一前后端消费方式”的完成态。
- 完成态固定为：外部接口以 `@SaCheckPermission` 为主，内部接口只走 `@Inner`，匿名入口只保留明确白名单；底层继续保留 Sa-Token、`TokenService`、网关 `AuthFilter`、`UserContextInterceptor`，不重写认证框架。
- 权限码统一改名为 `{module}:{resource}:{action}`，模块前缀只允许 `system`、`oa`、`crm`、`hr`、`workflow` 五类；本次采用一次切换，不保留旧权限码兼容层；React 前端同步完成。

## 接口与模型变化
- HTTP 路径不改，权限字符串契约整体改名：后端返回的 `permissions[]`、菜单 `sys_menu.perms`、角色授权 `sys_role_menu`、前端路由守卫与按钮显隐全部切到新命名。
- `admin:*`、`office:*`、`workspace:*`、`process:*`、零散 `oa:*` 全量并入 5 个固定前缀；其中 OA 统一收口到 `oa:*`，Workflow 统一收口到 `workflow:*`。
- `/login`、`/register`、`/captcha/**`、`/tenant/options`、必要 `/ws/**`、必要 `health` 保持匿名；`/inner/**` 与工作流回调改为显式内部调用语义，不再依赖“未加注解即放行”。
- SSE 接口不再接受“只传 `userId` 即建立连接”的语义，改为绑定当前登录身份，或改成明确内部接口；外部不能伪造他人 `userId` 建连。

## 实施内容
- 数据与权限基线：直接更新 `06.cloudflow-business-seed.sql`，一次性完成权限码重命名、菜单权限修正、角色授权修正、旧权限清理。
- Auth 服务：保留 `AuthController` 的匿名入口；为受保护的 `/info`、`/profile`、`/getRouters`、`/logout`、`/switchTenant` 及 `SysDept`、`SysConfig`、`SysPost`、`SysTenant`、日志、文件、规则、缓存等控制器补齐显式权限码，不再依赖“全局已登录拦截 + 方法内零散校验”。
- OA 与 CRM：不改鉴权框架，保留现有 `@SaCheckPermission` 结构，整体做权限码重命名、菜单/按钮/角色授权同步，消除历史 `admin`、`office`、`workspace` 前缀。
- HR：11 个控制器全部进入统一权限码模型；当前仅 `@SaCheckLogin` 的外部 HR 控制器全部补到 `@SaCheckPermission`；Service 层高敏写白名单、数据权限过滤继续保留，作为第二层兜底，不下线。
- Workflow：14 个控制器以权限码为主重构；当前 `@SaCheckRole("admin"/"manager")` 为主的外部接口改成 `@SaCheckPermission`；只保留极少数纯平台运维级入口继续用 `@SaCheckRole("admin")`；原 `process:start` 并入 `workflow:*` 命名空间。
- 前端：React 同步替换权限常量、路由守卫、菜单显隐、按钮 `permissionKey`、认证 store 的权限判断；不保留旧权限码别名。
- 守护措施：加一条构建期扫描规则，要求所有外部 Controller 方法必须属于“白名单匿名 / `@Inner` / `@SaCheckPermission` / 允许保留的 `@SaCheckRole`”四类之一；出现仅 `@SaCheckLogin` 的外部业务接口直接阻断构建。

## 影响范围
- 后端控制面共 97 个控制器类：`cloudflow-auth` 19、OA 32、CRM 20、HR 11、Workflow 14、common SSE 1；其中本轮直接重构授权语义的是 Auth 19、HR 11、Workflow 14、SSE 1，OA/CRM 主要做权限码迁移与授权数据迁移。
- 当前存量权限码共 268 个唯一值，分布在 7 个历史前缀：`admin` 77、`office` 75、`crm` 85、`system` 23、`oa` 5、`workspace` 2、`process` 1；完成态统一收口为 5 个前缀。
- 当前前端显隐面：React 已有 78 处路由守卫、128 处动作按钮权限点、72 处 `hasPermission()` 调用。
- 风险最高的中间态缺口是：Workflow 仍有 11 个角色型控制器和 3 个仅登录控制器，HR 有 8 个仅登录的外部控制器，Auth 有 12 个受保护系统控制器没有显式细粒度权限注解，SSE 仍存在按 `userId` 建连的身份伪造面。

## 测试与验收
- 迁移验收：空库初始化和存量库升级都要通过；升级后 `sys_menu.perms`、`sys_role_menu`、`permissions[]` 中不得残留旧前缀。
- 权限验收：管理员、经理、普通员工、HR 专员四类账号分别验证 OA、CRM、HR、Workflow 的代表性接口，预期为正确的 200/403；撤销权限后，前端入口隐藏且接口返回 403。
- 白名单验收：`login/register/captcha/tenant-options/health/ws` 按预期匿名可用；外部直打 `/inner/**`、工作流回调、SSE 伪造身份请求必须失败。
- 一次切换验收：执行顺序固定为“DB 迁移 → 后端发布 → React 发布 → 全链路冒烟”；回滚演练必须覆盖 SQL 回滚和应用版本回退。

## 默认约束
- 完成态不改 HTTP 路径，不改登录态存储模型，不引入第二套权限平台。
- Workflow 的保留角色校验只允许落在极少数平台运维动作，不能再用于普通业务动作。
- HR 采用“双层控制”：Controller 显式权限码 + Service 高敏兜底，两层都保留。
- 本轮交付物必须同时包含代码、SQL、菜单授权、角色授权、前端守卫、测试基线和文档更新，不能只完成其中一层。
