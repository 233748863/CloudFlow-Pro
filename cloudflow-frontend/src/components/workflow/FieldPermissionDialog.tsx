import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Save } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, ConfirmDialog, LoadingSpinner } from '@/components/common';
import { getFieldPermissions, getFormDefinition, getProcessDefinition, saveFieldPermissions } from '@/services/api/workflow';
import { listFormFields, type FormFieldLocation } from '@/utils/formTree';
import { mapBackendFormDefinition } from '@/utils/formDefinition';
import { parseWorkflowGraphDefinition } from '@/utils/workflowGraph';
import { getErrorMessage } from '@/utils/errorMessage';
import type { FormDefinition } from '@/types';
import type { FieldPermission } from '@/types/workflowSemantic';

interface PermissionNode { key: string; label: string; editable: boolean }
interface PermissionContext { name: string; version: number; editable: boolean; form: FormDefinition; nodes: PermissionNode[] }
type PermissionSetting = 'visibleFlag' | 'editableFlag' | 'requiredFlag';
const keyFor = (nodeKey: string, fieldId: string) => `${nodeKey}:${fieldId}`;
const signature = (values: Map<string, FieldPermission>) => JSON.stringify([...values.entries()].sort(([left], [right]) => left.localeCompare(right)));

export const FieldPermissionDialog: React.FC<{ definitionId: string; onClose: () => void }> = ({ definitionId, onClose }) => {
  const [context, setContext] = useState<PermissionContext>();
  const [permissions, setPermissions] = useState(new Map<string, FieldPermission>());
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedFields, setSelectedFields] = useState(new Set<string>());
  const [selectedNodes, setSelectedNodes] = useState(new Set<string>());
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [confirmClose, setConfirmClose] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setContext(undefined); setError(''); setSelectedFields(new Set()); setSelectedNodes(new Set());
    Promise.all([getProcessDefinition(definitionId), getFieldPermissions(definitionId)]).then(async ([definition, values]) => {
      if (!definition.formId) throw new Error('请先绑定并保存表单');
      const form = mapBackendFormDefinition(await getFormDefinition(definition.formId));
      if (!form) throw new Error('绑定表单定义无法读取');
      const graph = parseWorkflowGraphDefinition(definition.modelJson ?? definition.graph);
      const nodes: PermissionNode[] = [{ key: '__START__', label: '发起环节', editable: true }, ...graph.nodes.filter((node) => node.type !== 'START' && node.type !== 'END')
        .map((node) => ({ key: node.id, label: node.title || (typeof node.label === 'string' ? node.label : node.id), editable: node.allowEdit === true || Boolean(node.props && typeof node.props === 'object' && 'allowEdit' in node.props && node.props.allowEdit === true) }))];
      if (!cancelled) {
        const next = new Map(values.map((permission) => [keyFor(permission.nodeKey, permission.fieldId), permission]));
        setPermissions(next); setSaved(signature(next));
        setContext({ name: definition.processName || definition.name, version: definition.version, editable: definition.status === 'DRAFT', form, nodes });
      }
    }).catch((failure) => { if (!cancelled) setError(getErrorMessage(failure, '字段权限读取失败')); });
    return () => { cancelled = true; };
  }, [definitionId, revision]);
  const fields = useMemo(() => context ? listFormFields(context.form.fields) : [], [context]);
  const visibleFields = fields.filter((location) => !location.ancestors.some((ancestor) => collapsed.has(ancestor)));
  const validKeys = useMemo(() => new Set(context?.nodes.flatMap((node) => fields.map((location) => keyFor(node.key, location.path))) || []), [context, fields]);
  const orphanKeys = [...permissions.keys()].filter((key) => !validKeys.has(key));
  const dirty = saved !== signature(permissions);
  const locked = !context?.editable || saving;
  const valueFor = (location: FormFieldLocation, node: PermissionNode, values = permissions): FieldPermission => values.get(keyFor(node.key, location.path)) || {
    fieldId: location.path, nodeKey: node.key, visibleFlag: true, editableFlag: node.editable && !location.field.readonly, requiredFlag: location.field.required,
  };
  const change = (location: FormFieldLocation, node: PermissionNode, setting: PermissionSetting, checked: boolean) => {
    if (locked) return;
    setPermissions((previous) => {
      const next = new Map(previous);
      const permission = { ...valueFor(location, node, previous), [setting]: checked };
      if (!permission.visibleFlag) permission.editableFlag = false;
      if (location.field.readonly) permission.editableFlag = false;
      next.set(keyFor(node.key, location.path), permission);
      return next;
    });
  };
  const batch = (setting: PermissionSetting, checked: boolean) => {
    if (locked || !selectedFields.size || !selectedNodes.size || !context) return;
    setPermissions((previous) => {
      const next = new Map(previous);
      for (const location of fields.filter((field) => selectedFields.has(field.path))) for (const node of context.nodes.filter((item) => selectedNodes.has(item.key))) {
        const permission = { ...valueFor(location, node, previous), [setting]: checked };
        if (!permission.visibleFlag || location.field.readonly) permission.editableFlag = false;
        next.set(keyFor(node.key, location.path), permission);
      }
      return next;
    });
  };
  const template = () => {
    if (locked || !context) return;
    setPermissions(new Map(context.nodes.flatMap((node) => fields.map((location) => [keyFor(node.key, location.path), {
      nodeKey: node.key, fieldId: location.path, visibleFlag: true, editableFlag: node.key === '__START__' && !location.field.readonly, requiredFlag: null,
    }] as const))));
  };
  const visibleToSelected = () => {
    if (locked || !context || !selectedFields.size || !selectedNodes.size) return;
    setPermissions((previous) => {
      const next = new Map(previous);
      for (const location of fields.filter((field) => selectedFields.has(field.path))) for (const node of context.nodes) {
        const permission = { ...valueFor(location, node, previous), visibleFlag: selectedNodes.has(node.key) };
        if (!permission.visibleFlag) permission.editableFlag = false;
        next.set(keyFor(node.key, location.path), permission);
      }
      return next;
    });
  };
  const save = async () => {
    if (locked || orphanKeys.length || !dirty) return;
    setSaving(true); setError('');
    try { await saveFieldPermissions(definitionId, [...permissions.values()]); setSaved(signature(permissions)); toast.success('字段权限已保存'); }
    catch (failure) { setError(getErrorMessage(failure, '字段权限保存失败，修改仍保留')); }
    finally { setSaving(false); }
  };
  const toggle = (previous: Set<string>, key: string) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; };
  const close = () => { if (saving) return; if (dirty && context) setConfirmClose(true); else onClose(); };
  return <>
    <BaseDialog open title={`字段权限${context ? ` · ${context.name} v${context.version}` : ''}`} description="权限配置基于已保存的流程版本；上级容器的隐藏和只读设置优先。" width="wide" maxWidthClassName="w-full max-w-[1440px]" onClose={close}
      footer={<><Button variant="outline" disabled={saving} onClick={close}>取消</Button><Button disabled={locked || !dirty || Boolean(orphanKeys.length)} onClick={() => void save()}><Save size={15} className="mr-1" />{saving ? '保存中…' : '保存权限'}</Button></>}>
      {error ? <div role="alert" className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}{!context ? <Button variant="outline" className="ml-3" onClick={() => setRevision((value) => value + 1)}>重新加载</Button> : null}</div> : null}
      {!context && !error ? <div role="status" aria-label="正在读取字段权限" className="flex justify-center p-8"><LoadingSpinner /></div> : null}
      {context ? <div className="space-y-3">
        {!context.editable ? <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">已发布版本的权限只读。先将流程保存为新草稿，再配置新版本的字段权限。</p> : null}
        {orphanKeys.length ? <div role="alert" className="flex items-center gap-3 rounded-md border border-amber-300 p-3 text-sm">存在{orphanKeys.length}项已移除字段或节点的权限，请确认清理。<Button variant="outline" disabled={locked} onClick={() => setPermissions((previous) => new Map([...previous].filter(([key]) => validKeys.has(key))))}>移除失效配置</Button></div> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={locked} onClick={template}>仅发起人可编辑</Button>
          <Button variant="outline" onClick={() => setSelectedFields(new Set(fields.map((location) => location.path)))}>全选字段</Button>
          <Button variant="outline" onClick={() => setSelectedFields(new Set(fields.filter((location) => !selectedFields.has(location.path)).map((location) => location.path)))}>反选字段</Button>
          <Button variant="outline" onClick={() => setSelectedNodes(new Set(context.nodes.map((node) => node.key)))}>全选节点</Button>
          <Button variant="outline" onClick={() => setSelectedNodes(new Set(context.nodes.filter((node) => !selectedNodes.has(node.key)).map((node) => node.key)))}>反选节点</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--cf-surface-muted)] p-2">
          <span className="text-xs text-cf-subtle">已选{selectedFields.size}个字段 × {selectedNodes.size}个节点</span>
          <Button variant="outline" disabled={locked || !selectedFields.size || !selectedNodes.size} onClick={() => batch('visibleFlag', true)}>批量可见</Button>
          <Button variant="outline" disabled={locked || !selectedFields.size || !selectedNodes.size} onClick={() => batch('visibleFlag', false)}>批量隐藏</Button>
          <Button variant="outline" disabled={locked || !selectedFields.size || !selectedNodes.size} onClick={() => batch('editableFlag', false)}>批量只读</Button>
          <Button variant="outline" disabled={locked || !selectedFields.size || !selectedNodes.size} onClick={() => batch('requiredFlag', true)}>批量必填</Button>
          <Button variant="outline" disabled={locked || !selectedFields.size || !selectedNodes.size} onClick={visibleToSelected}>仅所选节点可见</Button>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-md border border-[var(--cf-border)]">
          <table className="w-full border-collapse text-sm"><thead className="sticky top-0 z-20 bg-[var(--cf-surface-muted)]"><tr><th className="sticky left-0 z-30 min-w-56 bg-[var(--cf-surface-muted)] p-3 text-left">字段 / 节点</th>
            {context.nodes.map((node) => <th key={node.key} className="min-w-56 border-l border-[var(--cf-border)] px-3 text-left"><label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="checkbox" aria-label={`${node.label}整列`} checked={selectedNodes.has(node.key)} onChange={() => setSelectedNodes((previous) => toggle(previous, node.key))} />{node.label}</label></th>)}
          </tr></thead><tbody>{visibleFields.map((location) => <tr key={location.path} className="border-t border-[var(--cf-border)]">
            <th className="sticky left-0 z-10 bg-[var(--cf-surface)] px-3 text-left font-normal"><div className="flex items-center" style={{ paddingLeft: location.ancestors.length * 12 }}>
              {fields.some((field) => field.parentPath === location.path) ? <button type="button" aria-label={`${collapsed.has(location.path) ? '展开' : '折叠'}${location.field.label}`} className="flex min-h-11 min-w-11 items-center justify-center" onClick={() => setCollapsed((previous) => toggle(previous, location.path))}>{collapsed.has(location.path) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button> : null}
              <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="checkbox" aria-label={`${location.field.label}整行`} checked={selectedFields.has(location.path)} onChange={() => setSelectedFields((previous) => toggle(previous, location.path))} /><span>{location.field.label}<span className="block font-mono text-[10px] text-cf-faint">{location.path}</span></span></label>
            </div></th>
            {context.nodes.map((node) => { const permission = valueFor(location, node); return <td key={node.key} className="border-l border-[var(--cf-border)] px-3"><div className="flex items-center gap-2">
              {([['visibleFlag', '可见'], ['editableFlag', '可编辑'], ['requiredFlag', '必填']] as const).map(([setting, label]) => <label key={setting} className="flex min-h-11 cursor-pointer items-center gap-1 whitespace-nowrap text-xs"><input type="checkbox" aria-label={`${location.path} ${node.key} ${label}`} disabled={locked || setting === 'editableFlag' && (!permission.visibleFlag || location.field.readonly)} checked={Boolean(permission[setting] ?? location.field.required)} onChange={(event) => change(location, node, setting, event.target.checked)} />{label}</label>)}
              <Button variant="ghost" size="sm" className="!min-h-11" disabled={locked || !permissions.has(keyFor(node.key, location.path))} aria-label={`${location.path} ${node.key} 恢复继承`} onClick={() => setPermissions((previous) => { const next = new Map(previous); next.delete(keyFor(node.key, location.path)); return next; })}>继承</Button>
            </div></td>; })}
          </tr>)}</tbody></table>
        </div>
      </div> : null}
    </BaseDialog>
    <ConfirmDialog open={confirmClose} title="放弃未保存的权限修改？" description="尚未保存的修改不会应用到流程。" onCancel={() => setConfirmClose(false)} onConfirm={onClose} />
  </>;
};
