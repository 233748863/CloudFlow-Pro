# 流程设计UI术语改进方案

## 问题分析

当前流程设计器UI存在以下用户体验问题：

### 1. 节点类型名称过于抽象
- **当前**: START, APPROVAL, CONDITION, PARALLEL, END
- **问题**: 技术术语，普通用户难以理解

### 2. 节点ID直接暴露
- **当前**: 显示 "root", "n1", "b1" 等技术ID
- **问题**: 对用户无意义，增加认知负担

### 3. 审批人类型术语抽象
- **当前**: ROLE, USER, DEPT_MANAGER, DIRECT_LEADER
- **问题**: 英文缩写，不够直观

### 4. 分支策略术语专业
- **当前**: EXCLUSIVE (XOR), PARALLEL (AND), RACE (OR)
- **问题**: 使用了技术术语和逻辑符号

## 改进方案

### 1. 节点类型中文化

```typescript
// 原来
NodeType.START → "发起节点"
NodeType.APPROVAL → "审批节点"
NodeType.CONDITION → "条件分支"
NodeType.PARALLEL → "并行分支"
NodeType.END → "结束节点"

// 改进后
NodeType.START → "开始"
NodeType.APPROVAL → "审批"
NodeType.CONDITION → "条件判断"
NodeType.PARALLEL → "同时处理"
NodeType.END → "完成"
```

### 2. 隐藏技术ID，只显示业务名称

```typescript
// 原来：显示技术ID
<span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-500 font-mono">
  {node.id}
</span>

// 改进后：只在开发模式或hover时显示
{process.env.NODE_ENV === 'development' && (
  <span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-500 font-mono" title="节点ID">
    {node.id}
  </span>
)}
```

### 3. 审批人类型本地化

```typescript
// 原来
approverType: 'ROLE' | 'USER' | 'DEPT_MANAGER' | 'DIRECT_LEADER'

// 改进后的显示映射
const APPROVER_TYPE_LABELS = {
  ROLE: '按角色',
  USER: '指定人员',
  DEPT_MANAGER: '部门负责人',
  DIRECT_LEADER: '直属上级'
}
```

### 4. 分支策略通俗化

```typescript
// 原来
branchStrategy: 'EXCLUSIVE' | 'PARALLEL' | 'RACE'

// 改进后的显示
const BRANCH_STRATEGY_LABELS = {
  EXCLUSIVE: '单选分支（满足一个条件即可）',
  PARALLEL: '并行处理（所有分支同时进行）',
  RACE: '竞争模式（任一分支完成即可）'
}

// 简化版
const BRANCH_STRATEGY_SIMPLE = {
  EXCLUSIVE: '单选',
  PARALLEL: '并行',
  RACE: '竞争'
}
```

### 5. 节点卡片信息优化

```typescript
// 原来：显示技术信息
<div className="text-[10px] text-slate-400 truncate flex justify-between">
  <span>{node.id}</span>
  {node.approverType && <span className="bg-slate-100 px-1 rounded">{node.approverType}</span>}
</div>

// 改进后：显示业务信息
<div className="text-[10px] text-slate-400 truncate">
  {node.approverType && (
    <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
      {APPROVER_TYPE_LABELS[node.approverType]}
    </span>
  )}
  {node.approverValue && (
    <span className="ml-1 text-slate-500">
      {node.approverValue}
    </span>
  )}
</div>
```

### 6. 属性面板标签优化

```typescript
// 原来
<label>节点属性配置</label>
<label>基本信息</label>
<label>审批配置</label>
<label>分支策略</label>
<label>高级设置</label>

// 改进后
<label>节点设置</label>
<label>基础信息</label>
<label>审批人设置</label>
<label>分支规则</label>
<label>条件设置</label>
```

### 7. 表单字段标签优化

```typescript
// 原来
"节点名称"
"节点类型"
"审批人类型"
"角色Key"
"进入条件 (Condition Expression)"

// 改进后
"名称"
"类型"
"审批方式"
"角色标识"
"触发条件"
```

### 8. 帮助文本改进

```typescript
// 原来
<p className="text-[10px] text-slate-400 mt-1">
  支持 JavaScript 表达式，可用变量: amount, days, deptId
</p>

// 改进后
<p className="text-[10px] text-slate-400 mt-1">
  💡 示例：金额 > 5000 或 天数 >= 3
  <br/>
  可用字段：amount(金额)、days(天数)、deptId(部门ID)
</p>
```

## 实施优先级

### 高优先级（立即改进）
1. ✅ 隐藏或淡化技术ID显示
2. ✅ 审批人类型中文化
3. ✅ 节点类型显示优化

### 中优先级（近期改进）
4. ✅ 分支策略通俗化
5. ✅ 属性面板标签优化
6. ✅ 帮助文本改进

### 低优先级（长期优化）
7. 添加工具提示(Tooltip)解释专业术语
8. 提供模板和示例
9. 添加引导式向导

## 用户反馈收集

建议在改进后收集以下反馈：
- 用户是否能快速理解各个节点的作用？
- 配置流程时是否遇到困惑？
- 哪些术语仍然不够清晰？
- 是否需要更多的帮助文档或示例？

## 附加建议

1. **图标化**: 为不同节点类型添加直观的图标
2. **颜色编码**: 使用不同颜色区分节点类型
3. **拖拽提示**: 添加更明显的拖拽操作提示
4. **快捷操作**: 提供常用配置的快捷按钮
5. **预设模板**: 提供常见流程的模板供用户选择
