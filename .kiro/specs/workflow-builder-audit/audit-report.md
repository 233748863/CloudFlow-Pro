# WorkflowBuilder 前后端数据一致性审计报告

## 审计概述

本报告对 `WorkflowBuilder.tsx` 前端流程设计器的数据组装逻辑与后端业务逻辑进行了全面审计，识别出数据结构、字段映射、业务规则等方面的脱节和不符之处。

**审计时间**: 2026-02-28  
**审计范围**:
- 前端: `cloudflow-frontend/src/components/WorkflowBuilder.tsx`
- 后端控制器: `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/controller/WorkflowController.java`
- 后端实体: `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/domain/WfProcessDefinition.java`
- 后端服务: `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WfDefinitionServiceImpl.java`
- API 服务: `cloudflow-frontend/src/services/api/workflow.ts`

---

## 一、数据提交流程分析

### 1.1 前端数据组装

**位置**: `WorkflowBuilder.tsx` 第 2758 行和第 2769 行

```typescript
// 保存流程
await saveProcessDefinition({ 
  processName: workflowName, 
  processKey: workflowKey, 
  modelJson: JSON.stringify(root) 
});

// 部署流程
const definition = { 
  id: workflow?.id?.startsWith('new_') ? undefined : workflow?.id, 
  processName: workflowName, 
  processKey: workflowKey, 
  modelJson: JSON.stringify(root) 
};
```

**问题识别**:
1. ✅ 前端使用 `modelJson` 字段名，与后端实体 `WfProcessDefinition.modelJson` 一致
2. ⚠️ 前端在部署时传递 `id` 字段，但后端实体使用 `definitionId` 字段名
3. ❌ 前端缺少以下后端实体字段的提交：
   - `formId` - 关联表单ID
   - `description` - 流程描述
   - `category` - 流程分类
   - `tags` - 流程标签
   - `startPermissionType` - 启动权限类型
   - `startPermissionValue` - 启动权限值
   - `deptId` - 部门ID（数据权限）

### 1.2 后端数据接收

**位置**: `WfProcessDefinition.java`

```java
public class WfProcessDefinition {
    private String definitionId;      // 定义ID
    private Long tenantId;            // 租户ID
    private String processName;       // 流程名称
    private String processKey;        // 流程Key
    private Integer version;          // 版本
    private String formId;            // 关联表单ID ⚠️
    private String modelJson;         // 流程模型JSON
    private String status;            // 状态
    private LocalDateTime createTime; // 创建时间
    private String startPermissionType;  // 启动权限类型 ⚠️
    private String startPermissionValue; // 启动权限值 ⚠️
    private String category;          // 流程分类 ⚠️
    private String tags;              // 流程标签 ⚠️
    private Integer versionLock;      // 乐观锁版本号
    private Integer isLatest;         // 是否最新版本
    private String description;       // 流程描述 ⚠️
    private Long deptId;              // 部门ID ⚠️
    // ... 其他字段
}
```

---

## 二、关键问题清单

### 2.1 字段映射不一致 (P0 - 严重)

| 前端字段 | 后端字段 | 问题描述 | 影响 |
|---------|---------|---------|------|
| `id` | `definitionId` | 字段名不一致 | 部署时可能无法正确更新现有流程定义 |

**修复建议**: 前端统一使用 `definitionId` 字段名

### 2.2 缺失必要字段 (P1 - 重要)

以下字段在后端实体中存在，但前端未提交：

#### 2.2.1 表单关联字段
- **字段**: `formId`
- **用途**: 关联流程表单定义
- **影响**: 无法将流程与表单关联，流程启动时可能缺少表单数据
- **修复**: 在 WorkflowBuilder 中添加表单选择器

#### 2.2.2 流程元数据字段
- **字段**: `description`, `category`, `tags`
- **用途**: 流程描述、分类和标签，用于流程管理和检索
- **影响**: 流程列表中缺少描述信息，无法按分类筛选
- **修复**: 在流程属性面板中添加这些字段的输入

#### 2.2.3 权限控制字段
- **字段**: `startPermissionType`, `startPermissionValue`
- **用途**: 控制哪些用户/角色/部门可以发起该流程
- **影响**: 所有用户都能看到和发起流程，无法实现权限控制
- **修复**: 添加启动权限配置面板

