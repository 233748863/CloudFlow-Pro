# Workflow 与 HR 版本合并记录

状态：本分工合并及静态检查完成，停止编辑，交主代理统一构建；未执行本次合并的构建、测试或部署。

协作备注：消息 Payload 为空时，以 backend-simplification-coordination.md 最新补派为准。

## 已确认取舍

- 审批对账沿用新版 pendingStatuses 与完整流程终态，保留审计新增的 HR 正式业务类型常量并覆盖新版业务。绩效计划、结果按各自流程列和阶段状态对账。
- Git 将旧通知日志误识别为 WfGatewayActivation 的重命名；保留新版网关激活实体。旧通知配置无调用，遵循新版删除。催办效果的 effectId、urgeId 已有真实写入，保留新版字段；数据库合并须保留 effect_id、urge_id。
- 入职申请保留新版事务外发起流程及 Outbox 重试；部门负责人继续使用编号。已办任务保留新版撤回资格判断并合并按定义缓存。
- HR 通用修改保留新版事务、身份校验、加密与日历失效处理，同时采用审计范围复用。简历保留新版查看入口和身份校验，统一数组及 reviewStatus。

## 完成结果

已消除本分工全部冲突标记。自动合并额外发现并修复：入职请求的构造已改 HR_LIFECYCLE，但新版校验仍要求 ONBOARDING；录用启动新入口与冻结审批校验仍使用 OFFER，现统一为 HR_OFFER，并同步 HrOfferMapper 与 WorkflowHParticipantPolicy，保留原冻结审批人、模型和权限约束。候选人的 OFFER 阶段状态不受影响。

HR 借款的新负责人查询仍通过 sys_dept.leader 文本猜用户，已改为 leader_user_id 与同租户有效用户直接关联。公共审计范围复用先应用新版敏感字段过滤，再同时用于两份日志，避免自动合并将未过滤快照交给公共审计。

已适配入职 Outbox、简历身份锁与通用 CRUD 新依赖测试。入职验证本地事务先提交、远程失败保留申请及持久化重试；简历验证当前租户、身份锁与数组往返；已办缓存增加新版撤回资格的真实所有者及审批执行记录断言；录用回调增加 HR_OFFER 仍执行冻结审批验证及拒绝旧类型断言。EventEnvelopeContractTest 改用现行公共 Codec；相关 Java 测试全部使用显式类型。

继任计划 IN_PROGRESS、工伤 DETERMINING 是新版实际审批中状态，已同步注册项 pendingStatuses，避免对账遗漏。绩效评议响应的 3 个删除列在现行聚合 SQL 中均来自邀请主记录，工伤 4 张子表的员工编号亦未在现行实体或调用中使用，数据库删列与业务代码相符。

## 静态检查结果

18 个分工冲突文件均已处理；其中旧通知配置按新版删除，Git 索引仍由主代理统一标记解决。相对远程 HEAD，本分工累计涉及 76 个变更文件，包含审计自动合并变更及测试。

- 分工范围冲突标记、变更 Java 文件的重复导入及 var 声明检查均为 0；`git diff --check` 通过。
- 3 个后端模块共 83 个 POM / Mapper XML 可解析；13 个变更 TypeScript / TSX 文件语法解析 0 错误。尚未执行类型检查。
- 已复核自动合并的保存、发布、导入权限格式，流程图标准字段与新版网关语义，负责人查询，HR 新业务回调、录用冻结审批、入职专用可靠启动、公共审计过滤及绩效/工伤删列依赖。

主代理待执行受影响 Workflow / HR 测试、前端类型检查及必要构建；上述静态检查不视为编译或运行验收。未操作 Git 索引、提交、服务器；未产生独立构建或截图材料。

## 跨分工提醒

数据库：wf_urge_effect 必须保留远程的 effect_id、urge_id、before_duration、after_duration、effectiveness、urge_time、complete_time，旧汇总列不可拼进现行实体。新版冻结录用流程的业务类型已统一 HR_OFFER；种子若使用 OFFER 作为流程 businessType 或 HR 规则审计 business_type，需同步 HR_OFFER（候选人 OFFER 阶段状态保留）。旧 wf_notification_config 已删除，WfGatewayActivation 保留真正网关实体，含 released_time 与 version。

主代理：新旧录用流程整合涉及 HrRuleWorkflowService、HrRecruitmentApprovalService、HrOfferMapper、WorkflowHParticipantPolicy；外部分工若有流程 businessType=OFFER 的安全校验须同步 HR_OFFER。EventEnvelopeContractTest 已迁到共享 BusinessEventEnvelopeCodec，保留纳秒及拒绝旧格式断言。

主代理前端：TaskHandleModal.tsx:468 仍使用 node.label；ProcessTrace.tsx:198-199 仍将 node.label/edge.label 转成标准字段，应直接使用 title/condition。FieldPermissionDialog.tsx:39 仍读 node.label 兜底，可同步单一 title。三者不在本代理编辑范围。

入职重试沿用新版 HrEmployeeOnboardingSubmittedEventConsumer 与 startPersistedWorkflow 的完整单据验证和回填。审计旧通用降级消费者对所有 HR_LIFECYCLE 的无条件回填已移除，避免绕开新版专用启动校验；通用消费者仍保留 TenantContext 的可信租户检查。

## HR 构建补派

主代理报告 Workflow 与公共依赖 clean install 通过，HR 编译通过但 15 项测试中简历编辑往返测试失败。已核实新版 HrRecruitmentContacts.phone 要求显式国家区号；原测试的 13900000000 缺少 +86。仅将该测试输入改为 +8613900000000 并断言保存值，保留数组、学校、可信租户及拒绝正文租户覆盖的原断言，不修改业务校验。按补派串行执行 HR install；结果待回写。部署使用的 target / dist 保留。

2026-11-02 17:47:55 补派完成：`mvn -B -ntp -f cloudflow-backend/pom.xml -pl .,cloudflow-service-hr install` 返回 BUILD SUCCESS，耗时 01:01；HR 重新编译 845 个生产源码文件，7 份 Surefire 报告合计 15 测试、0 失败、0 错误、0 跳过，依赖分析通过。修正后的简历往返测试通过，HR 服务包已生成并安装，target 保留供主代理部署。未运行其他模块测试、未操作 Git 索引或服务器；本分工停止编辑。

本次独立复测日志已在提取上述结果后删除，文件位于系统 TEMP，清理前已核对绝对路径和非链接属性；共 28715 字节。C 盘清理前可用 53472919552 字节、清理后 53472952320 字节；同盘仍有其他构建与部署工作，不将空间差值归为本次清理释放量。主代理原构建日志及部署所需 target/dist 未动。
