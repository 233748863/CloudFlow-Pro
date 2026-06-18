import React, { useState } from 'react';
import { AlertTriangle, FileText, Send, X } from 'lucide-react';
import type { FormDefinition, FormField } from '../types';
import { Button, DatePicker, Input, Textarea } from '@/components/common';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './common/select';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import { cn } from '@/utils/cn';

const SELECT_NONE_VALUE = '__NONE__';

interface FormRendererProps {
  formDef: FormDefinition | undefined;
  /** 提交回调（仅自管模式下生效） */
  onSubmit?: (data: Record<string, any>) => void;
  /** 取消/关闭回调（仅自管模式下生效） */
  onCancel?: () => void;
  /** 受控初始数据 / 已存在数据。给出后切换为受控展示模式（替代旧 DynamicFormViewer） */
  data?: Record<string, any>;
  /** 受控变更回调；与 data 配合使用 */
  onChange?: (id: string, value: any) => void;
  /** 只读模式：禁用所有控件，仅展示字段值 */
  readonly?: boolean;
  /** 嵌入式模式：不渲染 Modal 容器（header + 底部按钮），仅渲染字段网格 */
  hideActions?: boolean;
}

const hasValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
};

const normalizeFieldValue = (fieldType: string, rawValue: string): unknown => {
  if (fieldType === 'NUMBER') {
    const trimmed = rawValue.trim();
    if (trimmed === '') return '';
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? rawValue : parsed;
  }
  return rawValue;
};

const formatFieldValue = (field: FormField, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  switch (field.type) {
    case 'DATE': {
      try {
        const date = new Date(value as string | number | Date);
        if (!Number.isNaN(date.getTime())) {
          return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          });
        }
      } catch {
        return String(value);
      }
      return String(value);
    }
    case 'NUMBER': {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        return num.toLocaleString('zh-CN', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        });
      }
      return String(value);
    }
    default:
      return String(value);
  }
};

const readFieldValue = (field: FormField, data: Record<string, any> | undefined): any => {
  if (!data) return undefined;
  if (field.id in data) return data[field.id];
  if (field.label in data) return data[field.label];
  const lowerLabel = field.label.toLowerCase();
  const lowerId = field.id.toLowerCase();
  for (const key of Object.keys(data)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === lowerId || lowerKey === lowerLabel) return data[key];
  }
  return undefined;
};