#### 2.2.4 数据权限字段
- **字段**: `deptId`
- **用途**: 数据权限隔离，多租户场景下的部门级权限
- **影响**: 无法实现部门级数据隔离
- **修复**: 自动从当前用户上下文获取部门ID

### 2.3 节点数据结构问题 (P1 - 重要)

#### 2.3.1 审批人配置

**前端节点结构** (`WorkflowNode` 类型):
```typescript
interface WorkflowNode {
  id: string;
  type: NodeType;
  title: string;
  approverType?: string;      // ROLE | USER | USERS | DEPT_MANAGER | DIRECT_LEADER | DEPT
  approverValue?: string;     // 审批人值（角色key、用户ID、部门ID等）
  approverLabel?: string;     // 审批人显示名称（存储在 props 中）
  condition?: string;
  next?: WorkflowNode;
  branches?: WorkflowNode[];
  branchStrategy?: string;    // EXCLUSIVE | PARALLEL | RACE
  props?: Record<string, any>;
  // ... 其他字段
}
```

**问题**:
1. ✅ `approverType` 和 `approverValue` 字段存在且正确使用
2. ⚠️ `approverLabel` 存储在 `props` 中，但后端可能期望在顶层字段
3. ❌ 多人审批时 `approverValue` 使用逗号分隔字符串，后端可能期望数组格式

**示例**:
```typescript
// 前端当前格式
{
  approverType: "USERS",
  approverValue: "1001,1002,1003",  // 逗号分隔
  props: {
    approverLabel: "张三, 李四, 王五"
  }
}

// 后端可能期望的格式
{
  approverType: "USERS",
  approverValue: ["1001", "1002", "1003"],  // 数组
  approverLabel: "张三, 李四, 王五"
}
```

#### 2.3.2 会签节点配置

**前端配置** (`NodeType.PARALLEL`):
```typescript
{
  type: NodeType.PARALLEL,
  signType: "ALL" | "ANY" | "PERCENT" | "SEQUENTIAL",
  passPercent?: number,  // 比例签的通过百分比
  approverType: string,
  approverValue: string,
  // ...
}
```

**问题**:
1. ✅ `signType` 字段存在，支持全签、或签、比例签、顺序签
2. ✅ `passPercent` 字段用于比例签
3. ⚠️ 后端是否支持这些会签类型需要验证
4. ❌ 缺少会签完成条件的明确定义（如"3人中2人同意"）

#### 2.3.3 高级节点类型

前端支持以下高级节点类型，需要验证后端是否完整支持：

| 节点类型 | 前端字段 | 后端支持状态 | 问题 |
|---------|---------|------------|------|
| `NOTIFICATION` (通知) | `props.recipientType`, `props.recipientValue`, `props.notificationTitle`, `props.notificationContent` | ❓ 需验证 | 后端是否有通知发送机制 |
| `SCRIPT` (脚本) | `props.scriptType`, `props.scriptContent`, `props.apiUrl`, `props.apiMethod`, `props.apiHeaders`, `props.apiBody`, `props.continueOnError` | ❓ 需验证 | 后端是否支持 Groovy/JavaScript 执行和 API 调用 |
| `TIMER` (定时) | `props.timerType`, `props.delayMinutes`, `props.scheduleTime` | ❓ 需验证 | 后端是否有定时任务调度机制 |
| `SUBPROCESS` (子流程) | `props.subprocessId`, `props.variableMapping`, `props.waitForCompletion` | ❓ 需验证 | 后端是否支持子流程调用 |
| `MANUAL` (人工任务) | `props.taskDescription`, `props.priority`, `approverType`, `approverValue` | ❓ 需验证 | 与审批节点的区别是什么 |
| `COPY` (抄送) | `approverType`, `approverValue` | ❓ 需验证 | 后端是否有抄送表和通知机制 |

### 2.4 SLA 和表单权限配置 (P2 - 中等)

**前端配置**:
```typescript
{
  slaHours?: number,        // SLA 超时时间（小时）
  slaAction?: string,       // 超时动作: AUTO_PASS | AUTO_REJECT
  allowEdit?: boolean,      // 是否允许编辑表单
}
```

