# 2026-11-02 版本合并记录

用户要求保留一份开发版本，本地保留dev与master，清理其他本地分支；远程master与XinYuan不动。合并起点为远程e0b9e7d2与审计分支a108298d（9批改造），逐处保留新版业务能力和仍适用的精简规则。用户随后追加更新服务器，已完成统一版本部署与测试库重建；最终验证、分支与清理结果见文末，各分工过程记录保留。

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

## 更新后直接相关问题：费用标准删除

真实API验证已通过来源独立、渠道为空、候选人身份归属、四种费用周期、具体城市、创建/更新租户归属及跨租户拒绝，但删除返回成功后SQL检查deleted仍为0。原因是全局逻辑删除启用后，MyBatis Plus的updateById自动排除逻辑删除字段；原实现先查实体、setDeleted(1)、updateById只更新了其他字段。实施前决策：直接调用框架deleteById，由其生成带租户与未删除条件的逻辑删除SQL，删除无效的先查再手动设置流程；继续保留事务与公共高风险审计。复测范围仅OA相关测试与实际费用契约，不扩展全站验收。


## 最终交付与分支状态

合并提交103c9f1b保留远程e0b9e7d2和审计a108298d两个父提交；随后a9c5b942修复实际费用逻辑删除及网关外部路由，均已正常推送dev，无强制推送。备份分支56项改动全部历史等价、末端树一致，已删除；审计临时分支本地/远程均删除，本地XinYuan仅删除引用，其远程仍保留。最终本地只有dev、master，远程master仍为a01a6d3c14b3e38f6f95d5917e6656697dba81e8、XinYuan仍为54a850d5ac63f212c1dc91e0a329d496b56fe241。原有无关未跟踪HR界面指导文档仍在原位置，未提交或删除。

服务器192.168.1.173于18:09:32启动合并版，18:12:31同步网关配置，18:24:25更新OA删除修复；18:26:29最终运行验收通过。访问地址http://192.168.1.173:18080，六服务均Java17 -jar且健康UP，MySQL/Redis仍为Docker。实际运行包摘要和前端index与发布产物一致；正式测试库七份SQL完整重建为376表6990列，50活跃租户和50管理员租户，重建当时错误负责人关联/非法费用周期/待执行演示消息均0。Redis10的87143条已确认项目缓存已备份后删除，Redis0未操作。

真实验证码登录、8个核心接口及退出后旧token拒绝通过；独立来源WEBSITE、channelId为空、数组与EMAIL身份归属、部门负责人50项、费用四周期/城市/租户归属/跨租户拒绝/实际删除全部通过。OA修复后17项测试再次成功，总后端75项不重复计数；运行验证的候选人、身份占位和费用记录均精确清理，残留0，审计保留。启动后读取的服务日志ERROR为0。可复用实际接口验证脚本保存在scripts/verify-backend-merge-contract.py，凭据从环境读取。

此次未进行全站浏览器验收；报表为23项静态渲染，绘图交互和完整薪资等业务不在通过范围。薪资AES仍沿用原关闭配置，薪资核价/结算等需要密钥的功能未验收，具体边界见version-merge-deployment.md。费用按日/月/年累计等原审计边界不因本次版本统一被标为已实现。

## 本轮失效产物清理

验收及版本摘要已记录后，已移除本轮本地Maven target、旧前端dist、本次前端独立dist、Git临时bundle/重复文件备份、合并日志与上传压缩包，保留源码、依赖缓存、可复用测试和服务器实际运行目录。本地清理前逐项验证工作区/TEMP绝对边界、目录链接与受版本控制文件边界；第一次因Windows短路径和长路径不一致在删除前停止，统一到明确绝对路径后才执行。

本地已清理文件合计1041348640字节，C盘清理前可用55666077696字节，清理后56721633280字节。服务器本轮发布暂存与回滚目录`/data/cloudflow/releases/merge-20261102-180007`、`/data/cloudflow/backups/merge-20261102-180007`在验收通过后已清理，文件合计1710913596字节，清理前可用108168589312字节，清理后109880262656字节；当前运行包、配置、数据库及`/data/cloudflow/runtime/release-manifest.json`保留。上述磁盘存在其他写入，空间差值不认作本轮独立释放量；历史记录的暂存路径不再代表文件仍存在。

前端两份临时验证副本verify-report-static.cjs和render.cjs合计5357293字节因自动审批“blocked by policy”拒绝删除而保留，未尝试绕过拒绝；对应生产dist已正常清理。环境拒绝不影响部署和验证结果，可复用脚本已纳入源码。

运行产物SHA-256：

| 服务 | 摘要 |
| --- | --- |
| gateway | `1b09531b027b0e7ab39a30b730b3e849503e4af1b358ef5c247234f8b5206123` |
| auth | `1c70ef115e173585abd37474462154c80623e2cae6a0ae67e398ebac1a18e7bf` |
| workflow | `213c2b11e90ebfdf5a3d10ea3a1bab3a6a45652ae240d1a4e95142b17b87ac46` |
| oa | `7f875765ac0fe5a1c40eec41a25f12ee546de07288ec6c6f76b28e07b09a3532` |
| crm | `e952dbfc5402c5a34b6ccca1383c7945c65d9c71f0f77eb2ab8c9cb841e4e3c2` |
| hr | `96ba17f4e632454242e584184b284a9a1343f11e2f94e5b8ee7b475c68a59992` |
| 前端index | `28da2e03eac713d13c106726b0ff68bf3c9dee235adc202cb81117b396a14b23` |

最后一次清理剩余TEMP合并辅助脚本和状态文件时，自动审批再次返回“blocked by policy”，命令尚未执行即被拒绝。只读复核剩余12个普通文件共54813字节；未再换用其他机制删除，它们与前述两份报表验证副本一同作为环境拒绝的清理遗留保留，不影响运行。源码、分支推送和服务器验收均已完成。
