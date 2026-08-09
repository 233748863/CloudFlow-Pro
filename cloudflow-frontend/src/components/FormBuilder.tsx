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
  Users,
  Building2,
  Briefcase,
  GitBranch,
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
import { DatePicker } from './common/date-picker';
import { cn } from '@/utils/cn';
import { FormRenderer } from './FormRenderer';

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
  { type: 'EMPLOYEE', label: '员工选择', icon: Users },
  { type: 'DEPT', label: '部门选择', icon: Building2 },
  { type: 'POST', label: '岗位选择', icon: Briefcase },
  { type: 'POSITION', label: '职位选择', icon: GitBranch },
];

const FIELD_TYPE_STYLES: Record<FormFieldType, string> = {
  TEXT: 'border-cyan-200 bg-[var(--cf-surface-strong)] text-cyan-700 dark:border-cyan-900 dark:bg-slate-950 dark:text-cyan-200',
  TEXTAREA: 'border-cyan-200 bg-[var(--cf-surface-strong)] text-cyan-700 dark:border-cyan-900 dark:bg-slate-950 dark:text-cyan-200',
  NUMBER: 'border-amber-200 bg-[var(--cf-surface-strong)] text-amber-700 dark:border-amber-900 dark:bg-slate-950 dark:text-amber-200',
  DATE: 'border-sky-200 bg-[var(--cf-surface-strong)] text-sky-700 dark:border-sky-900 dark:bg-slate-950 dark:text-sky-200',
  SELECT: 'border-emerald-200 bg-[var(--cf-surface-strong)] text-emerald-700 dark:border-emerald-900 dark:bg-slate-950 dark:text-emerald-200',
  EMPLOYEE: 'border-violet-200 bg-[var(--cf-surface-strong)] text-violet-700 dark:border-violet-900 dark:bg-slate-950 dark:text-violet-200',
  DEPT: 'border-indigo-200 bg-[var(--cf-surface-strong)] text-indigo-700 dark:border-indigo-900 dark:bg-slate-950 dark:text-indigo-200',
  POST: 'border-teal-200 bg-[var(--cf-surface-strong)] text-teal-700 dark:border-teal-900 dark:bg-slate-950 dark:text-teal-200',
  POSITION: 'border-fuchsia-200 bg-[var(--cf-surface-strong)] text-fuchsia-700 dark:border-fuchsia-900 dark:bg-slate-950 dark:text-fuchsia-200',
};

const MASTER_DATA_TYPES = new Set<FormFieldType>(['EMPLOYEE', 'DEPT', 'POST', 'POSITION']);

const DEFAULT_FIELD_IDS: Record<FormFieldType, string> = {
  TEXT: 'textField',
  TEXTAREA: 'description',
  NUMBER: 'amount',
  DATE: 'date',
  SELECT: 'selectField',
  EMPLOYEE: 'employeeId',
  DEPT: 'deptId',
  POST: 'postId',
  POSITION: 'positionId',
};

const DEFAULT_FIELD_LABELS: Record<FormFieldType, string> = {
  TEXT: '单行文本',
  TEXTAREA: '说明',
  NUMBER: '金额',
  DATE: '日期',
  SELECT: '选项',
  EMPLOYEE: '员工',
  DEPT: '部门',
  POST: '岗位',
  POSITION: '职位',
};

const getUniqueFieldId = (baseId: string, fields: FormField[]) => {
  if (!fields.some((field) => field.id === baseId)) return baseId;
  let index = 2;
  while (fields.some((field) => field.id === `${baseId}${index}`)) {
    index += 1;
  }
  return `${baseId}${index}`;
};

