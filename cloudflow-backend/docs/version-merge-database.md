# 数据库与种子版本合并记录

## 修改前决策

基于共同基线 f576fd1a，对照远程 dev e0b9e7d2 与已验收审计 a108298d 的逐项差异，保留远程新增业务表、字段、数据生成辅助函数及成套业务样例，不整文件择一。独占 DB 与 generate-demo-seed.ps1，不运行数据库、构建或 Git 索引操作。

- 远程已用 sys_message_* 替代旧工作流通知表，保留旧 wf_notice / wf_notification_log / wf_notification_config 的删除，不恢复审计旧基线的三表和种子。wf_form_definition 新版实体实际使用 version_lock，保留唯一 version_lock；wf_process_definition 仍使用 lock_version，继续删除重复 version_lock。附件 uploader_name 保留新版 VARCHAR(100)。
- 费用标准保留 standard_id / position_level / 具体 city / PER_ITEM、DAILY、MONTHLY、YEARLY，城市列采用审计 VARCHAR(100) 与非空限额类型；招聘来源保留独立分类、channel_id 可空，同时保留新版邮箱 254 字符。会议出席保留新版实际使用的 meeting_id、schedule_event_id、邀请应答字段及可空 minutes_id。
- 生成器合并远程新增完整业务规则与审计已完成历史事件、安全 IP、数组形状规则；远程已有真实结构化业务样例时保留其合法形状，缺少真实附件的列不伪造上传文件。07 由最终合并生成器重新生成并与远程新增表/业务片段逐项核对；06 精确处理冲突和旧字段引用。

## 实施结果

数据库与生成器范围的冲突标记已全部消除，未执行 Git 暂存或提交；合并状态由主代理统一处理。

- 保留远程全部 374 张表。远程 6,958 个列定义合并后为 6,948 个：删除 sys_role.data_scope、wf_process_definition.version_lock、wf_deploy_rollback_history.success、4 张工伤子表 employee_id、hr_perf_evaluator_response 的 objective_id / evaluatee_id / evaluator_source，共 10 个；sys_dept.leader 等量替换为 leader_user_id。除此以外无远程字段删除。
- 依据新版实际用途保留 wf_form_definition.version_lock、wf_urge_effect.effect_id / urge_id / effectiveness，以及会议邀请使用的 meeting_id / schedule_event_id / acceptance_status / response_time / invitation_version 和可空 minutes_id。原审计基于旧版本的同名字段结论不覆盖这些新用途。
- 保留来源独立、渠道可空；来源注释继续登记 WEBSITE / REFERRAL / HEADHUNTER / CAMPUS，避免生成器失去合法分类。费用标准的具体城市和 PER_ITEM / DAILY / MONTHLY / YEARLY 均保留，新版职级样例及实际城市样例保持。
- 合并新版 JSON、HR、平台规则和外部辅助生成模块；28 项数组契约放在明确业务样例之后、通用类型生成之前。3 类 HR 附件改为空数组；保留新版工资条结构等有效样例。流程模型与流程模板均使用标准 nodes / edges，启动权限显式 ALL 与 []。
- Outbox 样例保留新版 CUSTOMER 关联和统一 event_id，载荷中的 eventId / sourceId 与列值一致，状态固定 PUBLISHED；事务消息保留新版 HR_CONTRACT_RENEW 与合同关联，状态固定 SUCCESS，错误与重试计划清空，时间为历史值。保留新版黑名单跳过管理员的直接规则，撤去旧审计重复设置首行 INACTIVE 的补丁；IP 使用 192.0.2.1–192.0.2.50 与 EXACT。
- 06 只精确解决冲突及审计字段/数据修正；新版统一消息中心已经替代的 3 张旧通知表及其 INSERT 没有恢复。07 由最终生成器完整重生成，没有按整文件选择任何一方。

## 静态验证

| 检查 | 本次结果 |
| --- | --- |
| PowerShell 语法与完整生成 | 通过；生成器主体 314 张表，加辅助补齐 60 张，最终覆盖 374 张表 |
| schema / relationships | 374 表、1,216 个已分类关系、0 个未分类关系；leader_user_id 正确关联 sys_user |
| 06 INSERT 列名及参数数量 | 1,237 条语句、238 张业务表、4,792 组 VALUES 或 SELECT 表达式，0 项不匹配 |
| 07 INSERT 列名及参数数量 | 409 条语句、374 张业务表、478 组 VALUES 或 SELECT 表达式，0 项不匹配 |
| 远程数据完整性 | 06 的 238 张插入表与 50 个命名段边界、07 的 374 张插入表与 10 个命名段边界均保留 |
| 数组与基础设施样例 | 28 个数组列形状符合；06 的 22 条消息样例与 07 的 2 组消息表达式全部为 PUBLISHED / SUCCESS |
| 流程及事件专项 | 标准流程图、ALL / []、eventId / sourceId 一致、IP 与 EXACT 匹配，均通过 |
| 冲突标记 / git diff --check | DB 与生成器范围内通过 |

检查过程首次报告 crm_campaign_log.archive_checksum 未知，定位为检查脚本未识别既有 BINARY(32) 类型；补齐检查器类型后通过，未修改该业务表。上述数量为静态 SQL 表达式数量，不等同数据库实际插入行数。本分工未运行数据库、服务构建或服务器操作，历史审计运行结果不代表合并后的运行结果。

本范围没有未解决的结构冲突；已通知业务代理核实工伤/绩效删除字段在新版调用中的一致性。跨模块构建及必要运行检查由主代理统一完成。


最终 07 文件：4639187 字节，SHA-256 `d26da66af46970ff4c1ffadd0ca5d956634a96cb640513f3020627a1e6359302`。

临时产物：已删除本分工独立生成的临时 SQL 副本（4639187 字节）；清理前 C 盘可用 54207479808 字节、清理后 54212120576 字节，同盘存在其他工作，不将空间差值归为本项目释放量。静态检查源码暂留系统临时目录供主代理本次验收复用，不作为长期证据；受版本控制的最终 SQL 保留。


## HR 业务类型统一后的只读复核

主代理开始隔离数据库导入后，仅检查未修改 06 / 07 / 生成器，也未重生成。对 INSERT 的目标列与 VALUES / SELECT 表达式逐列对应，再搜索生成器及 demo_seed_* 辅助脚本：流程 business_type / biz_type / JSON businessType 使用旧 OFFER 或 ONBOARDING 的命中均为 0，无需为本次 HR_OFFER / HR_LIFECYCLE 统一再修改 SQL。

保留的同名字面量均有独立业务意义：06:3226 为候选人状态字典 OFFER，06:3326 为生命周期类型字典 ONBOARDING；06:11430 为候选人 status=OFFER，06:11441 / 11447 为入职申请 type / 明细 detail_type=ONBOARDING，06:11968–11971 为员工文件 document_type=OFFER。07:563 / 595 / 631 / 633 / 635 分别生成候选人状态、员工文件类别、生命周期申请类型、明细类型和任务类型，均应保留。

06:9536 的 offer_101 与 06:9540 的 onboard_5011 是历史演示实例的 business_key 文本；没有将 OFFER / ONBOARDING 写为 business_type。流程名称、流程键 offer_approval / onboarding_approval 和模板标识继续有效。生成器中业务消息采用 HR_CONTRACT_RENEW；reconcile_match 按业务表和实例字段生成关联检查，不依赖 OFFER 旧常量，因此本次常量统一不要求重新生成种子。
