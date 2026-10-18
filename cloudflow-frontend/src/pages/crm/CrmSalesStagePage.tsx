import React, { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { BaseDialog, Button, Input } from '@/components/common';
import { Field, Flag, OperationsPage, OpsSelect, OpsTable, useMutation, useRemote } from '@/components/crm/operations/OperationsKit';
import { stageFieldLabels, stagePercent, StageRuleSummary } from '@/components/crm/opportunity/StageRuleSummary';
import { useAuth } from '@/context/AuthContext';
import { opportunityStages, type SalesStage, type StageRequiredField } from '@/services/api/crm/opportunityStages';
import { getErrorMessage } from '@/utils/errorMessage';

const newStage = (): SalesStage => ({ stageCode: '', stageName: '', sortNo: 25, defaultWinRate: '0.0000', allowSkipFlag: 0, requiredFields: [], requiredActivityFlag: 0, overdueDays: null, isWonFlag: 0, isLostFlag: 0, status: 'ACTIVE' });

function StageEditor({ initial, onClose, onSaved }: { initial: SalesStage; onClose: () => void; onSaved: () => void }) {
  const { hasPermission } = useAuth();
  const [form, setForm] = useState<SalesStage>(() => ({ ...initial, requiredFields: [...initial.requiredFields] }));
  const [rate, setRate] = useState(() => (Number(initial.defaultWinRate) * 100).toFixed(2));
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<SalesStage>();
  const mutation = useMutation();
  const terminal = initial.stageCode === 'WON' || initial.stageCode === 'LOST';
  const save = () => void mutation.run(async () => {
    setError('');
    try {
      if (!/^\d{1,3}(\.\d{1,2})?$/.test(rate) || Number(rate) > 100) throw new Error('默认赢率须为0至100，最多两位小数');
      return await opportunityStages.save({ ...form, defaultWinRate: (Number(rate) / 100).toFixed(4), isWonFlag: form.stageCode === 'WON' ? 1 : 0, isLostFlag: form.stageCode === 'LOST' ? 1 : 0 });
    } catch (failure) { setError(getErrorMessage(failure, '保存失败，输入已保留')); throw failure; }
  }, onSaved, '阶段规则已保存');
  const readLatest = () => void mutation.run(() => opportunityStages.list(), stages => {
    const current = stages.find(stage => stage.stageId === form.stageId);
    if (current) setLatest(current); else setError('该阶段已不可访问，草稿保留，请关闭后重新读取');
  }, '');
  return <BaseDialog open title={form.stageId ? '维护销售阶段' : '新增销售阶段'} width="wide" panelClassName="crm-opportunity-panel" onClose={() => { if (!mutation.busy) onClose(); }}
    footer={<Button disabled={mutation.busy || !hasPermission('crm:sales-stage:manage')} onClick={save}>保存阶段规则</Button>}>
    <div className="crm-opportunity-panel space-y-4">
      {error && <p role="alert" className="crm-ops-warning">{error}；未保存输入仍保留。</p>}
      {error && form.stageId && <Button variant="outline" disabled={mutation.busy} onClick={readLatest}>读取最新规则（保留草稿）</Button>}
      {latest && <div className="crm-ops-warning space-y-2"><p>草稿版本 {form.version}；最新版本 {latest.version}。</p><StageRuleSummary stage={latest} /><Button variant="outline" onClick={() => { setForm(previous => ({ ...previous, version: latest.version })); setLatest(undefined); setError(''); }}>已核对，采用新版本并保留输入</Button></div>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="阶段编码"><Input maxLength={30} value={form.stageCode} disabled={terminal} onChange={event => setForm(previous => ({ ...previous, stageCode: event.target.value.toUpperCase() }))} /></Field>
        <Field label="显示名称"><Input maxLength={100} value={form.stageName} onChange={event => setForm(previous => ({ ...previous, stageName: event.target.value }))} /></Field>
        <Field label="推进顺序（启用阶段不可重复）"><Input type="number" min="1" step="1" value={form.sortNo} onChange={event => setForm(previous => ({ ...previous, sortNo: Number(event.target.value) }))} /></Field>
        <Field label="默认赢率（%）"><Input type="number" min="0" max="100" step="0.01" value={rate} disabled={terminal} onChange={event => setRate(event.target.value)} /></Field>
        <Field label="超期提醒（完整天数，留空关闭）"><Input type="number" min="1" step="1" value={form.overdueDays ?? ''} onChange={event => setForm(previous => ({ ...previous, overdueDays: event.target.value ? Number(event.target.value) : null }))} /></Field>
        <Field label="规则状态"><OpsSelect label="规则状态" value={form.status} disabled={terminal} options={{ ACTIVE: '启用', DISABLED: '停用' }} onChange={status => setForm(previous => ({ ...previous, status: status as SalesStage['status'] }))} /></Field>
        <Flag label="允许从其他进行中阶段跳入" value={form.allowSkipFlag} onChange={checked => setForm(previous => ({ ...previous, allowSkipFlag: checked ? 1 : 0 }))} />
        <Flag label="进入前须有有效跟进或已完成活动" value={form.requiredActivityFlag} onChange={checked => setForm(previous => ({ ...previous, requiredActivityFlag: checked ? 1 : 0 }))} />
      </div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">进入阶段必填项</legend><div className="grid gap-2 sm:grid-cols-2">{Object.entries(stageFieldLabels).map(([field, label]) => <Flag key={field} label={label} value={form.requiredFields.includes(field as StageRequiredField)} onChange={checked => setForm(previous => ({ ...previous, requiredFields: checked ? [...previous.requiredFields, field as StageRequiredField] : previous.requiredFields.filter(value => value !== field) }))} />)}</div></fieldset>
      <p className="text-sm text-cf-muted">已使用的编码不能修改；保留一个赢单、一个丢单及至少一个启用的进行中阶段。修改规则不重写既有阶段历史。</p>
    </div>
  </BaseDialog>;
}

export default function CrmSalesStagePage() {
  const { hasPermission } = useAuth();
  const allowed = hasPermission('crm:sales-stage:list');
  const remote = useRemote(() => allowed ? opportunityStages.list() : Promise.resolve([]), [allowed]);
  const [editing, setEditing] = useState<SalesStage | null>(null);
  if (!allowed) return <p role="alert">无权查看销售阶段规则。</p>;
  return <div className="crm-opportunity-panel"><OperationsPage title="销售阶段规则" description="统一商机推进要求、默认赢率与超期提醒；所有入口执行相同规则。" loading={remote.loading} error={remote.error} refresh={remote.refresh}
    actions={hasPermission('crm:sales-stage:manage') && <Button onClick={() => setEditing(newStage())}><Plus size={16} />新增阶段</Button>}>
    <p id="stage-rules-scroll-hint" className="text-sm text-cf-muted">左右滑动查看全部 7 列；键盘聚焦表格后可用左右方向键。</p>
    <OpsTable headers={['阶段 / 编码', '顺序', '默认赢率', '进入要求', '超期提醒', '状态', '操作']} empty={!remote.loading && !remote.data?.length}
      tableClassName="crm-stage-rules-table" ariaLabel="销售阶段规则" scrollHintId="stage-rules-scroll-hint">
      {(remote.data || []).map(stage => <tr key={stage.stageId}><td><strong>{stage.stageName}</strong><small>{stage.stageCode} · 版本 {stage.version}</small></td><td>{stage.sortNo}</td><td>{stagePercent(stage)}</td><td><span>{stage.allowSkipFlag ? '允许跳入' : '顺序推进'}</span><small>{stage.requiredFields.map(field => stageFieldLabels[field]).join('、') || '无额外必填'}{stage.requiredActivityFlag ? '；须有跟进' : ''}</small></td><td>{stage.overdueDays ? `${stage.overdueDays} 天` : '未设置'}</td><td>{stage.status === 'ACTIVE' ? '启用' : '停用'}</td><td>{hasPermission('crm:sales-stage:manage') && <Button variant="outline" onClick={() => setEditing(stage)} aria-label={`维护${stage.stageName}`}><Pencil size={15} />维护</Button>}</td></tr>)}
    </OpsTable>
  </OperationsPage>{editing && <StageEditor initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); remote.refresh(); }} />}</div>;
}
