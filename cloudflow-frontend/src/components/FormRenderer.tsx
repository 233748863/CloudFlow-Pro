import React, { useState } from 'react';
import { FormDefinition } from '../types';
import { FileText, X, AlertTriangle, Send } from 'lucide-react';

export const FormRenderer = ({ 
  formDef, 
  onSubmit, 
  onCancel 
}: { 
  formDef: FormDefinition, 
  onSubmit: (data: Record<string, any>) => void,
  onCancel: () => void
}) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (id: string, value: any) => {
    setFormData(prev => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors(prev => ({ ...prev, [id]: '' }));
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    formDef.fields.forEach(field => {
      const val = formData[field.label]; // Storing by Label for readability in this demo
      if (field.required && !val) {
        newErrors[field.label] = '此项必填';
        isValid = false;
      } else if (val && field.regex) {
        try {
          if (!new RegExp(field.regex).test(String(val))) {
            newErrors[field.label] = field.errorMsg || '格式不正确';
            isValid = false;
          }
        } catch(e) {}
      }
    });

    if (isValid) onSubmit(formData);
    else setErrors(newErrors);
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
          <div key={field.id} className="space-y-1">
            <label className="block text-sm font-bold text-slate-700">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            {field.type === 'TEXTAREA' ? (
              <textarea
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                rows={3}
                onChange={e => handleChange(field.label, e.target.value)}
              />
            ) : field.type === 'SELECT' ? (
              <select 
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                onChange={e => handleChange(field.label, e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>请选择</option>
                {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input
                type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                onChange={e => handleChange(field.label, e.target.value)}
              />
            )}
            {errors[field.label] && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={10}/> {errors[field.label]}</p>}
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
