
import React, { useState } from 'react';
import { FormDefinition, FormField, FormFieldType } from '../types';
import { Plus, Trash2, GripVertical, Type, Hash, Calendar, List, AlignLeft, Save, AlertCircle, Code, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

// 可排序字段组件
interface SortableFieldProps {
  field: FormField;
  index: number;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<FormField>) => void;
}

const SortableField: React.FC<SortableFieldProps> = ({ field, index, onRemove, onUpdate }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative bg-white border border-slate-200 hover:border-indigo-400 rounded-xl p-6 shadow-sm hover:shadow-md transition-all"
    >
      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onRemove(field.id)} className="text-slate-400 hover:text-red-500">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex gap-4">
        <div
          {...attributes}
          {...listeners}
          className="mt-2 text-slate-300 hover:text-indigo-500 cursor-grab active:cursor-grabbing transition-colors"
        >
          <GripVertical size={20} />
        </div>
        <div className="flex-1 space-y-3">
          {/* Label Editor */}
          <input
            value={field.label}
            onChange={(e) => onUpdate(field.id, { label: e.target.value })}
            className="block w-full text-sm font-bold text-slate-700 border-none p-0 focus:ring-0 bg-transparent placeholder-slate-300"
            placeholder="字段标题"
          />

          {/* Preview Area */}
          <div className="pointer-events-none opacity-60">
            {field.type === 'TEXT' && (
              <input className="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="输入框预览" />
            )}
            {field.type === 'NUMBER' && (
              <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="0.00" />
            )}
            {field.type === 'DATE' && (
              <input type="date" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
            )}
            {field.type === 'SELECT' && (
              <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                <option>下拉选项预览</option>
              </select>
            )}
            {field.type === 'TEXTAREA' && (
              <textarea className="w-full border border-slate-300 rounded px-3 py-2 text-sm" rows={2} placeholder="多行文本预览"></textarea>
            )}
          </div>

          {/* Options Editor for SELECT */}
          {field.type === 'SELECT' && (
            <div className="text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">选项列表:</span>
                <button
                  onClick={() => {
                    const newOptions = [...(field.options || []), `选项${(field.options?.length || 0) + 1}`];
                    onUpdate(field.id, { options: newOptions });
                  }}
                  className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus size={12} /> 添加选项
                </button>
              </div>
              <div className="space-y-1">
                {(field.options || []).map((option, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      value={option}
                      onChange={(e) => {
                        const newOptions = [...(field.options || [])];
                        newOptions[idx] = e.target.value;
                        onUpdate(field.id, { options: newOptions });
                      }}
                      className="flex-1 border border-slate-200 rounded px-2 py-1"
                      placeholder={`选项 ${idx + 1}`}
                    />
                    {(field.options?.length || 0) > 1 && (
                      <button
                        onClick={() => {
                          const newOptions = (field.options || []).filter((_, i) => i !== idx);
                          onUpdate(field.id, { options: newOptions });
                        }}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation Editor */}
          {(field.type === 'TEXT' || field.type === 'NUMBER') && (
            <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-slate-100">
              <div>
                <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                  <Code size={12} /> 正则表达式
                </div>
                <input
                  value={field.regex || ''}
                  onChange={(e) => onUpdate(field.id, { regex: e.target.value })}
                  className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-mono"
                  placeholder="^1[3-9]\d{9}$"
                />
              </div>
              <div>
                <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                  <AlertCircle size={12} /> 错误提示
                </div>
                <input
                  value={field.errorMsg || ''}
                  onChange={(e) => onUpdate(field.id, { errorMsg: e.target.value })}
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
              onChange={(e) => onUpdate(field.id, { required: e.target.checked })}
              id={`req-${field.id}`}
            />
            <label htmlFor={`req-${field.id}`} className="text-xs text-slate-500">
              必填项
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export const FormBuilder: React.FC<Props> = ({ onSave, initialForm }) => {
  const [formName, setFormName] = useState(initialForm?.name || '未命名表单');
  const [fields, setFields] = useState<FormField[]>(initialForm?.fields || []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFields((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      toast.success('字段顺序已更新');
    }
  };

  const addField = (type: FormFieldType) => {
    // 生成唯一 ID 并检查重复
    let newId = crypto.randomUUID();
    while (fields.some(f => f.id === newId)) {
      newId = crypto.randomUUID();
    }
    
    const newField: FormField = {
      id: newId,
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
    // 校验表单名称
    if (!formName || formName.trim() === '') {
      toast.error('请输入表单名称');
      return;
    }

    // 校验字段配置
    for (const field of fields) {
      if (!field.label || field.label.trim() === '') {
        toast.error('所有字段必须有标题');
        return;
      }
      
      if (field.type === 'SELECT') {
        if (!field.options || field.options.length === 0) {
          toast.error(`字段"${field.label}"必须至少有一个选项`);
          return;
        }
      }
    }

    // 检查字段 ID 唯一性
    const ids = fields.map(f => f.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      toast.error('字段 ID 重复，请刷新页面重试');
      return;
    }

    onSave({
      id: initialForm?.id || crypto.randomUUID(),
      name: formName.trim(),
      fields
    });
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

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                {fields.map((field, index) => (
                  <SortableField
                    key={field.id}
                    field={field}
                    index={index}
                    onRemove={removeField}
                    onUpdate={updateField}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  );
};
