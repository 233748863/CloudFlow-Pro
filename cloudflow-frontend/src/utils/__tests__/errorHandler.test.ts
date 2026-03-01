/**
 * 错误处理器单元测试
 * 
 * 测试各种错误类型的处理逻辑
 * 
 * @author CloudFlow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError } from 'axios';
import {
  handleApiError,
  withErrorHandler,
  ApiErrorResponse,
} from '../errorHandler';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from 'sonner';

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleApiError', () => {
    it('应该处理权限不足错误', () => {
      const error: AxiosError<ApiErrorResponse> = {
        response: {
          data: {
            code: 'PERMISSION_DENIED',
            message: '您没有权限执行此操作',
          },
          status: 403,
          statusText: 'Forbidden',
          headers: {},
          config: {} as any,
        },
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed',
        config: {} as any,
      };

      handleApiError(error);

      expect(toast.error).toHaveBeenCalledWith(
        '您没有权限执行此操作',
        expect.objectContaining({
          duration: 4000,
          description: '如需访问此功能，请联系系统管理员',
        })
      );
    });

    it('应该处理验证错误', () => {
      const error: AxiosError<ApiErrorResponse> = {
        response: {
          data: {
            code: 'INVALID_REQUEST',
            message: '请求参数验证失败',
            errors: [
              { field: 'name', message: '名称不能为空' },
              { field: 'description', message: '描述不能为空' },
            ],
          },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          config: {} as any,
        },
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed',
        config: {} as any,
      };

      handleApiError(error);

      expect(toast.error).toHaveBeenCalledWith(
        '请求参数验证失败',
        expect.objectContaining({
          duration: 6000,
          description: expect.stringContaining('name: 名称不能为空'),
        })
      );
    });

    it('应该处理模板正在使用错误', () => {
      const error: AxiosError<ApiErrorResponse> = {
        response: {
          data: {
            code: 'TEMPLATE_IN_USE',
            message: '该模板正在被使用，无法删除',
            data: {
              usageCount: 5,
            },
          },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          config: {} as any,
        },
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed',
        config: {} as any,
      };

      handleApiError(error);

      expect(toast.error).toHaveBeenCalledWith(
        '该模板正在被使用，无法删除',
        expect.objectContaining({
          duration: 5000,
          description: '当前有 5 个流程正在使用此模板',
        })
      );
    });

    it('应该处理不支持的节点类型错误', () => {
      const error: AxiosError<ApiErrorResponse> = {
        response: {
          data: {
            code: 'UNSUPPORTED_NODE_TYPES',
            message: '流程包含不支持的节点类型',
            data: {
              unsupportedTypes: ['customNode1', 'customNode2'],
            },
          },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          config: {} as any,
        },
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed',
        config: {} as any,
      };

      handleApiError(error);

      expect(toast.error).toHaveBeenCalledWith(
        '流程包含不支持的节点类型',
        expect.objectContaining({
          duration: 6000,
          description: '不支持的节点类型：customNode1、customNode2',
        })
      );
    });

    it('应该处理一般错误', () => {
      const error: AxiosError<ApiErrorResponse> = {
        response: {
          data: {
            code: 'UNKNOWN_ERROR',
            message: '未知错误',
          },
          status: 500,
          statusText: 'Internal Server Error',
          headers: {},
          config: {} as any,
        },
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed',
        config: {} as any,
      };

      handleApiError(error);

      expect(toast.error).toHaveBeenCalledWith(
        '未知错误',
        expect.objectContaining({
          duration: 4000,
          description: '错误代码：UNKNOWN_ERROR',
        })
      );
    });

    it('应该支持静默模式', () => {
      const error: AxiosError<ApiErrorResponse> = {
        response: {
          data: {
            code: 'UNKNOWN_ERROR',
            message: '未知错误',
          },
          status: 500,
          statusText: 'Internal Server Error',
          headers: {},
          config: {} as any,
        },
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed',
        config: {} as any,
      };

      handleApiError(error, { silent: true });

      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('withErrorHandler', () => {
    it('应该成功执行函数并返回结果', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const wrappedFn = withErrorHandler(mockFn);

      const result = await wrappedFn();

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('应该捕获错误并处理', async () => {
      const error: AxiosError<ApiErrorResponse> = {
        response: {
          data: {
            code: 'UNKNOWN_ERROR',
            message: '操作失败',
          },
          status: 500,
          statusText: 'Internal Server Error',
          headers: {},
          config: {} as any,
        },
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed',
        config: {} as any,
      };

      const mockFn = vi.fn().mockRejectedValue(error);
      const wrappedFn = withErrorHandler(mockFn);

      const result = await wrappedFn();

      expect(result).toBeUndefined();
      expect(mockFn).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalled();
    });

    it('应该使用自定义错误消息', async () => {
      const error = new Error('原始错误');
      const mockFn = vi.fn().mockRejectedValue(error);
      const wrappedFn = withErrorHandler(mockFn, {
        customMessage: '自定义错误消息',
      });

      await wrappedFn();

      expect(toast.error).toHaveBeenCalledWith('自定义错误消息');
    });
  });
});
