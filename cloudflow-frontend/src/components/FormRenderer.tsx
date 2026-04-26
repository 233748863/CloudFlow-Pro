import React, { useState } from 'react';
import { AlertTriangle, FileText, Send, X } from 'lucide-react';
import type { FormDefinition } from '../types';
import { Button, Input, Textarea } from '@/components/common';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './common/select';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import { cn } from '@/utils/cn';

export const FormRenderer = ({
  formDef,
  onSubmit,
  onCancel,
}: {
  formDef: FormDefinition | undefined;
  onSubmit: (data: Record<string, any>) => void;
  onCancel: () => void;
}) => {
  const SELECT_NONE_VALUE = '__NONE__';
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const hasValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
  };

  const normalizeFieldValue = (fieldType: string, rawValue: string) => {
    if (fieldType === 'NUMBER') {
      const trimmed = rawValue.trim();
      if (trimmed === '') return '';
      const parsed = Number(trimmed);
      return Number.isNaN(parsed) ? rawValue : parsed;
    }
    return rawValue;
  };

  const handleChange = (id: string, value: any) => {
    setFormData((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) {
      setErrors((prev) => ({ ...prev, [id]: '' }));
    }
  };

  const handleSubmit = () => {
    if (!formDef?.fields) return;

    const nextErrors: Record<string, string> = {};
    let isValid = true;

    formDef.fields.forEach((field) => {
      const value = formData[field.id];

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
      onSubmit(formData);
      return;
    }

    setErrors(nextErrors);
    const firstErrorField = formDef.fields.find((field) => nextErrors[field.id]);
    if (firstErrorField) {
      const element = document.getElementById(`field-${firstErrorField.id}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const renderFieldControl = (field: FormDefinition['fields'][number]) => {
    const hasError = Boolean(errors[field.id]);
    const controlClassName = cn(
      'rounded-xl',
      hasError && 'border-red-300 bg-red-50 focus-visible:ring-red-200',
    );

    if (field.type === 'TEXTAREA') {
      return (
        <Textarea
          rows={3}
          value={formData[field.id] ?? ''}
          placeholder={field.placeholder}
          onChange={(event) => handleChange(field.id, event.target.value)}
          className={cn('min-h-[104px]', controlClassName)}
        />
      );
    }

    if (field.type === 'SELECT') {
      const currentValue =
        formData[field.id] === undefined || formData[field.id] === null || formData[field.id] === ''
          ? SELECT_NONE_VALUE
          : String(formData[field.id]);

      return (
        <Select
          value={currentValue}
          onValueChange={(value) => handleChange(field.id, value === SELECT_NONE_VALUE ? '' : value)}
        >
          <SelectTrigger className={cn('h-11 rounded-xl', hasError && 'border-red-300 bg-red-50')}>
            <SelectValue placeholder="请选择" />
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

    return (
      <Input
        type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
        value={formData[field.id] ?? ''}
        placeholder={field.placeholder}
        onChange={(event) => handleChange(field.id, normalizeFieldValue(field.type, event.target.value))}
        className={cn('h-11', controlClassName)}
      />
    );
  };

  if (!formDef?.fields || formDef.fields.length === 0) {
    return (
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)]">
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

  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)] animate-fade-in-up">
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

      <div className="max-h-[60vh] space-y-5 overflow-y-auto p-6">
        {formDef.fields.map((field) => (
          <div key={field.id} id={`field-${field.id}`} className="space-y-2">
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
