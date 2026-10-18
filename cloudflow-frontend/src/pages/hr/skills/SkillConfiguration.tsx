import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/common';
import { Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Select, useHr09Resource } from '../components/Hr09Shared';
import { hrSkillApi } from '@/services/api/hr/skills';
import type { SkillCourse, SkillPosition } from '@/services/api/hr/skillTypes';
import { levelOptions, SkillList, SkillPicker, SkillSearch, useSkillQuery } from './SkillShared';

function PositionEditor({ record, onClose, onSaved }: { record: SkillPosition; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<SkillPosition>({ ...record, requirements: record.requirements.map(row => ({ ...row })) });
  const [selected, setSelected] = useState<{ id: string; name: string }>();
  return <Hr09FormDialog title={`${record.positionName} · 岗位技能要求`} description="必备与加分两组的权重须分别合计为1；空组不要求权重。" onClose={onClose} onReload={() => { onSaved(); onClose(); }} onSubmit={async () => { await hrSkillApi.savePosition(draft); onSaved(); }}><div className="skill-workspace space-y-4"><div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><SkillPicker label="新增岗位技能" value={selected} onChange={setSelected} /></div><Button type="button" variant="outline" disabled={!selected || draft.requirements.length >= 100} onClick={() => {
    if (!selected) return;
    if (draft.requirements.some(row => row.skillId === selected.id)) { toast.error('该技能已在岗位要求中'); return; }
    setDraft(current => ({ ...current, requirements: [...current.requirements, { skillId: selected.id, skillName: selected.name, requiredLevel: 1, weight: '1', mandatory: true }] }));
    setSelected(undefined);
  }}>加入要求</Button></div>{!draft.requirements.length && <Hr09Notice>当前未配置技能要求，保存空清单会移除本岗位现有要求。</Hr09Notice>}{draft.requirements.map((row, index) => <article key={row.skillId} className="space-y-3 rounded-xl border border-[var(--cf-border)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium text-cf-title">{row.skillName}</h3><Button type="button" variant="outline" aria-label={`移除${row.skillName}`} onClick={() => setDraft(current => ({ ...current, requirements: current.requirements.filter(item => item.skillId !== row.skillId) }))}>移除</Button></div><div className="grid gap-3 sm:grid-cols-3"><Hr09Select label={`${row.skillName}要求等级`} value={String(row.requiredLevel)} options={levelOptions} required onChange={value => setDraft(current => ({ ...current, requirements: current.requirements.map((item, itemIndex) => itemIndex === index ? { ...item, requiredLevel: Number(value) } : item) }))} /><Hr09Select label={`${row.skillName}分组`} value={row.mandatory ? 'mandatory' : 'optional'} options={[{ value: 'mandatory', label: '必备' }, { value: 'optional', label: '加分' }]} required onChange={value => setDraft(current => ({ ...current, requirements: current.requirements.map((item, itemIndex) => itemIndex === index ? { ...item, mandatory: value === 'mandatory' } : item) }))} /><Hr09Input label={`${row.skillName}权重`} inputMode="decimal" required maxLength={6} value={row.weight} onChange={event => setDraft(current => ({ ...current, requirements: current.requirements.map((item, itemIndex) => itemIndex === index ? { ...item, weight: event.target.value } : item) }))} /></div></article>)}</div></Hr09FormDialog>;
}

function CourseEditor({ record, onClose, onSaved }: { record: SkillCourse; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState({ ...record });
  return <Hr09FormDialog title={`${record.courseName} · 技能目标`} description="培训、考试和证书的技能等级统一读取此配置；调整目标不会改写已留存的证据。" onClose={onClose} onReload={() => { onSaved(); onClose(); }} onSubmit={async () => { await hrSkillApi.saveCourse(draft); onSaved(); }}><div className="skill-workspace space-y-4"><SkillPicker label="课程对应技能" value={draft.skillId ? { id: draft.skillId, name: draft.skillName || `技能 ${draft.skillId}` } : null} onChange={selected => setDraft(current => ({ ...current, skillId: selected.id, skillName: selected.name, targetLevel: current.targetLevel || 1 }))} />{draft.skillId && <Hr09Select label="完成后的目标等级" required options={levelOptions} value={String(draft.targetLevel || '')} onChange={value => setDraft(current => ({ ...current, targetLevel: Number(value) }))} />}<Button type="button" variant="outline" disabled={!draft.skillId} onClick={() => setDraft(current => ({ ...current, skillId: null, skillName: null, targetLevel: null }))}>清除技能目标</Button><Hr09Notice>课程须已发布、技能须已启用，新的完成证据才能参与技能认证。</Hr09Notice></div></Hr09FormDialog>;
}

export function SkillPositionConfiguration() {
  const { query, change } = useSkillQuery();
  const resource = useHr09Resource(signal => hrSkillApi.positions(query, signal), [JSON.stringify(query)]);
  const [edit, setEdit] = useState<SkillPosition>();
  return <div className="space-y-4"><SkillSearch value={query.keyword || ''} onChange={keyword => change({ keyword })} refresh={resource.refresh} label="岗位名称" /><SkillList resource={resource} query={query} onPage={pageNum => change({ pageNum })} rowKey={row => row.positionId} columns={[
    { key: 'name', label: '岗位', render: row => row.positionName },
    { key: 'requirements', label: '技能要求', render: row => row.requirements.length ? row.requirements.map(item => <p key={item.skillId} className="mb-1">{item.skillName} · {item.requiredLevel} 级 · {item.mandatory ? '必备' : '加分'} · 权重 {item.weight}</p>) : '尚未配置' },
    { key: 'action', label: '操作', render: row => <Button variant="outline" onClick={() => setEdit(row)} aria-label={`配置${row.positionName}技能要求`}>配置要求</Button> },
  ]} />{edit && <PositionEditor record={edit} onClose={() => setEdit(undefined)} onSaved={resource.refresh} />}</div>;
}

export function SkillCourseConfiguration() {
  const { query, change } = useSkillQuery();
  const resource = useHr09Resource(signal => hrSkillApi.courses(query, signal), [JSON.stringify(query)]);
  const [edit, setEdit] = useState<SkillCourse>();
  return <div className="space-y-4"><SkillSearch value={query.keyword || ''} onChange={keyword => change({ keyword })} refresh={resource.refresh} label="课程名称" /><SkillList resource={resource} query={query} onPage={pageNum => change({ pageNum })} rowKey={row => row.courseId} columns={[
    { key: 'name', label: '课程', render: row => row.courseName },
    { key: 'status', label: '发布状态', render: row => row.status === 'PUBLISHED' ? '已发布' : `未发布（${row.status}）` },
    { key: 'target', label: '技能目标', render: row => row.skillId ? `${row.skillName || '技能'} · ${row.targetLevel} 级` : '未绑定' },
    { key: 'action', label: '操作', render: row => <Button variant="outline" onClick={() => setEdit(row)} aria-label={`配置${row.courseName}技能目标`}>配置目标</Button> },
  ]} />{edit && <CourseEditor record={edit} onClose={() => setEdit(undefined)} onSaved={resource.refresh} />}</div>;
}
