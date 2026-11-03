# D盘审计改造协作记录

用户2026-11-02已授权依据D盘审计结果实施，并要求逐项回写。唯一工作目录D:\CloudFlowPro，起始HEAD e0b9e7d27b7690e5eac5f3c02be55b59a52924bf。桌面副本不得作为编辑目标。此前审计文档保留历史结论，按编号追加实施记录；登记表由主代理统一更新，禁止并发编辑它。

共同规则：Java禁止var；先读对应审计证据并复查实际调用；不为旧测试数据保留兼容；保留权限、租户、锁、版本、幂等、快照、外部可靠失败处理。可变业务问题必须等待规则或明确记录未决，不能猜测。不要改服务器、不清库、不自行提交/推送、不还原其他代理修改。

分工所有权：
- d_platform_audit：Auth、Gateway及Common代码；PL-P01至P14以及B01/B02/B03的具体方案。先做PL-P07/P06/P08/P05/P02/P03/P04/P10/P13等明确项，再推进密码/消息/报告。可改本模块专属前端文件（auth、notice、任务）但不得改OA/HR/Workflow页面。PL-D01 SQL仅提出精确改法给主代理，不直接改共用SQL。PL-P11选择明确可查询的尝试数据/事务一致窗口方案，保留外发未知状态和渠道限额锁，列出具体设计。B项需先补证据，系统全局审计语义不自行改。专属实施记录backend-quality-refactor-20261102-d-platform.md。
- d_hr_audit：整个HR及其前端/检查脚本，推进HR-01至13；HR-D1/D2在主代理统一SQL前可实现代码改法并写明数据库变更需求，HR-D3业务未决暂不删除。保留招聘source/channel_id独立语义。不要改Common审计代码，HR-05需跨模块快照方案时与平台协调或先提出方案。专属实施记录backend-quality-refactor-20261102-d-hr.md。
- d_workflow_audit：整个Workflow及其前端/检查脚本，推进WF-Q01至Q07、WF-C01/C03；X02的共享响应在Common定义归平台，主代理统一协调。X01负责人格式与缺人策略等待主代理给规则，不自行切换。WF-DB01/02 SQL由主代理处理，提供代码/种子约束即可。WF-DB03/04待业务决定。专属实施记录backend-quality-refactor-20261102-d-workflow.md。
- 主代理：OA/CRM、数据库SQL、跨模块X01/X02协调、登记表、业务问题、集成复核与最终验证/提交。

验证：每项只新增能检验真实行为或必要边界的测试，不写只镜像实现的测试；可执行本模块已有独立检查，Maven编译/安装会写共享target，先请求主代理分配时段，避免同时构建共享模块。每完成一项立即在独占实施记录记录编号、修改文件、改法、已执行检查/结果和未执行验证，不把代码完成等同运行验证。主代理据此回写总登记表。终止时明确余项，不能无故把复杂项略过。

当前待答：费用适用城市、周期计额时点、无部门负责人时指派规则。可先完成与答案无关项。

用户已答复：费用按每笔发生城市；周期按费用发生日期，提交审批即占用，驳回/撤回释放；部门无有效负责人时逐级找上级部门负责人，仍无人阻止发起，取消任意挑选manager规则。X01后端统一为sys_dept.leader_user_id（BIGINT），主代理负责SQL，平台负责SysDept/Auth及组织编辑器，Workflow负责负责人策略和监控，OA/CRM由主代理负责。请平台与Workflow优先将该共享结构需求纳入改造；保留环路检测、停用过滤及同租户校验。

第二组业务答复已确定：OC15工作日历失败时明确报错、暂停本次计算，恢复重试，删除自然时间降级。HR-D3独立业务字段（商城排序、快递公司、取消原因、工伤事发部门/结案时间）保留并接通实际填写保存展示，本轮需要实现；订单商品信息、回滚操作人姓名、证据文件名保留发生时快照，后来改名不得影响历史。HR代理落实HR-D3；Workflow代理落实WF-DB03真实姓名快照；同义无用列仍按审计去除，不把独立快照删掉。负责代理请定期重读本协作文档业务答复。

构建时段1：implement_workflow已获准现在执行Workflow及其依赖compile，再跑直接相关独立检查；完成后在自身实施文档明确写“构建时段1已释放”并通知主代理。期间其他代理及主代理不执行Maven写共享target。普通源文件编辑继续，若编译受尚未完成的共享契约影响，记录依赖并等待最终集成，不反复全量重跑。

2026-11-03 续接分工：原实施代理均已停止，未发现 Java/Maven 进程；此前构建时段释放，历史未产生可核实构建结果。新代理先复核现有差异后补齐，不重置文件。
- finish_platform：接管全部平台事项，补齐 PL-P01/P09/P11/P12/B01-B03，复核已改项；Common 归属继续负责，但下面新增 ProcessStartResult 由 Workflow 代理独占。平台新增数据库表或索引只报告精确方案，主代理统一 SQL。
- finish_hr：接管 HR 01-13/D1-D3，落实已答业务字段和真实快照，补齐局部行为检查；SQL 需求写 HR 实施文档。
- finish_workflow：复核和完成 Workflow 全项，负责 X02 生产者和全 Workflow 前端、检查、Shared DTO 新文件。统一类型 com.cloudflow.common.core.domain.ProcessStartResult，字段 String instanceId、String processNo，使用 Lombok Data/NoArgsConstructor/AllArgsConstructor；启动方法返回 R<ProcessStartResult>。不再返回 processInstanceId 别名。主代理负责 OA/CRM 消费者，HR 代理负责 HR 消费者，平台负责 Auth 消费者。前端业务单据自己的 processInstanceId 关联字段不随启动响应更名。
- Root：OA/CRM 全项及其前端、共用 SQL/种子、总登记表和集成。
构建安排：三个代理先完成编辑和局部检查源码，暂不并行 Maven；准备好后在自身实施文档写待执行的精确命令，Root 串行分配时段。每 10 分钟将实际进展、数据库需求和待决问题写到自身文档，不能只发送空消息。禁止自行提交或部署。

