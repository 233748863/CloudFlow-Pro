# 工作流数据库结构偏差修复

承接 D02/DB01 续审决策。保留原有独立业务字段；测试数据全量重建，不做旧结构迁移。费用标准由其他分工处理。本分工不运行 Maven/npm、不操作服务器。

| 项目 | 证据与决定 | 当前状态 |
| --- | --- | --- |
| 附件 | 上传服务使用 fileUrl/uploaderId/uploaderName；地址及用户编号精确映射现有 file_path/upload_user_id，补上传时姓名快照 uploader_name | 统一构建及隔离/正式库初始化通过 |
| 通知日志/配置 | notification_type现有值为INTERNAL/SMS/EMAIL，映射notifyChannel；eventType是独立事件类型，补event_type。status/errorMsg/sentTime映射已有列；配置名称保留并映射 | 统一构建及隔离/正式库初始化通过 |
| 发布影响/回滚 | suggestion/createdTime映射mitigation_plan/create_time，原生查询显式映射。rollback_status支持三态，success是无读写布尔副本 | 统一构建及隔离/正式库初始化通过 |
| 催办效果 | 未接入recordUrgeEffect无调用者，写入另一套不存在字段且伪造当前时间；删除未接入错误写入及专用等级算法，实体统一现存汇总模型 | 已移除，统一构建通过 |

## 验证

后续记录完整字段映射及初始化列/值验证，主代理统一执行工作流模块 verify 和隔离空库导入。

> 主代理第二次隔离导入快照已捕捉02删除success，但06未同步：06第8944行 Unknown column success。这次等待你完整同步06/07并记录“可验收”后重跑，不在修改中途取快照。前一次四类工伤修复已完成。

## 完成与静态验证

- 已承接前代理落盘的附件、通知、发布实体/XML/02结构修改；补齐全部06通知日志（20条记录）的事件类型，按现有通知标题区分任务创建/超时/完成、流程归档/恢复/回滚/发布；两个回滚历史样例同步删除success值。所有新增事件列均有明确值。
- 07仅替换本分工六张表的INSERT语句，保留其他代理的费用标准、部门和图格式修改。生成器增加通知渠道/事件/发送状态、回滚状态及附件上传姓名的明确规则。已成功生成244张表到工作区外临时文件。
- 催办效果实体统一id、tenantId、taskId、urgeCount、firstUrgeTime、lastUrgeTime、taskCompleteTime、responseSeconds；全仓搜索确认recordUrgeEffect只有声明和实现，无调用者，删除该接口方法及其字典等级计算。数据库汇总指标和历史记录保留，未虚构新的催办业务。
- 发布影响createdTime映射create_time；移除原自动填充标记，公共填充器只处理createTime、不处理createdTime，空值应由数据库CURRENT_TIMESTAMP默认值生成，避免强行插入NULL覆盖默认值。
- 静态核对六个实体63个持久化字段，均映射到实际建表列；06/07共1291条永久表INSERT列清单均存在于最终建表；本分工六表每条VALUES行/SELECT表达式数量与列数一致；所有通知日志INSERT包含event_type，回滚样例均不再引用success。
- 刷新database-field-inventory.csv，包含费用标准分工最终结构：244张表、4057列，保留原逐列用途备注并更新本分工及费用标准映射。

本分工未执行Maven/npm或数据库命令。待主代理执行：`mvn -B -ntp -f cloudflow-backend/pom.xml -pl cloudflow-service-workflow -am verify`，以及独立空库按01—07顺序完整导入。代码/SQL已就绪，后续不再修改。

## 主代理统一验证结果

2026-11-02 全后端 install 成功；独立复核修复后 HR verify、Workflow install 与 Auth verify 通过。当前45个测试无失败/错误/跳过，前端 type-check/build 通过；01—07已在隔离库和正式项目库成功导入。阶段记录中的待构建项已完成，页面交互和未接入业务能力不包含在构建通过结论内，最终运行结果以主审计文档为准。