**问题**:
1. ❌ 后端 `WfProcessDefinition` 实体中未找到这些字段
2. ❌ 这些配置可能需要存储在节点的 `props` 中，而不是流程定义的顶层
3. ⚠️ 后端是否有 SLA 监控和自动处理机制需要验证

---

## 三、业务逻辑脱节

### 3.1 版本管理

**后端逻辑** (`WfDefinitionServiceImpl.java` 第 100-110 行):
```java
// 查找当前Key的最大版本
WfProcessDefinition lastDef = processDefinitionMapper.selectOne(
    new LambdaQueryWrapper<WfProcessDefinition>()
        .eq(WfProcessDefinition::getProcessKey, definition.getProcessKey())
        .orderByDesc(WfProcessDefinition::getVersion)
        .last("LIMIT 1")
);

int version = 1;
if (lastDef != null) {
    version = lastDef.getVersion() + 1;
    lastDef.setIsLatest(0);
    processDefinitionMapper.updateById(lastDef);
}
```

**前端问题**:
1. ❌ 前端未处理版本号，完全依赖后端自动生成
2. ❌ 前端未展示当前流程的版本信息
3. ❌ 前端未提供版本历史查看和回滚功能
4. ⚠️ 前端未传递 `versionLock` 字段，无法利用后端的乐观锁机制防止并发冲突

### 3.2 流程状态管理

**后端状态** (`WfProcessDefinition.status`):
- `DRAFT` - 草稿
- `PUBLISHED` - 已发布
- `ARCHIVED` - 已归档

**前端问题**:
1. ❌ 前端未展示流程状态
2. ❌ 前端未根据状态限制操作（如已发布的流程不应允许编辑）
3. ❌ 前端未提供归档流程的入口

### 3.3 权限校验

**后端权限校验** (`WfDefinitionServiceImpl.java` 第 93 行):
```java
permissionService.checkDefinitionPermission("保存");
```

**前端问题**:
1. ❌ 前端未在 UI 层面根据权限隐藏/禁用操作按钮
2. ❌ 前端未处理权限不足的错误提示
3. ⚠️ 前端未实现启动权限的配置界面

### 3.4 XSS 防护

**后端安全措施** (`WfDefinitionServiceImpl.java` 第 82-90 行):
```java
// XSS 防护
definition.setProcessName(securityUtils.sanitizeXss(definition.getProcessName()));

// JSON 结构校验 + P0-5: 递归 XSS 过滤 modelJson 内所有节点文本字段
if (StringUtils.hasText(definition.getModelJson())) {
    jsonSchemaValidator.validateProcessDefinitionJson(definition.getModelJson());
    validateModelIntegrity(definition.getModelJson());
    definition.setModelJson(sanitizeModelJson(definition.getModelJson()));
}
```

**前端问题**:
1. ✅ 前端使用 React，默认防止 XSS
2. ⚠️ 前端在用户输入时未进行客户端验证和清理
3. ⚠️ 前端未对用户输入的脚本内容（`SCRIPT` 节点）进行警告提示

---

## 四、数据完整性问题

### 4.1 必填字段验证

**后端验证** (`WfDefinitionServiceImpl.java` 第 75-80 行):
```java
if (!StringUtils.hasText(definition.getProcessKey())) {
    throw WorkflowException.validationError("流程Key不能为空");
}
if (!StringUtils.hasText(definition.getProcessName())) {
    throw WorkflowException.validationError("流程名称不能为空");
}
```

**前端验证** (`WorkflowBuilder.tsx` 第 2748-2756 行):
```typescript
const { errors, errorNodes } = validateWorkflow(root);
setInvalidNodeIds(errorNodes);
if (errors.length > 0) {
  toast.error(`流程验证失败: ${errors.join(', ')}`);
  return;
}
```

**问题**:
1. ✅ 前端有流程结构验证
2. ❌ 前端未验证 `processKey` 和 `processName` 是否为空
3. ❌ 前端未验证 `processKey` 的格式（应为英文字母、数字、下划线）
4. ❌ 前端未验证节点配置的完整性（如审批节点必须配置审批人）

### 4.2 节点完整性验证

