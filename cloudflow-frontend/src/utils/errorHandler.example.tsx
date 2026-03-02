/**
 * 错误处理器使用示例
 * 
 * 本文件展示了如何在实际代码中使用统一的错误处理器
 * 
 * @author CloudFlow
 */

import React, { useState } from 'react';
import { AxiosError } from 'axios';
import {
  handleApiError,
  withErrorHandler,
  showSuccess,
  showWarning,
  ApiErrorResponse,
  ConflictStrategy,
} from './errorHandler';
import { ConflictResolutionDialog } from '@/components/ui/ConflictResolutionDialog';
import { WarningConfirmDialog } from '@/components/ui/WarningConfirmDialog';
import request from '@/services/api/request';

/**
 * 示例 1：基本的错误处理
 * 
 * 最简单的用法，自动根据错误类型显示相应的提示
 */
export const Example1_BasicErrorHandling = () => {
  const handleSave = async () => {
    try {
      const result = await request.post('/api/workflow/save', { name: 'test' });
      showSuccess('保存成功');
      return result;
    } catch (error) {
      // 自动处理各种错误类型
      handleApiError(error as AxiosError<ApiErrorResponse>);
    }
  };

  return <button onClick={handleSave}>保存</button>;
};

/**
 * 示例 2：使用 withErrorHandler 包装器
 * 
 * 更简洁的写法，自动捕获和处理错误
 */
export const Example2_WithErrorHandler = () => {
  const handleSave = withErrorHandler(
    async () => {
      const result = await request.post('/api/workflow/save', { name: 'test' });
      showSuccess('保存成功');
      return result;
    },
    { customMessage: '保存流程失败' }
  );

  return <button onClick={handleSave}>保存</button>;
};

/**
 * 示例 3：处理冲突错误
 * 
 * 当导入流程时名称冲突，显示冲突解决对话框
 */
export const Example3_ConflictHandling = () => {
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictData, setConflictData] = useState<{
    resourceName: string;
    message: string;
  } | null>(null);

  const handleImport = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await request.post('/api/workflow/import', formData);
      showSuccess('导入成功');
      return result;
    } catch (error) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorData = axiosError.response?.data;

      // 检查是否是冲突错误
      if (errorData?.code === 'RESOURCE_CONFLICT') {
        // 显示冲突解决对话框
        setConflictData({
          resourceName: errorData.data?.resourceName || '未知资源',
          message: errorData.message || '资源已存在',
        });
        setShowConflictDialog(true);
      } else {
        // 其他错误使用默认处理
        handleApiError(axiosError);
      }
    }
  };

  const handleConflictResolution = async (
    strategy: ConflictStrategy,
    newName?: string
  ) => {
    try {
      // 使用选择的策略重新导入
      const result = await request.post('/api/workflow/import', {
        strategy,
        newName,
      });
      showSuccess('导入成功');
      setShowConflictDialog(false);
      return result;
    } catch (error) {
      handleApiError(error as AxiosError<ApiErrorResponse>);
    }
  };

  return (
    <>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImport(file);
        }}
      />

      {conflictData && (
        <ConflictResolutionDialog
          open={showConflictDialog}
          onClose={() => setShowConflictDialog(false)}
          resourceName={conflictData.resourceName}
          message={conflictData.message}
          onConfirm={handleConflictResolution}
        />
      )}
    </>
  );
};

/**
 * 示例 4：处理运行实例警告
 * 
 * 当回滚版本时，如果有运行中的实例，显示警告确认对话框
 */
