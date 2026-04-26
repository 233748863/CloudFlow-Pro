import React, { useEffect, useState } from 'react';
import { FormDefinition, FormField, FormFieldType } from '../types';
import {
  Plus,
  Trash2,
  GripVertical,
  Type,
  Hash,
  Calendar,
  List,
  AlignLeft,
  Save,
  AlertCircle,
  Code,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './common/select';
import { Input } from './common/input';
import { Switch } from './common/switch';
import { Textarea } from './common/textarea';
import { Button } from './common/button';
import { cn } from '@/utils/cn';

interface Props {
  onSave: (form: FormDefinition) => Promise<void> | void;
  initialForm?: FormDefinition;
}

const FIELD_TYPES: Array<{ type: FormFieldType; label: string; icon: React.ElementType }> = [
  { type: 'TEXT', label: '单行文本', icon: Type },
  { type: 'TEXTAREA', label: '多行文本', icon: AlignLeft },
  { type: 'NUMBER', label: '数字金额', icon: Hash },
  { type: 'DATE', label: '日期时间', icon: Calendar },
  { type: 'SELECT', label: '下拉选项', icon: List },
];

const FIELD_TYPE_STYLES: Record<FormFieldType, string> = {
  TEXT: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200',
  TEXTAREA: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/30 dark:text-teal-200',
  NUMBER: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200',
  DATE: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200',
  SELECT: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200',
};

const PreviewControl: React.FC<{ field: FormField }> = ({ field }) => {
  if (field.type === 'TEXTAREA') {
    return <Textarea rows={2} disabled placeholder="多行文本输入" className="pointer-events-none resize-none" />;
  }

  if (field.type === 'SELECT') {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-500">
        请选择
      </div>
    );
  }

  return (
    <Input
      disabled
      type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
      placeholder={field.type === 'DATE' ? '' : '输入示例'}
      className="pointer-events-none"
    />
  );
};

interface SortableFieldProps {
  field: FormField;
  index: number;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<FormField>) => void;
}

