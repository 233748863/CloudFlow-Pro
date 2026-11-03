# 已实施精简的独立复核

范围：C01—C13、S02；不改其他分工的数据契约或数据库结构，不自行运行 Maven/npm。

## R01 人事公共审计漏记（已修改，统一验证通过）

HrAuditSnapshot.data 是 Map。JaVers 对 Map 字段产生 MapChange，DefaultAuditLogHandle 只接受 ValueChange，更新数据被跳过；C05 复用后创建/删除的 businessId 前后保持一致，原先偶然留下的编号差异也消失。必须把 MapChange 的新增、删除、值修改转为字段审计，保持每个字段的前后值及公共审计元数据。现有测试只模拟 ICompareHandle，未覆盖实际日志处理器。

## R02 HR 测试依赖影响运行（已修改，统一验证通过）

为 HrTypedCrudServiceTest 的切面调用增加 test scope 的 javers-core/aspectjweaver 会覆盖传递运行依赖范围；HR 业务仍依赖公共审计实现，不能因测试引入而改变运行包。改为 HR 测试直接打开 AuditChangeScope 验证两次读取和共享内容；公共模块已单测 AuditAspect。删除两个测试专用直接声明，恢复公共审计的传递运行依赖。

## 初步核查

- C06 所有内部赋值来源已是实体字段或明确的 Long/String/Integer，显式 null 仍经 UpdateWrapper.set；继承字段和加密字段反射访问保留，没有依赖 Json 转换来完成必要类型变换的调用。
- C01 复用列表与原读取范围一致；未关闭工单的 NULL 状态按原 SQL NOT IN 语义排除，已回款及完成续约日期选择保留。
- C07 各用户角色沿角色表查询顺序组装，关联缺失仍不覆盖展示；租户拦截与用户主查询条件保留。
- C10 迁入用户已处于目标部门，合并源/目标及子部门后一次查用户能覆盖原范围，重复用户去重不会减少有效权限刷新。

修改和验证记录将在本文件回写，由主代理统一执行构建。

## 修改结果

R01：DefaultAuditLogHandle 支持 MapChange 的新增、删除、修改，字段名为 data.实际字段名，保留操作人、租户、高风险标记和旧日志写入失败策略。整份 JSON 差异改为每次审计计算一次，避免每个字段重复序列化与比较。新增 DefaultAuditLogHandleTest 使用真实 DataAuditor/Javers 比较，验证三类字段变动确实写入 Mapper，并检查前后值及元数据。

R02：HrTypedCrudServiceTest 直接打开 AuditChangeScope，仍验证正常修改两次读取、前后快照与 HR 域日志完全一致、显式 null、数字转换、系统字段限制和租户条件；不重复模拟公共切面。HR pom 删除 javers-core/aspectjweaver 两个 test scope 直接声明，恢复既有运行依赖来源。

## 其他复核结果

- C03 四组安全检查复用同一批定义，缺失定义/运行实例/外部依赖/租户与创建者权限检查均保留。
- C04 缓存的是只读审批步骤；enrichTaskStepInfo/buildAllStepsDetail 为任务创建各自展示数据，没有把处理人或任务状态写回共享步骤。
- C08 批量任务查询仍逐项校验项目归属与删除标记；删除后的项目同步保留去重。
- C09 根规则及原有节点顺序保留；无根列表先返回，避免把环形数据组装成循环对象后序列化。
- C11 统一密码方案与初始化口令校验契合；C12 明确缓存类型对应所有调用点；C13 事件编号来自发布者必填列，没有额外解析。
- S02 两种资源仍检查当前借出，删除只改变删除标志和更新审计字段，历史借用记录仍存在。
- 未为了空值、不可达坏类型或旧数据增加新的兜底路径；本复核新增修复集中在真实可复现的审计遗漏与运行依赖范围。

## 待主代理执行

`mvn -B -ntp -f cloudflow-backend/pom.xml -pl cloudflow-service-hr -am verify`（覆盖 common-audit 新增真实日志测试及 HR 测试与运行依赖治理），随后最终全量验证按主代理调度。本代理没有运行 Maven/npm，也未操作服务器。

## 主代理统一验证结果

2026-11-02 全后端 install 成功；独立复核修复后 HR verify、Workflow install 与 Auth verify 通过。当前45个测试无失败/错误/跳过，前端 type-check/build 通过；01—07已在隔离库和正式项目库成功导入。阶段记录中的待构建项已完成，页面交互和未接入业务能力不包含在构建通过结论内，最终运行结果以主审计文档为准。
