# D盘HR审计改造实施记录

开始日期2026-11-02，根目录D:\CloudFlowPro，基线e0b9e7d27b7690e5eac5f3c02be55b59a52924bf。implement_hr已接管实际实施，依据审计HR-01至HR-13逐项改造；数据库DDL由主代理统一负责。本文随每项完成回写，登记表由主代理更新。

当前实施及验证状态以文末“2026-11-03 resume_hr 最终记录”为准；前文保留分阶段历史范围，不能将早期“待验证”重复认定为尚未开发。

| 编号 | 代码改动 | 验证状态 |
| --- | --- | --- |
| HR-01 | HrPayrollCorrectionMapper新增按租户/员工/年度关联存在查询，PayrollCalculation预检调用一次，保留预览及最终生成各自复核 | 已核对SQL实体列，待模块编译/针对性检查 |
| HR-04 | 培训档案详情只执行一次实时聚合；总计与明细同源，取消读请求的缓存覆盖及自修复写入；原变更回调和重建任务继续维护汇总表 | 待编译和档案检查 |
| HR-06 | 通用CRUD按实体缓存不可变字段/列元数据，字段值已是目标类型直接赋值；删除重复反射助手与静默赋值失败，不改字段白名单和显式置空 | 待编译及通用更新检查 |
| HR-07 | 薪资套改使用明确Payload类型，两个字段齐全立即返回；缺值才按原规则读员工/岗位/薪级，配置不存在仍可手填，查询错误正常失败 | 待编译及默认值检查 |
| HR-11 | 招聘电话统一入口规范化，移除旧值不变时放行及失败当无电话的路径；保留历史身份占位去重与锁 | 待编译及身份检查 |

上述项目目前代码完成、尚未执行构建或测试，不把静态检查计为运行验收。未写SQL结构，未操作服务器。

2026-11-03 finish_hr续接：已核对既有修改，继续未完成项，当前尚未编译。X02的HR远程启动接口已改R<ProcessStartResult>，适配层只读instanceId；HR业务层保留返回已验证实例编号的单一适配入口，失败仍返回失败并保留Outbox重试，去除把ProcessFallbackResponse强塞成功结果类型的raw泛型。HrSettlementReservationChecks同步新契约，待共享DTO落地后局部编译。

| 续接项 | 实际改造 | 验证状态 |
| --- | --- | --- |
| HR-03 | 技能缺口按本页岗位、要求、技能、当前等级及来源类型批量读取；实际缺口集中查询可报名课程，保留员工权限/证据状态/到期校验以及每个员工技能至多100条推荐 | 代码已落地，待SQL解析和局部技能检查 |
| HR-05 | 与平台约定providedSnapshots上下文，通用CRUD复用已有before/after为两套审计提供同一份脱敏快照；移除公共审计额外读库，隐藏值变更仅记录字段名 | HR代码完成，等待Common接口，待编译和双输出检查 |
| HR-08 | 招聘列表候选人/需求/岗位/部门按去重ID批量加载，CRUD的权限与脱敏规则保留，每页共享同一关联数据 | 代码完成，待局部查询次数/权限检查 |
| HR-09 | 招聘正式字段统一requisitionNo/requisitionId/expectedArrivalDate/requirements，Offer保留自己的expireDate；页面、仪表盘、API、VO移除旧别名补齐 | 代码完成，待前端类型与创建/列表检查 |
| HR-02/10/12/13 | 接手时已存在对应批量权限、技能数组、单轮请假计算和删除离职旧重载的差异，正复核实际边界与检查 | 尚未记作验证通过 |

尚未执行Maven和数据库，本段为代码进展；继续HR-D1/D2/D3和局部检查。

2026-11-03 HR-D1/D2 代码完成，等待数据库同步和验证：
- HR-D1：新增 HrWorkInjuryAccess，所有工伤子记录新增、读取、更新和赔付操作先验证所属案件的租户、有效状态和主案件员工权限；主表分页亦通过主案件员工控制数据范围。事发部门仅为业务事实，不能成为授权依据。
- HR-D2：HrPerfEvaluatorResponse 移除 objectiveId/evaluateeId/evaluatorSource，提交只保存 evaluatorId、实际评分与提交信息，统计继续由邀请记录关联获取目标、受评人和来源。
- Root 统一 SQL：删除四个 hr_work_injury_* 子表的 employee_id 及对应员工索引（idx_hr_work_injury_inv_emp/treat_emp/comp_emp/rehab_emp，以真实 DDL 名称为准），保留案件索引；同步 06/07 种子。删除 hr_perf_evaluator_response 的 objective_id/evaluatee_id/evaluator_source、idx_hr_perf_response_obj，保留 evaluator_id 唯一关联。

