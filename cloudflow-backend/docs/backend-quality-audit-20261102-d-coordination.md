# D盘后端代码质量重新审计：协作约束

> 最新用户任务已切换：用户在审计完成后明确说“那就根据审计结果动手吧。”，已授权实施。以下只读条款仅记录上一阶段审计。所有被唤醒代理立即读取同目录 **backend-quality-refactor-20261102-d-coordination.md**，按里面的分工实际修改D盘代码、完成局部验证、逐项落实施记录；不再停在“审计结束无新任务”。d_platform_audit负责Auth/Gateway/Common，d_hr_audit负责HR，d_workflow_audit负责Workflow，均有明确待实施项。

唯一源码根目录：`D:\CloudFlowPro`。审计版本：`e0b9e7d27b7690e5eac5f3c02be55b59a52924bf`，初始工作区干净。本轮重新审计该版本，不拉取远程、不合并桌面成果、不改业务代码/SQL/配置、不构建、不操作服务器、不提交推送；仅生成审计文档。所有命令必须显式workdir D:\CloudFlowPro或使用D盘绝对路径，禁止在默认C盘工作区分析替代文件。

用户范围：后端可简化的冗余防御、重复计算/查库/序列化、历史格式/字段兼容及数据库疑似兼容字段；现有均为可重建测试数据，不为保留旧数据保留兼容。业务安全所需租户、权限、事务、锁、并发版本、幂等、真实外部重试不能一概删除。已确认业务：招聘来源可独立填写、渠道可空；费用标准按具体城市，支持每笔/每天/每月/每年。仅审计并给报告，业务变更不实施。

所有发现必须引用本轮D盘路径和准确行号，追踪上下游调用/读写方与前端真实契约。每项写：等级与确定性、当前步骤/建议步骤并排、证据、资源或阅读成本、是否历史兼容、必要边界、验证方式；不将关键词命中等同问题，不编造耗时/节省比例。明确区分已确认可简化、待业务判断、应保留防护；必要时给反证。不要把桌面旧审计作为已验证事实，允许独立复核同一问题。

## 分工

- d_platform_audit：独占报告`backend-quality-audit-20261102-d-platform.md`，审查cloudflow-auth、cloudflow-gateway、cloudflow-common全部子模块及对应配置/数据库字段。重点新版消息/IM/门户/导入报表/任务、审计、缓存事件链路，也核查旧版批量查询等是否仍存在。业务源码只读。
- d_workflow_audit：独占报告`backend-quality-audit-20261102-d-workflow.md`，审查整个cloudflow-service-workflow，追踪节点模型/权限/通知与新消息/发布回滚/催办/事件/任务；核对其SQL字段是否真实用途，区别旧兼容与发布快照/并发锁。业务源码只读。
- d_hr_audit：独占报告`backend-quality-audit-20261102-d-hr.md`，审查整个cloudflow-service-hr，重点新版薪资/考勤/绩效/招聘/录用入职/通用CRUD/身份去重，历史数组/映射兜底和疑似重复列；与前端/Mapper/DB交叉核查。业务源码只读。
- 主代理：OA、CRM、全库结构与跨模块契约、新旧数据生成方式、全量静态覆盖清单、候选独立复核、汇总报告。其他代理允许只读跨模块链路，禁止改他人的报告。

每位代理记录审查方法、源码文件数量、已深入审阅的关键文件清单、未覆盖或无法确定的限制。全模块扫描不等于所有方法逐行验证，结论据证据分级。完成后停止并报告精确文件。消息可能为空：后续以本D盘协调文档新增段落为任务准绳。

## 主代理全库字段线索（供交叉复核）
已生成同目录fields.csv，覆盖374表6958列。自动映射仅为线索，不能直接删字段。请HR重点复核实体未直接出现：hr_mall_item.sort_order，hr_mall_order.item_count/express_company/cancel_reason，hr_mall_order_item.item_no/cover_image，hr_work_injury.dept_id/closed_at及4工伤子表employee_id，hr_dispute_evidence.file_name/file_url。Workflow复核wf_deploy_rollback_history.rollback_by_name/success，以及process version_lock与lock_version；平台复核sys_role.data_scope。OA主代理复核oa_contract_template.usage_count和会议meeting_id/schedule_event_id双写及COALESCE。库存/审批快照有真实语义时必须保留并写反证。

## 汇总阶段补充

请各代理先将已经核实的发现写入自己独占的报告，再补其余核查，避免消息正文丢失导致结果不可见。主代理会以报告文件读取结果，不以空正文消息等待。

跨模块启动结果：WfInstanceServiceImpl.java:1521-1526 的 buildStartResult 同写 instanceId、processInstanceId、processNo；WorkflowInnerController.java:31-41 直接委托同一启动实现。OA/CRM多处 extractInstanceId 同时接受 Map 两种键和任意标量，是内部契约兼容候选。请 workflow 报告覆盖生产端统一返回类型与旧键使用方；主代理报告覆盖消费方，汇总按一个问题计数。

## 最终交叉复核（仅收到复核任务的代理执行）

d_platform_audit：只读复核OA/CRM分报告OC08、OC09、OC13，检查逻辑删除判断、租户兜底和费用周期未计算是否有反证或遗漏。不得改报告，结果写入独占的`backend-quality-audit-20261102-d-platform-review.md`，最多一页，分“同意/需修正”，不扩展新审计、不构建。
d_hr_audit：只读复核OA/CRM分报告OC06、OC07、OC12，检查会议前后端字段不一致、双字段和参会人重复查询是否有反证。不得改他人报告，结果写入独占的`backend-quality-audit-20261102-d-hr-review.md`，最多一页，不扩展、不构建。
