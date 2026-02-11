import React, { useState } from 'react';
import { FormDefinition } from '../types';
import { FileText, X, AlertTriangle, Send } from 'lucide-react';

export const FormRenderer = ({ 
  formDef, 
  onSubmit, 
  onCancel 
}: { 
  formDef: FormDefinition | undefined, 
  onSubmit: (data: Record<string, any>) => void,
  onCancel: () => void
}) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 如果没有表单定义，显示错误状态
  if (!formDef || !formDef.fields || formDef.fields.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden max-w-2xl mx-auto">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600"/>
            表单加载失败
          </h3>
          <button onClick={onCancel}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
        </div>
        <div className="p-8 text-center">
          <AlertTriangle size={48} className="text-amber-500 mx-auto mb-4"/>
          <p className="text-slate-600 mb-4">未找到表单定义或表单字段为空</p>
          <button 
            onClick={onCancel}
            className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
          >
            关闭
          </button>
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
        } catch(e) {
          console.error('正则表达式错误:', field.regex, e);
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
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden max-w-2xl mx-auto animate-fade-in-up">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <FileText size={18} className="text-indigo-600"/>
          填写: {formDef.name}
        </h3>
        <button onClick={onCancel}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
      </div>
      <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {formDef.fields.map(field => (
          <div key={field.id} id={`field-${field.id}`} className="space-y-1">
            <label className="block text-sm font-bold text-slate-700">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            {field.type === 'TEXTAREA' ? (
              <textarea
                className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                  errors[field.id] ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
                rows={3}
                placeholder={field.placeholder}
                onChange={e => handleChange(field.id, e.target.value)}
              />
            ) : field.type === 'SELECT' ? (
              <select 
                className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white ${
                  errors[field.id] ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
                onChange={e => handleChange(field.id, e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>请选择</option>
                {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input
                type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                  errors[field.id] ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
                placeholder={field.placeholder}
                onChange={e => handleChange(field.id, e.target.value)}
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
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-slate-600 hover:text-slate-900 text-sm font-medium">取消</button>
        <button onClick={handleSubmit} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-md shadow-indigo-200">
          <Send size={16} className="inline mr-2"/> 提交申请
        </button>
      </div>
    </div>
  );
};
