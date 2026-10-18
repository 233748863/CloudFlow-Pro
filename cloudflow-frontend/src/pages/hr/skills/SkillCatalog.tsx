import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { BaseDialog, Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { Hr09FormDialog, Hr09Input, Hr09Select, Hr09Textarea, Hr09Value, asOptions, useHr09Resource } from '../components/Hr09Shared';
import { hrSkillApi } from '@/services/api/hr/skills';
import type { SkillDefinition, SkillDefinitionInput } from '@/services/api/hr/skillTypes';
import { SkillList, SkillSearch, skillStatuses, skillText, useSkillQuery } from './SkillShared';

function SkillDefinitionEditor({ record, onClose, onSaved }: { record: SkillDefinition | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<SkillDefinitionInput>(record ? { ...record, levelDefinition: { ...record.levelDefinition } } : { skillCode: '', skillName: '', skillCategory: '', description: '', levelDefinition: {}, status: 'DRAFT' });
  const change = (patch: Partial<SkillDefinitionInput>) => setDraft(current => ({ ...current, ...patch }));
  return <Hr09FormDialog title={record ? '维护技能定义' : '新增技能'} description="五级含义由HR逐级核定，启用前须填写完整。"
    onClose={onClose} onReload={() => { onSaved(); onClose(); }}
    onSubmit={async () => { await hrSkillApi.saveDefinition(draft); onSaved(); }}>
    <div className="skill-workspace space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Hr09Input label="技能编码" required maxLength={64} value={draft.skillCode} onChange={event => change({ skillCode: event.target.value })} />
        <Hr09Input label="技能名称" required maxLength={100} value={draft.skillName} onChange={event => change({ skillName: event.target.value })} />
        <Hr09Input label="技能分类" maxLength={100} value={draft.skillCategory} onChange={event => change({ skillCategory: event.target.value })} />
        <Hr09Select label="状态" required value={draft.status} onChange={status => change({ status: status as SkillDefinition['status'] })} options={asOptions(skillStatuses)} />
      </div>
      <Hr09Textarea label="技能说明" maxLength={1000} value={draft.description} onChange={event => change({ description: event.target.value })} rows={3} />
      {[1, 2, 3, 4, 5].map(level => <Hr09Textarea key={level} label={`${level} 级定义`} required={draft.status === 'ACTIVE'} maxLength={1000} rows={2}
        value={draft.levelDefinition[String(level)] || ''}
        onChange={event => change({ levelDefinition: { ...draft.levelDefinition, [String(level)]: event.target.value } })} />)}
    </div>
  </Hr09FormDialog>;
}

export function SkillCatalog() {
  const { hasPermission } = useAuth();
  const { query, change } = useSkillQuery();
  const resource = useHr09Resource(signal => hrSkillApi.definitions(query, signal), [JSON.stringify(query)]);
  const [view, setView] = useState<SkillDefinition>();
  const [edit, setEdit] = useState<SkillDefinition | null | undefined>();
  return <div className="space-y-4"><div className="flex flex-wrap items-end gap-3"><div className="w-full min-w-0 sm:w-auto sm:flex-1"><SkillSearch value={query.keyword || ''} onChange={keyword => change({ keyword })} refresh={resource.refresh} /></div><Hr09Select label="技能状态" value={query.status || ''} options={asOptions(skillStatuses)} placeholder="全部状态" onChange={status => change({ status })} />{hasPermission('hr:skill:manage') && <Button onClick={() => setEdit(null)}><Plus size={16} className="mr-2" />新增技能</Button>}</div>
    <SkillList resource={resource} query={query} onPage={pageNum => change({ pageNum })} rowKey={row => row.skillId} emptyText="尚未配置技能" columns={[
      { key: 'name', label: '技能', render: row => <><span className="font-medium">{row.skillName}</span><p className="mt-1 text-xs text-cf-subtle">{row.skillCode}</p></> },
      { key: 'category', label: '分类', render: row => row.skillCategory || '未分类' },
      { key: 'status', label: '状态', render: row => skillText(skillStatuses, row.status) },
      { key: 'actions', label: '操作', render: row => <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setView(row)} aria-label={`查看${row.skillName}定义`}>查看定义</Button>{hasPermission('hr:skill:manage') && <Button variant="outline" onClick={() => setEdit(row)} aria-label={`维护${row.skillName}`}>维护</Button>}</div> },
    ]} />
    {view && <BaseDialog open title={view.skillName} onClose={() => setView(undefined)} width="wide"><dl className="skill-workspace space-y-4"><Hr09Value label="状态">{skillText(skillStatuses, view.status)}</Hr09Value><Hr09Value label="技能说明">{view.description}</Hr09Value>{[1, 2, 3, 4, 5].map(level => <Hr09Value key={level} label={`${level} 级定义`}>{view.levelDefinition[String(level)] || '尚未核定'}</Hr09Value>)}</dl></BaseDialog>}
    {edit !== undefined && <SkillDefinitionEditor key={edit?.skillId || 'new'} record={edit} onClose={() => setEdit(undefined)} onSaved={resource.refresh} />}
  </div>;
}
