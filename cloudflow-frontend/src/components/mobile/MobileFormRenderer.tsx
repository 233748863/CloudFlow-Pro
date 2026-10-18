import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { FormDefinition } from '../../types';
import type { FieldPermission } from '@/types/workflowSemantic';
import { Button } from '@/components/common/button';
import { FormRenderer, type FormRendererHandle } from '../FormRenderer';
import type { FormRenderServices } from '../form-renderer/types';

export interface MobileFormRendererProps extends FormRenderServices {
  formDef: FormDefinition;
  initialData?: Record<string, any>;
  onSubmit: (data: Record<string, any>) => void;
  onBack?: () => void;
  readOnly?: boolean;
  title?: string;
  fieldPermissions?: FieldPermission[];
  nodeKey?: string;
}

export const MobileFormRenderer: React.FC<MobileFormRendererProps> = ({ formDef, initialData, onSubmit, onBack, readOnly = false, title, fieldPermissions, nodeKey, ...services }) => {
  const renderer = useRef<FormRendererHandle>(null);
  const [data, setData] = useState<Record<string, unknown>>(initialData || {});
  useEffect(() => setData(initialData || {}), [formDef.id, formDef.version, initialData]);
  return <div className="flex h-full flex-col bg-[var(--cf-bg)] text-[var(--cf-text)]">
    {onBack ? <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--cf-border)] bg-[var(--cf-surface)] px-4 py-3"><Button type="button" variant="ghost" size="sm" aria-label="返回" onClick={onBack}><ArrowLeft size={20} /></Button><h2 className="truncate text-base font-semibold text-cf-title">{title || formDef.name || '表单'}</h2></header> : null}
    <form className="flex-1 overflow-y-auto" onSubmit={(event) => { event.preventDefault(); renderer.current?.submit(); }}>
      <div className="px-4 py-4"><FormRenderer {...services} layoutMode="mobile" ref={renderer} formDef={formDef} data={data} onDataChange={setData} onSubmit={onSubmit} fieldPermissions={fieldPermissions} nodeKey={nodeKey} readonly={readOnly} hideActions /></div>
      {!readOnly ? <div className="safe-area-bottom sticky bottom-0 border-t border-[var(--cf-border)] bg-[var(--cf-surface)] px-4 py-3"><Button type="submit" className="min-h-11 w-full">提交</Button></div> : null}
    </form>
  </div>;
};
