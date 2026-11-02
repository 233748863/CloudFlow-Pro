# 平台模块版本合并记录

## 范围与实施前决策

本分工负责 Auth、Gateway、common-audit/core/event/redis，以及前端 OrgStructure、auth API；远程 dev 为 e0b9e7d2，审计分支为 a108298d。仅编辑文件，不操作 Git 索引、不构建、不操作服务器。

- 组织：合并 SysDept 的自增主键/节假日日历与负责人用户编号，前端保留日历权限/加载/保存状态，并同时提供负责人选择。角色互斥的显式数据库列映射与说明保留。权限缓存保留新版批量失效方法及审计版明确快照类型。
- 认证与网关：保留新版 IM/OAuth/门户入口分流和请求追踪身份；普通登录认证及 Cookie 配置读取统一在 boundedElastic 工作线程内执行，保留只转发一次的限流错误边界。安全通知方法沿用 sendTotpDeactivationNotice，关闭双因素本身继续负责高风险审计，避免同一次操作重复记录通知审计。
- 事件与审计：保留新版事件租约、重领、确认及 payloadDigest；信封仍由新版公共 Codec 统一读取，将本轮 ISO 本地时间的单一解析规则迁入 Codec，不恢复已移动的旧解析方法。保留信封时间的显式序列化规则、通知 linkUrl 新字段及通知时间纳秒精度。自动合并的公共审计前后快照复用、MapChange 留痕与单次 JSON 差异计算继续检查调用一致性。

## 状态

本分工冲突处理及自动合并调用复核已完成，停止编辑，交主代理统一构建；本文件不将既有版本测试视作合并后已通过。

## 自动合并发现与处理

远程新增的 MessageDeliveryResolutionService、PlatformAccessService、ImBindingIdentity 仍按旧 PasswordMatchResult 调用 `.matched()`；已统一读取审计版 boolean 返回值，保留各自再次身份校验和双因素要求。OrgStructure 新增的深层部门搜索仍读 leader 文本，已改为 leaderName；日历和负责人字段同时保留。网关线程测试补充新版 IM 分流所需 HTTP method 与追踪属性容器，保留原三项线程/401/403/单次转发断言。

跨分工提醒：远程新增 OA 的 OaOrganizationService/OaIdentityMapper 及 CRM 的 CrmSlaService/员工投影仍按 sys_dept.leader 文本查人，需由主代理统一为 leaderUserId；本代理没有编辑 OA/CRM 文件。Workflow 的同类负责人读取由业务代理处理。

## 最终处理与验证

已解决 9 个冲突文件：SysDept、SysRoleMutex、SecurityChangeNoticeService、SystemNoticeCreatedEvent、BusinessEventEnvelope、EventConsumerAutoConfiguration、UserDataScopeStore、AuthFilter、OrgStructure。

| 合并项 | 保留的远程能力 | 保留的审计规则 |
| --- | --- | --- |
| 部门与用户 | 自增主键、节假日日历及显式清空、日历权限与保存状态、深层搜索 | leaderUserId/leaderName、负责人本租户校验、批量角色/部门读取、部门迁移用户去重刷新、树分组复用 |
| 认证与权限缓存 | IM/OAuth/门户分流、追踪身份、三类新增身份复验、批量 deleteAll | 原始密码统一校验、UserDataScopeSnapshot 明确类型、同步 Redis 与 Cookie 工作线程边界、限流下游不重放 |
| 事件与审计 | linkUrl、payloadDigest、租约续期/重领/完成确认、共享 Codec | ISO 本地时间与纳秒精度、直接使用出站 eventId、前后快照复用、MapChange 留痕、每操作一次 JSON 差异计算 |

自动合并范围已核对 PasswordService 调用、部门控制器到新管理服务、三个 UserDataScopeStore 读取入口及新增批量失效调用、ICompareHandle 唯一实现、Outbox 发布与重试、网关租户状态响应、公共审计测试依赖。未恢复旧事件解析助手；ISO 单格式已移到远程现行 BusinessEventEnvelopeCodec.timestamp，因此新增佣金/合同来源验证也使用同一规则，payloadDigest 保留。

静态检查：本范围无冲突标记，`git diff --check` 通过；2 个前端文件仅使用 TypeScript AST 进行语法解析，0 错误，未运行类型检查或构建；4 个受影响 POM XML 可解析且无重复直接依赖。本范围 Java 源码与测试未发现 var，未发现 PasswordMatchResult、旧 `.matched()` 或 notifyTotpDisabled 残留。

