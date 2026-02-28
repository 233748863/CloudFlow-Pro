# P1 级问题修复计划

## 修复优先级和范围

根据审计报告，P1 级问题主要集中在**缺失必要字段**，这些字段在后端实体中存在，但前端未提交。

---

## P1 问题清单

### P1-1: 表单关联字段 (formId)
- **优先级**: 高
- **影响**: 无法将流程与表单关联
- **工作量**: 中等

### P1-2: 流程元数据字段 (description, category, tags)
- **优先级**: 高
- **影响**: 流程管理和检索功能受限
- **工作量**: 中等

### P1-3: 启动权限控制字段 (startPermissionType, startPermissionValue)
- **优先级**: 高
- **影响**: 无法实现权限控制
- **工作量**: 较大

### P1-4: 数据权限字段 (deptId)
- **优先级**: 中
- **影响**: 无法实现部门级数据隔离
- **工作量**: 小

---

## 修复策略

### 阶段 1: 基础字段添加（立即执行）

#### 1.1 更新类型定义
- 在 `SaveProcessDefinitionRequest` 中添加缺失字段
- 确保类型定义与后端实体一致

#### 1.2 添加 UI 组件
- 在 WorkflowBuilder 中添加流程属性配置面板
- 包含：描述、分类、标签、表单选择

#### 1.3 数据提交
- 在保存和部署时提交新增字段
- 确保数据正确传递到后端

### 阶段 2: 权限控制（后续执行）

#### 2.1 启动权限配置
- 添加权限配置面板
- 支持按角色、用户、部门配置启动权限

#### 2.2 数据权限
- 自动从用户上下文获取 deptId
- 或提供手动选择部门的选项

---

## 详细修复方案

### 方案 1: 最小化修复（推荐）

**目标**: 快速添加必要字段，保持 UI 简洁

**修改内容**:

#### 1. 类型定义 (types/workflow.ts)

```typescript
export interface SaveProcessDefinitionRequest {
  definitionId?: string;
  processName: string;
  processKey: string;
  formId?: string;           // 新增：关联表单ID
  description?: string;      // 新增：流程描述
  category?: string;         // 新增：流程分类
  tags?: string;             // 新增：流程标签（JSON 数组字符串）
  modelJson: string;
  startPermissionType?: string;   // 新增：启动权限类型
  startPermissionValue?: string;  // 新增：启动权限值
  deptId?: number;           // 新增：部门ID
}
```

#### 2. WorkflowBuilder 组件

**添加状态管理**:
```typescript
const [workflowDescription, setWorkflowDescription] = useState('');
const [workflowCategory, setWorkflowCategory] = useState('');
const [workflowTags, setWorkflowTags] = useState<string[]>([]);
const [selectedFormId, setSelectedFormId] = useState<string>('');
```

**添加 UI 组件**:
- 在工具栏或侧边栏添加"流程设置"按钮
- 点击后弹出模态框，包含所有流程属性配置

#### 3. 数据提交

```typescript
const handleSave = async () => {
  // ... 验证逻辑
  
  const definition = {
    processName: workflowName,
    processKey: workflowKey,
    modelJson: JSON.stringify(root),
    description: workflowDescription,
    category: workflowCategory,
    tags: JSON.stringify(workflowTags),
    formId: selectedFormId || undefined,
  };
  
  await saveProcessDefinition(definition);
};
```

### 方案 2: 完整修复（推荐后续迭代）

**目标**: 完整实现所有字段，包括权限控制

**额外内容**:
- 启动权限配置面板
- 表单选择器（从后端获取表单列表）
- 分类和标签的预设选项
- 部门选择器

---

## 实施步骤

### Step 1: 更新类型定义 ✅

**文件**: `cloudflow-frontend/src/types/workflow.ts`

**修改**: 在 `SaveProcessDefinitionRequest` 接口中添加字段

### Step 2: 添加状态管理 ✅

**文件**: `cloudflow-frontend/src/components/WorkflowBuilder.tsx`