const buildDefaultField = (type: FormFieldType, id: string): FormField => {
  const base: FormField = {
    id,
    type,
    label: DEFAULT_FIELD_LABELS[type],
    required: false,
    options: type === 'SELECT' ? ['选项A', '选项B'] : undefined,
  };

  if (type === 'EMPLOYEE') {
    return {
      ...base,
      displayFieldId: 'employeeName',
      fillMappings: [
        { targetFieldId: 'employeeName', source: 'name' },
        { targetFieldId: 'employeeNo', source: 'employeeNo' },
        { targetFieldId: 'deptId', source: 'deptId' },
        { targetFieldId: 'deptName', source: 'deptName' },
        { targetFieldId: 'postId', source: 'postId' },
        { targetFieldId: 'postName', source: 'postName' },
        { targetFieldId: 'positionId', source: 'positionId' },
        { targetFieldId: 'positionName', source: 'positionName' },
      ],
    };
  }

  if (type === 'DEPT') {
    return {
      ...base,
      displayFieldId: 'deptName',
      fillMappings: [{ targetFieldId: 'deptName', source: 'deptName' }],
    };
  }

  if (type === 'POST') {
    return {
      ...base,
      displayFieldId: 'postName',
      fillMappings: [{ targetFieldId: 'postName', source: 'postName' }],
    };
  }

  if (type === 'POSITION') {
    return {
      ...base,
      displayFieldId: 'positionName',
      fillMappings: [
        { targetFieldId: 'positionName', source: 'positionName' },
        { targetFieldId: 'positionCode', source: 'positionCode' },
        { targetFieldId: 'postId', source: 'postId' },
        { targetFieldId: 'postName', source: 'postName' },
      ],
    };
  }

  return base;
};

