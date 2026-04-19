import React, { useState } from 'react';
import { FormDefinition, FormField } from '../../types';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { DatePicker } from '../ui/date-picker';

interface MobileFormRendererProps {
  formDef: FormDefinition;
  initialData?: Record<string, any>;
  onSubmit: (data: Record<string, any>) => void;
  onBack?: () => void;
  readOnly?: boolean;
  title?: string;
}

/**
 * 移动端表单渲染组件
 * 适配移动端屏幕，提供友好的表单填写体验
 */
export const MobileFormRenderer: React.FC<MobileFormRendererProps> = ({
  formDef,
  initialData = {},
  onSubmit,
  onBack,
  readOnly = false,
  title,
}) => {
  const [formData, setFormData] = useState<Record<string, any>>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    // 清除该字段的错误
    if (errors[fieldId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    formDef.fields.forEach((field) => {
      const val = formData[field.id];

      // 必填校验
      if (field.required && (!val || String(val).trim() === '')) {
        newErrors[field.id] = '此项必填';
        isValid = false;
      }
      // 正则校验
      else if (val && field.regex) {
        try {
          const regex = new RegExp(field.regex);
          if (!regex.test(String(val))) {
            newErrors[field.id] = field.errorMsg || '格式不正确';
            isValid = false;
          }
        } catch (e) {
          console.error('Invalid regex:', field.regex, e);
        }
      }
      // 数字类型校验
      else if (val && field.type === 'NUMBER') {
        const num = Number(val);
        if (isNaN(num)) {
          newErrors[field.id] = '请输入有效的数字';
          isValid = false;
        }
      }
    });

    if (!isValid) {
      setErrors(newErrors);
      // 滚动到第一个错误字段
      const firstErrorField = formDef.fields.find((f) => newErrors[f.id]);
      if (firstErrorField) {
        const element = document.getElementById(`mobile-field-${firstErrorField.id}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;

    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const renderField = (field: FormField) => {
    const val = formData[field.id];
    const error = errors[field.id];
    const hasError = !!error;

    const inputClassName = `w-full px-3 py-2.5 text-base border rounded-lg focus:outline-none transition-colors ${
      hasError
        ? 'border-red-300 bg-red-50 focus:border-red-500'
        : 'border-slate-200 bg-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15'
    } ${readOnly ? 'bg-slate-50 text-slate-600' : ''}`;

    return (
      <div key={field.id} id={`mobile-field-${field.id}`} className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>

        {field.type === 'TEXT' && (
          <input
            type="text"
            value={val || ''}
            onChange={(e) => handleChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            disabled={readOnly}
            className={inputClassName}
          />
        )}

        {field.type === 'NUMBER' && (
          <input
            type="number"
            value={val || ''}
            onChange={(e) => handleChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            disabled={readOnly}
            className={inputClassName}
          />
        )}

        {field.type === 'DATE' && (
          <DatePicker
            type="date"
            value={val || ''}
            onChange={(e) => handleChange(field.id, e.target.value)}
            disabled={readOnly}
            className="w-full"
          />
        )}

        {field.type === 'SELECT' && (
          <Select value={val || ''} onValueChange={v => handleChange(field.id, v)}>
            <SelectTrigger>
              <SelectValue placeholder="请选择" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">请选择</SelectItem>
              {(field.options || []).map((opt, idx) => (
                <SelectItem key={idx} value={String(opt)}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {field.type === 'TEXTAREA' && (
          <textarea
            value={val || ''}
            onChange={(e) => handleChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            disabled={readOnly}
            rows={4}
            className={`${inputClassName} resize-none`}
          />
        )}

        {hasError && (
          <div className="flex items-center gap-1 mt-1.5 text-red-500 text-xs">
            <AlertCircle size={12} />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 顶部导航 */}
      {onBack && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white sticky top-0 z-30">
          <button onClick={onBack} className="p-1">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <h2 className="text-base font-semibold text-slate-800 truncate flex-1">
            {title || formDef.name || '表单'}
          </h2>
        </div>
      )}

      {/* 表单内容 */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
        <div className="px-4 py-4">
          {formDef.fields.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-8">表单无字段</div>
          ) : (
            formDef.fields.map(renderField)
          )}
        </div>

        {/* 底部提交按钮 */}
        {!readOnly && (
          <div className="sticky bottom-0 px-4 py-3 bg-white border-t border-slate-200 safe-area-bottom">
            <button
              type="submit"
              className="w-full rounded-xl bg-cyan-600 py-3 text-base font-medium text-white transition-colors hover:bg-cyan-700 active:bg-cyan-800"
            >
              提交
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
