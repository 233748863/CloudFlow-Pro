import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Code, Eye, Layers, Monitor, Save, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { FormDefinition, FormField, FormFieldType } from '../types';
import { BaseDialog, Button, Input, Textarea } from '@/components/common';
import { cn } from '@/utils/cn';
import { copyFormField, findFormField, getNestedFields, insertFormField, isLayoutField, listFormFields, moveFormField, newFieldForParent, removeFormFields, updateFormField, validateFormTree, type FormSchemaIssue } from '@/utils/formTree';
import { FormRenderer, type FormRendererHandle } from './FormRenderer';
import { FieldPalette } from './form-builder/FieldPalette';
import { DesignerCanvas } from './form-builder/DesignerCanvas';
import { getFieldTypeDefinition } from './form-builder/fieldRegistry';

interface Props {
  onSave: (form: FormDefinition) => Promise<void> | void;
  initialForm?: FormDefinition;
  onDirtyChange?: (dirty: boolean) => void;
}

export const FormBuilder: React.FC<Props> = ({ onSave, initialForm, onDirtyChange }) => {
  const [formName, setFormName] = useState(initialForm?.name || '未命名表单');
  const [fields, setFields] = useState<FormField[]>(initialForm?.fields || []);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<FormSchemaIssue[]>([]);
  const [changeLog, setChangeLog] = useState('');
  const [confirmSave, setConfirmSave] = useState(false);
  const [preview, setPreview] = useState<'desktop' | 'mobile' | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>>({});
  const [showSchema, setShowSchema] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'palette' | 'canvas' | 'properties'>('canvas');
  const previewForm = useRef<FormRendererHandle>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  useEffect(() => {
    setFormName(initialForm?.name || '未命名表单'); setFields(initialForm?.fields || []); setSelectedPath(null);
    setChecked(new Set()); setIssues([]); setChangeLog(''); setPreviewData({}); setPreview(null);
  }, [initialForm?.id, initialForm?.version, initialForm?.versionLock]);
  useEffect(() => { onDirtyChange?.(formName !== (initialForm?.name || '未命名表单') || JSON.stringify(fields) !== JSON.stringify(initialForm?.fields || [])); }, [formName, fields, initialForm, onDirtyChange]);
  const locations = useMemo(() => listFormFields(fields), [fields]);
  const selected = selectedPath ? findFormField(fields, selectedPath) : undefined;
  const parentPath = selected && (isLayoutField(selected.field) || selected.field.type === 'SUB_TABLE') ? selected.path : selected?.parentPath || null;
  const parent = parentPath ? findFormField(fields, parentPath)?.field : undefined;
  const PropertyEditor = selected ? getFieldTypeDefinition(selected.field.type)?.propertyEditor : undefined;
  const select = (path: string | null) => { setSelectedPath(path); if (path) setMobilePanel('properties'); };
  const apply = (operation: () => FormField[]) => {
    if (saving) return;
    try { setFields(operation()); setIssues([]); }
    catch (error) { toast.error(error instanceof Error ? error.message : '字段操作失败'); }
  };
  const add = (type: FormFieldType, target: string | null = parentPath, index?: number) => {
    apply(() => {
      const field = newFieldForParent(fields, type, target);
      const targetField = target ? findFormField(fields, target)?.field : undefined;
      const next = insertFormField(fields, target, index ?? (targetField ? getNestedFields(targetField).length : fields.length), field);
      setSelectedPath(targetField?.type === 'SUB_TABLE' ? `${target}.${field.id}` : field.id);
      setMobilePanel('canvas');
      return next;
    });
  };
  const remove = (paths: Iterable<string>) => apply(() => {
    const next = removeFormFields(fields, paths);
    setChecked(new Set());
    if (selectedPath && !findFormField(next, selectedPath)) setSelectedPath(null);
    return next;
  });
  const copy = (path: string) => apply(() => {
    const next = copyFormField(fields, path);
    const before = new Set(locations.map((location) => location.path));
    setSelectedPath(listFormFields(next).find((location) => !before.has(location.path))?.path || path);
    return next;
  });
  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || saving || active.id === over.id) return;
    const origin = active.data.current;
    const destination = over.data.current;
    if (!origin || !destination) return;
    const target = destination.kind === 'container' ? destination.parentPath as string | null : findFormField(fields, String(destination.path))?.parentPath || null;
    const targetField = target ? findFormField(fields, target)?.field : undefined;
    const siblings = targetField ? getNestedFields(targetField) : fields;
    const index = destination.kind === 'container' ? siblings.length : siblings.findIndex((field) => field === findFormField(fields, String(destination.path))?.field);
    if (origin.kind === 'palette') add(origin.type as FormFieldType, target, Math.max(index, 0));
    else if (origin.kind === 'field') apply(() => {
      const source = findFormField(fields, String(origin.path));
      const next = moveFormField(fields, String(origin.path), target, Math.max(index, 0));
      if (source) setSelectedPath(targetField?.type === 'SUB_TABLE' ? `${target}.${source.field.id}` : source.field.id);
      return next;
    });
  };
  const requestSave = () => {
    if (saving) return;
    if (!formName.trim()) { toast.error('请输入表单名称'); return; }
    const errors = validateFormTree(fields);
    setIssues(errors);
    if (errors.length) { setSelectedPath(errors[0].fieldId); setMobilePanel('properties'); toast.error(errors[0].message); return; }
    setConfirmSave(true);
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { await onSave({ ...initialForm, id: initialForm?.id || crypto.randomUUID(), name: formName.trim(), fields, changeLog: changeLog.trim() || undefined }); setConfirmSave(false); setChangeLog(''); }
    catch { toast.error('保存失败，请根据接口提示修正后重试'); }
    finally { setSaving(false); }
  };
  const definition = useMemo<FormDefinition>(() => ({ id: initialForm?.id || 'designer-preview', name: formName, fields }), [initialForm?.id, formName, fields]);
  return <div className="form-builder-shell flex h-full min-h-[640px] min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)]">
    <header className="flex flex-wrap items-center gap-3 border-b border-[var(--cf-border)] px-4 py-3">
      <Input aria-label="表单名称" value={formName} maxLength={64} disabled={saving} onChange={(event) => setFormName(event.target.value)} className="min-w-40 flex-1 font-medium" />
      <span className="text-xs text-cf-faint">{locations.length}个字段{initialForm?.version ? ` · 当前v${initialForm.version}` : ''}</span>
      <Button type="button" variant="outline" disabled={saving} onClick={() => { setPreviewData({}); setPreview('desktop'); }}><Eye size={15} className="mr-1" />预览</Button>
      <Button type="button" disabled={saving} onClick={requestSave}><Save size={15} className="mr-1" />{saving ? '保存中…' : '保存表单'}</Button>
    </header>
    <div role="tablist" aria-label="设计区域" className="flex border-b border-[var(--cf-border)] px-3 py-1 xl:hidden">{([['palette', '字段组件'], ['canvas', '表单画布'], ['properties', '字段属性']] as const).map(([panel, label]) => <Button key={panel} type="button" role="tab" aria-selected={mobilePanel === panel} variant={mobilePanel === panel ? 'secondary' : 'ghost'} className="flex-1" onClick={() => setMobilePanel(panel)}>{label}</Button>)}</div>
    <DndContext sensors={sensors} collisionDetection={(arguments_) => {
      const hits = pointerWithin(arguments_);
      return hits.length ? hits : closestCenter(arguments_);
    }} onDragEnd={dragEnd}>
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)_310px]">
        <div className={cn('min-h-0 border-r border-[var(--cf-border)] xl:block', mobilePanel !== 'palette' && 'hidden')}><FieldPalette columnMode={parent?.type === 'SUB_TABLE'} onAdd={add} /></div>
        <main className={cn('flex min-h-0 min-w-0 flex-col bg-[var(--cf-surface-muted)] xl:flex', mobilePanel !== 'canvas' && 'hidden')}>
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--cf-border)] px-3 py-2"><Layers size={15} className="text-cf-faint" /><span className="min-w-0 flex-1 truncate text-xs text-cf-subtle">添加位置：{parent?.label || '表单根层'}</span><Button type="button" size="sm" variant="ghost" onClick={() => setSelectedPath(null)}>选择根层</Button><Button type="button" size="sm" variant="ghost" disabled={!checked.size || saving} onClick={() => remove(checked)}><Trash2 size={14} className="mr-1" />删除所选{checked.size ? `（${checked.size}）` : ''}</Button></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4"><DesignerCanvas fields={fields} selectedPath={selectedPath} checked={checked} onSelect={select} onCheck={(path) => setChecked((previous) => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next; })} onCopy={copy} onRemove={(path) => remove([path])} /></div>
        </main>
        <aside className={cn('min-h-0 overflow-y-auto border-l border-[var(--cf-border)] bg-[var(--cf-surface)] xl:block', mobilePanel !== 'properties' && 'hidden')}>
          <div className="border-b border-[var(--cf-border)] px-4 py-3"><h3 className="text-sm font-semibold text-cf-title">字段属性</h3><p className="mt-1 text-xs text-cf-faint">{selected ? getFieldTypeDefinition(selected.field.type)?.label : '在画布中选择一个字段'}</p></div>
          <div className="p-4">{selected && PropertyEditor ? <Suspense fallback={<p className="text-sm text-cf-faint">加载字段属性…</p>}><PropertyEditor field={selected.field} fieldPath={selected.path} fields={fields} onChange={(patch) => apply(() => updateFormField(fields, selected.path, patch))} /></Suspense> : <p className="py-8 text-center text-sm text-cf-faint">请选择字段以配置名称、校验和显示条件</p>}</div>
        </aside>
      </div>
    </DndContext>
    <footer className="space-y-2 border-t border-[var(--cf-border)] px-4 py-3">
      {issues.length ? <div role="alert" className="max-h-24 overflow-y-auto rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{issues.map((issue, index) => <button key={`${issue.fieldId}-${index}`} type="button" className="block text-left" onClick={() => select(issue.fieldId)}>{issue.fieldId}：{issue.message}</button>)}</div> : null}
      <div className="flex items-center justify-between gap-3"><span className="text-xs text-cf-faint">保存时记录变更说明，字段或布局变化会创建新版本</span><Button type="button" size="sm" variant="ghost" onClick={() => setShowSchema(true)}><Code size={15} className="mr-1" />查看定义</Button></div>
    </footer>
    <BaseDialog open={confirmSave} title="保存表单版本" description="字段内容未变化时仅更新并发锁；未填写说明时按实际字段变化生成说明。" onClose={() => { if (!saving) setConfirmSave(false); }} closeOnEscape={!saving} hideCloseButton={saving} footer={<><Button type="button" variant="outline" disabled={saving} onClick={() => setConfirmSave(false)}>继续编辑</Button><Button type="button" disabled={saving} onClick={() => void save()}>{saving ? '正在保存…' : '确认保存版本'}</Button></>}>
      <label className="space-y-2 text-sm text-cf-subtle">本次变更说明（可选）<Textarea aria-label="本次变更说明" value={changeLog} maxLength={500} disabled={saving} rows={4} onChange={(event) => setChangeLog(event.target.value)} /></label>
    </BaseDialog>
    {preview ? <BaseDialog open title="表单预览" onClose={() => setPreview(null)} width="wide" maxWidthClassName="w-full max-w-6xl" footer={<><Button type="button" variant="outline" onClick={() => setPreview(null)}>返回设计</Button><Button type="button" onClick={() => { if (previewForm.current?.validate()) toast.success('表单校验通过，预览数据不会提交到服务器'); }}>校验预览内容</Button></>}>
      <div className="mb-4 flex justify-center gap-2"><Button type="button" variant={preview === 'desktop' ? 'secondary' : 'ghost'} onClick={() => setPreview('desktop')}><Monitor size={15} className="mr-1" />桌面布局</Button><Button type="button" variant={preview === 'mobile' ? 'secondary' : 'ghost'} onClick={() => setPreview('mobile')}><Smartphone size={15} className="mr-1" />手机布局</Button></div>
      <div className="max-h-[65vh] overflow-auto bg-[var(--cf-surface-muted)] p-4"><div className={cn('mx-auto rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4', preview === 'mobile' ? 'w-[375px] max-w-full' : 'min-w-[720px]')}>
        <FormRenderer ref={previewForm} formDef={definition} data={previewData} onDataChange={setPreviewData} layoutMode={preview} hideActions renderUploadField={({ field }) => <p className="rounded-md border border-dashed border-[var(--cf-border)] p-3 text-xs text-cf-subtle">设计预览不上传附件 · 最多{field.maxCount || 5}个</p>} />
      </div></div>
    </BaseDialog> : null}
    {showSchema ? <BaseDialog open title="表单字段定义" onClose={() => setShowSchema(false)} width="wide"><Textarea readOnly value={JSON.stringify(fields, null, 2)} rows={24} className="font-mono text-xs" /></BaseDialog> : null}
  </div>;
};
