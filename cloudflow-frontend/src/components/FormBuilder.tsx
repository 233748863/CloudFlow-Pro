
import React, { useEffect, useState } from 'react';
import { FormDefinition, FormField, FormFieldType } from '../types';
import { Plus, Trash2, GripVertical, Type, Hash, Calendar, List, AlignLeft, Save, AlertCircle, Code, X, Eye, EyeOff } from 'lucide-react';
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Input } from './ui/input';
import { DatePicker } from './ui/date-picker';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';

interface Props {
  onSave: (form: FormDefinition) => Promise<void> | void;
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
      className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-cyan-200 hover:shadow-md"
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
          className="mt-2 cursor-grab text-slate-300 transition-colors hover:text-cyan-500 active:cursor-grabbing"
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
              <Input placeholder="输入框预览" disabled />
            )}
            {field.type === 'NUMBER' && (
              <Input type="number" placeholder="0.00" disabled />
            )}
            {field.type === 'DATE' && (
              <DatePicker type="date" disabled />
            )}
            {field.type === 'SELECT' && (
              <Select value="preview">
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="下拉选项预览" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preview">下拉选项预览</SelectItem>
                </SelectContent>
              </Select>
            )}
            {field.type === 'TEXTAREA' && (
              <Textarea className="min-h-[72px] text-sm" rows={2} placeholder="多行文本预览" />
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
                  className="flex items-center gap-1 text-cyan-600 transition hover:text-cyan-700"
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
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
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

                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <label htmlFor={`req-${field.id}`} className="text-xs font-medium text-slate-600">
              必填项
            </label>
            <Switch
              checked={field.required}
              onCheckedChange={(checked) => onUpdate(field.id, { required: checked })}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// 表单预览填写组件（内联）
const FormPreview: React.FC<{
  formName: string;
  fields: FormField[];
  onSubmit: (data: Record<string, any>) => void;
  onCancel: () => void;
}> = ({ formName, fields, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (id: string, value: any) => {
    setFormData(prev => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors(prev => ({ ...prev, [id]: '' }));
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    fields.forEach(field => {
      const val = formData[field.id];
      if (field.required && (!val || String(val).trim() === '')) {
        newErrors[field.id] = '此项必填';
        isValid = false;
      } else if (val && field.regex) {
        try {
          if (!new RegExp(field.regex).test(String(val))) {
            newErrors[field.id] = field.errorMsg || '格式不正确';
            isValid = false;
          }
        } catch { /* 正则无效时跳过 */ }
      }
    });

    if (isValid) {
      onSubmit(formData);
    } else {
      setErrors(newErrors);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-cyan-50 px-6 py-4">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Eye size={18} className="text-cyan-600" />
            预览: {formName}
          </h3>
          <p className="text-xs text-slate-500 mt-1">模拟用户填写体验，提交不会保存数据</p>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X size={20} />
        </button>
      </div>
      <div className="p-8 space-y-6 max-h-[55vh] overflow-y-auto">
        {fields.map(field => (
          <div key={field.id} className="space-y-1">
            <label className="block text-sm font-bold text-slate-700">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            {field.type === 'TEXTAREA' ? (
              <textarea
                className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:border-cyan-500 focus:ring-cyan-500/20 outline-none transition-all ${
                  errors[field.id] ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
                rows={3}
                placeholder={`请输入${field.label}`}
                value={formData[field.id] || ''}
                onChange={e => handleChange(field.id, e.target.value)}
              />
            ) : field.type === 'SELECT' ? (
              <Select value={formData[field.id] || ''} onValueChange={v => handleChange(field.id, v)}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  {(field.options || []).map((opt, idx) => (
                    <SelectItem key={idx} value={String(opt)}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <input
                type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:border-cyan-500 focus:ring-cyan-500/20 outline-none transition-all ${
                  errors[field.id] ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
                placeholder={`请输入${field.label}`}
                value={formData[field.id] || ''}
                onChange={e => handleChange(field.id, e.target.value)}
              />
            )}
            {errors[field.id] && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={10} /> {errors[field.id]}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-slate-600 hover:text-slate-900 text-sm font-medium">
          返回设计
        </button>
        <button
          onClick={handleSubmit}
          className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm font-medium shadow-md shadow-cyan-100 flex items-center gap-2"
        >
          <Save size={16} /> 模拟提交
        </button>
      </div>
    </div>
  );
};

export const FormBuilder: React.FC<Props> = ({ onSave, initialForm }) => {
  const [formName, setFormName] = useState(initialForm?.name || '未命名表单');
  const [fields, setFields] = useState<FormField[]>(initialForm?.fields || []);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFormName(initialForm?.name || '未命名表单');
    setFields(initialForm?.fields || []);
    setPreviewing(false);
    setPreviewData(null);
  }, [initialForm?.id]);

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
        if (oldIndex === -1 || newIndex === -1) {
          return items;
        }
        return arrayMove(items, oldIndex, newIndex);
      });
      toast.success('字段顺序已更新');
    }
  };

  const addField = (type: FormFieldType) => {
    setFields((prev) => {
      // 生成唯一 ID 并检查重复
      let newId = crypto.randomUUID();
      while (prev.some(f => f.id === newId)) {
        newId = crypto.randomUUID();
      }

      const newField: FormField = {
        id: newId,
        type,
        label: type === 'TEXT' ? '请输入内容' : '新字段',
        required: false,
        options: type === 'SELECT' ? ['选项A', '选项B'] : undefined
      };
      return [...prev, newField];
    });
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter(f => f.id !== id));
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields((prev) => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleSave = async () => {
    if (saving) return;

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

    try {
      setSaving(true);
      await onSave({
        id: initialForm?.id || crypto.randomUUID(),
        name: formName.trim(),
        fields
      });
    } finally {
      setSaving(false);
    }
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
              className="flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-cyan-50 border border-slate-200 hover:border-cyan-200 rounded-lg transition-all text-sm text-slate-600 font-medium text-left"
            >
              <t.icon size={16} className="text-cyan-500" />
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setPreviewing(!previewing);
                setPreviewData(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                previewing
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {previewing ? <EyeOff size={16} /> : <Eye size={16} />}
              {previewing ? '退出预览' : '预览填写'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save size={16} /> {saving ? '保存中...' : '保存表单'}
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
          {previewing ? (
            /* 预览模式：模拟真实表单填写 */
            <div className="max-w-2xl mx-auto">
              {previewData ? (
                /* 提交成功后展示数据 */
                <div className="bg-white rounded-xl border border-green-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-green-50 border-b border-green-100">
                    <h3 className="font-bold text-green-800 flex items-center gap-2">
                      ✅ 模拟提交成功
                    </h3>
                    <p className="text-xs text-green-600 mt-1">以下是表单提交的数据（仅预览，未实际提交）</p>
                  </div>
                  <div className="p-6">
                    <pre className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 overflow-auto max-h-80 font-mono">
                      {JSON.stringify(previewData, null, 2)}
                    </pre>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => setPreviewData(null)}
                        className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700"
                      >
                        重新填写
                      </button>
                      <button
                        onClick={() => { setPreviewing(false); setPreviewData(null); }}
                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"
                      >
                        返回设计
                      </button>
                    </div>
                  </div>
                </div>
              ) : fields.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-xl">
                  <p className="text-slate-400">没有字段可预览，请先添加组件</p>
                </div>
              ) : (
                /* 表单填写预览 */
                <FormPreview
                  formName={formName}
                  fields={fields}
                  onSubmit={(data) => {
                    setPreviewData(data);
                    toast.success('模拟提交成功！（仅预览）');
                  }}
                  onCancel={() => setPreviewing(false)}
                />
              )}
            </div>
          ) : (
            /* 设计模式 */
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
          )}
        </div>
      </div>
    </div>
  );
};
