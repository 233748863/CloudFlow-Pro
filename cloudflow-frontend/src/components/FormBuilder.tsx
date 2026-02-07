
import React, { useState } from 'react';
import { FormDefinition, FormField, FormFieldType } from '../types';
import { Plus, Trash2, GripVertical, Type, Hash, Calendar, List, AlignLeft, Save, AlertCircle, Code } from 'lucide-react';

interface Props {
  onSave: (form: FormDefinition) => void;
  initialForm?: FormDefinition;
}

const FIELD_TYPES: { type: FormFieldType; label: string; icon: any }[] = [
  { type: 'TEXT', label: '单行文本', icon: Type },
  { type: 'TEXTAREA', label: '多行文本', icon: AlignLeft },
  { type: 'NUMBER', label: '数字金额', icon: Hash },
  { type: 'DATE', label: '日期时间', icon: Calendar },
  { type: 'SELECT', label: '下拉选项', icon: List },
];

export const FormBuilder: React.FC<Props> = ({ onSave, initialForm }) => {
  const [formName, setFormName] = useState(initialForm?.name || '未命名表单');
  const [fields, setFields] = useState<FormField[]>(initialForm?.fields || []);

  const addField = (type: FormFieldType) => {
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label: type === 'TEXT' ? '请输入内容' : '新字段',
      required: false,
      options: type === 'SELECT' ? ['选项A', '选项B'] : undefined
    };
    setFields([...fields, newField]);
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleSave = () => {
    onSave({
      id: initialForm?.id || crypto.randomUUID(),
      name: formName,
      fields
    });
    alert('表单设计已保存！可在流程设计中绑定此表单。');
  };

  return (
    <div className="flex h-full gap-6">
      {/* Toolbox */}
      <div className="w-64 bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
        <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">组件库</h3>
        <div className="grid grid-cols-1 gap-2">
          {FIELD_TYPES.map(t => (
            <button
              key={t.type}
              onClick={() => addField(t.type)}
              className="flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg transition-all text-sm text-slate-600 font-medium text-left"
            >
              <t.icon size={16} className="text-indigo-500" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-auto pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">点击组件添加到画布。支持正则校验与后端自动生成 JSON Schema。</p>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <input 
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="text-lg font-bold bg-transparent border-none focus:ring-0 text-slate-800 placeholder-slate-400"
            placeholder="请输入表单名称"
          />
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Save size={16} /> 保存表单
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
          <div className="max-w-2xl mx-auto space-y-4">
            {fields.length === 0 && (
              <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-slate-400">画布空空如也，请从左侧添加组件</p>
              </div>
            )}
            
            {fields.map((field, index) => (
              <div key={field.id} className="group relative bg-white border border-slate-200 hover:border-indigo-400 rounded-xl p-6 shadow-sm hover:shadow-md transition-all">
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button onClick={() => removeField(field.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16}/></button>
                </div>
                
                <div className="flex gap-4">
                   <div className="mt-2 text-slate-300 cursor-move"><GripVertical size={20}/></div>
                   <div className="flex-1 space-y-3">
                      {/* Label Editor */}
                      <input 
                        value={field.label}
                        onChange={(e) => updateField(field.id, { label: e.target.value })}
                        className="block w-full text-sm font-bold text-slate-700 border-none p-0 focus:ring-0 bg-transparent placeholder-slate-300"
                        placeholder="字段标题"
                      />
                      
                      {/* Preview Area */}
                      <div className="pointer-events-none opacity-60">
                         {field.type === 'TEXT' && <input className="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="输入框预览" />}
                         {field.type === 'NUMBER' && <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="0.00" />}
                         {field.type === 'DATE' && <input type="date" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />}
                         {field.type === 'SELECT' && (
                           <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                             <option>下拉选项预览</option>
                           </select>
                         )}
                         {field.type === 'TEXTAREA' && <textarea className="w-full border border-slate-300 rounded px-3 py-2 text-sm" rows={2} placeholder="多行文本预览"></textarea>}
                      </div>

                      {/* Options Editor for SELECT */}
                      {field.type === 'SELECT' && (
                        <div className="text-xs">
                          <span className="text-slate-500">选项 (用逗号分隔):</span>
                          <input 
                            value={field.options?.join(',')}
                            onChange={(e) => updateField(field.id, { options: e.target.value.split(',') })}
                            className="mt-1 w-full border border-slate-200 rounded px-2 py-1"
                          />
                        </div>
                      )}

                      {/* Validation Editor */}
                      {(field.type === 'TEXT' || field.type === 'NUMBER') && (
                        <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-slate-100">
                          <div>
                            <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                               <Code size={12}/> 正则表达式
                            </div>
                            <input 
                              value={field.regex || ''}
                              onChange={(e) => updateField(field.id, { regex: e.target.value })}
                              className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-mono"
                              placeholder="^1[3-9]\d{9}$"
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                               <AlertCircle size={12}/> 错误提示
                            </div>
                            <input 
                              value={field.errorMsg || ''}
                              onChange={(e) => updateField(field.id, { errorMsg: e.target.value })}
                              className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                              placeholder="格式不正确"
                            />
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 pt-1">
                        <input 
                          type="checkbox" 
                          checked={field.required}
                          onChange={(e) => updateField(field.id, { required: e.target.checked })}
                          id={`req-${field.id}`}
                        />
                        <label htmlFor={`req-${field.id}`} className="text-xs text-slate-500">必填项</label>
                      </div>
                   </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