**修改**: 添加新字段的状态变量

### Step 3: 创建流程设置模态框 ✅

**新建组件**: `WorkflowSettingsModal.tsx`

**功能**:
- 流程描述输入
- 分类选择
- 标签输入
- 表单选择

### Step 4: 更新数据提交逻辑 ✅

**文件**: `cloudflow-frontend/src/components/WorkflowBuilder.tsx`

**修改**: 在 `handleSave` 和 `handleDeploy` 中包含新字段

### Step 5: 测试验证 ✅

**测试场景**:
1. 保存流程时新字段正确提交
2. 部署流程时新字段正确提交
3. 后端正确接收和存储新字段
4. 流程列表正确显示新字段

---

## UI 设计方案

### 方案 A: 工具栏按钮（推荐）

在工具栏添加"流程设置"按钮，点击后弹出模态框：

```
┌─────────────────────────────────────────┐
│  流程设置                          [X]  │
├─────────────────────────────────────────┤
│                                         │
│  流程名称: [请假审批流程___________]    │
│                                         │
│  流程Key:  [leave-approval_________]    │
│                                         │
│  流程描述:                              │
│  ┌─────────────────────────────────┐   │
│  │ 员工请假审批流程，支持病假、    │   │
│  │ 事假、年假等多种请假类型        │   │
│  └─────────────────────────────────┘   │
│                                         │
│  流程分类: [行政办公 ▼]                │
│                                         │
│  流程标签: [请假] [审批] [+添加]       │
│                                         │
│  关联表单: [请假申请表 ▼]              │
│                                         │
│           [取消]  [保存]                │
└─────────────────────────────────────────┘
```

### 方案 B: 侧边栏面板

在右侧添加可折叠的"流程属性"面板：

```
┌─────────────────┐
│ 流程属性   [▼] │
├─────────────────┤
│ 基本信息        │
│ • 名称          │
│ • Key           │
│ • 描述          │
│                 │
│ 分类和标签      │
│ • 分类          │
│ • 标签          │
│                 │
│ 表单关联        │
│ • 关联表单      │
│                 │
│ 权限设置        │
│ • 启动权限      │
└─────────────────┘
```

**推荐**: 方案 A（模态框），理由：
1. 不占用常驻空间
2. 集中管理所有属性
3. 用户体验更好

---

## 分类和标签预设

### 流程分类选项

```typescript
const WORKFLOW_CATEGORIES = [
  { value: 'office', label: '行政办公' },
  { value: 'finance', label: '财务管理' },
  { value: 'hr', label: '人事管理' },
  { value: 'sales', label: '销售业务' },
  { value: 'it', label: 'IT运维' },
  { value: 'production', label: '生产制造' },
  { value: 'quality', label: '质量管理' },
  { value: 'project', label: '项目管理' },
  { value: 'other', label: '其他' },
];
```

### 常用标签建议

```typescript
const COMMON_TAGS = [
  '审批', '请假', '报销', '采购', '合同',
  '入职', '离职', '培训', '考勤', '绩效',
  '项目', '任务', '变更', '发布', '维护',
];
```

---

## 权限控制方案（P1-3）

### 启动权限类型

```typescript
enum StartPermissionType {
  ALL = 'ALL',           // 所有人可发起
  ROLE = 'ROLE',         // 按角色
  DEPT = 'DEPT',         // 按部门
  USER = 'USER',         // 指定用户
}
```

### UI 设计

```
┌─────────────────────────────────────────┐
│  启动权限设置                           │
├─────────────────────────────────────────┤
│                                         │
│  谁可以发起此流程？                     │
│                                         │
│  ○ 所有人                               │
│  ● 指定角色                             │
│     [✓] 普通员工                        │
│     [✓] 部门经理                        │
│     [ ] 财务人员                        │
│                                         │
│  ○ 指定部门                             │
│  ○ 指定用户                             │
│                                         │
└─────────────────────────────────────────┘
```

---

## 数据权限方案（P1-4）

### 自动获取 deptId