2026-11-03 已确认补充：OC14 合同模板使用次数保留，按实际关联该模板的合同数实时统计；删除无维护的冗余缓存列，保留展示属性。WF-DB04 保留最后一次催办到任务实际完成的耗时，Workflow 代理负责真实关联及展示，数据库同步由 Root 统一。


## 2026-11-03 最新续接任务（协作消息无法读取时以此段为准）

Root 已执行 OA/CRM 及依赖 compile + classpath，退出码 0，构建时段 5 已释放。01-04 数据库结构已按各模块方案同步，06 基础种子已修改 54 处；07 和生成器仍归 Root，禁止他人同时编辑。三子代理继续按用户最新要求并行，不停在报告能力；完成模块后承接下列具体工作。

- finish_platform：完成平台剩余局部验证，并接手全前端类型检查/构建。你独占 scripts/report-checks/ReportDatabaseChecks.java：CRM 已将 CrmReportService.AgingTier 换成 CrmReceivableAging.Tier，请同步此检查源码（导入与类型），避免旧检查编译失败。Root 新增 sys_message_delivery_attempt 已在01。若临时 Redis 是独占本轮进程，验证结束按公约清理，保留可复用检查源码。若此前消息未收，请务必核实 Auth X02 新改代码实际编译。前端类型失败只修本轮相关代码，HR/Workflow 专属文件先在文档说明，由该代理同步或与其协调。
- finish_hr：完成 HR 直接相关局部检查，所需03结构已同步。可启动独立临时 MySQL，仅监听127.0.0.1、独立新目录和新端口；不能停止或覆盖既存 mysqld 4996/5984。提供实例端口和凭据在本机忽略目录的连接文件，以便 Root 和其他代理创建各自临时 schema 复用实例；验证结束统一停机清理。在你文档明确实例绝对路径、PID、端口、连接文件位置；不在最终回复暴露口令。
- finish_workflow：完成并记录 Workflow 最终局部检查后，接手 OA/CRM 验证（可立即开展以提高并行度）。Root 已编译 OA/CRM，新 target/quality-oa-crm-classpath.txt 可用；你独占 scripts/quality-checks/ 下 Crm*、Oa* 验证源码和 runner，以及 scripts/oa-checks、scripts/crm-checks（但不改 CrmInvoiceReceiptDatabaseChecks.java，该文件属于平台）。Root 暂不编辑这些检查。业务源码如发现失败，请在实施文档或协作记录写精确原因，Root负责修复，避免与 Root 同文件写入。
  OA/CRM 必要验证：费用计算检查已通过；补真实 SQL/提交占额排队、撤回释放、版本与租户，会议 typed 决议日期备注与重复派发、模板使用次数真实批量统计及逻辑删除；CRM 健康计算和工作台查询复用、默认/配置账龄同编号和只读一次字典、SLA 日历故障明确失败，以及新 ProcessStartResult 事件消费绑定。优先复用已有检查，不要求全CRM回归。SLA构造器现8参，旧CrmOperationsChecks/CrmScheduledNotificationChecks需去原audit参数；OaApprovalIdentityChecks的R.ok(Map) mock须改ProcessStartResult。
  Root 对 CRM 新增 CrmCustomerHealthService（工厂检查 register 需同步）、CrmReceivableAging，CrmHealthCalculator 改纯 calculate；当前可访问列表一次读取，前8工作台复用，活动查询已增加同范围。你可以编写代表行为/次数检查并直接javac/java执行，不占Maven；可能用HR临时MySQL独立schema，请在文档记录连接需求。不要自行连接或重建远端数据库。

当前Root负责：07生成器和06种子收敛、SQL/种子执行验证、OA/CRM生产代码缺陷、总登记表和最终提交。催办关联种子只用真实历史 action=APPROVE/REJECT 和最后催办，不伪造时长。06前9部门旧负责人文本无对应账号，明确选择已有父部门负责人100->1,101->2,102->3,103->4,104->6,105->7；106/107/108无指定负责人为空，走已确认父链规则。109-119按原用户名精确映射已存在user_id10-20。

2026-11-03 新会话恢复：用户要求加载01a199f0-33a9-7122-89a5-6ab66510a239并完成余项，沿用历史业务决策、提交推送和并行授权。唯一代码工作区仍为D:\CloudFlowPro。新代理resume_platform负责平台最终检查和全前端type-check/build；resume_hr负责HR未完成基本验证、临时MySQL协调；resume_workflow_oa负责Workflow收尾和OA/CRM必要局部检查（可修自己模块Workflow，OA/CRM生产修复交Root）。先读取各自实施记录及已有日志，避免重复已通过项。Root负责共用SQL/06/07/生成器、数据库导入、OA/CRM缺陷、总登记和最终提交。不得并行Maven；需构建先写明/通知Root安排时段。当前目标完成D盘任务，不覆盖桌面副本。每项结果写入独占文档，所有数据库连接口令只放忽略目录且回复不打印。
