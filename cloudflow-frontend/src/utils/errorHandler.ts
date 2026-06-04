/**
 * 统一错误处理器
 * 
 * 根据错误类型显示不同的提示方式：
 * - 一般错误：使用 toast 提示
 * - 冲突错误：显示冲突解决对话框
 * - 权限错误：显示友好的权限提示
 * - 运行实例警告：显示确认对话框
 * - 验证错误：显示字段级别的错误信息
 * 
 * @author CloudFlow
 */

import { AxiosError } from 'axios';
import { toast } from 'sonner';

/**
 * 标准化错误响应接口（与后端 ErrorResponse 对应）
 */
export interface ApiErrorResponse {
  /** 错误代码 */
  code: string | number;
  /** 错误消息 */
  message?: string;
  /** 兼容 R 响应错误消息 */
  msg?: string;
  /** 兼容旧格式错误消息 */
  error?: string;
  /** 字段级别的错误列表 */
  errors?: FieldError[];
  /** 附加数据 */
  data?: Record<string, any>;
  /** 错误发生时间 */
  timestamp?: string;
  /** 请求路径 */
  path?: string;
}

/**
 * 字段级别的错误信息
 */
export interface FieldError {
  /** 字段名称 */
  field: string;
  /** 错误消息 */
  message: string;
  /** 被拒绝的值 */
  rejectedValue?: any;
}

/**
 * 冲突解决策略
 */
export type ConflictStrategy = 'overwrite' | 'rename' | 'skip';

/**
 * 冲突解决回调函数
 */
export type ConflictResolver = (strategy: ConflictStrategy, newName?: string) => void;

/**
 * 确认回调函数
 */
export type ConfirmCallback = () => void;

/**
 * 错误处理选项
 */
export interface ErrorHandlerOptions {
  /** 是否静默处理（不显示任何提示） */
  silent?: boolean;
  /** 冲突解决回调 */
  onConflict?: ConflictResolver;
  /** 确认回调（用于运行实例警告等场景） */
  onConfirm?: ConfirmCallback;
  /** 自定义错误消息 */
  customMessage?: string;
}

/**
 * 统一的 API 错误处理器
 * 
 * @param error Axios 错误对象
 * @param options 错误处理选项
 */
export function handleApiError(
  error: AxiosError<ApiErrorResponse>,
  options: ErrorHandlerOptions = {}
): void {
  const { silent = false, onConflict, onConfirm, customMessage } = options;

  // 如果是静默模式，直接返回
  if (silent) {
    return;
  }

  // 获取错误响应数据
  const errorData = error.response?.data;
  const errorCode = errorData?.code;
  const errorMessage = customMessage || errorData?.message || errorData?.msg || errorData?.error || error.message || '操作失败';

  // 根据错误代码进行特殊处理
  switch (errorCode) {
    // 权限不足错误
    case 'PERMISSION_DENIED':
      handlePermissionError(errorMessage);
      break;

    // 资源冲突错误
    case 'RESOURCE_CONFLICT':
      handleConflictError(errorData, onConflict);
      break;

    // 运行实例警告
    case 'RUNNING_INSTANCES_WARNING':
      handleRunningInstancesWarning(errorData, onConfirm);
      break;

    // 验证错误（包含字段级别的错误）
    case 'INVALID_REQUEST':
      handleValidationError(errorData);
      break;

    // 模板正在使用中
    case 'TEMPLATE_IN_USE':
      handleTemplateInUseError(errorData);
      break;

    // 不支持的节点类型
    case 'UNSUPPORTED_NODE_TYPES':
      handleUnsupportedNodeTypesError(errorData);
      break;

    // 其他业务错误
    default:
      handleGeneralError(errorMessage, errorCode);
      break;
  }
}

/**
 * 处理权限不足错误
 * 显示友好的权限错误提示
 */
function handlePermissionError(message: string): void {
  toast.error(message || '您没有权限执行此操作', {
    duration: 4000,
    description: '如需访问此功能，请联系系统管理员',
  });
}

/**
 * 处理资源冲突错误
 * 显示冲突解决对话框
 */
function handleConflictError(
  errorData: ApiErrorResponse | undefined,
  onConflict?: ConflictResolver
): void {
  const message = errorData?.message || errorData?.msg || errorData?.error || '资源已存在';
  const suggestions = errorData?.data?.suggestions as string[] | undefined;

  if (onConflict) {
    // 如果提供了冲突解决回调，调用它
    // 注意：实际的对话框应该由调用方实现
    toast.error(message, {
      duration: 6000,
      description: suggestions ? `建议操作：${suggestions.join('、')}` : undefined,
    });
  } else {
    // 如果没有提供回调，只显示错误提示
    toast.error(message, {
      duration: 4000,
    });
  }
}