主代理待验证：Auth/Gateway 及依赖编译测试、HR 中 EventEnvelopeContractTest 与时间精度测试、OA 的 SystemNoticeEventTimeContractTest、前端 type-check；对应既有测试保留，本代理只为新版请求分流/追踪调整网关测试输入。未运行 Maven/npm、未操作 Git 索引、未操作服务器，合并后版本尚无运行验收结论。

## OA/CRM 负责人链路补派决策（实施前）

主代理已将以下精确范围转交本分工：OA 的 OaOrganizationService、OaIdentityReferenceMapper Java/XML、OaIdentityReference；CRM 的 CrmSlaService、CrmStaffMapper Java/XML，以及独立定向测试。此范围此前的跨分工提醒由本代理落地，主代理不并行编辑。

OA 读取 sys_dept.leader_user_id，直接复用既有 `user(id, tenantId)` 查询本租户有效用户，删除 `leaderCandidates` 的字符串/用户名/昵称多路匹配和候选排序。CRM 同样读取 Long leaderUserId，部门、原负责人和上级查询均显式传入当前可信租户；上级只按用户编号查询并过滤停用、删除记录。两者保留遇到本人、无效负责人时继续向父部门查找及部门环路去重，保留 OA 合同履约上级通知和 CRM 工单超时上级通知的新业务用途；缺少租户上下文时按现有模块规则失败，不增加默认租户。

新增测试直接验证同租户编号查询、无效或本人负责人向上查找、缺失租户拒绝；CRM 从实际 `scanBreaches` 通知入口检查收件人，避免改变私有方法可见性。只写测试源码交主代理运行，不构建、不操作服务器。

### OA/CRM 补派结果

已完成以下 7 个业务文件与 2 个独立测试文件，停止编辑：

| 模块 | 精确文件（以对应模块目录为根） | 改动 |
| --- | --- | --- |
| cloudflow-service-oa | `src/main/java/com/cloudflow/oa/service/impl/OaOrganizationService.java`；`src/main/java/com/cloudflow/oa/domain/vo/OaIdentityReference.java`；`src/main/java/com/cloudflow/oa/mapper/OaIdentityReferenceMapper.java`；`src/main/resources/mapper/OaIdentityReferenceMapper.xml` | leaderUserId 替换 leader 文本；一次读取可信租户，按编号复用有效用户查询；删除候选匹配接口与 SQL |
| cloudflow-service-crm | `src/main/java/com/cloudflow/crm/service/impl/CrmSlaService.java`；`src/main/java/com/cloudflow/crm/mapper/CrmStaffMapper.java`；`src/main/resources/mapper/CrmStaffMapper.xml` | 上级字段使用 Long leaderUserId；三条员工/部门查询均带显式 tenantId；移除用户名/昵称/字符串编号猜测 |
| 定向测试 | OA `src/test/java/com/cloudflow/oa/service/impl/OaOrganizationLeaderTest.java`；CRM `src/test/java/com/cloudflow/crm/service/impl/CrmSlaLeaderTest.java` | 各 3 项，覆盖非默认租户按编号找到负责人、跳过本人和不可用负责人向父部门查找、缺失租户拒绝；CRM 从实际超时扫描入口核对通知收件人 |

静态验证已通过：两份 Mapper XML 可解析；5 条相关查询均显式包含租户与有效/未删除条件；本范围无 leaderCandidates、selectLeaderUsers、getLeader、用户名/昵称匹配残留，方法参数与调用一致；`git diff --check` 通过，新增测试全部显式类型。没有运行 Maven/npm、没有修改 SQL 初始化脚本/索引或连接服务器。

主代理可将 `OaOrganizationLeaderTest`、`CrmSlaLeaderTest` 纳入 OA/CRM 统一验证；这 6 项目前仅完成测试源码，不能记为已通过。主代理同步数据库 `sys_dept.leader_user_id` 后，新版合同履约上级通知与工单超时上级通知使用相同负责人标准。

## 缺失报表组件补派决策（实施前）

主代理确认远程 dev 未包含 `src/components/reports/`，现有两个报表页面仍直接引用该目录。有限恢复搜索已覆盖当前工作区、全部 Git 历史、stash 和桌面“已经完成的”目录，四个目标文件均未找到；按现有页面调用、report API 单一数据契约及已有 verify-report 脚本补齐真实组件，不扩大本机扫描。

