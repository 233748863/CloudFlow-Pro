# 2026-11-02 版本合并记录

用户要求保留一份开发版本，本地保留dev与master，清理其他本地分支；远程master与XinYuan不动。当前dev已快进到远程e0b9e7d2，正在合入审计分支a108298d（9批改造）。禁止覆盖远程新功能，禁止直接择一整批解决；逐处保留新版业务能力和仍适用的精简规则。本次仅做版本整合与验证，不在未验收前重新部署或重建服务器数据库。

## 分工（所有代理先读本节）

Git合并已开始，当前36个冲突。stage 2/ours/HEAD是远程最新dev，stage 3/theirs/MERGE_HEAD是本轮已验收审计；共同基线f576fd1a。`git show :2:路径` / `git show :3:路径` 可读双方。目录独占，禁止git add/commit/checkout/restore/reset、禁止Maven/npm构建及服务器操作；只编辑分配文件和自己的结果文档。不得全选ours/theirs省略语义对照；远程已替换或删除的旧能力按新版实际调用链判断，不强行复活。根AGENTS已经更新，Java用显式类型。

- database_schema：独占 cloudflow-backend/DB/ 下文件及 scripts/generate-demo-seed.ps1。解决SQL与生成器冲突，核实远程新增业务表/列/种子保留；融入审计的部门负责人、费用四周期具体城市、招聘来源独立渠道可空、重复字段清理和安全演示种子规则。既有字段被远程新业务真实使用时不可机械删除，记录保留原因。允许生成种子但不运行数据库。将结果写docs/version-merge-database.md，若实体需跟随修改请精确告诉主代理及业务代理。
- contract_review：独占 cloudflow-service-workflow/、cloudflow-service-hr/、common-workflow-callback/，以及前端WorkflowSettingsModal、workflow-builder/、WorkflowDesign、utils/workflowGraph、services/api/workflow/types.ts、pages/hr/、services/api/hr/。解决冲突并检查自动合并的调用与测试，保留远程新流程/HR能力，融入审计单一模型、权限、负责人ID、业务类型/回调、简历契约等规则；新版已删除的旧类型不盲目恢复。输出docs/version-merge-business.md。
- seed_runtime_review：独占 cloudflow-auth/、cloudflow-gateway/、common-audit/、common-core/、common-event/、common-redis/，以及前端OrgStructure和services/api/auth.ts。解决认证/公共事件/审计/网关冲突并核实自动合并；保留新鉴权和组织能力，保留本轮批量查询、审计范围复用、ISO事件时间、线程边界和防请求重复执行修复。输出docs/version-merge-platform.md。
- 主代理：其余OA/CRM/前端文件、跨模块一致性复核、串行构建、合并提交推送及分支清理；其他代理不得碰这些文件。

## 分支清理依据

backup/dev-before-message-rewrite-20260629在2026-06-29 11:28:38创建。56项补丁均与dev历史等价，末端树e7277ab1与dev历史72b2c999一致，无独有代码。全部本地分支引用及Git bundle已经临时备份，合并确认完整后才删除多余分支。

合并完成前的历史部署验收只对a108298d所代表的审计版本有效，不视为合并后版本的运行验收。

## 主代理OA决策（修改前）

远程已把项目任务从WorkTask切换到OaProjectTask和独立OaProjectTaskService，包含项目写锁、版本检查、依赖/工时引用检查。保留新版入口委托；任务树已有一次列表读取加映射查验，旧版直接调用WorkTask的实现和测试不再适用。删除任务仍逐个执行必要的锁与引用校验，将末尾刷新树和项目状态按项目编号去重，每项目只执行一次，并针对新版服务验证。

会议出席的meetingId在远程已由会议邀请创建实际写入，scheduleEventId、acceptanceStatus、invitationVersion、responseTime支持邀请应答和版本校验。本轮旧基线曾判meetingId冗余，合并后依据实际新用途保留字段及前端定义，并要求SQL保留同一结构。

## 合并后验证与修正

当前远程新增能力和审计改造的语义冲突均已处理。新工单等级由HIGH/CRITICAL改为P2/P1，健康分数计算和测试使用新版等级；HR简历测试按新版真实校验补充显式国家区号。OA批量任务删除测试改从新版服务实际入口验证项目去重刷新，保留锁、版本和引用检查。MyBatis测试显式初始化实体元数据，不改变生产校验或私有方法可见性。

本地后端最终33份报告共75项测试，失败、错误、跳过均0：Auth 8、Gateway 10、公共审计3、Workflow 14、HR 15、OA 17、CRM 8。公共依赖、Auth/Gateway、OA/CRM分别install通过；发现Workflow/HR保留8个已删除源码的旧class后，对Workflow/HR及依赖执行clean install，HR唯一手机号测试数据失败修正后独立install通过。旧通知类型没有恢复。部署前六服务统一重新package，以使用同一套最终公共依赖；不重复计入测试数量。

前端type-check及生产构建通过，补齐远程因reports忽略规则丢失的4个实际组件；新增可复用check-report-components.cjs，23项静态渲染检查通过。流程图统一title/condition，HR简历按真实后端保留rawText并删除不存在的reviewRemark展示。检查范围为编译、组件静态渲染及直接相关后端单元测试，不视为全站浏览器或完整业务流程验收。

七份SQL实际导入隔离库cloud_flow_merge_20261102_170929成功：376表6990列，较静态374表多出两张归档表；50活跃租户、50管理员租户，部门负责人跨租户错误0、非法费用周期0、演示待执行Outbox/事务消息0、旧通知表0。新版会议邀请字段、表单版本锁、催办引用和统一消息表均存在。SQL文件摘要及完整结构检查通过后，已删除该隔离库和/tmp/cloudflow-merge-20261102_170929；正式cloud_flow_db仍为244表，未受该次隔离验证影响。

隔离环境清理记录：数据库统计数据及索引763854848字节，SQL暂存6814828字节；服务器/tmp所在盘清理前可用108813570048字节、清理后111643238400字节。同盘可能存在其他写入，不将空间差值作为本次实际释放量。

## 用户追加部署范围

用户随后明确“要更新服务器上的旧版本”，本次范围因此包含更新六个原生java -jar服务与前端，并按既有授权全量重建测试数据库cloud_flow_db、清理Redis10的已确认项目缓存。MySQL/Redis继续Docker，远程master/XinYuan保持不动。部署前备份当前运行文件、数据库及项目缓存，验收后记录版本、检查范围和清理情况；历史旧版本运行验收不充当本次更新结果。
