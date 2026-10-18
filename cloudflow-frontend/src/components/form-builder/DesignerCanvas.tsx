import React, { Suspense } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, GripVertical, Trash2 } from 'lucide-react';
import type { FormField } from '../../types';
import { Button } from '@/components/common/button';
import { cn } from '@/utils/cn';
import { defaultFieldValue, getNestedFields, isLayoutField } from '@/utils/formTree';
import { getFieldTypeDefinition } from './fieldRegistry';

export interface DesignerCanvasProps {
  fields: FormField[];
  selectedPath: string | null;
  checked: ReadonlySet<string>;
  onSelect: (path: string | null) => void;
  onCheck: (path: string) => void;
  onCopy: (path: string) => void;
  onRemove: (path: string) => void;
}

interface CanvasListProps extends DesignerCanvasProps {
  items: FormField[];
  parentPath: string | null;
  columnScope?: string;
}

const CanvasList: React.FC<CanvasListProps> = (props) => {
  const { items, parentPath, columnScope } = props;
  const drop = useDroppable({ id: `container:${parentPath || '__ROOT__'}`, data: { kind: 'container', parentPath } });
  const pathFor = (field: FormField) => columnScope ? `${columnScope}.${field.id}` : field.id;
  return <div className="space-y-2">
    <SortableContext items={items.map((field) => `field:${pathFor(field)}`)} strategy={verticalListSortingStrategy}>
      {items.map((field) => <CanvasField key={field.id} {...props} field={field} path={pathFor(field)} />)}
    </SortableContext>
    <button ref={drop.setNodeRef} type="button" onClick={(event) => { event.stopPropagation(); props.onSelect(parentPath); }}
      className={cn('w-full rounded-md border border-dashed px-3 py-4 text-center text-xs transition-colors duration-150', drop.isOver ? 'border-cyan-500 bg-cyan-50 text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-200' : 'border-[var(--cf-border)] text-cf-faint hover:bg-[var(--cf-surface-muted)]')}>
      {items.length ? '将字段拖到这里，添加到当前容器末尾' : columnScope ? '拖入明细列，或点击左侧可用字段' : '拖入字段，或点击左侧字段添加'}
    </button>
  </div>;
};

const CanvasField: React.FC<CanvasListProps & { field: FormField; path: string }> = (props) => {
  const { field, path, selectedPath, checked, parentPath } = props;
  const sortable = useSortable({ id: `field:${path}`, data: { kind: 'field', path, parentPath } });
  const registered = getFieldTypeDefinition(field.type);
  if (!registered) return <p role="alert" className="text-red-600">未知字段类型：{field.type}</p>;
  const Icon = registered.icon;
  const Preview = registered.preview;
  const nested = isLayoutField(field) || field.type === 'SUB_TABLE';
  return <article ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
    className={cn('rounded-lg border bg-[var(--cf-surface)] shadow-sm', path === selectedPath ? 'border-cyan-500 ring-1 ring-cyan-500/30' : 'border-[var(--cf-border)]', sortable.isDragging && 'relative z-20 opacity-70 shadow-md')}
    onClick={(event) => { event.stopPropagation(); props.onSelect(path); }}>
    <div className="flex items-center gap-2 px-2 py-1.5">
      <button type="button" {...sortable.attributes} {...sortable.listeners} aria-label={`拖动${field.label || '字段'}`} className="min-h-11 touch-none rounded px-1 text-cf-faint hover:bg-[var(--cf-surface-muted)]"><GripVertical size={16} /></button>
      <label className="flex min-h-11 items-center"><input type="checkbox" checked={checked.has(path)} aria-label={`批量选择${field.label || field.id}`} onClick={(event) => event.stopPropagation()} onChange={() => props.onCheck(path)} className="h-4 w-4 accent-[var(--cf-primary)]" /></label>
      <Icon size={16} className="shrink-0 text-cyan-600 dark:text-cyan-300" />
      <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => props.onSelect(path)}><span className="block truncate text-sm font-medium text-cf-title">{field.label || '未命名字段'}{field.required ? <span className="text-red-500"> *</span> : null}</span><span className="block truncate font-mono text-[10px] text-cf-faint">{path} · {registered.label}</span></button>
      <Button type="button" variant="ghost" size="sm" className="!min-h-11 !px-2" aria-label={`复制${field.label}`} onClick={(event) => { event.stopPropagation(); props.onCopy(path); }}><Copy size={14} /></Button>
      <Button type="button" variant="ghost" size="sm" className="!min-h-11 !px-2" aria-label={`删除${field.label}`} onClick={(event) => { event.stopPropagation(); props.onRemove(path); }}><Trash2 size={14} /></Button>
    </div>
    <div className={cn('border-t border-[var(--cf-border)] p-3', nested && 'bg-[var(--cf-surface-muted)]')}>
      {nested ? <><p className="mb-2 text-[11px] text-cf-faint">{field.type === 'SUB_TABLE' ? '明细列' : `${field.title || field.label} · 容器内字段`}</p><CanvasList {...props} items={getNestedFields(field)} parentPath={path} columnScope={field.type === 'SUB_TABLE' ? path : props.columnScope} /></>
        : <div className="pointer-events-none opacity-80"><Suspense fallback={<div className="h-9 rounded-md bg-[var(--cf-surface-muted)]" />}><Preview field={field} fieldPath={path} inputId={`preview-${path}`} value={defaultFieldValue(field)} data={{}} disabled readonly={false} onChange={() => undefined}
          renderReferenceField={() => <div className="rounded-md border border-[var(--cf-border)] p-2 text-xs text-cf-faint">{field.placeholder || `选择${registered.label}`}</div>}
          renderUploadField={() => <div className="rounded-md border border-dashed border-[var(--cf-border)] p-3 text-center text-xs text-cf-faint">附件 · 最多{props.columnScope ? 1 : field.maxCount || 5}个</div>} /></Suspense></div>}
    </div>
  </article>;
};

export const DesignerCanvas: React.FC<DesignerCanvasProps> = (props) => <CanvasList {...props} items={props.fields} parentPath={null} />;
