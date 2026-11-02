# 部门负责人统一与数据库字段审计

## 执行状态

| 项目 | 状态 | 验收目标 |
| --- | --- | --- |
| D02 | 代码、统一构建及正式库校验通过 | 部门负责人只存同租户用户编号，名称实时展示；流程指派、监控、人事客户端、通讯录、页面与初始化数据统一 |
| DB01 | 全列审计及已确认字段改造完成，244表4057列正式库校验通过 | 对疑似兼容字段给出真实读写与业务证据，明确保留、删除或待确认 |

## D02 已确认事实

当前 sys_dept.leader 为 VARCHAR(20)，自由文本被流程三处分别猜测为编号、账号或昵称；部门编辑页允许自由输入，种子数据同时包含账号和姓名。改为 leader_user_id BIGINT NULL；leaderName 仅为响应展示字段，不新增数据库名称列。未配置负责人时原有 manager/上级部门处理策略保留，不在字段统一时改变审批策略。

## DB01 已确认决策

- 用户确认候选人允许独立填写来源、具体渠道可选：保留 hr_candidate.source 与 channel_id。
- hr_mall_order_item.item_name / point_price 记录下单时商品名称与价格：保留历史业务事实。
- 绩效评价响应的 objective_id / evaluatee_id / evaluator_source 经下文读写核查后删除，保留评估关系主表及有效关联索引。

## DB01 删除决策：绩效响应的重复关系字段

已检查 HrPerformance360ServiceImpl、HrPerfEvaluatorMapper.xml、实体/Mapper、接口及前端 360 评估面板。objective_id / evaluatee_id / evaluator_source 仅在响应新增时从评估关系复制；响应查询只按 tenant_id + evaluator_id 读取，列表和汇总已经通过 evaluator_id = hr_perf_evaluator.id 关联，筛选、权限及聚合使用主表对应字段，未读取响应中的三列。三列不是历史快照来源，删除不改变当前评分结果。同步删除 idx_hr_perf_response_obj，保留 tenant_id + evaluator_id 唯一索引。状态：已完成，构建与正式库校验通过。

## DB01 删除决策：会议出席与工伤调查

- oa_meeting_attendance.meeting_id：所有读取和去重均使用 minutes_id（会议纪要编号）+ user_id，页面新增也只提交 minutesId；会议编号已在 oa_meeting_minutes.meeting_id 保存。该副本无筛选、汇总或索引用途，删除实体、接口与建表中的副本。
- hr_work_injury_investigation.employee_id：虽然注释称“便于数据权限”，实际实体、输入、输出均没有 employeeId，新增也没有填写该 NOT NULL 列；读取使用 tenant_id + injury_id，当前工程没有针对该表 employee_id 的权限配置、查询或报表。员工归属仍保留在 hr_work_injury.employee_id。删除调查表副本及 idx_hr_work_injury_inv_emp，同时消除真实创建的必填列缺值问题。

上述删除均同步 07 演示数据；生成器从最终表定义取列，无存量迁移。状态：代码/SQL修改完成，等待完整构建及空库验证。

> 主代理调度：请读取 backend-simplification-coordination.md；MESSAGE 内容丢失，后续 Maven/npm 构建及依赖安装由主代理统一串行执行，请勿自行启动。继续改造，待验证命令写入本文件。

同一核查继续覆盖工伤医疗、赔偿、康复子表：hr_work_injury_treatment / compensation / rehabilitation 的 employee_id 也均为 NOT NULL，却没有任何实体、表单输入、服务写入或员工筛选映射。四类子记录都以 injury_id 归属工伤主记录，员工通过主记录确定；将三张同类子表的 employee_id 与专用索引一起删除，避免同一问题遗漏。其他“未映射字段”只作后续用途核对，未因文本搜索缺失直接删除。

D02 阶段验证：主代理执行的 auth + OA 模块 test 构建成功（临时日志 cloudflow-c08-c09-build.log）；其中 SysDeptLeaderServiceTest 两例通过，覆盖同租户有效用户、允许清空、跨租户拒绝及共享负责人一次读取。前端 type-check 首次未执行成功：工作区尚未安装依赖，缺少 tsc；需安装依赖后再验。

> 主代理发现：07 开头与 scripts/generate-demo-seed.ps1 第709—716行有 oa_meeting_minutes.room_id/schedule_event_id 条件补列兼容，而04已定义两列。请纳入DB01删除这段初始化旧结构兼容，先生成器再重新生成07（协调其他seed字段变更），确认不覆盖其他分工修复。

## DB01 删除决策：重复版本锁

wf_process_definition / wf_form_definition 同时存在 lock_version 和 version_lock；实体属性 versionLock 上的 @TableField("lock_version") 与 @Version 明确只使用 lock_version，代码和 SQL 查询没有 version_lock 读取。保留业务 version 与并发更新用 lock_version，删除两张表中的 version_lock 及演示种子对应列。两种“版本”保留独立职责，不误删业务发布版本。

## 全表扫描覆盖

