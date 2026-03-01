# 前端错误处理指南

本指南介绍如何使用统一的错误处理器来处理 API 错误。

## 概述

统一的错误处理器提供了以下功能：

1. **自动错误分类**：根据错误代码自动选择合适的提示方式
2. **友好的错误提示**：为不同类型的错误提供用户友好的提示信息
3. **特殊错误处理**：支持冲突解决、运行实例警告等特殊场景
4. **字段级别验证**：显示表单字段级别的验证错误

## 快速开始

### 1. 基本用法

最简单的用法是在 catch 块中调用 `handleApiError`：

```typescript
import { handleApiError, ApiErrorResponse } from '@/utils/errorHandler';
import { AxiosError } from 'axios';
import request from '@/services/api/request';

try {
  const result = await request.post('/api/workflow/save', data);
  showSuccess('保存成功');
} catch (error) {
  handleApiError(error as AxiosError<ApiErrorResponse>);
}
```

### 2. 使用包装器

使用 `withErrorHandler` 可以让代码更简洁：

```typescript
import { withErrorHandler, showSuccess } from '@/utils/errorHandler';

const handleSave = withErrorHandler(
  async () => {
    const result = await request.post('/api/workflow/save', data);
    showSuccess('保存成功');
    return result;
  },
  { customMessage: '保存失败' }
);

// 调用
await handleSave();
```

## 错误类型处理

### 1. 权限错误 (PERMISSION_DENIED)

权限错误会自动显示友好的提示，包含联系管理员的建议。

```typescript
// 后端返回 403 或 code: 'PERMISSION_DENIED'
// 自动显示：
// "您没有权限执行此操作"
// "如需访问此功能，请联系系统管理员"
```

### 2. 资源冲突 (RESOURCE_CONFLICT)

处理导入流程时的名称冲突等场景：

```typescript
import { ConflictResolutionDialog } from '@/components/ui/ConflictResolutionDialog';

const [showConflictDialog, setShowConflictDialog] = useState(false);
const [conflictData, setConflictData] = useState(null);

try {
  await request.post('/api/workflow/import', formData);
} catch (error) {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  const errorData = axiosError.response?.data;

  if (errorData?.code === 'RESOURCE_CONFLICT') {
    // 显示冲突解决对话框
    setConflictData({
      resourceName: errorData.data?.resourceName,
      message: errorData.message,
    });
    setShowConflictDialog(true);
  } else {
    handleApiError(axiosError);
  }
}

// 在 JSX 中
<ConflictResolutionDialog
  open={showConflictDialog}
  onClose={() => setShowConflictDialog(false)}
  resourceName={conflictData?.resourceName}
  message={conflictData?.message}
  onConfirm={(strategy, newName) => {
    // 使用选择的策略重新导入
    handleImportWithStrategy(strategy, newName);
  }}
/>
```

### 3. 运行实例警告 (RUNNING_INSTANCES_WARNING)

处理版本回滚等操作时的运行实例警告：

```typescript
import { WarningConfirmDialog } from '@/components/ui/WarningConfirmDialog';

const [showWarningDialog, setShowWarningDialog] = useState(false);
const [pendingAction, setPendingAction] = useState(null);

try {
  await request.post('/api/workflow/versions/rollback', data);
} catch (error) {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  const errorData = axiosError.response?.data;

  if (errorData?.code === 'RUNNING_INSTANCES_WARNING') {
    // 保存待执行的操作
    setPendingAction(data);
    
    // 显示警告对话框
    setShowWarningDialog(true);
  } else {
    handleApiError(axiosError);
  }
}

// 在 JSX 中
<WarningConfirmDialog
  open={showWarningDialog}
  onClose={() => setShowWarningDialog(false)}
  title="运行实例警告"
  message="该流程有正在运行的实例"
  description="回滚可能影响运行中的流程"
  confirmText="强制回滚"
  requireDoubleConfirm={true}
  onConfirm={() => {
    // 执行强制操作
    handleForceRollback(pendingAction);
  }}
  severity="warning"
/>
```

### 4. 验证错误 (INVALID_REQUEST)

显示字段级别的验证错误：

