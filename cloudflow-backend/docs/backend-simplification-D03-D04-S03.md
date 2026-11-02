# 招聘与流程数据格式统一实施记录

## 范围

现有数据为测试数据，全量重建；删除旧格式兼容，同步前后端、模板和初始化数据。候选人来源独立、招聘渠道可选，保留两个字段。保留工作区已有修改。

| 编号 | 改造目标 | 状态 |
| --- | --- | --- |
| D03 | 招聘统一 requisitionNo、requisitionId、expectedArrivalDate、requirements | 后端、前端构建通过，正式库重建通过 |
| D04 | 启动权限使用编号字符串数组 JSON 文本，角色使用编号 | 统一构建通过，正式库重建通过 |
| S03 | 流程图统一 title、source、target、condition，旧格式明确拒绝 | 统一构建通过，正式库重建通过 |

## 执行与验证

后续按单项记录修改、命令和真实结果。

### D03

已删除招聘需求、候选人和 Offer 响应及前端请求中的双向别名，页面与看板同步使用标准字段；Offer 过期日期一并统一数据库现有 expireDate。Offer 转入职直接读取 expectedArrivalDate，按日期类型转换，修复原 Map 序列化后直接强转 LocalDate 的问题。source/channelId 独立保留。

后端 `mvn -B -ntp -f cloudflow-backend/pom.xml -pl cloudflow-service-hr -am test` 成功（2026-11-02 11:46），包含 Offer 到岗日期转入职日期测试；初次测试 Mockito 的 Long 默认零导致测试走了已存在入职分支，修正 null 桩后通过。前端 `npm run type-check` 尚未执行成功，当前 node_modules 缺失，tsc 未安装，待统一安装依赖。

通信记录：子代理收到的上游 MESSAGE 载荷持续为空，暂按已授权任务范围推进；尚未自行安装前端依赖以免和其他代理并发安装。

> 主代理调度：请读取 backend-simplification-coordination.md；MESSAGE 内容丢失，后续 Maven/npm 构建及依赖安装由主代理统一串行执行，请勿自行启动。继续改造，待验证命令写入本文件。

### D04

启动权限读取删除逗号拆分、引号剥除和角色键匹配，仅接受编号字符串数组。新增 StartPermissionValues 统一保存、发布、导入和运行读取规则。导入覆盖完整同步权限，避免 ALL 覆盖时遗留原选择。两个前端入口改为同一编号多选组件，切换范围一次更新类型和空数组，修复旧入口连续两次局部更新覆盖前一结果的问题。

新增 2 个测试覆盖多编号匹配、缺失身份，以及逗号文本、JSON 数字、角色键、null 和非法空选项拒绝。初始化列默认 []，演示流程权限固定 ALL/[]。Workflow 构建在公共 security 模块因并行构建产物消失失败，尚未执行到此模块；已遵循共享调度，后续由主代理统一运行 `mvn -B -ntp -f cloudflow-backend/pom.xml -pl cloudflow-service-workflow -am test` 与前端 `npm run type-check`。

> 主代理已安装前端依赖，首次类型检查唯一错误：src/components/WorkflowSettingsModal.tsx(205,29) loadingBlockClassName 未定义，请在你当前D04/S03改动内修复缺失导入。后续仍主代理统一编译。

> 主代理全量verify：WorkflowPermissionService 第65/83/99/114调用 checkTenantIsolation，但方法被删除导致编译失败。请恢复租户隔离校验（安全要求），回查D04裁剪范围。TEMP/cloudflow-full-verify.log。

### S03

运行图解析在入口要求 title，拒绝节点 name/label 和连线 from/to/expression/expr/label。定义展示、实例展示、版本比较、版本号判定及脚本报错仅读取标准字段；图展示响应与前端类型同步为 title/condition。前端统一图解析入口也拒绝旧字段，模板使用和导入经过同一后端解析校验。历史记录的 nodeName、版本比较响应的 sourceId/targetId 等独立接口字段保留，它们不参与图格式兼容。

扫描 06 初始化数据的 77 个图模型，全部使用标准字段，无需批量改写。07 演示生成中原本流程 model_json 为普通业务文本、模板 definition 为通用 JSON 示例，已改为标准的开始→发起人确认→结束图，scripts/generate-demo-seed.ps1 同步生成规则。新增 WorkflowGraphContractTest 2 个测试覆盖运行标题/条件保持及旧字段拒绝，交主代理统一 Workflow 构建和前端类型检查。

尚待验证：D04 的多编号选择界面、D03 标准字段提交，以及 S03 标准图运行/导入测试；本代理遵循统一构建调度，不再启动 Maven/npm。

D04 验证补记：主代理 12:08 verify 发现误删邻接 checkTenantIsolation 方法，已恢复原租户校验实现，保留全部调用，等待统一重跑。

最终补记：导出损坏 JSON 直接报错，移除解析失败后原始字符串透传；前端关联表单移除恒 false 加载分支，已修复 types 日志报错。启动权限测试增加跨租户任务仍拒绝的回归，现新增 3 类共 6 个测试。

## 主代理统一验证结果

2026-11-02 全后端 install 成功；独立复核修复后 HR verify、Workflow install 与 Auth verify 通过。当前45个测试无失败/错误/跳过，前端 type-check/build 通过；01—07已在隔离库和正式项目库成功导入。阶段记录中的待构建项已完成，页面交互和未接入业务能力不包含在构建通过结论内，最终运行结果以主审计文档为准。