export const Example4_RunningInstancesWarning = () => {
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [warningData, setWarningData] = useState<{
    message: string;
    description?: string;
  } | null>(null);
  const [pendingRollback, setPendingRollback] = useState<{
    versionId: string;
    reason: string;
  } | null>(null);

  const handleRollback = async (versionId: string, reason: string) => {
    try {
      const result = await request.post('/api/workflow/versions/rollback', {
        versionId,
        reason,
      });
      showSuccess('版本回滚成功');
      return result;
    } catch (error) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorData = axiosError.response?.data;

      // 检查是否是运行实例警告
      if (errorData?.code === 'RUNNING_INSTANCES_WARNING') {
        // 保存待执行的回滚操作
        setPendingRollback({ versionId, reason });

        // 显示警告确认对话框
        const affectedCount =
          (errorData.data?.affectedWorkflows as string[])?.length || 0;
        setWarningData({
          message: errorData.message || '该流程有正在运行的实例',
          description: `有 ${affectedCount} 个流程实例正在运行，回滚可能影响这些实例的执行`,
        });
        setShowWarningDialog(true);
      } else {
        // 其他错误使用默认处理
        handleApiError(axiosError);
      }
    }
  };

  const handleConfirmRollback = async () => {
    if (!pendingRollback) return;

    try {
      // 强制回滚
      const result = await request.post('/api/workflow/versions/rollback', {
        ...pendingRollback,
        force: true, // 强制回滚标志
      });
      showSuccess('版本回滚成功');
      setShowWarningDialog(false);
      setPendingRollback(null);
      return result;
    } catch (error) {
      handleApiError(error as AxiosError<ApiErrorResponse>);
    }
  };

  return (
    <>
      <button onClick={() => handleRollback('v1.0.0', '修复bug')}>
        回滚版本
      </button>

      {warningData && (
        <WarningConfirmDialog
          open={showWarningDialog}
          onClose={() => {
            setShowWarningDialog(false);
            setPendingRollback(null);
          }}
          title="运行实例警告"
          message={warningData.message}
          description={warningData.description}
          confirmText="强制回滚"
          requireDoubleConfirm={true}
          doubleConfirmText="我已了解风险，确认强制回滚"
          onConfirm={handleConfirmRollback}
          severity="warning"
        />
      )}
    </>
  );
};

/**
 * 示例 5：处理验证错误
 * 
 * 当表单验证失败时，显示字段级别的错误信息
 */
export const Example5_ValidationErrors = () => {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (formData: any) => {
    try {
      const result = await request.post('/api/workflow/templates', formData);
      showSuccess('模板创建成功');
      setFieldErrors({});
      return result;
    } catch (error) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorData = axiosError.response?.data;

      // 检查是否是验证错误
      if (errorData?.code === 'INVALID_REQUEST' && errorData.errors) {
        // 提取字段错误并显示在表单中
        const errors: Record<string, string> = {};
        errorData.errors.forEach((err) => {
          errors[err.field] = err.message;
        });
        setFieldErrors(errors);

        // 同时显示 toast 提示
        handleApiError(axiosError);
      } else {
        // 其他错误使用默认处理
        handleApiError(axiosError);
      }
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        handleSubmit(Object.fromEntries(formData));
      }}
    >
      <div>
        <label>模板名称</label>
        <input name="name" />
        {fieldErrors.name && (
          <span className="text-red-500 text-sm">{fieldErrors.name}</span>
        )}
      </div>

      <div>
        <label>模板描述</label>
        <textarea name="description" />
        {fieldErrors.description && (
          <span className="text-red-500 text-sm">{fieldErrors.description}</span>
        )}
      </div>

      <button type="submit">提交</button>
    </form>
  );
};

/**
 * 示例 6：静默模式
 * 
 * 某些场景下不需要显示错误提示（如轮询、后台任务）
 */
export const Example6_SilentMode = () => {
  const checkStatus = async () => {
    try {
      // 使用静默模式，不显示错误提示
      const result = await request.get('/api/workflow/status', { silent: true });
      return result;
    } catch (error) {
      // 错误被静默处理，不会显示 toast
      console.log('状态检查失败，将在下次轮询时重试');
    }
  };

  return <button onClick={checkStatus}>检查状态</button>;
};

/**
 * 示例 7：自定义错误消息
 * 
 * 为特定操作提供更友好的错误提示
 */
export const Example7_CustomMessage = () => {
  const handleDelete = withErrorHandler(
    async () => {
      await request.delete('/api/workflow/templates/123');
      showSuccess('模板删除成功');
    },
    {
      customMessage: '删除模板失败，请稍后重试',
    }
  );

  return <button onClick={handleDelete}>删除模板</button>;
};