需要验证的节点配置：

| 节点类型 | 必填字段 | 前端验证状态 |
|---------|---------|------------|
| `APPROVAL` | `approverType`, `approverValue` (除 DEPT_MANAGER/DIRECT_LEADER 外) | ❌ 未验证 |
| `PARALLEL` | `signType`, `approverType`, `approverValue`, `passPercent` (比例签) | ❌ 未验证 |
| `CONDITION` | `condition` | ❌ 未验证 |
| `NOTIFICATION` | `props.recipientType`, `props.notificationTitle`, `props.notificationContent` | ❌ 未验证 |
| `SCRIPT` | `props.scriptType`, `props.scriptContent` 或 `props.apiUrl` | ❌ 未验证 |
| `TIMER` | `props.timerType`, `props.delayMinutes` 或 `props.scheduleTime` | ❌ 未验证 |
| `SUBPROCESS` | `props.subprocessId` | ❌ 未验证 |
| `MANUAL` | `approverType`, `approverValue`, `props.taskDescription` | ❌ 未验证 |
| `COPY` | `approverType`, `approverValue` | ❌ 未验证 |

---

## 五、API 接口问题

### 5.1 保存流程定义接口

**前端调用** (`workflow.ts` 第 267 行):
```typescript
export async function saveProcessDefinition(data: SaveProcessDefinitionRequest): Promise<WorkflowDefinition> {
  return request.post('/workflow/definition/save', data);
}
```

**后端接口** (`WorkflowController.java` 第 120-124 行):
```java
@PostMapping("/definition/save")
@PreAuthorize("hasAnyRole('admin', 'ADMIN')")
public R<?> saveProcessDefinition(@RequestBody WfProcessDefinition definition) {
    return workflowService.saveProcessDefinition(definition);
}
```

**问题**:
1. ✅ 接口路径一致
2. ✅ 请求方法一致 (POST)
3. ⚠️ 前端类型定义 `SaveProcessDefinitionRequest` 与后端 `WfProcessDefinition` 可能不一致
4. ❌ 前端未处理后端返回的结构化对象 `{ id, version, processKey }`

**后端返回** (`WfDefinitionServiceImpl.java` 第 127-131 行):
```java
Map<String, Object> result = new HashMap<>();
result.put("id", definition.getDefinitionId());
result.put("version", version);
result.put("processKey", definition.getProcessKey());
return R.ok(result);
```

**前端处理** (`WorkflowBuilder.tsx` 第 2771-2772 行):
```typescript
const saveRes = await saveProcessDefinition(definition);
const definitionId = (saveRes as any)?.id || saveRes;
```

**问题**: 前端使用 `as any` 绕过类型检查，应该定义正确的返回类型

### 5.2 部署流程定义接口

**前端调用** (`workflow.ts` 第 275 行):
```typescript
export async function deployProcessDefinition(definitionId: string): Promise<void> {
  return request.post(`/workflow/definition/deploy/${definitionId}`);
}
```

**后端接口** (`WorkflowController.java` 第 130-134 行):
```java
@PostMapping("/definition/deploy/{definitionId}")
@PreAuthorize("hasAnyRole('admin', 'ADMIN')")
public R<?> deployProcessDefinition(@PathVariable("definitionId") String definitionId) {
    return workflowService.deployProcessDefinition(definitionId);
}
```

**问题**:
1. ✅ 接口路径一致
2. ✅ 请求方法一致 (POST)
3. ✅ 参数传递方式一致 (路径参数)

---

## 六、修复优先级和建议

### P0 - 立即修复（阻塞性问题）

1. **字段名不一致**: 前端 `id` → `definitionId`
   - 修改位置: `WorkflowBuilder.tsx` 第 2769 行
   - 修改内容: 将 `id` 改为 `definitionId`

2. **类型定义不一致**: 定义正确的 API 返回类型
   - 修改位置: `cloudflow-frontend/src/types/workflow.ts`
   - 新增类型:
     ```typescript
     export interface SaveProcessDefinitionResponse {
       id: string;
       version: number;
       processKey: string;
     }
     ```

### P1 - 尽快修复（功能缺失）

