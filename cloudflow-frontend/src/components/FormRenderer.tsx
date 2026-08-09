import React, { useState } from 'react';
import { AlertTriangle, FileText, Send } from 'lucide-react';
import type { FormDefinition, FormField } from '../types';
import {
  BaseDialog,
  Button,
  DatePicker,
  DeptSelector,
  EmployeeSelector,
  Input,
  PositionSelector,
  PostSelector,
  Textarea,
} from '@/components/common';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './common/select';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import { cn } from '@/utils/cn';
import {
  applyFieldFillMappings,
  getFieldDisplayValue,
  supportsMasterDataSelect,
} from '@/utils/formFieldRuntime';

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

  const getRuntimeData = () => (isControlled ? data || {} : internalData);

  const handleChange = (field: FormField, value: any, extraUpdates: Record<string, any> = {}) => {
    if (isControlled) {
      onChange?.(field.id, value);
      Object.entries(extraUpdates).forEach(([id, nextValue]) => onChange?.(id, nextValue));
    } else {
      setInternalData((prev) => ({ ...prev, [field.id]: value, ...extraUpdates }));
      if (errors[field.id]) {
        setErrors((prev) => {
          const next = { ...prev, [field.id]: '' };
          Object.keys(extraUpdates).forEach((id) => {
            if (next[id]) next[id] = '';
          });
          return next;
        });
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
    const displayRawValue = getFieldDisplayValue(field, getRuntimeData(), rawValue);
    const displayValue = formatFieldValue(field, displayRawValue);
    const isEmpty = !hasValue(displayRawValue);
    return (
      <div className="min-h-[44px] bg-[var(--cf-surface-muted)] px-4 py-3 text-sm text-cf-title dark:bg-slate-900/70">
        {isEmpty ? (
          <span className="italic text-cf-faint">未填写</span>
        ) : (
          displayValue
        )}
      </div>
    );
  };

  const renderFieldControl = (field: FormField) => {
    if (readonly || field.readonly) return renderReadOnlyValue(field);

    const hasError = Boolean(errors[field.id]);
    const controlClassName = cn(
      'rounded-md',
      hasError && 'border-red-300 bg-red-50 focus-visible:ring-red-200',
    );
    const rawValue = getValue(field);

    if (field.type === 'EMPLOYEE') {
      return (
        <EmployeeSelector
          single
          value={rawValue ?? null}
          onlyActive={field.onlyActive !== false}
          placeholder={field.placeholder || '选择员工'}
          allowClear
          onChange={(id, picked) =>
            handleChange(field, id ?? '', applyFieldFillMappings(field, picked))
          }
        />
      );
    }

    if (field.type === 'DEPT') {
      return (
        <DeptSelector
          single
          value={rawValue ?? null}
          placeholder={field.placeholder || '选择部门'}
          allowClear
          onChange={(id, picked) =>
            handleChange(field, id ?? '', applyFieldFillMappings(field, picked))
          }
        />
      );
    }

    if (field.type === 'POST') {
      return (
        <PostSelector
          single
          value={rawValue ?? null}
          placeholder={field.placeholder || '选择岗位'}
          allowClear
          onChange={(id, picked) =>
            handleChange(field, id ?? '', applyFieldFillMappings(field, picked))
          }
        />
      );
    }

    if (field.type === 'POSITION') {
      const deptFilterValue = field.filterByDeptFieldId
        ? Number(getRuntimeData()[field.filterByDeptFieldId])
        : null;
      return (
        <PositionSelector
          single
          value={rawValue ?? null}
          deptId={Number.isFinite(deptFilterValue) ? deptFilterValue : null}
          placeholder={field.placeholder || '选择职位'}
          allowClear
          onChange={(id, picked) =>
            handleChange(field, id ?? '', applyFieldFillMappings(field, picked))
          }
        />
      );
    }

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
          <SelectTrigger className={cn('rounded-md', hasError && 'border-red-300 bg-red-50')}>
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

    const inputValue = supportsMasterDataSelect(field)
      ? getFieldDisplayValue(field, getRuntimeData(), rawValue)
      : rawValue;

    return (
      <Input
        type={field.type === 'NUMBER' ? 'number' : 'text'}
        value={inputValue ?? ''}
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
        <div className="py-4 text-center text-sm text-cf-faint">
          暂无表单字段
        </div>
      );
    }
    return (
      <BaseDialog
        open
        title="表单加载失败"
        headerAside={<AlertTriangle size={18} className="text-amber-500" />}
        onClose={() => onCancel?.()}
        maxWidthClassName="w-full max-w-2xl"
        footer={<Button variant="outline" onClick={onCancel}>关闭</Button>}
      >
        <WorkspaceInlineState
          type="info"
          icon={<AlertTriangle size={18} className="text-amber-500" />}
          title="未找到表单定义"
          description="当前流程没有可用的表单定义，或表单字段为空。请返回上一步重新选择，或联系管理员检查配置。"
          className="py-12"
        />
      </BaseDialog>
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
            className={cn('admin-dialog-field', field.type === 'TEXTAREA' && 'sm:col-span-2')}
          >
            <label className="mb-1 block text-xs font-bold text-cf-subtle">
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
    <BaseDialog
      open
      title={`填写: ${formDef.name}`}
      headerAside={<FileText size={18} className="text-cyan-700 dark:text-cyan-300" />}
      onClose={() => onCancel?.()}
      width="wide"
      maxWidthClassName="w-full max-w-2xl"
      bodyClassName="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2"
      footer={(
        <>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={handleSubmit}>
            <Send size={16} className="mr-2" />
            提交申请
          </Button>
        </>
      )}
    >
        {formDef.fields.map((field) => (
          <div
            key={field.id}
            id={`field-${field.id}`}
            className={cn('admin-dialog-field', field.type === 'TEXTAREA' && 'sm:col-span-2')}
          >
            <label className="block text-sm font-semibold text-cf-body">
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
    </BaseDialog>
  );
};
