import React from 'react';
import { FormDefinition, FormField } from '../types';
const SELECT_NONE_VALUE = '__NONE__';

/**
 * 格式化字段值
 */
function formatFieldValue(field: FormField, value: any): string {
  if (value === null || value === undefined || value === '') return '';

  switch (field.type) {
    case 'DATE':
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
        }
      } catch { /* ignore */ }
      return String(value);

    case 'NUMBER':
      const num = Number(value);
      if (!isNaN(num)) {
        return num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      }
      return String(value);

    case 'SELECT':
      return String(value);

    default:
      return String(value);
  }
}

/**
 * 从数据中获取字段值
 * 统一使用 field.id 作为主键匹配，field.label 作为回退
 */
function getFieldValue(field: FormField, data: Record<string, any>): any {
  // 优先使用 field.id 匹配
  if (field.id in data) return data[field.id];
  // 回退使用 field.label 匹配
  if (field.label in data) return data[field.label];
  // 尝试不区分大小写匹配
  const lowerLabel = field.label.toLowerCase();
  const lowerId = field.id.toLowerCase();
  for (const key of Object.keys(data)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === lowerId || lowerKey === lowerLabel) return data[key];
  }
  return undefined;
}

/**
 * 统一输入值类型：NUMBER 转数字，其他类型原样返回。
 * 清空输入时保留空字符串，避免误转成 0。
 */
function normalizeInputValue(field: FormField, rawValue: string): any {
  if (field.type === 'NUMBER') {
    const trimmed = rawValue.trim();
    if (trimmed === '') return '';
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? rawValue : parsed;
  }
  return rawValue;
}

import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';

export const DynamicFormViewer = ({ 
  formDef, 
  data, 
  allowEdit = false, 
  onChange 
}: { 
  formDef: FormDefinition, 
  data: Record<string, any>,
  allowEdit?: boolean,
  onChange?: (id: string, value: any) => void
}) => {
  if (!formDef || !formDef.fields || formDef.fields.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-slate-400">
        暂无表单字段
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {formDef.fields.map(field => {
        const rawValue = getFieldValue(field, data);
        const displayValue = formatFieldValue(field, rawValue);
        const isEmpty = rawValue === null || rawValue === undefined || rawValue === '';

        return (
          <div key={field.id} className={field.type === 'TEXTAREA' ? 'col-span-2' : ''}>
            <label className="text-xs font-bold text-slate-500 block mb-1">
              {field.label} {allowEdit && field.required && <span className="text-red-500">*</span>}
            </label>
            
            {allowEdit ? (
              field.type === 'TEXTAREA' ? (
                <textarea
                  className="w-full p-2 text-sm border rounded-lg focus:ring-2 focus:ring-pink-400 outline-none transition-all border-slate-300"
                  rows={3}
                  placeholder={field.placeholder || '请输入...'}
                  value={rawValue ?? ''}
                  onChange={e => onChange?.(field.id, e.target.value)}
                />
              ) : field.type === 'SELECT' ? (
                <Select
                  value={
                    rawValue !== null && rawValue !== undefined && rawValue !== ''
                      ? String(rawValue)
                      : SELECT_NONE_VALUE
                  }
                  onValueChange={v => onChange?.(field.id, v === SELECT_NONE_VALUE ? '' : v)}
                >
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder={field.placeholder || "请选择"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>请选择</SelectItem>
                    {(field.options || []).map((opt, idx) => (
                      <SelectItem key={idx} value={String(opt)}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <input
                  type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                  className="w-full p-2 text-sm border rounded-lg focus:ring-2 focus:ring-pink-400 outline-none transition-all border-slate-300"
                  placeholder={field.placeholder || '请输入...'}
                  value={rawValue ?? ''}
                  onChange={e => onChange?.(field.id, normalizeInputValue(field, e.target.value))}
                />
              )
            ) : (
              <div className="p-2 bg-slate-100 rounded text-sm text-slate-800 border border-slate-200 min-h-[38px]">
                {isEmpty 
                  ? <span className="text-slate-400 italic">未填写</span>
                  : displayValue
                }
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