1. **添加缺失字段的输入界面**:
   - `formId`: 添加表单选择器
   - `description`: 添加流程描述输入框
   - `category`: 添加分类选择器
   - `tags`: 添加标签输入
   - `startPermissionType` / `startPermissionValue`: 添加启动权限配置面板

2. **完善节点配置验证**:
   - 在 `validateWorkflow` 函数中添加节点必填字段验证
   - 为每种节点类型定义验证规则

3. **审批人值格式统一**:
   - 确认后端期望的格式（逗号分隔字符串 vs 数组）
   - 统一前端提交格式

4. **版本管理功能**:
   - 展示当前流程版本
   - 添加版本历史查看
   - 实现版本回滚

### P2 - 优化改进（体验提升）

1. **权限控制**:
   - 根据用户权限显示/隐藏操作按钮
   - 添加权限不足的友好提示

2. **流程状态展示**:
   - 在流程列表和编辑器中展示状态
   - 根据状态限制操作

3. **输入验证和清理**:
   - 添加客户端输入验证
   - 对危险操作（如脚本节点）添加警告

4. **SLA 和表单权限**:
   - 确认后端是否支持这些功能
   - 如果支持，确保数据正确提交

### P3 - 长期规划（架构优化）

1. **类型安全**:
   - 移除 `as any` 类型断言
   - 为所有 API 定义完整的 TypeScript 类型

2. **错误处理**:
   - 统一错误处理机制
   - 添加详细的错误提示

3. **高级节点类型验证**:
   - 与后端团队确认每种节点类型的支持状态
   - 如果不支持，在前端隐藏或禁用

---

## 七、测试建议

### 7.1 单元测试

1. 测试节点数据序列化和反序列化
2. 测试审批人配置的各种组合
3. 测试会签节点的配置验证
4. 测试流程结构验证逻辑

### 7.2 集成测试

1. 测试保存流程定义的完整流程
2. 测试部署流程定义的完整流程
3. 测试版本管理功能
4. 测试权限控制

### 7.3 端到端测试

1. 创建包含所有节点类型的复杂流程
2. 保存并部署流程
3. 启动流程实例并完成审批
4. 验证流程执行结果

---

## 八、总结

### 8.1 主要问题

1. **字段映射不一致**: `id` vs `definitionId`
2. **缺失必要字段**: `formId`, `description`, `category`, `tags`, `startPermissionType`, `startPermissionValue`, `deptId`
3. **节点配置验证不足**: 缺少必填字段验证
4. **版本管理缺失**: 前端未处理版本信息
5. **权限控制不完善**: 前端未根据权限限制操作
6. **高级节点类型支持不明确**: 需要与后端确认支持状态

### 8.2 影响评估

- **P0 问题**: 可能导致部署失败或数据丢失
- **P1 问题**: 导致功能缺失，影响用户体验
- **P2 问题**: 影响系统安全性和易用性
- **P3 问题**: 影响代码质量和可维护性

### 8.3 下一步行动

1. 立即修复 P0 问题
2. 与后端团队确认高级节点类型的支持状态
3. 制定 P1 问题的修复计划
4. 编写测试用例验证修复效果
5. 更新文档和类型定义

---

## 附录

### A. 相关文件清单

- `cloudflow-frontend/src/components/WorkflowBuilder.tsx` - 流程设计器主组件
- `cloudflow-frontend/src/services/api/workflow.ts` - 工作流 API 服务
- `cloudflow-frontend/src/types/workflow.ts` - 工作流类型定义
- `cloudflow-frontend/src/types.ts` - 通用类型定义
- `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/controller/WorkflowController.java` - 工作流控制器
- `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/domain/WfProcessDefinition.java` - 流程定义实体
- `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WfDefinitionServiceImpl.java` - 流程定义服务实现

### B. 参考资料

- [工作流设计最佳实践](../../../docs/WORKFLOW_FRONTEND_ANALYSIS.md)
- [后端 API 文档](../../../docs/BACKEND_API_REQUIREMENTS.md)
- [数据权限设计](../../../cloudflow-backend/cloudflow-common/DATASCOPE_README.md)

---

**审计人**: Kiro AI Assistant  
**审计日期**: 2026-02-28  
**文档版本**: 1.0