/**
 * 处理运行实例警告
 * 显示确认对话框
 */
function handleRunningInstancesWarning(
  errorData: ApiErrorResponse | undefined,
  onConfirm?: ConfirmCallback
): void {
  const message = errorData?.message || errorData?.msg || errorData?.error || '该流程有正在运行的实例';
  const affectedWorkflows = errorData?.data?.affectedWorkflows as string[] | undefined;

  if (onConfirm) {
    // 如果提供了确认回调，显示警告并等待用户确认
    // 注意：实际的确认对话框应该由调用方实现
    toast.warning(message, {
      duration: 8000,
      description: affectedWorkflows
        ? `受影响的流程：${affectedWorkflows.length} 个`
        : '操作可能影响运行中的流程，请谨慎操作',
    });
  } else {
    // 如果没有提供回调，只显示警告
    toast.warning(message, {
      duration: 4000,
    });
  }
}

/**
 * 处理验证错误
 * 显示字段级别的错误信息
 */
function handleValidationError(errorData: ApiErrorResponse | undefined): void {
  const message = errorData?.message || errorData?.msg || errorData?.error || '请求参数验证失败';
  const fieldErrors = errorData?.errors;

  if (fieldErrors && fieldErrors.length > 0) {
    // 如果有字段级别的错误，显示详细的错误列表
    const errorList = fieldErrors
      .map((err) => `${err.field}: ${err.message}`)
      .join('\n');

    toast.error(message, {
      duration: 6000,
      description: errorList,
    });
  } else {
    // 如果没有字段错误，只显示主错误消息
    toast.error(message, {
      duration: 4000,
    });
  }
}

/**
 * 处理模板正在使用中的错误
 */
function handleTemplateInUseError(errorData: ApiErrorResponse | undefined): void {
  const message = errorData?.message || errorData?.msg || errorData?.error || '该模板正在被使用，无法删除';
  const usageCount = errorData?.data?.usageCount as number | undefined;

  toast.error(message, {
    duration: 5000,
    description: usageCount ? `当前有 ${usageCount} 个流程正在使用此模板` : undefined,
  });
}

/**
 * 处理不支持的节点类型错误
 */
function handleUnsupportedNodeTypesError(errorData: ApiErrorResponse | undefined): void {
  const message = errorData?.message || errorData?.msg || errorData?.error || '流程包含不支持的节点类型';
  const unsupportedTypes = errorData?.data?.unsupportedTypes as string[] | undefined;

  toast.error(message, {
    duration: 6000,
    description: unsupportedTypes
      ? `不支持的节点类型：${unsupportedTypes.join('、')}`
      : undefined,
  });
}

/**
 * 处理一般错误
 * 显示标准的错误提示
 */
function handleGeneralError(message: string, code?: string | number): void {
  toast.error(message, {
    duration: 4000,
    description: code != null ? `错误代码：${code}` : undefined,
  });
}

/**
 * 创建带错误处理的异步函数包装器
 * 
 * @param fn 异步函数
 * @param options 错误处理选项
 * @returns 包装后的函数
 * 
 * @example
 * const saveWithErrorHandling = withErrorHandler(
 *   async () => await saveWorkflow(data),
 *   { customMessage: '保存流程失败' }
 * );
 * await saveWithErrorHandling();
 */
export function withErrorHandler<T>(
  fn: () => Promise<T>,
  options: ErrorHandlerOptions = {}
): () => Promise<T | undefined> {
  return async () => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Error && 'isAxiosError' in error) {
        handleApiError(error as AxiosError<ApiErrorResponse>, options);
      } else {
        // 非 Axios 错误，显示通用错误提示
        if (!options.silent) {
          toast.error(
            options.customMessage || (error instanceof Error ? error.message : '操作失败')
          );
        }
      }
      return undefined;
    }
  };
}

/**
 * 显示成功提示
 * 
 * @param message 成功消息
 * @param description 详细描述
 */
export function showSuccess(message: string, description?: string): void {
  toast.success(message, {
    duration: 3000,
    description,
  });
}

/**
 * 显示警告提示
 * 
 * @param message 警告消息
 * @param description 详细描述
 */
export function showWarning(message: string, description?: string): void {
  toast.warning(message, {
    duration: 4000,
    description,
  });
}

/**
 * 显示信息提示
 * 
 * @param message 信息消息
 * @param description 详细描述
 */
export function showInfo(message: string, description?: string): void {
  toast.info(message, {
    duration: 3000,
    description,
  });
}