HR-D3 数据库决策和界面接线布局：
- 保留并接通 hr_mall_item.sort_order；hr_mall_order.express_company/cancel_reason；hr_mall_order_item.item_no/cover_image；hr_work_injury.dept_id/closed_at；hr_dispute_evidence.file_name。
- 建议删除 hr_mall_order.item_count：后端、订单页面和 API 均无读写，详情已有每项 quantity；它是可由明细求和、未维护的缓存值。删除 hr_dispute_evidence.file_url，继续使用受授权控制的文件下载入口；file_name 是提交时快照。
- 商城现有表单：[名称/分类] → [积分/库存/排序号] → [审批阈值/封面]；发货：[快递公司/物流单号]；详情：[原下单备注/取消原因] + [下单时商品编号/名称/图片/积分]。
- 工伤现有表单：[员工选择/事发部门选择] → [发生时间/地点/经过]；详情：[事发部门/结案时间/结案原因]。结案时间由结案动作记录，重复结案不刷新；编辑先加载完整详情。
- 证据：[选择并上传文件/材料类型/备注] → [提交时文件名/受权下载]。上述布局沿用现有组件，未新增页面设计。

本次仍未执行 Maven、数据库或服务器操作；无构建产物需要清理。

2026-11-03 HR-D3 实现完成，待局部验证：商城按 sort_order、id 稳定排序；发货保存 express_company/express_no，取消写 cancel_reason 并保留下单 remark；订单明细在创建时保存 item_no/item_name/cover_image/point_price，详情直接读取该快照，沿用通用读取权限与脱敏。工伤填写事发部门、校验同租户有效部门和员工范围，编辑读取完整详情；结案记录真实 closed_at，重复结案不改时间/原因；普通表单不再写系统状态或结案原因，修改与发起认定加案件行锁并保留版本冲突检测。

证据入口统一为 POST /labor/disputes/{id}/evidence 的 multipart 文件上传，上传文件及证据记录在同一事务内完成，取消任意 fileId 绑定入口；后台保存上传时文件名，申诉升级从逐项授权后的 sys_file 元数据取名字快照。HrDisputeEvidenceService 校验案件范围、证据关联、同租户用途及来源申诉限制，前端通过 HR_DISPUTE_EVIDENCE 授权下载展示快照文件名，不再依据备注文字决定下载入口。平台代理已完成共享下载类型与 Auth 用途白名单。

计划验证：`mvn -pl cloudflow-service-hr -am -DskipTests compile`（等待 Root 分配共享构建时段），运行直接相关 HrSkillChecks、HrSettlementCalculationChecks、HrSettlementReservationChecks、HrRecruitmentContactChecks，补充批量招聘/工伤权限/字段快照检查；前端由 Root 统一类型检查。没有执行的数据库和运行检查仍记为待验证。

构建时段 4：2026-11-03 14:57，HR 及依赖共 23 个 Maven 模块 compile 成功，HR 编译 847 个 Java 源文件；仅有依赖原有弃用 API 和 javax.annotation.meta.When 警告。正在生成独立检查 classpath，运行检查尚未记为通过。

2026-11-03 14:59 构建时段 4 已释放：dependency:build-classpath 成功，输出 HR target/quality-hr-classpath.txt。首次命令受 PowerShell 点号参数解析影响，给 `-Dmdep.outputFile=target/quality-hr-classpath.txt` 加单引号后成功，没有代码失败。开始局部检查，临时 MySQL 仅绑定 127.0.0.1，采用新目录和当前 DDL，禁止复用系统 MySQL 数据；检查后停止和清理。
2026-11-03 局部验证第一批通过：新建独占 MySQL 127.0.0.1:13397，数据目录 .cloudflow-runtime/batch-e-mysql-fe354a50554a43ed8b213520fe29c6b7/data，PID 11412，当前 01/03 DDL 共192表导入成功，仅追加技能检查所需最小角色/报名菜单。HrSettlementCalculationChecks 111项、HrRecruitmentContactChecks 67项、HrFileDownloadBasicChecks 29项、HrSkillChecks 规则62项和真实 MySQL 135项通过。技能检查实际执行重构后的推荐 SQL、员工/租户范围、报名权限、三类证据失效和原有两个并发场景；没有启动 HTTP 或浏览器。新增运行入口 scripts/quality-checks/run-hr-quality-checks.ps1，产物 .cloudflow-runtime/quality-hr-20261103 暂留到本轮字段/权限检查完成；系统 MySQL 和服务器未操作。

