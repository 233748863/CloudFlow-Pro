import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { BaseDialog, Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Select, Hr09Textarea, Hr09Value, asOptions, dateTimeText, useHr09Resource } from '../components/Hr09Shared';
import { hrSkillApi } from '@/services/api/hr/skills';
import { shanghaiDate } from '@/services/api/hr/hr09Model';
import type { SkillAssessment } from '@/services/api/hr/skillTypes';
import { assessmentStatuses, evidenceTypes, levelOptions, SkillList, SkillPicker, skillText, useSkillQuery } from './SkillShared';
import { SkillAssessmentEditor } from './SkillAssessmentEditor';

function ReviewEditor({ record, onClose, onSaved }: { record: SkillAssessment; onClose: () => void; onSaved: () => void }) {
  const [approved, setApproved] = useState('APPROVED');
  const [level, setLevel] = useState(String(record.level));
  const [expiry, setExpiry] = useState(record.expireDate || '');
  const [remark, setRemark] = useState('');
  return <Hr09FormDialog title="审核本人技能自报" description={`${record.employeeName} · ${record.skillName} · 自报 ${record.level} 级`} onClose={onClose} onReload={() => { onSaved(); onClose(); }} onSubmit={async () => { await hrSkillApi.review(record, approved === 'APPROVED', Number(level), expiry || null, remark); onSaved(); }}><div className="skill-workspace space-y-4"><Hr09Notice>{record.remark}</Hr09Notice><Hr09Select label="审核决定" value={approved} required options={[{ value: 'APPROVED', label: '核实通过' }, { value: 'REJECTED', label: '拒绝' }]} onChange={setApproved} />{approved === 'APPROVED' && <div className="grid gap-4 sm:grid-cols-2"><Hr09Select label="核实等级" required value={level} options={levelOptions} onChange={setLevel} /><Hr09Input label="有效期至（可选）" type="date" min={shanghaiDate()} max="9999-12-31" value={expiry} onChange={event => setExpiry(event.target.value)} /></div>}<Hr09Textarea label="审核说明" required maxLength={500} rows={4} value={remark} onChange={event => setRemark(event.target.value)} /></div></Hr09FormDialog>;
}

export function SkillAssessments({ mine, onChanged }: { mine: boolean; onChanged?: () => void }) {
  const { hasPermission } = useAuth();
  const { query, change } = useSkillQuery();
  const [employee, setEmployee] = useState<{ id: string; name: string }>();
  const resource = useHr09Resource(async signal => mine ? (await hrSkillApi.mine(query, signal)).assessments : hrSkillApi.assessments(query, signal), [mine, JSON.stringify(query)]);
  const own = useHr09Resource(signal => hrSkillApi.mine({ pageNum: 1, pageSize: 1 }, signal), [], !mine && hasPermission('hr:skill:own'));
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<SkillAssessment>();
  const [reviewing, setReviewing] = useState<SkillAssessment>();
  const refresh = () => { resource.refresh(); onChanged?.(); };
  const canReview = (record: SkillAssessment) => !mine && hasPermission('hr:skill:assess') && record.status === 'PENDING' && record.evidenceType === 'SELF' && record.employeeId !== own.data?.employeeId;
  return <div className="space-y-4"><div className="flex flex-wrap items-end gap-3"><Hr09Select label="评估状态" value={query.status || ''} options={asOptions(assessmentStatuses)} placeholder="全部状态" onChange={status => change({ status })} />{!mine && <div className="min-w-0 flex-1"><SkillPicker kind="employee" label="员工筛选" value={employee} onChange={value => { setEmployee(value); change({ employeeId: value.id }); }} /></div>}{employee && <Button variant="outline" onClick={() => { setEmployee(undefined); change({ employeeId: undefined }); }}>清除员工筛选</Button>}<Button variant="outline" onClick={refresh}>刷新</Button>{hasPermission(mine ? 'hr:skill:self-submit' : 'hr:skill:assess') && <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-2" />{mine ? '提交技能自报' : '登记主管评估'}</Button>}</div>
    <Hr09Notice>培训、考试及证书证据由真实业务自动关联；较低或重复证据仅留存，过期或撤销后需重新评估。</Hr09Notice>
    <SkillList resource={resource} query={query} onPage={pageNum => change({ pageNum })} rowKey={row => row.assessmentId} emptyText={mine ? '本人暂无技能证据' : '管理范围内暂无技能证据'} columns={[
      ...(!mine ? [{ key: 'employee', label: '员工', render: (row: SkillAssessment) => row.employeeName }] : []),
      { key: 'skill', label: '技能', render: row => <span className="font-medium">{row.skillName}</span> },
      { key: 'evidence', label: '证据与等级', render: row => <>{skillText(evidenceTypes, row.evidenceType)} · {row.level} 级</> },
      { key: 'status', label: '评估结果', render: row => <>{skillText(assessmentStatuses, row.status)}<p className="mt-1 text-xs text-cf-subtle">{row.effectiveLevel > 0 ? `当前有效 ${row.effectiveLevel} 级` : row.current ? '当前证据已失效，需复评' : row.status === 'PENDING' ? '审核通过后才生效' : '历史证据，不参与当前认证'}</p></> },
      { key: 'date', label: '有效期至', render: row => row.expireDate || '未设到期日' },
      { key: 'action', label: '操作', render: row => <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSelected(row)}>查看证据</Button>{canReview(row) && <Button variant="outline" onClick={() => setReviewing(row)}>审核自报</Button>}</div> },
    ]} />
    {selected && <BaseDialog open title={`${selected.skillName} · 证据详情`} onClose={() => setSelected(undefined)} width="wide"><dl className="skill-workspace grid gap-4 sm:grid-cols-2"><Hr09Value label="员工">{selected.employeeName}</Hr09Value><Hr09Value label="证据类型">{skillText(evidenceTypes, selected.evidenceType)}</Hr09Value><Hr09Value label="证据结果">{skillText(assessmentStatuses, selected.status)} · {selected.level} 级</Hr09Value><Hr09Value label="当前有效等级">{selected.effectiveLevel > 0 ? `${selected.effectiveLevel} 级` : '本条证据当前不生效'}</Hr09Value><Hr09Value label="业务来源记录">{selected.evidenceBizId || '自报或主管评估，无外部业务编号'}</Hr09Value><Hr09Value label="有效期至">{selected.expireDate || '未设到期日'}</Hr09Value><Hr09Value label="创建时间">{dateTimeText(selected.createTime)}</Hr09Value><Hr09Value label="评估时间">{dateTimeText(selected.assessTime)}</Hr09Value><div className="sm:col-span-2"><Hr09Value label="依据或审核说明">{selected.remark}</Hr09Value></div></dl></BaseDialog>}
    {creating && <SkillAssessmentEditor mine={mine} onClose={() => setCreating(false)} onSaved={refresh} />}
    {reviewing && <ReviewEditor record={reviewing} onClose={() => setReviewing(undefined)} onSaved={() => { setSelected(undefined); refresh(); }} />}
  </div>;
}