仅新增 ReportFilterEditor、ReportResultView、ReportShareDialog、report.css，并将根 `.gitignore` 的 `reports/` 收窄为 `/reports/`。筛选保持 AND/OR、两层分组、全局 20 条件、列表最多 100 值；金额筛选/表格/指标卡均保留十进制字符串。图表复用公共 Chart 与 ChartDataTable，支持六类展示、统计方式和单位、截断及缺费用日期独立提示；共享范围仅定义可见性，数据仍按查看人权限读取。只做静态检查，主代理统一类型检查、构建与浏览器验证。

### 报表组件补齐结果

四文件已新增并可被 Git 正常发现，根忽略规则仅修改上述一行。筛选支持字段允许操作、AND/OR、二层子组、全局20条件和IN超过100值的可见校验，不截断用户输入；切换未填写操作直接清空值数组，数值范围不转换浮点。六类结果均保留同一份原始数据表，指标卡直接显示字符串；四类图形复用公共 Chart，提示精确数值以表格为准，tooltip 使用画布文本，标签不插入HTML。费用缺日期汇总独立显示，即使日期结果为空也保留，截断与空结果按既有脚本提供明确文案。分享弹窗忙碌时禁止重复提交和关闭，错误保留供用户核对。

样式复用主题变量、44px操作尺寸和减少动画设置；仪表盘采用12列、12px间距、48px行高，准确对应页面拖动的60px行步长和 `(宽度+12)/12` 列步长，900px以下改为单列。

已完成静态验证：TypeScript AST解析3组件均0语法错误，PostCSS解析成功，目标文件 `git diff --check` 通过，新增目录不再被忽略。未运行类型检查、Maven/npm构建或浏览器，也未操作服务器及Git索引。主代理需统一 type-check/build，并运行现有 `scripts/verify-report-ui.mjs` 检查六图、精度、筛选、分享、费用汇总及320/375/1440布局；其结果仍待主代理补记。

## 前端最终验证（补派完成）

主代理授权本分工独占执行前端检查，范围为版本合并后类型、生产构建及报表必要静态渲染；本轮不做整站或旧服务器浏览器回归。主代理此前已修复流程和HR页面字段类型，本分工检查后未发现需要继续修改的业务源码。

| 命令 | 结果与范围 |
| --- | --- |
| `npm run type-check` | 成功，退出码0，覆盖当前前端TypeScript |
| `npm.cmd run build -- --outDir <本轮TEMP目录>/dist` | 成功，退出码0，4393模块，Vite构建48.98秒；前置图表检查22文件，硬编码颜色0、绕过统一封装0 |
| `node scripts/check-report-components.cjs` | 成功，23项；实际React服务端静态渲染六类报表，验证精确数值、每类仅一个数据表、标签转义、统计单位、空结果、截断、费用缺日期汇总、范围精度及两层20条件/IN100值限制 |

验证脚本已保存至 `cloudflow-frontend/scripts/check-report-components.cjs`，以后可重复运行；脚本只为请求模块online/offline注册提供无操作window监听接口，不模拟DOM或canvas。因此23项不代表浏览器绘图、分享交互或320/375/1440布局已经验证。本轮未运行verify-report-ui全页面脚本，按主代理17:21范围要求未扩大验收。

初次使用PowerShell解析的npm.ps1透传 `--outDir` 丢失参数名，引发Vite入口目录错误；换用npm.cmd原样透传后构建成功，未为工具调用问题修改应用代码。构建仍有原有依赖包超过500kB及Browserslist数据较旧提示，未扩大修改依赖。

最新用户追加服务器更新，构建产物 `C:\Users\ADMINI~1\AppData\Local\Temp\cloudflow-report-final-fbc8f2479ae440deb181c7c62b0c1937\dist` 已通知主代理保留供部署；不得清理此dist或后端target。仅清理同目录的临时验证脚本副本 `verify-report-static.cjs` 和调试bundle `render.cjs`，可复用脚本源码保留在前端scripts。清理前核实目标位于该TEMP目录、无目录链接且在Git工作区之外，并记录磁盘前后值；同盘其他代理并行工作，不把空间差值认定为本次释放量。

清理执行状态：未完成。目标已只读核实为本轮TEMP目录的两个普通文件，无ReparsePoint，位于Git工作区之外；长度分别5395、5351898字节，共5357293字节。自动审批先后拒绝包含路径核验的删除脚本与固定两条绝对路径的非递归 `Remove-Item -LiteralPath`，仅返回“blocked by policy”，未给出更细原因；不继续改用其他机制删除。操作前C盘可用53474021376字节，拒绝后只读复核为53471670272字节；未实际删除任何文件，同盘其他操作造成的变化不能计作本次清理。两份临时副本保留，dist仍供部署使用；此项为环境拒绝导致的清理遗留，前端验证结论不变。