## 2026-11-03 resume_hr 最终记录

代码范围为 D:\CloudFlowPro 当前未提交工作树，沿用上述基线，HR-01—13、HR-D1—D3、X01/X02 的 HR 部分均完成实施。2026-11-03 最后一轮独占 HR Maven `compile` 退出码 0，覆盖负责人父链、正式回调类型、真实流程实例字段、绩效待审状态、入职类型和批量工号查重；随后增加的回调空白实例拒绝已独立 javac 编译并运行，最终整合 Maven 构建由 Root 在源码冻结后执行，本记录不提前宣称其结果。

| 项目 | 最终实施状态与直接检查证据 | 验证边界 |
| --- | --- | --- |
| HR-01 | 已实现单条 SQL 判断同租户、同员工、同年度未完成更正；真实 MySQL 校验命中、其他员工/年份、完成状态、跨租户关联及单次 SQL | 保留预览及实际生成各自复核；未额外启动整轮工资生成 |
| HR-02 | 批次成员和员工范围批量授权；真实 MySQL 校验全可见、混合可见、全不可见、本人空批次/他人空批次、全范围及跨租户；详情复用已授权成员 | 本次不覆盖整轮批次发薪 |
| HR-03 | 技能缺口批量读取岗位/要求/等级/证据/可报名课程；规则62项与真实 MySQL 135项已通过，含员工和租户范围、证据失效、报名权限及既有两项并发检查 | 该结果保留前批原范围，续接没有重复执行 |
| HR-04 | 培训详情总计和明细来自同一轮实时聚合；真实 MySQL 校验无汇总、过期汇总及报名完成状态改变时的结果，每次只聚合一次、读详情不写汇总 | 未验证独立汇总重建任务调度 |
| HR-05 | 通用更新复用脱敏前后快照，真实 Spring 审计切面和 MySQL 同时写入 HR/Common 两套审计；普通订单更新仅读取业务行2次，隐藏值变化保留字段名，两套记录均无原始电话 | 覆盖直接更新路径；其他专用权限查询不计入这2次 |
| HR-06 | 实体字段元数据缓存和已具备目标类型的直接赋值完成；真实更新及显式 null 清空通过 | 未扩大为所有实体全字段矩阵 |
| HR-07 | 使用明确薪资 Payload；手填薪级与金额时不查员工/岗位/薪级，真实 MySQL 验证三类读取均为0，手填金额保持 | 缺默认配置仍沿既有可选规则，未额外构造全部缺省组合 |
| HR-08 | 招聘列表去重后批量补充需求、岗位、部门；真实 MySQL 检查共享需求的列表、查询次数、跨租户与无权关联隐藏、敏感字段脱敏 | 未进行招聘页面浏览器验收 |
| HR-09 | 前后端统一 requisitionNo/requisitionId/expectedArrivalDate/requirements，Offer 自身 expireDate 保留；后端列表检查通过 | 前端统一类型及构建结论由 Root 汇总；本记录不计浏览器操作通过 |
| HR-10 | 自动解析、人工修改和前端 API 统一技能数组；真实 MySQL 校验自动解析、编辑、空数组、拒绝字符串与空技能、跨租户拒绝 | 未启动简历页面浏览器 |
| HR-11 | 删除无国家码旧电话的静默兜底，保留电话规范化、历史联系方式身份占位与锁；招聘联系方式67项通过 | 延续该批检查原范围，未重新全套执行 |
| HR-12 | 同一次请假提交复用逐日结果；真实 MySQL 提交0.67小时，跨周期分配0.33/0.34，每个日期含前一天夜班回看均计算1次 | 外部规则、逐日计算器和流程发送为测试替身；未验证 Redis 锁和日历实现 |
| HR-13 | 删除旧离职计算重载，检查显式提供核定月份选择；离职计算111项通过 | 未运行依赖 OA/Redis 的完整 HrSettlementReservationChecks；本次启动返回契约由 X02 直接检查覆盖 |
| HR-D1 | 工伤四类子记录统一父案授权，删掉冗余员工字段；真实 MySQL 校验新增/读取/修改和赔付涉及的父案员工范围、跨租户、不可见父案 | 事发部门只记录事实，保留员工范围作为授权依据 |
| HR-D2 | 360评分响应仅通过 evaluatorId 关联目标、受评人和评分来源；真实提交、邀请状态更新、聚合得分和跨租户隔离通过 | 未启动360评分页面 |
| HR-D3 | 商城排序、下单商品编号/图片/积分快照、快递公司与取消原因；工伤事发部门和结案时间；证据实际上传、文件名快照与受权下载均已实现并通过局部 MySQL/实际文件检查 | 工伤、商城和证据新实现保留；未声明全项端到端验收 |
| X01 HR | 借款负责人按 leader_user_id 查找，当前部门无人有效则逐级向上；同租户/有效用户/本人排除/真实审批权限/父链环路均检查；真实 MyBatis 和权限关联 SQL 的11类分支通过。创建 DTO 改 leaderUserId，查询 VO 提供 leaderUserId/leaderName | 当前 D 的 HrOfferMapper 无部门负责人查询；录用继续冻结 admin 角色审核人，不额外改成部门负责人流程 |
| X02 HR | WorkflowServiceClient 只接受 R<ProcessStartResult>，读取 requireInstanceId；失败、缺响应、空白/65字符/控制字符实例拒绝均通过。回调正式类型、真实实例绑定、租户隔离、绩效两阶段状态及重复业务动作检查通过 | 尚未进行跨进程 HTTP 发起/消费链路验证 |

