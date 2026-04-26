import React from 'react';
import { FormDefinition, FormField } from '../types';
import { DatePicker } from './common/date-picker';
import { Input } from './common/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './common/select';
import { Textarea } from './common/textarea';

const SELECT_NONE_VALUE = '__NONE__';

function formatFieldValue(field: FormField, value: any): string {
  if (value === null || value === undefined || value === '') return '';

  switch (field.type) {
    case 'DATE': {
      try {
        const date = new Date(value);
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
    case 'SELECT':
      return String(value);
    default:
      return String(value);
  }
}

function getFieldValue(field: FormField, data: Record<string, any>): any {
  if (field.id in data) return data[field.id];
  if (field.label in data) return data[field.label];

  const lowerLabel = field.label.toLowerCase();
  const lowerId = field.id.toLowerCase();

  for (const key of Object.keys(data)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === lowerId || lowerKey === lowerLabel) {
      return data[key];
    }
  }

  return undefined;
}

function normalizeInputValue(field: FormField, rawValue: string): any {
  if (field.type === 'NUMBER') {
    const trimmed = rawValue.trim();
    if (trimmed === '') return '';
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? rawValue : parsed;
  }

  return rawValue;
}

export const DynamicFormViewer = ({
  formDef,
  data,
  allowEdit = false,
  onChange,
}: {
  formDef: FormDefinition;
  data: Record<string, any>;
  allowEdit?: boolean;
  onChange?: (id: string, value: any) => void;
}) => {
  if (!formDef || !formDef.fields || formDef.fields.length === 0) {
    return <div className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">暂无表单字段</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {formDef.fields.map((field) => {
        const rawValue = getFieldValue(field, data);
        const displayValue = formatFieldValue(field, rawValue);
        const isEmpty = rawValue === null || rawValue === undefined || rawValue === '';

        return (
          <div key={field.id} className={field.type === 'TEXTAREA' ? 'col-span-2' : ''}>
            <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">
              {field.label}
              {allowEdit && field.required ? <span className="text-red-500"> *</span> : null}
            </label>

            {allowEdit ? (
              field.type === 'TEXTAREA' ? (
                <Textarea
                  className="min-h-[88px] text-sm"
                  rows={3}
                  placeholder={field.placeholder || '请输入内容...'}
                  value={rawValue ?? ''}
                  onChange={(event) => onChange?.(field.id, event.target.value)}
                />
              ) : field.type === 'SELECT' ? (
                <Select
                  value={
                    rawValue !== null && rawValue !== undefined && rawValue !== ''
                      ? String(rawValue)
                      : SELECT_NONE_VALUE
                  }
                  onValueChange={(value) =>
                    onChange?.(field.id, value === SELECT_NONE_VALUE ? '' : value)
                  }
                >
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder={field.placeholder || '请选择'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>请选择</SelectItem>
                    {(field.options || []).map((option, index) => (
                      <SelectItem key={index} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === 'DATE' ? (
                <DatePicker
                  type="date"
                  className="w-full"
                  value={rawValue ?? ''}
                  onChange={(event) => onChange?.(field.id, event.target.value)}
                />
              ) : (
                <Input
                  type={field.type === 'NUMBER' ? 'number' : 'text'}
                  className="text-sm"
                  placeholder={field.placeholder || '请输入内容...'}
                  value={rawValue ?? ''}
                  onChange={(event) =>
                    onChange?.(field.id, normalizeInputValue(field, event.target.value))
                  }
                />
              )
            ) : (
              <div className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100">
                {isEmpty ? <span className="italic text-slate-400 dark:text-slate-500">未填写</span> : displayValue}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