本轮从 01—05 建表语句提取 244 张表、4057 列（费用标准与工作流结构统一后的最终结构），逐列记录类型、注释及实体持久化字段映射，见 [database-field-inventory.csv](database-field-inventory.csv)。排除 @TableField(exist=false) 响应字段，解析继承字段和自定义列名；无实体映射仅作为线索，结合原生 SQL、通用 CRUD、接口和页面检查后再决策。

| 初始化模块 | 表数 | 列数 |
| --- | ---: | ---: |
| 01.cloudflow-common.sql | 32 | 418 |
| 02.cloudflow-workflow.sql | 46 | 626 |
| 03.cloudflow-hr.sql | 86 | 1400 |
| 04.cloudflow-oa.sql | 63 | 1227 |
| 05.cloudflow-crm.sql | 17 | 386 |

### 保留的业务字段组

| 字段组 | 决策依据 | 结论 |
| --- | --- | --- |
| tenant_id / deleted / version、创建更新审计字段 | 租户拦截、软删除、并发更新和自动填充；无显式 getter 调用不等于无用途 | 保留 |
| 商品下单、合同供应商、领用出入库、印章证照、CRM报价的名称/价格/联系人副本 | 记录业务发生时的信息，当前写入、展示及审计调用仍使用；商品和关联主档变更不应重写历史 | 保留 |
| hr_headcount / hr_schedule_assignment.target_name | 当前前端选择对象时写入，通用 CRUD 持久化，列表优先显示；部门、岗位和人员共用多态目标，删除会改变历史名称展示 | 保留 |
| hr_interview.interviewer_names、生命周期申请 name、绩效承接 assignee_name、评估人姓名 | 当前表单/业务写入和响应仍使用，属于事件当时人员名称记录 | 保留 |
| sys_user_blacklist.user_name | 当前按用户名关键字筛选并用于名单展示；与用户编号的拦截用途不同 | 保留 |
| 人才业绩快照、人才池成员历史、字典/知识库/流程版本、同意文档快照、审计前后数据 | 当前回溯、复核和版本功能的业务事实 | 保留 |
| 存储用 JSON 与普通字段同时存在 | 表单定义/实例、通知/Outbox 载荷和索引字段承载不同读写路径，不能仅因值可互相推导而删除 | 保留 |

## DB01 删除决策：旧角色数据权限编码

sys_role.data_scope 仍保存旧 1—4 编码；当前 SysRole、UserDataScopeService.calculateSnapshot/resolveDeptIds、角色编辑接口及前端只使用 ds_type（0全部、1自定义、2本级及下级、3本级、4本人）与 ds_scope。旧字段没有运行期读写，且旧 3 与当前 3 含义也不同。删除 data_scope 及 06/07/生成器中的旧值，保留当前权限范围计算，不改变用户授权。

## DB01 已确认映射修正

sys_role_mutex.role_id_1 / role_id_2 具有独立的互斥角色业务用途和唯一索引，保留。Java roleId1/roleId2 的默认下划线映射会生成 role_id1/role_id2，已补充两处精确 @TableField 映射，不新增兼容列。

## DB01 需要独立处理的既有结构偏差

这些是当前实体与初始化结构不一致，不能把数据库一侧列名直接判为多余。下表保留字段级并排证据；本次未据此补充兼容字段，重建前应由主代理统一当前业务模型后处理。

| 表 | 当前业务代码/页面字段 | 当前建表字段 | 审计结论 |
| --- | --- | --- | --- |
| oa_expense_standard | standard_id、position_level、city、limit_type；城市自由文本；PER_ITEM/DAILY/MONTHLY/YEARLY | id、job_level、city_tier、limit_period；额外必填 standard_code/standard_name，limit_currency | 两套费用标准含义不完全相同；城市名称与城市等级、按单笔和累计周期需要业务选择；不能当简单别名删除 |
| wf_task_attachment | file_url、uploader_id、uploader_name | file_path、upload_user_id，无 uploader_name | 附件保存和读取结构未统一，当前实体会引用不存在列；均有附件业务用途 |
| wf_notification_log | event_type、notify_channel、status、error_msg、sent_time | notification_type、send_status、error_message、send_time、related_type/related_id | 通知事件与渠道属于不同概念，需整体统一提供/消费端及数据结构 |
| wf_notification_config | 无 config_name 属性 | config_name NOT NULL | 当前通知服务仅读取配置，无公开创建路径；名称为独立配置标识，补实体映射并保留 |
| wf_urge_effect | effect_id、urge_id、before_duration、after_duration、effectiveness、urge_time、complete_time | id、urge_count、first_urge_time、last_urge_time、task_complete_time、response_seconds | 两种催办效果模型不同，需依据当前页面/服务统一；本轮未擅自删业务指标 |
| wf_deploy_impact | suggestion、created_time | mitigation_plan、create_time | 处理建议与创建时间的命名不一致；当前查询可漏展示，通用写入可报未知列 |
| wf_deploy_rollback_history | rollback_status | success；两列同时存在 | 当前回滚状态有 SUCCESS/FAILED/PARTIAL，success 未映射；保留当前状态表达，布尔副本列入待确认淘汰项 |

