import React, { useId, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ChevronDown, GripVertical, Plus, Search } from 'lucide-react';
import type { FormFieldType } from '../../types';
import { Input } from '@/components/common/input';
import { cn } from '@/utils/cn';
import { FIELD_GROUPS, FIELD_REGISTRY, type FieldTypeDefinition } from './fieldRegistry';

const PaletteItem: React.FC<{ definition: FieldTypeDefinition; disabled: boolean; onAdd: (type: FormFieldType) => void }> = ({ definition, disabled, onAdd }) => {
  const drag = useDraggable({ id: `palette:${definition.type}`, data: { kind: 'palette', type: definition.type }, disabled });
  const Icon = definition.icon;
  return <div ref={drag.setNodeRef} className={cn('flex items-center rounded-md border bg-[var(--cf-surface)] transition-colors duration-150', definition.styleClass, disabled ? 'opacity-35' : 'hover:bg-[var(--cf-surface-muted)]', drag.isDragging && 'opacity-50')}>
    <button type="button" {...drag.attributes} {...drag.listeners} disabled={disabled} aria-label={`拖拽添加${definition.label}`} className="min-h-11 touch-none px-1.5 text-cf-faint"><GripVertical size={14} /></button>
    <button type="button" disabled={disabled} onClick={() => onAdd(definition.type)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 pr-2 text-left text-xs"><Icon size={16} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{definition.label}</span><Plus size={13} /></button>
  </div>;
};

export const FieldPalette: React.FC<{ columnMode: boolean; onAdd: (type: FormFieldType) => void }> = ({ columnMode, onAdd }) => {
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const paletteId = useId();
  const query = search.trim().toLowerCase();
  return <aside className="flex h-full min-h-0 flex-col bg-[var(--cf-surface-muted)]">
    <div className="space-y-2 border-b border-[var(--cf-border)] p-3"><h3 className="text-sm font-semibold text-cf-title">字段组件</h3><div className="relative"><Search size={14} className="absolute left-2 top-2.5 text-cf-faint" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索字段" className="pl-7 text-xs" /></div>{columnMode ? <p className="text-xs text-cf-subtle">当前添加到明细列，可选10种类型</p> : null}</div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">{FIELD_GROUPS.map((group) => {
      const types = group.types.filter((type) => `${FIELD_REGISTRY[type].label} ${type}`.toLowerCase().includes(query));
      if (!types.length) return null;
      const expanded = Boolean(query) || !collapsedGroups.has(group.key);
      const contentId = `${paletteId}-${group.key}`;
      return <section key={group.key} className="space-y-2">
        <h4><button type="button" aria-label={`${expanded ? '收起' : '展开'}${group.label}分组`} aria-expanded={expanded} aria-controls={contentId}
          disabled={Boolean(query)} className="flex min-h-11 w-full items-center justify-between rounded-md px-1 text-left text-xs font-medium text-cf-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cf-primary)]"
          onClick={() => setCollapsedGroups((previous) => { const next = new Set(previous); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })}>
          {group.label}<ChevronDown size={14} aria-hidden="true" className={cn('transition-transform motion-reduce:transition-none', !expanded && '-rotate-90')} />
        </button></h4>
        <div id={contentId} hidden={!expanded} className={cn('grid-cols-2 gap-2 xl:grid-cols-1', expanded ? 'grid' : 'hidden')}>{types.map((type) => <PaletteItem key={type} definition={FIELD_REGISTRY[type]} disabled={columnMode && !FIELD_REGISTRY[type].allowedInSubTable} onAdd={onAdd} />)}</div>
      </section>;
    })}</div>
  </aside>;
};
