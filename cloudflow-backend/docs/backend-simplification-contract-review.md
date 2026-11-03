# 字段统一独立复核

复核范围：D01—D05、S01、S03 的读写链路与业务边界；不改数据库初始化脚本，不并发执行构建。测试数据全量重建，候选人来源独立、渠道可选的约定保持。

## 发现与处理

| 编号 | 证据与影响 | 决策 | 当前状态 |
| --- | --- | --- | --- |
| R03 | `WorkflowDesign.parseWorkflowGraph` 已拒绝旧别名，但只检查字段形状；`WorkflowBuilder.replaceGraphState` 在节点/连线完整性校验失败后替换成默认图，再经 onChange 和自动保存写回，可能覆盖损坏流程的原内容 | 页面加载入口执行已有完整性校验，沿现有错误页面返回错误；移除编辑器静默默认替换。新建流程仍由 createDefaultWorkflow 创建 | 类型检查/构建通过，待页面加载验收 |
| R04 | ExportServiceImpl 在 workflow 标准字段之外，把 processKey、formId、startPermissionType、startPermissionValue、deptId 再写入 metadata；全项目未找到读取这些 metadata 键的调用方，导入已使用标准字段 | 删除 5 个重复输出项，保留创建时间、更新时间、创建人和状态 | 统一 Workflow install 通过 |

## 已核查链路

- D02：部门负责人写入校验同租户有效用户，名称批量补齐；流程分配、超时转交和监控转交读取负责人编号。负责人为空允许清空，未发现其他局部 updateById 误清空路径。
- D03/D01：招聘读写使用统一字段，余下 requestNo/expectedDate 属于其他业务；独立 source 与可选 channelId 保留。Offer 转入职日期按 LocalDate 转换；网页与事件日期精度保持已实施约定。
- D04/S03：保存、发布、导入、运行权限共用编号数组规则，覆盖导入 ALL 清空旧限制；跨租户校验仍保留。模板、图解析和导出旧字段拒绝链路已核查。前端审批人缓存按当前用户与租户隔离。图形状拒绝已存在，R03 为进一步确认的损坏拓扑静默替换问题。
- D05/S01：HR 业务启动、回调、撤销按正式常量匹配；绩效计划与结果分别匹配实例和审批阶段，生命周期子类读记录类型。租户状态读取固定 data.available，远端异常沿现有放行策略且不缓存。本次未扩大既有招聘/假勤/绩效提交业务能力。

## 验证约定

本复核代理只执行只读搜索及差异检查，Maven/npm 由主代理统一串行运行；不能将此前 12:26 构建成功标记为本次修改已通过。R03 至少验证前端 type-check/build，并检查损坏图加载显示错误、新建和正常图加载仍可用。R04 纳入 Workflow 模块统一验证。

R03 实施：`WorkflowDesign` 在加载期间调用既有 `assertWorkflowGraphIntegrity`；失败由现有 catch 设置错误页。`WorkflowBuilder` 直接接收已校验的图，删除重复解析及完整性失败后的默认图替换分支；无 workflow 的独立新建默认值保留。未增加第二套校验或错误状态。

R04 实施：只删除 metadata 的 5 次重复写入，workflow 的对应标准字段及校验和计算保留。该输出精简不添加镜像实现测试，交统一 Workflow 构建验证。

只读检查结果：上述 3 个源码文件 `git diff --check` 通过；搜索确认 Builder 内 resolveGraphModel/fallbackToDefault 均已删除，导出 5 个标准 setter 仍保留，metadata 只保留 4 个独立键，ImportServiceImpl 仅读标准字段。尚未运行页面交互或构建，不标记运行验收通过。

主代理统一验证补记（2026-11-02）：已读取 `%TEMP%/cloudflow-frontend-types.log`、`cloudflow-frontend-build.log`、`cloudflow-final-workflow-install.log`；12:54 前端类型检查无报错，12:55 前端构建成功，12:55:11 Workflow install 显示 BUILD SUCCESS。3 个源码文件最后修改时间分别为 12:50:17/12:50:17/12:50:40，验证覆盖本次改动。本代理没有重复构建；页面交互尚无独立验收结果。