const PreviewControl: React.FC<{ field: FormField }> = ({ field }) => {
  if (MASTER_DATA_TYPES.has(field.type)) {
    const placeholderMap: Record<string, string> = {
      EMPLOYEE: '搜索并选择员工',
      DEPT: '搜索并选择部门',
      POST: '搜索并选择岗位',
      POSITION: '搜索并选择职位',
    };
    return (
      <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-2 text-sm text-cf-faint dark:border-slate-800 dark:bg-slate-900/70">
        {placeholderMap[field.type] || '请选择'}
      </div>
    );
  }

  if (field.type === 'TEXTAREA') {
    return <Textarea rows={2} disabled placeholder="多行文本输入" className="pointer-events-none resize-none" />;
  }

  if (field.type === 'SELECT') {
    return (
      <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-2 text-sm text-cf-faint dark:border-slate-800 dark:bg-slate-900/70">
        请选择
      </div>
    );
  }

  if (field.type === 'DATE') {
    return (
      <DatePicker
        disabled
        type="date"
        placeholder="选择日期"
        className="pointer-events-none h-10"
      />
    );
  }

  return (
    <Input
      disabled
      type={field.type === 'NUMBER' ? 'number' : 'text'}
      placeholder="输入示例"
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
      className="card min-w-0 px-4 py-3"
    >
      <div className="flex min-w-0 gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab text-slate-300 transition-colors hover:text-cyan-500 active:cursor-grabbing dark:text-slate-600 dark:hover:text-cyan-300"
        >
          <GripVertical size={18} />
        </button>

        <div className="grid min-w-0 flex-1 gap-3">
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
              <span className="text-xs text-cf-faint">字段 {index + 1}</span>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(field.id)}
              className="!h-7 !w-7 !rounded-md !p-0 text-cf-faint hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
              aria-label="删除字段"
              title="删除字段"
            >
              <Trash2 size={15} />
            </Button>
          </div>

          <Input
            value={field.label}
            onChange={(e) => onUpdate(field.id, { label: e.target.value })}
            className="h-9 border-none bg-transparent px-0 text-sm font-medium text-cf-title shadow-none placeholder:text-slate-300 focus-visible:ring-0"
            placeholder="字段标题"
          />

          <PreviewControl field={field} />

          {field.type === 'SELECT' ? (
            <div className="grid gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-cf-subtle">选项</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newOptions = [...(field.options || []), `选项${(field.options?.length || 0) + 1}`];
                    onUpdate(field.id, { options: newOptions });
                  }}
                  className="!h-6 !gap-1 !rounded-md !px-2 !py-0 text-xs text-cyan-600 shadow-none hover:bg-[var(--cf-surface-muted)] hover:text-cyan-700 dark:text-cyan-300 dark:hover:bg-slate-900 dark:hover:text-cyan-200"
                >
                  <Plus size={12} />
                  新增
                </Button>
              </div>

              <div className="grid gap-1.5">
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newOptions = (field.options || []).filter((_, i) => i !== idx);
                          onUpdate(field.id, { options: newOptions });
                        }}
                        className="!h-7 !w-7 !rounded-md !p-0 text-cf-faint hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                        aria-label="删除选项"
                        title="删除选项"
                      >
                        <X size={14} />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {MASTER_DATA_TYPES.has(field.type) ? (
            <div className="grid gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-cf-subtle">显示名称字段</div>
                  <Input
                    value={field.displayFieldId || ''}
                    onChange={(e) => onUpdate(field.id, { displayFieldId: e.target.value.trim() || undefined })}
                    className="h-8 text-xs font-mono"
                    placeholder="例如 employeeName"
                  />
                </div>
                {field.type === 'POSITION' ? (
                  <div>
                    <div className="mb-1 text-xs text-cf-subtle">按部门字段筛选</div>
                    <Input
                      value={field.filterByDeptFieldId || ''}
                      onChange={(e) => onUpdate(field.id, { filterByDeptFieldId: e.target.value.trim() || undefined })}
                      className="h-8 text-xs font-mono"
                      placeholder="例如 toDeptId"
                    />
                  </div>
                ) : null}
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-cf-subtle">选中后自动填充</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onUpdate(field.id, {
                        fillMappings: [
                          ...(field.fillMappings || []),
                          { targetFieldId: '', source: '', clearWhenEmpty: true },
                        ],
                      })
                    }
                    className="!h-6 !gap-1 !rounded-md !px-2 !py-0 text-xs text-cyan-600 shadow-none hover:bg-[var(--cf-surface-muted)] hover:text-cyan-700 dark:text-cyan-300 dark:hover:bg-slate-900 dark:hover:text-cyan-200"
                  >
                    <Plus size={12} />
                    新增
                  </Button>
                </div>
                <div className="grid gap-1.5">
                  {(field.fillMappings || []).map((mapping, idx) => (
                    <div key={idx} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <Input
                        value={mapping.targetFieldId}
                        onChange={(e) => {
                          const next = [...(field.fillMappings || [])];
                          next[idx] = { ...mapping, targetFieldId: e.target.value.trim() };
                          onUpdate(field.id, { fillMappings: next });
                        }}
                        className="h-8 text-xs font-mono"
                        placeholder="目标字段ID"
                      />
                      <Input
                        value={mapping.source}
                        onChange={(e) => {
                          const next = [...(field.fillMappings || [])];
                          next[idx] = { ...mapping, source: e.target.value.trim() };
                          onUpdate(field.id, { fillMappings: next });
                        }}
                        className="h-8 text-xs font-mono"
                        placeholder="来源属性"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const next = (field.fillMappings || []).filter((_, i) => i !== idx);
                          onUpdate(field.id, { fillMappings: next });
                        }}
                        className="!h-7 !w-7 !rounded-md !p-0 text-cf-faint hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                        aria-label="删除填充规则"
                        title="删除填充规则"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {(field.type === 'TEXT' || field.type === 'NUMBER') ? (
            <div className="grid gap-2 border-t border-slate-200 pt-3 dark:border-slate-800 md:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center gap-1 text-xs text-cf-subtle">
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
                <div className="mb-1 flex items-center gap-1 text-xs text-cf-subtle">
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

          <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
            <span className="text-xs text-cf-subtle">必填项</span>
            <Switch checked={field.required} onCheckedChange={(checked) => onUpdate(field.id, { required: checked })} />
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
            <span className="text-xs text-cf-subtle">只读展示</span>
            <Switch checked={Boolean(field.readonly)} onCheckedChange={(checked) => onUpdate(field.id, { readonly: checked || undefined })} />
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
      if (field.required && (val === null || val === undefined || String(val).trim() === '')) {
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
    <div className="card admin-source-panel no-padding overflow-hidden">
      <div className="p-4 admin-source-section-head flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-cf-title">{formName}</div>
          <div className="mt-1 text-xs text-cf-subtle">预览填写，不会写入真实数据。</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCancel}
          className="!h-8 !w-8 !rounded-md !p-0 text-cf-faint hover:bg-[var(--cf-surface-muted)] hover:text-cf-muted dark:hover:bg-slate-800"
          aria-label="关闭预览"
          title="关闭预览"
        >
          <X size={18} />
        </Button>
      </div>

      <div className="grid max-h-[60vh] gap-4 overflow-y-auto px-4 py-4">
        <FormRenderer
          formDef={{ id: 'preview', name: formName, fields }}
          hideActions
          data={formData}
          onChange={handleChange}
        />
        {Object.keys(errors).length > 0 ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300">
            请补充必填项后再模拟提交。
          </div>
        ) : null}
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
      const newId = getUniqueFieldId(DEFAULT_FIELD_IDS[type], prev);
      return [...prev, buildDefaultField(type, newId)];
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

      for (const mapping of field.fillMappings || []) {
        if (!mapping.targetFieldId || !mapping.source) {
          toast.error(`字段“${field.label}”的自动填充规则不完整`);
          return;
        }
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
    <div className="form-builder-shell flex h-full min-w-0 flex-col xl:flex-row">
      <section className="form-builder-palette flex w-full shrink-0 flex-col p-3 xl:w-[13rem]">
        <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="text-sm font-medium text-cf-title">组件库</div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
          {FIELD_TYPES.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.type}
                type="button"
                variant="outline"
                onClick={() => addField(item.type)}
                className="w-full !justify-start gap-3 border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-2.5 text-left text-sm text-cf-body shadow-none hover:border-cyan-200 hover:bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:bg-slate-950 dark:hover:border-cyan-900 dark:hover:bg-slate-900"
              >
                <span className="admin-source-stat-icon !h-7 !w-7 !flex-none text-cyan-600 dark:text-cyan-300">
                  <Icon size={15} />
                </span>
                <span>{item.label}</span>
              </Button>
            );
          })}
        </div>
      </section>

      <section className="form-builder-editor flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="p-4 admin-source-section-head flex flex-wrap items-center gap-3">
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="h-9 w-full border-none bg-transparent px-0 text-sm font-medium text-cf-title shadow-none placeholder:text-cf-faint focus-visible:ring-0 sm:w-72"
            placeholder="请输入表单名称"
          />

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="text-xs text-cf-subtle">字段 {fields.length}</span>
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

        <div className="flex-1 overflow-y-auto bg-[var(--cf-surface-muted)] p-4 dark:bg-slate-950">
          {previewing ? (
            <div className="mx-auto max-w-2xl">
              {previewData ? (
                <div className="card admin-source-panel no-padding overflow-hidden">
                  <div className="p-4 admin-source-section-head">
                    <div className="text-sm font-medium text-cf-title">模拟提交结果</div>
                  </div>
                  <div className="grid gap-4 p-4">
                    <pre className="max-h-80 overflow-auto bg-[var(--cf-surface-muted)] p-4 text-sm text-cf-body dark:bg-slate-900/70">
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
                <div className="px-4 py-10 text-center text-sm text-cf-faint">
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
            <div className="admin-source-content-grid mx-auto max-w-3xl">
              {fields.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-cf-faint">
                  从组件库添加字段。
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
