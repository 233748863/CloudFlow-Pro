
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
import { Button } from './ui/button';
import { cn } from '@/utils/cn';

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

const FIELD_TYPE_STYLES: Record<FormFieldType, { tone: string; badge: string }> = {
  TEXT: {
    tone: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200',
    badge: 'border-cyan-200 dark:border-cyan-900/70',
  },
  TEXTAREA: {
    tone: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200',
    badge: 'border-teal-200 dark:border-teal-900/70',
  },
  NUMBER: {
    tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
    badge: 'border-amber-200 dark:border-amber-900/70',
  },
  DATE: {
    tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200',
    badge: 'border-sky-200 dark:border-sky-900/70',
  },
  SELECT: {
    tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
    badge: 'border-emerald-200 dark:border-emerald-900/70',
  },
};

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
  const fieldStyle = FIELD_TYPE_STYLES[field.type];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-cyan-200 dark:border-slate-800 dark:bg-slate-950/88 dark:shadow-none dark:hover:border-cyan-800"
    >
      <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onRemove(field.id)}
          className="rounded-full p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-950/40 dark:hover:text-red-300"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex gap-4">
        <div
          {...attributes}
          {...listeners}
          className="mt-2 cursor-grab text-slate-300 transition-colors hover:text-cyan-500 active:cursor-grabbing dark:text-slate-600 dark:hover:text-cyan-300"
        >
          <GripVertical size={20} />
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                fieldStyle.tone,
                fieldStyle.badge,
              )}
            >
              {React.createElement(FIELD_TYPES.find((item) => item.type === field.type)?.icon || Type, { size: 12 })}
              {FIELD_TYPES.find((item) => item.type === field.type)?.label || field.type}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">字段 {index + 1}</span>
          </div>

          {/* Label Editor */}
          <Input
            value={field.label}
            onChange={(e) => onUpdate(field.id, { label: e.target.value })}
            className="border-none bg-transparent px-0 text-sm font-bold text-slate-700 shadow-none placeholder:text-slate-300 focus-visible:ring-0 dark:text-slate-100"
            placeholder="字段标题"
          />

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
            {field.type === 'TEXT' && '单行文本输入'}
            {field.type === 'NUMBER' && '数字或金额输入'}
            {field.type === 'DATE' && '日期时间选择'}
            {field.type === 'SELECT' && `下拉选项 · ${(field.options || []).length} 项`}
            {field.type === 'TEXTAREA' && '多行文本输入'}
          </div>

          {/* Options Editor for SELECT */}
          {field.type === 'SELECT' && (
            <div className="text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">选项列表:</span>
                <button
                  type="button"
                  onClick={() => {
                    const newOptions = [...(field.options || []), `选项${(field.options?.length || 0) + 1}`];
                    onUpdate(field.id, { options: newOptions });
                  }}
                  className="flex items-center gap-1 text-cyan-600 transition hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200"
                >
                  <Plus size={12} /> 添加选项
                </button>
              </div>
              <div className="space-y-1">
                {(field.options || []).map((option, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={option}
                      onChange={(e) => {
                        const newOptions = [...(field.options || [])];
                        newOptions[idx] = e.target.value;
                        onUpdate(field.id, { options: newOptions });
                      }}
                      className="flex-1 h-8 rounded-lg px-2 py-1 text-xs"
                      placeholder={`选项 ${idx + 1}`}
                    />
                    {(field.options?.length || 0) > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newOptions = (field.options || []).filter((_, i) => i !== idx);
                          onUpdate(field.id, { options: newOptions });
                        }}
                        className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-950/40 dark:hover:text-red-300"
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
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <div>
                <div className="mb-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <Code size={12} /> 正则表达式
                </div>
                <Input
                  value={field.regex || ''}
                  onChange={(e) => onUpdate(field.id, { regex: e.target.value })}
                  className="h-8 rounded-lg px-2 py-1 text-xs font-mono"
                  placeholder="^1[3-9]\d{9}$"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <AlertCircle size={12} /> 错误提示
                </div>
                <Input
                  value={field.errorMsg || ''}
                  onChange={(e) => onUpdate(field.id, { errorMsg: e.target.value })}
                  className="h-8 rounded-lg px-2 py-1 text-xs"
                  placeholder="格式不正确"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/80">
            <label htmlFor={`req-${field.id}`} className="text-xs font-medium text-slate-600 dark:text-slate-300">
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
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88 dark:shadow-none">
      <div className="flex items-center justify-between border-b border-slate-200 bg-cyan-50/80 px-5 py-4 dark:border-slate-800 dark:bg-cyan-950/30">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
            <Eye size={18} className="text-cyan-600 dark:text-cyan-200" />
            预览: {formName}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">模拟用户填写体验，提交不会保存数据</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/80 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200">
          <X size={20} />
        </button>
      </div>
      <div className="max-h-[55vh] space-y-6 overflow-y-auto px-5 py-5">
        {fields.map(field => (
          <div key={field.id} className="space-y-1">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-100">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            {field.type === 'TEXTAREA' ? (
              <Textarea
                className={cn(
                  'w-full rounded-lg px-3 py-2.5',
                  errors[field.id]
                    ? 'border-red-300 bg-red-50 dark:border-red-900/70 dark:bg-red-950/30'
                    : 'border-slate-300 dark:border-slate-700'
                )}
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
              <Input
                type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                className={cn(
                  'w-full rounded-lg px-3 py-2.5',
                  errors[field.id]
                    ? 'border-red-300 bg-red-50 dark:border-red-900/70 dark:bg-red-950/30'
                    : 'border-slate-300 dark:border-slate-700'
                )}
                placeholder={`请输入${field.label}`}
                value={formData[field.id] || ''}
                onChange={e => handleChange(field.id, e.target.value)}
              />
            )}
            {errors[field.id] && (
              <p className="flex items-center gap-1 text-xs text-red-500 dark:text-red-300">
                <AlertCircle size={10} /> {errors[field.id]}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/80">
        <Button variant="outline" onClick={onCancel}>
          返回设计
        </Button>
        <Button onClick={handleSubmit} className="gap-2">
          <Save size={16} /> 模拟提交
        </Button>
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
    <div className="form-studio-shell flex h-full gap-3">
      {/* Toolbox */}
      <div className="flex w-[15rem] flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 dark:shadow-none">
        <div className="mb-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-700 dark:text-slate-200">组件库</h3>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {FIELD_TYPES.map(t => (
            <button
              type="button"
              key={t.type}
              onClick={() => addField(t.type)}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition-all hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/40"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-sm dark:bg-slate-950/90">
                <t.icon size={16} className="text-cyan-500 dark:text-cyan-300" />
              </div>
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-auto border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-xs leading-6 text-slate-400 dark:text-slate-500">点击添加到画布。</p>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88 dark:shadow-none">
        <div className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Input 
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="w-[20rem] max-w-full border-none bg-transparent px-0 text-lg font-semibold text-slate-800 shadow-none focus-visible:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="请输入表单名称"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={previewing ? 'soft' : 'outline'}
              onClick={() => {
                setPreviewing(!previewing);
                setPreviewData(null);
              }}
            >
              {previewing ? <EyeOff size={16} /> : <Eye size={16} />}
              {previewing ? '退出预览' : '预览填写'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2"
            >
              <Save size={16} /> {saving ? '保存中...' : '保存表单'}
            </Button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto bg-slate-50/30 p-4 dark:bg-slate-950/50">
          {previewing ? (
            /* 预览模式：模拟真实表单填写 */
            <div className="mx-auto max-w-2xl">
              {previewData ? (
                /* 提交成功后展示数据 */
                <div className="overflow-hidden rounded-xl border border-green-200 bg-white shadow-sm shadow-green-100/70 dark:border-green-900/70 dark:bg-slate-950/88 dark:shadow-none">
                  <div className="border-b border-green-100 bg-green-50 px-5 py-4 dark:border-green-900/60 dark:bg-green-950/30">
                    <h3 className="flex items-center gap-2 font-bold text-green-800 dark:text-green-200">
                      ✅ 模拟提交成功
                    </h3>
                    <p className="mt-1 text-xs text-green-600 dark:text-green-300">以下是表单提交的数据（仅预览，未实际提交）</p>
                  </div>
                  <div className="p-5">
                    <pre className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                      {JSON.stringify(previewData, null, 2)}
                    </pre>
                    <div className="mt-4 flex gap-2">
                      <Button
                        onClick={() => setPreviewData(null)}
                      >
                        重新填写
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => { setPreviewing(false); setPreviewData(null); }}
                      >
                        返回设计
                      </Button>
                    </div>
                  </div>
                </div>
              ) : fields.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-slate-200 py-20 text-center dark:border-slate-800">
                  <p className="text-slate-400 dark:text-slate-500">没有字段可预览，请先添加组件</p>
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
            <div className="mx-auto max-w-2xl space-y-3">
              {fields.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-slate-200 py-20 text-center dark:border-slate-800">
                  <p className="text-slate-400 dark:text-slate-500">画布空空如也，请从左侧添加组件</p>
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
