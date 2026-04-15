import React, { useState } from 'react';
import { FormDefinition } from '../types';
import { FileText, X, AlertTriangle, Send } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';

export const FormRenderer = ({ 
  formDef, 
  onSubmit, 
  onCancel 
}: { 
  formDef: FormDefinition | undefined, 
  onSubmit: (data: Record<string, any>) => void,
  onCancel: () => void
}) => {
  const SELECT_NONE_VALUE = '__NONE__';
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * 判定字段是否“有值”：
   * - 0/false 视为有效值；
   * - null/undefined/空白字符串视为无值。
   */
  const hasValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
  };

  /**
   * 统一输入值类型：NUMBER 转数字，其他类型保持原值。
   * 清空输入时返回空字符串，避免 Number("") 变成 0。
   */
  const normalizeFieldValue = (fieldType: string, rawValue: string) => {
    if (fieldType === 'NUMBER') {
      const trimmed = rawValue.trim();
      if (trimmed === '') return '';
      const parsed = Number(trimmed);
      return Number.isNaN(parsed) ? rawValue : parsed;
    }
    return rawValue;
  };

  // 如果没有表单定义，显示错误状态
  if (!formDef || !formDef.fields || formDef.fields.length === 0) {
    return (
      <div className="max-w-2xl mx-auto overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] shadow-[0_24px_60px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-xl">
        <div className="relative overflow-hidden border-b border-white/70 px-6 py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_58%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.1),transparent_52%)]" />
          <div className="relative flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600"/>
            表单加载失败
          </h3>
          <button onClick={onCancel}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
          </div>
        </div>
        <div className="p-6">
          <WorkspaceInlineState
            type="info"
            icon={<AlertTriangle size={18} className="text-amber-500" />}
            title="未找到表单定义"
            description="当前流程没有可用的表单定义，或表单字段为空。请返回上一步重新选择，或联系管理员检查配置。"
            className="py-12"
          />
          <div className="mt-5 flex justify-center">
            <button 
              onClick={onCancel}
              className="rounded-2xl border border-white/85 bg-white/76 px-6 py-2 text-sm font-medium text-slate-700 shadow-[0_10px_20px_rgba(15,23,42,0.04)] transition hover:bg-white"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleChange = (id: string, value: any) => {
    setFormData(prev => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors(prev => ({ ...prev, [id]: '' }));
  };

  const handleSubmit = () => {
    if (!formDef || !formDef.fields) return;
    
    const newErrors: Record<string, string> = {};
    let isValid = true;

    // 统一使用 field.id 作为键
    formDef.fields.forEach(field => {
      const val = formData[field.id];
      
      // 必填校验
      if (field.required && !hasValue(val)) {
        newErrors[field.id] = '此项必填';
        isValid = false;
      } 
      // 正则校验
      else if (hasValue(val) && field.regex) {
        try {
          const regex = new RegExp(field.regex);
          if (!regex.test(String(val))) {
            newErrors[field.id] = field.errorMsg || '格式不正确';
            isValid = false;
          }
        } catch(e) {
          console.error('正则表达式错误:', field.regex, e);
        }
      }
      // 数字类型校验
      else if (hasValue(val) && field.type === 'NUMBER') {
        const num = Number(val);
        if (isNaN(num)) {
          newErrors[field.id] = '请输入有效的数字';
          isValid = false;
        }
      }
    });

    if (isValid) {
      onSubmit(formData);
    } else {
      setErrors(newErrors);
      // 滚动到第一个错误字段
      const firstErrorField = formDef.fields.find(f => newErrors[f.id]);
      if (firstErrorField) {
        const element = document.getElementById(`field-${firstErrorField.id}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] shadow-[0_24px_60px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-xl animate-fade-in-up">
      <div className="relative overflow-hidden border-b border-white/70 px-6 py-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.12),transparent_58%),radial-gradient(circle_at_top_right,rgba(125,211,252,0.1),transparent_52%)]" />
        <div className="relative flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <FileText size={18} className="text-pink-500"/>
            填写: {formDef.name}
          </h3>
          <button onClick={onCancel}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
        </div>
      </div>
      <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
        {formDef.fields.map(field => (
          <div key={field.id} id={`field-${field.id}`} className="space-y-1">
            <label className="block text-sm font-bold text-slate-700">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            {field.type === 'TEXTAREA' ? (
              <textarea
                className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-pink-400 outline-none transition-all ${
                  errors[field.id] ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
                rows={3}
                placeholder={field.placeholder}
                onChange={e => handleChange(field.id, e.target.value)}
              />
            ) : field.type === 'SELECT' ? (
              <Select
                value={
                  formData[field.id] === undefined ||
                  formData[field.id] === null ||
                  formData[field.id] === ''
                    ? SELECT_NONE_VALUE
                    : String(formData[field.id])
                }
                onValueChange={(v) => handleChange(field.id, v === SELECT_NONE_VALUE ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择" />
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
                className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-pink-400 outline-none transition-all ${
                  errors[field.id] ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
                placeholder={field.placeholder}
                onChange={e => handleChange(field.id, normalizeFieldValue(field.type, e.target.value))}
              />
            )}
            {errors[field.id] && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertTriangle size={10}/> {errors[field.id]}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3 border-t border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,0.72))] px-6 py-4 backdrop-blur-xl">
        <button onClick={onCancel} className="rounded-2xl border border-white/85 bg-white/76 px-4 py-2 text-sm font-medium text-slate-600 shadow-[0_10px_20px_rgba(15,23,42,0.04)] transition hover:bg-white hover:text-slate-900">取消</button>
        <button onClick={handleSubmit} className="rounded-2xl bg-pink-500 px-6 py-2 text-sm font-medium text-white shadow-[0_12px_24px_rgba(236,72,153,0.24)] transition hover:bg-pink-600">
          <Send size={16} className="inline mr-2"/> 提交申请
        </button>
      </div>
    </div>
  );
};