const SortableField: React.FC<SortableFieldProps> = ({ field, index, onRemove, onUpdate }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  const Icon = FIELD_TYPES.find((item) => item.type === field.type)?.icon || Type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 dark:shadow-none"
    >
      <div className="flex gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab text-slate-300 transition-colors hover:text-cyan-500 active:cursor-grabbing dark:text-slate-600 dark:hover:text-cyan-300"
        >
          <GripVertical size={18} />
        </button>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
                  FIELD_TYPE_STYLES[field.type],
                )}
              >
                <Icon size={12} />
                {FIELD_TYPES.find((item) => item.type === field.type)?.label || field.type}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">字段 {index + 1}</span>
            </div>

            <button
              type="button"
              onClick={() => onRemove(field.id)}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:text-slate-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
            >
              <Trash2 size={15} />
            </button>
          </div>

          <Input
            value={field.label}
            onChange={(e) => onUpdate(field.id, { label: e.target.value })}
            className="h-9 border-none bg-transparent px-0 text-sm font-medium text-slate-800 shadow-none placeholder:text-slate-300 focus-visible:ring-0 dark:text-slate-100"
            placeholder="字段标题"
          />

          <PreviewControl field={field} />

          {field.type === 'SELECT' ? (
            <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400">选项</span>
                <button
                  type="button"
                  onClick={() => {
                    const newOptions = [...(field.options || []), `选项${(field.options?.length || 0) + 1}`];
                    onUpdate(field.id, { options: newOptions });
                  }}
                  className="inline-flex items-center gap-1 text-xs text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200"
                >
                  <Plus size={12} />
                  新增
                </button>
              </div>

              <div className="space-y-1.5">
                {(field.options || []).map((option, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={option}
                      onChange={(e) => {
                        const newOptions = [...(field.options || [])];
                        newOptions[idx] = e.target.value;
                        onUpdate(field.id, { options: newOptions });
                      }}
                      className="h-8 flex-1 text-xs"
                      placeholder={`选项 ${idx + 1}`}
                    />
                    {(field.options?.length || 0) > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const newOptions = (field.options || []).filter((_, i) => i !== idx);
                          onUpdate(field.id, { options: newOptions });
                        }}
                        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:text-slate-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {(field.type === 'TEXT' || field.type === 'NUMBER') ? (
            <div className="grid gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 md:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <Code size={12} />
                  正则表达式
                </div>
                <Input
                  value={field.regex || ''}
                  onChange={(e) => onUpdate(field.id, { regex: e.target.value })}
                  className="h-8 text-xs font-mono"
                  placeholder="^1[3-9]\\d{9}$"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <AlertCircle size={12} />
                  错误提示
                </div>
                <Input
                  value={field.errorMsg || ''}
                  onChange={(e) => onUpdate(field.id, { errorMsg: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="格式不正确"
                />
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">必填项</span>
            <Switch checked={field.required} onCheckedChange={(checked) => onUpdate(field.id, { required: checked })} />
          </div>
        </div>
      </div>
    </div>
  );
};

const FormPreview: React.FC<{
  formName: string;
  fields: FormField[];
  onSubmit: (data: Record<string, any>) => void;
  onCancel: () => void;
}> = ({ formName, fields, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (id: string, value: any) => {
    setFormData((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors((prev) => ({ ...prev, [id]: '' }));
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    fields.forEach((field) => {
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
        } catch {
          // ignore invalid regex during preview
        }
      }
    });

    if (isValid) {
      onSubmit(formData);
    } else {
      setErrors(newErrors);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88 dark:shadow-none">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{formName}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">预览填写，不会写入真实数据。</div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X size={18} />
        </button>
      </div>

      <div className="max-h-[60vh] space-y-5 overflow-y-auto px-4 py-4">
        {fields.map((field) => (
          <div key={field.id} className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              {field.label}
              {field.required ? <span className="ml-1 text-rose-500">*</span> : null}
            </label>

            {field.type === 'TEXTAREA' ? (
              <Textarea
                rows={3}
                value={formData[field.id] || ''}
                onChange={(e) => handleChange(field.id, e.target.value)}
                placeholder={`请输入${field.label}`}
                className={cn(
                  errors[field.id] ? 'border-rose-300 bg-rose-50 dark:border-rose-900/70 dark:bg-rose-950/30' : '',
                )}
              />
            ) : field.type === 'SELECT' ? (
              <Select value={formData[field.id] || ''} onValueChange={(v) => handleChange(field.id, v)}>
                <SelectTrigger className={errors[field.id] ? 'border-rose-300 dark:border-rose-900/70' : ''}>
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  {(field.options || []).map((opt, idx) => (
                    <SelectItem key={idx} value={String(opt)}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                value={formData[field.id] || ''}
                onChange={(e) => handleChange(field.id, e.target.value)}
                placeholder={field.type === 'DATE' ? '' : `请输入${field.label}`}
                className={errors[field.id] ? 'border-rose-300 bg-rose-50 dark:border-rose-900/70 dark:bg-rose-950/30' : ''}
              />
            )}

            {errors[field.id] ? (
              <p className="flex items-center gap-1 text-xs text-rose-500 dark:text-rose-300">
                <AlertCircle size={10} />
                {errors[field.id]}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
        <Button variant="outline" onClick={onCancel}>
          返回设计
        </Button>
        <Button onClick={handleSubmit}>
          <Save className="h-4 w-4" />
          模拟提交
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
    }),
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
      let newId = crypto.randomUUID();
      while (prev.some((f) => f.id === newId)) {
        newId = crypto.randomUUID();
      }

      const newField: FormField = {
        id: newId,
        type,
        label: type === 'TEXT' ? '请输入内容' : '新字段',
        required: false,
        options: type === 'SELECT' ? ['选项A', '选项B'] : undefined,
      };
      return [...prev, newField];
    });
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const handleSave = async () => {
    if (saving) return;

    if (!formName || formName.trim() === '') {
      toast.error('请输入表单名称');
      return;
    }

    for (const field of fields) {
      if (!field.label || field.label.trim() === '') {
        toast.error('所有字段必须有标题');
        return;
      }

      if (field.type === 'SELECT' && (!field.options || field.options.length === 0)) {
        toast.error(`字段“${field.label}”至少需要一个选项`);
        return;
      }
    }

    const ids = fields.map((f) => f.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      toast.error('字段 ID 重复，请刷新页面后重试');
      return;
    }

    try {
      setSaving(true);
      await onSave({
        id: initialForm?.id || crypto.randomUUID(),
        name: formName.trim(),
        fields,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full gap-3">
      <aside className="flex w-[13rem] shrink-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 dark:shadow-none">
        <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">组件库</div>
        </div>

        <div className="mt-3 space-y-2">
          {FIELD_TYPES.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.type}
                type="button"
                onClick={() => addField(item.type)}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-cyan-900/70 dark:hover:bg-cyan-950/20"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-cyan-600 dark:border-slate-800 dark:bg-slate-950 dark:text-cyan-300">
                  <Icon size={15} />
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88 dark:shadow-none">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="h-9 w-full border-none bg-transparent px-0 text-sm font-medium text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:ring-0 sm:w-72 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="请输入表单名称"
          />

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">字段 {fields.length}</span>
            <Button
              variant="outline"
              onClick={() => {
                setPreviewing(!previewing);
                setPreviewData(null);
              }}
            >
              {previewing ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {previewing ? '退出预览' : '预览填写'}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? '保存中...' : '保存表单'}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/40 p-4 dark:bg-slate-950/40">
          {previewing ? (
            <div className="mx-auto max-w-2xl">
              {previewData ? (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88 dark:shadow-none">
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">模拟提交结果</div>
                  </div>
                  <div className="space-y-4 p-4">
                    <pre className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                      {JSON.stringify(previewData, null, 2)}
                    </pre>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setPreviewData(null)}>重新填写</Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setPreviewing(false);
                          setPreviewData(null);
                        }}
                      >
                        返回设计
                      </Button>
                    </div>
                  </div>
                </div>
              ) : fields.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-16 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-500">
                  先添加字段，再预览填写。
                </div>
              ) : (
                <FormPreview
                  formName={formName}
                  fields={fields}
                  onSubmit={(data) => {
                    setPreviewData(data);
                    toast.success('模拟提交成功');
                  }}
                  onCancel={() => setPreviewing(false)}
                />
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-3">
              {fields.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-16 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-500">
                  从左侧组件库添加字段。
                </div>
              ) : null}

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
      </section>
    </div>
  );
};