其他没有实体映射但具有独立含义的字段：商城订单快递公司/取消原因、商品排序、订单商品编号/封面快照、工伤关闭时间/部门、仲裁与福利备注、证据文件名称/链接、油耗、合同模板使用次数。部分处于未接入状态；缺少读写不能证明它们源自兼容，已保留并记录。sys_user.avatar 由其他服务原生 SQL 读取，属于有效业务字段。含 tenant_id 的基础设施表即使实体未声明，也继续保留租户隔离。

## 阶段验证补记

生成器 ValidateOnly 成功解析全部 244 张表；向工作区外临时文件完整生成演示数据成功。核对本代理涉及的 10 张表，当前 07 的列列表与生成器输出全部一致。此验证只证明初始化结构与生成表达式一致，数据库实际执行结果由主代理的隔离空库验收记录。

> 主代理空库验收首次失败：06.cloudflow-business-seed.sql 第12651行仍插入已删的工伤 employee_id。请排查06所有受影响字段并修复列和值；验证日志 TEMP/cloudflow-db-audit.log。01—05已成功初始化244表，正式项目库未改。

前端依赖安装后重跑 type-check，仅 WorkflowSettingsModal.tsx:205 的 loadingBlockClassName 未定义失败，已通知该文件负责代理；组织部门页面和接口改动没有类型错误。新增 DeptManagerAssignStrategyTest 验证负责人按用户编号一次查询、带租户和有效状态条件、无需猜测姓名与查询角色，等待主代理统一 Maven 构建。

## 本代理交付边界

已删除 11 列：绩效响应重复关系 3 列、会议出席冗余会议编号 1 列、工伤四类子表重复员工编号 4 列、流程/表单重复版本锁 2 列、旧角色权限编码 1 列；同步删除无用途索引、实体复制与种子字段。部门 leader 列替换为 leader_user_id，leaderName 不落库。所有操作均为本地源代码、SQL、文档修改，未操作服务器数据库。

代码字段与建表整体偏差、保留的未接入独立字段、完整数据库执行与运行验收仍由主代理统筹，不在本报告中标为全部完成。

### 空库验收修正

已修复 06 第 12651 行起四条工伤子表多行 INSERT：同步删除列清单及每行第 4 个 employee_id 值。此前仅核对 07，遗漏了 06 多行样例，首轮数据库导入因此失败。此次额外核对 06/07 全部永久表 INSERT 列清单，共 1291 条，全部列均存在于最终 01—05 定义中；工伤四条多行 INSERT 每行值数与列数一致。等待主代理重跑隔离空库导入。

> 主代理已向用户询问费用标准业务选择：沿用当前页面“具体城市＋每笔/天/月/年”，或改按城市等级和库规则；等待答复。费用标准暂不改，其他可查清偏差继续处理。

> 费用标准用户已确认沿用当前页面，独立代理 expense_schema 处理；你继续处理其他工作流结构偏差，不改费用标准。主代理协调记录 backend-simplification-coordination.md。

## 工作流结构统一决策（续审）

- 附件：fileUrl / uploaderId 精确映射已有 file_path / upload_user_id；补当前上传流程真实写入和接口展示的 uploader_name 快照。保留单一地址列与单一用户编号列。
- 通知：notifyChannel 映射 notification_type（现有值是 INTERNAL/SMS/EMAIL，属于渠道）；status/errorMsg/sentTime 精确映射 send_status/error_message/send_time。eventType 表示 WORKFLOW_ARCHIVE 等事件，与渠道独立，新增 event_type 并更新全部初始化数据。config_name 有独立配置名称含义，补实体属性；已更正此前“创建路径缺值”表述，实际当前仅查询配置。
- 发布：suggestion/createdTime 精确映射 mitigation_plan/create_time，原生 SELECT 显式结果映射；rollback_status 已表达 SUCCESS/FAILED/PARTIAL，success 布尔副本没有运行期读取，删除副本并同步种子，保留历史操作人名称。
- 催办：全仓确认 recordUrgeEffect 只有接口声明和实现，Controller/任务完成链路/前端均无调用；旧方法用当前时间同时伪造催办与完成时间，写入另一套不存在字段。删除该未接入写入方法、仅供其使用的等级计算和字典依赖；实体按现存任务催办汇总模型映射 id/次数/首次/末次/完成/响应秒数，保留所有数据库业务指标，不新增一套猜测指标。

状态：决策已记录，逐项改造与验证中；费用标准由独立代理处理。

## 最终结构验收

2026-11-02 主代理已完成全后端验证及 01—07 隔离库/正式库导入。最终 244 张表、4057 列；字段清单与真实 information_schema 一致，部门负责人均关联同租户有效用户。上述阶段待处理记录保留为过程证据，结构偏差已按工作流专项及费用标准专项完成统一；具体运行验收与已知业务缺口以主审计文档为准。