export const FormRenderer: React.FC<FormRendererProps> = ({
  formDef,
  onSubmit,
  onCancel,
  data,
  onChange,
  readonly = false,
  hideActions = false,
}) => {
  const isControlled = data !== undefined;
  const [internalData, setInternalData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const getValue = (field: FormField): any =>
    isControlled ? readFieldValue(field, data) : internalData[field.id];

  const handleChange = (field: FormField, value: any) => {
    if (isControlled) {
      onChange?.(field.id, value);
    } else {
      setInternalData((prev) => ({ ...prev, [field.id]: value }));
      if (errors[field.id]) {
        setErrors((prev) => ({ ...prev, [field.id]: '' }));
      }
    }
  };

  const handleSubmit = () => {
    if (!formDef?.fields) return;
    const nextErrors: Record<string, string> = {};
    let isValid = true;

    formDef.fields.forEach((field) => {
      const value = internalData[field.id];
      if (field.required && !hasValue(value)) {
        nextErrors[field.id] = '此项必填';
        isValid = false;
        return;
      }
      if (hasValue(value) && field.regex) {
        try {
          const regex = new RegExp(field.regex);
          if (!regex.test(String(value))) {
            nextErrors[field.id] = field.errorMsg || '格式不正确';
            isValid = false;
            return;
          }
        } catch (error) {
          console.error('正则表达式错误', field.regex, error);
        }
      }
      if (hasValue(value) && field.type === 'NUMBER') {
        const parsed = Number(value);
        if (Number.isNaN(parsed)) {
          nextErrors[field.id] = '请输入有效的数字';
          isValid = false;
        }
      }
    });

    if (isValid) {
      onSubmit?.(internalData);
      return;
    }

    setErrors(nextErrors);
    const firstErrorField = formDef.fields.find((field) => nextErrors[field.id]);
    if (firstErrorField) {
      const element = document.getElementById(`field-${firstErrorField.id}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const renderReadOnlyValue = (field: FormField) => {
    const rawValue = getValue(field);
    const displayValue = formatFieldValue(field, rawValue);
    const isEmpty = !hasValue(rawValue);
    return (
      <div className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100">
        {isEmpty ? (
          <span className="italic text-slate-400 dark:text-slate-500">未填写</span>
        ) : (
          displayValue
        )}
      </div>
    );
  };

  const renderFieldControl = (field: FormField) => {
    if (readonly) return renderReadOnlyValue(field);

    const hasError = Boolean(errors[field.id]);
    const controlClassName = cn(
      'rounded-xl',
      hasError && 'border-red-300 bg-red-50 focus-visible:ring-red-200',
    );
    const rawValue = getValue(field);

    if (field.type === 'TEXTAREA') {
      return (
        <Textarea
          rows={3}
          value={rawValue ?? ''}
          placeholder={field.placeholder}
          onChange={(event) => handleChange(field, event.target.value)}
          className={cn('min-h-[104px]', controlClassName)}
        />
      );
    }

    if (field.type === 'SELECT') {
      const currentValue = hasValue(rawValue) ? String(rawValue) : SELECT_NONE_VALUE;
      return (
        <Select
          value={currentValue}
          onValueChange={(value) =>
            handleChange(field, value === SELECT_NONE_VALUE ? '' : value)
          }
        >
          <SelectTrigger className={cn('rounded-xl', hasError && 'border-red-300 bg-red-50')}>
            <SelectValue placeholder={field.placeholder || '请选择'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_NONE_VALUE}>请选择</SelectItem>
            {(field.options || []).map((option, index) => (
              <SelectItem key={`${field.id}-${index}`} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (field.type === 'DATE') {
      return (
        <DatePicker
          type="date"
          value={rawValue ?? ''}
          placeholder={field.placeholder}
          onChange={(event) => handleChange(field, event.target.value)}
          className={cn(hasError && 'border-red-300 bg-red-50')}
        />
      );
    }

    return (
      <Input
        type={field.type === 'NUMBER' ? 'number' : 'text'}
        value={rawValue ?? ''}
        placeholder={field.placeholder}
        onChange={(event) =>
          handleChange(field, normalizeFieldValue(field.type, event.target.value))
        }
        className={controlClassName}
      />
    );
  };

  // ============== 空字段提示 ==============
  if (!formDef?.fields || formDef.fields.length === 0) {
    if (hideActions) {
      return (
        <div className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
          暂无表单字段
        </div>
      );
    }
    return (
      <div className="mx-auto flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)]">
        <div className="border-b border-slate-100 bg-white px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800">
              <AlertTriangle size={18} className="text-amber-600" />
              表单加载失败
            </h3>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="p-5">
          <WorkspaceInlineState
            type="info"
            icon={<AlertTriangle size={18} className="text-amber-500" />}
            title="未找到表单定义"
            description="当前流程没有可用的表单定义，或表单字段为空。请返回上一步重新选择，或联系管理员检查配置。"
            className="py-12"
          />
          <div className="mt-5 flex justify-center">
            <Button variant="outline" onClick={onCancel}>
              关闭
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ============== 嵌入式（替代旧 DynamicFormViewer） ==============
  if (hideActions) {
    return (
      <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
        {formDef.fields.map((field) => (
          <div
            key={field.id}
            id={`field-${field.id}`}
            className={cn('space-y-2', field.type === 'TEXTAREA' && 'sm:col-span-2')}
          >
            <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">
              {field.label}
              {!readonly && field.required ? <span className="text-red-500"> *</span> : null}
            </label>
            {renderFieldControl(field)}
          </div>
        ))}
      </div>
    );
  }

  // ============== 自管模式（原 Modal 表单） ==============
  return (
    <div className="mx-auto flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)] animate-fade-in-up">
      <div className="border-b border-slate-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="flex items-center gap-2 font-bold text-slate-800">
            <FileText size={18} className="text-cyan-700" />
            填写: {formDef.name}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-x-5 gap-y-5 overflow-y-auto p-6 sm:grid-cols-2">
        {formDef.fields.map((field) => (
          <div
            key={field.id}
            id={`field-${field.id}`}
            className={cn('space-y-2', field.type === 'TEXTAREA' && 'sm:col-span-2')}
          >
            <label className="block text-sm font-semibold text-slate-700">
              {field.label}
              {field.required ? <span className="ml-1 text-red-500">*</span> : null}
            </label>

            {renderFieldControl(field)}

            {errors[field.id] ? (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <AlertTriangle size={10} />
                {errors[field.id]}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={handleSubmit}>
          <Send size={16} className="mr-2" />
          提交申请
        </Button>
      </div>
    </div>
  );
};