```typescript
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

try {
  await request.post('/api/workflow/templates', formData);
} catch (error) {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  const errorData = axiosError.response?.data;

  if (errorData?.code === 'INVALID_REQUEST' && errorData.errors) {
    // 提取字段错误
    const errors: Record<string, string> = {};
    errorData.errors.forEach((err) => {
      errors[err.field] = err.message;
    });
    setFieldErrors(errors);
  }
  
  // 同时显示 toast 提示
  handleApiError(axiosError);
}

// 在表单中显示错误
<input name="name" />
{fieldErrors.name && (
  <span className="text-red-500 text-sm">{fieldErrors.name}</span>
)}
```

### 5. 模板正在使用 (TEMPLATE_IN_USE)

```typescript
// 自动显示：
// "该模板正在被使用，无法删除"
// "当前有 5 个流程正在使用此模板"
```

### 6. 不支持的节点类型 (UNSUPPORTED_NODE_TYPES)

```typescript
// 自动显示：
// "流程包含不支持的节点类型"
// "不支持的节点类型：customNode1、customNode2"
```

## 高级选项

### 静默模式

某些场景下不需要显示错误提示（如轮询、后台任务）：

```typescript
try {
  const result = await request.get('/api/workflow/status', { silent: true });
} catch (error) {
  // 错误被静默处理，不会显示 toast
  console.log('状态检查失败');
}
```

### 自定义错误消息

为特定操作提供更友好的错误提示：

```typescript
const handleDelete = withErrorHandler(
  async (id: string) => {
    await request.delete(`/api/workflow/templates/${id}`);
    showSuccess('模板删除成功');
  },
  {
    customMessage: '删除模板失败，请稍后重试',
  }
);
```

## 辅助函数

### showSuccess

显示成功提示：

```typescript
import { showSuccess } from '@/utils/errorHandler';

showSuccess('操作成功');
showSuccess('保存成功', '流程已保存到草稿箱');
```

### showWarning

显示警告提示：

```typescript
import { showWarning } from '@/utils/errorHandler';

showWarning('请先保存流程');
showWarning('数据可能不完整', '部分字段未填写');
```

### showInfo

显示信息提示：

```typescript
import { showInfo } from '@/utils/errorHandler';

showInfo('正在处理中');
showInfo('数据同步中', '预计需要 30 秒');
```

## 后端错误响应格式

后端应该返回以下格式的错误响应：

```json
{
  "code": "RESOURCE_CONFLICT",
  "message": "流程名称已存在",
  "errors": [
    {
      "field": "name",
      "message": "名称不能为空",
      "rejectedValue": ""
    }
  ],
  "data": {
    "suggestions": ["重命名", "覆盖", "跳过"],
    "usageCount": 5,
    "affectedWorkflows": ["workflow1", "workflow2"]
  },
  "timestamp": "2024-01-01T00:00:00",
  "path": "/api/workflow/import"
}
```

## 错误代码列表

| 错误代码 | 说明 | 处理方式 |
|---------|------|---------|
| `PERMISSION_DENIED` | 权限不足 | 显示友好的权限提示 |
| `RESOURCE_CONFLICT` | 资源冲突 | 显示冲突解决对话框 |
| `RUNNING_INSTANCES_WARNING` | 运行实例警告 | 显示警告确认对话框 |
| `INVALID_REQUEST` | 验证错误 | 显示字段级别的错误 |
| `TEMPLATE_IN_USE` | 模板正在使用 | 显示使用数量 |
| `UNSUPPORTED_NODE_TYPES` | 不支持的节点类型 | 列出不支持的类型 |
| `RESOURCE_NOT_FOUND` | 资源不存在 | 显示通用错误提示 |
| `INTERNAL_ERROR` | 服务器错误 | 显示通用错误提示 |

## 最佳实践

1. **始终使用统一的错误处理器**：不要直接使用 `toast.error`，而是使用 `handleApiError`
2. **为特殊场景提供自定义处理**：如冲突解决、运行实例警告等
3. **显示字段级别的验证错误**：在表单中显示具体的字段错误
4. **使用静默模式处理后台任务**：避免干扰用户
5. **提供友好的错误消息**：使用 `customMessage` 选项

## 示例代码

完整的示例代码请参考：
- `src/utils/errorHandler.example.tsx` - 各种使用场景的示例
- `src/pages/VersionHistory.improved.tsx` - 实际应用示例

## 注意事项

1. 错误处理器会自动处理 401（未授权）和 503（服务不可用）错误
2. 网络错误和超时错误会显示特定的提示信息
3. 所有错误都会被记录到控制台，便于调试
4. 生产环境下，错误会被上报到后端日志收集系统