运行入口为 `scripts/quality-checks/run-hr-quality-checks.ps1`，新增 `QualityGroup` 支持 `leave-resume`、`performance-workflow`、`leadership-callback`，逐组日志文件名独立保留，防止后运行组覆盖前组结果。`HrQualityDatabaseChecks` 分批通过数为103、22、21，最终 `leadership-callback` 为50；各批共享前置与回滚断言，不能相加宣称独立业务场景总数。扩充 `all` 入口后未重新运行全部组，避免重复已通过检查。

负责人和回调最终50项包含：部门负责人为空、停用用户、删除用户、申请人本人、跨租户用户、缺真实审批权限、停用部门向上查找，以及整链无人、部门环路和跨租户父部门拒绝；回调正确实例更新、错误实例与空白实例拒绝、租户恢复、HR_RECRUITMENT/HR_COMP_CHANGE/HR_LIFECYCLE 正式路由、绩效 PLAN_APPROVING/RESULT_APPROVING 各自匹配 planProcessInstanceId/resultProcessInstanceId、工伤 DETERMINING 和继任 IN_PROGRESS、重复回调不重复业务更新/通知。通知发送为计数替身，状态更新、审计及 wf_callback_side_effect 标记使用真实 MySQL。

入职流程发起和请求校验统一为 `HR_LIFECYCLE`，申请 `type` 和明细 `detail_type` 继续使用 `ONBOARDING`；录用发送、回调与登记保持 `OFFER`。回调目标全部明确实例字段，移除按前缀及旧裸名猜业务类型；业务动作标记保留正式业务类型。入职待处理工号检查一次批量读取明细，仍排除当前申请并沿用每份申请最小明细 ID 的既有语义。Root 已逐 SQL 核对种子及生成器，没有工作流业务类型 `ONBOARDING` 需要改名；Workflow 代理负责登记工伤/继任待审批状态，其检查另见 Workflow 文档。

失败与修正记录：首次扩展数据库检查因旧 `quality-hr-classpath.txt` 指向 C 盘依赖缓存，缺少 `org/picocontainer/ComponentFactory` 中断；改用新 `quality-hr-final-classpath.txt` 并由 Maven 重新生成依赖后通过，不能把该次失败记为业务失败。新增负责人检查首次因测试用 sys_user_role 漏填 tenant_id，关联落到默认租户导致无有效审批人；补齐测试数据租户后49项通过，之后增加空白回调实例校验，最终50项通过。当前业务源码均使用显式 Java 类型，定向 diff 空白检查通过。

验证与清理交接：复用本轮独占127.0.0.1:13397；除最初01/03之外，最终回调组只从当前02 SQL提取创建 wf_callback_side_effect 表，未执行整份02重建。测试业务、审计和权限数据全部事务回滚；实际证据文件亦由事务回滚清除。临时 MySQL 进程、数据库目录、检查输出与构建产物交由 Root 在整合验收完成后统一记录磁盘空间并清理，当前仍供其他代理检查使用，因此本代理未停止或删除。清理后历史证据以本文和总协调记录为准，原始产物路径不要求长期保留；未执行 HTTP、浏览器或全项回归，不将编译/基本检查计作全项验收。