```typescript
// 从用户上下文自动获取
const currentUser = useAuth();
const deptId = currentUser?.deptId;

// 在保存时自动添加
const definition = {
  // ... 其他字段
  deptId: deptId,
};
```

### 手动选择（可选）

如果需要支持跨部门创建流程：

```typescript
const [selectedDeptId, setSelectedDeptId] = useState<number>();

// UI
<Select value={selectedDeptId} onChange={setSelectedDeptId}>
  <SelectItem value={currentUser.deptId}>当前部门</SelectItem>
  <SelectItem value={otherDeptId}>其他部门</SelectItem>
</Select>
```

---

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|-----|------|------|---------|
| 后端字段验证失败 | 高 | 低 | 提前与后端确认字段要求 |
| UI 复杂度增加 | 中 | 中 | 采用模态框，保持主界面简洁 |
| 数据迁移问题 | 中 | 低 | 新字段都是可选的，不影响现有数据 |

### 兼容性风险

| 风险 | 影响 | 概率 | 缓解措施 |
|-----|------|------|---------|
| 旧流程缺少新字段 | 低 | 高 | 新字段都是可选的 |
| 后端版本不匹配 | 高 | 低 | 确认后端已支持这些字段 |

---

## 测试计划

### 单元测试

```typescript
describe('WorkflowBuilder - P1 Fields', () => {
  it('应该正确保存流程描述', async () => {
    // 测试逻辑
  });

  it('应该正确保存流程分类', async () => {
    // 测试逻辑
  });

  it('应该正确保存流程标签', async () => {
    // 测试逻辑
  });

  it('应该正确关联表单', async () => {
    // 测试逻辑
  });
});
```

### 集成测试

1. 创建流程并填写所有新字段
2. 保存流程
3. 验证后端正确接收
4. 重新加载流程
5. 验证所有字段正确显示

### 用户验收测试

1. 用户可以方便地输入流程描述
2. 分类选择器工作正常
3. 标签输入体验良好
4. 表单选择器正确显示可用表单

---

## 时间估算

| 任务 | 预计时间 | 优先级 |
|-----|---------|--------|
| 更新类型定义 | 30 分钟 | P0 |
| 创建流程设置模态框 | 2 小时 | P0 |
| 添加状态管理 | 30 分钟 | P0 |
| 更新数据提交逻辑 | 30 分钟 | P0 |
| 添加表单选择器 | 1 小时 | P1 |
| 添加权限配置 | 2 小时 | P1 |
| 测试和调试 | 1 小时 | P0 |
| **总计** | **7.5 小时** | |

---

## 实施顺序

### 第一批（立即执行）- 3 小时

1. ✅ 更新类型定义
2. ✅ 添加基础字段（description, category, tags）
3. ✅ 创建简单的流程设置模态框
4. ✅ 更新数据提交逻辑

### 第二批（后续迭代）- 3 小时

1. ⏳ 添加表单选择器（需要后端 API）
2. ⏳ 完善分类和标签的预设选项
3. ⏳ 优化 UI 交互

### 第三批（长期规划）- 2 小时

1. ⏳ 添加启动权限配置
2. ⏳ 添加数据权限配置
3. ⏳ 完善权限管理功能

---

## 成功标准

### 功能完整性

- ✅ 所有 P1 字段都可以在前端配置
- ✅ 数据正确提交到后端
- ✅ 后端正确存储和返回数据

### 用户体验

- ✅ UI 简洁直观
- ✅ 操作流程顺畅
- ✅ 错误提示清晰

### 代码质量

- ✅ 类型定义完整
- ✅ 代码结构清晰
- ✅ 测试覆盖充分

---

## 下一步行动

1. **立即开始**: 更新类型定义
2. **创建组件**: 流程设置模态框
3. **集成测试**: 验证数据流
4. **用户测试**: 收集反馈
5. **迭代优化**: 根据反馈改进

---

**制定人**: Kiro AI Assistant  
**制定日期**: 2026-02-28  
**文档版本**: 1.0
